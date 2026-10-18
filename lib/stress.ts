import type { DaySeries, RawRow } from "@/lib/hourly";

// Estrés = carga de trabajo contra cómo responde el cuerpo, cada uno contra TU normal (no contra una tabla).
// Carga: commits, mensajes de Slack, reuniones, issues de Linear y trabajar después de las 23.
// Cuerpo: HRV (más es mejor), pulso en reposo (menos es mejor) y sueño (más es mejor).
// Cada día es un punto (x = carga, y = cuerpo) en desvíos de tu media de las últimas 6 semanas.
// Hoy: la carga de las últimas 24 h (un día completo, comparable con tu media diaria) y el cuerpo de hoy.
// Determinista: nada de esto lo calcula la IA. Es una observación, no un diagnóstico.

export type Zone = "en tu normal" | "en forma" | "aguantando" | "cuidado" | "no es el trabajo";
export type StressPoint = { day: string; x: number; y: number };
export type Delta = { label: string; text: string; isGood: boolean };
export type StressMap = {
  today: StressPoint | null; // carga de las últimas 24 h × cuerpo de hoy (sueño de anoche, HRV y pulso)
  past: StressPoint[]; // los 6 días cerrados anteriores: referencia chica
  zone: Zone | null;
  verdict: string;
  load: Delta[];
  body: Delta[];
  need: string | null; // qué falta si todavía no alcanza
};

const PAST_DAYS = 6;
const MIN_BASE_DAYS = 7;
const CLAMP = 2;
const LATE_WORK_MIN = 23 * 60;
// cerca del centro (menos de un tercio de desvío en los dos ejes) no se afirma ninguna zona
const NORMAL_BAND = 0.33;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const clamp = (v: number) => Math.max(-CLAMP, Math.min(CLAMP, v));

type Metric = { label: string; get: (d: DaySeries) => number | null; sign: 1 | -1; fmt: (diff: number, base: number) => string };

const pct = (diff: number, base: number) => `${diff >= 0 ? "+" : "−"}${Math.round(Math.abs(diff / (base || 1)) * 100)}%`;
const mins = (diff: number) => `${diff >= 0 ? "+" : "−"}${Math.round(Math.abs(diff))} min`;

const isWorkDay = (d: DaySeries) => d.commits + d.messages + d.issues + d.meetingMin > 0;
const LOAD: Metric[] = [
  { label: "commits", get: (d) => (isWorkDay(d) ? d.commits : null), sign: 1, fmt: pct },
  { label: "Slack", get: (d) => (isWorkDay(d) ? d.messages : null), sign: 1, fmt: pct },
  { label: "reuniones", get: (d) => (isWorkDay(d) ? d.meetingMin : null), sign: 1, fmt: pct },
  { label: "issues", get: (d) => (isWorkDay(d) ? d.issues : null), sign: 1, fmt: pct },
  { label: "después de las 23", get: (d) => (isWorkDay(d) ? (d.lastWorkMinute !== null && d.lastWorkMinute >= LATE_WORK_MIN ? 1 : 0) : null), sign: 1, fmt: (diff) => (diff > 0 ? "sí" : "") },
];
const BODY: Metric[] = [
  { label: "HRV", get: (d) => d.hrvMs, sign: 1, fmt: pct },
  { label: "pulso en reposo", get: (d) => d.restingBpm, sign: -1, fmt: (diff) => `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round(diff))} lpm` },
  { label: "sueño", get: (d) => d.sleepMin, sign: 1, fmt: mins },
];

type Base = { m: Metric; mean: number; sd: number };
const baseOf = (series: DaySeries[], metrics: Metric[]): Base[] =>
  metrics.flatMap((m) => {
    const xs = series.map(m.get).filter((v): v is number => v !== null);
    const s = xs.length >= MIN_BASE_DAYS ? sd(xs) : 0;
    return s > 0 ? [{ m, mean: mean(xs), sd: s }] : [];
  });

/** Índice del día: promedio de los desvíos (con signo: + = más carga / cuerpo mejor). null si no hay ningún dato. */
function indexOf(d: DaySeries, bases: Base[]): number | null {
  const zs = bases.flatMap((b) => {
    const v = b.m.get(d);
    return v === null ? [] : [(b.m.sign * (v - b.mean)) / b.sd];
  });
  return zs.length ? clamp(mean(zs)) : null;
}

/** Cómo viene la semana contra tu normal, métrica por métrica (solo las que se movieron). */
function deltas(week: DaySeries[], bases: Base[], isLoad: boolean): Delta[] {
  return bases.flatMap((b) => {
    const xs = week.map(b.m.get).filter((v): v is number => v !== null);
    if (!xs.length) return [];
    const diff = mean(xs) - b.mean;
    if (Math.abs(diff) < b.sd * 0.25) return [];
    const isBetter = b.m.sign * diff > 0;
    const text = b.m.fmt(diff, b.mean);
    // "no trabajaste tarde" no es noticia: solo se muestra cuando pasó
    return text ? [{ label: b.m.label, text, isGood: isLoad ? !isBetter : isBetter }] : [];
  });
}

export function zoneOf(p: StressPoint): Zone {
  if (Math.abs(p.x) < NORMAL_BAND && Math.abs(p.y) < NORMAL_BAND) return "en tu normal";
  if (p.x >= 0) return p.y >= 0 ? "aguantando" : "cuidado";
  return p.y >= 0 ? "en forma" : "no es el trabajo";
}

const VERDICT: Record<Zone, string> = {
  "en tu normal": "Venís en tu normal: la carga y el cuerpo, parecidos a siempre.",
  "en forma": "Venís con tu carga normal y el cuerpo responde bien.",
  aguantando: "Venís con más carga que tu normal y el cuerpo todavía responde. Ojo con estirarlo.",
  cuidado: "Venís con más carga que tu normal y el cuerpo lo está sintiendo. Buen momento para bajar un cambio.",
  "no es el trabajo": "La carga no está alta, pero el cuerpo viene tenso: puede ser otra cosa (sueño, salud, lo de afuera).",
};

/** `now`: el "día" de hoy armado con las últimas 24 h de trabajo y el cuerpo de hoy (lo arma lib/cross). */
export function stressMap(series: DaySeries[], now: DaySeries | null): StressMap {
  const loadBase = baseOf(series, LOAD);
  const bodyBase = baseOf(series, BODY);
  const empty = (need: string): StressMap => ({ today: null, past: [], zone: null, verdict: "", load: [], body: [], need });
  if (!loadBase.length) return empty(`faltan ${MIN_BASE_DAYS} días de trabajo (GitHub, Slack, Calendar o Linear) para saber tu normal`);
  if (!bodyBase.length) return empty(`faltan ${MIN_BASE_DAYS} días de sueño, pulso o HRV para saber tu normal`);

  const pointOf = (d: DaySeries): StressPoint | null => {
    const x = indexOf(d, loadBase);
    const y = indexOf(d, bodyBase);
    return x === null || y === null ? null : { day: d.day, x, y };
  };
  const past = series.slice(-PAST_DAYS - 1, -1).flatMap((d) => pointOf(d) ?? []);
  const today = now ? pointOf(now) : null;
  if (!now || !today) return { ...empty("hoy todavía no hay trabajo o cuerpo registrado para comparar"), past };
  const zone = zoneOf(today);
  return { today, past, zone, verdict: VERDICT[zone], load: deltas([now], loadBase, true), body: deltas([now], bodyBase, false), need: null };
}

// ── Por proyecto: solo los repos donde hiciste un PR en el último mes; se reparte tu actividad de la semana en ellos ──
const REPO_RE = /"html_url":"https:\/\/github\.com\/[^/"]+\/([^/"]+)\//;

export type ProjectShare = { name: string; share: number; count: number };

const repoOf = (r: RawRow) => (r.source === "github" ? (REPO_RE.exec(r.json)?.[1] ?? null) : null);

/** `sinceIso`: desde cuándo se cuenta la actividad (la semana). `prSinceIso`: desde cuándo vale un PR para que el repo cuente. */
export function projectsOf(rows: RawRow[], sinceIso: string, prSinceIso: string, max = 3): ProjectShare[] {
  const withPr = new Set(rows.filter((r) => r.kind === "pr" && r.ts >= prSinceIso).flatMap((r) => repoOf(r) ?? []));
  const counts = new Map<string, number>();
  for (const r of rows) {
    const name = r.ts >= sinceIso ? repoOf(r) : null;
    if (name && withPr.has(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (!total) return [];
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, max).map(([name, count]) => ({ name, count, share: count / total }));
  const rest = sorted.slice(max).reduce((n, [, c]) => n + c, 0);
  return rest ? [...top, { name: "otros", count: rest, share: rest / total }] : top;
}
