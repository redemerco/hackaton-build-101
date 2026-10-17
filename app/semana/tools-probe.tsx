"use client";

import { useState } from "react";
import { Spinner } from "@/components/ascii/spinner";
import { Panel } from "@/components/glass/panel";

type ToolResult = { name: string; source: string; description: string; result: unknown };

/** Botón de prueba: corre las tools de lectura (/api/tools) y muestra qué trae cada app conectada. */
export function ToolsProbe() {
  const [tools, setTools] = useState<ToolResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const run = async () => {
    setIsLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/tools", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setTools(((await res.json()) as { tools: ToolResult[] }).tools);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const withData = tools?.filter((t) => t.result !== null).length ?? 0;

  return (
    <Panel label="tools · apps conectadas" meta={tools ? `${withData}/${tools.length} con datos` : undefined}>
      <button type="button" onClick={run} disabled={isLoading} className="glass press h-11 rounded-full text-[15px] font-semibold disabled:opacity-60">
        {isLoading ? <Spinner label="leyendo tus apps" className="font-mono text-[13px]" /> : tools ? "↻ Volver a leer" : "Probar tools"}
      </button>
      {error && <p className="font-mono text-[13px] text-heart">No se pudieron leer las tools.</p>}
      {tools && (
        <ul className="grid gap-3">
          {tools.map((t) => (
            <li key={t.name} className="grid gap-1">
              <p className="flex items-baseline justify-between gap-2 font-mono text-[13px]">
                <span>
                  <span className={t.result === null ? "text-dim" : "text-work"}>{t.result === null ? "○" : "●"}</span> {t.name}
                </span>
                <span className="text-xs text-faint">{t.source}</span>
              </p>
              {t.result === null ? (
                <p className="text-xs text-dim">sin datos todavía</p>
              ) : (
                <pre className="m-0 max-h-40 overflow-auto rounded-lg bg-black/25 px-3 py-2 font-mono text-[11.5px] leading-snug text-foreground/85">
                  {JSON.stringify(t.result, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
