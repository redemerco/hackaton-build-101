// Puntaje build101 (0–100) de un día. Puro: lo usan lib/ranking.ts y scripts/smoke.mts.
// Inspirado en el Readiness de Google Health (sueño + HRV + pulso en reposo contra TU línea base),
// pero es nuestro: Google no expone ningún score por la API. Se muestra como "puntaje build101".

export type DayInput = {
  sleep?: { asleepMin: number; deepRemMin: number; awakeMin: number };
  hrvMs?: number;
  restingBpm?: number;
  azm?: number; // minutos en zona activa del día
};

export type Baseline = { hrvMs?: number; restingBpm?: number }; // media de los días anteriores

export type DayScore = {
  score: number; // 0–100, sobre las partes que hay
  parts: { sleep?: number; recovery?: number; movement?: number };
  isPartial: boolean; // falta alguna parte (sin HRV/pulso todavía, o sin línea base)
};

export const WEIGHTS = { sleep: 50, recovery: 35, movement: 15 } as const;

const SLEEP_FULL_MIN = 450; // 7h30 = puntaje completo de duración
const SLEEP_ZERO_MIN = 240; // 4h = cero
const DEEP_REM_FULL = 0.4; // 40 % del sueño en profundo + REM
const DEEP_REM_ZERO = 0.15;
const AWAKE_OK_MIN = 15;
const AWAKE_ZERO_MIN = 75;
const HRV_FULL_RATIO = 1.1; // 10 % sobre tu media = completo
const HRV_ZERO_RATIO = 0.75;
const RHR_FULL_DELTA = -2; // 2 lpm bajo tu media = completo
const RHR_ZERO_DELTA = 5;
const AZM_FULL = 22; // ~150 min por semana (OMS) / 7

/** 0..1 lineal entre `zero` y `full` (sirve en las dos direcciones). */
function ramp(value: number, zero: number, full: number): number {
  const t = (value - zero) / (full - zero);
  return Math.max(0, Math.min(1, t));
}

function sleepPoints({ asleepMin, deepRemMin, awakeMin }: NonNullable<DayInput["sleep"]>): number {
  const duration = ramp(asleepMin, SLEEP_ZERO_MIN, SLEEP_FULL_MIN) * 25;
  const quality = asleepMin > 0 ? ramp(deepRemMin / asleepMin, DEEP_REM_ZERO, DEEP_REM_FULL) * 15 : 0;
  const continuity = ramp(awakeMin, AWAKE_ZERO_MIN, AWAKE_OK_MIN) * 10;
  return duration + quality + continuity;
}

function recoveryPoints(day: DayInput, base: Baseline): number | undefined {
  const hrv = day.hrvMs && base.hrvMs ? ramp(day.hrvMs / base.hrvMs, HRV_ZERO_RATIO, HRV_FULL_RATIO) : undefined;
  const rhr =
    day.restingBpm && base.restingBpm ? ramp(day.restingBpm - base.restingBpm, RHR_ZERO_DELTA, RHR_FULL_DELTA) : undefined;
  // HRV pesa 20 y pulso 15; si falta uno, el otro ocupa los 35.
  if (hrv === undefined && rhr === undefined) return undefined;
  if (hrv === undefined) return rhr! * WEIGHTS.recovery;
  if (rhr === undefined) return hrv * WEIGHTS.recovery;
  return hrv * 20 + rhr * 15;
}

/** Puntaje del día. Sin ninguna parte → null (no entra al ranking). */
export function scoreDay(day: DayInput, base: Baseline): DayScore | null {
  const parts: DayScore["parts"] = {
    sleep: day.sleep ? sleepPoints(day.sleep) : undefined,
    recovery: recoveryPoints(day, base),
    movement: day.azm !== undefined ? ramp(day.azm, 0, AZM_FULL) * WEIGHTS.movement : undefined,
  };
  const present = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).filter((k) => parts[k] !== undefined);
  if (present.length === 0) return null;
  const got = present.reduce((sum, k) => sum + parts[k]!, 0);
  const max = present.reduce((sum, k) => sum + WEIGHTS[k], 0);
  return { score: Math.round((got / max) * 100), parts, isPartial: present.length < 3 };
}

/** Media de los valores definidos, o undefined. */
export function mean(values: readonly (number | undefined)[]): number | undefined {
  const ok = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : undefined;
}
