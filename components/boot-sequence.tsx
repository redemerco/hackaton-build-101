"use client";

import { useEffect, useState } from "react";
import { Daemon } from "@/components/daemon/daemon";

export const BOOT_KEY = "b101-booted";
// Se ejecuta en <head> antes de pintar: si ya booteó en esta sesión, el overlay ni aparece (sin parpadeo).
export const BOOT_GUARD = `try{if(sessionStorage.getItem("${BOOT_KEY}"))document.documentElement.dataset.booted="1"}catch(e){}`;

const LINES = [
  { text: "$ build101 --wake", className: "text-dim" },
  { text: "> leyendo sueño · pulso · git · comidas", className: "text-foreground/90" },
  { text: "> tu cuerpo y tu trabajo, en el mismo gráfico.", className: "text-mood" },
] as const;

/**
 * Primer frame de la sesión: la app "despierta" como una terminal (~1.5 s) y funde a Hoy.
 * Todo el tipeo es CSS (`boot-*` en globals.css); un toque lo saltea. Con reduced-motion no se muestra.
 */
export function BootSequence() {
  const [isSkipped, setIsSkipped] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(BOOT_KEY, "1");
    } catch {
      // sin storage (modo privado): bootea en cada carga, no pasa nada
    }
  }, []);

  if (isSkipped) return null;
  return (
    <div
      aria-hidden
      onClick={() => setIsSkipped(true)}
      className="boot fixed inset-0 z-[60] grid place-items-center bg-ink px-6"
    >
      <div className="grid w-full max-w-sm gap-6">
        <Daemon state="enforma" scale={4} className="boot-mascot justify-self-center" />
        <div className="grid gap-1.5 font-mono text-[13px]">
          {LINES.map((line, i) => (
            <p key={line.text} className={`boot-line ${line.className}`} style={{ ["--n" as string]: line.text.length, ["--i" as string]: i }}>
              {line.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
