import type { Delta, ProjectShare, StressMap, Zone } from "@/lib/stress";

// Estrés de hoy en dos barras ASCII (como las del ranking): cuánta carga traés y cómo responde el cuerpo.
// La mitad de cada barra es tu normal. El detalle (los números) queda plegado en "ver por qué".
const CELLS = 14;
const RANGE = 1.2; // a 1,2 desvíos de tu normal la barra se llena (o se vacía)
const BAND = 0.33; // lo mismo que NORMAL_BAND en lib/stress: dentro de esto es "tu normal"

const ZONE_COLOR: Record<Zone, string> = {
  "en tu normal": "var(--mood)",
  "en forma": "var(--work)",
  aguantando: "var(--food)",
  cuidado: "var(--heart)",
  "no es el trabajo": "var(--sleep)",
};

const cellsOf = (z: number) => Math.round(((Math.max(-RANGE, Math.min(RANGE, z)) + RANGE) / (2 * RANGE)) * CELLS);
const bar = (z: number) => "█".repeat(cellsOf(z)) + "░".repeat(CELLS - cellsOf(z));
const levelOf = (z: number) => (z <= -BAND ? 0 : z >= BAND ? 2 : 1);

type Three = [string, string, string];
const LOAD_WORDS: Three = ["liviana", "normal", "alta"];
const LOAD_COLORS: Three = ["var(--work)", "var(--mood)", "var(--food)"];
const BODY_WORDS: Three = ["tenso", "normal", "bien"];
const BODY_COLORS: Three = ["var(--heart)", "var(--mood)", "var(--work)"];

function Meter({ label, z, words, colors }: { label: string; z: number; words: Three; colors: Three }) {
  const i = levelOf(z);
  return (
    <p className="grid grid-cols-[4.5rem_auto_1fr] items-baseline gap-3">
      <span className="text-[13px] text-dim">{label}</span>
      <span aria-hidden className="font-mono text-[15px] leading-none tracking-[1px]" style={{ color: colors[i] }}>{bar(z)}</span>
      <span className="text-[14px] font-medium" style={{ color: colors[i] }}>{words[i]}</span>
    </p>
  );
}

function Deltas({ title, items }: { title: string; items: Delta[] }) {
  return (
    <div className="grid content-start gap-1">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">{title}</p>
      {items.length ? (
        items.map((d) => (
          <p key={d.label} className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="text-dim">{d.label}</span>
            <span className={`font-mono tabular-nums ${d.isGood ? "text-work" : "text-heart"}`}>{d.text}</span>
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
    <div className="grid gap-1">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">dónde se fue tu semana</p>
      {items.map((p) => (
        <p key={p.name} className="flex items-baseline justify-between gap-2 text-[13px]">
          <span className="truncate text-dim">{p.name}</span>
          <span className="font-mono tabular-nums">{Math.round(p.share * 100)}%</span>
        </p>
      ))}
    </div>
  );
}

/** Estrés de hoy: tu carga de trabajo (últimas 24 h) contra cómo está tu cuerpo hoy, los dos contra tu normal. */
export function StressMapView({ map, projects }: { map: StressMap; projects: ProjectShare[] }) {
  if (!map.zone || !map.today) {
    return (
      <div className="grid gap-1.5">
        <p className="text-[15px] leading-relaxed text-dim">Todavía no conocemos tu normal para compararte.</p>
        <p className="font-mono text-[12px] text-faint">{map.need}</p>
      </div>
    );
  }
  const { x, y } = map.today;
  return (
    <div className="grid gap-3.5">
      <div className="grid gap-1.5">
        <p className="font-pixel text-[26px] leading-none" style={{ color: ZONE_COLOR[map.zone] }}>{map.zone}</p>
        <p className="text-[15px] leading-relaxed text-pretty">{map.verdict}</p>
      </div>

      <div className="grid gap-2" role="img" aria-label={`Carga: ${LOAD_WORDS[levelOf(x)]}. Cuerpo: ${BODY_WORDS[levelOf(y)]}.`}>
        <Meter label="carga" z={x} words={LOAD_WORDS} colors={LOAD_COLORS} />
        <Meter label="cuerpo" z={y} words={BODY_WORDS} colors={BODY_COLORS} />
      </div>

      <details className="group border-t border-white/10 pt-3">
        <summary className="cursor-pointer list-none font-mono text-[12px] text-faint group-open:text-dim">ver por qué ▾</summary>
        <div className="mt-2.5 grid grid-cols-2 gap-3">
          <Deltas title="trabajo · 24 h" items={map.load} />
          <Deltas title="cuerpo · hoy" items={map.body} />
        </div>
        {projects.length > 0 && <div className="mt-3"><Projects items={projects} /></div>}
        <p className="mt-3 font-mono text-[11px] text-faint">la mitad de cada barra es tu normal (6 semanas) · observación, no diagnóstico</p>
      </details>
    </div>
  );
}
