import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PanelProps = {
  /** Etiqueta chica en mayúsculas arriba a la izquierda ("sueño · anoche"). */
  label?: string;
  /** Dato o acción chica arriba a la derecha. */
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** Tarjeta de vidrio legible (nivel "panel"). Es el contenedor base de todas las pantallas. */
export function Panel({ label, meta, className, children }: PanelProps) {
  return (
    <section className={cn("glass glass-panel grid gap-2.5 rounded-2xl px-4 py-3.5", className)}>
      {(label || meta) && (
        <div className="flex items-center justify-between gap-2 font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-dim">
          <span>{label}</span>
          {meta && <span className="normal-case tracking-normal tabular-nums">{meta}</span>}
        </div>
      )}
      {children}
    </section>
  );
}
