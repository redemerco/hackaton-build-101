import { fitMonoFontSize, hypnogramLanes, SLEEP_STAGES, type SleepStage } from "@/lib/ascii";

const LANE_LABEL: Record<SleepStage, string> = { awake: "despierto", rem: "rem", light: "liviano", deep: "profundo" };
const LANE_COLOR: Record<SleepStage, string> = { awake: "#ff9b8f", rem: "#c9a7ff", light: "#6f7bd9", deep: "var(--sleep)" };
const COLS_PER_LABEL = 8; // 8 columnas de 15 min = una etiqueta cada 2 h
const LANE_MAX_PX = 20;

/**
 * Hipnograma en carriles: 1 columna = 15 min, un carril por etapa.
 * La etapa se lee por la posición del carril, no solo por el color.
 * Los carriles escalan para ocupar todo el ancho, dure lo que dure la noche.
 */
export function Hypnogram({ stages, startHour }: { stages: readonly SleepStage[]; startHour: number }) {
  const lanes = hypnogramLanes(stages);
  const fontSize = fitMonoFontSize(stages.length, LANE_MAX_PX);

  return (
    <div aria-hidden className="grid grid-cols-[68px_1fr] items-center gap-y-0.5 font-mono">
      {SLEEP_STAGES.map((stage) => (
        <div key={stage} className="contents">
          <span className="text-[11px] leading-none text-dim">{LANE_LABEL[stage]}</span>
          <div className="@container min-w-0">
            <pre className="m-0 whitespace-pre leading-[1.15] text-[#2d3345]" style={{ fontSize }}>
              {lanes[stage].split(/(█+)/).map((run, i) =>
                run.startsWith("█") ? <span key={i} style={{ color: LANE_COLOR[stage] }}>{run}</span> : run,
              )}
            </pre>
          </div>
        </div>
      ))}
      {/* eje: mismas columnas que los carriles, en porcentaje, con letra legible */}
      <div className="relative col-start-2 mt-1 h-4 text-[11px] text-faint">
        {Array.from({ length: Math.ceil(stages.length / COLS_PER_LABEL) }, (_, i) => (
          <span key={i} className="absolute top-0 tabular-nums" style={{ left: `${((i * COLS_PER_LABEL) / stages.length) * 100}%` }}>
            {String((startHour + i * 2) % 24).padStart(2, "0")}
          </span>
        ))}
      </div>
    </div>
  );
}
