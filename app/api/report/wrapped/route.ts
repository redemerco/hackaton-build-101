import { buildWrappedMessage } from "@/lib/report-core";
import { postToSlack, ReportError } from "@/lib/report";
import { getCurrentUser } from "@/lib/users";
import { getWrapped } from "@/lib/wrapped";

// POST /api/report/wrapped → manda el Wrapped de tu semana al canal de Slack configurado.
export async function POST() {
  const user = await getCurrentUser();
  const w = getWrapped(user.id);
  if (!w) return Response.json({ error: "Todavía no hay Wrapped para mandar" }, { status: 404 });
  try {
    await postToSlack(buildWrappedMessage(user.name, w));
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ReportError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[report] wrapped", error);
    return Response.json({ error: "No se pudo mandar a Slack" }, { status: 500 });
  }
}
