import "server-only";
import { and, desc, eq, gte, ne, notInArray } from "drizzle-orm";
import { db, insertRawEvents, rawEvents } from "@/lib/db";

const DAYS = 7;
const MAX_EVENTS = 400;

export const DIGEST_SYSTEM = `Sos build101, la observabilidad personal de un developer. Recibís su última semana: cuerpo (sueño, pulso, pasos, comidas, ánimo) y trabajo (commits, PRs, issues, reuniones), con hora local de Montevideo.
Escribí en español rioplatense, cálido y directo, como un amigo que mira tus métricas.
- Un solo párrafo de 4 a 6 oraciones. Texto plano: sin listas, negritas, títulos ni emojis.
- Buscá cruces entre cuerpo y trabajo, con números concretos ("los 2 días con commits después de las 2am dormiste 4h45").
- Son correlaciones, no causas: decilo así. Nunca diagnostiques, ni des consejo médico, ni nombres enfermedades.
- Si hay pocos datos de alguna fuente, decilo en media oración en vez de inventar.
- Cerrá con una sola sugerencia chica y concreta para mañana.`;

const fmt = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Montevideo",
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
  if (source === "google") {
    const d = JSON.parse(json);
    if (kind === "sleep") return sleepLine(d.sleep);
    if (kind === "hrv") return `HRV ${d.dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds} ms`;
    if (kind === "resting_hr") return `FC en reposo ${d.dailyRestingHeartRate?.beatsPerMinute} lpm`;
  }
  if (source === "linear") {
    const d = JSON.parse(json);
    return `${d.identifier} ${d.title} (${d.state?.name})`;
  }
  return json.length > 500 ? `${json.slice(0, 500)}…` : json;
}

const mins = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);
const hm = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;

// El JSON crudo de sueño trae cada etapa con timestamps (~8 KB): al prompt va la duración y los minutos por etapa.
function sleepLine(s: { interval?: { startTime: string; endTime: string }; stages?: { startTime: string; endTime: string; type: string }[] }): string {
  if (!s?.interval) return "";
  const byType = new Map<string, number>();
  for (const st of s.stages ?? []) byType.set(st.type, (byType.get(st.type) ?? 0) + mins(st.startTime, st.endTime));
  const total = mins(s.interval.startTime, s.interval.endTime) - (byType.get("AWAKE") ?? 0);
  const stages = [...byType].map(([t, m]) => `${t.toLowerCase()} ${m}m`).join(", ");
  return `durmió ${hm(total)} (${hour.format(new Date(s.interval.startTime))}–${hour.format(new Date(s.interval.endTime))}${stages ? `; ${stages}` : ""})`;
}

export function buildDigestPrompt(userId: string): string {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .select()
    .from(rawEvents)
    .where(
      // fuera lo que escribe la propia app (resúmenes, agente, reportes): no son eventos del usuario
      and(eq(rawEvents.userId, userId), gte(rawEvents.ts, since), notInArray(rawEvents.source, ["digest", "slack", "summary", "agent", "report"]), ne(rawEvents.kind, "azm")),
    )
    .orderBy(desc(rawEvents.ts))
    .limit(MAX_EVENTS)
    .all()
    .reverse();
  const slack = slackPerDay(userId, since) + azmPerDay(userId, since);

  if (rows.length === 0 && !slack) return "No hay datos de esta semana todavía. Decilo en una línea y sugerí conectar fuentes.";
  const lines = rows.map((r) => `${fmt.format(new Date(r.ts))} ${r.source}/${r.kind} ${compact(r.source, r.kind, r.json)}`);
  return `Eventos de los últimos ${DAYS} días (${rows.length}):\n${lines.join("\n")}${slack}`;
}

const day = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Montevideo", weekday: "short", day: "2-digit", month: "2-digit" });
const hour = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit" });

// Slack puede ser cientos de mensajes: al prompt va un resumen por día (cuántos, primero, último), nunca contenido.
function slackPerDay(userId: string, since: string): string {
  const rows = db
    .select({ ts: rawEvents.ts })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "slack"), gte(rawEvents.ts, since)))
    .orderBy(rawEvents.ts)
    .all();
  if (rows.length === 0) return "";
  const byDay = Map.groupBy(rows, (r) => day.format(new Date(r.ts)));
  const lines = [...byDay].map(([d, msgs]) => {
    const first = hour.format(new Date(msgs[0].ts));
    const last = hour.format(new Date(msgs[msgs.length - 1].ts));
    return `${d} slack: ${msgs.length} mensajes, primero ${first}, último ${last}`;
  });
  return `\n\nActividad en Slack por día (solo horarios):\n${lines.join("\n")}`;
}

// Active Zone Minutes llega minuto a minuto (cientos por semana, ~500 B cada uno): al prompt va el total por día y zona.
function azmPerDay(userId: string, since: string): string {
  const rows = db
    .select({ ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "google"), eq(rawEvents.kind, "azm"), gte(rawEvents.ts, since)))
    .orderBy(rawEvents.ts)
    .all();
  if (rows.length === 0) return "";
  const byDay = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const a = JSON.parse(r.json).activeZoneMinutes;
    const zones = byDay.get(day.format(new Date(r.ts))) ?? new Map<string, number>();
    const zone = String(a?.heartRateZone ?? "?").toLowerCase();
    zones.set(zone, (zones.get(zone) ?? 0) + Number(a?.activeZoneMinutes ?? 0));
    byDay.set(day.format(new Date(r.ts)), zones);
  }
  const lines = [...byDay].map(([d, zones]) => `${d} minutos en zona activa: ${[...zones].map(([z, m]) => `${z} ${m}`).join(", ")}`);
  return `\n\nMinutos en zona activa por día (Google Health):\n${lines.join("\n")}`;
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
