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
    // solo trabajo: ánimo, comidas y sueño no salen a Slack con un clic sin vista previa
    await postToSlack(buildWrappedMessage(user.name, { ...w, rows: w.rows.filter((r) => r.kind === "work") }));
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ReportError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[report] wrapped", error);
    return Response.json({ error: "No se pudo mandar a Slack" }, { status: 500 });
  }
}
