import "server-only";
import { getConnection, listConnections } from "@/lib/connections";
import { insertRawEvents, type RawEventInput } from "@/lib/db";
import { freshToken } from "@/lib/oauth";
import type { UserId } from "@/lib/users";

// Ingest de Linear: cada issue deja hasta 3 eventos (creado, empezado, terminado) → raw_events (source "linear").
// - usuario conectado por OAuth: sus issues asignados.
// - respaldo con LINEAR_API_KEY de .env.local: todo el workspace, repartido por email.
const DAYS = 30;

// Email de la cuenta de Linear → usuario de Pulso (solo para el respaldo con API key).
const EMAILS: Record<string, UserId> = {
  "santiagososatraibel@gmail.com": "santi",
  "joaquinlangone12@gmail.com": "joaco",
};

const QUERY = `query($after: String, $filter: IssueFilter) {
  issues(first: 100, after: $after, filter: $filter) {
    pageInfo { hasNextPage endCursor }
    nodes {
      identifier title priority estimate createdAt startedAt completedAt canceledAt
      state { name type }
      assignee { email }
      creator { email }
    }
  }
}`;

type Issue = {
  identifier: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  assignee: { email: string } | null;
  creator: { email: string } | null;
};

type Page = { data: { issues: { nodes: Issue[]; pageInfo: { hasNextPage: boolean; endCursor: string } } }; errors?: unknown };

// `authorization`: la API key va SIN "Bearer"; el token OAuth va CON "Bearer".
async function fetchIssues(authorization: string, onlyMine: boolean): Promise<Issue[]> {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  const filter = { updatedAt: { gt: since }, ...(onlyMine && { assignee: { isMe: { eq: true } } }) };
  const issues: Issue[] = [];
  let after: string | null = null;
  do {
    const res: Response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { after, filter } }),
      cache: "no-store",
    });
    const body: Page = await res.json();
    if (!res.ok || body.errors) throw new Error(`Linear: ${res.status} ${JSON.stringify(body.errors ?? body)}`);
    issues.push(...body.data.issues.nodes);
    after = body.data.issues.pageInfo.hasNextPage ? body.data.issues.pageInfo.endCursor : null;
  } while (after);
  return issues;
}

function toRows(issue: Issue, userId: string): RawEventInput[] {
  const events: [string, string | null][] = [
    ["issue_created", issue.createdAt],
    ["issue_started", issue.startedAt],
    ["issue_completed", issue.completedAt],
  ];
  return events
    .filter(([, ts]) => ts)
    .map(([kind, ts]) => ({ source: "linear", kind, userId, ts: new Date(ts!).toISOString(), data: issue }));
}

/** Issues asignados al usuario conectado. Sin conexión no hace nada. */
export async function syncLinearUser(userId: string): Promise<number> {
  const conn = getConnection(userId, "linear");
  if (!conn) return 0;
  const issues = await fetchIssues(`Bearer ${await freshToken(conn)}`, true);
  return insertRawEvents(issues.flatMap((i) => toRows(i, userId)));
}

/** Respaldo con LINEAR_API_KEY: todo el workspace, repartido por email. */
export async function syncLinearWorkspace(): Promise<number> {
  const key = process.env.LINEAR_API_KEY;
  if (!key) return 0;
  const issues = await fetchIssues(key, false);
  return insertRawEvents(
    issues.flatMap((i) => {
      const userId = EMAILS[(i.assignee ?? i.creator)?.email.toLowerCase() ?? ""];
      return userId ? toRows(i, userId) : [];
    }),
  );
}

/** Todo: cada usuario conectado + el respaldo del workspace. */
export async function syncLinear(): Promise<number> {
  const counts = await Promise.all([syncLinearWorkspace(), ...listConnections("linear").map((c) => syncLinearUser(c.userId))]);
  return counts.reduce((a, b) => a + b, 0);
}
