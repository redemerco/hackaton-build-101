// Separado de lib/db.ts (sin server-only) para que scripts/smoke.ts lo pueda importar.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const rawEvents = sqliteTable(
  "raw_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    kind: text("kind").notNull(),
    userId: text("user_id").notNull(),
    ts: text("ts").notNull(), // ISO 8601 UTC
    json: text("json").notNull(), // JSON.stringify del payload crudo
  },
  (t) => [
    index("raw_events_user_source_ts").on(t.userId, t.source, t.ts),
    uniqueIndex("raw_events_dedupe").on(t.userId, t.source, t.kind, t.ts),
  ],
);

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  userId: text("user_id").notNull(),
  json: text("json").notNull(),
  createdAt: text("created_at").notNull(),
});

// ponytail: schema creado a mano con IF NOT EXISTS, sin drizzle-kit; migrar a drizzle-kit si el schema empieza a cambiar.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS raw_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  user_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS raw_events_user_source_ts ON raw_events (user_id, source, ts);
CREATE UNIQUE INDEX IF NOT EXISTS raw_events_dedupe ON raw_events (user_id, source, kind, ts);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export type RawEventInput = {
  source: string;
  kind: string;
  userId: string;
  ts: string;
  data: unknown;
};

export function createDb(file: string) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(SCHEMA);
  const db = drizzle(sqlite);

  // Idempotente: re-sincronizar la misma fuente no duplica filas. Devuelve cuántas entraron.
  function insertRawEvents(rows: RawEventInput[]): number {
    if (rows.length === 0) return 0;
    return db
      .insert(rawEvents)
      .values(
        rows.map((r) => ({
          source: r.source,
          kind: r.kind,
          userId: r.userId,
          ts: r.ts,
          json: JSON.stringify(r.data),
        })),
      )
      .onConflictDoNothing()
      .run().changes;
  }

  return { db, insertRawEvents };
}
