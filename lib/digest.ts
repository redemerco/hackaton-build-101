import "server-only";
import { and, desc, eq, gte, ne } from "drizzle-orm";
import { db, insertRawEvents, rawEvents } from "@/lib/db";

const DAYS = 7;
const MAX_EVENTS = 400;

export const DIGEST_SYSTEM = `Sos Pulso, la observabilidad personal de un developer. Recibís su última semana: cuerpo (sueño, pulso, pasos, comidas, ánimo) y trabajo (commits, PRs, issues, reuniones), con hora local de Buenos Aires.
Escribí en español rioplatense, cálido y directo, como un amigo que mira tus métricas.
- Un solo párrafo de 4 a 6 oraciones. Texto plano: sin listas, negritas, títulos ni emojis.
- Buscá cruces entre cuerpo y trabajo, con números concretos ("los 2 días con commits después de las 2am dormiste 4h45").
- Son correlaciones, no causas: decilo así. Nunca diagnostiques, ni des consejo médico, ni nombres enfermedades.
- Si hay pocos datos de alguna fuente, decilo en media oración en vez de inventar.
- Cerrá con una sola sugerencia chica y concreta para mañana.`;

const fmt = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

// GitHub trae objetos enormes: al prompt solo le sirve qué pasó. El resto de las fuentes va crudo, recortado.
function compact(source: string, kind: string, json: string): string {
  if (source === "github") {
    const d = JSON.parse(json);
    if (kind === "commit") return d.commit?.message?.split("\n")[0] ?? "";
    if (kind === "pr") return `${d.title} (${(d.merged_at ?? d.pull_request?.merged_at) ? "merged" : d.state})`;
    if (kind === "issue") return `${d.title} (${d.state})`;
    if (kind === "review") return d.state ?? "";
  }
  if (source === "linear") {
    const d = JSON.parse(json);
    return `${d.identifier} ${d.title} (${d.state?.name})`;
  }
  return json.length > 500 ? `${json.slice(0, 500)}…` : json;
}

export function buildDigestPrompt(userId: string): string {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .select()
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), gte(rawEvents.ts, since), ne(rawEvents.source, "digest")))
    .orderBy(desc(rawEvents.ts))
    .limit(MAX_EVENTS)
    .all()
    .reverse();

  if (rows.length === 0) return "No hay datos de esta semana todavía. Decilo en una línea y sugerí conectar fuentes.";
  const lines = rows.map((r) => `${fmt.format(new Date(r.ts))} ${r.source}/${r.kind} ${compact(r.source, r.kind, r.json)}`);
  return `Eventos de los últimos ${DAYS} días (${rows.length}):\n${lines.join("\n")}`;
}

// El último digest que salió bien queda guardado: si la IA o el wifi mueren en vivo, se re-reproduce.
export function saveDigest(userId: string, text: string) {
  insertRawEvents([{ source: "digest", kind: "cache", userId, ts: new Date().toISOString(), data: { text } }]);
}

export function getCachedDigest(userId: string): string | null {
  const row = db
    .select()
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "digest")))
    .orderBy(desc(rawEvents.ts))
    .get();
  return row ? JSON.parse(row.json).text : null;
}
