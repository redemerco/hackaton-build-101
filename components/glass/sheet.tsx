"use client";

import { useEffect, useRef, type ReactNode } from "react";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

/**
 * Hoja de vidrio que sube desde abajo. Usa <dialog> nativo: Esc, foco atrapado y backdrop gratis.
 * Se cierra tocando afuera.
 */
export function Sheet({ open, onClose, title, subtitle, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label={title}
      className="glass glass-panel fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[30px] p-0 text-foreground backdrop:bg-ink/55 open:animate-in open:slide-in-from-bottom-8 open:fade-in-0"
    >
      <div className="grid gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5">
        <span aria-hidden className="h-[5px] w-10 justify-self-center rounded-full bg-white/30" />
        <div>
          <h2 className="font-pixel text-[22px] leading-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-dim">{subtitle}</p>}
        </div>
        {children}
      </div>
    </dialog>
  );
}
