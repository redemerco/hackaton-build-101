"use client";

import { useEffect, useRef } from "react";

const CHARS = " .:-=+*#%@";
const CELLS = [24, 16, 10, 6] as const; // tamaño de celda por pasada, de grueso a fino
const STEP_MS = 1100;
const REVEAL_MS = 900;
const FRAME_MS = 66;
const BG = "#07080c";
const SCAN_COLOR = "255,179,64"; // --food

type AsciiScanProps = {
  /** URL de la foto (object URL del input de cámara o data URL). */
  src: string;
  /** Se llama cuando termina el escaneo (para mostrar el resultado). */
  onDone?: () => void;
  className?: string;
};

/** Pinta la imagen en el canvas recortándola para cubrirlo (como object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function asciiPass(ctx: CanvasRenderingContext2D, pixels: Uint8ClampedArray, w: number, h: number, cell: number, y0: number, y1: number) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, y0, w, y1 - y0);
  ctx.font = `${cell * 1.15}px ui-monospace, Menlo, monospace`;
  ctx.textBaseline = "top";
  for (let y = Math.floor(y0 / cell) * cell; y < y1; y += cell) {
    for (let x = 0; x < w; x += cell * 0.6) {
      const sx = Math.min(w - 1, Math.floor(x + cell * 0.3));
      const sy = Math.min(h - 1, Math.floor(y + cell / 2));
      const i = (sy * w + sx) * 4;
      const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      ctx.fillStyle = `rgb(${Math.min(255, r * 1.15)},${Math.min(255, g * 1.15)},${Math.min(255, b * 1.15)})`;
      ctx.fillText(CHARS[Math.floor(lum * (CHARS.length - 1))], x, y);
    }
  }
}

/** La foto se vuelve ASCII de grueso a fino mientras la IA analiza, y al final aparece la foto real. */
export function AsciiScan({ src, onDone, className }: AsciiScanProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return;

    let raf = 0;
    let isCancelled = false;
    const img = new Image();
    img.onload = () => {
      if (isCancelled) return;
      const { width: w, height: h } = canvas;
      drawCover(ctx, img, w, h);
      const pixels = ctx.getImageData(0, 0, w, h).data;
      const photo = document.createElement("canvas");
      photo.width = w;
      photo.height = h;
      photo.getContext("2d")?.drawImage(canvas, 0, 0);

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        asciiPass(ctx, pixels, w, h, CELLS[CELLS.length - 1], 0, h);
        onDoneRef.current?.();
        return;
      }

      const start = performance.now();
      const scanEnd = STEP_MS * CELLS.length;
      let lastDraw = 0;
      const frame = (now: number) => {
        // ~15 fps: la pasada fina son ~10k fillText, no hace falta repetirla a 60 fps
        if (now - lastDraw < FRAME_MS) {
          raf = requestAnimationFrame(frame);
          return;
        }
        lastDraw = now;
        const t = now - start;
        if (t < scanEnd) {
          const stage = Math.floor(t / STEP_MS);
          const lineY = Math.floor(((t % STEP_MS) / STEP_MS) * h);
          if (stage > 0) asciiPass(ctx, pixels, w, h, CELLS[stage - 1], lineY, h);
          else { ctx.fillStyle = BG; ctx.fillRect(0, lineY, w, h - lineY); }
          asciiPass(ctx, pixels, w, h, CELLS[stage], 0, lineY);
          const glow = ctx.createLinearGradient(0, lineY - 30, 0, lineY + 2);
          glow.addColorStop(0, `rgba(${SCAN_COLOR},0)`);
          glow.addColorStop(1, `rgba(${SCAN_COLOR},.55)`);
          ctx.fillStyle = glow;
          ctx.fillRect(0, lineY - 30, w, 32);
          raf = requestAnimationFrame(frame);
          return;
        }
        // revelado: la foto real aparece sobre el ASCII fino
        asciiPass(ctx, pixels, w, h, CELLS[CELLS.length - 1], 0, h);
        ctx.globalAlpha = Math.min(1, (t - scanEnd) / REVEAL_MS);
        ctx.drawImage(photo, 0, 0);
        ctx.globalAlpha = 1;
        if (t < scanEnd + REVEAL_MS) raf = requestAnimationFrame(frame);
        else onDoneRef.current?.();
      };
      raf = requestAnimationFrame(frame);
    };
    img.onerror = () => console.error("[ascii-scan] no se pudo cargar la imagen");
    img.src = src;

    return () => {
      isCancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [src]);

  return <canvas ref={canvasRef} width={536} height={428} aria-label="Foto de la comida analizándose" className={className} />;
}
