// Primitivas ASCII puras (sin DOM): las usan los componentes de components/ascii y scripts/smoke.mts.

const BLOCKS = "▁▂▃▄▅▆▇█";
export const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
export const FIELD_CHARS = " .·:-=+*#%@";

/** Una barra de 8 alturas por valor, escalada entre el mínimo y el máximo de la serie. */
export function sparkline(values: readonly number[]): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v) => BLOCKS[Math.round(((v - min) / span) * (BLOCKS.length - 1))]).join("");
}

/** Línea estilo asciichart (╭╯╰╮│─) de `rows` filas, sin ejes. */
export function asciiLine(values: readonly number[], rows: number): string {
  if (values.length === 0 || rows < 1) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const toRow = (v: number) => rows - 1 - Math.round(((v - min) / (max - min || 1)) * (rows - 1));
  const grid = Array.from({ length: rows }, () => Array<string>(values.length).fill(" "));
  values.forEach((v, x) => {
    const y = toRow(v);
    const prev = x === 0 ? y : toRow(values[x - 1]);
    if (y === prev) {
      grid[y][x] = "─";
      return;
    }
    const up = y < prev;
    grid[y][x] = up ? "╭" : "╰";
    grid[prev][x] = up ? "╯" : "╮";
    for (let r = Math.min(y, prev) + 1; r < Math.max(y, prev); r++) grid[r][x] = "│";
  });
  return grid.map((row) => row.join("")).join("\n");
}

export const SLEEP_STAGES = ["awake", "rem", "light", "deep"] as const;
export type SleepStage = (typeof SLEEP_STAGES)[number];

/** Un carril por etapa: `█` donde la noche estuvo en esa etapa, `·` donde no. */
export function hypnogramLanes(stages: readonly SleepStage[]): Record<SleepStage, string> {
  return Object.fromEntries(
    SLEEP_STAGES.map((lane) => [lane, stages.map((s) => (s === lane ? "█" : "·")).join("")]),
  ) as Record<SleepStage, string>;
}

/** "7h12" a partir de minutos. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

export type FieldParams = { cols: number; rows: number; t: number; bpm: number; stress: number };

/**
 * El fondo vivo: ondas suaves + un anillo doble ("lub-dub") que sale del centro al ritmo del pulso.
 * `stress` (0..1) sube la densidad y agrega parpadeo.
 */
export function asciiField({ cols, rows, t, bpm, stress }: FieldParams): string {
  const cx = cols / 2;
  const cy = rows * 0.42;
  const phase = (t * bpm / 60) % 1;
  const maxR = Math.max(cols * 0.5, rows) * 0.9;
  const r1 = phase * maxR;
  const r2 = Math.max(0, phase - 0.16) * maxR;
  const fade = Math.pow(1 - phase, 1.3);
  const amp = 0.34 + stress * 0.22;
  const last = FIELD_CHARS.length - 1;
  const flickerSeed = Math.floor(t * 6);
  let out = "";
  for (let y = 0; y < rows; y++) {
    const dy = y - cy;
    for (let x = 0; x < cols; x++) {
      const dx = (x - cx) * 0.5; // las celdas son el doble de altas que de anchas
      const d = Math.sqrt(dx * dx + dy * dy);
      let v = (0.5 + 0.5 * Math.sin(x * 0.21 + t * 0.7 + Math.sin(y * 0.13 + t * 0.3) * 1.6) * Math.cos(y * 0.17 - t * 0.5)) * amp;
      v += Math.exp(-((d - r1) ** 2) / 4.5) * fade * 0.85;
      v += Math.exp(-((d - r2) ** 2) / 3) * fade * 0.45;
      if (stress > 0.5) {
        const h = Math.sin(x * 12.9898 + y * 78.233 + flickerSeed * 3.1) * 43758.5453;
        v += (h - Math.floor(h) - 0.5) * stress * 0.35;
      }
      out += FIELD_CHARS[Math.max(0, Math.min(last, Math.floor(v * last)))];
    }
    if (y < rows - 1) out += "\n";
  }
  return out;
}
