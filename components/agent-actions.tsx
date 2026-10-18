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

/** Herramienta donde actúa cada acción: el encabezado de la opción ("Calendar · bloquear foco"). */
const TOOL: Record<AgentAction["type"], string> = {
  move_meeting: "Calendar",
  block_focus: "Calendar",
  block_training: "Calendar",
  block_rest: "Calendar",
  bedtime: "Calendar",
  log_prompt: "Nudge",
  send_nudge: "Nudge",
  slack_focus: "Slack",
  linear_create_issue: "Linear",
  linear_lower_priority: "Linear",
};

/** Diagnóstico común a todas las acciones (el prefijo compartido de los `reason`), para decirlo una sola vez arriba. */
function sharedReason(actions: readonly AgentAction[]): string {
  if (actions.length < 2) return "";
  let prefix = actions[0].reason;
  for (const a of actions.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < a.reason.length && prefix[i] === a.reason[i]) i++;
    prefix = prefix.slice(0, i);
  }
  // cortar en un límite de frase/palabra para no partir "79%" en "7"
  const cut = Math.max(prefix.lastIndexOf(")"), prefix.lastIndexOf("."), prefix.lastIndexOf(","));
  return (cut > 10 ? prefix.slice(0, cut + 1) : "").trim();
}

/** Lo que el `reason` agrega al diagnóstico común ("y PUL-19 sigue abierto" → "PUL-19 sigue abierto"). */
function extraReason(reason: string, shared: string): string {
  if (!shared || !reason.startsWith(shared)) return reason;
  return reason.slice(shared.length).replace(/^[\s,.;:]*(y\s+)?/i, "").trim();
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

const doneResult = (a: AgentAction): RunResult | null =>
  a.done ? { status: "done", message: a.done.message ?? "ya se ejecutó", ...(a.done.url && { url: a.done.url }) } : null;

async function run(id: string): Promise<RunResult> {
  try {
    const res = await fetch("/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    return (await res.json()) as RunResult;
  } catch {
    return { status: "error", message: "el servidor no respondió: probá de nuevo, no se ejecutó nada" };
  }
}

/**
 * Una opción del agente: la herramienta (Calendar, Linear, Nudge) y qué hace ahí. `extra` es lo que el motivo agrega al
 * diagnóstico común. `companion`: el foco en Slack va como detalle del foco en Calendar y se confirma junto.
 */
function ActionCard({ action, extra, companion }: { action: AgentAction; extra: string; companion?: AgentAction }) {
  const [result, setResult] = useState<RunResult | "running" | null>(doneResult(action));
  const [companionResult, setCompanionResult] = useState<RunResult | null>(companion ? doneResult(companion) : null);
  const span = spanOf(action);
  const detail = slackDetail(action);

  async function confirm() {
    setResult("running");
    const main = await run(action.id);
    setResult(main);
    if (companion && !companion.done && !companion.reconnect && main.status !== "error") setCompanionResult(await run(companion.id));
  }

  return (
    <li className="grid gap-2 border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
      <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[13px]">
        <span className="text-work">{TOOL[action.type]} · {TITLE[action.type]}</span>
        {span && <span className="tabular-nums text-dim">{span}</span>}
        {action.isSimulated && <span className="text-mood">[simulado]</span>}
        {action.tag && <span className="text-dim">[{action.tag}]</span>}
      </p>
      {detail && <p className="font-mono text-[12px] text-dim text-pretty">{detail}</p>}
      {companion && (
        <p className="font-mono text-[12px] text-dim text-pretty">
          también en Slack: {slackDetail(companion) ?? "estado en foco"}
          {companion.isSimulated && <span className="text-mood"> [simulado]</span>}
          {companion.reconnect && (
            <>
              {" · "}
              <a href={`/api/connect/${companion.reconnect}`} className="underline underline-offset-2">reconectar Slack</a>
            </>
          )}
        </p>
      )}
      {extra && <p className="text-[15px] leading-snug text-pretty">{extra}</p>}
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
        <>
          <ResultLine result={result} />
          {companionResult && <ResultLine result={companionResult} prefix="Slack: " />}
        </>
      )}
    </li>
  );
}

const isCalendarLink = (url: string) => url.startsWith("https://calendar.google.com") || url.includes("google.com/calendar");

function ResultLine({ result, prefix = "" }: { result: RunResult; prefix?: string }) {
  return (
    <p role="status" className="font-mono text-[13px] text-pretty">
      {prefix && <span className="text-dim">{prefix}</span>}
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
            llevás {work.actual ?? "—"}% · {work.expected >= 100 ? "la semana laboral ya terminó" : `pasó el ${work.expected}% de la semana`}
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
  // El foco en Slack va dentro del foco en Calendar (se confirma junto); solo queda como opción propia si viene solo.
  const focus = actions.find((a) => a.type === "block_focus");
  const slack = focus ? actions.find((a) => a.type === "slack_focus") : undefined;
  const options = actions.filter((a) => a !== slack);
  const shared = sharedReason(options);
  const headline = shared ? shared.charAt(0).toUpperCase() + shared.slice(1) : "";
  return (
    <>
      {assessment && <AssessmentCard a={assessment} />}
      {options.length > 0 && (
        <Panel label="agente" className="js-agente scroll-mt-4" meta={`${options.length} opci${options.length > 1 ? "ones" : "ón"}`}>
          {headline && <p className="text-[15px] leading-snug text-pretty">{headline}</p>}
          <ul className="grid gap-3">
            {options.map((a) => (
              <ActionCard key={a.id} action={a} extra={extraReason(a.reason, shared)} companion={a === focus ? slack : undefined} />
            ))}
          </ul>
          <button type="button" onClick={fresh} disabled={busy} className="press justify-self-start font-mono text-[12px] text-faint underline underline-offset-2 disabled:opacity-60">
            {busy ? "recalculando…" : "recalcular"}
          </button>
        </Panel>
      )}
    </>
  );
}
