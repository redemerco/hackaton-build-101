import type { SleepStage } from "@/lib/ascii";
import { db, rawEvents } from "@/lib/db";
import { and, desc, eq, gte } from "drizzle-orm";

export type Night = {
  start: string; // "23:48"
  end: string;
  startHour: number;
  stages: SleepStage[]; // una por cada 15 min
  hrNight: number[]; // bpm a lo largo de la noche (puede venir vacío: el dato de sueño no lo trae)
  restingBpm: number | null;
  restingTypical: [number, number] | null; // tu rango típico, no el de la población
  hrvMs: number | null;
  hrvTypical: [number, number] | null;
  stepsByHour: number[]; // 08..19 (puede venir vacío)
  stageMinutes?: Record<SleepStage, number>; // minutos reales por etapa (del summary de Fitbit); si falta, se derivan de stages
  isSimulated?: boolean; // noche de scripts/seed-demo.mts (_mock): se rotula [datos simulados]
};

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
    const stages: SleepStage[] = [];
    for (const st of stageList) {
      if (!st.startTime || !st.endTime) continue;
      const cols = Math.max(1, Math.round((Date.parse(st.endTime) - Date.parse(st.startTime)) / 60000 / COL_MIN));
      stages.push(...Array(cols).fill(mapStage(String(st.type ?? "LIGHT"))));
    }
    // Sin etapas no hay noche real que mostrar.
    if (stages.length === 0) return null;

    // Minutos reales por etapa del summary de Fitbit (sin redondeo de la grilla).
    const summary = (sleep.summary ?? {}) as Record<string, unknown>;
    const ss = (summary.stagesSummary as Array<Record<string, string>>) ?? [];
    let stageMinutes: Record<SleepStage, number> | undefined;
    if (ss.length) {
      stageMinutes = { awake: 0, light: 0, deep: 0, rem: 0 };
      for (const row of ss) stageMinutes[mapStage(String(row.type))] += parseInt(row.minutes ?? "0", 10) || 0;
    }
    const startLocal = new Date(Date.parse(start) + offSec * 1000);
    return {
      start: localHHMM(start, offSec),
      end: localHHMM(end, parseInt(interval.endUtcOffset ?? String(offSec), 10) || offSec),
      startHour: startLocal.getUTCHours(),
      stages,
      stageMinutes,
      isSimulated: data._mock === true,
      // El dato de sueño no trae HR/HRV/pasos junto; sin fuente real, no inventamos.
      hrNight: [],
      restingBpm: null,
      restingTypical: null,
      hrvMs: null,
      hrvTypical: null,
      stepsByHour: [],
    };
  } catch {
    return null;
  }
}

// Lee la última noche real de raw_events (source "google", kind "sleep"); si no hay, null (estado vacío en la UI).
export function getLastNight(userId: string): Night | null {
  try {
    // Siempre filtrada por usuario: sin userId devolvería la noche de cualquiera.
    const where = and(eq(rawEvents.source, "google"), eq(rawEvents.kind, "sleep"), eq(rawEvents.userId, userId));
    const row = db.select().from(rawEvents).where(where).orderBy(desc(rawEvents.ts)).limit(1).get();
    if (row) return parseNight(JSON.parse(row.json));
  } catch (error) {
    console.error("[body] getLastNight", error);
  }
  return null;
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
