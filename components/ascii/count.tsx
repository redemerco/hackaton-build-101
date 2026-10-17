"use client";

import { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";
import { useScramble } from "use-scramble";

/** Número que cuenta desde 0 cuando entra la pantalla (y anima cada cambio). Respeta reduced-motion. */
export function Count({ value, pad = 0, locale = "es-AR" }: { value: number; pad?: number; locale?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <NumberFlow
      value={shown}
      locales={locale}
      format={{ minimumIntegerDigits: pad || 1, useGrouping: true }}
      className="tabular-nums"
    />
  );
}

/** Duración "7h12" con horas y minutos contando por separado. */
export function DurationCount({ minutes }: { minutes: number }) {
  const m = Math.max(0, Math.round(minutes));
  return (
    <span className="tabular-nums">
      <Count value={Math.floor(m / 60)} />h<Count value={m % 60} pad={2} />
    </span>
  );
}

/** Texto que se "decodifica" con caracteres al azar antes de quedarse quieto (cifras de la IA). */
export function Decode({ text, className }: { text: string; className?: string }) {
  const [isReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const { ref } = useScramble({ text, speed: isReduced ? 100 : 0.5, tick: 2, step: 1, scramble: isReduced ? 0 : 6, seed: 2, range: [48, 57], overdrive: false });
  // el lector de pantalla lee el valor final, nunca los dígitos mezclados
  return (
    <span className={className}>
      <span ref={ref} aria-hidden />
      <span className="sr-only">{text}</span>
    </span>
  );
}
