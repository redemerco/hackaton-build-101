import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { aiErrorReason, generateJson, hasAI } from "@/lib/ai";
import { formatDuration } from "@/lib/ascii";
import { getCross } from "@/lib/cross";
import { db, insertRawEvents, rawEvents } from "@/lib/db";
import { buildReportPrompt, buildSlackMessage, NOTE_MAX, REPORT_SYSTEM, validateReport, type Metric, type Report } from "@/lib/report-core";
import { getToday } from "@/lib/today";

// Reporte "cómo vengo" → Slack. Vista previa con IA (se guarda en raw_events source "report"),
// la persona elige qué métricas comparte y recién ahí se manda por Incoming Webhook (SLACK_WEBHOOK_URL).

export type Preview = { id: string; report: Report; metrics: Metric[]; note: string };
export class ReportError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export const canSendToSlack = () => Boolean(process.env.SLACK_WEBHOOK_URL);

/** ¿Hay datos de scripts/seed-demo.mts (_mock) en las últimas 6 semanas? Se rotula [datos simulados] en pantalla y en Slack. */
export function hasSimulatedData(userId: string): boolean {
  const since = new Date(Date.now() - 43 * 86400_000).toISOString();
  return Boolean(
    db
      .select({ id: rawEvents.id })
      .from(rawEvents)
      .where(and(eq(rawEvents.userId, userId), gte(rawEvents.ts, since), sql`${rawEvents.json} LIKE '%"_mock":true%'`))
      .limit(1)
      .get(),
  );
}

/** Las métricas de hoy con clave estable: es lo único que la IA puede citar. */
export function reportMetrics(userId: string): { metrics: Metric[]; crosses: string[] } {
  const cross = getCross(userId);
  const today = getToday(userId, new Date(), cross.series);
  const hours = cross.today.hours;
  const commits = hours.reduce((n, h) => n + h.commits, 0);
  const messages = hours.reduce((n, h) => n + h.messages, 0);
  const meetingMin = hours.reduce((n, h) => n + h.meetingMin, 0);
  const azm = hours.reduce((n, h) => n + h.azm, 0);
  const todaySeries = cross.series.at(-1);
  const yesterday = cross.series.at(-2);
  const metrics: (Metric | null)[] = [
    { key: "commits", label: "Commits hoy", value: String(commits), kind: "trabajo" },
    meetingMin ? { key: "reuniones", label: "Reuniones hoy", value: formatDuration(meetingMin), kind: "trabajo" } : null,
    todaySeries?.longestFreeMin != null ? { key: "foco", label: "Bloque libre más largo", value: formatDuration(todaySeries.longestFreeMin), kind: "trabajo" } : null,
    messages ? { key: "slack", label: "Mensajes en Slack hoy", value: String(messages), kind: "trabajo" } : null,
    yesterday && yesterday.lastWorkMinute != null && yesterday.lastWorkMinute >= 23 * 60
      ? { key: "trabajo_tarde", label: "Anoche trabajaste hasta", value: `${String(Math.floor(yesterday.lastWorkMinute / 60) % 24).padStart(2, "0")}:${String(yesterday.lastWorkMinute % 60).padStart(2, "0")}`, kind: "trabajo" }
      : null,
    today.sleepMin !== null ? { key: "sueno", label: "Sueño de anoche", value: formatDuration(today.sleepMin), kind: "salud" } : null,
    today.restingBpm !== null
      ? { key: "pulso", label: "Pulso en reposo", value: `${today.restingBpm} lpm${today.restingTypical ? ` (tu típico ${today.restingTypical[0]}–${today.restingTypical[1]})` : ""}`, kind: "salud" }
      : null,
    today.hrvMs !== null ? { key: "hrv", label: "HRV", value: `${today.hrvMs} ms${today.hrvTypical ? ` (típico ${today.hrvTypical[0]}–${today.hrvTypical[1]})` : ""}`, kind: "salud" } : null,
    azm ? { key: "activo", label: "Minutos activos", value: String(azm), kind: "salud" } : null,
    today.mood !== null ? { key: "animo", label: "Ánimo (check-in)", value: `${today.mood}/5`, kind: "ánimo" } : null,
  ];
  return { metrics: metrics.filter((m): m is Metric => m !== null), crosses: cross.insights.filter((i) => !i.isHypothesis).slice(0, 2).map((i) => i.text) };
}

/** Genera la vista previa con IA. Sin IA no hay reporte (no hay plantilla de reemplazo, a propósito). */
export async function createPreview(userId: string, rawNote: unknown, rawInclude?: unknown): Promise<Preview> {
  const note = typeof rawNote === "string" ? rawNote.trim().slice(0, NOTE_MAX) : "";
  if (!hasAI()) throw new ReportError(`Este reporte necesita la IA: ${aiErrorReason(new Error("GEMINI_API_KEY"))}`, 503);
  // Salud y ánimo solo entran si la persona los prendió ANTES de generar: si la IA no los ve, no los puede escribir.
  const inc = (rawInclude ?? {}) as { salud?: unknown; animo?: unknown; exclude?: unknown };
  // fichas que la persona apagó en una vista previa anterior: no vuelven a la IA
  const exclude = new Set(Array.isArray(inc.exclude) ? inc.exclude.filter((k): k is string => typeof k === "string") : []);
  const allowed = (m: Metric) =>
    !exclude.has(m.key) && (m.kind === "trabajo" || (m.kind === "salud" && inc.salud === true) || (m.kind === "ánimo" && inc.animo === true));
  const all = reportMetrics(userId);
  const metrics = all.metrics.filter(allowed);
  // los cruces de las últimas semanas hablan de sueño y ánimo: solo van si se compartió salud
  // (y los que nombran el ánimo, solo si también se compartió el ánimo). Si apagó una ficha de salud, ninguno.
  const isHealthTrimmed = all.metrics.some((m) => m.kind === "salud" && exclude.has(m.key));
  const crosses = inc.salud === true && !isHealthTrimmed ? all.crosses.filter((c) => inc.animo === true || !/ánimo/i.test(c)) : [];
  let raw: unknown;
  try {
    raw = await generateJson<unknown>({ contents: buildReportPrompt(note, metrics, crosses), config: { systemInstruction: REPORT_SYSTEM } });
  } catch (error) {
    console.error("[report] la IA no respondió", error);
    throw new ReportError(`La IA no respondió: ${aiErrorReason(error)}`, 503);
  }
  const report = validateReport(raw, metrics.map((m) => m.key));
  if (!report) throw new ReportError("La IA devolvió un reporte incompleto. Probá de nuevo.", 503);
  const preview: Preview = { id: crypto.randomUUID(), report, metrics, note };
  insertRawEvents([{ source: "report", kind: "preview", userId, ts: new Date().toISOString(), data: preview }]);
  return preview;
}

function loadPreview(userId: string, id: string): Preview | null {
  const row = db
    .select({ json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "report"), eq(rawEvents.kind, "preview"), sql`json_extract(${rawEvents.json}, '$.id') = ${id}`))
    .orderBy(desc(rawEvents.ts))
    .get();
  return row ? (JSON.parse(row.json) as Preview) : null;
}

/** POST al Incoming Webhook del canal configurado. */
export async function postToSlack(message: { text: string; blocks: object[] }) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) throw new ReportError("Falta configurar SLACK_WEBHOOK_URL en el servidor", 503);
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message) });
  } catch (error) {
    console.error("[report] Slack inalcanzable", error);
    throw new ReportError("No se pudo llegar a Slack (red)", 502);
  }
  const body = await res.text();
  if (!res.ok) {
    console.error("[report] Slack rechazó el mensaje", res.status, body);
    throw new ReportError(`Slack rechazó el mensaje (${body.slice(0, 80) || res.status})`, 502);
  }
}

/** Manda la vista previa guardada: relee por id (nunca confía en el texto del cliente) y aplica lo que la persona eligió compartir. */
export async function sendPreview(userId: string, name: string, id: unknown, share: unknown): Promise<void> {
  if (typeof id !== "string") throw new ReportError("Falta el reporte", 400);
  const preview = loadPreview(userId, id);
  if (!preview) throw new ReportError("Ese reporte ya no existe: generalo de nuevo", 404);
  const s = (share ?? {}) as { metrics?: unknown; note?: unknown };
  const allowed = new Set(Array.isArray(s.metrics) ? s.metrics.filter((k): k is string => typeof k === "string") : []);
  const shared = preview.metrics.filter((m) => allowed.has(m.key));
  await postToSlack(buildSlackMessage({ name, report: preview.report, shared, note: s.note === true ? preview.note : undefined, isSimulated: hasSimulatedData(userId) }));
  insertRawEvents([{ source: "report", kind: "sent", userId, ts: new Date().toISOString(), data: { id, shared: shared.map((m) => m.key), withNote: s.note === true } }]);
}
