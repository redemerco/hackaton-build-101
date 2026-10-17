import "server-only";
import { insertRawEvents, type RawEventInput } from "@/lib/db";
import type { UserId } from "@/lib/users";

// Ingest de Linear: cada issue deja hasta 3 eventos (creado, empezado, terminado) → raw_events (source "linear").
const DAYS = 30;

// Email de la cuenta de Linear → usuario de Pulso. Lo que no matchea se ignora.
const EMAILS: Record<string, UserId> = {
  "santiagososatraibel@gmail.com": "santi",
  "joaquinlangone12@gmail.com": "joaco",
};

const QUERY = `query($after: String, $since: DateTimeOrDuration!) {
  issues(first: 100, after: $after, filter: { updatedAt: { gt: $since } }) {
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

export async function syncLinear(): Promise<number> {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  const issues: Issue[] = [];
  let after: string | null = null;
  do {
    const res: Response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      // Linear: la API key va SIN "Bearer".
      headers: { Authorization: process.env.LINEAR_API_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { after, since } }),
      cache: "no-store",
    });
    const body: { data: { issues: { nodes: Issue[]; pageInfo: { hasNextPage: boolean; endCursor: string } } }; errors?: unknown } =
      await res.json();
    if (!res.ok || body.errors) throw new Error(`Linear: ${res.status} ${JSON.stringify(body.errors ?? body)}`);
    issues.push(...body.data.issues.nodes);
    after = body.data.issues.pageInfo.hasNextPage ? body.data.issues.pageInfo.endCursor : null;
  } while (after);

  const rows: RawEventInput[] = [];
  for (const i of issues) {
    const userId = EMAILS[(i.assignee ?? i.creator)?.email.toLowerCase() ?? ""];
    if (!userId) continue;
    const events: [string, string | null][] = [
      ["issue_created", i.createdAt],
      ["issue_started", i.startedAt],
      ["issue_completed", i.completedAt],
    ];
    for (const [kind, ts] of events) {
      if (ts) rows.push({ source: "linear", kind, userId, ts: new Date(ts).toISOString(), data: i });
    }
  }
  return insertRawEvents(rows);
}
