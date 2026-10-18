import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { getCross } from "@/lib/cross";
import { db, rawEvents } from "@/lib/db";
import { dayInputs } from "@/lib/ranking";

export type Commit ={ time: string; message: string; additions: number; deletions: number };
export type WorkLogEntry = ({ type: "commit" } & Commit) | { type: "pr"; title: string };

export type WorkDay = {
  log: WorkLogEntry[];
  commits: number;
  /** De hace 6 días a hoy. Sueño y ánimo van en null el día que no hay dato (la sparkline lo muestra como "·"). */
  week: { sleepMin: (number | null)[]; commits: number[]; mood: (number | null)[] };
  /** El sueño viene de datos de el viejo seed de demo (se rotula en la UI). */
  sleepIsSimulated: boolean;
  /** Días con los tres datos (sueño, commits, ánimo). Por debajo de MIN_DAYS_FOR_CORRELATION no se afirma nada. */
  daysOfData: number;
};

export const MEETING_SLOTS_PER_DAY = 27; // 09 → 18 en franjas de 20 min

const TZ = "America/Montevideo";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }); // YYYY-MM-DD local
const hhmm = new Intl.DateTimeFormat("es-UY", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekdayShort = new Intl.DateTimeFormat("es-UY", { timeZone: TZ, weekday: "short" });
const LOG_MAX = 8;

// Commits y PRs reales de raw_events. Sin datos de GitHub devuelve null → la página muestra estado vacío.
export function getWorkDay(userId: string): WorkDay | null {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .select()
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "github"), gte(rawEvents.ts, since)))
    .orderBy(desc(rawEvents.ts))
    .all();
  if (rows.length === 0) return null;

  const log: WorkLogEntry[] = [];
  for (const r of rows) {
    if (log.length >= LOG_MAX) break;
    const d = JSON.parse(r.json);
    if (r.kind === "commit") {
      const message = d.commit?.message?.split("\n")[0] ?? "";
      // los que no son de hoy llevan el día adelante: el log mezcla la semana, no solo hoy
      const isToday = dayKey.format(new Date(r.ts)) === dayKey.format(new Date());
      const time = isToday ? hhmm.format(new Date(r.ts)) : `${weekdayShort.format(new Date(r.ts)).replace(".", "")} ${hhmm.format(new Date(r.ts))}`;
      log.push({ type: "commit", time, message, additions: 0, deletions: 0 });
    } else if (r.kind === "pr") {
      log.push({ type: "pr", title: `PR #${d.number} ${(d.merged_at ?? d.pull_request?.merged_at) ? "mergeado" : d.state}` });
    }
  }

  // Últimos 7 días, de hace 6 días a hoy, en hora local.
  const days = Array.from({ length: 7 }, (_, i) => dayKey.format(new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000)));
  const commitsPerDay = days.map((day) => rows.filter((r) => r.kind === "commit" && dayKey.format(new Date(r.ts)) === day).length);
  // Sueño real por día local con la misma lectura que el ranking (lib/ranking.ts), sin reparsear Google Health.
  const sleep = dayInputs(userId, Date.now() - 8 * 24 * 60 * 60 * 1000);
  const sleepPerDay = days.map((d) => sleep.days.get(d)?.sleep?.asleepMin ?? null);
  const moodPerDay = moodWeek(userId, days);

  // Un día "completo" tiene sueño, commits y ánimo: la correlación solo se afirma con suficientes.
  // Se cuenta sobre 6 semanas (la misma serie que los cruces de Yo): con 7 días nunca se llegaba al umbral de 21.
  const daysOfData = getCross(userId).series.filter((d) => d.sleepMin !== null && d.commits > 0 && d.mood !== null).length;

  return {
    log,
    commits: commitsPerDay[6],
    week: { sleepMin: sleepPerDay, commits: commitsPerDay, mood: moodPerDay },
    sleepIsSimulated: sleep.isSimulated,
    daysOfData,
  };
}

/** Último ánimo real por día (null sin check-in). */
function moodWeek(userId: string, days: string[]): (number | null)[] {
  const rows = db
    .select({ ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "mood"), gte(rawEvents.ts, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString())))
    .orderBy(rawEvents.ts)
    .all();
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const mood = Number((JSON.parse(r.json) as { mood?: unknown }).mood);
    if (mood > 0) byDay.set(dayKey.format(new Date(r.ts)), mood);
  }
  return days.map((d) => byDay.get(d) ?? null);
}

export type Meeting = { start: string; end: string; durationMin: number };

// Reuniones de hoy (source "calendar", solo horarios, sin las de todo el día). Sin Calendar conectado: ninguna.
export function meetingsToday(userId: string): Meeting[] {
  const today = dayKey.format(Date.now());
  return db
    .select({ json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "calendar"), gte(rawEvents.ts, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())))
    .orderBy(rawEvents.ts)
    .all()
    .map((r) => JSON.parse(r.json) as { start: string; end: string | null; allDay?: boolean })
    .filter((e): e is { start: string; end: string; allDay?: boolean } => !e.allDay && !!e.end && dayKey.format(Date.parse(e.start)) === today)
    .map((e) => ({ start: hhmm.format(Date.parse(e.start)), end: hhmm.format(Date.parse(e.end)), durationMin: Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60000) }));
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Las reuniones de hoy en franjas de 20 min entre 09 y 18.
export function meetingSlotsToday(userId: string): [number, number][] {
  const slot = (min: number) => Math.min(MEETING_SLOTS_PER_DAY, Math.max(0, Math.floor((min - 9 * 60) / 20)));
  return meetingsToday(userId)
    .map((e): [number, number] => [slot(toMin(e.start)), slot(toMin(e.end) + 19)])
    .filter(([a, b]) => b > a);
}

// Exist.io pide 21 días antes de mostrar una correlación; usamos el mismo umbral.
export const MIN_DAYS_FOR_CORRELATION = 21;

/** Confianza 1..5 según cuántos días hay (separada de la fuerza de la relación, como Exist.io). */
export function confidenceStars(days: number): number {
  if (days < MIN_DAYS_FOR_CORRELATION) return 0;
  return Math.min(5, 2 + Math.floor((days - MIN_DAYS_FOR_CORRELATION) / 14));
}

export function meetingMinutes(slots: readonly [number, number][]): number {
  return slots.reduce((sum, [a, b]) => sum + (b - a) * 20, 0);
}
