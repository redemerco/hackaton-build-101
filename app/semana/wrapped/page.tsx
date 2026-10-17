import Link from "next/link";
import { Pulse } from "@/components/ascii/ascii-field";
import { Mascot } from "@/components/ascii/mascot";
import { Screen } from "@/components/screen";
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
    <Screen>
      <Pulse bpm={64} stress={0.5} />
      <Link href="/semana" transitionTypes={["nav-back"]} className="press -my-2 flex h-11 w-fit items-center font-mono text-[13px] text-dim">
        ← semana
      </Link>
      <article className="glass glass-panel grid gap-3 rounded-2xl px-4 py-5">
        <h1 className="font-pixel text-[44px] leading-none text-mood">SEMANA {W.week}</h1>
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
        <div className="flex items-end justify-between">
          <span className="font-mono text-xs text-faint">{W.isExample ? "[ejemplo]" : ""}</span>
          <Mascot mood="ok" size="lg" />
        </div>
      </article>
      <ShareButton title={`build101 · semana ${W.week}`} text={shareText} />
    </Screen>
  );
}
