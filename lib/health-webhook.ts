import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getConnection } from "@/lib/connections";
import { freshToken } from "@/lib/oauth";
import { sendPush } from "@/lib/push";
import { syncGoogleUser } from "@/lib/sources/google";
import { emitUserEvent } from "@/lib/live-events";
import { healthApiBase, healthSleepFreshMs, healthWebhookDebounceMs } from "@/lib/config";

// Webhook de Google Health → sync del usuario → aviso a la PWA (SSE si está abierta, push si llegó un sueño nuevo).

// --- healthUserId ↔ usuario ---------------------------------------------------------------
// Columna extra en connections (solo la usa la fila google). ponytail: ALTER idempotente a mano,
// sin tocar el schema drizzle de lib/connections.ts: saveConnection no la pisa al renovar el token.
const hasColumn = (db.all(sql`PRAGMA table_info(connections)`) as { name: string }[]).some((c) => c.name === "health_user_id");
if (!hasColumn) db.run(sql`ALTER TABLE connections ADD COLUMN health_user_id TEXT`);

/** Pide `users/me/identity` con el token google del usuario y guarda su healthUserId. Alcanzan los scopes readonly de Health. */
export async function resolveHealthUserId(userId: string): Promise<string | null> {
  const conn = getConnection(userId, "google");
  if (!conn) return null;
  const token = await freshToken(conn);
  const res = await fetch(`${healthApiBase()}/users/me/identity`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`identity ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { healthUserId } = (await res.json()) as { healthUserId?: string };
  if (!healthUserId) return null;
  db.run(sql`UPDATE connections SET health_user_id = ${healthUserId} WHERE user_id = ${userId} AND provider = 'google'`);
  return healthUserId;
}

function userForHealthId(healthUserId: string): string | null {
  const row = db.get<{ user_id: string }>(
    sql`SELECT user_id FROM connections WHERE provider = 'google' AND health_user_id = ${healthUserId}`,
  );
  return row?.user_id ?? null;
}

// Backfill perezoso: conexiones google anteriores a esta feature no tienen health_user_id.
// Como mucho una pasada cada 5 min, para que un healthUserId ajeno no nos haga martillar /identity.
let lastBackfill = 0;
async function backfillHealthIds(): Promise<void> {
  if (Date.now() - lastBackfill < 5 * 60_000) return;
  lastBackfill = Date.now();
  const missing = db.all<{ user_id: string }>(
    sql`SELECT user_id FROM connections WHERE provider = 'google' AND health_user_id IS NULL`,
  );
  for (const { user_id } of missing) {
    await resolveHealthUserId(user_id).catch((error) => console.error(`[webhook/health] identity ${user_id}`, error));
  }
}

// --- notificaciones --------------------------------------------------------------------------
export type HealthNotification = { healthUserId?: string; dataType?: string; operation?: string };

/** El body puede ser un objeto suelto o un array de hasta 99 (lotes de varios usuarios y tipos). */
export function parseNotifications(body: unknown): HealthNotification[] {
  const items = Array.isArray(body) ? body : [body];
  return items
    .map((it) => ((it as { data?: unknown })?.data ?? it) as HealthNotification)
    .filter((n) => n && typeof n === "object");
}

// Debounce por usuario: el primer aviso agenda un sync a DEBOUNCE_MS; los que llegan mientras tanto
// (lotes, reintentos duplicados de Google) se suman a ese mismo sync. Estado en globalThis (un proceso PM2).
const DEBOUNCE_MS = healthWebhookDebounceMs();
type Pending = { timer: ReturnType<typeof setTimeout>; sleepUpsert: boolean; types: Set<string> };
const g = globalThis as unknown as { __healthWebhook?: { pending: Map<string, Pending>; running: Set<string> } };
const state = (g.__healthWebhook ??= { pending: new Map(), running: new Set() });

function schedule(userId: string, n: HealthNotification): void {
  let p = state.pending.get(userId);
  if (!p) {
    p = { timer: setTimeout(() => void fire(userId), DEBOUNCE_MS), sleepUpsert: false, types: new Set() };
    state.pending.set(userId, p);
  }
  if (n.dataType) p.types.add(n.dataType);
  if (n.dataType === "sleep" && n.operation === "UPSERT") p.sleepUpsert = true;
}

const sleepStats = (userId: string) =>
  db.get<{ n: number; last: string | null }>(
    sql`SELECT count(*) AS n, max(ts) AS last FROM raw_events WHERE user_id = ${userId} AND source = 'google' AND kind = 'sleep'`,
  ) ?? { n: 0, last: null };

async function fire(userId: string): Promise<void> {
  const p = state.pending.get(userId);
  if (!p) return;
  if (state.running.has(userId)) {
    // Hay un sync en curso para este usuario: reintentamos cuando termine (no dos syncs en paralelo).
    p.timer = setTimeout(() => void fire(userId), 5_000);
    return;
  }
  state.pending.delete(userId);
  state.running.add(userId);
  try {
    const before = sleepStats(userId);
    const inserted = await syncGoogleUser(userId);
    const after = sleepStats(userId);
    console.log(`[webhook/health] sync user=${userId} types=${[...p.types].join(",")} inserted=${inserted}`);
    if (inserted > 0) emitUserEvent(userId, { type: "health-updated", at: new Date().toISOString(), inserted });

    // Push SOLO por un sueño nuevo (no por cada lote): aviso de sleep UPSERT + filas de sueño nuevas,
    // y que la noche más reciente sea nueva y de las últimas HEALTH_SLEEP_FRESH_MS (36 h por defecto) (un backfill de noches viejas no avisa).
    const newestIsNew = after.last && after.last !== before.last && Date.now() - Date.parse(after.last) < healthSleepFreshMs();
    if (p.sleepUpsert && after.n > before.n && newestIsNew) {
      await sendPush(userId, { title: "build101", body: "Llegó tu sueño de anoche", url: "/salud" })
        .then((r) => console.log(`[webhook/health] push sueño user=${userId} sent=${r.sent}`))
        .catch((error) => console.error(`[webhook/health] push sueño user=${userId}`, error));
    }
  } catch (error) {
    console.error(`[webhook/health] sync user=${userId}`, error);
  } finally {
    state.running.delete(userId);
  }
}

/** Procesa un lote ya autenticado y firmado (corre después de responder 204). Nunca tira. */
export async function handleNotifications(items: HealthNotification[]): Promise<void> {
  for (const n of items) {
    try {
      if (!n.healthUserId) continue;
      if (n.dataType === "user-deleted" || n.dataType === "user-revoked-access") {
        console.log(`[webhook/health] ${n.dataType} health=${n.healthUserId}`);
        continue;
      }
      let userId = userForHealthId(n.healthUserId);
      if (!userId) {
        await backfillHealthIds();
        userId = userForHealthId(n.healthUserId);
      }
      if (!userId) {
        console.warn(`[webhook/health] healthUserId desconocido ${n.healthUserId}`);
        continue;
      }
      schedule(userId, n);
    } catch (error) {
      console.error("[webhook/health] notificación", error);
    }
  }
}

