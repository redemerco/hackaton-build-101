import { fitMonoFontSize } from "@/lib/ascii";
import type { Hour, Hourly } from "@/lib/hourly";

const BLOCKS = " ▁▂▃▄▅▆▇█";
const HOURS = 24;
const LANE_MAX_PX = 20;
const AXIS = [0, 6, 12, 18, 23];

type Lane = { label: string; color: string; cell: (h: Hour, max: number) => string; max: (hs: Hour[]) => number };

const level = (value: number, max: number) => (value <= 0 ? "·" : BLOCKS[Math.max(1, Math.round((value / Math.max(1, max)) * 8))]);

// Arriba el trabajo, abajo el cuerpo: la misma hora en la misma columna, para ver qué se pisa con qué.
const WORK: Lane[] = [
  { label: "reuniones", color: "var(--work)", cell: (h) => (h.meetingMin >= 30 ? "█" : h.meetingMin > 0 ? "▄" : "·"), max: () => 1 },
  { label: "código", color: "var(--work)", cell: (h, max) => level(h.commits, max), max: (hs) => Math.max(...hs.map((h) => h.commits)) },
  { label: "slack", color: "var(--work)", cell: (h, max) => level(h.messages, max), max: (hs) => Math.max(...hs.map((h) => h.messages)) },
];
const BODY: Lane[] = [
  { label: "sueño", color: "var(--sleep)", cell: (h) => (h.asleep ? "█" : "·"), max: () => 1 },
  { label: "activo", color: "var(--heart)", cell: (h, max) => level(h.azm, max), max: (hs) => Math.max(...hs.map((h) => h.azm)) },
  { label: "comidas", color: "var(--food)", cell: (h) => (h.meals > 0 ? "◆" : "·"), max: () => 1 },
];

function LaneRow({ lane, hours, nowHour }: { lane: Lane; hours: Hour[]; nowHour: number }) {
  const max = lane.max(hours);
  return (
    <>
      <span className="text-[11px] leading-none text-dim">{lane.label}</span>
      <div className="@container min-w-0">
        <pre className="m-0 whitespace-pre leading-[1.2] text-[#2d3345]" style={{ fontSize: fitMonoFontSize(HOURS, LANE_MAX_PX) }}>
          {hours.map((h) => {
            const ch = lane.cell(h, max);
            const isFuture = h.hour > nowHour;
            return (
              <span key={h.hour} style={ch === "·" || isFuture ? undefined : { color: lane.color }}>
                {isFuture ? " " : ch}
              </span>
            );
          })}
        </pre>
      </div>
    </>
  );
}

/** Tu día, hora por hora: trabajo (reuniones, commits, Slack) arriba y cuerpo (sueño, minutos activos, comidas) abajo. */
export function CrossChart({ day, nowHour }: { day: Hourly; nowHour: number }) {
  return (
    <div role="img" aria-label="Tu día por hora: trabajo arriba, cuerpo abajo" className="grid grid-cols-[68px_1fr] items-center gap-y-0.5 font-mono">
      {WORK.map((lane) => <LaneRow key={lane.label} lane={lane} hours={day.hours} nowHour={nowHour} />)}
      <span aria-hidden className="col-span-2 my-1 border-t border-dashed border-white/10" />
      {BODY.map((lane) => <LaneRow key={lane.label} lane={lane} hours={day.hours} nowHour={nowHour} />)}
      <div className="relative col-start-2 mt-1 h-4 text-[11px] text-faint">
        {AXIS.map((h) => (
          <span key={h} className="absolute top-0 tabular-nums" style={{ left: `${(h / HOURS) * 100}%` }}>
            {String(h).padStart(2, "0")}
          </span>
        ))}
        <span className="absolute -top-0.5 text-mood" style={{ left: `calc(${((nowHour + 0.5) / HOURS) * 100}% - 3px)` }} aria-hidden>
          ▲
        </span>
      </div>
    </div>
  );
}
