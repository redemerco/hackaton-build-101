import { generateText, MODEL } from "@/lib/ai";
import { DIGEST_SYSTEM } from "@/lib/digest";

export const maxDuration = 30;

// POST /api/ingesta/procesar
// Servicio de IA: recibe eventos (JSON) + un system prompt opcional, devuelve un digest.
// Body: { events: unknown[] | object, systemPrompt?: string, instruction?: string, raw?: boolean, json?: boolean }
//   raw: true → `events` (string) va tal cual, sin anteponer `instruction`; json: true → pide JSON a la IA.
//   Los usa lib/ai.ts cuando corre sin GEMINI_API_KEY (AI_SERVICE_URL apunta acá).
// Respuesta: { digest: string, model: string, count?: number }
//
// Pensado para que otro servicio/agente mande su propio set de eventos y su prompt,
// sin depender de la DB (a diferencia de /api/digest, que lee los raw_events del user actual).
type Body = {
  events?: unknown;
  systemPrompt?: string;
  instruction?: string;
  raw?: boolean;
  json?: boolean;
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
    // generateText va por ai-service o Gemini directo (nunca por AI_SERVICE_URL: no se llama a sí mismo)
    const digest = await generateText(
      { config: { systemInstruction: system }, contents: [{ role: "user", parts: [{ text: body.raw ? eventsText : `${instruction}\n\n${eventsText}` }] }] },
      body.json === true,
    );
    return json({ digest: digest.trim(), model: MODEL, count }, 200);
  } catch (error) {
    console.error("[ingesta/procesar]", error);
    return json({ error: "No se pudo generar el digest" }, 502);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
