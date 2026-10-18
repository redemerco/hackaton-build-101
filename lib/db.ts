import "server-only";
import { createDb } from "@/lib/db-core";

// Singleton en globalThis para que el HMR de dev no abra una conexión por recarga.
const g = globalThis as unknown as { __db?: ReturnType<typeof createDb> };
const instance = (g.__db ??= createDb("data/pulso.db"));

export const db = instance.db;
export const insertRawEvents = instance.insertRawEvents;
export { rawEvents, pushSubscriptions, agentRuns } from "@/lib/db-core";
export type { RawEventInput } from "@/lib/db-core";
