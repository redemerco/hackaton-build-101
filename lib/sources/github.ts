import "server-only";
import { insertRawEvents, type RawEventInput } from "@/lib/db";
import type { UserId } from "@/lib/users";

// Ingest de GitHub: commits, PRs, reviews e issues de este repo → raw_events (source "github").
const REPO = "redemerco/hackaton-build-101";

// Login de GitHub (en minúscula) → usuario de Pulso. Lo que no matchea (claude, bots) se ignora.
const LOGINS: Record<string, UserId> = {
  santtisosa: "santi",
  redemerco: "renzo",
  jaco25pl: "joaco",
};

async function gh<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`https://api.github.com/repos/${REPO}${path}${sep}per_page=100&page=${page}`, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`GitHub ${path}: ${res.status} ${await res.text()}`);
    const items = (await res.json()) as T[];
    out.push(...items);
    if (items.length < 100) return out;
  }
}

type Commit = { sha: string; author: { login: string } | null; commit: { author: { date: string } } };
type Pull = { number: number; user: { login: string }; created_at: string };
type Review = { user: { login: string } | null; submitted_at: string | null };
type Issue = { user: { login: string }; created_at: string; pull_request?: unknown };

export async function syncGithub(): Promise<number> {
  const rows: RawEventInput[] = [];
  const push = (kind: string, login: string | undefined, ts: string | null | undefined, data: unknown) => {
    const userId = login ? LOGINS[login.toLowerCase()] : undefined;
    if (userId && ts) rows.push({ source: "github", kind, userId, ts: new Date(ts).toISOString(), data });
  };

  const [commits, pulls, issues] = await Promise.all([
    gh<Commit>("/commits"),
    gh<Pull>("/pulls?state=all"),
    gh<Issue>("/issues?state=all"),
  ]);

  for (const c of commits) push("commit", c.author?.login, c.commit.author.date, c);
  for (const p of pulls) push("pr", p.user.login, p.created_at, p);
  // /issues también devuelve PRs: esos ya entraron arriba.
  for (const i of issues) if (!i.pull_request) push("issue", i.user.login, i.created_at, i);

  const reviews = await Promise.all(pulls.map((p) => gh<Review>(`/pulls/${p.number}/reviews`)));
  for (const r of reviews.flat()) push("review", r.user?.login, r.submitted_at, r);

  return insertRawEvents(rows);
}
