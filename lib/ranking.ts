import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { getConnection } from "@/lib/connections";
import { db, rawEvents } from "@/lib/db";
import { mean, scoreDay, type DayInput, type DayScore } from "@/lib/score";
import { USERS, type UserId } from "@/lib/user-list";

// Ranking de la organización: los usuarios de build101 conectados al mismo workspace de Slack,
// ordenados por el puntaje build101 (lib/score.ts) del día y de la semana. Solo se comparte el puntaje.

const TZ = "America/Montevideo";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }); // → "2026-10-17"
const WEEK_DAYS = 7;
const BASELINE_DAYS = 14;
const MIN_BASELINE_SAMPLES = 3;
const DAY_MS = 86400_000;

export type RankRow = {
  userId: string;
  name: string;
  isMe: boolean;
  today: DayScore | null;
  week: { score: number; days: number } | null;
};

export type Ranking = {
  team: string | null; // nombre del workspace; null = el usuario actual no tiene Slack
  rows: RankRow[];
  isExample: boolean;
};

type Json = Record<string, unknown>;

const keyOf = (ms: number) => dayKey.format(new Date(ms));

// Día local de una hora ISO usando el offset que manda Google ("-10800s"); si no viene, Montevideo.
function localKey(iso: string, offset?: string): string {
  const off = parseInt(offset ?? "", 10);
  if (Number.isFinite(off)) return new Date(Date.parse(iso) + off * 1000).toISOString().slice(0, 10);
  return keyOf(Date.parse(iso));
}

function sleepOf(data: Json): { key: string; sleep: NonNullable<DayInput["sleep"]> } | null {
  const sleep = (data.sleep ?? {}) as Json;
  const interval = (sleep.interval ?? {}) as Record<string, string>;
  if (!interval.endTime) return null;
  const min = { DEEP: 0, REM: 0, LIGHT: 0, AWAKE: 0 } as Record<string, number>;
  const summary = ((sleep.summary ?? {}) as Json).stagesSummary as Array<Record<string, string>> | undefined;
  if (summary?.length) {
    for (const s of summary) min[String(s.type).toUpperCase()] = (min[String(s.type).toUpperCase()] ?? 0) + (parseInt(s.minutes, 10) || 0);
  } else {
    const stages = (sleep.stages ?? sleep.sleepStages ?? []) as Array<Record<string, string>>;
    for (const s of stages) {
      const m = (Date.parse(s.endTime) - Date.parse(s.startTime)) / 60000;
      if (m > 0) min[String(s.type).toUpperCase()] = (min[String(s.type).toUpperCase()] ?? 0) + m;
    }
  }
  const awake = (min.AWAKE ?? 0) + (min.WAKE ?? 0);
  const asleep = (min.DEEP ?? 0) + (min.REM ?? 0) + (min.LIGHT ?? 0) + (min.ASLEEP ?? 0);
  if (asleep <= 0) return null;
  return {
    key: localKey(interval.endTime, interval.endUtcOffset ?? interval.startUtcOffset),
    sleep: { asleepMin: asleep, deepRemMin: (min.DEEP ?? 0) + (min.REM ?? 0), awakeMin: awake },
  };
}

/** Insumos del puntaje por día local, para un usuario. */
function dayInputs(userId: string, sinceMs: number): Map<string, DayInput> {
  const rows = db
    .select()
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "google"), gte(rawEvents.ts, new Date(sinceMs).toISOString())))
    .all();
  const days = new Map<string, DayInput>();
  const at = (key: string) => days.get(key) ?? days.set(key, {}).get(key)!;

  for (const r of rows) {
    let data: Json;
    try {
      data = JSON.parse(r.json);
    } catch {
      continue;
    }
    if (r.kind === "sleep") {
      const s = sleepOf(data);
      // si hay dos sesiones el mismo día (siesta), suma
      if (s) {
        const prev = at(s.key).sleep;
        at(s.key).sleep = prev
          ? { asleepMin: prev.asleepMin + s.sleep.asleepMin, deepRemMin: prev.deepRemMin + s.sleep.deepRemMin, awakeMin: prev.awakeMin + s.sleep.awakeMin }
          : s.sleep;
      }
    } else if (r.kind === "resting_hr") {
      const bpm = parseInt(String((data.dailyRestingHeartRate as Json | undefined)?.beatsPerMinute), 10);
      if (bpm > 0) at(r.ts.slice(0, 10)).restingBpm = bpm;
    } else if (r.kind === "hrv") {
      const ms = Number((data.dailyHeartRateVariability as Json | undefined)?.averageHeartRateVariabilityMilliseconds);
      if (ms > 0) at(r.ts.slice(0, 10)).hrvMs = ms;
    } else if (r.kind === "azm") {
      const azm = (data.activeZoneMinutes ?? {}) as Json;
      const interval = (azm.interval ?? {}) as Record<string, string>;
      const n = parseInt(String(azm.activeZoneMinutes), 10) || 0;
      const day = at(localKey(r.ts, interval.startUtcOffset));
      day.azm = (day.azm ?? 0) + n;
    }
  }
  return days;
}

function scoresFor(userId: string, now: number): { today: DayScore | null; week: RankRow["week"] } {
  const days = dayInputs(userId, now - (WEEK_DAYS + BASELINE_DAYS) * DAY_MS);
  const scoreOn = (offset: number): DayScore | null => {
    const key = keyOf(now - offset * DAY_MS);
    const day = days.get(key);
    if (!day) return null;
    const prior = Array.from({ length: BASELINE_DAYS }, (_, i) => days.get(keyOf(now - (offset + i + 1) * DAY_MS)));
    const enough = (vals: (number | undefined)[]) => (vals.filter((v) => v !== undefined).length >= MIN_BASELINE_SAMPLES ? mean(vals) : undefined);
    return scoreDay(day, { hrvMs: enough(prior.map((d) => d?.hrvMs)), restingBpm: enough(prior.map((d) => d?.restingBpm)) });
  };
  const week = Array.from({ length: WEEK_DAYS }, (_, i) => scoreOn(i)).filter((s): s is DayScore => s !== null);
  return {
    today: scoreOn(0),
    week: week.length ? { score: Math.round(mean(week.map((s) => s.score))!), days: week.length } : null,
  };
}

const teamOf = (userId: string) => getConnection(userId, "slack")?.account.split("@").at(-1) ?? null;

const byScore = (pick: (r: RankRow) => number | undefined) => (a: RankRow, b: RankRow) => (pick(b) ?? -1) - (pick(a) ?? -1);

// Rotulado como ejemplo en la UI: se ve hasta que haya al menos un puntaje real en el workspace.
function exampleRanking(me: UserId, team: string | null): Ranking {
  const fake: Record<string, [number, number]> = { santi: [82, 77], renzo: [74, 79], joaco: [61, 66] };
  const rows = USERS.map((u) => {
    const [today, week] = fake[u.id];
    return { userId: u.id, name: u.name, isMe: u.id === me, today: { score: today, parts: {}, isPartial: false }, week: { score: week, days: 7 } };
  });
  return { team, rows, isExample: true };
}

/** Ranking del workspace de Slack del usuario actual. */
export function getRanking(me: UserId, now = Date.now()): Ranking {
  const team = teamOf(me);
  if (!team) return { team: null, rows: [], isExample: false };
  const rows: RankRow[] = USERS.filter((u) => teamOf(u.id) === team).map((u) => ({
    userId: u.id,
    name: u.name,
    isMe: u.id === me,
    ...scoresFor(u.id, now),
  }));
  if (!rows.some((r) => r.today || r.week)) return exampleRanking(me, team);
  return { team, rows, isExample: false };
}

export const sortToday = (rows: RankRow[]) => [...rows].sort(byScore((r) => r.today?.score));
export const sortWeek = (rows: RankRow[]) => [...rows].sort(byScore((r) => r.week?.score));
