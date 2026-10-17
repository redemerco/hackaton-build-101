import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { getAI, MODEL } from "@/lib/ai";
import { formatDuration } from "@/lib/ascii";
import { db, insertRawEvents, rawEvents } from "@/lib/db";
import { getNudge } from "@/lib/nudge";
import { dayInputs } from "@/lib/ranking";
import { mean } from "@/lib/score";

// Agente: propone acciones concretas (mover una reunión, bloquear foco, mandar el nudge) con datos reales y las ejecuta
// solo con Confirmar. La IA elige; el código valida (eventos que existen, horarios del mismo día, sin pisar reuniones).

export type AgentAction = {
  id: string;
  type: "move_meeting" | "block_focus" | "send_nudge";
  eventId?: string;
  from?: string; // ISO: inicio actual de la reunión
  to?: string; // ISO: inicio nuevo (move_meeting) o inicio del bloque (block_focus)
  minutes?: number; // duración del bloque de foco
  reason: string;
  isSimulated: boolean; // no se ejecuta: la tarjeta dice [simulado] y deja el link para hacerlo a mano
  /** Rótulo honesto del origen: "ejemplo" = regla fija sin IA; "cache" = última propuesta de la IA (sin wifi). */
  tag?: "ejemplo" | "cache";
};

// Montevideo no tiene horario de verano desde 2015: el offset es fijo.
const TZ = "America/Montevideo";
const OFFSET = "-03:00";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }); // → "2026-10-17"
const hhmm = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const localHour = (ms: number) => Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date(ms)));
const MIN = 60_000;
const DAY_MS = 86400_000;
const MAX_ACTIONS = 2;
const DAY_END_HOUR = 20; // nada se mueve ni se bloquea después de las 20 h
const BASELINE_DAYS = 14;

const isCalendarWriteOk = () => process.env.CALENDAR_WRITE_OK === "1";
const localIso = (ms: number) => `${dayKey.format(new Date(ms))}T${hhmm.format(new Date(ms))}:00${OFFSET}`;
const atLocal = (key: string, hour: number, minute = 0) =>
  `${key}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${OFFSET}`;

type Meeting = { id: string; start: number; end: number; durationMin: number };

/** Reuniones con hora de hoy (local), una por `id`; si quedó una fila vieja del mismo id, gana la última sincronizada. */
function meetingsToday(userId: string, now: number): Meeting[] {
  const today = dayKey.format(new Date(now));
  const rows = db
    .select({ id: rawEvents.id, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "calendar"), gte(rawEvents.ts, new Date(now - DAY_MS).toISOString())))
    .orderBy(rawEvents.id)
    .all();
  const byId = new Map<string, Meeting>();
  for (const r of rows) {
    const d = JSON.parse(r.json) as { id?: string | null; start?: string; end?: string | null; allDay?: boolean };
    if (!d.id || d.allDay || !d.start || !d.end) continue;
    const start = Date.parse(d.start);
    const end = Date.parse(d.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || dayKey.format(new Date(start)) !== today) continue;
    byId.set(d.id, { id: d.id, start, end, durationMin: Math.round((end - start) / MIN) });
  }
  return [...byId.values()].sort((a, b) => a.start - b.start);
}

// TODO: pasar a getHourly de lib/hourly.ts cuando Santi lo suba. Mientras, commits por hora local de los últimos 14 días.
function commitsByHour(userId: string, now: number): number[] {
  const rows = db
    .select({ ts: rawEvents.ts })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "github"), eq(rawEvents.kind, "commit"), gte(rawEvents.ts, new Date(now - BASELINE_DAYS * DAY_MS).toISOString())))
    .all();
  const hours = Array.from({ length: 24 }, () => 0);
  for (const r of rows) hours[localHour(Date.parse(r.ts))]++;
  return hours;
}

/** Ventana de 2 h con más commits, en horario de trabajo (8–20). null si no hay commits. */
function peakWindow(hours: number[]): { from: number; to: number } | null {
  let best = -1;
  let bestN = 0;
  for (let h = 8; h < DAY_END_HOUR - 1; h++) {
    const n = hours[h] + hours[h + 1];
    if (n > bestN) [best, bestN] = [h, n];
  }
  return best < 0 ? null : { from: best, to: best + 2 };
}

type Inputs = {
  now: number;
  today: string;
  meetings: Meeting[]; // todas las de hoy (para no pisarlas)
  upcoming: Meeting[]; // las que todavía no empezaron (las únicas que se pueden mover)
  sleepMin: number | null;
  restingBpm: number | null;
  typicalBpm: number | null;
  peak: { from: number; to: number } | null;
  hours: number[];
  nudge: ReturnType<typeof getNudge>;
};

function gatherInputs(userId: string, now: number): Inputs {
  const today = dayKey.format(new Date(now));
  const meetings = meetingsToday(userId, now);
  const { days } = dayInputs(userId, now - (BASELINE_DAYS + 1) * DAY_MS);
  const day = days.get(today);
  const prior = Array.from({ length: BASELINE_DAYS }, (_, i) => days.get(dayKey.format(new Date(now - (i + 1) * DAY_MS)))?.restingBpm);
  const hours = commitsByHour(userId, now);
  const typical = mean(prior);
  return {
    now,
    today,
    meetings,
    upcoming: meetings.filter((m) => m.start > now),
    sleepMin: day?.sleep ? Math.round(day.sleep.asleepMin) : null,
    restingBpm: day?.restingBpm ?? null,
    typicalBpm: typical === undefined ? null : Math.round(typical),
    peak: peakWindow(hours),
    hours,
    nudge: getNudge(userId, new Date(now)),
  };
}

const overlaps = (start: number, end: number, meetings: Meeting[], exceptId?: string) =>
  meetings.some((m) => m.id !== exceptId && start < m.end && end > m.start);

/** El server decide qué pasa: lo que no cumple se descarta. La IA nunca inventa un evento ni un horario imposible. */
function validate(raw: unknown, inp: Inputs): AgentAction[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentAction[] = [];
  const usedEvents = new Set<string>();
  const dayEnd = Date.parse(atLocal(inp.today, DAY_END_HOUR));
  for (const item of raw) {
    if (out.length >= MAX_ACTIONS) break;
    const a = item as Partial<AgentAction>;
    const reason = typeof a.reason === "string" ? a.reason.trim().slice(0, 240) : "";
    if (!reason) continue;
    const base = { id: crypto.randomUUID(), reason };
    if (a.type === "move_meeting") {
      const m = inp.upcoming.find((x) => x.id === a.eventId);
      const to = typeof a.to === "string" ? Date.parse(a.to) : NaN;
      if (!m || usedEvents.has(m.id) || !Number.isFinite(to)) continue;
      const end = to + m.durationMin * MIN;
      if (to === m.start || to <= inp.now || dayKey.format(new Date(to)) !== inp.today || end > dayEnd) continue;
      if (overlaps(to, end, inp.meetings, m.id)) continue;
      usedEvents.add(m.id);
      // `from` sale de la fila del usuario, no de la IA.
      out.push({ ...base, type: "move_meeting", eventId: m.id, from: new Date(m.start).toISOString(), to: new Date(to).toISOString(), isSimulated: !isCalendarWriteOk() });
    } else if (a.type === "block_focus") {
      const to = typeof a.to === "string" ? Date.parse(a.to) : NaN;
      const minutes = Math.round(Number(a.minutes));
      if (!Number.isFinite(to) || !(minutes >= 15 && minutes <= 180)) continue;
      const end = to + minutes * MIN;
      if (to <= inp.now || dayKey.format(new Date(to)) !== inp.today || end > dayEnd || overlaps(to, end, inp.meetings)) continue;
      // TODO P2 (tarea 7): events.insert real. Hasta entonces block_focus siempre es [simulado].
      out.push({ ...base, type: "block_focus", to: new Date(to).toISOString(), minutes, isSimulated: true });
    } else if (a.type === "send_nudge") {
      if (!inp.nudge || out.some((x) => x.type === "send_nudge")) continue;
      out.push({ ...base, type: "send_nudge", isSimulated: false });
    }
  }
  return out;
}

const SYSTEM = `Sos el agente de build101: mirás el cuerpo (sueño, pulso) y el trabajo (commits por hora, reuniones) de una persona y proponés acciones concretas para su día.
Devolvés SOLO un array JSON con COMO MÁXIMO 2 acciones. Cada acción es uno de:
- {"type":"move_meeting","eventId":"<id de la lista>","to":"<ISO 8601 con offset -03:00, hoy>","reason":"..."}
- {"type":"block_focus","to":"<ISO 8601 con offset -03:00, hoy>","minutes":<15-180>,"reason":"..."}
- {"type":"send_nudge","reason":"..."}  (solo si hay un nudge disponible)
Reglas:
- Solo podés mover reuniones de la lista, por su "id" exacto. Nunca inventes un evento.
- "to" tiene que ser hoy, en el futuro, antes de las 20:00, y la reunión movida no puede pisar otra reunión.
- Mover una reunión tiene sentido si cae en el pico de commits o si dormiste poco y conviene liberar la mañana o la hora pico.
- "reason": UNA oración en español rioplatense que cite un dato de los números ("dormiste 4h10 y tu pico de commits es 15–17"). Correlación, no causa. Sin emojis.
- Si nada amerita una acción, devolvé [].`;

function buildPrompt(inp: Inputs): string {
  const lines = [
    `Ahora: ${localIso(inp.now)} (${TZ}).`,
    `Sueño de anoche: ${inp.sleepMin === null ? "sin dato" : formatDuration(inp.sleepMin)}.`,
    `Pulso en reposo hoy: ${inp.restingBpm ?? "sin dato"} bpm; típico (${BASELINE_DAYS} días): ${inp.typicalBpm ?? "sin dato"} bpm.`,
    `Pico de commits (ventana de 2 h, últimos ${BASELINE_DAYS} días): ${inp.peak ? `${inp.peak.from}–${inp.peak.to} h` : "sin commits"}.`,
    `Commits por hora local (0-23): ${JSON.stringify(inp.hours)}.`,
    `Reuniones de hoy que todavía no empezaron (movibles): ${JSON.stringify(inp.upcoming.map((m) => ({ id: m.id, from: localIso(m.start), durationMin: m.durationMin })))}.`,
    `Todas las reuniones de hoy (no pisarlas): ${JSON.stringify(inp.meetings.map((m) => ({ from: localIso(m.start), to: localIso(m.end) })))}.`,
    `Nudge disponible: ${inp.nudge ? `"${inp.nudge.body}"` : "no"}.`,
  ];
  return lines.join("\n");
}

// TODO: pasar a generateJson de lib/ai.ts cuando Santi lo suba.
async function generateJsonLocal<T>(system: string, prompt: string): Promise<T> {
  const res = await getAI().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: { systemInstruction: system, responseMimeType: "application/json" },
  });
  return JSON.parse(res.text ?? "null") as T;
}

/** Sin IA: la reunión más próxima al pico de commits va justo después del pico; sin reuniones, el nudge. Rótulo [ejemplo]. */
function deterministic(inp: Inputs): AgentAction[] {
  const lead = inp.sleepMin !== null ? `Dormiste ${formatDuration(inp.sleepMin)} y tu pico` : "Tu pico";
  const dayEnd = Date.parse(atLocal(inp.today, DAY_END_HOUR));
  if (inp.peak && inp.upcoming.length) {
    const peakMid = Date.parse(atLocal(inp.today, inp.peak.from + 1));
    const m = [...inp.upcoming].sort((a, b) => Math.abs(a.start - peakMid) - Math.abs(b.start - peakMid))[0];
    const candidates = [Date.parse(atLocal(inp.today, inp.peak.to)), Date.parse(atLocal(inp.today, inp.peak.from)) - m.durationMin * MIN];
    const to = candidates.find((t) => t > inp.now && t !== m.start && t + m.durationMin * MIN <= dayEnd && !overlaps(t, t + m.durationMin * MIN, inp.meetings, m.id));
    if (to !== undefined) {
      return [{
        id: crypto.randomUUID(),
        type: "move_meeting",
        eventId: m.id,
        from: new Date(m.start).toISOString(),
        to: new Date(to).toISOString(),
        reason: `${lead} de commits es ${inp.peak.from}–${inp.peak.to} h: la reunión de las ${hhmm.format(new Date(m.start))} pasa a las ${hhmm.format(new Date(to))} para no cortarlo.`,
        isSimulated: !isCalendarWriteOk(),
        tag: "ejemplo",
      }];
    }
  }
  if (inp.nudge) {
    return [{ id: crypto.randomUUID(), type: "send_nudge", reason: inp.nudge.body, isSimulated: false, tag: "ejemplo" }];
  }
  return [];
}

type Proposal = { actions: AgentAction[]; origin: "ia" | "cache" | "ejemplo" };

/** Última propuesta de la IA de hoy cuyas reuniones siguen siendo válidas: el [cache] del dry-run sin wifi. */
function cachedProposal(userId: string, inp: Inputs): AgentAction[] | null {
  const startOfDay = new Date(Date.parse(atLocal(inp.today, 0))).toISOString();
  const rows = db
    .select({ json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "agent"), eq(rawEvents.kind, "proposal"), gte(rawEvents.ts, startOfDay)))
    .orderBy(desc(rawEvents.ts))
    .all();
  for (const r of rows) {
    const p = JSON.parse(r.json) as Proposal;
    if (p.origin === "ejemplo") continue;
    const actions = p.actions.filter((a) => (!a.to || Date.parse(a.to) > inp.now) && (a.type !== "move_meeting" || inp.upcoming.some((m) => m.id === a.eventId)));
    return actions.map((a) => ({ ...a, tag: "cache" as const, isSimulated: a.type === "move_meeting" ? !isCalendarWriteOk() : a.isSimulated }));
  }
  return null;
}

/** Propone hasta 2 acciones. La IA elige; si falla, la última propuesta de la IA de hoy ([cache]) o la regla fija ([ejemplo]). */
export async function proposeActions(userId: string, now = Date.now()): Promise<Proposal> {
  const inp = gatherInputs(userId, now);
  try {
    const raw = await generateJsonLocal<unknown>(SYSTEM, buildPrompt(inp));
    return { actions: validate(raw, inp), origin: "ia" };
  } catch (error) {
    console.error("[agent] la IA no propuso, cae a cache/ejemplo", error);
  }
  const cached = cachedProposal(userId, inp);
  if (cached) return { actions: cached, origin: "cache" };
  return { actions: deterministic(inp), origin: "ejemplo" };
}

/** Guarda la propuesta en raw_events: es lo que `run` relee por `id` (nunca confía en el payload del cliente). */
export function saveProposal(userId: string, proposal: Proposal, now = Date.now()) {
  insertRawEvents([{ source: "agent", kind: "proposal", userId, ts: new Date(now).toISOString(), data: proposal }]);
}
