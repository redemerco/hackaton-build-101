"use client";

import { useEffect, useState } from "react";

export type MascotMood = "ok" | "tired" | "fried" | "streak";

const FACES: Record<MascotMood, [open: string, blink: string]> = {
  ok: [".-------.\n| ^   ^ |\n|   w   |\n'-------'", ".-------.\n| -   - |\n|   w   |\n'-------'"],
  tired: [".-------.\n| -   - |\n|   o   |\n'-------'", ".-------.\n| _   _ |\n|   o   |\n'-------'"],
  fried: [".-------. z\n| =   = |z\n|   ~   |\n'-------'", ".-------. z\n| _   _ |z\n|   ~   |\n'-------'"],
  streak: [".-------. *\n| O   O |\n|  \\_/  |*\n'-------'", ".-------. *\n| ^   ^ |\n|  \\_/  |*\n'-------'"],
};
const BLINK_EVERY_MS = 3800;
const BLINK_MS = 160;

/** El "daemon" de la app: su cara refleja tu día. Respira (sube y baja 1.5px) y parpadea para parecer vivo. */
export function Mascot({ mood, size = "md", className }: { mood: MascotMood; size?: "md" | "lg"; className?: string }) {
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let blinkTimer: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      setIsBlinking(true);
      blinkTimer = setTimeout(() => setIsBlinking(false), BLINK_MS);
    }, BLINK_EVERY_MS);
    return () => {
      clearInterval(id);
      clearTimeout(blinkTimer);
    };
  }, []);

  // Departure Mono solo queda nítida en múltiplos de 11px
  const fontSize = size === "lg" ? "text-[22px]" : "text-[11px]";
  return (
    <pre aria-hidden className={`idle-bob m-0 font-pixel ${fontSize} leading-[1.15] text-mood ${className ?? ""}`}>
      {FACES[mood][isBlinking ? 1 : 0]}
    </pre>
  );
}
