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
const EXIT_MIN_MS = 120;
const EXIT_MAX_MS = 260;
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
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const finish = useCallback(() => {
    const dialog = ref.current;
    if (!dialog) return;
    clearTimeout(exitTimer.current);
    delete document.documentElement.dataset.sheet;
    delete dialog.dataset.state;
    dialog.style.transition = "";
    dialog.style.transform = "";
    document.documentElement.style.overflow = "";
    if (dialog.open) dialog.close(); // dispara onClose
  }, []);

  /**
   * Sale animando desde donde esté (incluso a mitad de un arrastre).
   * Con `velocity` (px/ms de un flick) la salida conserva la inercia del dedo en vez de durar siempre lo mismo.
   */
  const dismiss = useCallback((velocity?: number) => {
    const dialog = ref.current;
    if (!dialog?.open || dialog.dataset.state === "closing") return;
    if (prefersReducedMotion()) return finish();
    const remaining = dialog.getBoundingClientRect().height;
    const ms = velocity ? Math.min(EXIT_MAX_MS, Math.max(EXIT_MIN_MS, remaining / velocity)) : EXIT_MS;
    dialog.dataset.state = "closing";
    delete document.documentElement.dataset.sheet; // el fondo vuelve a su tamaño mientras la hoja baja
    dialog.style.transition = `transform ${ms}ms cubic-bezier(.32,.72,0,1)`;
    dialog.style.transform = "translateY(100%)";
    exitTimer.current = setTimeout(finish, ms);
  }, [finish]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && dialog.dataset.state === "closing") {
      // la reabrieron mientras salía: cancelar la salida y volver a su lugar
      clearTimeout(exitTimer.current);
      delete dialog.dataset.state;
      document.documentElement.dataset.sheet = "open";
      dialog.style.transition = "transform 420ms cubic-bezier(.34,1.56,.5,1)";
      dialog.style.transform = "";
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.style.overflow = "hidden";
      document.documentElement.dataset.sheet = "open";
    }
    if (!open && dialog.open) dismiss();
  }, [open, dismiss]);

  useEffect(() => () => {
    clearTimeout(exitTimer.current);
    delete document.documentElement.dataset.sheet;
    document.documentElement.style.overflow = "";
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (ref.current?.dataset.state === "closing") return;
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
    if (d.dy > 24 && velocity > DISMISS_VELOCITY) return dismiss(velocity);
    if (d.dy > DISMISS_DISTANCE_PX) return dismiss();
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
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
      aria-label={title}
      className="glass fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[88dvh] w-full max-w-md overflow-hidden rounded-t-3xl bg-[rgb(16_19_28/.82)] p-0 text-foreground open:flex open:flex-col"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="grid shrink-0 cursor-grab touch-none gap-3 px-5 pb-1 pt-3 active:cursor-grabbing"
      >
        <span aria-hidden className="h-[5px] w-10 justify-self-center rounded-full bg-white/30" />
        <div>
          <h2 className="font-pixel text-[22px] leading-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-dim">{subtitle}</p>}
        </div>
      </div>
      <div className="grid min-h-0 gap-4 overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-3">{children}</div>
    </dialog>
  );
}
