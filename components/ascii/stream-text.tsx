"use client";

import { useEffect, useRef, useState } from "react";
import { DataChip, type Domain } from "@/components/ascii/data-chip";
import { Caret } from "@/components/ascii/spinner";

export type StreamPart = string | { chip: string; kind: Domain };

type StreamTextProps = {
  /** Texto de respaldo (o de ejemplo). Se "tipea" si no hay `src` o si `src` falla. */
  fallback: readonly StreamPart[];
  /** Endpoint que devuelve texto en streaming (p. ej. `new Response(streamText(...))`). POST. */
  src?: string;
  /** Cambiarlo reinicia el stream (botón "Regenerar"). */
  runId?: number;
  tokenMs?: number;
  className?: string;
  /** "live" si vino de `src`; "fallback" si se tipeó el respaldo. Para rotular "[ejemplo]" en la UI. */
  onSource?: (source: "live" | "fallback") => void;
};

type Token = { text: string } | { chip: string; kind: Domain };

function tokenize(parts: readonly StreamPart[]): Token[] {
  return parts.flatMap((p): Token[] =>
    typeof p === "string" ? p.split(/(?<=\s)/).filter(Boolean).map((text) => ({ text })) : [p],
  );
}

/** Texto que llega de a pedazos con cursor de terminal. Con `src` lee el stream real; si falla, tipea el respaldo. */
export function StreamText({ fallback, src, runId = 0, tokenMs = 55, className, onSource }: StreamTextProps) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isDone, setIsDone] = useState(false);

  const onSourceRef = useRef(onSource);
  useEffect(() => {
    onSourceRef.current = onSource;
  }, [onSource]);

  // Depende del contenido, no de la identidad del array: pasar `fallback={[texto]}` inline no reinicia el stream.
  const fallbackKey = JSON.stringify(fallback);

  useEffect(() => {
    let isCancelled = false;
    const abort = new AbortController(); // regenerar o salir de la pantalla corta el POST en curso
    const timers: ReturnType<typeof setTimeout>[] = [];
    const all = tokenize(JSON.parse(fallbackKey) as StreamPart[]);

    const typeFallback = () => {
      onSourceRef.current?.("fallback");
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setTokens(all);
        setIsDone(true);
        return;
      }
      let elapsed = 0;
      all.forEach((_, i) => {
        elapsed += tokenMs + Math.random() * tokenMs;
        timers.push(setTimeout(() => !isCancelled && setTokens(all.slice(0, i + 1)), elapsed));
      });
      timers.push(setTimeout(() => !isCancelled && setIsDone(true), elapsed + 10));
    };

    const readStream = async (url: string) => {
      const res = await fetch(url, { method: "POST", signal: abort.signal });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      onSourceRef.current?.("live");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done || isCancelled) break;
        text += value;
        setTokens([{ text }]);
      }
      if (!isCancelled) setIsDone(true);
    };

    timers.push(setTimeout(() => {
      setTokens([]);
      setIsDone(false);
      if (!src) return typeFallback();
      readStream(src).catch((error) => {
        if (abort.signal.aborted) return;
        console.error("[stream-text] falló, uso el respaldo", error);
        if (!isCancelled) typeFallback();
      });
    }, 0));

    return () => {
      isCancelled = true;
      abort.abort();
      timers.forEach(clearTimeout);
    };
  }, [fallbackKey, src, runId, tokenMs]);

  return (
    <p className={className} aria-busy={!isDone}>
      {/* key por índice: solo las palabras nuevas montan y hacen el fade; las anteriores quedan quietas */}
      {tokens.map((t, i) =>
        "chip" in t ? (
          <span key={i} className="token-in"><DataChip kind={t.kind}>{t.chip}</DataChip></span>
        ) : (
          <span key={i} className="token-in">{t.text}</span>
        ),
      )}
      {!isDone && <Caret />}
    </p>
  );
}
