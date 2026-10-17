import "server-only";
import { cookies } from "next/headers";
import { USERS, USER_COOKIE, isUserId, type User } from "@/lib/user-list";

export { USERS, USER_COOKIE, isUserId };
export type { User, UserId } from "@/lib/user-list";

export async function getCurrentUser(): Promise<User> {
  const value = (await cookies()).get(USER_COOKIE)?.value;
  return USERS.find((u) => u.id === value) ?? USERS[0];
}
