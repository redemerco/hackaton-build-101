"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/glass/panel";
import type { AgentAction, RunResult } from "@/lib/agent";

const hhmm = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fmt = (iso: string) => hhmm.format(new Date(iso));

/** "de 15:00 a 12:00" (reunión: de dónde a dónde) o "de 15:00 a 16:30" (bloque de foco). */
function spanOf(a: AgentAction): string | null {
  if (a.type === "move_meeting" && a.from && a.to) return `de ${fmt(a.from)} a ${fmt(a.to)}`;
  if (a.type === "block_focus" && a.to) return `de ${fmt(a.to)} a ${fmt(new Date(Date.parse(a.to) + (a.minutes ?? 0) * 60_000).toISOString())}`;
  return null;
}

const TITLE: Record<AgentAction["type"], string> = { move_meeting: "mover reunión", block_focus: "bloquear foco", send_nudge: "mandarte el nudge" };

function ActionCard({ action }: { action: AgentAction }) {
  const [result, setResult] = useState<RunResult | "running" | null>(null);
  const span = spanOf(action);

  async function confirm() {
    setResult("running");
    try {
      const res = await fetch("/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: action.id }) });
      setResult((await res.json()) as RunResult);
    } catch {
      setResult({ status: "error", message: "sin conexión: no se ejecutó nada" });
    }
  }

  return (
    <li className="grid gap-2 border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
      <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[13px]">
        <span className="text-work">[{TITLE[action.type]}]</span>
        {span && <span className="tabular-nums text-dim">{span}</span>}
        {action.isSimulated && <span className="text-mood">[simulado]</span>}
        {action.tag && <span className="text-dim">[{action.tag}]</span>}
      </p>
      <p className="text-[15px] leading-snug text-pretty">{action.reason}</p>
      {result === null || result === "running" ? (
        <button
          type="button"
          onClick={confirm}
          disabled={result === "running"}
          className="press justify-self-start rounded-full bg-white/10 px-4 py-2 font-mono text-[13px] disabled:opacity-60"
        >
          {result === "running" ? "ejecutando…" : "Confirmar"}
        </button>
      ) : (
        <p role="status" className="font-mono text-[13px] text-pretty">
          {result.status === "done" && <span className="text-work">hecho ✓ · </span>}
          {result.status === "simulated" && <span className="text-mood">[simulado] · no se ejecutó · </span>}
          {result.status === "error" && <span className="text-heart">error · </span>}
          <span className={result.status === "error" ? "text-heart" : "text-dim"}>{result.message}</span>
          {"url" in result && result.url && (
            <>
              {" · "}
              <a href={result.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {result.status === "done" ? "ver en Google Calendar" : "abrir Google Calendar"}
              </a>
            </>
          )}
        </p>
      )}
    </li>
  );
}

/** Acciones que propone el agente para hoy. Nada se ejecuta sin Confirmar; lo simulado nunca se presenta como hecho. */
export function AgentActions() {
  const [actions, setActions] = useState<AgentAction[] | null>(null);

  useEffect(() => {
    fetch("/api/agent/propose", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<AgentAction[]>) : []))
      .catch((): AgentAction[] => [])
      .then(setActions);
  }, []);

  if (actions === null) {
    return (
      <Panel label="agente">
        <p className="font-mono text-[13px] text-dim">mirando tu día…</p>
      </Panel>
    );
  }
  if (actions.length === 0) return null;
  return (
    <Panel label="agente" meta={`${actions.length} propuesta${actions.length > 1 ? "s" : ""}`}>
      <ul className="grid gap-3">
        {actions.map((a) => <ActionCard key={a.id} action={a} />)}
      </ul>
    </Panel>
  );
}
