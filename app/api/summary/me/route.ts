import { getCross } from "@/lib/cross";
import { hasSimulatedData } from "@/lib/report";
import { streamSummary } from "@/lib/summary";
import { buildMePrompt } from "@/lib/summary-me";
import { getToday } from "@/lib/today";
import { getCurrentUser } from "@/lib/users";

// POST /api/summary/me[?force] → resumen daily de Yo en streaming. Mismos datos = mismo resumen (sin llamar a la IA);
// ?force (botón ↻) pide uno nuevo. Si la IA se cae, re-tipea el último guardado.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  const cross = getCross(user.id);
  const { system, prompt } = buildMePrompt(user.id, getToday(user.id, new Date(), cross.series), cross, hasSimulatedData(user.id));
  const force = new URL(req.url).searchParams.has("force");
  return streamSummary({ userId: user.id, kind: "me", system, prompt, force });
}
