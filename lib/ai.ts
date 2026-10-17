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
      const res = await getAI().models.generateContent({ ...params, model, config: { ...config, responseMimeType: "application/json" } });
      return JSON.parse((res.text ?? "").trim()) as T;
    } catch (error) {
      if (!isTransient(error) || i === RETRIES - 1) throw error;
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** i));
    }
  }
}
