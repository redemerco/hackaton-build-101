// Acciones del agente sobre herramientas de trabajo (Slack y Linear): scopes que necesitan y ejecutores HTTP.
// Sin server-only ni alias "@/": lo importa también scripts/test-agent-rules.mts con un fetch mockeado.
import { createHash } from "node:crypto";

const MIN = 60_000;

// ── scopes ──────────────────────────────────────────────────────────────────
/** Lo que se pide en el authorize. Override por env por si la app de Slack todavía no tiene los scopes nuevos. */
export const SLACK_USER_SCOPE = process.env.SLACK_USER_SCOPE || "search:read,users.profile:write,dnd:write";
export const LINEAR_SCOPE = process.env.LINEAR_SCOPE || "read,write";

export type WorkProvider = "slack" | "linear";
export type WorkActionType = "slack_focus" | "linear_create_issue" | "linear_lower_priority";

/** Qué proveedor y qué scopes necesita cada acción. */
export const WORK_ACTIONS: Record<WorkActionType, { provider: WorkProvider; scopes: string[] }> = {
  slack_focus: { provider: "slack", scopes: ["users.profile:write", "dnd:write"] },
  linear_create_issue: { provider: "linear", scopes: ["write"] },
  linear_lower_priority: { provider: "linear", scopes: ["write"] },
};
export const isWorkAction = (t: string): t is WorkActionType => t in WORK_ACTIONS;

/** Scopes de la respuesta del token ("a,b", "a b" o ["a","b"]) → "a,b". null si no vino nada. */
export function normalizeScopes(raw: unknown): string | null {
  const list = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(/[\s,]+/) : [];
  const clean = [...new Set(list.map((s) => s.trim()).filter(Boolean))];
  return clean.length ? clean.join(",") : null;
}

/** ¿La conexión tiene todos estos scopes? Conexión vieja (scopes null) → no. Linear "admin" incluye "write". */
export function hasScopes(stored: string | null | undefined, needed: string[]): boolean {
  const have = new Set(normalizeScopes(stored)?.split(",") ?? []);
  return needed.every((s) => have.has(s) || (s === "write" && have.has("admin")));
}

/** Estado de una conexión para una acción: sin conectar (no se propone), sin scope (simulada + reconectar) u ok. */
export type WorkGate = "missing" | "reconnect" | "ok";
export function gateFor(type: WorkActionType, conn: { scopes?: string | null } | null | undefined): WorkGate {
  if (!conn) return "missing";
  return hasScopes(conn.scopes, WORK_ACTIONS[type].scopes) ? "ok" : "reconnect";
}

// ── Linear: prioridades ─────────────────────────────────────────────────────
export const PRIORITY_LABEL: Record<number, string> = { 0: "sin prioridad", 1: "urgente", 2: "alta", 3: "media", 4: "baja" };

/** Issue abierto "no urgente" al que se le puede bajar un escalón: media → baja primero, si no alta → media. */
export function pickLowerPriority<T extends { id: string; done: boolean; priority?: number | null }>(issues: T[]): { issue: T; from: number; to: number } | null {
  for (const p of [3, 2]) {
    const issue = issues.filter((i) => !i.done && i.priority === p).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (issue) return { issue, from: p, to: p + 1 };
  }
  return null;
}

/** "PUL-12" → "PUL": el prefijo del identifier es la key del team. */
export const teamKeyOf = (identifier: string) => identifier.match(/^([A-Za-z0-9]+)-\d+$/)?.[1]?.toUpperCase() ?? null;

/** UUID (formato v4) determinístico: el mismo pedido → el mismo id de issue, así confirmar dos veces no duplica. */
export function linearIssueUuid(userId: string, team: string, title: string): string {
  const h = createHash("sha256").update(`${userId}|linear_create_issue|${team}|${title.trim().toLowerCase()}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ── ejecutores ──────────────────────────────────────────────────────────────
export type WorkResult = { status: "done"; message: string; url?: string } | { status: "error"; message: string };
type Fetch = typeof fetch;

const hhmm = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export const SLACK_STATUS = { text: "En foco con Pulso", emoji: ":headphones:" };

async function slackCall(f: Fetch, token: string, method: string, params: Record<string, string>): Promise<void> {
  const res = await f(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!body.ok) throw new Error(`slack ${method}: ${body.error ?? res.status}`);
}

/**
 * Estado ":headphones: En foco con Pulso" que vence al fin del bloque + no molestar hasta el fin del bloque.
 * Idempotente por valor: repetirlo deja el mismo estado y el mismo fin de DND (se calculan del bloque, no del reloj).
 */
export async function slackFocus(token: string, block: { start: number; minutes: number }, now = Date.now(), f: Fetch = fetch): Promise<WorkResult> {
  const end = block.start + block.minutes * MIN;
  if (end <= now) return { status: "error", message: "el bloque de foco ya terminó" };
  const endSec = Math.floor(end / 1000);
  // DND hasta el fin del bloque (Slack no programa un DND a futuro: arranca ahora).
  const minutes = Math.max(1, Math.ceil((end - now) / MIN));
  await slackCall(f, token, "users.profile.set", {
    profile: JSON.stringify({ status_text: SLACK_STATUS.text, status_emoji: SLACK_STATUS.emoji, status_expiration: endSec }),
  });
  await slackCall(f, token, "dnd.setSnooze", { num_minutes: String(minutes) });
  return { status: "done", message: `estado "${SLACK_STATUS.text}" y no molestar hasta las ${hhmm.format(new Date(end))}` };
}

async function linearGql<T>(f: Fetch, token: string, query: string, variables: Record<string, unknown>): Promise<{ data?: T; errors?: { message?: string }[] }> {
  const res = await f("https://api.linear.app/graphql", {
    method: "POST",
    // token OAuth: este SÍ va con "Bearer"
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok && res.status !== 400) throw new Error(`linear ${res.status}`);
  return (await res.json()) as { data?: T; errors?: { message?: string }[] };
}

/** Crea el issue con id determinístico. Si ya existe (confirmado antes), no lo duplica: devuelve el que estaba. */
export async function linearCreateIssue(token: string, a: { userId: string; team: string; title: string; description?: string }, f: Fetch = fetch): Promise<WorkResult> {
  const id = linearIssueUuid(a.userId, a.team, a.title);
  type Found = { issue?: { identifier: string; url: string } | null };
  const existing = await linearGql<Found>(f, token, `query($id: String!) { issue(id: $id) { identifier url } }`, { id });
  if (existing.data?.issue) return { status: "done", message: `${existing.data.issue.identifier} ya estaba creado`, url: existing.data.issue.url };

  type Teams = { teams: { nodes: { id: string; key: string }[] } };
  const teams = await linearGql<Teams>(f, token, `query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id key } } }`, { key: a.team });
  const teamId = teams.data?.teams.nodes[0]?.id;
  if (!teamId) return { status: "error", message: `no encontré el team ${a.team} en Linear` };

  type Created = { issueCreate: { success: boolean; issue?: { identifier: string; url: string } } };
  const created = await linearGql<Created>(
    f,
    token,
    `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier url } } }`,
    { input: { id, teamId, title: a.title, description: a.description ?? "Creado por el agente de Pulso." } },
  );
  const issue = created.data?.issueCreate?.issue;
  if (!created.data?.issueCreate?.success || !issue) throw new Error(`linear issueCreate: ${created.errors?.map((e) => e.message).join("; ") ?? "sin issue"}`);
  return { status: "done", message: `${issue.identifier} "${a.title}" creado en ${a.team}`, url: issue.url };
}

/** Baja la prioridad de `from` a `to`. Idempotente: si ya está en `to` no toca nada; si cambió a otra cosa, no la pisa. */
export async function linearLowerPriority(token: string, a: { issueId: string; from: number; to: number }, f: Fetch = fetch): Promise<WorkResult> {
  type Got = { issue?: { identifier: string; priority: number; url: string } | null };
  const got = await linearGql<Got>(f, token, `query($id: String!) { issue(id: $id) { identifier priority url } }`, { id: a.issueId });
  const issue = got.data?.issue;
  if (!issue) return { status: "error", message: `no encontré ${a.issueId} en Linear` };
  const label = (p: number) => PRIORITY_LABEL[p] ?? String(p);
  if (issue.priority === a.to) return { status: "done", message: `${issue.identifier} ya estaba en prioridad ${label(a.to)}`, url: issue.url };
  if (issue.priority !== a.from) return { status: "error", message: `${issue.identifier} cambió desde la propuesta (ahora ${label(issue.priority)}): no la toco` };

  type Updated = { issueUpdate: { success: boolean } };
  const upd = await linearGql<Updated>(f, token, `mutation($id: String!, $p: Int!) { issueUpdate(id: $id, input: { priority: $p }) { success } }`, { id: a.issueId, p: a.to });
  if (!upd.data?.issueUpdate?.success) throw new Error(`linear issueUpdate: ${upd.errors?.map((e) => e.message).join("; ") ?? "sin éxito"}`);
  return { status: "done", message: `${issue.identifier} de prioridad ${label(a.from)} a ${label(a.to)}`, url: issue.url };
}
