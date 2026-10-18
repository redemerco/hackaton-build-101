import { aiErrorReason, hasAI, MODEL, streamText } from "@/lib/ai";

export const dynamic = "force-dynamic";

// GET /api/ai-status → ¿anda Gemini en ESTE servidor? Hace una llamada mínima y dice por qué falla, sin mostrar la key.
// Para diagnosticar el NAS desde el navegador (si "Hoy, en una" dice [sin IA]).
export async function GET() {
  // con key llama a Gemini directo; sin key pero con AI_SERVICE_URL, prueba el servicio (como el resto de la app)
  const configured = hasAI();
  const via = process.env.GEMINI_API_KEY ? "gemini" : "AI_SERVICE_URL";
  if (!configured) return Response.json({ ok: false, configured, model: MODEL, reason: aiErrorReason(new Error("GEMINI_API_KEY")) }, { status: 503 });
  const t0 = Date.now();
  try {
    const sample = await new Response(streamText({ contents: "Respondé solo: ok" })).text();
    return Response.json({ ok: true, configured, via, model: MODEL, latencyMs: Date.now() - t0, sample: sample.slice(0, 20) });
  } catch (error) {
    console.error("[ai-status]", error);
    return Response.json({ ok: false, configured, via, model: MODEL, latencyMs: Date.now() - t0, reason: aiErrorReason(error) }, { status: 503 });
  }
}
