import { formatDuration } from "@/lib/ascii";
import type { Hour, Hourly } from "@/lib/hourly";

// Tu día en carriles: una fila por tipo de dato, todas sobre la misma línea de 24 horas.
// Cada carril dice qué es y cuánto sumó: no hace falta leyenda, y se ve qué se pisa con qué en la misma hora.
const HOURS = 24;
const AXIS_LABELS = [0, 6, 12, 18, 24];
const MIN_OPACITY = 0.3;

const pad = (n: number) => String(n).padStart(2, "0");
const sum = (hours: Hour[], f: (h: Hour) => number) => hours.reduce((n, h) => n + f(h), 0);

type Lane = {
  name: string;
  total: string | null;
  note: string | null;
  color: string;
  /** 0..1 por hora: cuánto de esa hora ocupa el dato (0 = nada) */
  fill: (h: Hour) => number;
  /** true: la intensidad es el ancho de la celda (minutos de la hora); false: la opacidad */
  isWidth?: boolean;
};

function peakOf(hours: Hour[], f: (h: Hour) => number): string | null {
  const best = hours.reduce((a, h) => (f(h) > f(a) ? h : a), hours[0]);
  return f(best) > 0 ? `pico ${pad(best.hour)}–${pad(best.hour + 1)} h` : null;
}

function lanes(hours: Hour[], sleepMin: number | null): Lane[] {
  const max = (f: (h: Hour) => number) => Math.max(...hours.map(f), 1e-9);
  const commits = sum(hours, (h) => h.commits);
  const messages = sum(hours, (h) => h.messages);
  const meetingMin = sum(hours, (h) => h.meetingMin);
  const azm = sum(hours, (h) => h.azm);
  const meals = sum(hours, (h) => h.meals);
  // el bloque de sueño de la mañana: desde la primera hora dormida hasta que se corta
  const asleep = hours.filter((h) => h.asleep).map((h) => h.hour);
  let wake = asleep[0] ?? null;
  while (wake !== null && asleep.includes(wake + 1)) wake++;
  const maxCommits = max((h) => h.commits);
  const maxMessages = max((h) => h.messages);
  const maxAzm = Math.max(max((h) => h.azm), 15);
  return [
    {
      name: "sueño",
      total: sleepMin ? formatDuration(sleepMin) : asleep.length ? `${asleep.length} h` : null,
      note: wake !== null ? `despertaste ${pad(wake + 1)} h` : null,
      color: "var(--sleep)",
      fill: (h) => (h.asleep ? 1 : 0),
    },
    { name: "reuniones", total: meetingMin ? formatDuration(meetingMin) : null, note: null, color: "var(--mood)", fill: (h) => Math.min(1, h.meetingMin / 60), isWidth: true },
    { name: "commits", total: commits ? String(commits) : null, note: peakOf(hours, (h) => h.commits), color: "var(--work)", fill: (h) => h.commits / maxCommits },
    { name: "slack", total: messages ? String(messages) : null, note: null, color: "var(--work)", fill: (h) => h.messages / maxMessages },
    { name: "activo", total: azm ? `${azm}′` : null, note: null, color: "var(--heart)", fill: (h) => Math.min(1, h.azm / maxAzm) },
    { name: "comidas", total: meals ? String(meals) : null, note: null, color: "var(--food)", fill: (h) => (h.meals > 0 ? 1 : 0) },
  ];
}

function Cell({ value, color, isWidth, isFuture }: { value: number; color: string; isWidth?: boolean; isFuture: boolean }) {
  if (isFuture || value <= 0) return <span className={isFuture ? "rounded-[2px] bg-white/[.025]" : "rounded-[2px] bg-white/[.06]"} />;
  return (
    <span className="relative overflow-hidden rounded-[2px] bg-white/[.06]">
      <span
        className="absolute inset-y-0 left-0"
        style={{ background: color, width: isWidth ? `${Math.max(25, value * 100)}%` : "100%", opacity: isWidth ? 1 : MIN_OPACITY + (1 - MIN_OPACITY) * value }}
      />
    </span>
  );
}

/** Tu día por hora: un carril por dato (sueño, reuniones, commits, Slack, actividad, comidas) sobre las mismas 24 h. */
export function CrossChart({ day, nowHour, sleepMin = null }: { day: Hourly; nowHour: number; sleepMin?: number | null }) {
  const past = day.hours.filter((h) => h.hour <= nowHour);
  const rows = lanes(past, sleepMin);
  const nowLeft = `${((nowHour + 0.5) / HOURS) * 100}%`;

  return (
    <div className="grid grid-cols-[minmax(84px,auto)_1fr] gap-x-3">
      <span />
      <div aria-hidden className="relative mb-1.5 h-4 font-mono text-[11px] tabular-nums text-dim">
        {AXIS_LABELS.map((h) => (
          <span key={h} className="absolute top-0 -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${(h / HOURS) * 100}%` }}>
            {pad(h % 24)}
          </span>
        ))}
      </div>

      {rows.map((l) => (
        <div key={l.name} className="contents" role="group" aria-label={`${l.name}: ${l.total ?? "sin datos hoy"}${l.note ? `, ${l.note}` : ""}`}>
          <div className="grid content-center gap-px py-1.5">
            <p className="flex items-baseline gap-1.5 leading-none">
              <span className="text-[13px] text-dim">{l.name}</span>
              <span className="font-mono text-[15px] font-semibold tabular-nums" style={{ color: l.total ? l.color : undefined }}>{l.total ?? <span className="text-faint">—</span>}</span>
            </p>
            {l.note && <span className="font-mono text-[11px] leading-tight text-faint">{l.note}</span>}
          </div>
          <div aria-hidden className="relative grid items-stretch gap-px py-1.5" style={{ gridTemplateColumns: `repeat(${HOURS}, 1fr)` }}>
            {day.hours.map((h) => <Cell key={h.hour} value={l.fill(h)} color={l.color} isWidth={l.isWidth} isFuture={h.hour > nowHour} />)}
            {/* ahora: la misma línea cruza todos los carriles */}
            <span className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-mood" style={{ left: nowLeft }} />
          </div>
        </div>
      ))}

      <span />
      <div aria-hidden className="relative mt-1 h-4">
        <span className="absolute top-0 -translate-x-1/2 rounded-sm bg-mood px-1 font-mono text-[10px] font-semibold leading-tight text-background" style={{ left: nowLeft }}>
          ahora
        </span>
      </div>
    </div>
  );
}
