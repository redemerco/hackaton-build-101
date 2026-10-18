"use client";

import { useState } from "react";
import Link from "next/link";
import { StreamText, type StreamPart, type StreamSource } from "@/components/ascii/stream-text";
import { Panel } from "@/components/glass/panel";

/**
 * Digest semanal en streaming. Sin `src` tipea el respaldo; Joaco pasa `src="/api/digest"`
 * y el respaldo queda como fallback cacheado si la IA falla en vivo.
 */
export function Digest({ fallback, src }: { fallback: readonly StreamPart[]; src?: string }) {
  const [runId, setRunId] = useState(0);
  const [source, setSource] = useState<StreamSource | null>(null);
  const meta = source === "fallback" ? "[sin IA]" : source === "cache" ? "[cache · IA caída]" : source === "reused" ? "gemini · ya generado" : source === "live" ? "gemini" : "…";
  return (
    <>
      <Panel label="tu digest" meta={meta} className="content-start">
        <StreamText fallback={fallback} src={src} runId={runId} tokenMs={65} onSource={setSource} className="text-[15px] leading-relaxed" />
        <p className="font-mono text-xs text-faint">observaciones de tus datos, no diagnóstico médico.</p>
      </Panel>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setRunId((n) => n + 1)} className="glass press h-12 rounded-full text-[15px] font-semibold">
          ↻ Regenerar
        </button>
        <Link href="/semana/wrapped" transitionTypes={["nav-forward"]} className="glass press grid h-12 place-items-center rounded-full bg-mood/20 text-[15px] font-semibold">
          Ver Wrapped
        </Link>
      </div>
    </>
  );
}
