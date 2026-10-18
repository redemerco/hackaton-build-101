import "server-only";
import { and, asc, eq, gte } from "drizzle-orm";
import { getConnection, type Provider } from "@/lib/connections";
import { db, rawEvents } from "@/lib/db";
import type { SummaryCount } from "@/lib/summary";
import { getWorkDay, meetingsToday } from "@/lib/work";
import { getLinearWeek, getSlackToday } from "@/lib/work-signals";

// Prompt del resumen daily de Trabajo: solo lo de HOY (hora local), una línea por evento, nada de cuerpo.
// El cruce con Salud lo hace el resumen de Yo.
const TZ = "America/Montevideo";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const hhmm = new Intl.DateTimeFormat("es-UY", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const WORK_SYSTEM = `Sos build101, la observabilidad personal de un developer. Recibís lo que hizo HOY en el trabajo (commits, PRs, issues, mensajes de Slack y reuniones), con hora local de Montevideo.
Escribí en español rioplatense, cálido y directo, como un compañero que mira tu día.
- De 3 a 4 oraciones en un solo párrafo. Texto plano: sin listas, negritas, títulos ni emojis.
- Contá qué hiciste hoy y en qué horas, y dónde se amontona el día (reuniones contra commits), con números concretos.
- Nada de cuerpo, sueño, pulso ni ánimo: eso es de Salud.
- Si ves una relación (más reuniones, menos commits), es correlación, no causa: decilo así.
- Si una fuente dice "no conectado", decilo en media oración. Nunca inventes datos que no están.`;

// Respaldo sin IA: no inventa números (un ejemplo con cifras contradecía el git log real de la pantalla).
export const EXAMPLE_WORK_SUMMARY =
  "La IA no respondió ahora y todavía no hay un resumen guardado. Tus datos de abajo son reales; tocá ↻ para intentar de nuevo.";

type Row = { source: string; kind: string; ts: string; json: string };

/** Una línea por evento: GitHub y Linear sin crudo (solo primera línea / identificador). */
function line(r: Row): string | null {
  const d = JSON.parse(r.json);
  const at = hhmm.format(new Date(r.ts));
  if (r.source === "github") {
    if (r.kind === "commit") return `${at} commit: ${d.commit?.message?.split("\n")[0] ?? ""}`;
    if (r.kind === "pr") return `${at} PR #${d.number} ${d.title ?? ""} (${(d.merged_at ?? d.pull_request?.merged_at) ? "mergeado" : d.state})`;
    if (r.kind === "issue") return `${at} issue GitHub: ${d.title ?? ""} (${d.state})`;
    if (r.kind === "review") return `${at} review: ${d.state ?? ""}`;
    return null;
  }
  if (r.source === "linear") return `${at} linear ${r.kind}: ${d.identifier ?? ""} ${d.title ?? ""} (${d.state?.name ?? ""})`;
  return null;
}

/** Conectado = tiene el OAuth o hay datos de la fuente en la semana (GitHub también entra por GITHUB_TOKEN). */
function isConnected(userId: string, provider: Provider): boolean {
  if (getConnection(userId, provider)) return true;
  return !!db
    .select({ id: rawEvents.id })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, provider), gte(rawEvents.ts, new Date(Date.now() - WEEK_MS).toISOString())))
    .get();
}

export function buildWorkPrompt(userId: string): { system: string; prompt: string; counts: SummaryCount[] } {
  const now = new Date();
  const today = dayKey.format(now);
  const rows = db
    .select({ source: rawEvents.source, kind: rawEvents.kind, ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), gte(rawEvents.ts, new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())))
    .orderBy(asc(rawEvents.ts))
    .all()
    .filter((r) => (r.source === "github" || r.source === "linear") && dayKey.format(new Date(r.ts)) === today);

  const github = rows.filter((r) => r.source === "github");
  const linear = rows.filter((r) => r.source === "linear");
  // Mismo número que el "git log · hoy" de Trabajo.
  const commits = getWorkDay(userId)?.commits ?? 0;
  const prs = github.filter((r) => r.kind === "pr").length;
  const linearIssues = new Set(linear.map((r) => JSON.parse(r.json).identifier).filter(Boolean)).size;
  const issues = linearIssues + github.filter((r) => r.kind === "issue").length;
  const slack = getSlackToday(userId, now);
  const meetings = meetingsToday(userId);

  const on = { github: isConnected(userId, "github"), linear: getLinearWeek(userId, now).hasData || isConnected(userId, "linear"), slack: slack.hasData || isConnected(userId, "slack"), calendar: isConnected(userId, "calendar") };

  const sections: string[] = [];
  const events = rows.map(line).filter(Boolean);
  sections.push(
    on.github || on.linear
      ? `Commits, PRs e issues de hoy (${events.length}):\n${events.length ? events.join("\n") : "ninguno todavía"}`
      : "GitHub y Linear: no conectados.",
  );
  if (on.github && !on.linear) sections.push("Linear: no conectado.");
  if (on.linear && !on.github) sections.push("GitHub: no conectado.");
  sections.push(
    on.slack
      ? slack.messages
        ? `Slack hoy (solo horarios): ${slack.messages} mensajes, primero ${slack.first}, último ${slack.last}; ${slack.afterHoursToday} fuera de horario (después de las 20 o antes de las 8). Por hora: ${slack.byHour.map((n, h) => (n ? `${h}h:${n}` : "")).filter(Boolean).join(" ")}`
        : "Slack hoy: ningún mensaje."
      : "Slack: no conectado.",
  );
  sections.push(
    on.calendar
      ? meetings.length
        ? `Reuniones de hoy (${meetings.length}, solo horarios):\n${meetings.map((m) => `${m.start}–${m.end} (${m.durationMin} min)`).join("\n")}`
        : "Calendar: sin reuniones hoy."
      : "Calendar: no conectado.",
  );

  return {
    system: WORK_SYSTEM,
    prompt: `Hoy es ${today}, son las ${hhmm.format(now)} en Montevideo.\n\n${sections.join("\n\n")}`,
    counts: [
      { label: "commits", value: on.github ? commits : 0 },
      { label: "PRs", value: on.github ? prs : 0 },
      { label: "issues", value: issues },
      { label: "mensajes", value: on.slack ? slack.messages : 0 },
      { label: "reuniones", value: on.calendar ? meetings.length : 0 },
    ],
  };
}
