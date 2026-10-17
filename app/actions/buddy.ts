"use server";

import { revalidatePath } from "next/cache";
import { isBuddyId } from "@/lib/daemon";
import { saveLook } from "@/lib/profiles";
import { isTintId } from "@/lib/tints";
import { getCurrentUser } from "@/lib/users";

export async function setBuddy(id: string): Promise<void> {
  if (!isBuddyId(id)) throw new Error(`Compañero desconocido: ${id}`);
  saveLook((await getCurrentUser()).id, { buddy: id });
  revalidatePath("/", "layout");
}

export async function setTint(id: string): Promise<void> {
  if (!isTintId(id)) throw new Error(`Color desconocido: ${id}`);
  saveLook((await getCurrentUser()).id, { tint: id });
  revalidatePath("/", "layout");
}
