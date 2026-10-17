"use client";

import { useEffect, useRef, useState } from "react";
import { onDaemonReaction } from "@/lib/daemon-events";

const TYPE_MS = 26;
const ROTATE_EVERY_MS = 11000;

/**
 * El globito del daemon, como cowsay: tipea una frase, cambia sola cada tanto,
 * pasa a la siguiente al tocar al daemon y muestra lo que reporta la app (ánimo guardado, sync…).
 */
export function DaemonSpeech({ lines, tone }: { lines: string[]; tone: string }) {
  const [text, setText] = useState(lines[0] ?? "");
  const [shown, setShown] = useState(0);
  const indexRef = useRef(0);
  const linesKey = lines.join("|");

  // tipeo letra por letra cada vez que cambia el texto
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setShown(text.length));
      return () => cancelAnimationFrame(id);
    }
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(i);
      if (i >= text.length) clearInterval(id);
    }, TYPE_MS);
    return () => clearInterval(id);
  }, [text]);

  // rota frases y escucha reacciones (tap al daemon = siguiente frase; la app puede mandar la suya)
  useEffect(() => {
    const all = linesKey.split("|");
    const next = () => {
      indexRef.current = (indexRef.current + 1) % all.length;
      setText(all[indexRef.current]);
    };
    const id = setInterval(next, ROTATE_EVERY_MS);
    const off = onDaemonReaction((r) => (r.text ? setText(r.text) : next()));
    return () => {
      clearInterval(id);
      off();
    };
  }, [linesKey]);

  return (
    <p
      aria-live="polite"
      className="daemon-bubble relative min-h-[3.2em] rounded-xl bg-white/[.07] px-3 py-2 font-mono text-[13px] leading-snug text-foreground/90"
      style={{ ["--bubble-tone" as string]: `var(--${tone})` }}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, shown)}
        <span className="text-transparent">{text.slice(shown)}</span>
      </span>
    </p>
  );
}
