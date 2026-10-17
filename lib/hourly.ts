// Eventos crudos → por hora (para la gráfica cruzada de Yo) y por día (para los cruces de lib/insights.ts).
// Puro: sin DB ni server-only, lo prueba scripts/smoke.mts. La carga desde raw_events está en lib/cross.ts.

export type RawRow = { source: string; kind: string; ts: string; json: string };

export const TZ_OFFSET_MIN = -180; // Montevideo (sin horario de verano)
const MIN = 60_000;
const WORK_START_H = 9;
const WORK_END_H = 18;

/** "YYYY-MM-DD" y minuto del día en hora local. */
export function local(iso: string | number): { day: string; minute: number } {
  const d = new Date((typeof iso === "number" ? iso : Date.parse(iso)) + TZ_OFFSET_MIN * MIN);
  return { day: d.toISOString().slice(0, 10), minute: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export type Hour = { hour: number; commits: number; messages: number; meetingMin: number; azm: number; meals: number; asleep: boolean };
export type Hourly = { day: string; hours: Hour[]; mood: number | null };

type Json = Record<string, unknown>;
const parse = (json: string): Json => {
  try {
    return JSON.parse(json) as Json;
  } catch {
    return {};
  }
};

/** Intervalo [start, end) de cada sesión de sueño (ms UTC). */
function sleepIntervals(rows: RawRow[]): [number, number][] {
  return rows
    .filter((r) => r.source === "google" && r.kind === "sleep")
    .map((r) => (((parse(r.json).sleep ?? {}) as Json).interval ?? {}) as Record<string, string>)
    .filter((i) => i.startTime && i.endTime)
    .map((i) => [Date.parse(i.startTime), Date.parse(i.endTime)] as [number, number]);
}

function meetings(rows: RawRow[]): [number, number][] {
  return rows
    .filter((r) => r.source === "calendar")
    .map((r) => parse(r.json) as { start?: string; end?: string | null; allDay?: boolean })
    .filter((e) => e.start && e.end && !e.allDay)
    .map((e) => [Date.parse(e.start!), Date.parse(e.end!)] as [number, number]);
}

/** Minutos de [a,b) que caen dentro de [lo,hi). */
const overlap = (a: number, b: number, lo: number, hi: number) => Math.max(0, Math.min(b, hi) - Math.max(a, lo)) / MIN;

/** Medianoche local de `day` en ms UTC. */
export const dayStartMs = (day: string) => Date.parse(`${day}T00:00:00Z`) - TZ_OFFSET_MIN * MIN;

/** 24 horas de un día local: trabajo (commits, mensajes, reuniones) y cuerpo (sueño, minutos activos, comidas). */
export function hourlyFor(rows: RawRow[], day: string): Hourly {
  const start = dayStartMs(day);
  const hours: Hour[] = Array.from({ length: 24 }, (_, hour) => ({ hour, commits: 0, messages: 0, meetingMin: 0, azm: 0, meals: 0, asleep: false }));
  let mood: number | null = null;

  for (const r of rows) {
    const at = local(r.ts);
    if (at.day !== day) continue;
    const h = hours[Math.floor(at.minute / 60)];
    if (r.source === "github" && r.kind === "commit") h.commits++;
    else if (r.source === "slack") h.messages++;
    else if (r.source === "google" && r.kind === "azm") h.azm += Number(((parse(r.json).activeZoneMinutes ?? {}) as Json).activeZoneMinutes) || 1;
    else if (r.source === "meal") h.meals++;
    else if (r.source === "mood") {
      const m = parse(r.json).mood;
      if (typeof m === "number") mood = m;
    }
  }
  const sleeps = sleepIntervals(rows);
  const meets = meetings(rows);
  for (const h of hours) {
    const lo = start + h.hour * 60 * MIN;
    const hi = lo + 60 * MIN;
    h.meetingMin = Math.round(meets.reduce((sum, [a, b]) => sum + overlap(a, b, lo, hi), 0));
    h.asleep = sleeps.some(([a, b]) => overlap(a, b, lo, hi) >= 30);
  }
  return { day, hours, mood };
}

/** Un día, resumido para los cruces. Cada campo es null si ese día no hay dato de esa fuente. */
export type DaySeries = {
  day: string;
  sleepMin: number | null; // la noche que TERMINA este día
  bedMinute: number | null; // hora de acostarse de esa noche, en minutos desde las 18:00 del día anterior
  mood: number | null;
  azm: number | null;
  commits: number;
  lateCommits: number; // 00:00–04:00
  lastWorkMinute: number | null; // último commit/mensaje del día (minuto local)
  meetingMin: number;
  longestFreeMin: number | null; // bloque más largo sin reuniones entre 9 y 18 (null si no hay Calendar)
  restingBpm: number | null;
  hrvMs: number | null;
};

/** Series diarias de `days` (orden cronológico). `hasCalendar` distingue "0 reuniones" de "sin Calendar". */
export function dailySeries(rows: RawRow[], days: string[], hasCalendar: boolean): DaySeries[] {
  const byDay = new Map<string, DaySeries>(
    days.map((day) => [day, { day, sleepMin: null, bedMinute: null, mood: null, azm: null, commits: 0, lateCommits: 0, lastWorkMinute: null, meetingMin: 0, longestFreeMin: null, restingBpm: null, hrvMs: null }]),
  );
  const at = (day: string) => byDay.get(day);

  for (const r of rows) {
    const t = local(r.ts);
    const d = at(t.day);
    const data = parse(r.json);
    if (r.source === "google" && r.kind === "sleep") {
      const sleep = (data.sleep ?? {}) as Json;
      const interval = (sleep.interval ?? {}) as Record<string, string>;
      if (!interval.endTime) continue;
      const end = local(interval.endTime);
      const night = at(end.day);
      if (!night) continue;
      const summary = (((sleep.summary ?? {}) as Json).stagesSummary ?? []) as Array<Record<string, string>>;
      const asleep = summary.length
        ? summary.filter((s) => s.type !== "AWAKE").reduce((n, s) => n + (parseInt(s.minutes, 10) || 0), 0)
        : (Date.parse(interval.endTime) - Date.parse(interval.startTime)) / MIN;
      night.sleepMin = Math.round((night.sleepMin ?? 0) + asleep);
      const bed = (Date.parse(interval.startTime) - (dayStartMs(end.day) - 6 * 60 * MIN)) / MIN; // desde las 18:00 de la víspera
      if (bed >= 0 && bed < 18 * 60) night.bedMinute = night.bedMinute === null ? Math.round(bed) : Math.min(night.bedMinute, Math.round(bed));
      continue;
    }
    if (!d) continue;
    if (r.source === "github" && r.kind === "commit") {
      d.commits++;
      if (t.minute < 4 * 60) d.lateCommits++;
      d.lastWorkMinute = Math.max(d.lastWorkMinute ?? 0, t.minute);
    } else if (r.source === "slack") {
      d.lastWorkMinute = Math.max(d.lastWorkMinute ?? 0, t.minute);
    } else if (r.source === "mood" && typeof data.mood === "number") d.mood = data.mood;
    else if (r.source === "google" && r.kind === "azm") d.azm = (d.azm ?? 0) + (Number(((data.activeZoneMinutes ?? {}) as Json).activeZoneMinutes) || 1);
    else if (r.source === "google" && r.kind === "resting_hr") {
      const bpm = parseInt(String((data.dailyRestingHeartRate as Json | undefined)?.beatsPerMinute), 10);
      const day = at(r.ts.slice(0, 10));
      if (day && bpm > 0) day.restingBpm = bpm;
    } else if (r.source === "google" && r.kind === "hrv") {
      const ms = Number((data.dailyHeartRateVariability as Json | undefined)?.averageHeartRateVariabilityMilliseconds);
      const day = at(r.ts.slice(0, 10));
      if (day && ms > 0) day.hrvMs = ms;
    }
  }

  const meets = meetings(rows);
  for (const d of byDay.values()) {
    const lo = dayStartMs(d.day) + WORK_START_H * 60 * MIN;
    const hi = dayStartMs(d.day) + WORK_END_H * 60 * MIN;
    const today = meets.filter(([a, b]) => overlap(a, b, dayStartMs(d.day), dayStartMs(d.day) + 24 * 60 * MIN) > 0);
    d.meetingMin = Math.round(today.reduce((sum, [a, b]) => sum + overlap(a, b, dayStartMs(d.day), dayStartMs(d.day) + 24 * 60 * MIN), 0));
    if (!hasCalendar) continue;
    const busy = today.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)] as [number, number]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    let cursor = lo;
    let longest = 0;
    for (const [a, b] of busy) {
      longest = Math.max(longest, (a - cursor) / MIN);
      cursor = Math.max(cursor, b);
    }
    d.longestFreeMin = Math.round(Math.max(longest, (hi - cursor) / MIN));
  }
  return days.map((day) => byDay.get(day)!);
}
