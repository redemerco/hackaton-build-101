import "server-only";
import { eq, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";
import { DEFAULT_BUDDY, isBuddyId, type BuddyId } from "@/lib/daemon";
import { DEFAULT_TINT, isTintId, type TintId } from "@/lib/tints";

// El compañero de cada usuario (personaje + color). En la DB y no en una cookie: lo ven los demás en el ranking.
export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  buddy: text("buddy").notNull(),
  tint: text("tint").notNull(),
  // opt-in del ranking del equipo: sin esto, tu puntaje no lo ve nadie
  shareScore: integer("share_score", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull(),
});

// ponytail: tabla creada a mano igual que connections, sin drizzle-kit.
db.run(sql`CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  buddy TEXT NOT NULL,
  tint TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);
// La tabla ya existe en el NAS sin esta columna: se agrega una sola vez, solo si falta.
const profileColumns = db.all<{ name: string }>(sql`PRAGMA table_info(profiles)`);
if (!profileColumns.some((c) => c.name === "share_score")) {
  try {
    db.run(sql`ALTER TABLE profiles ADD COLUMN share_score INTEGER NOT NULL DEFAULT 0`);
  } catch (error) {
    // otro proceso (build o worker) la agregó entre el PRAGMA y el ALTER: alcanza con que exista
    if (!db.all<{ name: string }>(sql`PRAGMA table_info(profiles)`).some((c) => c.name === "share_score")) throw error;
  }
}

export type Look = { buddy: BuddyId; tint: TintId; shareScore: boolean };

/** Lo que eligió el usuario, o null si nunca eligió. */
export function findLook(userId: string): Look | null {
  const row = db.select().from(profiles).where(eq(profiles.userId, userId)).get();
  if (!row) return null;
  return {
    buddy: isBuddyId(row.buddy) ? row.buddy : DEFAULT_BUDDY,
    tint: isTintId(row.tint) ? row.tint : DEFAULT_TINT,
    shareScore: Boolean(row.shareScore),
  };
}

/** Personaje y color del usuario, validados; si no eligió nada, el daemon original (y sin compartir puntaje). */
export function getLook(userId: string): Look {
  return findLook(userId) ?? { buddy: DEFAULT_BUDDY, tint: DEFAULT_TINT, shareScore: false };
}

export function saveLook(userId: string, patch: Partial<Look>): Look {
  const next = { ...getLook(userId), ...patch };
  const row = { userId, buddy: next.buddy, tint: next.tint, shareScore: next.shareScore, updatedAt: new Date().toISOString() };
  db.insert(profiles).values(row).onConflictDoUpdate({ target: profiles.userId, set: row }).run();
  return next;
}
