import { streamSummary } from "@/lib/summary";
import { buildHealthPrompt } from "@/lib/summary-health";
import { getCurrentUser } from "@/lib/users";

// POST /api/summary/health → resumen daily de salud en streaming (con caché si la IA se cae).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  const { system, prompt } = buildHealthPrompt(user.id);
  const force = new URL(req.url).searchParams.has("force"); // botón ↻
  return streamSummary({ userId: user.id, kind: "health", system, prompt, force });
}

// GET /api/summary/health → solo los "datos usados" (sin llamar a la IA).
export async function GET() {
  const user = await getCurrentUser();
  return Response.json({ counts: buildHealthPrompt(user.id).counts });
}
