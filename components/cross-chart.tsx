import { formatDuration } from "@/lib/ascii";
import type { Hour, Hourly } from "@/lib/hourly";

// Tu día en espejo: una columna por hora. Arriba del eje el trabajo, abajo el cuerpo. Bloques pixel, como el resto.
const HOURS = 24;
const COL = 10; // ancho de cada hora en el viewBox
const BAR = 7; // ancho de la barra dentro de la columna
const SEG = 6; // alto de un bloque
const GAP = 2;
const UP_SEGS = 9;
const DOWN_SEGS = 7;
const AXIS_Y = UP_SEGS * (SEG + GAP) + 4;
const HEIGHT = AXIS_Y + 6 + DOWN_SEGS * (SEG + GAP);
const WIDTH = HOURS * COL;
const AXIS_LABELS = [0, 6, 12, 18, 24];

const work = (h: Hour) => h.commits * 2 + h.messages * 0.4;
const segsFor = (value: number, max: number, total: number) => (value <= 0 ? 0 : Math.max(1, Math.round((value / Math.max(max, 1e-9)) * total)));

function Column({ h, maxWork, maxAzm, isFuture }: { h: Hour; maxWork: number; maxAzm: number; isFuture: boolean }) {
  const x = h.hour * COL + (COL - BAR) / 2;
  const up = isFuture ? 0 : segsFor(work(h), maxWork, UP_SEGS);
  const azm = isFuture ? 0 : segsFor(h.azm, Math.max(maxAzm, 15), DOWN_SEGS);
  return (
    <g>
      {/* en reunión: franja de fondo en la mitad de trabajo, más fuerte cuanto más de la hora ocupa */}
      {h.meetingMin > 0 && !isFuture && (
        <rect x={h.hour * COL} y={0} width={COL} height={AXIS_Y - 2} fill="var(--work)" opacity={0.12 + 0.28 * Math.min(1, h.meetingMin / 60)} />
      )}
      {Array.from({ length: up }, (_, i) => (
        <rect key={`w${i}`} x={x} y={AXIS_Y - 4 - (i + 1) * (SEG + GAP) + GAP} width={BAR} height={SEG} fill="var(--work)" />
      ))}
      {/* dormido: la columna entera hacia abajo */}
      {h.asleep &&
        Array.from({ length: DOWN_SEGS }, (_, i) => (
          <rect key={`s${i}`} x={x} y={AXIS_Y + 6 + i * (SEG + GAP)} width={BAR} height={SEG} fill="var(--sleep)" opacity={0.75} />
        ))}
      {!h.asleep &&
        Array.from({ length: azm }, (_, i) => (
          <rect key={`a${i}`} x={x} y={AXIS_Y + 6 + i * (SEG + GAP)} width={BAR} height={SEG} fill="var(--heart)" />
        ))}
      {h.meals > 0 && <rect x={h.hour * COL + COL / 2 - 3} y={AXIS_Y - 3} width={6} height={6} fill="var(--food)" transform={`rotate(45 ${h.hour * COL + COL / 2} ${AXIS_Y})`} />}
      {isFuture && <rect x={h.hour * COL + COL / 2 - 0.75} y={AXIS_Y - 0.75} width={1.5} height={1.5} fill="rgb(255 255 255 / .25)" />}
    </g>
  );
}

const hourRange = (from: number, to: number) => `${String(from).padStart(2, "0")}–${String(to).padStart(2, "0")} h`;

/** Los números grandes de arriba: lo que se lee sin mirar la gráfica. */
function stats(hours: Hour[]) {
  const commits = hours.reduce((n, h) => n + h.commits, 0);
  const peak = hours.reduce((best, h) => (work(h) > work(best) ? h : best), hours[0]);
  const meetingMin = hours.reduce((n, h) => n + h.meetingMin, 0);
  const azm = hours.reduce((n, h) => n + h.azm, 0);
  // el bloque de sueño de la mañana (el que empieza más temprano en el día)
  const asleep = hours.filter((h) => h.asleep).map((h) => h.hour);
  let wake = asleep[0] ?? null;
  while (wake !== null && asleep.includes(wake + 1)) wake++;
  return {
    code: commits ? { big: String(commits), small: `commits · pico ${hourRange(peak.hour, peak.hour + 1)}` } : null,
    meetings: meetingMin ? { big: formatDuration(meetingMin), small: "de reuniones" } : null,
    sleep: asleep.length ? { big: `${String(wake! + 1).padStart(2, "0")} h`, small: "te despertaste" } : null,
    active: azm ? { big: String(azm), small: "min activos" } : null,
  };
}

function Stat({ big, small, color }: { big: string; small: string; color: string }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <span className="font-mono text-[22px] font-semibold leading-none tabular-nums" style={{ color }}>{big}</span>
      <span className="truncate text-[11px] text-dim">{small}</span>
    </div>
  );
}

const LEGEND = [
  { label: "código y Slack", color: "var(--work)", shape: "square" },
  { label: "en reunión", color: "var(--work)", shape: "band" },
  { label: "dormido", color: "var(--sleep)", shape: "square" },
  { label: "activo", color: "var(--heart)", shape: "square" },
  { label: "comida", color: "var(--food)", shape: "diamond" },
] as const;

/** Tu día por hora: trabajo arriba del eje, cuerpo abajo. La misma hora en la misma columna, para ver qué se pisa con qué. */
export function CrossChart({ day, nowHour }: { day: Hourly; nowHour: number }) {
  const maxWork = Math.max(...day.hours.map(work));
  const maxAzm = Math.max(...day.hours.map((h) => h.azm));
  const s = stats(day.hours.filter((h) => h.hour <= nowHour));
  const tiles = [
    s.code && { ...s.code, color: "var(--work)" },
    s.meetings && { ...s.meetings, color: "var(--work)" },
    s.sleep && { ...s.sleep, color: "var(--sleep)" },
    s.active && { ...s.active, color: "var(--heart)" },
  ].filter(Boolean) as { big: string; small: string; color: string }[];

  return (
    <div className="grid gap-3">
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4">
          {tiles.map((t) => <Stat key={t.small} {...t} />)}
        </div>
      )}

      <div className="grid grid-cols-[auto_1fr] gap-x-2">
        <div aria-hidden className="grid text-[10px] font-medium uppercase tracking-[0.08em] text-faint" style={{ gridTemplateRows: `${AXIS_Y}fr ${HEIGHT - AXIS_Y}fr` }}>
          <span className="self-center [writing-mode:vertical-rl] rotate-180">trabajo</span>
          <span className="self-center [writing-mode:vertical-rl] rotate-180">cuerpo</span>
        </div>
        <div className="relative">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full" shapeRendering="crispEdges" role="img" aria-label={`Tu día por hora. ${tiles.map((t) => `${t.big} ${t.small}`).join(", ")}`}>
            {/* guías cada 6 h */}
            {[6, 12, 18].map((g) => <rect key={g} x={g * COL} y={0} width={0.5} height={HEIGHT} fill="rgb(255 255 255 / .06)" />)}
            {day.hours.map((h) => <Column key={h.hour} h={h} maxWork={maxWork} maxAzm={maxAzm} isFuture={h.hour > nowHour} />)}
            <rect x={0} y={AXIS_Y - 0.5} width={WIDTH} height={1} fill="rgb(255 255 255 / .22)" />
            {/* ahora */}
            <rect x={(nowHour + 0.5) * COL - 0.75} y={0} width={1.5} height={HEIGHT} fill="var(--mood)" opacity={0.9} />
          </svg>
          <span className="absolute -top-0.5 rounded-sm bg-mood px-1 font-mono text-[10px] font-semibold leading-tight text-background" style={{ left: `calc(${((nowHour + 0.5) / HOURS) * 100}% - 15px)` }}>
            ahora
          </span>
          <div aria-hidden className="relative mt-1 h-4 font-mono text-[11px] tabular-nums text-dim">
            {AXIS_LABELS.map((h) => (
              <span key={h} className="absolute top-0 -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${(h / HOURS) * 100}%` }}>
                {String(h % 24).padStart(2, "0")}
              </span>
            ))}
          </div>
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11px] text-dim" aria-label="Referencias">
        {LEGEND.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={l.shape === "diamond" ? "size-2 rotate-45" : l.shape === "band" ? "h-3 w-2.5 opacity-40" : "size-2.5"}
              style={{ background: l.color }}
            />
            {l.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
