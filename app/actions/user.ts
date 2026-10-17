"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { USER_COOKIE, isUserId } from "@/lib/user-list";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setCurrentUser(id: string): Promise<void> {
  if (!isUserId(id)) throw new Error(`Usuario desconocido: ${id}`);
  (await cookies()).set(USER_COOKIE, id, { maxAge: ONE_YEAR_SECONDS, sameSite: "lax" });
  revalidatePath("/", "layout");
}
