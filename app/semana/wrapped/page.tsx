import { Pulse } from "@/components/ascii/ascii-field";
import { Mascot } from "@/components/ascii/mascot";
import { ShareButton } from "@/components/share-button";
import { EXAMPLE_WRAPPED as W } from "@/lib/week";

const LABEL_WIDTH = 13;
const VALUE_WIDTH = 5;
const RULE = "─".repeat(29);

// ponytail: Wrapped de ejemplo como HTML; la imagen compartible con next/og queda para cuando haya datos reales.
export default function WrappedPage() {
  const shareText = [
    `build101 · semana ${W.week}`,
    ...W.rows.map((r) => `${r.label.padEnd(LABEL_WIDTH)}${r.value.padStart(VALUE_WIDTH)}  ${r.spark ?? r.note ?? ""}`),
    `mejor día: ${W.bestDay.name}`,
  ].join("\n");

  return (
    <>
      <Pulse bpm={64} stress={0.5} />
      <article className="glass glass-panel grid gap-2 rounded-[26px] px-4 py-4">
        <h1 className="font-pixel text-[33px] leading-none text-mood">SEMANA {W.week}</h1>
        <pre className="m-0 overflow-x-auto whitespace-pre font-mono text-[11px] leading-[1.6] tabular-nums">
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
        <div className="flex items-end justify-between">
          <span className="font-mono text-[10.5px] text-faint">{W.isExample ? "[ejemplo]" : ""}</span>
          <Mascot mood="ok" />
        </div>
      </article>
      <ShareButton title={`build101 · semana ${W.week}`} text={shareText} />
    </>
  );
}
