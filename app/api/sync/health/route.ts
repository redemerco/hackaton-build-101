import { syncGoogle } from "@/lib/sources/google";

// GET /api/sync/health → sueño, pulso en reposo, HRV y minutos en zona activa (Google Health) a raw_events. Idempotente.
export async function GET() {
  const inserted = await syncGoogle();
  return Response.json({ inserted });
}
