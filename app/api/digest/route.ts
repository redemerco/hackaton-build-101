import { aiErrorReason, hasAI, streamText } from "@/lib/ai";
import { DIGEST_SYSTEM, buildDigestPrompt, getCachedDigest, saveDigest } from "@/lib/digest";
import { getCurrentUser } from "@/lib/users";

const WORD_MS = 45;
const CACHE_PREFIX = "[cache · IA no disponible] ";
const TEXT = { "Content-Type": "text/plain; charset=utf-8" };

function replay(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(CACHE_PREFIX));
      for (const word of text.split(/(?<=\s)/)) {
        controller.enqueue(encoder.encode(word));
        await new Promise((r) => setTimeout(r, WORD_MS));
      }
      controller.close();
    },
  });
}

// POST /api/digest → digest en streaming (lo consume <StreamText src> de components/digest.tsx).
// Espera el primer pedazo de Gemini antes de responder: si la IA falla re-tipea el último digest guardado,
// o responde 503 con el motivo (el cliente tipea su respaldo). Nunca un 200 cortado (detrás del proxy = 502).
export async function POST() {
  const user = await getCurrentUser();
  const cached = getCachedDigest(user.id);
  const fail = (error: unknown) => {
    console.error("[digest] IA no disponible", error);
    return cached ? new Response(replay(cached), { headers: TEXT }) : new Response(`IA no disponible: ${aiErrorReason(error)}`, { status: 503, headers: TEXT });
  };
  if (!hasAI()) return fail(new Error("Falta GEMINI_API_KEY"));

  const source = streamText({ contents: buildDigestPrompt(user.id), config: { systemInstruction: DIGEST_SYSTEM } }).getReader();
  let first: ReadableStreamReadResult<Uint8Array>;
  try {
    first = await source.read();
  } catch (error) {
    return fail(error);
  }
  if (first.done) return fail(new Error("respuesta vacía"));
  const decoder = new TextDecoder();
  let text = decoder.decode(first.value, { stream: true });

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(first.value);
    },
    async pull(controller) {
      try {
        const { done, value } = await source.read();
        if (done) {
          if (text.trim()) saveDigest(user.id, text);
          return controller.close();
        }
        text += decoder.decode(value, { stream: true });
        controller.enqueue(value);
      } catch (error) {
        console.error("[digest] stream cortado a mitad", error);
        controller.close();
      }
    },
  });
  return new Response(body, { headers: TEXT });
}
