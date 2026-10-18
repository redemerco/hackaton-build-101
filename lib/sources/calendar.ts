import { getConnection } from "@/lib/connections";
import { DAY_MS, startOfLocalWeek } from "@/lib/agent-rules";
import { calendarSyncDaysBack, calendarSyncDaysFwd } from "@/lib/config";
import { insertRawEvents, type RawEventInput } from "@/lib/db";
import { freshToken } from "@/lib/oauth";

// Ingest de Google Calendar → raw_events (source "calendar", kind "event").
// Solo metadata: cuántas reuniones y cuándo (start/end/duración). NUNCA título ni invitados.
// Ventana: CALENDAR_SYNC_DAYS_BACK hacia atrás y hasta el fin de la semana local (o CALENDAR_SYNC_DAYS_FWD, lo que llegue más lejos),
// igual que la semana que evalúa el agente. Los que leen "hoy" filtran por día: los eventos futuros no les cambian nada.

/** [timeMin, timeMax] del sync, en ms. */
export function calendarSyncWindow(now = Date.now()): { from: number; to: number } {
  const from = now - calendarSyncDaysBack() * DAY_MS;
  const to = Math.max(now + calendarSyncDaysFwd() * DAY_MS, startOfLocalWeek(now) + 7 * DAY_MS);
  return { from, to };
}

export async function syncCalendarUser(userId: string): Promise<number> {
  const conn = getConnection(userId, "calendar");
  if (!conn) return 0;
  const token = await freshToken(conn);

  const win = calendarSyncWindow();
  const timeMin = new Date(win.from).toISOString();
  const timeMax = new Date(win.to).toISOString();
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
        id: typeof ev.id === "string" ? ev.id : null,
        start: startIso,
        end: endIso ?? null,
        durationMin: endIso ? Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000) : null,
        allDay: !start.dateTime,
        // bloque creado por el agente (foco, a dormir, entrenar, descanso): no es una reunión (ver lib/pulso-events.ts)
        ...(((ev.extendedProperties as { private?: Record<string, string> } | undefined)?.private?.pulso) && { pulso: true }),
      };
      rows.push({ source: "calendar", kind: "event", userId, ts: new Date(startIso).toISOString(), data: safe });
    }
  } catch (error) {
    console.error("[sync/calendar]", error);
  }

  return rows.length ? insertRawEvents(rows) : 0;
}
