import "server-only";
import { getConnection, listConnections } from "@/lib/connections";
import { insertRawEvents } from "@/lib/db";
import { freshToken } from "@/lib/oauth";

// Ingest de Slack → raw_events (source "slack", kind "message"): SOLO metadata de actividad (hora y tipo de canal).
// El texto de los mensajes jamás se guarda ni llega al digest: es la promesa anti-bossware.
const DAYS = 14;
const MAX_PAGES = 5; // search.messages es tier 2 (~20 req/min): 500 mensajes sobran para ver horarios

type Match = { ts: string; channel?: { id?: string; is_im?: boolean; is_mpim?: boolean; is_private?: boolean } };
type SearchResponse = { ok: boolean; error?: string; messages?: { matches: Match[]; paging: { pages: number } } };

const channelType = (c: Match["channel"]) => (c?.is_im ? "dm" : c?.is_mpim ? "group_dm" : c?.is_private ? "private" : "channel");

/** Mensajes que mandó el usuario conectado. Sin conexión no hace nada. */
export async function syncSlackUser(userId: string): Promise<number> {
  const conn = getConnection(userId, "slack");
  if (!conn) return 0;
  const token = await freshToken(conn);
  const after = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const matches: Match[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({ query: `from:me after:${after}`, count: "100", page: String(page), sort: "timestamp" });
    const res = await fetch(`https://slack.com/api/search.messages?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body: SearchResponse = await res.json();
    if (!body.ok || !body.messages) throw new Error(`Slack search: ${body.error}`);
    matches.push(...body.messages.matches);
    if (page >= body.messages.paging.pages) break;
  }

  return insertRawEvents(
    matches.map((m) => ({
      source: "slack",
      kind: "message",
      userId,
      ts: new Date(Number(m.ts) * 1000).toISOString(),
      data: { channel: channelType(m.channel) }, // a propósito: nada de texto, ni nombre de canal, ni con quién
    })),
  );
}

/** Todos los usuarios conectados. */
export async function syncSlack(): Promise<number> {
  const results = await Promise.allSettled(listConnections("slack").map((c) => syncSlackUser(c.userId)));
  // un token vencido de un usuario no frena la sincronización del resto
  results.forEach((r) => r.status === "rejected" && console.error("[sync/slack]", r.reason));
  const counts = results.map((r) => (r.status === "fulfilled" ? r.value : 0));
  return counts.reduce((a, b) => a + b, 0);
}
