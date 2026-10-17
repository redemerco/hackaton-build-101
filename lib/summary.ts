import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { streamText } from "@/lib/ai";
import { db, insertRawEvents, rawEvents } from "@/lib/db";

// Resúmenes daily con IA (Salud = Joaco, Trabajo = Renzo, Yo = Santi). Cada uno arma su prompt;
// esto los streamea, guarda el último que salió bien y lo re-tipea si la IA o el wifi se caen en vivo.

export type SummaryKind = "health" | "work" | "me";
/** "datos usados" que se muestran debajo del resumen: la comprobación sencilla de calidad de la IA. */
export type SummaryCount = { label: string; value: number };

export const CACHE_PREFIX = "[cache · IA no disponible] ";
const WORD_MS = 40;

export function getCachedSummary(userId: string, kind: SummaryKind): { text: string; ts: string } | null {
  const row = db
    .select()
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "summary"), eq(rawEvents.kind, kind)))
    .orderBy(desc(rawEvents.ts))
    .get();
  if (!row) return null;
  const text = (JSON.parse(row.json) as { text?: unknown }).text;
  return typeof text === "string" ? { text, ts: row.ts } : null;
}

function saveSummary(userId: string, kind: SummaryKind, text: string) {
  insertRawEvents([{ source: "summary", kind, userId, ts: new Date().toISOString(), data: { text } }]);
}

/** Response en streaming para un route handler: `return streamSummary({ userId, kind, system, prompt })`. */
export function streamSummary({ userId, kind, system, prompt }: { userId: string; kind: SummaryKind; system: string; prompt: string }): Response {
  const cached = getCachedSummary(userId, kind);
  const source = streamText({ contents: prompt, config: { systemInstruction: system } }).getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let text = "";

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await source.read();
        if (done) {
          if (text.trim()) saveSummary(userId, kind, text.trim());
          return controller.close();
        }
        text += decoder.decode(value, { stream: true });
        controller.enqueue(value);
      } catch (error) {
        // a mitad de camino o sin caché: que el cliente tipee su respaldo rotulado
        if (text || !cached) return controller.error(error);
        console.error(`[summary/${kind}] IA caída, re-tipeo el último resumen guardado`, error);
        controller.enqueue(encoder.encode(CACHE_PREFIX));
        for (const word of cached.text.split(/(?<=\s)/)) {
          controller.enqueue(encoder.encode(word));
          await new Promise((r) => setTimeout(r, WORD_MS));
        }
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
