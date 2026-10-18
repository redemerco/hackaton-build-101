import { pendingProposal } from "@/lib/agent";
import { getCurrentUser } from "@/lib/users";

// GET /api/agent/pending → { proposal: Proposal | null }. La última propuesta NO vencida (la que avisó el push del cron),
// con las acciones ya ejecutadas marcadas (`done`). La UI la usa primero y solo pide una nueva si no hay ninguna.
export async function GET() {
  const { id: userId } = await getCurrentUser();
  const proposal = userId === "guest" ? null : pendingProposal(userId);
  return Response.json({ proposal }, { headers: { "Cache-Control": "no-store" } });
}
