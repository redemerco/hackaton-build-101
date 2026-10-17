// Tipos compartidos de usuario (sin server-only: lo importan componentes cliente).
// Ya NO hay usuarios hardcodeados: cada usuario es quien se logueó con Google (ver lib/users.ts).

export type UserId = string;

export type User = {
  id: UserId;        // el `sub` de Google (identificador estable de la cuenta)
  name: string;      // nombre o email para mostrar
  email: string;
  hasWearable: boolean; // si tiene datos de Fitbit/Health
};

export const USER_COOKIE = "pulso_user";

// Un id de usuario es cualquier string no vacío (el sub de Google).
export function isUserId(v: unknown): v is UserId {
  return typeof v === "string" && v.length > 0;
}
