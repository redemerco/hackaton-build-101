import { proposeActions, saveProposal } from "@/lib/agent";
import { getCurrentUser } from "@/lib/users";

// GET /api/agent/propose → AgentAction[] (como máximo 2). La propuesta queda en raw_events (source "agent", kind "proposal"):
// POST /api/agent/run relee la acción por id de ahí, y es el [cache] de la tarjeta si la IA no responde.
export async function GET() {
  const { id: userId } = await getCurrentUser();
  const proposal = await proposeActions(userId);
  saveProposal(userId, proposal);
  return Response.json(proposal.actions, { headers: { "Cache-Control": "no-store" } });
}
