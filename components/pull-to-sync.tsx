"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SPINNER } from "@/lib/ascii";
import { reactDaemon } from "@/lib/daemon-events";

// Endpoints que se llaman al soltar.
const SYNC_ENDPOINTS = ["/api/sync/github", "/api/sync/health"] as const;
const TRIGGER_PX = 72;
const MAX_PULL_PX = 110;
const RESISTANCE = 0.5;
const DONE_MS = 1400;

type Phase = "idle" | "pulling" | "armed" | "syncing" | "done" | "error";

/**
 * Tirar hacia abajo desde arriba de todo para sincronizar (en una PWA de iOS no existe nativo).
 * El estado cambia a mitad del gesto ("soltá para sincronizar"); la acción corre recién al soltar.
 */
export function PullToSync({ children }: { children: ReactNode }) {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pull, setPull] = useState(0);
  const [frame, setFrame] = useState(0);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    phaseRef.current = phase; // los listeners de touch leen la fase sin re-suscribirse
  }, [phase]);

  useEffect(() => {
    if (phase !== "syncing") return;
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 90);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let current = 0;

    const sync = async () => {
      setPhase("syncing");
      setPull(TRIGGER_PX * 0.6);
      try {
        const results = await Promise.allSettled(SYNC_ENDPOINTS.map((url) => fetch(url, { cache: "no-store" })));
        const isOk = results.some((r) => r.status === "fulfilled" && r.value.ok);
        router.refresh();
        setPhase(isOk ? "done" : "error");
        reactDaemon(isOk ? { mood: "happy", text: "datos al día. gracias." } : { mood: "sad", text: "no pude sincronizar. probá de nuevo." });
      } catch (error) {
        console.error("[pull-to-sync]", error);
        setPhase("error");
      }
      setTimeout(() => {
        setPhase("idle");
        setPull(0);
      }, DONE_MS);
    };

    const onStart = (e: TouchEvent) => {
      const isBusy = phaseRef.current === "syncing" || phaseRef.current === "done" || phaseRef.current === "error";
      if (window.scrollY > 0 || isBusy || document.querySelector("dialog[open]")) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
        if (current === 0) start = null; // gesto horizontal o hacia arriba: no es nuestro
        return;
      }
      e.preventDefault(); // frena el rebote nativo mientras tiramos nosotros
      current = Math.min(MAX_PULL_PX, dy * RESISTANCE);
      setPull(current);
      setPhase(current >= TRIGGER_PX ? "armed" : "pulling");
    };
    const onEnd = () => {
      if (!start) return;
      start = null;
      const shouldSync = current >= TRIGGER_PX;
      current = 0;
      if (shouldSync) return void sync();
      setPull(0);
      setPhase("idle");
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const label: Record<Phase, string> = {
    idle: "",
    pulling: "↓ tirá para sincronizar",
    armed: "↑ soltá para sincronizar",
    syncing: `${SPINNER[frame]} sincronizando…`,
    done: "[ok] sincronizado",
    error: "[warn] no se pudo sincronizar",
  };
  const isTracking = phase === "pulling" || phase === "armed";

  return (
    <div className="relative">
      <p
        aria-live="polite"
        className={`pointer-events-none absolute inset-x-0 top-0 text-center font-mono text-[13px] ${phase === "armed" || phase === "done" ? "text-mood" : phase === "error" ? "text-heart" : "text-dim"}`}
        style={{ opacity: Math.min(1, pull / TRIGGER_PX), transform: `translateY(${pull / 2 - 20}px)` }}
      >
        {label[phase]}
      </p>
      <div
        ref={contentRef}
        style={{
          transform: pull ? `translateY(${pull}px)` : undefined,
          transition: isTracking ? "none" : "transform 420ms cubic-bezier(.34,1.56,.5,1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
