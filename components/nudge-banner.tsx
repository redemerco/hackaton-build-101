"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";

/** Versión in-app del nudge (la push del sistema la dibuja iOS). Se descarta con la X. */
export function NudgeBanner({ text }: { text: string }) {
  const [isVisible, setIsVisible] = useState(true);
  if (!isVisible) return null;
  return (
    <div role="status" className="glass glass-panel flex items-start gap-3 rounded-3xl px-4 py-3 shadow-[inset_0_0_0_1px_rgb(241_225_91/.35)]">
      <p className="flex-1 font-mono text-[11.5px] leading-snug">
        <span className="text-mood">[nudge]</span> {text}
      </p>
      <button type="button" onClick={() => setIsVisible(false)} aria-label="Descartar" className="press -m-1 rounded-full p-1 text-dim">
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
