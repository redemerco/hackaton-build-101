"use client";

import { useEffect, useMemo, useState } from "react";
import { composeAccessory, composeBody, STATES, toRuns, type DaemonState, type Frame } from "@/lib/daemon";
import { SIZE } from "@/lib/daemon-art";
import { onDaemonReaction, reactDaemon, type DaemonReaction } from "@/lib/daemon-events";
import { cn } from "@/lib/utils";

const REACTION_MS = 700;
const GLANCE_MS = 900;
const GLANCE_EVERY_MS = 7000;
const CHEW_MS = 260;
const BEATS_PER_BREATH = 4;

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** ±30% para que no parezca un metrónomo. */
const jitter = (ms: number) => ms * (0.7 + Math.random() * 0.6);

const REACTION_FACE: Record<DaemonReaction["mood"], Frame> = {
  happy: { eyes: "happy", mouth: "grin" },
  surprised: { eyes: "wide", mouth: "yawn" },
  sad: { eyes: "tired", mouth: "wavy" },
};

type DaemonProps = {
  state: DaemonState;
  /** Escala entera del pixel art (3 → 120 px). Entera para que siempre quede nítido. */
  scale?: 2 | 3 | 4;
  /** Pulso en reposo: respira una vez cada 4 latidos. */
  bpm?: number;
  /** Si se puede tocar (reacciona y habla). */
  isInteractive?: boolean;
  className?: string;
};

/**
 * El daemon vivo: respira con tu pulso, parpadea según tu cansancio, mira de reojo,
 * mueve su accesorio y reacciona a lo que pasa en la app (lib/daemon-events).
 */
export function Daemon({ state, scale = 3, bpm = 60, isInteractive = false, className }: DaemonProps) {
  const spec = STATES[state];
  const [frame, setFrame] = useState<Frame>({});
  const [reaction, setReaction] = useState<Frame | null>(null);
  const [bounceId, setBounceId] = useState(0);

  // parpadeo: el intervalo y la duración salen del estado (cansado: lento y pesado)
  useEffect(() => {
    if (prefersReducedMotion() || spec.blinkEveryMs === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setFrame((f) => ({ ...f, eyes: "blink" }));
        timer = setTimeout(() => {
          setFrame((f) => ({ ...f, eyes: undefined }));
          schedule();
        }, spec.blinkMs);
      }, jitter(spec.blinkEveryMs));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [spec.blinkEveryMs, spec.blinkMs]);

  // mirada de reojo cada tanto (no cuando duerme)
  useEffect(() => {
    if (prefersReducedMotion() || state === "durmiendo") return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        const dir = Math.random() < 0.5 ? -1 : 1;
        setFrame((f) => ({ ...f, gaze: [dir, 0] }));
        timer = setTimeout(() => {
          setFrame((f) => ({ ...f, gaze: undefined }));
          schedule();
        }, GLANCE_MS);
      }, jitter(GLANCE_EVERY_MS));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [state]);

  // comiendo: mastica
  useEffect(() => {
    if (prefersReducedMotion() || state !== "comiendo") return;
    const id = setInterval(() => setFrame((f) => ({ ...f, mouth: f.mouth === "flat" ? undefined : "flat" })), CHEW_MS);
    return () => clearInterval(id);
  }, [state]);

  // reacciones que vienen de la app
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const off = onDaemonReaction((r) => {
      clearTimeout(timer);
      setReaction(REACTION_FACE[r.mood]);
      setBounceId((n) => n + 1);
      timer = setTimeout(() => setReaction(null), REACTION_MS);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);

  const body = useMemo(() => toRuns(composeBody(state, { ...frame, ...reaction })), [state, frame, reaction]);
  const accessory = useMemo(() => (spec.acc ? toRuns(composeAccessory(spec.acc)) : []), [spec.acc]);
  const breathS = ((60 / Math.max(30, bpm)) * BEATS_PER_BREATH).toFixed(2);
  const px = SIZE * scale;

  const svg = (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={px}
      height={px}
      shapeRendering="crispEdges"
      aria-hidden
      className="overflow-visible"
    >
      <g className="daemon-breath" style={{ animationDuration: `${breathS}s` }}>
        {body.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}
      </g>
      {spec.acc && (
        <g className={`daemon-acc daemon-acc-${spec.acc}`}>
          {accessory.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}
        </g>
      )}
    </svg>
  );

  const label = `daemon: ${spec.title.toLowerCase()}`;
  if (!isInteractive) {
    return (
      <span role="img" aria-label={label} key={bounceId} className={cn("daemon-bounce inline-block", className)}>
        {svg}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={`${label}. Tocalo para que hable`}
      onClick={() => reactDaemon({ mood: "surprised" })}
      key={bounceId}
      className={cn("daemon-bounce press inline-block rounded-2xl", className)}
    >
      {svg}
    </button>
  );
}
