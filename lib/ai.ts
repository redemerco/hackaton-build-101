import "server-only";
import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";

// Alias que Google mantiene apuntando al Flash vigente (tier gratis).
export const MODEL = "gemini-flash-latest";
const AI_TIMEOUT_MS = 30_000;

// Orden de caminos (ver abajo): PIWS_AI_URL+PIWS_AI_KEY → ai-service de PiWS; si no, GEMINI_API_KEY → Gemini
// directo; si no, AI_SERVICE_URL → /api/ingesta/procesar de un server con key.

let client: GoogleGenAI | undefined;

// Lazy: el build no falla si falta la key; el error aparece recién al usarlo.
export function getAI(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Falta GEMINI_API_KEY en .env.local");
  }
  // timeout: si la red o Gemini se cuelgan (en vez de fallar), cortamos y cae al respaldo rotulado; sin esto el spinner gira para siempre
  return (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: AI_TIMEOUT_MS } }));
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
        if (viaPiws()) {
          for await (const delta of piwsStream(params)) controller.enqueue(encoder.encode(delta));
          return controller.close();
        }
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
 * Pide un JSON (ai-service `extract`, o Gemini con `responseMimeType: application/json`) y lo parsea. Reintenta ante 503/429 con backoff.
 * Quien llama valida la forma: esto solo garantiza que es JSON.
 */
export async function generateJson<T>({ model = MODEL, config, ...params }: StreamTextParams): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      if (viaPiws()) return JSON.parse(stripFences(await piwsJson({ ...params, config }))) as T;
      if (viaService()) return JSON.parse(stripFences(await callService({ ...params, config }, true))) as T;
      const res = await getAI().models.generateContent({ ...params, model, config: { ...config, responseMimeType: "application/json" } });
      return JSON.parse((res.text ?? "").trim()) as T;
    } catch (error) {
      // ai-service ya hizo su fallback entre keys/proveedores: reintentar acá solo gastaría cupo
      if (viaPiws() || !isTransient(error) || i === RETRIES - 1) throw error;
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** i));
    }
  }
}

/**
 * Texto entero (sin stream) de un prompt: para quien necesita el string completo (ej. /api/ingesta/procesar).
 * `json: true` pide JSON. Va por ai-service o Gemini directo, nunca por AI_SERVICE_URL: procesar ES ese servicio
 * y se llamaría a sí mismo. Reintenta ante 503/429 como generateJson.
 */
export async function generateText({ model = MODEL, config, ...params }: StreamTextParams, json = false): Promise<string> {
  for (let i = 0; ; i++) {
    try {
      if (viaPiws()) return json ? await piwsJson({ ...params, config }) : await piwsText({ ...params, config });
      const res = await getAI().models.generateContent({ ...params, model, config: { ...config, ...(json && { responseMimeType: "application/json" }) } });
      return res.text ?? "";
    } catch (error) {
      // ai-service ya hizo su fallback entre keys/proveedores: reintentar acá solo gastaría cupo
      if (viaPiws() || !isTransient(error) || i === RETRIES - 1) throw error;
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** i));
    }
  }
}

// ── Camino principal: ai-service de PiWS ───────────────────────────────────────────────────────────────
// Con PIWS_AI_URL (base `.../v1`) + PIWS_AI_KEY, toda la IA va por ai-service del NAS: API compatible con OpenAI
// que enruta Gemini por un router que rota keys/modelos según cuota y cae a Groq. Le pasamos un alias
// (`fast` para texto, `extract` para JSON) y el router elige el modelo: el `model` de Gemini del llamador se ignora.
// Traducimos `contents`/`systemInstruction` de Gemini a `messages` OpenAI (imágenes → `image_url` data URL).
// Los errores salen como `[ai] ai-service <status>: …` para que isTransient y los [cache]/[ejemplo] sigan andando.
const viaPiws = () => !!process.env.PIWS_AI_URL && !!process.env.PIWS_AI_KEY;

type OAIPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type OAIMessage = { role: "system" | "user" | "assistant"; content: string | OAIPart[] };

/** Una Part de Gemini (o string) → parte OpenAI. */
function toPart(p: unknown): OAIPart | null {
  if (typeof p === "string") return { type: "text", text: p };
  if (!p || typeof p !== "object") return null;
  if ("inlineData" in p && p.inlineData) {
    const { mimeType, data } = p.inlineData as { mimeType?: string; data?: string };
    return { type: "image_url", image_url: { url: `data:${mimeType ?? "image/jpeg"};base64,${data ?? ""}` } };
  }
  if ("fileData" in p) throw new Error("[ai] ai-service no acepta fileData: mandá la imagen como inlineData");
  return "text" in p ? { type: "text", text: String(p.text ?? "") } : null;
}

/** Partes → content OpenAI: string si es todo texto (lo que esperan los modelos de texto), array si hay imágenes. */
function toContent(parts: unknown[]): string | OAIPart[] {
  const out = parts.map(toPart).filter((p): p is OAIPart => !!p);
  return out.every((p) => p.type === "text") ? out.map((p) => (p as { text: string }).text).join("\n") : out;
}

const isContent = (c: unknown): c is { role?: string; parts?: unknown[] } => !!c && typeof c === "object" && "parts" in c;

/** `contents` + `config.systemInstruction` de Gemini → `messages` OpenAI (system + user/assistant). */
function toMessages({ contents, config }: Omit<StreamTextParams, "model">): OAIMessage[] {
  const messages: OAIMessage[] = [];
  const system = plainText(config?.systemInstruction);
  if (system) messages.push({ role: "system", content: system });
  // contents: string | Part | Content | (Part | string)[] (= un solo turno user) | Content[] (varios turnos)
  const list: unknown[] = Array.isArray(contents) ? contents : [contents];
  if (list.length && list.every(isContent)) {
    for (const c of list) messages.push({ role: c.role === "model" ? "assistant" : "user", content: toContent(c.parts ?? []) });
  } else {
    messages.push({ role: "user", content: toContent(list.flatMap((c) => (isContent(c) ? c.parts ?? [] : [c]))) });
  }
  return messages;
}

/** Schema de Gemini (`type: "OBJECT"`…) → JSON Schema (`type: "object"`), que es lo que valida ai-service. */
function toJsonSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(toJsonSchema);
  if (!s || typeof s !== "object") return s;
  return Object.fromEntries(
    Object.entries(s).map(([k, v]) => [k, k === "type" && typeof v === "string" ? v.toLowerCase() : toJsonSchema(v)]),
  );
}

async function piwsFetch(body: Record<string, unknown>, timeoutMs: number): Promise<Response> {
  const res = await fetch(`${process.env.PIWS_AI_URL!.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PIWS_AI_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; type?: string } };
    throw new Error(`[ai] ai-service ${res.status}: ${data.error?.type ?? ""} ${data.error?.message ?? "respuesta inválida"}`.trim());
  }
  console.info(`[ai] ai-service ${String(body.model)} → ${res.headers.get("x-ai-provider") ?? "?"}${res.headers.get("x-ai-fallback") === "1" ? " (fallback)" : ""}`);
  return res;
}

async function piwsChat(body: Record<string, unknown>): Promise<string> {
  const data = (await (await piwsFetch(body, 45_000)).json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("[ai] ai-service: respuesta sin texto");
  return content;
}

const piwsText = (params: Omit<StreamTextParams, "model">) => piwsChat({ model: "fast", messages: toMessages(params) });

/** JSON por `extract`. Con responseJsonSchema/responseSchema va como json_schema: ai-service lo mete en el prompt y valida. */
function piwsJson(params: Omit<StreamTextParams, "model">): Promise<string> {
  const schema = params.config?.responseJsonSchema ?? (params.config?.responseSchema && toJsonSchema(params.config.responseSchema));
  return piwsChat({
    model: "extract",
    messages: toMessages(params),
    response_format: schema ? { type: "json_schema", json_schema: { name: "respuesta", schema } } : { type: "json_object" },
  });
}

/** SSE estilo OpenAI → deltas de texto. */
async function* piwsStream(params: Omit<StreamTextParams, "model">): AsyncGenerator<string> {
  const res = await piwsFetch({ model: "fast", messages: toMessages(params), stream: true }, 60_000);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    buf += decoder.decode(value, { stream: !done });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const delta = (JSON.parse(data) as { choices?: Array<{ delta?: { content?: unknown } }> }).choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield delta;
      } catch {
        /* línea SSE que no es JSON: se ignora */
      }
    }
    if (done) return;
  }
}

// ── Sin GEMINI_API_KEY: la IA va por el servicio expuesto ─────────────────────────────────────────────
// Si no hay key pero sí AI_SERVICE_URL (el POST /api/ingesta/procesar desplegado, que sí tiene la key),
// streamText y generateJson le mandan el system y el texto tal cual. Con key se llama a Gemini directo:
// así el server desplegado no se llama a sí mismo. Solo texto: las imágenes siguen necesitando la key.
/** ¿Hay IA? Por ai-service de PiWS, con key directa o vía AI_SERVICE_URL (solo texto). */
export const hasAI = () => viaPiws() || !!process.env.GEMINI_API_KEY || !!process.env.AI_SERVICE_URL;
const viaService = () => !viaPiws() && !process.env.GEMINI_API_KEY && !!process.env.AI_SERVICE_URL;

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

/** Motivo corto y sin secretos de una falla de Gemini (para logs, /api/ai-status y el 503). */
export function aiErrorReason(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (/GEMINI_API_KEY/.test(msg)) return "falta GEMINI_API_KEY en el servidor";
  if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|403/.test(msg)) return "la GEMINI_API_KEY es inválida o no tiene permiso";
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return "se agotó la cuota de Gemini (429)";
  if (/503|UNAVAILABLE|overloaded/i.test(msg)) return "Gemini está saturado (503), reintentá";
  if (/abort|timed? ?out|timeout/i.test(msg)) return "Gemini tardó demasiado (más de 30 s)";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/.test(msg)) return "el servidor no llega a Google (red/DNS)";
  return msg.slice(0, 160);
}
