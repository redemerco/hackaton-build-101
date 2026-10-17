import "server-only";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";
import { USER_COOKIE, isUserId, type User, type UserId } from "@/lib/user-list";

export { USER_COOKIE, isUserId };
export type { User, UserId };

// Usuarios dinámicos: cada fila es una cuenta que se logueó con Google. Sin hardcodeados.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),        // sub de Google
  email: text("email").notNull(),
  name: text("name").notNull(),
  hasWearable: integer("has_wearable", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

db.run(sql`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  has_wearable INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)`);

export function getUser(id: UserId): User | undefined {
  const row = db.select().from(users).where(eq(users.id, id)).get();
  return row ? { id: row.id, name: row.name, email: row.email, hasWearable: Boolean(row.hasWearable) } : undefined;
}

/** Crea o actualiza el usuario que acaba de loguearse con Google. Devuelve su id (sub). */
export function upsertUser(input: { id: string; email: string; name?: string; hasWearable?: boolean }): UserId {
  const existing = getUser(input.id);
  const row = {
    id: input.id,
    email: input.email,
    name: input.name ?? input.email,
    hasWearable: input.hasWearable ?? existing?.hasWearable ?? false,
    createdAt: existing ? (db.select().from(users).where(eq(users.id, input.id)).get()?.createdAt ?? new Date().toISOString()) : new Date().toISOString(),
  };
  db.insert(users).values(row).onConflictDoUpdate({ target: users.id, set: { email: row.email, name: row.name, hasWearable: row.hasWearable } }).run();
  return input.id;
}

export function setWearable(id: UserId, hasWearable: boolean) {
  db.update(users).set({ hasWearable }).where(eq(users.id, id)).run();
}

// Usuario actual = el logueado (cookie con su sub de Google). null si no hay sesión → el layout muestra el login.
export async function getCurrentUser(): Promise<User> {
  const value = (await cookies()).get(USER_COOKIE)?.value;
  if (value && isUserId(value)) {
    const u = getUser(value);
    if (u) return u;
  }
  // Sin sesión válida: usuario "invitado" vacío. El gate del layout no deja pasar sin conexión Google igual.
  return { id: value && isUserId(value) ? value : "guest", name: "Invitado", email: "", hasWearable: false };
}

/** Todos los usuarios (para rankings/equipo). */
export function allUsers(): User[] {
  return db.select().from(users).all().map((r) => ({ id: r.id, name: r.name, email: r.email, hasWearable: Boolean(r.hasWearable) }));
}
