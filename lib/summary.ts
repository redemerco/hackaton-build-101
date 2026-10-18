import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { aiErrorReason, hasAI, streamText } from "@/lib/ai";
import { db, insertRawEvents, rawEvents } from "@/lib/db";

// Resúmenes daily con IA (Salud = Joaco, Trabajo = Renzo, Yo = Santi). Cada uno arma su prompt;
// esto los streamea, guarda el último que salió bien y lo re-tipea si la IA o el wifi se caen en vivo.

export type SummaryKind = "health" | "work" | "me";
/** "datos usados" que se muestran debajo del resumen: la comprobación sencilla de calidad de la IA. */
export type SummaryCount = { label: string; value: number };

export const CACHE_PREFIX = "[cache · IA no disponible] ";

const hashOf = (system: string, prompt: string) => createHash("sha256").update(system).update("\0").update(prompt).digest("hex").slice(0, 16);

export function getCachedSummary(userId: string, kind: SummaryKind): { text: string; ts: string; hash?: string } | null {
  const row = db
    .select()
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "summary"), eq(rawEvents.kind, kind)))
    .orderBy(desc(rawEvents.ts))
    .get();
  if (!row) return null;
  const { text, hash } = JSON.parse(row.json) as { text?: unknown; hash?: unknown };
  return typeof text === "string" ? { text, ts: row.ts, hash: typeof hash === "string" ? hash : undefined } : null;
}

function saveSummary(userId: string, kind: SummaryKind, text: string, hash: string) {
  insertRawEvents([{ source: "summary", kind, userId, ts: new Date().toISOString(), data: { text, hash } }]);
}

const REPLAY_MS = 12;

/** Re-tipea un texto guardado palabra por palabra. */
function replay(text: string, prefix = ""): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const words = text.split(/(?<=\s)/);
  return new ReadableStream({
    async start(controller) {
      if (prefix) controller.enqueue(encoder.encode(prefix));
      for (const w of words) {
        controller.enqueue(encoder.encode(w));
        await new Promise((r) => setTimeout(r, REPLAY_MS));
      }
      controller.close();
    },
  });
}

type StreamSummaryParams = { userId: string; kind: SummaryKind; system: string; prompt: string; force?: boolean };

/**
 * Response en streaming para un route handler: `return streamSummary({ userId, kind, system, prompt, force })`.
 * Si los datos (el prompt) no cambiaron desde el último resumen, lo reusa sin llamar a la IA: ahorra cuota en
 * vivo y da la misma respuesta para la misma entrada. `force` (botón ↻) siempre pide uno nuevo.
 */
export async function streamSummary({ userId, kind, system, prompt, force = false }: StreamSummaryParams): Promise<Response> {
  const headers = (mode: string) => ({ "Content-Type": "text/plain; charset=utf-8", "X-Summary": mode, "X-Summary-Hash": hash });
  const cached = getCachedSummary(userId, kind);
  const hash = hashOf(system, prompt);
  if (!force && cached?.hash === hash) return new Response(replay(cached.text), { headers: headers("reused") });

  const fallback = (error: unknown) => {
    console.error(`[summary/${kind}] IA no disponible`, error);
    // con algo guardado se re-tipea rotulado; sin nada, 503 limpio y el cliente tipea su respaldo [sin IA]
    return cached
      ? new Response(replay(cached.text, CACHE_PREFIX), { headers: headers("cache") })
      : new Response(`IA no disponible: ${aiErrorReason(error)}`, { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  };
  if (!hasAI()) return fallback(new Error("Falta GEMINI_API_KEY"));

  // Se espera el primer pedazo ANTES de responder: si Gemini falla, el status lo dice (503) en vez de
  // cortar una respuesta 200 a medias, que detrás del proxy del NAS se ve como 502.
  const source = streamText({ contents: prompt, config: { systemInstruction: system } }).getReader();
  let first: ReadableStreamReadResult<Uint8Array>;
  try {
    first = await source.read();
  } catch (error) {
    return fallback(error);
  }
  const decoder = new TextDecoder();
  let text = first.done ? "" : decoder.decode(first.value, { stream: true });
  if (first.done && !text) return fallback(new Error("respuesta vacía"));

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (!first.done) controller.enqueue(first.value);
    },
    async pull(controller) {
      try {
        const { done, value } = await source.read();
        if (done) {
          if (text.trim()) saveSummary(userId, kind, text.trim(), hash);
          return controller.close();
        }
        text += decoder.decode(value, { stream: true });
        controller.enqueue(value);
      } catch (error) {
        // a mitad de camino: se cierra con lo que llegó (no se guarda incompleto)
        console.error(`[summary/${kind}] stream cortado a mitad`, error);
        controller.close();
      }
    },
  });
  return new Response(body, { headers: headers("live") });
}
