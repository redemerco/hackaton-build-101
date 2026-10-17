import { syncGithub } from "@/lib/sources/github";

// GET /api/sync/github → trae lo nuevo de GitHub a raw_events. Idempotente: se puede correr antes de cada dry-run.
export async function GET() {
  const inserted = await syncGithub();
  return Response.json({ inserted });
}
