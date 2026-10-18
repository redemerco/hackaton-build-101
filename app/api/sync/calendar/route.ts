import { listConnections } from "@/lib/connections";
import { syncCalendarUser } from "@/lib/sources/calendar";

// GET /api/sync/calendar → reuniones (solo horarios) de los usuarios conectados a raw_events. Idempotente.
export async function GET() {
  const results = await Promise.allSettled(listConnections("calendar").map((c) => syncCalendarUser(c.userId)));
  // un token vencido de un usuario no frena la sincronización del resto
  results.forEach((r) => r.status === "rejected" && console.error("[sync/calendar]", r.reason));
  const counts = results.map((r) => (r.status === "fulfilled" ? r.value : 0));
  return Response.json({ inserted: counts.reduce((a, b) => a + b, 0) });
}
