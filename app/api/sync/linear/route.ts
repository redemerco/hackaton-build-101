import { syncLinear } from "@/lib/sources/linear";

// GET /api/sync/linear → trae issues de Linear a raw_events. Idempotente.
export async function GET() {
  const inserted = await syncLinear();
  return Response.json({ inserted });
}
