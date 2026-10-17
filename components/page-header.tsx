import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 pb-1">
      <div className="min-w-0">
        <h1 className="font-pixel text-[33px] leading-none">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-dim">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
