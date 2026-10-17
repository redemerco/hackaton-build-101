"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { USER_COOKIE, isUserId } from "@/lib/user-list";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setCurrentUser(id: string): Promise<void> {
  if (!isUserId(id)) throw new Error(`Usuario desconocido: ${id}`);
  (await cookies()).set(USER_COOKIE, id, { maxAge: ONE_YEAR_SECONDS, sameSite: "lax" });
  revalidatePath("/", "layout");
}

/** Cierra la sesión en este navegador: borra la cookie del usuario y vuelve al login. Las conexiones quedan en la DB. */
export async function logout(): Promise<void> {
  (await cookies()).delete(USER_COOKIE);
  revalidatePath("/", "layout");
  redirect("/");
}
