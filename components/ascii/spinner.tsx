"use client";

import { useEffect, useState } from "react";
import { SPINNER } from "@/lib/ascii";

const FRAME_MS = 90;

/** Spinner braille ⠋ con un texto tipo log: "⠋ leyendo sueño…". */
export function Spinner({ label, className }: { label?: string; className?: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), FRAME_MS);
    return () => clearInterval(id);
  }, []);
  return (
    <span role="status" className={className ?? "font-mono text-[13px] text-dim"}>
      {SPINNER[frame]}
      {label ? ` ${label}` : ""}
    </span>
  );
}

/** Cursor de terminal que parpadea, para texto que llega en streaming. */
export function Caret() {
  return <span aria-hidden className="ml-0.5 inline-block h-[1.05em] w-[0.5em] translate-y-[0.15em] bg-current [animation:blink_1s_steps(1)_infinite]" />;
}
