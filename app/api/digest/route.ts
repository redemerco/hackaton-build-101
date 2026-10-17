import { streamText } from "@/lib/ai";
import { DIGEST_SYSTEM, buildDigestPrompt, getCachedDigest, saveDigest } from "@/lib/digest";
import { getCurrentUser } from "@/lib/users";

const WORD_MS = 45;

// POST /api/digest → digest en streaming (lo consume <StreamText src> de components/digest.tsx).
// Si la IA se cae antes de mandar algo, re-tipea el último digest real guardado; si no hay ninguno,
// responde error y el cliente tipea su respaldo de ejemplo.
export async function POST() {
  const user = await getCurrentUser();
  const cached = getCachedDigest(user.id);
  const source = streamText({
    contents: buildDigestPrompt(user.id),
    config: { systemInstruction: DIGEST_SYSTEM },
  }).getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let text = "";

  const body = new ReadableStream<Uint8Array>({
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
        if (text || !cached) return controller.error(error);
        console.error("[digest] IA caída, re-tipeo el último digest guardado", error);
        for (const word of cached.split(/(?<=\s)/)) {
          controller.enqueue(encoder.encode(word));
          await new Promise((r) => setTimeout(r, WORD_MS));
        }
        controller.close();
      }
    },
  });

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
