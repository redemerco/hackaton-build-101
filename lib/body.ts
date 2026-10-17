import type { SleepStage } from "@/lib/ascii";
import { db, rawEvents } from "@/lib/db";
import { and, desc, eq, gte } from "drizzle-orm";

export type Night = {
  start: string; // "23:48"
  end: string;
  startHour: number;
  stages: SleepStage[]; // una por cada 15 min
  hrNight: number[]; // bpm a lo largo de la noche
  restingBpm: number;
  restingTypical: [number, number]; // tu rango típico, no el de la población
  hrvMs: number;
  hrvTypical: [number, number];
  stepsByHour: number[]; // 08..19
  stageMinutes?: Record<SleepStage, number>; // minutos reales por etapa (del summary de Fitbit); si falta, se derivan de stages
  isExample: boolean;
};

// Ciclos de ~90 min: más profundo al principio de la noche, más REM al final.
function exampleStages(cols: number): SleepStage[] {
  return Array.from({ length: cols }, (_, i): SleepStage => {
    if (i === 0) return "awake";
    const pos = i % 6;
    const isEarly = i < cols / 2;
    if (pos === 2 || (pos === 3 && isEarly)) return "deep";
    if (pos === 5 || (pos === 4 && !isEarly)) return "rem";
    return "light";
  });
}

function exampleNight(): Night {
  const stages = exampleStages(29);
  return {
    start: "23:48",
    end: "07:00",
    startHour: 23,
    stages,
    hrNight: Array.from({ length: 34 }, (_, i) => 51 + (1 - Math.sin((Math.PI * i) / 33)) * 13 + Math.sin(i * 0.9) * 1.2),
    restingBpm: 58,
    restingTypical: [55, 62],
    hrvMs: 48,
    hrvTypical: [41, 52],
    stepsByHour: [120, 80, 60, 300, 1100, 640, 90, 70, 380, 1300, 210, 62],
    isExample: true,
  };
}

// Hora local del dato usando el offset que trae Google (ej. "-10800s" = UTC-3), no la del server.
function localHHMM(iso: string, offsetSec: number): string {
  const d = new Date(Date.parse(iso) + offsetSec * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// Mapea el type de una etapa de Google Health a nuestra escala.
function mapStage(raw: string): SleepStage {
  const s = raw.toUpperCase();
  if (s === "DEEP") return "deep";
  if (s === "REM") return "rem";
  if (s === "AWAKE" || s === "WAKE") return "awake";
  return "light"; // LIGHT / ASLEEP / UNKNOWN
}

// Arma una Night real desde el dataPoint de sueño de Google Health (forma: data.sleep.{interval,stages}).
function parseNight(data: Record<string, unknown>): Night | null {
  try {
    const sleep = (data.sleep ?? {}) as Record<string, unknown>;
    const interval = (sleep.interval ?? {}) as Record<string, string>;
    const start = interval.startTime;
    const end = interval.endTime;
    if (!start || !end) return null;

    const offSec = parseInt(interval.startUtcOffset ?? "0", 10) || 0;
    const stageList = (sleep.stages as Array<Record<string, string>>) ?? [];

    // Grilla de 15 min por etapa (cada columna de la UI = 15 min).
    const COL_MIN = 15;
    let stages: SleepStage[] = [];
    for (const st of stageList) {
      if (!st.startTime || !st.endTime) continue;
      const cols = Math.max(1, Math.round((Date.parse(st.endTime) - Date.parse(st.startTime)) / 60000 / COL_MIN));
      stages.push(...Array(cols).fill(mapStage(String(st.type ?? "LIGHT"))));
    }
    if (stages.length === 0) {
      const cols = Math.max(4, Math.round((Date.parse(end) - Date.parse(start)) / 60000 / COL_MIN));
      stages = exampleStages(cols);
    }

    // Minutos reales por etapa del summary de Fitbit (sin redondeo de la grilla).
    const summary = (sleep.summary ?? {}) as Record<string, unknown>;
    const ss = (summary.stagesSummary as Array<Record<string, string>>) ?? [];
    let stageMinutes: Record<SleepStage, number> | undefined;
    if (ss.length) {
      stageMinutes = { awake: 0, light: 0, deep: 0, rem: 0 };
      for (const row of ss) stageMinutes[mapStage(String(row.type))] += parseInt(row.minutes ?? "0", 10) || 0;
    }
    const base = exampleNight(); // HR/HRV/pasos de ejemplo (el dato de sueño no los trae junto)
    const startLocal = new Date(Date.parse(start) + offSec * 1000);
    return {
      ...base,
      start: localHHMM(start, offSec),
      end: localHHMM(end, parseInt(interval.endUtcOffset ?? String(offSec), 10) || offSec),
      startHour: startLocal.getUTCHours(),
      stages,
      stageMinutes,
      isExample: data._mock === true, // scripts/seed-demo.mts: se rotula como ejemplo
    };
  } catch {
    return null;
  }
}

// Lee la última noche real de raw_events (source "google", kind "sleep"); si no hay, usa el ejemplo rotulado.
export function getLastNight(userId?: string): Night {
  try {
    const where = userId
      ? and(eq(rawEvents.source, "google"), eq(rawEvents.kind, "sleep"), eq(rawEvents.userId, userId))
      : and(eq(rawEvents.source, "google"), eq(rawEvents.kind, "sleep"));
    const row = db.select().from(rawEvents).where(where).orderBy(desc(rawEvents.ts)).limit(1).get();
    if (row) {
      const parsed = parseNight(JSON.parse(row.json));
      if (parsed) return parsed;
    }
  } catch (error) {
    console.error("[body] getLastNight", error);
  }
  return exampleNight();
}

/** Minutos por etapa (cada etapa del array son 15 min). */
export function minutesByStage(stages: readonly SleepStage[]): Record<SleepStage, number> {
  const out: Record<SleepStage, number> = { awake: 0, rem: 0, light: 0, deep: 0 };
  stages.forEach((s) => { out[s] += 15; });
  return out;
}

const MEAL_TZ = "America/Montevideo";
const mealDay = new Intl.DateTimeFormat("en-CA", { timeZone: MEAL_TZ });
const mealTime = new Intl.DateTimeFormat("es-UY", { timeZone: MEAL_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Comidas guardadas hoy (raw_events source "meal", día local), en orden. Misma forma que MealEntry de lib/meals.ts. */
export function getMealsToday(userId: string): { time: string; title: string; kcal: [number, number] }[] {
  const today = mealDay.format(Date.now());
  return db
    .select({ ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "meal"), gte(rawEvents.ts, new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString())))
    .orderBy(rawEvents.ts)
    .all()
    .filter((r) => mealDay.format(Date.parse(r.ts)) === today)
    .map((r) => {
      const meal = JSON.parse(r.json) as { items?: { name: string }[]; totalKcal?: [number, number] };
      return {
        time: mealTime.format(Date.parse(r.ts)),
        title: (meal.items ?? []).map((it) => it.name).join(", "),
        kcal: meal.totalKcal ?? [0, 0],
      };
    });
}
