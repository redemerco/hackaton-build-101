import { getAI, MODEL } from "@/lib/ai";
import { DIGEST_SYSTEM } from "@/lib/digest";

export const maxDuration = 30;

// POST /api/ingesta/procesar
// Servicio de IA: recibe eventos (JSON) + un system prompt opcional, devuelve un digest.
// Body: { events: unknown[] | object, systemPrompt?: string, instruction?: string }
// Respuesta: { digest: string, model: string, count?: number }
//
// Pensado para que otro servicio/agente mande su propio set de eventos y su prompt,
// sin depender de la DB (a diferencia de /api/digest, que lee los raw_events del user actual).
type Body = {
  events?: unknown;
  systemPrompt?: string;
  instruction?: string;
};

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Body inválido: se espera JSON" }, 400);
  }

  if (body.events === undefined || body.events === null) {
    return json({ error: "Falta 'events' en el body" }, 400);
  }

  const system = (body.systemPrompt && body.systemPrompt.trim()) || DIGEST_SYSTEM;
  const instruction = (body.instruction && body.instruction.trim()) || "Generá el digest a partir de estos eventos:";
  const eventsText = typeof body.events === "string" ? body.events : JSON.stringify(body.events, null, 0);
  const count = Array.isArray(body.events) ? body.events.length : undefined;

  try {
    const digest = await generateWithRetry(system, `${instruction}\n\n${eventsText}`);
    return json({ digest: digest.trim(), model: MODEL, count }, 200);
  } catch (error) {
    console.error("[ingesta/procesar]", error);
    return json({ error: "No se pudo generar el digest" }, 502);
  }
}

// Reintenta ante picos transitorios de Gemini (503 / 429). Backoff corto.
async function generateWithRetry(system: string, userText: string, tries = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await getAI().models.generateContent({
        model: MODEL,
        config: { systemInstruction: system },
        contents: [{ role: "user", parts: [{ text: userText }] }],
      });
      return res.text ?? "";
    } catch (e) {
      lastErr = e;
      const msg = String(e);
      if (!(msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("429")) || i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
