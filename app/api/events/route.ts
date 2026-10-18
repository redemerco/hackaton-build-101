import { getConnection } from "@/lib/connections";
import { onUserEvent } from "@/lib/live-events";
import { getCurrentUser } from "@/lib/users";
import { sseHeartbeatMs, sseRetryMs } from "@/lib/config";

// GET /api/events → SSE del usuario logueado (cookie). Hoy un solo evento: `health-updated`
// (lo emite el webhook de Google Health después de sincronizar). Lo consume components/live-refresh.tsx.
// Bus en memoria (lib/live-events.ts): vale porque hay un solo proceso PM2.
export const dynamic = "force-dynamic";

// cloudflared corta conexiones ociosas: un comentario SSE cada SSE_HEARTBEAT_MS (25 s) la mantiene viva

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!getConnection(user.id, "google")) return new Response(null, { status: 401 });

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          cleanup();
        }
      };
      send(`retry: ${sseRetryMs()}\n: conectado\n\n`);
      const off = onUserEvent(user.id, (e) => send(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
      const beat = setInterval(() => send(": ping\n\n"), sseHeartbeatMs());
      cleanup = () => {
        off();
        clearInterval(beat);
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
