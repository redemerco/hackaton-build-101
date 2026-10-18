import type { Delta, ProjectShare, StressMap, Zone } from "@/lib/stress";

// Mapa carga × cuerpo: cada día de la semana es un punto. Derecha = más carga que tu normal; arriba = el cuerpo mejor que tu normal.
const SIZE = 200;
const PAD = 14;
const RANGE = 1.2; // 1,2 desvíos ya llegan al borde (más allá se pega al borde): los días se separan a la vista
const NORMAL = 0.33; // el círculo del centro: lo mismo que NORMAL_BAND en lib/stress
const edge = (v: number) => Math.max(-RANGE, Math.min(RANGE, v));
const toX = (x: number) => SIZE / 2 + (edge(x) / RANGE) * (SIZE / 2 - PAD);
const toY = (y: number) => SIZE / 2 - (edge(y) / RANGE) * (SIZE / 2 - PAD);
const WEEKDAY = ["D", "L", "M", "X", "J", "V", "S"];
const dayLetter = (day: string) => WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()];

const NORMAL_COLOR = "var(--mood)";
const ZONE: Record<Exclude<Zone, "en tu normal">, { color: string; x: number; y: number; anchor: "start" | "end" }> = {
  "en forma": { color: "var(--work)", x: PAD - 6, y: PAD + 2, anchor: "start" },
  aguantando: { color: "var(--food)", x: SIZE - PAD + 6, y: PAD + 2, anchor: "end" },
  "no es el trabajo": { color: "var(--sleep)", x: PAD - 6, y: SIZE - PAD + 4, anchor: "start" },
  cuidado: { color: "var(--heart)", x: SIZE - PAD + 6, y: SIZE - PAD + 4, anchor: "end" },
};
const QUADRANTS: { zone: Exclude<Zone, "en tu normal">; x: number; y: number }[] = [
  { zone: "en forma", x: 0, y: 0 },
  { zone: "aguantando", x: SIZE / 2, y: 0 },
  { zone: "no es el trabajo", x: 0, y: SIZE / 2 },
  { zone: "cuidado", x: SIZE / 2, y: SIZE / 2 },
];

function Deltas({ title, items }: { title: string; items: Delta[] }) {
  return (
    <div className="grid content-start gap-1">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">{title}</p>
      {items.length ? (
        items.map((d) => (
          <p key={d.label} className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="text-dim">{d.label}</span>
            <span className={`font-mono font-semibold tabular-nums ${d.isGood ? "text-work" : "text-heart"}`}>{d.text}</span>
          </p>
        ))
      ) : (
        <p className="text-[13px] text-dim">como siempre</p>
      )}
    </div>
  );
}

function Projects({ items }: { items: ProjectShare[] }) {
  return (
    <div className="grid gap-1.5 border-t border-white/10 pt-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">dónde se fue tu semana</p>
      {items.map((p) => (
        <p key={p.name} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 text-[13px]">
          <span className="truncate">{p.name}</span>
          <span className="h-2 overflow-hidden rounded-full bg-white/[.06]">
            <span className="block h-full rounded-full bg-work" style={{ width: `${Math.round(p.share * 100)}%` }} />
          </span>
          <span className="font-mono tabular-nums text-dim">{Math.round(p.share * 100)}%</span>
        </p>
      ))}
    </div>
  );
}

/** Estrés de hoy: tu carga de trabajo de las últimas 24 h contra cómo está tu cuerpo hoy, los dos contra tu normal. */
export function StressMapView({ map, projects }: { map: StressMap; projects: ProjectShare[] }) {
  if (!map.zone || !map.today) {
    return (
      <div className="grid gap-2">
        <p className="text-[15px] leading-relaxed text-dim">Todavía no alcanza para saber tu normal y compararte contra ella.</p>
        <p className="font-mono text-[12px] text-faint">{map.need}</p>
        {projects.length > 0 && <Projects items={projects} />}
      </div>
    );
  }
  const today = map.today;
  const color = map.zone === "en tu normal" ? NORMAL_COLOR : ZONE[map.zone].color;

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <p className="font-pixel text-[26px] leading-none" style={{ color }}>{map.zone}</p>
        <p className="text-[15px] leading-relaxed text-pretty">{map.verdict}</p>
        <p className="text-[12px] leading-snug text-dim">
          Medimos tu <b className="font-medium text-foreground/90">carga de trabajo de las últimas 24 h</b> y cómo está tu <b className="font-medium text-foreground/90">cuerpo hoy</b> (sueño de anoche, HRV y pulso), cada uno contra tu normal.
        </p>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-2">
        <div aria-hidden className="grid grid-rows-2 text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
          <span className="self-start [writing-mode:vertical-rl] rotate-180">cuerpo bien</span>
          <span className="self-end [writing-mode:vertical-rl] rotate-180">cuerpo tenso</span>
        </div>
        <div className="grid gap-1">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="block aspect-square w-full max-w-[340px] justify-self-center"
            role="img"
            aria-label={`Mapa de estrés: esta semana ${map.zone}. ${map.verdict}`}
          >
            {QUADRANTS.map((q) => (
              <rect key={q.zone} x={q.x} y={q.y} width={SIZE / 2} height={SIZE / 2} fill={ZONE[q.zone].color} opacity={q.zone === map.zone ? 0.16 : 0.05} />
            ))}
            <rect x={SIZE / 2 - 0.5} y={0} width={1} height={SIZE} fill="rgb(255 255 255 / .18)" />
            <rect x={0} y={SIZE / 2 - 0.5} width={SIZE} height={1} fill="rgb(255 255 255 / .18)" />
            {QUADRANTS.map((q) => (
              <text
                key={`t${q.zone}`}
                x={ZONE[q.zone].x}
                y={ZONE[q.zone].y}
                textAnchor={ZONE[q.zone].anchor}
                className="font-mono"
                fontSize={8.5}
                fill={ZONE[q.zone].color}
                opacity={q.zone === map.zone ? 1 : 0.55}
              >
                {q.zone}
              </text>
            ))}
            {/* los días anteriores: solo referencia, chiquitos */}
            {map.past.map((p) => (
              <circle key={p.day} cx={toX(p.x)} cy={toY(p.y)} r={2.5} fill="rgb(255 255 255 / .35)">
                <title>{dayLetter(p.day)}</title>
              </circle>
            ))}
            {/* tu normal: el centro */}
            <circle cx={SIZE / 2} cy={SIZE / 2} r={(NORMAL / RANGE) * (SIZE / 2 - PAD)} fill="none" stroke="rgb(255 255 255 / .3)" strokeDasharray="1.5 2" />
            <g>
              <circle cx={toX(today.x)} cy={toY(today.y)} r={15} fill={color} opacity={0.25} />
              <circle cx={toX(today.x)} cy={toY(today.y)} r={10} fill={color} />
              <text x={toX(today.x)} y={toY(today.y) + 2.8} textAnchor="middle" className="font-mono" fontSize={8} fontWeight={700} fill="var(--background)">hoy</text>
            </g>
          </svg>
          <p aria-hidden className="flex justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
            <span>poca carga</span>
            <span>mucha carga →</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3">
        <Deltas title="carga · últimas 24 h" items={map.load} />
        <Deltas title="cuerpo · hoy" items={map.body} />
      </div>

      {projects.length > 0 && <Projects items={projects} />}

      <p className="font-mono text-[11px] text-faint">el círculo del centro es tu normal (media de 6 semanas) · los puntitos son tus días anteriores · observación, no diagnóstico médico</p>
    </div>
  );
}
