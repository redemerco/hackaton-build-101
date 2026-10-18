// events.insert idempotente con id determinístico, que sabe recrear un evento borrado. Puro (fetch inyectable):
// sin server-only ni alias "@/", lo prueba scripts/test-agent-rules.mts con fetch mockeado.

export const CAL_EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type InsertBody = { id: string } & Record<string, unknown>;
/** created: lo creamos ahora · existed: ya estaba (confirmado) · revived: estaba borrado y lo reactivamos/recreamos. */
export type InsertOutcome = { outcome: "created" | "existed" | "revived"; eventId: string; link?: string };

const fail = async (what: string, res: Response) => new Error(`calendar ${what} ${res.status}: ${(await res.text()).slice(0, 200)}`);
const linkOf = async (res: Response) => ((await res.json()) as { htmlLink?: string }).htmlLink;

/**
 * POST con `body.id`. Si da 409 (el id ya existe) hace GET:
 * - confirmado → "ya estaba", no se duplica;
 * - `status: "cancelled"` (alguien lo borró) → PATCH status=confirmed con horario y título de ahora;
 *   si Google no deja reactivarlo, se recrea con el mismo id + sufijo `r<base32>`.
 */
export async function insertOrRevive(fetchFn: Fetch, headers: Record<string, string>, body: InsertBody, now = Date.now()): Promise<InsertOutcome> {
  const res = await fetchFn(CAL_EVENTS, { method: "POST", headers, body: JSON.stringify(body) });
  if (res.ok) return { outcome: "created", eventId: body.id, link: await linkOf(res) };
  if (res.status !== 409) throw await fail("insert", res);

  const url = `${CAL_EVENTS}/${encodeURIComponent(body.id)}`;
  const got = await fetchFn(url, { headers, cache: "no-store" });
  const ev = got.ok ? ((await got.json()) as { htmlLink?: string; status?: string }) : null;
  if (ev?.status !== "cancelled") return { outcome: "existed", eventId: body.id, link: ev?.htmlLink };

  const rest: Record<string, unknown> = { ...body };
  delete rest.id;
  const patch = await fetchFn(url, { method: "PATCH", headers, body: JSON.stringify({ ...rest, status: "confirmed" }) });
  if (patch.ok) return { outcome: "revived", eventId: body.id, link: await linkOf(patch) };

  // Plan B: otro id (base32hex: 0-9 a-v), que isPulsoEventId sigue reconociendo.
  const id = `${body.id}r${now.toString(32)}`;
  const again = await fetchFn(CAL_EVENTS, { method: "POST", headers, body: JSON.stringify({ ...body, id }) });
  if (!again.ok) throw await fail("reinsert", again);
  return { outcome: "revived", eventId: id, link: await linkOf(again) };
}
