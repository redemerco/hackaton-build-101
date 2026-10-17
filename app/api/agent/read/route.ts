import { and, eq, gte } from "drizzle-orm";
import { db, rawEvents } from "@/lib/db";
import { isUserId } from "@/lib/user-list";

// GET /api/agent/read?user=<id>&source=<opt>&since=<ISO opt>
// Lectura para agentes (MCP, etc.). SOLO LECTURA. Auth por token Bearer (AGENT_READ_TOKEN).
// Devuelve los raw_events del usuario pedido. No escribe ni modifica nada.
export async function GET(req: Request): Promise<Response> {
  const token = process.env.AGENT_READ_TOKEN;
  if (!token) return json({ error: "AGENT_READ_TOKEN no configurado en el servidor" }, 500);

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (bearer !== token) return json({ error: "No autorizado" }, 401);

  const url = new URL(req.url);
  const user = url.searchParams.get("user");
  if (!user || !isUserId(user)) return json({ error: "Parámetro 'user' inválido o faltante" }, 400);

  const source = url.searchParams.get("source"); // opcional: github|linear|slack|google|calendar|mood
  const since = url.searchParams.get("since");    // opcional: ISO; solo eventos con ts >= since

  const conds = [eq(rawEvents.userId, user)];
  if (source) conds.push(eq(rawEvents.source, source));
  if (since && !Number.isNaN(Date.parse(since))) conds.push(gte(rawEvents.ts, new Date(since).toISOString()));

  const rows = db.select().from(rawEvents).where(and(...conds)).all();
  const events = rows.map(({ json, ...rest }) => ({ ...rest, data: JSON.parse(json) as unknown }));

  return json({ user, count: events.length, readAt: new Date().toISOString(), events }, 200);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
