"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ascii/spinner";
import { ProviderIcon } from "@/components/connect/provider-icons";
import { Sheet } from "@/components/glass/sheet";
import { NOTE_MAX, type Metric, type Report, type Risk } from "@/lib/report-core";
import { cn } from "@/lib/utils";

type Preview = { id: string; report: Report; metrics: Metric[]; note: string };
type Phase = "compose" | "thinking" | "preview" | "sending" | "sent";

const RISK_STYLE: Record<Risk, { label: string; color: string }> = {
  bajo: { label: "carga baja", color: "var(--work)" },
  medio: { label: "carga media", color: "var(--food)" },
  alto: { label: "carga alta", color: "var(--heart)" },
};
const PROMPTS = ["Estoy reventado, 3 proyectos a la vez", "Bien, pero con demasiadas reuniones", "Todo tranqui, buen día de foco"];

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `error ${res.status}`);
  return data;
}

/** Vista previa con la misma forma que el mensaje de Slack: lo que ves es lo que llega. Las métricas se prenden y apagan acá. */
function SlackPreview({ name, preview, shared, withNote, onToggle, onToggleNote }: {
  name: string;
  preview: Preview;
  shared: Set<string>;
  withNote: boolean;
  onToggle: (key: string) => void;
  onToggleNote: () => void;
}) {
  const { report, metrics, note } = preview;
  const risk = RISK_STYLE[report.riesgo];
  return (
    <div className="grid gap-2.5 rounded-xl border border-white/10 bg-[#1a1d21] p-3.5 text-[14px] leading-snug text-[#d1d2d3]">
      <p className="flex items-center gap-2 text-[13px]">
        <span className="grid size-7 place-items-center rounded-md bg-mood/20 font-mono text-[11px] font-bold text-mood">b1</span>
        <span className="font-bold text-white">build101</span>
        <span className="rounded bg-white/10 px-1 text-[10px] font-semibold text-[#ababad]">APP</span>
      </p>
      <p className="text-[16px] font-bold text-white">{name} · cómo vengo hoy</p>
      <p className="flex items-start gap-2">
        <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: risk.color }} />
        <span>
          <b className="text-white">{report.titular}</b>
          <span className="block text-[12px] text-[#ababad]">{risk.label}</span>
        </span>
      </p>
      <ul className="grid gap-1 pl-1">
        {report.observaciones.map((o) => <li key={o}>• {o}</li>)}
      </ul>
      <p><b className="text-white">Pido:</b> {report.pedido}</p>
      {note && (
        <button type="button" onClick={onToggleNote} aria-pressed={withNote} className={cn("press rounded-lg border px-2.5 py-2 text-left text-[13px] italic transition-[opacity,border-color] duration-200", withNote ? "border-white/20" : "border-dashed border-white/10 opacity-45")}>
          “{note}”
          <span className="mt-1 block font-mono text-[11px] not-italic text-[#ababad]">{withNote ? "✓ va tu nota" : "○ tu nota no va"}</span>
        </button>
      )}
      {metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {metrics.map((m) => {
            const isOn = shared.has(m.key);
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={isOn}
                onClick={() => onToggle(m.key)}
                className={cn("press min-h-11 rounded-lg border px-2.5 py-1.5 text-left transition-[opacity,border-color] duration-200", isOn ? "border-white/20" : "border-dashed border-white/10 opacity-40")}
              >
                <span className="block text-[12px] font-bold text-white">{isOn ? "✓" : "○"} {m.label}</span>
                <span className="block text-[12px]">{m.value}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-[#ababad]">build101 · generado con IA (Gemini) a partir de tus métricas · vos elegís qué se comparte</p>
    </div>
  );
}

/** "Contar cómo vengo": escribís cómo te sentís, Gemini lo cruza con tus métricas y vos decidís qué llega a Slack. */
export function SlackReport({ name, canSend }: { name: string; canSend: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("compose");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [shared, setShared] = useState<Set<string>>(new Set());
  const [withNote, setWithNote] = useState(true);
  // qué ve la IA: trabajo siempre; salud y ánimo solo si se prenden acá (apagados por defecto)
  const [include, setInclude] = useState({ salud: false, animo: false });
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setPhase("thinking");
    setError(null);
    try {
      const p = await postJson<Preview>("/api/report", { note, include });
      setPreview(p);
      setShared(new Set(p.metrics.map((m) => m.key)));
      setWithNote(Boolean(p.note));
      setPhase("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar");
      setPhase("compose");
    }
  };

  const send = async () => {
    if (!preview) return;
    setPhase("sending");
    setError(null);
    try {
      await postJson("/api/report/send", { id: preview.id, share: { metrics: [...shared], note: withNote } });
      setPhase("sent");
      toast("Mandado a Slack");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo mandar");
      setPhase("preview");
    }
  };

  const toggle = (key: string) =>
    setShared((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const close = () => {
    setIsOpen(false);
    if (phase === "sent") {
      setPhase("compose");
      setNote("");
      setPreview(null);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className="glass press flex h-14 items-center justify-center gap-2.5 rounded-2xl text-[15px] font-semibold">
        <ProviderIcon id="slack" className="size-5" />
        Contarle a mi equipo cómo vengo
      </button>
      <Sheet open={isOpen} onClose={close} title="Cómo vengo" subtitle="Escribilo con tus palabras. La IA lo cruza con tus métricas y vos elegís qué llega a Slack.">
        {(phase === "compose" || phase === "thinking") && (
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-dim">¿cómo te sentís hoy?</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                rows={3}
                placeholder="Ej: estoy con 3 proyectos a la vez y no llego a cerrar nada"
                disabled={phase === "thinking"}
                className="glass resize-none rounded-xl px-3.5 py-3 text-[15px] leading-relaxed outline-none placeholder:text-faint focus-visible:shadow-[inset_0_0_0_1px_var(--mood)]"
              />
            </label>
            <div className="grid gap-1.5">
              <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-dim">qué puede ver la IA</span>
              <div className="flex flex-wrap gap-1.5">
                <span className="glass grid min-h-9 place-items-center rounded-full px-3 text-[13px]">✓ trabajo</span>
                {(["salud", "animo"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="switch"
                    aria-checked={include[k]}
                    disabled={phase === "thinking"}
                    onClick={() => setInclude((v) => ({ ...v, [k]: !v[k] }))}
                    className={cn("glass press min-h-9 rounded-full px-3 text-[13px] transition-[background-color] duration-200", include[k] ? "bg-mood/25" : "text-dim")}
                  >
                    {include[k] ? "✓" : "○"} {k === "salud" ? "mi salud (sueño, pulso)" : "mi ánimo"}
                  </button>
                ))}
              </div>
              <span className="text-[12px] text-faint">Lo que no prendas, la IA no lo ve y no puede escribirlo.</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PROMPTS.map((p) => (
                <button key={p} type="button" disabled={phase === "thinking"} onClick={() => setNote(p)} className="glass press min-h-9 rounded-full px-3 text-[13px] text-dim">
                  {p}
                </button>
              ))}
            </div>
            {error && <p role="alert" className="rounded-lg bg-heart/15 px-3 py-2.5 font-mono text-[13px] text-heart">✗ {error}</p>}
            <button type="button" onClick={generate} disabled={phase === "thinking" || !note.trim()} className="glass press h-12 rounded-full bg-mood/25 text-[15px] font-semibold disabled:opacity-50">
              {phase === "thinking" ? <Spinner label="la IA cruza tu nota con tus métricas" className="font-mono text-[13px]" /> : "Armar el reporte con IA"}
            </button>
          </div>
        )}

        {(phase === "preview" || phase === "sending" || phase === "sent") && preview && (
          <div className="grid gap-3">
            <SlackPreview name={name} preview={preview} shared={shared} withNote={withNote} onToggle={toggle} onToggleNote={() => setWithNote((v) => !v)} />
            <p className="text-[12px] text-dim">Tocá cada dato para sacarlo del mensaje.</p>
            {error && <p role="alert" className="rounded-lg bg-heart/15 px-3 py-2.5 font-mono text-[13px] text-heart">✗ {error}</p>}
            {phase === "sent" ? (
              <p className="rounded-xl bg-work/15 px-3 py-3 text-center font-mono text-[13px] text-work">✓ llegó a Slack</p>
            ) : (
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <button type="button" onClick={() => setPhase("compose")} disabled={phase === "sending"} className="glass press h-12 rounded-full px-5 text-[15px] font-medium text-dim">
                  ← Editar
                </button>
                <button type="button" onClick={send} disabled={phase === "sending" || !canSend} className="glass press h-12 rounded-full bg-mood/25 text-[15px] font-semibold disabled:opacity-50">
                  {phase === "sending" ? <Spinner label="mandando" className="font-mono text-[13px]" /> : canSend ? "Mandar a Slack" : "Falta configurar Slack"}
                </button>
              </div>
            )}
            {!canSend && <p className="text-[12px] text-faint">Para mandarlo hace falta SLACK_WEBHOOK_URL en el servidor.</p>}
          </div>
        )}
      </Sheet>
    </>
  );
}
