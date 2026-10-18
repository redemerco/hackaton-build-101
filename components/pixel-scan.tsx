"use client";

import { useEffect, useRef, useState } from "react";

// La foto aparece como mosaico pixel (como los compañeros) y se va definiendo hasta quedar nítida,
// con esquinas de visor y una franja de luz que la recorre mientras la IA mira el plato.
const GRID = [6, 12, 24, 48, 96]; // bloques a lo ancho por pasada, de grueso a fino
const STEP_MS = 520;
const REVEAL_MS = 500;

type PixelScanProps = {
  /** URL de la foto (object URL del input de cámara o data URL). */
  src: string;
  /** Se llama cuando termina el escaneo (para mostrar el resultado). */
  onDone?: () => void;
  className?: string;
};

/** Recorte tipo object-fit: cover de la imagen dentro de w×h. */
function coverRect(img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  return [(w - dw) / 2, (h - dh) / 2, dw, dh] as const;
}

export function PixelScan({ src, onDone, className }: PixelScanProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDoneRef = useRef(onDone);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let raf = 0;
    let isCancelled = false;
    const finish = () => {
      setIsDone(true);
      onDoneRef.current?.();
    };
    const img = new Image();
    img.onload = () => {
      if (isCancelled) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round((canvas.clientWidth || 536) * dpr);
      canvas.height = Math.round((canvas.clientHeight || 428) * dpr);
      const { width: w, height: h } = canvas;
      const rect = coverRect(img, w, h);
      // un canvas chico por pasada: se dibuja la foto en pocos píxeles y se estira sin suavizado
      const small = document.createElement("canvas");
      const smallCtx = small.getContext("2d");
      const drawMosaic = (cols: number) => {
        if (!smallCtx) return;
        small.width = cols;
        small.height = Math.max(1, Math.round((cols * h) / w));
        smallCtx.drawImage(img, ...coverRect(img, small.width, small.height));
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, 0, 0, w, h);
      };
      const drawPhoto = (alpha: number) => {
        ctx.globalAlpha = alpha;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, ...rect);
        ctx.globalAlpha = 1;
      };

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        drawPhoto(1);
        finish();
        return;
      }

      const start = performance.now();
      const scanEnd = STEP_MS * GRID.length;
      let lastStage = -1;
      const frame = (now: number) => {
        const t = now - start;
        if (t < scanEnd) {
          const stage = Math.floor(t / STEP_MS);
          if (stage !== lastStage) {
            drawMosaic(GRID[stage]);
            lastStage = stage;
          }
        } else {
          drawMosaic(GRID[GRID.length - 1]);
          drawPhoto(Math.min(1, (t - scanEnd) / REVEAL_MS));
        }
        if (t < scanEnd + REVEAL_MS) raf = requestAnimationFrame(frame);
        else finish();
      };
      raf = requestAnimationFrame(frame);
    };
    img.onerror = () => console.error("[pixel-scan] no se pudo cargar la imagen");
    img.src = src;

    return () => {
      isCancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [src]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <canvas ref={canvasRef} width={536} height={428} role="img" aria-label="Foto de la comida analizándose" className="block size-full" />
      {/* visor: 4 esquinas que laten y una franja de luz que barre la foto */}
      {!isDone && <span aria-hidden className="scan-beam pointer-events-none absolute inset-x-0 h-16" />}
      {(["left-3 top-3 border-l-2 border-t-2", "right-3 top-3 border-r-2 border-t-2", "bottom-3 left-3 border-b-2 border-l-2", "bottom-3 right-3 border-b-2 border-r-2"] as const).map((pos) => (
        <span key={pos} aria-hidden className={`pointer-events-none absolute size-6 rounded-[3px] border-food transition-opacity duration-500 ${isDone ? "opacity-0" : "scan-corner"} ${pos}`} />
      ))}
    </div>
  );
}
