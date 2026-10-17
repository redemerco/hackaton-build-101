import { getConnection } from "@/lib/connections";
import { insertRawEvents, type RawEventInput } from "@/lib/db";
import { freshToken } from "@/lib/oauth";

// Ingest de Google Health (Fitbit) → raw_events (source "google", kind "sleep").
// Forma real del dato (verificado contra la API con la cuenta de Santi):
//   dataPoint.sleep = { interval:{startTime,endTime,startUtcOffset}, type:"STAGES", stages:[{startTime,endTime,type}], summary }
// El endpoint rechaza el filtro data_type.*; traemos sin filtro y recortamos por fecha en JS.
const DAYS = 90;
const BASE = "https://health.googleapis.com/v4/users/me";

export async function syncGoogleUser(userId: string): Promise<number> {
  const conn = getConnection(userId, "google");
  if (!conn) return 0;
  const token = await freshToken(conn);
  const hdr = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  const since = Date.now() - DAYS * 86400_000;
  const rows: RawEventInput[] = [];

  try {
    let next: string | undefined = `${BASE}/dataTypes/sleep/dataPoints?page_size=100`;
    let guard = 0;
    while (next && guard++ < 20) {
      const res: Response = await fetch(next, { headers: hdr, cache: "no-store" });
      if (!res.ok) throw new Error(`google-health ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const page: Record<string, unknown> = await res.json();
      const points = (page.dataPoints as Array<Record<string, unknown>>) ?? [];
      for (const p of points) {
        const sleep = (p.sleep ?? {}) as Record<string, unknown>;
        const interval = (sleep.interval ?? {}) as Record<string, string>;
        const start = interval.startTime;
        if (!start || Date.parse(start) < since) continue;
        rows.push({ source: "google", kind: "sleep", userId, ts: new Date(start).toISOString(), data: p });
      }
      const tok = page.nextPageToken as string | undefined;
      next = tok ? `${BASE}/dataTypes/sleep/dataPoints?page_size=100&page_token=${tok}` : undefined;
    }
  } catch (error) {
    console.error("[sync/google] sleep", error);
  }

  return rows.length ? insertRawEvents(rows) : 0;
}
