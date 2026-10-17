import { and, desc, eq } from "drizzle-orm";
import { streamText } from "@/lib/ai";
import { db, insertRawEvents, rawEvents } from "@/lib/db";
import { buildWorkPrompt } from "@/lib/summary-work";
import { getCurrentUser } from "@/lib/users";

const WORD_MS = 45;

// PLAN B: lib/summary.ts (streamSummary, Santi) todavía no está en main. Esto es el patrón de
// /api/digest con el caché del contrato (raw_events source "summary", kind "work", { text }).
// Cuando llegue, el POST pasa a ser una línea:
//   return new Response(streamSummary({ userId: user.id, kind: "work", ...buildWorkPrompt(user.id) }), { headers })
function getCachedWork(userId: string): string | null {
  const row = db
    .select()
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "summary"), eq(rawEvents.kind, "work")))
    .orderBy(desc(rawEvents.ts))
    .get();
  return row ? JSON.parse(row.json).text : null;
}

// GET /api/summary/work → { counts } (el pie "datos usados").
export async function GET() {
  const user = await getCurrentUser();
  return Response.json({ counts: buildWorkPrompt(user.id).counts });
}

// POST /api/summary/work → resumen daily de trabajo en streaming. Si la IA se cae antes del primer
// token, re-tipea el último resumen guardado; si no hay, error y el cliente tipea su [ejemplo].
export async function POST() {
  const user = await getCurrentUser();
  const { system, prompt } = buildWorkPrompt(user.id);
  const cached = getCachedWork(user.id);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let text = "";
  let source: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        // Lazy: sin GEMINI_API_KEY getAI() tira acá y cae al caché igual que un 503.
        source ??= streamText({ contents: prompt, config: { systemInstruction: system } }).getReader();
        const { done, value } = await source.read();
        if (done) {
          if (text.trim()) insertRawEvents([{ source: "summary", kind: "work", userId: user.id, ts: new Date().toISOString(), data: { text } }]);
          return controller.close();
        }
        text += decoder.decode(value, { stream: true });
        controller.enqueue(value);
      } catch (error) {
        if (text || !cached) return controller.error(error);
        console.error("[summary/work] IA caída, re-tipeo el último resumen guardado", error);
        controller.enqueue(encoder.encode("[cache · IA no disponible] "));
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
