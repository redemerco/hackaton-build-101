"use server";

import { revalidatePath } from "next/cache";
import { insertRawEvents } from "@/lib/db";
import { totalKcal, type MealItem } from "@/lib/meals";
import { getCurrentUser } from "@/lib/users";

const MAX_NAME = 60;
const MAX_ITEMS = 20;
const MAX_GRAMS = 5000;
const MAX_KCAL = 10000;

const isRange = (r: unknown, max: number): r is [number, number] =>
  Array.isArray(r) && r.length === 2 && r.every((n) => Number.isFinite(n) && n >= 0 && n <= max) && r[0] <= r[1];

/** Comida analizada y confirmada (ítems ya escalados por porción) → raw_events (source "meal", kind "photo"). */
export async function saveMeal(items: MealItem[], comment: string): Promise<void> {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) throw new Error("Comida sin ítems");
  for (const it of items) {
    if (typeof it.name !== "string" || !it.name.trim() || it.name.length > MAX_NAME) throw new Error(`Nombre inválido: ${it.name}`);
    if (!isRange(it.grams, MAX_GRAMS) || !isRange(it.kcal, MAX_KCAL)) throw new Error(`Rango inválido en ${it.name}`);
  }
  const user = await getCurrentUser();
  const clean = items.map(({ name, grams, kcal }) => ({ name: name.trim(), grams, kcal }));
  insertRawEvents([
    {
      source: "meal",
      kind: "photo",
      userId: user.id,
      ts: new Date().toISOString(),
      data: { items: clean, comment: String(comment).slice(0, 500), totalKcal: totalKcal(clean) },
    },
  ]);
  revalidatePath("/salud");
  revalidatePath("/");
}
