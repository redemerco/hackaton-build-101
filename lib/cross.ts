import "server-only";
import { and, eq, gte, notInArray } from "drizzle-orm";
import { getConnection } from "@/lib/connections";
import { db, rawEvents } from "@/lib/db";
import { dailySeries, hourlyFor, local, type DaySeries, type Hourly, type RawRow } from "@/lib/hourly";
import { crossInsights, type Insight, type Pending } from "@/lib/insights";

// Carga de raw_events para Yo: el día por hora (gráfica cruzada) y 6 semanas por día (cruces con papers).
const HISTORY_DAYS = 42;
const DAY_MS = 86400_000;
// lo que la app escribe sobre sí misma no es un dato del usuario
const NOT_DATA = ["summary", "digest", "agent", "report"];

export type Cross = { today: Hourly; nowHour: number; series: DaySeries[]; insights: Insight[]; pending: Pending[] };

function rowsFor(userId: string, sinceMs: number): RawRow[] {
  return db
    .select({ source: rawEvents.source, kind: rawEvents.kind, ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), gte(rawEvents.ts, new Date(sinceMs).toISOString()), notInArray(rawEvents.source, NOT_DATA)))
    .all();
}

export function getCross(userId: string, now = Date.now()): Cross {
  // un día extra antes: la noche que termina el primer día empezó la víspera
  const rows = rowsFor(userId, now - (HISTORY_DAYS + 1) * DAY_MS);
  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => local(now - (HISTORY_DAYS - 1 - i) * DAY_MS).day);
  const hasCalendar = Boolean(getConnection(userId, "calendar")) || rows.some((r) => r.source === "calendar");
  const series = dailySeries(rows, days, hasCalendar);
  const { ready, pending } = crossInsights(series);
  return { today: hourlyFor(rows, days.at(-1)!), nowHour: Math.floor(local(now).minute / 60), series, insights: ready, pending };
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
