import "server-only";
import { getConnection, listConnections } from "@/lib/connections";
import { insertRawEvents, type RawEventInput } from "@/lib/db";
import { freshToken } from "@/lib/oauth";
import type { UserId } from "@/lib/users";

// Ingest de GitHub → raw_events (source "github"). Dos caminos que escriben lo mismo (el dedupe evita duplicados):
// - usuario conectado por OAuth: su actividad en TODOS sus repos, vía la Search API.
// - respaldo con GITHUB_TOKEN de .env.local: solo este repo, repartido por login.
const REPO = "redemerco/hackaton-build-101";
const DAYS = 30;
const SEARCH_PAGES = 3; // la Search API corta en 1000 resultados y 30 req/min: 300 por tipo sobra

// Login de GitHub (en minúscula) → usuario de Pulso. Lo que no matchea (claude, bots) se ignora.
const LOGINS: Record<string, UserId> = {
  santtisosa: "santi",
  redemerco: "renzo",
  jaco25pl: "joaco",
};

async function gh<T>(token: string, url: string, maxPages = Infinity): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`https://api.github.com${url}${sep}per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`GitHub ${url}: ${res.status} ${await res.text()}`);
    const body = await res.json();
    const items: T[] = Array.isArray(body) ? body : body.items; // la Search API envuelve en { items }
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

type Commit = { sha: string; author: { login: string } | null; commit: { author: { date: string } } };
type Pull = { number: number; user: { login: string }; created_at: string };
type Review = { user: { login: string } | null; submitted_at: string | null };
type Issue = { user: { login: string }; created_at: string; pull_request?: unknown };

/** Actividad del usuario conectado en todos sus repos. Sin conexión no hace nada. */
export async function syncGithubUser(userId: string): Promise<number> {
  const conn = getConnection(userId, "github");
  if (!conn) return 0;
  const token = await freshToken(conn);
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const who = `author:${conn.account}`;

  const [commits, pulls, issues] = await Promise.all([
    gh<Commit>(token, `/search/commits?q=${who}+author-date:>=${since}&sort=author-date`, SEARCH_PAGES),
    gh<Issue>(token, `/search/issues?q=${who}+type:pr+created:>=${since}&sort=created`, SEARCH_PAGES),
    gh<Issue>(token, `/search/issues?q=${who}+type:issue+created:>=${since}&sort=created`, SEARCH_PAGES),
  ]);

  const rows: RawEventInput[] = [
    ...commits.map((c) => ({ kind: "commit", ts: c.commit.author.date, data: c })),
    ...pulls.map((p) => ({ kind: "pr", ts: p.created_at, data: p })),
    ...issues.map((i) => ({ kind: "issue", ts: i.created_at, data: i })),
  ].map((r) => ({ ...r, source: "github", userId, ts: new Date(r.ts).toISOString() }));
  return insertRawEvents(rows);
}

/** Respaldo con GITHUB_TOKEN: commits, PRs, reviews e issues de este repo, repartidos por login. */
export async function syncGithubRepo(): Promise<number> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return 0;
  const rows: RawEventInput[] = [];
  const push = (kind: string, login: string | undefined, ts: string | null | undefined, data: unknown) => {
    const userId = login ? LOGINS[login.toLowerCase()] : undefined;
    if (userId && ts) rows.push({ source: "github", kind, userId, ts: new Date(ts).toISOString(), data });
  };

  const repo = `/repos/${REPO}`;
  const [commits, pulls, issues] = await Promise.all([
    gh<Commit>(token, `${repo}/commits`),
    gh<Pull>(token, `${repo}/pulls?state=all`),
    gh<Issue>(token, `${repo}/issues?state=all`),
  ]);

  for (const c of commits) push("commit", c.author?.login, c.commit.author.date, c);
  for (const p of pulls) push("pr", p.user.login, p.created_at, p);
  // /issues también devuelve PRs: esos ya entraron arriba.
  for (const i of issues) if (!i.pull_request) push("issue", i.user.login, i.created_at, i);

  const reviews = await Promise.all(pulls.map((p) => gh<Review>(token, `${repo}/pulls/${p.number}/reviews`)));
  for (const r of reviews.flat()) push("review", r.user?.login, r.submitted_at, r);

  return insertRawEvents(rows);
}

/** Todo: cada usuario conectado + el respaldo del repo. */
export async function syncGithub(): Promise<number> {
  const results = await Promise.allSettled([syncGithubRepo(), ...listConnections("github").map((c) => syncGithubUser(c.userId))]);
  // un token vencido de un usuario no frena la sincronización del resto
  results.forEach((r) => r.status === "rejected" && console.error("[sync/github]", r.reason));
  const counts = results.map((r) => (r.status === "fulfilled" ? r.value : 0));
  return counts.reduce((a, b) => a + b, 0);
}
