import "server-only";
import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";

// Alias que Google mantiene apuntando al Flash vigente (tier gratis).
export const MODEL = "gemini-flash-latest";

let client: GoogleGenAI | undefined;

// Lazy: el build no falla si falta la key; el error aparece recién al usarlo.
export function getAI(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Falta GEMINI_API_KEY en .env.local");
  }
  return (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}

export type StreamTextParams = Omit<GenerateContentParameters, "model"> & { model?: string };

/**
 * Stream de texto plano UTF-8, listo para `return new Response(streamText({...}))` en un route handler.
 * `contents` acepta texto o partes con imágenes (`{ inlineData: { mimeType, data } }`); el system prompt va en
 * `config.systemInstruction`.
 */
export function streamText({ model = MODEL, ...params }: StreamTextParams): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        if (viaService()) {
          // el servicio no streamea: el texto entero llega como un único chunk
          controller.enqueue(encoder.encode(await callService(params)));
          return controller.close();
        }
        const stream = await getAI().models.generateContentStream({ ...params, model });
        for await (const chunk of stream) {
          if (chunk.text) controller.enqueue(encoder.encode(chunk.text));
        }
        controller.close();
      } catch (error) {
        console.error("[ai] streamText falló", error);
        controller.error(error);
      }
    },
  });
}

const RETRIES = 3;
const RETRY_BASE_MS = 600;
const isTransient = (e: unknown) => /503|UNAVAILABLE|429/.test(e instanceof Error ? e.message : String(e));

/**
 * Pide un JSON a Gemini (`responseMimeType: application/json`) y lo parsea. Reintenta ante 503/429 con backoff.
 * Quien llama valida la forma: esto solo garantiza que es JSON.
 */
export async function generateJson<T>({ model = MODEL, config, ...params }: StreamTextParams): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      if (viaService()) return JSON.parse(stripFences(await callService({ ...params, config }, true))) as T;
      const res = await getAI().models.generateContent({ ...params, model, config: { ...config, responseMimeType: "application/json" } });
      return JSON.parse((res.text ?? "").trim()) as T;
    } catch (error) {
      if (!isTransient(error) || i === RETRIES - 1) throw error;
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** i));
    }
  }
}

// ── Sin GEMINI_API_KEY: la IA va por el servicio expuesto ─────────────────────────────────────────────
// Si no hay key pero sí AI_SERVICE_URL (el POST /api/ingesta/procesar desplegado, que sí tiene la key),
// streamText y generateJson le mandan el system y el texto tal cual. Con key se llama a Gemini directo:
// así el server desplegado no se llama a sí mismo. Solo texto: las imágenes siguen necesitando la key.
const viaService = () => !process.env.GEMINI_API_KEY && !!process.env.AI_SERVICE_URL;

/** Texto plano de `contents` / `systemInstruction` (string, Part, Content o arrays de eso). */
function plainText(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map(plainText).filter(Boolean).join("\n");
  if (!c || typeof c !== "object") return "";
  if ("inlineData" in c || "fileData" in c) throw new Error("[ai] AI_SERVICE_URL solo acepta texto: falta GEMINI_API_KEY para imágenes");
  if ("text" in c) return String(c.text ?? "");
  return "parts" in c ? plainText(c.parts) : "";
}

// Un server desplegado sin `json` puede devolver el JSON envuelto en ```json … ```.
const stripFences = (s: string) => s.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");

async function callService({ contents, config }: Omit<StreamTextParams, "model">, json = false): Promise<string> {
  const res = await fetch(process.env.AI_SERVICE_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      systemPrompt: plainText(config?.systemInstruction),
      events: plainText(contents),
      // raw/json: el texto va tal cual y pide JSON. Un procesar viejo los ignora y antepone `instruction`,
      // por eso es neutra.
      instruction: "Respondé según tus instrucciones con estos datos:",
      raw: true,
      json,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { digest?: unknown; error?: unknown };
  if (!res.ok || typeof data.digest !== "string") throw new Error(`[ai] servicio IA ${res.status}: ${String(data.error ?? "respuesta inválida")}`);
  return data.digest;
}
