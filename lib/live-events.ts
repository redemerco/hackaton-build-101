import "server-only";
import { EventEmitter } from "node:events";

// Bus en memoria para avisar a las PWAs abiertas (SSE /api/events) que hay datos nuevos.
// ponytail: alcanza porque en el NAS corre UN solo proceso PM2; con varios procesos habría que
// pasar a algo compartido (Redis pub/sub, o polling de raw_events).
// En globalThis para que el webhook y /api/events compartan la instancia aunque Next los empaquete por separado.
export type LiveEvent = { type: "health-updated"; at: string; inserted?: number };

const g = globalThis as unknown as { __liveEvents?: EventEmitter };
const bus = (g.__liveEvents ??= new EventEmitter().setMaxListeners(0));

export function emitUserEvent(userId: string, event: LiveEvent): void {
  bus.emit(`user:${userId}`, event);
}

/** Se suscribe a los eventos del usuario; devuelve la función para desuscribirse. */
export function onUserEvent(userId: string, listener: (e: LiveEvent) => void): () => void {
  bus.on(`user:${userId}`, listener);
  return () => bus.off(`user:${userId}`, listener);
}
