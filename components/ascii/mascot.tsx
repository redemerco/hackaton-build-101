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

/** El "daemon" de la app: su cara refleja tu día. Parpadea para parecer vivo. */
export function Mascot({ mood, className }: { mood: MascotMood; className?: string }) {
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), BLINK_MS);
    }, BLINK_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <pre aria-hidden className={`m-0 font-pixel text-[11px] leading-[1.15] text-mood ${className ?? ""}`}>
      {FACES[mood][isBlinking ? 1 : 0]}
    </pre>
  );
}
