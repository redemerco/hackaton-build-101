import { getConnection } from "@/lib/connections";
import { insertRawEvents, type RawEventInput } from "@/lib/db";
import { freshToken } from "@/lib/oauth";

// Ingest de Google Calendar → raw_events (source "calendar", kind "event").
// Solo metadata: cuántas reuniones y cuándo (start/end/duración). NUNCA título ni invitados.
const DAYS_BACK = 7;
const DAYS_FWD = 1;

export async function syncCalendarUser(userId: string): Promise<number> {
  const conn = getConnection(userId, "calendar");
  if (!conn) return 0;
  const token = await freshToken(conn);

  const timeMin = new Date(Date.now() - DAYS_BACK * 86400_000).toISOString();
  const timeMax = new Date(Date.now() + DAYS_FWD * 86400_000).toISOString();
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?singleEvents=true&orderBy=startTime&maxResults=250` +
    `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;

  const rows: RawEventInput[] = [];
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`calendar ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
    for (const ev of data.items ?? []) {
      const start = (ev.start as Record<string, string>) ?? {};
      const end = (ev.end as Record<string, string>) ?? {};
      const startIso = start.dateTime ?? start.date;
      const endIso = end.dateTime ?? end.date;
      if (!startIso) continue;
      // Guardamos SOLO metadata: nada de summary/attendees/description.
      const safe = {
        start: startIso,
        end: endIso ?? null,
        durationMin: endIso ? Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000) : null,
        allDay: !start.dateTime,
      };
      rows.push({ source: "calendar", kind: "event", userId, ts: new Date(startIso).toISOString(), data: safe });
    }
  } catch (error) {
    console.error("[sync/calendar]", error);
  }

  return rows.length ? insertRawEvents(rows) : 0;
}
