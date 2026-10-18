import { proposeActions, saveProposal } from "@/lib/agent";
import { getCurrentUser } from "@/lib/users";

// GET /api/agent/propose → { proposal: Proposal } (evaluación + como máximo 3 acciones). Genera una NUEVA y la guarda en
// raw_events (source "agent", kind "proposal") con vencimiento: POST /api/agent/run relee la acción por id de ahí, y es el
// [cache] de la tarjeta si la IA no responde. La UI prefiere GET /api/agent/pending.
export async function GET() {
  const { id: userId } = await getCurrentUser();
  if (userId === "guest") return Response.json({ proposal: null }, { status: 401 });
  const proposal = saveProposal(userId, await proposeActions(userId));
  return Response.json({ proposal }, { headers: { "Cache-Control": "no-store" } });
}
