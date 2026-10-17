import Link from "next/link";
import { Pulse } from "@/components/ascii/ascii-field";
import { Daemon } from "@/components/daemon/daemon";
import { Screen } from "@/components/screen";
import { ShareButton } from "@/components/share-button";
import { WrappedSlides } from "@/components/wrapped-slides";
import { getBuddy } from "@/lib/buddy";
import { EXAMPLE_WRAPPED as W, type WrappedHighlight } from "@/lib/week";

const LABEL_WIDTH = 13;
const VALUE_WIDTH = 5;
const RULE = "─".repeat(29);
const SLIDE = "glass glass-panel grid min-h-[56dvh] content-between gap-4 rounded-2xl px-5 py-6";

function Highlight({ h }: { h: WrappedHighlight }) {
  return (
    <article className={SLIDE}>
      <p className="font-mono text-xs uppercase tracking-[0.08em] text-dim">semana {W.week}</p>
      <div className="grid gap-2">
        <p className="font-pixel text-[66px] leading-none tabular-nums" style={{ color: `var(--${h.kind})` }}>{h.big}</p>
        <p className="text-base text-foreground/90">{h.label}</p>
        <p aria-hidden className="font-mono text-[28px] tracking-[4px]" style={{ color: `var(--${h.kind})` }}>{h.spark}</p>
      </div>
      <p className="text-[15px] leading-relaxed text-foreground/90">{h.caption}</p>
    </article>
  );
}

// ponytail: Wrapped de ejemplo; Joaco lo arma con datos reales. La imagen compartible (next/og) queda para después.
export default async function WrappedPage() {
  const buddy = await getBuddy();
  const shareText = [
    `build101 · semana ${W.week}: ${W.archetype.name}`,
    ...W.rows.map((r) => `${r.label.padEnd(LABEL_WIDTH)}${r.value.padStart(VALUE_WIDTH)}  ${r.spark ?? r.note ?? ""}`),
    `mejor día: ${W.bestDay.name}`,
  ].join("\n");

  const slides = [
    {
      id: "arquetipo",
      content: (
        <article className={SLIDE}>
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-dim">semana {W.week} · esta semana fuiste</p>
          <div className="grid justify-items-start gap-4">
            <Daemon state="racha" buddy={buddy} scale={3} />
            <h1 className="font-pixel text-[33px] leading-none text-mood">{W.archetype.name}</h1>
          </div>
          <p className="text-[15px] leading-relaxed text-foreground/90">{W.archetype.why}.</p>
        </article>
      ),
    },
    ...W.highlights.map((h) => ({ id: h.id, content: <Highlight h={h} /> })),
    {
      id: "resumen",
      content: (
        <article className={SLIDE}>
          <pre className="m-0 overflow-x-auto whitespace-pre font-mono text-[13px] leading-[1.7] tabular-nums">
            <span className="text-dim">$ build101 wrapped --sem {W.week}</span>{"\n"}
            <span className="text-dim">{RULE}</span>{"\n"}
            {W.rows.map((r) => (
              <span key={r.label}>
                {r.label.padEnd(LABEL_WIDTH)}{r.value.padStart(VALUE_WIDTH)}  <span style={{ color: `var(--${r.kind})` }}>{r.spark ?? r.note}</span>{"\n"}
              </span>
            ))}
            <span className="text-dim">{RULE}</span>{"\n"}
            {"mejor día".padEnd(LABEL_WIDTH + 1)}<span className="text-mood">{W.bestDay.name}</span>{"\n"}
            {W.bestDay.lines.map((l) => `  ${l}\n`)}
          </pre>
          <span className="font-mono text-xs text-faint">{W.isExample ? "[ejemplo]" : ""}</span>
        </article>
      ),
    },
  ];

  return (
    <Screen>
      <Pulse bpm={64} stress={0.5} />
      <Link href="/semana" transitionTypes={["nav-back"]} className="press -my-2 flex h-11 w-fit items-center font-mono text-[13px] text-dim">
        ← semana
      </Link>
      <WrappedSlides slides={slides} />
      <ShareButton title={`build101 · semana ${W.week}`} text={shareText} />
    </Screen>
  );
}
