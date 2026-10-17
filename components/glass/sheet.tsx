"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

const EXIT_MS = 200;
const DISMISS_DISTANCE_PX = 110;
const DISMISS_VELOCITY = 0.6; // px/ms: un "flick" corto también cierra

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Hoja de vidrio que sube desde abajo. <dialog> nativo (Esc y foco atrapado gratis) con:
 * entrada con resorte, salida rápida, cerrar arrastrando el borde de arriba o tocando afuera, y scroll del fondo bloqueado.
 */
export function Sheet({ open, onClose, title, subtitle, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ startY: number; startT: number; dy: number } | null>(null);

  const finish = useCallback(() => {
    const dialog = ref.current;
    if (!dialog) return;
    delete dialog.dataset.state;
    dialog.style.transition = "";
    dialog.style.transform = "";
    document.documentElement.style.overflow = "";
    if (dialog.open) dialog.close(); // dispara onClose
  }, []);

  /** Sale animando desde donde esté (incluso a mitad de un arrastre). */
  const dismiss = useCallback(() => {
    const dialog = ref.current;
    if (!dialog?.open || dialog.dataset.state === "closing") return;
    if (prefersReducedMotion()) return finish();
    dialog.dataset.state = "closing";
    dialog.style.transition = `transform ${EXIT_MS}ms cubic-bezier(.4,0,1,1)`;
    dialog.style.transform = "translateY(100%)";
    setTimeout(finish, EXIT_MS);
  }, [finish]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.style.overflow = "hidden";
    }
    if (!open && dialog.open) dismiss();
  }, [open, dismiss]);

  useEffect(() => () => { document.documentElement.style.overflow = ""; }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { startY: e.clientY, startT: performance.now(), dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (ref.current) ref.current.style.transition = "none";
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const dialog = ref.current;
    if (!d || !dialog) return;
    d.dy = Math.max(0, e.clientY - d.startY);
    // resistencia: se mueve un poco menos que el dedo para que se sienta "pesada"
    dialog.style.transform = `translateY(${d.dy * 0.92}px)`;
  };
  const onPointerUp = () => {
    const d = drag.current;
    const dialog = ref.current;
    drag.current = null;
    if (!d || !dialog) return;
    const velocity = d.dy / Math.max(1, performance.now() - d.startT);
    if (d.dy > DISMISS_DISTANCE_PX || (d.dy > 24 && velocity > DISMISS_VELOCITY)) return dismiss();
    dialog.style.transition = "transform 420ms cubic-bezier(.34,1.56,.5,1)";
    dialog.style.transform = "";
  };

  return (
    <dialog
      ref={ref}
      data-sheet
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault(); // Esc: salir animando
        dismiss();
      }}
      onClick={(e) => e.target === e.currentTarget && dismiss()}
      aria-label={title}
      className="glass glass-panel fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[88dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl p-0 text-foreground"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="sticky top-0 z-10 grid cursor-grab touch-none gap-3 px-5 pb-1 pt-3 active:cursor-grabbing"
      >
        <span aria-hidden className="h-[5px] w-10 justify-self-center rounded-full bg-white/30" />
        <div>
          <h2 className="font-pixel text-[22px] leading-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-dim">{subtitle}</p>}
        </div>
      </div>
      <div className="grid gap-4 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-3">{children}</div>
    </dialog>
  );
}
