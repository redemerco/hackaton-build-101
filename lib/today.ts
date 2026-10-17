import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { MascotMood } from "@/components/ascii/mascot";
import { db, rawEvents } from "@/lib/db";
import type { UserId } from "@/lib/users";

export type Today = {
  sleepMin: number;
  sleepWeek: number[]; // minutos, últimos 7 días (el último es anoche)
  restingBpm: number;
  hrvMs: number;
  mood: number | null; // 1..5, null = sin check-in hoy
  meetings: number;
  insight: string;
  isExample: boolean;
};

export { moodFace } from "@/lib/ascii";

/** Último check-in de ánimo de hoy (día local del server), o null. */
function todaysMood(userId: UserId): number | null {
  const row = db
    .select({ ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "mood")))
    .orderBy(desc(rawEvents.ts))
    .get();
  if (!row || new Date(row.ts).toDateString() !== new Date().toDateString()) return null;
  const mood = (JSON.parse(row.json) as { mood?: unknown }).mood;
  return typeof mood === "number" ? mood : null;
}

// ponytail: sueño y pulso de ejemplo hasta que Renzo ingeste google_health; el ánimo ya es real.
export function getToday(userId: UserId): Today {
  return {
    sleepMin: 432,
    sleepWeek: [402, 431, 352, 470, 410, 440, 432],
    restingBpm: 58,
    hrvMs: 48,
    mood: todaysMood(userId),
    meetings: 2,
    insight: "Los días con una sola reunión hiciste el doble de commits. Hoy tenés dos: buen día para cerrar un PR.",
    isExample: true,
  };
}

/** La cara de la mascota sale del sueño y de la carga de reuniones. */
export function mascotMood({ sleepMin, meetings }: Pick<Today, "sleepMin" | "meetings">): MascotMood {
  if (sleepMin < 300 || meetings >= 6) return "fried";
  if (sleepMin < 390) return "tired";
  if (sleepMin >= 450 && meetings === 0) return "streak";
  return "ok";
}

/** 0..1: cuánto "tiembla" el fondo. */
export function stressOf({ sleepMin, meetings }: Pick<Today, "sleepMin" | "meetings">): number {
  const sleepDebt = Math.max(0, Math.min(1, (450 - sleepMin) / 240));
  return Math.min(1, 0.15 + sleepDebt * 0.6 + Math.min(meetings, 8) * 0.04);
}

export function logLine(today: Pick<Today, "sleepMin" | "meetings">, sleepText: string): { tag: "ok" | "warn"; text: string } {
  const mood = mascotMood(today);
  if (mood === "fried") return { tag: "warn", text: `${sleepText} de sueño detectadas. desplegando café…` };
  if (mood === "tired") return { tag: "warn", text: `dormiste ${sleepText}. hoy, una tarea por vez.` };
  if (mood === "streak") return { tag: "ok", text: `${sleepText} dormido · 0 reuniones. modo bestia.` };
  return { tag: "ok", text: `dormiste ${sleepText}. hay hueco para foco hasta las 11.` };
}
