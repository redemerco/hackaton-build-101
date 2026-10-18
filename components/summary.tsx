"use client";

import { useState } from "react";
import { StreamText, type StreamSource } from "@/components/ascii/stream-text";
import { Panel } from "@/components/glass/panel";

export type SummaryCountView = { label: string; value: number };

type SummaryProps = {
  label: string; // "salud · hoy"
  src: string; // "/api/summary/health" (el ↻ le agrega ?force=1: el route debe aceptarlo)
  /** Qué datos entraron al prompt: se muestran abajo para que se vea en qué se apoya la IA. */
  counts: readonly SummaryCountView[];
  /** Se tipea solo si la IA no responde y no hay caché. Rotulado como "[sin IA]", nunca como IA. */
  fallback: string;
};

/** Resumen daily en streaming (lib/summary.ts). Si la IA se cae re-tipea el último real con "[cache …]". */
export function Summary({ label, src, counts, fallback }: SummaryProps) {
  const [runId, setRunId] = useState(0);
  const [source, setSource] = useState<StreamSource | null>(null);
  const meta = source === "fallback" ? "[sin IA]" : source === "cache" ? "[cache · IA caída]" : source === "reused" ? "gemini · ya generado" : source === "live" ? "gemini" : "…";
  const used = counts.filter((c) => c.value > 0);

  return (
    <Panel label={label} meta={meta} className="content-start">
      <StreamText fallback={[fallback]} src={runId > 0 ? `${src}?force=1` : src} runId={runId} tokenMs={55} onSource={setSource} className="text-[15px] leading-relaxed" />
      <div className="flex items-end justify-between gap-3 border-t border-white/10 pt-2.5">
        <p className="font-mono text-xs leading-relaxed text-faint">
          {used.length ? `datos usados: ${used.map((c) => `${c.value} ${c.label}`).join(" · ")}` : "sin datos todavía: conectá tus fuentes"}
          <br />
          observaciones de tus datos, no diagnóstico médico.
        </p>
        <button
          type="button"
          onClick={() => setRunId((n) => n + 1)}
          aria-label="Regenerar resumen"
          className="glass press h-11 shrink-0 rounded-full px-4 text-sm font-semibold"
        >
          ↻
        </button>
      </div>
    </Panel>
  );
}
