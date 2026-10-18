import { proposeActions, saveProposal } from "@/lib/agent";
import { isQuietHour, pushSummary } from "@/lib/agent-rules";
import { checkBearer } from "@/lib/bearer";
import { sendPush } from "@/lib/push";
import { syncCalendarUser } from "@/lib/sources/calendar";
import { syncGithubUser } from "@/lib/sources/github";
import { syncLinearUser } from "@/lib/sources/linear";
import { allUsers } from "@/lib/users";

// POST /api/agent/cron (Authorization: Bearer $AGENT_CRON_TOKEN) → para cada usuario real: sincroniza Calendar, GitHub y
// Linear, evalúa + propone y lo guarda como propuesta pendiente (vence en AGENT_PROPOSAL_TTL_H). Si hay ≥1 acción y no
// es horario silencioso (AGENT_QUIET_START → AGENT_QUIET_END, hora de Uruguay) manda un push con url /?agente=1.
// NUNCA ejecuta acciones: eso solo pasa con Confirmar en la UI.
export async function POST(req: Request) {
  const denied = checkBearer(req, "AGENT_CRON_TOKEN");
  if (denied) return denied;

  const now = Date.now();
  const quiet = isQuietHour(now);
  const users: unknown[] = [];
  for (const u of allUsers().filter((x) => x.id !== "guest")) {
    const syncs = await Promise.allSettled([syncCalendarUser(u.id), syncGithubUser(u.id), syncLinearUser(u.id)]);
    const [calendar, github, linear] = syncs.map((s) => (s.status === "fulfilled" ? s.value : `error: ${String(s.reason).slice(0, 120)}`));
    const synced = { calendar, github, linear };
    try {
      const proposal = saveProposal(u.id, await proposeActions(u.id));
      const n = proposal.actions.length;
      let push: { sent: number; removed: number } | string = quiet ? "silencioso" : n === 0 ? "sin acciones" : "";
      if (!push) {
        const title = `Tenés ${n} propuesta${n > 1 ? "s" : ""}`;
        push = await sendPush(u.id, { title, body: pushSummary(proposal.assessment!, n), url: "/?agente=1" }).catch((error: unknown) => `error: ${String(error).slice(0, 120)}`);
      }
      const a = proposal.assessment;
      users.push({
        userId: u.id,
        synced,
        origin: proposal.origin,
        actions: proposal.actions.map((x) => x.type),
        flags: a?.flags.map((f) => f.id) ?? [],
        work: a ? { expected: a.work.expected, actual: a.work.actual, gap: a.work.gap } : null,
        healthScore: a?.health.score ?? null,
        expiresAt: proposal.expiresAt,
        push,
      });
    } catch (error) {
      console.error(`[agent/cron] ${u.id}`, error);
      users.push({ userId: u.id, synced, error: String(error).slice(0, 200) });
    }
  }
  return Response.json({ ranAt: new Date(now).toISOString(), quiet, users }, { headers: { "Cache-Control": "no-store" } });
}
