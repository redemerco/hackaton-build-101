"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { BUDDY_COOKIE } from "@/lib/buddy";
import { isBuddyId } from "@/lib/daemon";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setBuddy(id: string): Promise<void> {
  if (!isBuddyId(id)) throw new Error(`Compañero desconocido: ${id}`);
  (await cookies()).set(BUDDY_COOKIE, id, { maxAge: ONE_YEAR_SECONDS, sameSite: "lax" });
  revalidatePath("/", "layout");
}
