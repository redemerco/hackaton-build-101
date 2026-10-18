"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/glass/panel";
import type { AgentAction, Proposal, RunResult } from "@/lib/agent";
import type { Assessment } from "@/lib/agent-rules";

const hhmm = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fmt = (iso: string) => hhmm.format(new Date(iso));
const plus = (iso: string, minutes = 0) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();

// Mismos rótulos que lib/agent-work.ts (no se importa: trae node:crypto al bundle del cliente).
const PRIORITY: Record<number, string> = { 0: "sin prioridad", 1: "urgente", 2: "alta", 3: "media", 4: "baja" };
const RECONNECT_LABEL = { slack: "Reconectar Slack para habilitar", linear: "Reconectar Linear para habilitar" } as const;

/** "de 15:00 a 12:00" (reunión: de dónde a dónde), "de 15:00 a 16:30" (bloque) o "a las 23:00" (a dormir). */
function spanOf(a: AgentAction): string | null {
  if (a.type === "linear_create_issue" && a.title) return `"${a.title}" · team ${a.team}`;
  if (a.type === "linear_lower_priority" && a.issueId) {
    return `${a.issueId}${a.issueTitle ? ` ${a.issueTitle}` : ""} · prioridad ${PRIORITY[a.priorityFrom!] ?? a.priorityFrom} → ${PRIORITY[a.priorityTo!] ?? a.priorityTo}`;
  }
  if (a.type === "move_meeting" && a.from && a.to) return `de ${fmt(a.from)} a ${fmt(a.to)}`;
  if (a.type === "bedtime" && a.to) return `a las ${fmt(a.to)}`;
  if (a.to) return `de ${fmt(a.to)} a ${fmt(plus(a.to, a.minutes))}`;
  return null;
}

const TITLE: Record<AgentAction["type"], string> = {
  move_meeting: "mover reunión",
  block_focus: "bloquear foco",
  block_training: "bloque para entrenar",
  block_rest: "un descanso",
  bedtime: "a dormir",
  log_prompt: "recordatorio para registrar",
  send_nudge: "mandarte el nudge",
  slack_focus: "Slack en foco",
  linear_create_issue: "crear issue en Linear",
  linear_lower_priority: "bajar prioridad en Linear",
};

/** Detalle exacto de lo que pasa en Slack, así se ve antes de confirmar. */
const slackDetail = (a: AgentAction) => (a.type === "slack_focus" && a.to ? `estado ":headphones: En foco con Pulso" y no molestar hasta las ${fmt(plus(a.to, a.minutes))}` : null);

const LEVEL_TONE: Record<string, string> = { bien: "text-work", regular: "text-mood", mal: "text-heart", "sin dato": "text-dim" };

function ActionCard({ action }: { action: AgentAction }) {
  const [result, setResult] = useState<RunResult | "running" | null>(
    action.done ? { status: "done", message: action.done.message ?? "ya se ejecutó", ...(action.done.url && { url: action.done.url }) } : null,
  );
  const span = spanOf(action);
  const detail = slackDetail(action);

  async function confirm() {
    setResult("running");
    try {
      const res = await fetch("/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: action.id }) });
      setResult((await res.json()) as RunResult);
    } catch {
      setResult({ status: "error", message: "sin conexión: no se ejecutó nada" });
    }
  }

  const isCalendarLink = (url: string) => url.startsWith("https://calendar.google.com") || url.includes("google.com/calendar");
  return (
    <li className="grid gap-2 border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
      <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[13px]">
        <span className="text-work">[{TITLE[action.type]}]</span>
        {span && <span className="tabular-nums text-dim">{span}</span>}
        {action.isSimulated && <span className="text-mood">[simulado]</span>}
        {action.tag && <span className="text-dim">[{action.tag}]</span>}
      </p>
      {detail && <p className="font-mono text-[12px] text-dim text-pretty">{detail}</p>}
      <p className="text-[15px] leading-snug text-pretty">{action.reason}</p>
      {action.reconnect && !action.done ? (
        // Sin el permiso de escritura no hay Confirmar: lleva al OAuth con los scopes nuevos y vuelve a esta propuesta.
        <a href={`/api/connect/${action.reconnect}`} className="press justify-self-start rounded-full bg-white/10 px-4 py-2 font-mono text-[13px]">
          {RECONNECT_LABEL[action.reconnect]}
        </a>
      ) : result === null || result === "running" ? (
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
                {result.url.startsWith("/api/connect/")
                  ? "reconectar"
                  : result.url.includes("linear.app")
                    ? "ver en Linear"
                    : !isCalendarLink(result.url)
                      ? "abrir"
                      : result.status === "done"
                        ? "ver en Google Calendar"
                        : "abrir Google Calendar"}
              </a>
            </>
          )}
        </p>
      )}
    </li>
  );
}

function Row({ label, level, text }: { label: string; level: string; text: string }) {
  return (
    <li className="grid grid-cols-[84px_1fr] items-baseline gap-2 font-mono text-[13px]">
      <span className="text-dim">{label}</span>
      <span className="text-pretty">
        <span className={LEVEL_TONE[level] ?? "text-dim"}>{level}</span>
        <span className="text-dim"> · {text}</span>
      </span>
    </li>
  );
}

/** "Cómo venís": los dos ejes de la evaluación (trabajo de la semana y salud de hoy). */
function AssessmentCard({ a }: { a: Assessment }) {
  const { work, health } = a;
  const headline =
    work.gap === null ? "sin datos para medir la semana" : work.gap < 0 ? `vas ${-work.gap}% atrasado` : work.gap > 0 ? `vas ${work.gap}% adelantado` : "vas al día";
  return (
    <Panel label="cómo venís" className="js-agente scroll-mt-4" meta={health.score === null ? undefined : `puntaje ${health.score}`}>
      <div className="grid gap-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[13px]">
          <span className="text-dim">trabajo</span>
          <span className={work.gap !== null && work.gap < 0 ? "text-heart" : "text-work"}>{headline}</span>
          <span className="tabular-nums text-dim">
            esperado {work.expected}% · real {work.actual ?? "—"}%
          </span>
        </p>
        <p className="font-mono text-[12px] text-faint">{work.basis}</p>
        {work.pendientes.length > 0 && (
          <ul className="grid gap-0.5 text-[13px] text-dim">
            {work.pendientes.slice(0, 4).map((p) => (
              <li key={p} className="truncate">→ {p}</li>
            ))}
          </ul>
        )}
      </div>
      <ul aria-label="Salud" className="grid gap-1.5 border-t border-white/10 pt-3">
        <Row label="estrés" level={health.stress.level} text={health.stress.text} />
        <Row label="sueño" level={health.sleep.level} text={health.sleep.text} />
        <Row label="entreno" level={health.training.level} text={health.training.text} />
        <Row label="comida" level={health.food.level} text={health.food.text} />
        <Row label="ánimo" level={health.mood.level} text={health.mood.text} />
      </ul>
    </Panel>
  );
}

async function load(url: string): Promise<Proposal | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return res.ok ? ((await res.json()) as { proposal: Proposal | null }).proposal : null;
  } catch {
    return null;
  }
}

/**
 * Evaluación + acciones que propone el agente. Primero la propuesta pendiente (la que avisó el push del cron); solo si no
 * hay ninguna vigente pide una nueva. Nada se ejecuta sin Confirmar; lo simulado nunca se presenta como hecho.
 */
export function AgentActions() {
  const [proposal, setProposal] = useState<Proposal | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const fresh = useCallback(async () => {
    setBusy(true);
    setProposal(await load("/api/agent/propose"));
    setBusy(false);
  }, []);

  useEffect(() => {
    (async () => {
      const pending = await load("/api/agent/pending");
      if (pending && pending.actions.length > 0) setProposal(pending);
      else setProposal(await load("/api/agent/propose"));
    })();
  }, []);

  // Llegó desde el push del cron (/?agente=1): llevarlo a la evaluación y las propuestas.
  const loaded = proposal !== undefined;
  useEffect(() => {
    if (loaded && new URLSearchParams(window.location.search).has("agente")) {
      document.querySelector(".js-agente")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loaded]);

  if (proposal === undefined) {
    return (
      <Panel label="agente">
        <p className="font-mono text-[13px] text-dim">mirando tu día…</p>
      </Panel>
    );
  }
  if (!proposal) return null;
  const { actions, assessment } = proposal;
  return (
    <>
      {assessment && <AssessmentCard a={assessment} />}
      {actions.length > 0 && (
        <Panel label="agente" className="js-agente scroll-mt-4" meta={`${actions.length} propuesta${actions.length > 1 ? "s" : ""}`}>
          <ul className="grid gap-3">
            {actions.map((a) => <ActionCard key={a.id} action={a} />)}
          </ul>
          <button type="button" onClick={fresh} disabled={busy} className="press justify-self-start font-mono text-[12px] text-faint underline underline-offset-2 disabled:opacity-60">
            {busy ? "recalculando…" : "recalcular"}
          </button>
        </Panel>
      )}
    </>
  );
}
