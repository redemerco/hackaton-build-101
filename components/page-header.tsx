import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 pb-1">
      <div>
        <h1 className="font-pixel text-[22px] leading-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-dim">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
