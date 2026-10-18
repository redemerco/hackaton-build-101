import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, rawEvents } from "@/lib/db";
import { isPulsoEvent } from "@/lib/pulso-events";
import type { DaemonInput } from "@/lib/daemon";
import type { UserId } from "@/lib/users";
import { getLastNight } from "@/lib/body";
import { getCross, recentVitals } from "@/lib/cross";

export type Today = {
  sleepMin: number | null;
  sleepWeek: number[]; // minutos, últimos 7 días (0 = sin dato ese día). Vacío si no hay nada real.
  restingBpm: number | null;
  restingTypical: [number, number] | null; // tu rango típico (línea base personal, no la población)
  hrvMs: number | null;
  hrvTypical: [number, number] | null;
  mood: number | null; // 1..5, null = sin check-in hoy
  meetings: number;
  meetingsDone: number; // de las de hoy, las que ya terminaron
  insight: string | null;
  /** true si no hay ningún dato real de cuerpo/trabajo: la UI muestra estado vacío. */
  isEmpty: boolean;
};

export { moodFace } from "@/lib/ascii";

const TZ = "America/Montevideo";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const DAY = 24 * 60 * 60 * 1000;

/** Último check-in de ánimo de hoy (día local del server), o null. */
function todaysMood(userId: UserId): number | null {
  const row = db
    .select({ ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "mood")))
    .orderBy(desc(rawEvents.ts))
    .get();
  // "hoy" en Montevideo, no en la zona del server (el NAS puede estar en UTC)
  if (!row || dayKey.format(new Date(row.ts)) !== dayKey.format(new Date())) return null;
  const mood = (JSON.parse(row.json) as { mood?: unknown }).mood;
  return typeof mood === "number" ? mood : null;
}

/** Reuniones de hoy (source "calendar", solo horarios) y cuántas ya terminaron. Sin Calendar conectado: 0. */
function meetingsToday(userId: UserId, now: Date): { total: number; done: number } {
  const today = dayKey.format(now);
  const events = db
    .select({ json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "calendar"), gte(rawEvents.ts, new Date(now.getTime() - DAY).toISOString())))
    .all()
    .map((r) => JSON.parse(r.json) as { id?: string | null; pulso?: boolean; start: string; end: string | null; allDay?: boolean })
    .filter((e) => !e.allDay && e.end && !isPulsoEvent(e) && dayKey.format(Date.parse(e.start)) === today);
  return { total: events.length, done: events.filter((e) => Date.parse(e.end!) <= now.getTime()).length };
}

// El sueño sale del ingest real de google_health (lib/body) cuando existe; si no, null/0 (nunca ejemplo).
/** `series` de getCross si ya la tenés (Yo la usa para la gráfica): evita leer 6 semanas de raw_events dos veces. */
export function getToday(userId: UserId, now = new Date(), series = getCross(userId, now.getTime()).series): Today {
  const night = getLastNight(userId);
  const nightMin = (sm?: Record<string, number>) => (sm ? sm.light + sm.deep + sm.rem : undefined);
  const sleepMin = night ? nightMin(night.stageMinutes) ?? null : null;

  // Semana de sueño real, de hace 6 días a hoy; sin dato ese día queda en 0.
  const sleepWeek = sleepWeekFor(userId, now);
  const mood = todaysMood(userId);
  const { total: meetings, done: meetingsDone } = meetingsToday(userId, now);
  // pulso y HRV vienen como diarios de Google Health (no dentro de la noche): de la serie de lib/cross
  const vitals = recentVitals(series);
  const lastNightMin = series.at(-1)?.sleepMin ?? null;

  return {
    sleepMin: sleepMin || lastNightMin,
    sleepWeek: sleepWeek.some((m) => m > 0) ? sleepWeek : series.slice(-7).map((d) => d.sleepMin ?? 0),
    restingBpm: vitals.restingBpm ?? night?.restingBpm ?? null,
    restingTypical: vitals.restingTypical ?? night?.restingTypical ?? null,
    hrvMs: vitals.hrvMs ?? night?.hrvMs ?? null,
    hrvTypical: vitals.hrvTypical ?? night?.hrvTypical ?? null,
    mood,
    meetings,
    meetingsDone,
    insight: null, // la observación real la escribe la IA (StreamText con src); sin IA no inventamos texto.
    isEmpty: (sleepMin || lastNightMin) === null && mood === null && meetings === 0 && sleepWeek.every((m) => m === 0),
  };
}

/** Minutos de sueño por día (lu..hoy) desde raw_events; 0 donde no hay dato. */
function sleepWeekFor(userId: UserId, now: Date): number[] {
  const days = Array.from({ length: 7 }, (_, i) => dayKey.format(now.getTime() - (6 - i) * DAY));
  const rows = db
    .select({ ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "google"), eq(rawEvents.kind, "sleep"), gte(rawEvents.ts, new Date(now.getTime() - 8 * DAY).toISOString())))
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

/** 0..1: cuánto "tiembla" el fondo. Sin datos de sueño asume neutro. */
export function stressOf({ sleepMin, meetings }: Pick<Today, "sleepMin" | "meetings">): number {
  const sleepDebt = sleepMin === null ? 0 : Math.max(0, Math.min(1, (450 - sleepMin) / 240));
  return Math.min(1, 0.15 + sleepDebt * 0.6 + Math.min(meetings, 8) * 0.04);
}

export type Contributor = { label: string; value: string; vs: string; trend: "up" | "down" | "flat"; isGood: boolean };

/** Los "por qué" del estado, siempre contra tu propia media. Solo entran los que tienen dato real. */
export function contributors(today: Today): Contributor[] {
  const out: Contributor[] = [];
  const fmt = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  const realWeek = today.sleepWeek.filter((m) => m > 0);

  if (today.sleepMin !== null && realWeek.length) {
    const avgSleep = Math.round(realWeek.reduce((a, b) => a + b, 0) / realWeek.length);
    const sleepTrend = today.sleepMin > avgSleep + 15 ? "up" : today.sleepMin < avgSleep - 15 ? "down" : "flat";
    out.push({ label: "sueño", value: fmt(today.sleepMin), vs: `media 7 días ${fmt(avgSleep)}`, trend: sleepTrend, isGood: sleepTrend !== "down" });
  }
  if (today.hrvMs !== null && today.hrvTypical) {
    const [lo, hi] = today.hrvTypical;
    const trend = today.hrvMs > hi ? "up" : today.hrvMs < lo ? "down" : "flat";
    out.push({ label: "hrv", value: `${today.hrvMs} ms`, vs: `típico ${lo}–${hi}`, trend, isGood: today.hrvMs >= lo });
  }
  // "5 hoy · 1 ya pasó": la gráfica de abajo muestra solo las que pasaron, así no parecen números distintos
  const done = today.meetings ? ` · ${today.meetingsDone} ${today.meetingsDone === 1 ? "ya pasó" : "ya pasaron"}` : "";
  out.push({ label: "reuniones", value: `${today.meetings} hoy`, vs: `${today.meetings <= 2 ? "hay hueco para foco" : "día partido"}${done}`, trend: "flat", isGood: today.meetings <= 2 });
  return out;
}

const hourIn = new Intl.DateTimeFormat("es-UY", { timeZone: "America/Montevideo", hour: "2-digit", hourCycle: "h23" });
const hhmmIn = new Intl.DateTimeFormat("es-UY", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const LATE_FROM_HOUR = 1;
const LATE_TO_HOUR = 5;
const LOOKBACK_MS = 20 * 60 * 60 * 1000;

/** Último commit de anoche entre la 1 y las 5 (hora de Uruguay), desde el GitHub real. */
function lateCommitAt(userId: UserId, now: Date): string | null {
  const since = new Date(now.getTime() - LOOKBACK_MS).toISOString();
  const rows = db
    .select({ ts: rawEvents.ts })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "github"), eq(rawEvents.kind, "commit"), gte(rawEvents.ts, since)))
    .orderBy(desc(rawEvents.ts))
    .all();
  const late = rows.find((r) => {
    const h = Number(hourIn.format(new Date(r.ts)));
    return h >= LATE_FROM_HOUR && h < LATE_TO_HOUR;
  });
  return late ? hhmmIn.format(new Date(late.ts)) : null;
}

/** Minutos desde la última comida guardada (raw_events source "meal"), o null. */
function mealMinutesAgo(userId: UserId, now: Date): number | null {
  const row = db
    .select({ ts: rawEvents.ts })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "meal")))
    .orderBy(desc(rawEvents.ts))
    .get();
  return row ? Math.round((now.getTime() - new Date(row.ts).getTime()) / 60000) : null;
}

/** Todo lo que el daemon necesita para elegir su estado. */
export function daemonInput(today: Today, userId: UserId, now = new Date()): DaemonInput {
  const realWeek = today.sleepWeek.filter((m) => m > 0);
  const avgSleepMin = realWeek.length ? Math.round(realWeek.reduce((a, b) => a + b, 0) / realWeek.length) : 0;
  let goodNightsStreak = 0;
  for (let i = today.sleepWeek.length - 1; i >= 0 && today.sleepWeek[i] > 0 && today.sleepWeek[i] >= avgSleepMin; i--) goodNightsStreak++;
  return {
    sleepMin: today.sleepMin ?? 0,
    avgSleepMin,
    meetings: today.meetings,
    mood: today.mood,
    lateCommitAt: lateCommitAt(userId, now),
    mealMinutesAgo: mealMinutesAgo(userId, now),
    goodNightsStreak,
    hour: Number(hourIn.format(now)),
  };
}
