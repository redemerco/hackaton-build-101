import type { ReactNode } from "react";

/** Vacío: qué falta y cómo conseguirlo. El `art` es una línea ASCII opcional ("(._.)"). */
export function EmptyState({ title, description, action, art = "(._.)" }: { title: string; description?: string; action?: ReactNode; art?: string }) {
  return (
    <div className="glass glass-panel flex flex-col items-center gap-2 rounded-2xl px-6 py-9 text-center">
      <span aria-hidden className="idle-bob font-pixel text-[33px] text-dim">{art}</span>
      <p className="text-base font-medium">{title}</p>
      {description && <p className="max-w-[32ch] text-[15px] leading-relaxed text-dim">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
