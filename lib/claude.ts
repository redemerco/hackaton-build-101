import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-5-5";

let client: Anthropic | undefined;

// Lazy: el build no falla si falta la key; el error aparece recién al usarlo.
export function getClaude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Falta ANTHROPIC_API_KEY en .env.local");
  }
  return (client ??= new Anthropic());
}

export type StreamTextParams = Omit<Anthropic.Beta.MessageCreateParamsStreaming, "model" | "stream" | "max_tokens"> & {
  model?: string;
  max_tokens?: number;
};

/**
 * Stream de texto plano UTF-8, listo para `return new Response(streamText({...}))` en un route handler.
 * Con `fallbacks: "default"`: si el clasificador de seguridad rechaza, el server reintenta en otro modelo.
 */
export function streamText({ model = MODEL, max_tokens = 64000, ...params }: StreamTextParams): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        const stream = getClaude().beta.messages.stream({
          ...params,
          model,
          max_tokens,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n[Claude no pudo responder esto.]"));
        }
        controller.close();
      } catch (error) {
        console.error("[claude] streamText falló", error);
        controller.error(error);
      }
    },
  });
}
