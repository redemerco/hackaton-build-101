import type { ReactNode } from "react";

/** Vital chico de vidrio: etiqueta, número grande y una línea ASCII o de contexto. */
export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="glass glass-panel grid min-w-0 gap-0.5 rounded-2xl px-3 py-2.5">
      <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] text-dim">{label}</span>
      <span className="whitespace-nowrap font-mono text-lg font-semibold tabular-nums tracking-tight">{value}</span>
      {hint && <span className="truncate font-mono text-[11px]">{hint}</span>}
    </div>
  );
}
