import { aiErrorReason, getAI, MODEL } from "@/lib/ai";

export const dynamic = "force-dynamic";

// GET /api/ai-status → ¿anda Gemini en ESTE servidor? Hace una llamada mínima y dice por qué falla, sin mostrar la key.
// Para diagnosticar el NAS desde el navegador (si "Hoy, en una" dice [sin IA]).
export async function GET() {
  const configured = Boolean(process.env.GEMINI_API_KEY);
  if (!configured) return Response.json({ ok: false, configured, model: MODEL, reason: aiErrorReason(new Error("GEMINI_API_KEY")) }, { status: 503 });
  const t0 = Date.now();
  try {
    const res = await getAI().models.generateContent({ model: MODEL, contents: "Respondé solo: ok", config: { maxOutputTokens: 5 } });
    return Response.json({ ok: true, configured, model: MODEL, latencyMs: Date.now() - t0, sample: (res.text ?? "").slice(0, 20) });
  } catch (error) {
    console.error("[ai-status]", error);
    return Response.json({ ok: false, configured, model: MODEL, latencyMs: Date.now() - t0, reason: aiErrorReason(error) }, { status: 503 });
  }
}
