import type { SleepStage } from "@/lib/ascii";

export type Night = {
  start: string; // "23:48"
  end: string;
  startHour: number;
  stages: SleepStage[]; // una por cada 15 min
  hrNight: number[]; // bpm a lo largo de la noche
  restingBpm: number;
  hrvMs: number;
  stepsByHour: number[]; // 08..19
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

// ponytail: noche de ejemplo hasta que exista el ingest de google_health (Renzo); misma forma que va a devolver la query.
export function getLastNight(): Night {
  const stages = exampleStages(29);
  return {
    start: "23:48",
    end: "07:00",
    startHour: 23,
    stages,
    hrNight: Array.from({ length: 34 }, (_, i) => 51 + (1 - Math.sin((Math.PI * i) / 33)) * 13 + Math.sin(i * 0.9) * 1.2),
    restingBpm: 58,
    hrvMs: 48,
    stepsByHour: [120, 80, 60, 300, 1100, 640, 90, 70, 380, 1300, 210, 62],
    isExample: true,
  };
}

/** Minutos por etapa (cada etapa del array son 15 min). */
export function minutesByStage(stages: readonly SleepStage[]): Record<SleepStage, number> {
  const out: Record<SleepStage, number> = { awake: 0, rem: 0, light: 0, deep: 0 };
  stages.forEach((s) => { out[s] += 15; });
  return out;
}
