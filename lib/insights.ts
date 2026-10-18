// Cruces cuerpo × trabajo con respaldo en papers (investigación del 17-oct, ver plan/santi.md).
// Reglas para no inventar: lista FIJA (nunca todos contra todos), mínimo de días por grupo, siempre contra TU
// propia media, efecto en unidades que se entienden (minutos, puntos de ánimo) y con cuántos días lo respaldan.
// Puro: lo prueba scripts/smoke.mts. La IA de Yo solo narra lo que sale de acá.
import type { DaySeries } from "./hourly.ts";

export type Insight = {
  id: string;
  question: string; // la pregunta del usuario que responde
  text: string; // observación con números, nunca causa ni diagnóstico
  basis: string; // "12 vs 18 días"
  evidence: string; // paper, o "hipótesis tuya: sin estudios directos"
  isHypothesis: boolean;
  detail?: Detail; // los días de cada grupo ("ver los días")
  tryThis: string; // una prueba chica que la persona controla (lo que vuelve útil a un insight)
  weight: number; // para ordenar: tamaño del efecto relativo a tu variación
};

export type Detail = { aLabel: string; bLabel: string; a: number[]; b: number[]; unit: "min" | "ánimo" | "hora" };

export type Pending = { id: string; question: string; need: string };

const MIN_PER_GROUP = 5;
const MIN_PAIRS = 14;
const MIN_BASE_NIGHTS = 14;
const MIN_HRV_DAYS = 21;
const SHORT_SLEEP_MARGIN = 60; // una noche "corta" = 1 h menos que tu media
const LATE_WORK_MINUTE = 23 * 60;
const FOCUS_BLOCK_MIN = 120;
const HEAVY_MEETINGS_MIN = 240;

// cuando el cruce se pudo calcular y no hay nada que avisar, lo decimos así (es una buena noticia, no un hueco)
const CALM: Record<string, string> = {
  deuda: "sin deuda de sueño esta semana",
  regularidad: "horario regular: varía menos de ±45 min",
  recuperacion: "HRV dentro de tu rango habitual",
};

const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null && Number.isFinite(x));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
export const fmtMin = (m: number) => {
  const r = Math.round(Math.abs(m));
  return r >= 60 ? `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, "0")}` : `${r} min`;
};
const fmtMood = (x: number) => x.toFixed(1);
const clock = (minuteFrom18: number) => {
  const m = (Math.round(minuteFrom18) + 18 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Compara `metric` entre los días que cumplen `inA` y los que no. null si algún grupo tiene menos de 5 días. */
type Compared = { a: number; b: number; na: number; nb: number; spread: number; A: number[]; B: number[] };

function compare(pairs: { inA: boolean; value: number }[]): Compared | null {
  const A = pairs.filter((p) => p.inA).map((p) => p.value);
  const B = pairs.filter((p) => !p.inA).map((p) => p.value);
  if (A.length < MIN_PER_GROUP || B.length < MIN_PER_GROUP) return null;
  return { a: mean(A), b: mean(B), na: A.length, nb: B.length, spread: sd([...A, ...B]) || 1, A, B };
}

/** Los valores crudos de cada grupo, para que cualquiera (el jurado) pueda verificar el cruce a mano. */
const detail = (c: Compared, aLabel: string, bLabel: string, unit: Detail["unit"]): Detail => ({ aLabel, bLabel, a: c.A, b: c.B, unit });

/** Los cruces que tienen datos suficientes (ordenados por peso) y los que todavía no, con cuánto falta. */
export function crossInsights(series: DaySeries[]): { ready: Insight[]; pending: Pending[] } {
  const ready: Insight[] = [];
  const pending: Pending[] = [];
  const asked: Omit<Pending, "need">[] = [];
  const last = (n: number) => series.slice(-n);
  const nights = nums(series.map((d) => d.sleepMin));
  const baseSleep = nights.length ? mean(nights) : 0;

  // 1. Deuda de sueño de la semana contra tu media (Van Dongen 2003: la restricción crónica degrada aunque no se sienta).
  {
    const question = "¿Cuánto sueño vengo debiendo esta semana?";
    asked.push({ id: "deuda", question });
    if (nights.length < MIN_BASE_NIGHTS) pending.push({ id: "deuda", question, need: `faltan ${MIN_BASE_NIGHTS - nights.length} noches` });
    else {
      const week = nums(last(7).map((d) => d.sleepMin));
      // la base son las noches ANTERIORES a esta semana (si alcanzan): comparar la semana contra sí misma la diluye
      const prior = nums(series.slice(0, -7).map((d) => d.sleepMin));
      const base = prior.length >= 7 ? mean(prior) : baseSleep;
      const baseNights = prior.length >= 7 ? prior.length : nights.length;
      // deuda NETA: las noches largas compensan a las cortas (si no, el número contradice la media de la semana)
      const debt = week.reduce((sum, n) => sum + (base - n), 0);
      if (debt >= 60)
        ready.push({
          id: "deuda",
          tryThis: "Probá acostarte 30 min antes 5 noches seguidas y mirá si la deuda baja.",
          question,
          text: `En estas ${week.length} noches dormiste ${fmtMin(debt)} menos que tu media de antes (${fmtMin(base)} por noche). Con varios días recortados el rendimiento cae aunque uno no se sienta peor.`,
          basis: `${week.length} noches vs tu media de ${baseNights}`,
          evidence: "Van Dongen et al. 2003, Sleep",
          isHypothesis: false,
          weight: debt / 60,
        });
    }
  }

  // 2. Noche corta → ánimo de ese día (Triantafillou 2019: sueño → ánimo del día siguiente, normalizado por persona).
  {
    const question = "¿Dormir poco me baja el ánimo?";
    asked.push({ id: "sueno-animo", question });
    const pairs = series.filter((d) => d.sleepMin !== null && d.mood !== null).map((d) => ({ inA: d.sleepMin! < baseSleep - SHORT_SLEEP_MARGIN, value: d.mood! }));
    const c = pairs.length >= MIN_PAIRS ? compare(pairs) : null;
    if (!c)
      pending.push({
        id: "sueno-animo",
        question,
        need: pairs.length < MIN_PAIRS ? `faltan ${MIN_PAIRS - pairs.length} días con sueño y ánimo` : "faltan noches cortas (1 h menos que tu media) para comparar",
      });
    else if (Math.abs(c.a - c.b) >= 0.4)
      ready.push({
        id: "sueno-animo",
        detail: detail(c, "después de noche corta", "el resto", "ánimo"),
        tryThis: "La próxima noche corta, anotá el ánimo igual: así vemos si el patrón se sostiene.",
        question,
        text: `Los días después de dormir 1 h menos que tu media tu ánimo promedia ${fmtMood(c.a)}, contra ${fmtMood(c.b)} el resto.`,
        basis: `${c.na} vs ${c.nb} días`,
        evidence: "Triantafillou et al. 2019, JMIR Mental Health",
        isHypothesis: false,
        weight: Math.abs(c.a - c.b) / c.spread,
      });
  }

  // 3. Regularidad del horario (Windred 2024 / Phillips 2017: la regularidad pesa tanto o más que la duración).
  {
    const question = "¿Me acuesto en horarios regulares?";
    asked.push({ id: "regularidad", question });
    const beds = nums(last(14).map((d) => d.bedMinute));
    if (beds.length < 7) pending.push({ id: "regularidad", question, need: `faltan ${7 - beds.length} noches` });
    else {
      const spread = sd(beds);
      if (spread >= 45)
        ready.push({
          id: "regularidad",
        tryThis: "Probá una hora fija para acostarte (±30 min) durante una semana.",
          question,
          text: `Tu hora de acostarte varía ±${fmtMin(spread)} (en promedio a las ${clock(mean(beds))}). Los estudios asocian la regularidad del sueño tanto o más que la duración con la salud.`,
          basis: `${beds.length} noches`,
          evidence: "Windred et al. 2024, SLEEP · Phillips et al. 2017, Sci Rep",
          isHypothesis: false,
          weight: spread / 45,
        });
    }
  }

  // 4. Trabajar tarde → dormir menos esa noche (Lanaj 2014, indirecto: trabajo nocturno con el celular → menos sueño).
  {
    const question = "¿Los días que trabajo tarde duermo menos?";
    asked.push({ id: "tarde-sueno", question });
    const pairs = series.slice(0, -1).flatMap((d, i) => {
      const next = series[i + 1];
      return d.lastWorkMinute !== null && next.sleepMin !== null ? [{ inA: d.lastWorkMinute >= LATE_WORK_MINUTE, value: next.sleepMin }] : [];
    });
    const c = compare(pairs);
    if (!c) pending.push({ id: "tarde-sueno", question, need: "faltan noches con trabajo después de las 23 h" });
    else if (c.b - c.a >= 20)
      ready.push({
        id: "tarde-sueno",
        detail: detail(c, "trabajo después de las 23 h", "el resto", "min"),
        tryThis: "Probá cortar a las 22:30 tres noches y comparamos con las otras.",
        question,
        text: `Las noches que tu último commit o mensaje fue después de las 23 h dormiste ${fmtMin(c.b - c.a)} menos que las otras.`,
        basis: `${c.na} vs ${c.nb} noches`,
        evidence: "Lanaj, Johnson & Barnes 2014, OBHDP (indirecto)",
        isHypothesis: false,
        weight: (c.b - c.a) / c.spread,
      });
  }

  // 5. Commits de madrugada (Eyolfson et al. MSR 2011: los de 00–04 h fueron más propensos a bugs en open source).
  {
    const recent = last(2).reduce((n, d) => n + d.lateCommits, 0);
    const usual = series.slice(0, -2).filter((d) => d.lateCommits > 0).length / Math.max(1, series.length - 2);
    if (recent > 0 && usual < 0.3)
      ready.push({
        id: "madrugada",
        tryThis: "Mañana, con la cabeza fresca, revisá ese commit antes de mergearlo.",
        question: "¿Mis commits de madrugada necesitan otra mirada?",
        text: `Hiciste ${recent} commit${recent > 1 ? "s" : ""} entre las 0 y las 4 h. En proyectos open source los commits de ese horario tuvieron más bugs: quizás valga una revisión con la cabeza fresca.`,
        basis: `${recent} commit${recent > 1 ? "s" : ""} · te pasa ${Math.round(usual * 100)}% de los días`,
        evidence: "Eyolfson, Tan & Lam 2011, MSR (open source)",
        isHypothesis: false,
        weight: 1 + recent / 3,
      });
  }

  // 6. Foco: bloque libre más largo y ánimo (Meyer et al. 2017/2019: reuniones e interrupciones → peor día percibido).
  {
    const question = "¿Las reuniones me están comiendo el foco?";
    asked.push({ id: "foco", question });
    const today = series.at(-1);
    const pairs = series.filter((d) => d.longestFreeMin !== null && d.mood !== null).map((d) => ({ inA: d.longestFreeMin! >= FOCUS_BLOCK_MIN, value: d.mood! }));
    const c = compare(pairs);
    if (c && c.a - c.b >= 0.4)
      ready.push({
        id: "foco",
        detail: detail(c, "con bloque de 2 h", "sin bloque de 2 h", "ánimo"),
        tryThis: "Reservá mañana un bloque de 2 h sin reuniones y hacé el check-in a la tarde.",
        question,
        text: `Tus días con al menos un bloque de 2 h sin reuniones promedian ${fmtMood(c.a)} de ánimo, contra ${fmtMood(c.b)} los otros.${today?.longestFreeMin != null ? ` Hoy tu bloque libre más largo es de ${fmtMin(today.longestFreeMin)}.` : ""}`,
        basis: `${c.na} vs ${c.nb} días`,
        evidence: "Meyer et al. 2017 y 2019, IEEE TSE",
        isHypothesis: false,
        weight: (c.a - c.b) / c.spread,
      });
    else if (!c) pending.push({ id: "foco", question, need: "faltan días con y sin bloques de 2 h libres, con ánimo" });
  }

  // 7. Reuniones largas → hora de acostarse (hipótesis: no hay paper directo; es un experimento con tus datos).
  {
    const question = "¿Los días de muchas reuniones me acuesto más tarde?";
    asked.push({ id: "reuniones-sueno", question });
    const pairs = series.slice(0, -1).flatMap((d, i) => {
      const next = series[i + 1];
      return d.longestFreeMin !== null && next.bedMinute !== null ? [{ inA: d.meetingMin >= HEAVY_MEETINGS_MIN, value: next.bedMinute }] : [];
    });
    const c = compare(pairs);
    if (c && c.a - c.b >= 20)
      ready.push({
        id: "reuniones-sueno",
        detail: detail(c, "más de 4 h de reunión", "el resto", "hora"),
        tryThis: "El próximo día pesado de reuniones, poné una alarma para cortar a las 22:30.",
        question,
        text: `Los días con más de 4 h de reunión te acostaste ${fmtMin(c.a - c.b)} más tarde que los otros.`,
        basis: `${c.na} vs ${c.nb} días`,
        evidence: "hipótesis tuya: no hay estudios directos sobre esto",
        isHypothesis: true,
        weight: (c.a - c.b) / c.spread,
      });
    else if (!c) pending.push({ id: "reuniones-sueno", question, need: "faltan días de más de 4 h de reunión" });
  }

  // 8. Recuperación: HRV (ln) de 7 días contra tu base (Järvelin-Pasanen 2018; Buchheit 2014: promediar, no un día suelto).
  {
    const question = "¿Mi cuerpo viene cargado?";
    asked.push({ id: "recuperacion", question });
    const hrv = nums(series.map((d) => d.hrvMs)).map(Math.log);
    if (hrv.length < MIN_HRV_DAYS) pending.push({ id: "recuperacion", question, need: `faltan ${MIN_HRV_DAYS - hrv.length} días de HRV` });
    else {
      const week = nums(last(7).map((d) => d.hrvMs)).map(Math.log);
      const z = week.length >= 3 ? (mean(week) - mean(hrv)) / (sd(hrv) || 1) : 0;
      if (z <= -1)
        ready.push({
          id: "recuperacion",
        tryThis: "Hoy algo más liviano: dormir temprano y menos carga si podés elegir.",
          question,
          text: `Tu HRV de esta semana viene por debajo de tu rango habitual (${Math.round(Math.exp(mean(week)))} ms contra ${Math.round(Math.exp(mean(hrv)))} ms de media). Puede tener muchas causas: carga, poco sueño, alcohol o empezar a enfermarte.`,
          basis: `${week.length} días vs tu base de ${hrv.length}`,
          evidence: "Järvelin-Pasanen et al. 2018, Industrial Health · Buchheit 2014",
          isHypothesis: false,
          weight: -z,
        });
    }
  }

  // 9. Moverte y el ánimo (Liao et al. 2015: la actividad física es seguida de más afecto positivo).
  {
    const question = "¿Moverme me mejora el ánimo?";
    asked.push({ id: "movimiento", question });
    const withBoth = series.filter((d) => d.azm !== null && d.mood !== null);
    const azms = withBoth.map((d) => d.azm!).sort((a, b) => a - b);
    const median = azms.length ? azms[Math.floor(azms.length / 2)] : 0;
    const c = compare(withBoth.map((d) => ({ inA: d.azm! > median, value: d.mood! })));
    if (c && c.a - c.b >= 0.4)
      ready.push({
        id: "movimiento",
        detail: detail(c, "más activos", "menos activos", "ánimo"),
        tryThis: "Probá 20 min activos tres días seguidos y mirá tu ánimo esos días.",
        question,
        text: `Los días que superás ${median} min en zona activa tu ánimo promedia ${fmtMood(c.a)}, contra ${fmtMood(c.b)} los otros.`,
        basis: `${c.na} vs ${c.nb} días`,
        evidence: "Liao, Shonkoff & Dunton 2015, Front Psychol",
        isHypothesis: false,
        weight: (c.a - c.b) / c.spread,
      });
    else if (!c) pending.push({ id: "movimiento", question, need: "faltan días con minutos activos y ánimo" });
  }

  // con datos suficientes pero sin un efecto que valga la pena: se dice, en vez de esconderlo o inflarlo
  const settled = new Set([...ready, ...pending].map((x) => x.id));
  for (const q of asked) if (!settled.has(q.id)) pending.push({ ...q, need: CALM[q.id] ?? "sin diferencia clara en tus datos (por ahora)" });

  return { ready: ready.sort((a, b) => b.weight - a.weight), pending };
}
