import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_BUDDY, isBuddyId, type BuddyId } from "@/lib/daemon";

export const BUDDY_COOKIE = "b101_buddy";

/** El compañero que eligió esta persona (cookie), validado; si no hay o es inválido, el daemon. */
export async function getBuddy(): Promise<BuddyId> {
  const value = (await cookies()).get(BUDDY_COOKIE)?.value;
  return isBuddyId(value) ? value : DEFAULT_BUDDY;
}
