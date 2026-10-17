import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, rawEvents } from "@/lib/db";
import type { DaemonInput } from "@/lib/daemon";
import type { UserId } from "@/lib/users";
import { getLastNight } from "@/lib/body";

export type Today = {
  sleepMin: number;
  sleepWeek: number[]; // minutos, últimos 7 días (el último es anoche)
  restingBpm: number;
  restingTypical: [number, number]; // tu rango típico (línea base personal, no la población)
  hrvMs: number;
  hrvTypical: [number, number];
  mood: number | null; // 1..5, null = sin check-in hoy
  meetings: number;
  insight: string;
  isExample: boolean;
};

export { moodFace } from "@/lib/ascii";

/** Último check-in de ánimo de hoy (día local del server), o null. */
function todaysMood(userId: UserId): number | null {
  const row = db
    .select({ ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "mood")))
    .orderBy(desc(rawEvents.ts))
    .get();
  if (!row || new Date(row.ts).toDateString() !== new Date().toDateString()) return null;
  const mood = (JSON.parse(row.json) as { mood?: unknown }).mood;
  return typeof mood === "number" ? mood : null;
}

// El sueño sale del ingest real de google_health (lib/body) cuando existe; si no, ejemplo.
export function getToday(userId: UserId): Today {
  const night = getLastNight(userId);
  const nightMin = (sm?: Record<string, number>) => (sm ? sm.light + sm.deep + sm.rem : undefined);
  const realSleep = night.isExample ? undefined : nightMin(night.stageMinutes);

  const exampleWeek = [402, 431, 352, 470, 410, 440, 420]; // el último = la noche de ejemplo de lib/body (7h00)
  const sleepWeek = realSleep ? [...exampleWeek.slice(0, 6), realSleep] : exampleWeek;

  return {
    sleepMin: realSleep ?? 420,
    sleepWeek,
    restingBpm: 58,
    restingTypical: [55, 62],
    hrvMs: 48,
    hrvTypical: [41, 52],
    mood: todaysMood(userId),
    meetings: 2,
    insight: "Los días con una sola reunión hiciste el doble de commits. Hoy tenés dos: buen día para cerrar un PR.",
    isExample: night.isExample,
  };
}

/** 0..1: cuánto "tiembla" el fondo. */
export function stressOf({ sleepMin, meetings }: Pick<Today, "sleepMin" | "meetings">): number {
  const sleepDebt = Math.max(0, Math.min(1, (450 - sleepMin) / 240));
  return Math.min(1, 0.15 + sleepDebt * 0.6 + Math.min(meetings, 8) * 0.04);
}

export type Contributor = { label: string; value: string; vs: string; trend: "up" | "down" | "flat"; isGood: boolean };

/** Los 3 "por qué" del estado, siempre contra tu propia media. */
export function contributors(today: Today): Contributor[] {
  const avgSleep = Math.round(today.sleepWeek.reduce((a, b) => a + b, 0) / today.sleepWeek.length);
  const fmt = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  const trendOf = (v: number, [lo, hi]: [number, number]) => (v > hi ? "up" : v < lo ? "down" : "flat");
  const sleepTrend = today.sleepMin > avgSleep + 15 ? "up" : today.sleepMin < avgSleep - 15 ? "down" : "flat";
  return [
    { label: "sueño", value: fmt(today.sleepMin), vs: `tu media ${fmt(avgSleep)}`, trend: sleepTrend, isGood: sleepTrend !== "down" },
    { label: "hrv", value: `${today.hrvMs} ms`, vs: `típico ${today.hrvTypical[0]}–${today.hrvTypical[1]}`, trend: trendOf(today.hrvMs, today.hrvTypical), isGood: today.hrvMs >= today.hrvTypical[0] },
    { label: "reuniones", value: String(today.meetings), vs: today.meetings <= 2 ? "hay hueco para foco" : "día partido", trend: "flat", isGood: today.meetings <= 2 },
  ];
}

const TZ = "America/Montevideo";
const hourIn = new Intl.DateTimeFormat("es-UY", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" });
const hhmmIn = new Intl.DateTimeFormat("es-UY", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
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
  const avgSleepMin = Math.round(today.sleepWeek.reduce((a, b) => a + b, 0) / today.sleepWeek.length);
  let goodNightsStreak = 0;
  for (let i = today.sleepWeek.length - 1; i >= 0 && today.sleepWeek[i] >= avgSleepMin; i--) goodNightsStreak++;
  return {
    sleepMin: today.sleepMin,
    avgSleepMin,
    meetings: today.meetings,
    mood: today.mood,
    lateCommitAt: lateCommitAt(userId, now),
    mealMinutesAgo: mealMinutesAgo(userId, now),
    goodNightsStreak,
    hour: Number(hourIn.format(now)),
  };
}
