import { hypnogramLanes, SLEEP_STAGES, type SleepStage } from "@/lib/ascii";

const LANE_LABEL: Record<SleepStage, string> = { awake: "despierto", rem: "rem", light: "liviano", deep: "profundo" };
const LANE_COLOR: Record<SleepStage, string> = { awake: "#ff9b8f", rem: "#c9a7ff", light: "#6f7bd9", deep: "var(--sleep)" };
const COLS_PER_LABEL = 8; // 8 columnas de 15 min = una etiqueta cada 2 h

/**
 * Hipnograma en carriles: 1 columna = 15 min, un carril por etapa.
 * La etapa se lee por la posición del carril, no solo por el color.
 */
export function Hypnogram({ stages, startHour }: { stages: readonly SleepStage[]; startHour: number }) {
  const lanes = hypnogramLanes(stages);
  const axis = Array.from({ length: Math.ceil(stages.length / COLS_PER_LABEL) }, (_, i) =>
    String((startHour + i * 2) % 24).padStart(2, "0").padEnd(COLS_PER_LABEL, " "),
  ).join("").trimEnd();

  return (
    <div aria-hidden className="grid gap-px font-mono text-[9px] leading-[11px]">
      {SLEEP_STAGES.map((stage) => (
        <div key={stage} className="grid grid-cols-[52px_1fr] items-center">
          <span className="text-[9.5px] text-dim">{LANE_LABEL[stage]}</span>
          <pre className="m-0 whitespace-pre text-[#2d3345]">
            {lanes[stage].split(/(█+)/).map((run, i) =>
              run.startsWith("█") ? <span key={i} style={{ color: LANE_COLOR[stage] }}>{run}</span> : run,
            )}
          </pre>
        </div>
      ))}
      <pre className="m-0 ml-[52px] mt-0.5 whitespace-pre text-faint">{axis}</pre>
    </div>
  );
}
