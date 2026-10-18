// Candado de ejecución de las acciones del agente (tabla agent_runs). Sin server-only ni alias "@/":
// lo importa también scripts/test-agent-rules.mts con una DB en memoria.
import { and, eq, inArray, lt } from "drizzle-orm";
import { agentRuns, type createDb } from "./db-core.ts";

type Db = ReturnType<typeof createDb>["db"];
const STALE_MS = 2 * 60_000; // un "running" más viejo que esto quedó colgado (crash): se puede reintentar

export type Claim = { ok: true } | { ok: false; reason: "done" | "running"; message?: string | null; url?: string | null };

/** Toma la acción para ejecutarla. Atómico: dos Confirmar a la vez → uno solo gana (PK por action_id). */
export function claimRun(db: Db, userId: string, actionId: string, type: string, now = Date.now()): Claim {
  db.delete(agentRuns)
    .where(and(eq(agentRuns.actionId, actionId), eq(agentRuns.status, "running"), lt(agentRuns.createdAt, new Date(now - STALE_MS).toISOString())))
    .run();
  const inserted = db
    .insert(agentRuns)
    .values({ actionId, userId, type, status: "running", createdAt: new Date(now).toISOString() })
    .onConflictDoNothing()
    .run().changes;
  if (inserted === 1) return { ok: true };
  const row = db.select().from(agentRuns).where(eq(agentRuns.actionId, actionId)).get();
  return row?.status === "done" ? { ok: false, reason: "done", message: row.message, url: row.url } : { ok: false, reason: "running" };
}

/** Marca la acción como ejecutada (queda para siempre: no se puede volver a confirmar). */
export function finishRun(db: Db, actionId: string, r: { message: string; url?: string | null; eventId?: string | null }) {
  db.update(agentRuns).set({ status: "done", message: r.message, url: r.url ?? null, eventId: r.eventId ?? null }).where(eq(agentRuns.actionId, actionId)).run();
}

/** Suelta el candado sin marcarla (error o simulada): se puede volver a confirmar. */
export function releaseRun(db: Db, actionId: string) {
  db.delete(agentRuns).where(and(eq(agentRuns.actionId, actionId), eq(agentRuns.status, "running"))).run();
}

/** Las ya ejecutadas de una lista de ids, para que la UI las muestre como "hecho". */
export function doneRuns(db: Db, actionIds: string[]): Map<string, { message: string | null; url: string | null }> {
  if (actionIds.length === 0) return new Map();
  const rows = db.select().from(agentRuns).where(and(inArray(agentRuns.actionId, actionIds), eq(agentRuns.status, "done"))).all();
  return new Map(rows.map((r) => [r.actionId, { message: r.message, url: r.url }]));
}
