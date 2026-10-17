"use client";

import { useState } from "react";
import Link from "next/link";
import { StreamText, type StreamPart } from "@/components/ascii/stream-text";
import { Panel } from "@/components/glass/panel";

/**
 * Digest semanal en streaming. Sin `src` tipea el respaldo; Joaco pasa `src="/api/digest"`
 * y el respaldo queda como fallback cacheado si la IA falla en vivo.
 */
export function Digest({ fallback, src, isExample }: { fallback: readonly StreamPart[]; src?: string; isExample: boolean }) {
  const [runId, setRunId] = useState(0);
  return (
    <>
      <Panel label="tu digest" meta={isExample ? "[ejemplo]" : "gemini"} className="content-start">
        <StreamText fallback={fallback} src={src} runId={runId} tokenMs={65} className="text-[13.5px] leading-relaxed" />
        <p className="font-mono text-[10.5px] text-faint">observaciones de tus datos, no diagnóstico médico.</p>
      </Panel>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setRunId((n) => n + 1)} className="glass press rounded-full py-3 text-sm font-semibold">
          ↻ Regenerar
        </button>
        <Link href="/semana/wrapped" className="glass press rounded-full bg-mood/20 py-3 text-center text-sm font-semibold">
          Ver Wrapped
        </Link>
      </div>
    </>
  );
}
