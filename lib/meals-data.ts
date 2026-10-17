import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, rawEvents } from "@/lib/db";
import type { MealEntry } from "@/lib/meals";

const TZ = "America/Argentina/Buenos_Aires";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const hhmm = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Comidas reales guardadas hoy (raw_events source "meal"); vacío si no hay ninguna. */
export function getMealsToday(userId: string, now = new Date()): MealEntry[] {
  const today = dayKey.format(now);
  const rows = db
    .select({ ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "meal"), gte(rawEvents.ts, new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString())))
    .orderBy(desc(rawEvents.ts))
    .all()
    .filter((r) => dayKey.format(new Date(r.ts)) === today);

  return rows
    .map((r): MealEntry | null => {
      try {
        const d = JSON.parse(r.json) as { title?: string; kcal?: [number, number] };
        if (!d.title || !Array.isArray(d.kcal)) return null;
        return { time: hhmm.format(new Date(r.ts)), title: d.title, kcal: [d.kcal[0], d.kcal[1]] };
      } catch {
        return null;
      }
    })
    .filter((m): m is MealEntry => m !== null);
}
