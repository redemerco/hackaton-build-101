"use client";

import { useEffect, useState } from "react";
import { StreamText, type StreamPart } from "@/components/ascii/stream-text";
import { Panel } from "@/components/glass/panel";

type Count = { label: string; n: number };

/**
 * PLAN B hasta que esté `components/summary.tsx` (Santi): mismas props que `<Summary>`, así el cambio
 * es solo el import. Es `components/digest.tsx` sin el link a Wrapped y con el pie "datos usados".
 */
export function Summary({ label, src, fallback, counts, isExample }: { label: string; src: string; fallback: readonly StreamPart[]; counts: Count[]; isExample: boolean }) {
  const [runId, setRunId] = useState(0);
  const [source, setSource] = useState<"live" | "fallback" | null>(null);
  // Lo que trae el GET al regenerar, atado a los counts del server con los que se pidió (pull-to-sync los reemplaza).
  const countsKey = JSON.stringify(counts);
  const [fetched, setFetched] = useState<{ key: string; counts: Count[] } | null>(null);
  const used = fetched?.key === countsKey ? fetched.counts : counts;
  const meta = isExample || source === "fallback" ? "[ejemplo · sin IA]" : source === "live" ? "gemini" : "…";

  // Al regenerar, el pie se vuelve a pedir: si hubo un commit nuevo, se ve sumado.
  useEffect(() => {
    if (runId === 0) return;
    fetch(src)
      .then((r) => r.json())
      .then((d: { counts?: Count[] }) => d.counts && setFetched({ key: countsKey, counts: d.counts }))
      .catch(() => {});
  }, [runId, src, countsKey]);

  return (
    <>
      <Panel label={label} meta={meta} className="content-start">
        <StreamText fallback={fallback} src={src} runId={runId} tokenMs={65} onSource={setSource} className="text-[15px] leading-relaxed" />
        <p className="font-mono text-xs text-faint">datos usados: {used.map((c) => `${c.n} ${c.label}`).join(" · ")}</p>
      </Panel>
      <button type="button" onClick={() => setRunId((n) => n + 1)} className="glass press h-12 rounded-full text-[15px] font-semibold">
        ↻ Regenerar
      </button>
    </>
  );
}
