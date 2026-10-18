// Reporte "cómo vengo" para Slack: la IA cruza lo que la persona escribe con sus métricas del día.
// Puro (sin DB ni server-only): lo usan lib/report.ts, scripts/smoke.mts y scripts/eval-ai.mts.
// Sin IA no hay reporte: es el flujo donde la IA es indispensable (interpreta una nota libre nueva cada vez).

export type MetricKind = "trabajo" | "salud" | "ánimo";
export type Metric = { key: string; label: string; value: string; kind: MetricKind };
export type Risk = "bajo" | "medio" | "alto";
export type Report = { riesgo: Risk; titular: string; observaciones: string[]; pedido: string; metricsUsed: string[] };

export const NOTE_MAX = 500;
const RISKS: Risk[] = ["bajo", "medio", "alto"];
const TITLE_MAX = 110;
const LINE_MAX = 220;
const MAX_OBS = 3;

export const REPORT_SYSTEM = `Sos build101: armás el reporte diario que un developer manda a su equipo por Slack para contar cómo viene.
Recibís (1) lo que la persona escribió con sus palabras y (2) sus métricas del día con una clave cada una.
Devolvé SOLO un JSON con esta forma exacta:
{"riesgo":"bajo|medio|alto","titular":"string","observaciones":["string"],"pedido":"string","metricsUsed":["clave"]}
Reglas:
- riesgo: qué tan cargado viene el día para sostener el ritmo. Si lo que dice la persona y las métricas no coinciden (por ejemplo "estoy bárbaro" con poco sueño y muchas reuniones), decilo en una observación y no bajes el riesgo solo por lo que dice.
- titular: una oración, primera persona, rioplatense, como lo escribiría un dev en Slack (máx. 110 caracteres).
- observaciones: 2 o 3, cada una cruza lo que siente con un número de sus métricas. Primera persona. Sin causa: "coincide con", nunca "por culpa de".
- pedido: UNA cosa concreta y chica que le pide al equipo o al lead para hoy o mañana (mover una reunión, cortar a tal hora, posponer algo). Primera persona.
- metricsUsed: las claves de las métricas que usaste, SOLO de la lista que te paso.
- Solo hablá de salud o ánimo si esas métricas están en la lista (la persona eligió qué compartir). Si no están, no las supongas.
- Nunca diagnostiques ni nombres enfermedades. No inventes números que no estén en las métricas. Texto plano, sin emojis.`;

export function buildReportPrompt(note: string, metrics: Metric[], crosses: string[] = []): string {
  const lines = metrics.map((m) => `- ${m.key}: ${m.label} = ${m.value}`);
  return [
    `Lo que escribió hoy: "${note.trim().slice(0, NOTE_MAX) || "(no escribió nada)"}"`,
    `Métricas de hoy (clave: descripción = valor):\n${lines.join("\n") || "- (sin métricas conectadas)"}`,
    crosses.length ? `Patrones de sus últimas semanas (ya verificados con sus datos):\n${crosses.map((c) => `- ${c}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Lo que devuelve la IA se valida acá: forma, enum, largos y que solo cite métricas que le pasamos. */
export function validateReport(raw: unknown, metricKeys: readonly string[]): Report | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const riesgo = RISKS.find((x) => x === r.riesgo);
  const titular = clip(r.titular, TITLE_MAX);
  const pedido = clip(r.pedido, LINE_MAX);
  const observaciones = (Array.isArray(r.observaciones) ? r.observaciones : []).map((o) => clip(o, LINE_MAX)).filter(Boolean).slice(0, MAX_OBS);
  const keys = new Set(metricKeys);
  const metricsUsed = (Array.isArray(r.metricsUsed) ? r.metricsUsed : []).filter((k): k is string => typeof k === "string" && keys.has(k));
  if (!riesgo || !titular || !pedido || observaciones.length === 0) return null;
  return { riesgo, titular, observaciones, pedido, metricsUsed: [...new Set(metricsUsed)] };
}

/** Slack mrkdwn interpreta <!channel>, <@U…> y <url|texto>: lo que viene de la persona o de la IA se escapa. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const RISK_DOT: Record<Risk, string> = { bajo: "🟢", medio: "🟡", alto: "🔴" };

type SlackMessage = { text: string; blocks: object[] };

/** Mensaje de Slack (Block Kit). `shared` = las métricas que la persona dejó prendidas; la nota solo si la eligió. */
export function buildSlackMessage({ name, report, shared, note }: { name: string; report: Report; shared: Metric[]; note?: string }): SlackMessage {
  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: `${name} · cómo vengo hoy`.slice(0, 150), emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `${RISK_DOT[report.riesgo]} *${esc(report.titular)}*\nCarga del día: *${report.riesgo}*` } },
    { type: "section", text: { type: "mrkdwn", text: report.observaciones.map((o) => `• ${esc(o)}`).join("\n").slice(0, 2900) } },
    { type: "section", text: { type: "mrkdwn", text: `*Pido:* ${esc(report.pedido)}` } },
  ];
  if (note?.trim()) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `_“${esc(note.trim().slice(0, 280))}”_` }] });
  if (shared.length) {
    // Block Kit: hasta 10 fields por section
    blocks.push({ type: "section", fields: shared.slice(0, 10).map((m) => ({ type: "mrkdwn", text: `*${m.label}*\n${esc(m.value)}` })) });
  }
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `build101 · generado con IA (Gemini) a partir de sus métricas · lo eligió compartir la persona` }] });
  return { text: `${name}: ${report.titular}`, blocks };
}

export type WrappedForSlack = {
  week: number;
  archetype: { name: string; why: string };
  rows: { label: string; value: string; note?: string }[];
  bestDay: { name: string };
};

/** Wrapped de la semana como mensaje de Slack (son tus números de la semana; el texto no lo escribe la IA). */
export function buildWrappedMessage(name: string, w: WrappedForSlack): SlackMessage {
  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: `${name} · semana ${w.week} en build101`.slice(0, 150), emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `build101 me puso *${w.archetype.name}* esta semana:\n_“${w.archetype.why}.”_` } },
  ];
  if (w.rows.length) {
    blocks.push({ type: "section", fields: w.rows.slice(0, 10).map((r) => ({ type: "mrkdwn", text: `*${r.label}*\n${r.value}${r.note ? ` · ${r.note}` : ""}` })) });
  }
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Mejor día: *${w.bestDay.name}* · build101 · solo datos de trabajo` }] });
  return { text: `${name}: semana ${w.week}, ${w.archetype.name}`, blocks };
}
