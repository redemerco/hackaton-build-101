import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";

// Tokens OAuth por usuario (GitHub, Linear, Slack). Van aparte de raw_events: el digest lee todo raw_events y un token no debe llegar nunca al prompt.
export const connections = sqliteTable(
  "connections",
  {
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(), // "github" | "linear" | "slack"
    account: text("account").notNull(), // login o email de la cuenta conectada, para mostrar
    token: text("token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: text("expires_at"), // ISO; null = no vence
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })],
);

// ponytail: tabla creada a mano igual que en db-core, sin drizzle-kit.
db.run(sql`CREATE TABLE IF NOT EXISTS connections (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  account TEXT NOT NULL,
  token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, provider)
)`);

export type Provider = "github" | "linear" | "slack" | "google" | "calendar";
export type Connection = typeof connections.$inferSelect;

export function saveConnection(c: Omit<Connection, "createdAt">) {
  const row = { ...c, createdAt: new Date().toISOString() };
  db.insert(connections)
    .values(row)
    .onConflictDoUpdate({ target: [connections.userId, connections.provider], set: row })
    .run();
}

export function getConnection(userId: string, provider: Provider): Connection | undefined {
  return db
    .select()
    .from(connections)
    .where(and(eq(connections.userId, userId), eq(connections.provider, provider)))
    .get();
}

export function listConnections(provider: Provider): Connection[] {
  return db.select().from(connections).where(eq(connections.provider, provider)).all();
}

/** Para la UI de Ajustes: qué tiene conectado el usuario, sin tokens. */
export function getConnectionStatus(userId: string): Record<Exclude<Provider, "google">, string | null> {
  return {
    github: getConnection(userId, "github")?.account ?? null,
    linear: getConnection(userId, "linear")?.account ?? null,
    slack: getConnection(userId, "slack")?.account ?? null,
    calendar: getConnection(userId, "calendar")?.account ?? null,
  };
}

export function deleteConnection(userId: string, provider: Provider) {
  db.delete(connections)
    .where(and(eq(connections.userId, userId), eq(connections.provider, provider)))
    .run();
}
