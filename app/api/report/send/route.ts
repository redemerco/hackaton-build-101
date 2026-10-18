import { ReportError, sendPreview } from "@/lib/report";
import { getCurrentUser } from "@/lib/users";

// POST /api/report/send { id, share: { metrics: string[], note: boolean } } → manda a Slack lo que la persona eligió.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  let body: { id?: unknown; share?: unknown };
  try {
    body = (await req.json()) as typeof body;
    if (!body || typeof body !== "object") throw new Error("body vacío");
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  try {
    await sendPreview(user.id, user.name, body.id, body.share);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ReportError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[report] send", error);
    return Response.json({ error: "No se pudo mandar a Slack" }, { status: 500 });
  }
}
