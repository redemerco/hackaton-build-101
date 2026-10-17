// Sin server-only: lo importan también componentes cliente (switcher).
export const USERS = [
  { id: "santi", name: "Santi", hasWearable: true },
  { id: "renzo", name: "Renzo", hasWearable: false },
  { id: "joaco", name: "Joaco", hasWearable: false },
] as const;

export type User = (typeof USERS)[number];
export type UserId = User["id"];

export const USER_COOKIE = "pulso_user";

export function isUserId(v: unknown): v is UserId {
  return USERS.some((u) => u.id === v);
}
