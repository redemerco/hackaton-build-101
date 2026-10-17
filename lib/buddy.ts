import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_TINT } from "@/lib/tints";
import { isBuddyId } from "@/lib/daemon";
import { findLook, getLook, type Look } from "@/lib/profiles";
import { getCurrentUser } from "@/lib/users";

// Antes el personaje vivía en esta cookie; se respeta hasta que la persona elija de nuevo (y quede en la DB).
const LEGACY_BUDDY_COOKIE = "b101_buddy";

/** Personaje y color del usuario actual (persistidos en la DB, tabla profiles). */
export async function getCurrentLook(): Promise<Look> {
  const { id } = await getCurrentUser();
  const saved = findLook(id);
  if (saved) return saved;
  const legacy = (await cookies()).get(LEGACY_BUDDY_COOKIE)?.value;
  return isBuddyId(legacy) ? { buddy: legacy, tint: DEFAULT_TINT } : getLook(id);
}

/** Solo el personaje del usuario actual (para las pantallas que no necesitan el color). */
export async function getBuddy(): Promise<Look["buddy"]> {
  return (await getCurrentLook()).buddy;
}
