import { getConnection, listConnections } from "@/lib/connections";
import { insertRawEvents, type RawEventInput } from "@/lib/db";
import { freshToken } from "@/lib/oauth";
import { healthApiBase } from "@/lib/config";

// Ingest de Google Health (Fitbit) → raw_events (source "google").
// Forma real del sueño (verificado contra la API con la cuenta de Santi):
//   dataPoint.sleep = { interval:{startTime,endTime,startUtcOffset}, type:"STAGES", stages:[{startTime,endTime,type}], summary }
// El endpoint rechaza el filtro data_type.*; traemos sin filtro y recortamos por fecha en JS.
// Los diarios y AZM tienen la forma de la referencia v4 (users.dataTypes.dataPoints):
//   dailyRestingHeartRate:{date:{year,month,day}, beatsPerMinute}
//   dailyHeartRateVariability:{date, averageHeartRateVariabilityMilliseconds}
//   activeZoneMinutes:{interval:{startTime}, heartRateZone, activeZoneMinutes}
const SLEEP_DAYS = 90;
const DAILY_DAYS = 35; // el último mes (cruces de Yo, Wrapped) + margen; el ranking usa 7 + 14 de base
const base = () => `${healthApiBase()}/users/me`; // HEALTH_API_BASE (default la v4 pública de Google)
const MAX_PAGES = 50; // AZM viene por minuto: un mes son varias páginas de 100 (4 tipos × 50 sigue bajo 300 req/min)

type Point = Record<string, unknown>;
type Pick = (p: Point) => { kind: string; ts: string } | null;

// {year,month,day} → medianoche UTC de esa fecha (clave estable para el día local del usuario).
function dateTs(d: unknown): string | null {
  const { year, month, day } = (d ?? {}) as Record<string, number>;
  return year && month && day ? new Date(Date.UTC(year, month - 1, day)).toISOString() : null;
}

const TYPES: { type: string; days: number; pick: Pick }[] = [
  {
    type: "sleep",
    days: SLEEP_DAYS,
    pick: (p) => {
      const start = (((p.sleep ?? {}) as Point).interval as Record<string, string> | undefined)?.startTime;
      return start ? { kind: "sleep", ts: new Date(start).toISOString() } : null;
    },
  },
  {
    type: "daily-resting-heart-rate",
    days: DAILY_DAYS,
    pick: (p) => {
      const ts = dateTs((p.dailyRestingHeartRate as Point | undefined)?.date);
      return ts ? { kind: "resting_hr", ts } : null;
    },
  },
  {
    type: "daily-heart-rate-variability",
    days: DAILY_DAYS,
    pick: (p) => {
      const ts = dateTs((p.dailyHeartRateVariability as Point | undefined)?.date);
      return ts ? { kind: "hrv", ts } : null;
    },
  },
  {
    type: "active-zone-minutes",
    days: DAILY_DAYS,
    pick: (p) => {
      const start = (((p.activeZoneMinutes ?? {}) as Point).interval as Record<string, string> | undefined)?.startTime;
      return start ? { kind: "azm", ts: new Date(start).toISOString() } : null;
    },
  },
];

async function fetchType(hdr: HeadersInit, userId: string, { type, days, pick }: (typeof TYPES)[number]): Promise<RawEventInput[]> {
  const since = Date.now() - days * 86400_000;
  const rows: RawEventInput[] = [];
  const url = (tok?: string) => `${base()}/dataTypes/${type}/dataPoints?page_size=100${tok ? `&page_token=${tok}` : ""}`;
  let next: string | undefined = url();
  let guard = 0;
  while (next && guard++ < MAX_PAGES) {
    const res: Response = await fetch(next, { headers: hdr, cache: "no-store" });
    if (!res.ok) throw new Error(`google-health ${type} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page: Point = await res.json();
    for (const p of (page.dataPoints as Point[]) ?? []) {
      const hit = pick(p);
      if (hit && Date.parse(hit.ts) >= since) rows.push({ source: "google", kind: hit.kind, userId, ts: hit.ts, data: p });
    }
    const tok = page.nextPageToken as string | undefined;
    next = tok ? url(tok) : undefined;
  }
  return rows;
}

export async function syncGoogleUser(userId: string): Promise<number> {
  const conn = getConnection(userId, "google");
  if (!conn) return 0;
  const token = await freshToken(conn);
  const hdr = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  // Cada tipo por separado: si uno falla (scope, 403), los demás igual entran.
  const results = await Promise.allSettled(TYPES.map((t) => fetchType(hdr, userId, t)));
  const rows = results.flatMap((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.error(`[sync/google] ${TYPES[i].type}`, r.reason);
    return [];
  });
  return rows.length ? insertRawEvents(rows) : 0;
}

/** Todos los usuarios con login de Google (para /api/sync/health y pull-to-sync). */
export async function syncGoogle(): Promise<number> {
  let total = 0;
  for (const c of listConnections("google")) {
    total += await syncGoogleUser(c.userId).catch((error) => {
      console.error(`[sync/google] ${c.userId}`, error);
      return 0;
    });
  }
  return total;
}
