import type { ReactNode } from "react";

/** Clases compartidas con los vitales que son botones (ánimo). */
export const STAT_CARD = "glass glass-panel grid min-w-0 content-start gap-1 rounded-xl px-3 py-3";
export const STAT_LABEL = "font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-dim";
export const STAT_VALUE = "whitespace-nowrap font-mono text-[22px] font-semibold leading-none tabular-nums tracking-tight";
export const STAT_HINT = "truncate font-mono text-xs";

/** Vital chico de vidrio: etiqueta, número grande y una línea ASCII o de contexto. */
export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className={STAT_CARD}>
      <span className={STAT_LABEL}>{label}</span>
      <span className={STAT_VALUE}>{value}</span>
      {hint && <span className={STAT_HINT}>{hint}</span>}
    </div>
  );
}
