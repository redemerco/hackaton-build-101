"use server";

import { revalidatePath } from "next/cache";
import { insertRawEvents } from "@/lib/db";
import { getCurrentUser } from "@/lib/users";

const MIN_MOOD = 1;
const MAX_MOOD = 5;

/** Check-in de ánimo de un toque → raw_events (source "mood", kind "checkin"). */
export async function saveMood(mood: number): Promise<void> {
  if (!Number.isInteger(mood) || mood < MIN_MOOD || mood > MAX_MOOD) {
    throw new Error(`Ánimo inválido: ${mood}`);
  }
  const user = await getCurrentUser();
  insertRawEvents([{ source: "mood", kind: "checkin", userId: user.id, ts: new Date().toISOString(), data: { mood } }]);
  revalidatePath("/");
}
