import type { ReactNode } from "react";

/** Vacío: qué falta y cómo conseguirlo. El `art` es una línea ASCII opcional ("(._.)"). */
export function EmptyState({ title, description, action, art = "(._.)" }: { title: string; description?: string; action?: ReactNode; art?: string }) {
  return (
    <div className="glass glass-panel flex flex-col items-center gap-2 rounded-3xl px-6 py-8 text-center">
      <span aria-hidden className="font-pixel text-[22px] text-dim">{art}</span>
      <p className="font-medium">{title}</p>
      {description && <p className="text-sm text-dim">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
