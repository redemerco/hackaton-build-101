"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";

/** Versión in-app del nudge (la push del sistema la dibuja iOS). Se descarta con la X. */
export function NudgeBanner({ text }: { text: string }) {
  const [isVisible, setIsVisible] = useState(true);
  if (!isVisible) return null;
  return (
    <div role="status" className="glass glass-panel flex items-start gap-2 rounded-2xl py-3 pl-4 pr-1 shadow-[inset_0_0_0_1px_rgb(241_225_91/.35)]">
      <p className="flex-1 pt-0.5 text-[15px] leading-snug text-pretty">
        <span className="mr-1 font-mono text-[13px] text-mood">[nudge]</span>{text}
      </p>
      <button type="button" onClick={() => setIsVisible(false)} aria-label="Descartar" className="press -my-2 grid size-11 shrink-0 place-items-center rounded-full text-dim">
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
