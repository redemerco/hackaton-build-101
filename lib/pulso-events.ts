// Eventos de Calendar que crea el propio agente de Pulso (foco, a dormir, entrenar, descanso): no son reuniones.
// Criterio ÚNICO para no contarlos como reuniones ni como carga. Sin server-only ni alias "@/": lo importan
// lib/agent-rules.ts, lib/hourly.ts y scripts/test-agent-rules.mts.

/** Id determinístico (`calendarEventId`), con sufijo opcional si se recreó tras un borrado. */
export const isPulsoEventId = (id: string | null | undefined) => typeof id === "string" && /^pulso[0-9a-f]{40}(r[0-9a-v]+)?$/.test(id);

/** Fila de raw_events (source "calendar"): la marca `pulso` la pone el sync (extendedProperties.private.pulso). */
export const isPulsoEvent = (e: { id?: unknown; pulso?: unknown } | null | undefined) =>
  !!e && (Boolean(e.pulso) || isPulsoEventId(typeof e.id === "string" ? e.id : null));

/** Lo mismo sobre el JSON crudo de raw_events. */
export function isPulsoEventJson(json: string): boolean {
  try {
    return isPulsoEvent(JSON.parse(json) as { id?: unknown; pulso?: unknown });
  } catch {
    return false;
  }
}
