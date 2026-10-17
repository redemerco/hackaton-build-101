"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, pushSubscriptions, rawEvents } from "@/lib/db";
import { getCurrentUser } from "@/lib/users";

/** Borra todo lo del usuario actual (eventos y suscripciones push). Devuelve cuántos eventos borró. */
export async function deleteMyData(): Promise<number> {
  const user = await getCurrentUser();
  const { changes } = db.delete(rawEvents).where(eq(rawEvents.userId, user.id)).run();
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id)).run();
  revalidatePath("/", "layout");
  return changes;
}
