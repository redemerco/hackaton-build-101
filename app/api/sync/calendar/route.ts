import { listConnections } from "@/lib/connections";
import { syncCalendarUser } from "@/lib/sources/calendar";

// GET /api/sync/calendar → reuniones (solo horarios) de los usuarios conectados a raw_events. Idempotente.
export async function GET() {
  const counts = await Promise.all(listConnections("calendar").map((c) => syncCalendarUser(c.userId)));
  return Response.json({ inserted: counts.reduce((a, b) => a + b, 0) });
}
