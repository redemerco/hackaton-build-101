import "server-only";
import { and, eq, gte, notInArray } from "drizzle-orm";
import { getConnection } from "@/lib/connections";
import { db, rawEvents } from "@/lib/db";
import { dailySeries, hourlyFor, local, type DaySeries, type Hourly, type RawRow } from "@/lib/hourly";
import { crossInsights, type Insight, type Pending } from "@/lib/insights";
import { projectsOf, stressMap, type ProjectShare, type StressMap } from "@/lib/stress";

// Carga de raw_events para Yo: el día por hora (gráfica cruzada) y 6 semanas por día (cruces con papers).
const HISTORY_DAYS = 42;
const DAY_MS = 86400_000;
// lo que la app escribe sobre sí misma no es un dato del usuario
const NOT_DATA = ["summary", "digest", "agent", "report"];

export type Cross = { today: Hourly; nowHour: number; series: DaySeries[]; insights: Insight[]; pending: Pending[]; stress: StressMap; projects: ProjectShare[] };

function rowsFor(userId: string, sinceMs: number): RawRow[] {
  return db
    .select({ source: rawEvents.source, kind: rawEvents.kind, ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), gte(rawEvents.ts, new Date(sinceMs).toISOString()), notInArray(rawEvents.source, NOT_DATA)))
    .all();
}

const LATE_FROM_MIN = 23 * 60;
const LATE_UNTIL_MIN = 4 * 60;

/** Un "día" con las últimas 24 h de trabajo (completo, comparable con tu media diaria) y el cuerpo de hoy. */
function last24h(rows: RawRow[], series: DaySeries[], now: number): DaySeries | null {
  const today = series.at(-1);
  if (!today) return null;
  const since = now - DAY_MS;
  const inWindow = rows.filter((r) => {
    const t = Date.parse(r.ts);
    return t >= since && t <= now;
  });
  const isLate = (ts: string) => {
    const m = local(ts).minute;
    return m >= LATE_FROM_MIN || m < LATE_UNTIL_MIN;
  };
  const work = inWindow.filter((r) => (r.source === "github" && r.kind === "commit") || r.source === "slack");
  const meetingMin = inWindow
    .filter((r) => r.source === "calendar")
    .reduce((n, r) => {
      const e = JSON.parse(r.json) as { start?: string; end?: string | null; allDay?: boolean };
      if (!e.start || !e.end || e.allDay) return n;
      return n + Math.max(0, Math.min(Date.parse(e.end), now) - Math.max(Date.parse(e.start), since)) / 60_000;
    }, 0);
  const yesterday = series.at(-2);
  return {
    ...today,
    commits: inWindow.filter((r) => r.source === "github" && r.kind === "commit").length,
    messages: inWindow.filter((r) => r.source === "slack").length,
    issues: inWindow.filter((r) => r.source === "linear").length,
    meetingMin: Math.round(meetingMin),
    lastWorkMinute: work.some((r) => isLate(r.ts)) ? LATE_FROM_MIN : work.length ? 18 * 60 : null,
    // pulso y HRV de hoy si ya llegaron; si no, los de ayer (Google Health los manda al sincronizar)
    restingBpm: today.restingBpm ?? yesterday?.restingBpm ?? null,
    hrvMs: today.hrvMs ?? yesterday?.hrvMs ?? null,
  };
}

export function getCross(userId: string, now = Date.now()): Cross {
  // un día extra antes: la noche que termina el primer día empezó la víspera
  const rows = rowsFor(userId, now - (HISTORY_DAYS + 1) * DAY_MS);
  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => local(now - (HISTORY_DAYS - 1 - i) * DAY_MS).day);
  const hasCalendar = Boolean(getConnection(userId, "calendar")) || rows.some((r) => r.source === "calendar");
  const series = dailySeries(rows, days, hasCalendar);
  const { ready, pending } = crossInsights(series);
  return {
    today: hourlyFor(rows, days.at(-1)!),
    nowHour: Math.floor(local(now).minute / 60),
    series,
    insights: ready,
    pending,
    stress: stressMap(series, last24h(rows, series, now)),
    projects: projectsOf(rows, new Date(now - 7 * DAY_MS).toISOString()),
  };
}

/** Pulso en reposo y HRV más recientes (hoy o ayer) y tu rango típico (media ± 1 desvío de las 4 semanas previas). */
export function recentVitals(series: DaySeries[]): {
  restingBpm: number | null;
  restingTypical: [number, number] | null;
  hrvMs: number | null;
  hrvTypical: [number, number] | null;
} {
  const latest = (pick: (d: DaySeries) => number | null) => pick(series.at(-1)!) ?? pick(series.at(-2) ?? series.at(-1)!);
  const band = (pick: (d: DaySeries) => number | null): [number, number] | null => {
    const xs = series.slice(-30, -1).map(pick).filter((x): x is number => x !== null);
    if (xs.length < 7) return null;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const s = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
    return [Math.round(m - s), Math.round(m + s)];
  };
  const hrv = latest((d) => d.hrvMs);
  return {
    restingBpm: latest((d) => d.restingBpm),
    restingTypical: band((d) => d.restingBpm),
    hrvMs: hrv === null ? null : Math.round(hrv),
    hrvTypical: band((d) => d.hrvMs),
  };
}
