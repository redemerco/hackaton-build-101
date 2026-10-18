"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const THROTTLE_MS = 5_000; // varios avisos seguidos → un solo refresh
const STALE_MS = 60_000; // al volver a la app después de >60 s, refresca igual
const MAX_BACKOFF_MS = 60_000;

/**
 * La PWA se actualiza sola: escucha `health-updated` por SSE (/api/events, app abierta) y por
 * postMessage del service worker (llegó un push), y hace router.refresh() con throttle.
 * Se monta una vez en el layout.
 */
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let last = Date.now();
    let trailing: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let es: EventSource | null = null;
    let backoff = 2_000;
    let stopped = false;

    const refresh = () => {
      const wait = THROTTLE_MS - (Date.now() - last);
      if (wait > 0) {
        trailing ??= setTimeout(() => {
          trailing = undefined;
          refresh();
        }, wait);
        return;
      }
      last = Date.now();
      router.refresh();
    };

    const connect = () => {
      if (stopped) return;
      es = new EventSource("/api/events");
      es.addEventListener("open", () => (backoff = 2_000));
      es.addEventListener("health-updated", refresh);
      es.addEventListener("error", () => {
        // EventSource reintenta solo; si quedó CLOSED (401, red caída al abrir) reconectamos con backoff.
        if (es?.readyState !== EventSource.CLOSED) return;
        es.close();
        es = null;
        clearTimeout(retry);
        retry = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      });
    };
    connect();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!es) {
        clearTimeout(retry);
        connect();
      }
      if (Date.now() - last > STALE_MS) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    const onSwMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === "health-updated") refresh();
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    navigator.serviceWorker?.startMessages(); // con addEventListener los mensajes quedan en cola hasta esto

    return () => {
      stopped = true;
      es?.close();
      clearTimeout(trailing);
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, [router]);

  return null;
}
