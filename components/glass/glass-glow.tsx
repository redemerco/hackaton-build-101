"use client";

import { useEffect } from "react";

/** Un solo listener global: el brillo del vidrio sigue al dedo/puntero (vars --mx/--my de la utilidad `glass`). */
export function GlassGlow() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const glass = (e.target as Element | null)?.closest?.(".glass") as HTMLElement | null;
      if (!glass) return;
      const r = glass.getBoundingClientRect();
      glass.style.setProperty("--mx", `${e.clientX - r.left}px`);
      glass.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    // iOS Safari solo aplica :active si hay un listener de touchstart: sin esto, `press` no se aplasta en el iPhone.
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onMove, { passive: true });
    return () => {
      document.removeEventListener("touchstart", noop);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onMove);
    };
  }, []);
  return null;
}
