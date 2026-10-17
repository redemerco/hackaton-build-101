"use client";

import { useEffect, useRef } from "react";
import { asciiField } from "@/lib/ascii";

const FRAME_MS = 83; // ~12 fps: alcanza para que "respire" sin gastar batería
const DEFAULT_BPM = 60;
const DEFAULT_STRESS = 0.3;

// Lee el pulso de <body data-bpm data-stress> (lo setea <Pulse/> en cada página) para no necesitar contexto.
function readPulse(): { bpm: number; stress: number } {
  const { bpm, stress } = document.body.dataset;
  return { bpm: Number(bpm) || DEFAULT_BPM, stress: stress ? Number(stress) : DEFAULT_STRESS };
}

/** Fondo vivo fijo detrás de toda la app. Decorativo: aria-hidden. */
export function AsciiField() {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cols = 0;
    let rows = 0;
    const resize = () => {
      const probe = document.createElement("span");
      probe.textContent = "M".repeat(50);
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
      el.appendChild(probe);
      const charW = probe.getBoundingClientRect().width / 50;
      probe.remove();
      const lineH = parseFloat(getComputedStyle(el).lineHeight) || 12;
      cols = Math.ceil(window.innerWidth / charW);
      rows = Math.ceil(window.innerHeight / lineH);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (t: number) => {
      el.textContent = asciiField({ cols, rows, t, ...readPulse() });
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      draw(1.3);
      return () => window.removeEventListener("resize", resize);
    }

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // pausa con la pestaña oculta o con una hoja abierta (no se ve y le saca GPU al vidrio de la hoja)
      if (document.hidden || now - last < FRAME_MS || document.querySelector("dialog[open]")) return;
      last = now;
      draw(now / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ viewTransitionName: "ascii-field" }}>
      <pre
        ref={ref}
        className="m-0 h-full w-full overflow-hidden whitespace-pre font-mono text-[10px] leading-[12px] text-transparent"
        style={{
          background: "linear-gradient(170deg, var(--sleep) 0%, var(--work) 46%, var(--heart) 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          opacity: "var(--field-alpha)",
        }}
      />
      {/* oscurece hacia abajo para que el texto sobre vidrio se lea */}
      <div className="absolute inset-0 bg-linear-to-b from-ink/10 via-ink/55 to-ink/85" />
    </div>
  );
}

/** Cada página declara el pulso que mueve el fondo. */
export function Pulse({ bpm, stress }: { bpm: number; stress: number }) {
  useEffect(() => {
    document.body.dataset.bpm = String(bpm);
    document.body.dataset.stress = String(stress);
    document.documentElement.style.setProperty("--beat", `${(60 / bpm).toFixed(3)}s`);
  }, [bpm, stress]);
  return null;
}
