import { createPreview, ReportError } from "@/lib/report";
import { getCurrentUser } from "@/lib/users";

// POST /api/report { note, include: { salud, animo } } → vista previa del reporte "cómo vengo", generada por Gemini con tus métricas.
// Sin IA responde 503 con el motivo: este reporte no tiene versión sin IA, a propósito.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  let note: unknown = "";
  let include: unknown;
  try {
    ({ note, include } = (await req.json()) as { note?: unknown; include?: unknown });
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  try {
    return Response.json(await createPreview(user.id, note, include));
  } catch (error) {
    if (error instanceof ReportError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[report] preview", error);
    return Response.json({ error: "No se pudo generar el reporte" }, { status: 500 });
  }
}
