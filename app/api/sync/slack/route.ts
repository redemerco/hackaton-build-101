import { syncSlack } from "@/lib/sources/slack";

// GET /api/sync/slack → actividad de Slack (solo horarios) de los usuarios conectados a raw_events. Idempotente.
export async function GET() {
  const inserted = await syncSlack();
  return Response.json({ inserted });
}
