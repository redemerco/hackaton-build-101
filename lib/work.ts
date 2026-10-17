import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, rawEvents } from "@/lib/db";

export type Commit ={ time: string; message: string; additions: number; deletions: number };
export type WorkLogEntry = ({ type: "commit" } & Commit) | { type: "pr"; title: string };

export type WorkDay = {
  log: WorkLogEntry[];
  commits: number;
  /** Reuniones en franjas de 20 min entre 09 y 18 h: [desde, hasta) en índices de franja. */
  meetingSlots: [number, number][];
  week: { sleepMin: number[]; commits: number[]; mood: number[] }; // lu..hoy (0 donde no hay dato)
  /** Días con los tres datos (sueño, commits, ánimo). Por debajo de MIN_DAYS_FOR_CORRELATION no se afirma nada. */
  daysOfData: number;
};

export const MEETING_SLOTS_PER_DAY = 27; // 09 → 18 en franjas de 20 min

const TZ = "America/Argentina/Buenos_Aires";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }); // YYYY-MM-DD local
const hhmm = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
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
      log.push({ type: "commit", time: hhmm.format(new Date(r.ts)), message, additions: 0, deletions: 0 });
    } else if (r.kind === "pr") {
      log.push({ type: "pr", title: `PR #${d.number} ${(d.merged_at ?? d.pull_request?.merged_at) ? "mergeado" : d.state}` });
    }
  }

  // Últimos 7 días, de hace 6 días a hoy, en hora local.
  const days = Array.from({ length: 7 }, (_, i) => dayKey.format(new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000)));
  const commitsPerDay = days.map((day) => rows.filter((r) => r.kind === "commit" && dayKey.format(new Date(r.ts)) === day).length);
  const sleepPerDay = sleepWeek(userId, days);
  const moodPerDay = moodWeek(userId, days);

  // Un día "completo" tiene sueño, commits y ánimo: la correlación solo se afirma con suficientes.
  const daysOfData = days.filter((_, i) => sleepPerDay[i] > 0 && commitsPerDay[i] > 0 && moodPerDay[i] > 0).length;

  return {
    log,
    commits: commitsPerDay[6],
    meetingSlots: meetingSlotsToday(userId),
    week: { sleepMin: sleepPerDay, commits: commitsPerDay, mood: moodPerDay },
    daysOfData,
  };
}

/** Minutos de sueño reales por día (0 sin dato), desde google_health. */
function sleepWeek(userId: string, days: string[]): number[] {
  const rows = db
    .select({ json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "google"), eq(rawEvents.kind, "sleep"), gte(rawEvents.ts, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString())))
    .all();
  const byDay = new Map<string, number>();
  for (const r of rows) {
    try {
      const sleep = (JSON.parse(r.json).sleep ?? {}) as Record<string, unknown>;
      const interval = (sleep.interval ?? {}) as Record<string, string>;
      const ss = ((sleep.summary ?? {}) as Record<string, unknown>).stagesSummary as Array<Record<string, string>> | undefined;
      if (!interval.endTime || !ss?.length) continue;
      const min = ss.reduce((sum, row) => {
        const t = String(row.type).toUpperCase();
        return t === "AWAKE" || t === "WAKE" ? sum : sum + (parseInt(row.minutes ?? "0", 10) || 0);
      }, 0);
      const key = dayKey.format(Date.parse(interval.endTime));
      byDay.set(key, (byDay.get(key) ?? 0) + min);
    } catch {
      continue;
    }
  }
  return days.map((d) => byDay.get(d) ?? 0);
}

/** Último ánimo real por día (0 sin check-in). */
function moodWeek(userId: string, days: string[]): number[] {
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
  return days.map((d) => byDay.get(d) ?? 0);
}

const minutesOfDay = (t: number) => {
  const [h, m] = hhmm.format(t).split(":").map(Number);
  return h * 60 + m;
};

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
