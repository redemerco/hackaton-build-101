// Configuración no secreta, toda por env. En el NAS la pone el manifiesto de svc de PiWS
// (servicios/svc/manifests/pulso.json); en local, .env.local (ver .env.example).
// Los defaults son SOLO constantes de terceros (endpoints de Google) y tiempos razonables;
// lo propio (dominio, IDs de proyecto) no tiene default: ver requireEnv.
// Sin server-only ni alias "@/": lo importa también scripts/test-health-signature.mts.

/** Entero positivo de env; si falta o no es un número válido, `fallback`. */
export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`[config] ${name}=${raw} no es un número válido`);
  return n;
}

export function envStr(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw == null || raw.trim() === "" ? fallback : raw.trim();
}

/** Variable obligatoria: tira un error claro si falta. */
export function requireEnv(name: string, hint = ""): string {
  const raw = process.env[name]?.trim();
  if (!raw) throw new Error(`[config] falta ${name}${hint ? ` (${hint})` : ""}`);
  return raw;
}

// --- Google Health -----------------------------------------------------------------------
/** Base de la API de Google Health (sin barra final). */
export const healthApiBase = () => envStr("HEALTH_API_BASE", "https://health.googleapis.com/v4").replace(/\/+$/, "");
/** Keyset público (Tink) con el que Google firma los webhooks. */
export const healthKeysetUrl = () =>
  envStr("HEALTH_KEYSET_URL", "https://www.gstatic.com/googlehealthapi/webhooks/webhooks_public_keyset.json");
/** Cuánto vive el keyset en caché (las claves rotan cada 30 días). */
export const healthKeysetTtlMs = () => envInt("HEALTH_KEYSET_TTL_MS", 6 * 3600_000);
/** Debounce por usuario entre el aviso del webhook y el sync. */
export const healthWebhookDebounceMs = () => envInt("HEALTH_WEBHOOK_DEBOUNCE_MS", 60_000);
/** Un sueño cuenta como "nuevo" (y dispara push) si la noche más reciente es de menos de esto. */
export const healthSleepFreshMs = () => envInt("HEALTH_SLEEP_FRESH_MS", 36 * 3600_000);

// --- SSE /api/events ---------------------------------------------------------------------
/** `retry:` que le mandamos al EventSource para reconectar. */
export const sseRetryMs = () => envInt("SSE_RETRY_MS", 5_000);
/** Comentario SSE periódico: cloudflared corta conexiones ociosas. */
export const sseHeartbeatMs = () => envInt("SSE_HEARTBEAT_MS", 25_000);
