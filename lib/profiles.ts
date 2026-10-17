import "server-only";
import { eq, sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";
import { DEFAULT_BUDDY, isBuddyId, type BuddyId } from "@/lib/daemon";
import { DEFAULT_TINT, isTintId, type TintId } from "@/lib/tints";

// El compañero de cada usuario (personaje + color). En la DB y no en una cookie: lo ven los demás en el ranking.
export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  buddy: text("buddy").notNull(),
  tint: text("tint").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ponytail: tabla creada a mano igual que connections, sin drizzle-kit.
db.run(sql`CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  buddy TEXT NOT NULL,
  tint TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);

export type Look = { buddy: BuddyId; tint: TintId };

/** Lo que eligió el usuario, o null si nunca eligió. */
export function findLook(userId: string): Look | null {
  const row = db.select().from(profiles).where(eq(profiles.userId, userId)).get();
  if (!row) return null;
  return { buddy: isBuddyId(row.buddy) ? row.buddy : DEFAULT_BUDDY, tint: isTintId(row.tint) ? row.tint : DEFAULT_TINT };
}

/** Personaje y color del usuario, validados; si no eligió nada, el daemon original. */
export function getLook(userId: string): Look {
  return findLook(userId) ?? { buddy: DEFAULT_BUDDY, tint: DEFAULT_TINT };
}

export function saveLook(userId: string, patch: Partial<Look>): Look {
  const next = { ...getLook(userId), ...patch };
  const row = { userId, buddy: next.buddy, tint: next.tint, updatedAt: new Date().toISOString() };
  db.insert(profiles).values(row).onConflictDoUpdate({ target: profiles.userId, set: row }).run();
  return next;
}
