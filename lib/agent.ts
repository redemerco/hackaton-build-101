import "server-only";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { generateJson } from "@/lib/ai";
import { formatDuration } from "@/lib/ascii";
import { getLastNight, getMealsToday } from "@/lib/body";
import { getConnection } from "@/lib/connections";
import { db, insertRawEvents, rawEvents } from "@/lib/db";
import { getNudge } from "@/lib/nudge";
import { freshToken } from "@/lib/oauth";
import { sendPush } from "@/lib/push";
import { dayInputs } from "@/lib/ranking";
import { mean } from "@/lib/score";
import { syncCalendarUser } from "@/lib/sources/calendar";
import {
  agentConfig,
  assess,
  atLocalMinute,
  calendarEventId,
  candidatesFor,
  DAY_MS,
  fallbackReason,
  hhmmOf,
  isExpired,
  isPulsoEventId,
  localDayKey,
  localHour,
  MIN,
  OFFSET,
  startOfLocalDay,
  startOfLocalWeek,
  TZ,
  type Assessment,
  type Candidate,
  type PromisedIssue,
} from "@/lib/agent-rules";
import { claimRun, doneRuns, finishRun, releaseRun } from "@/lib/agent-runs";

// Agente: evalúa cómo venís (trabajo: avance de la semana vs lo prometido; salud: estrés, sueño, entrenamiento, comida,
// ánimo), de los flags saca acciones candidatas y la IA elige y redacta el porqué. Nada se ejecuta sin Confirmar.
// La IA elige; el código valida (eventos que existen, horarios del mismo día, sin pisar reuniones) y fija los horarios.

export type AgentActionType = "move_meeting" | "block_focus" | "block_training" | "block_rest" | "bedtime" | "log_prompt" | "send_nudge";

export type AgentAction = {
  id: string;
  type: AgentActionType;
  eventId?: string;
  from?: string; // ISO: inicio actual de la reunión
  to?: string; // ISO: inicio nuevo (move_meeting) o inicio del bloque/evento
  minutes?: number; // duración del bloque
  target?: "mood" | "meals" | "both"; // log_prompt: qué falta registrar
  url?: string; // log_prompt: a dónde lleva el push
  reason: string;
  isSimulated: boolean; // no se ejecuta: la tarjeta dice [simulado] y deja el link para hacerlo a mano
  /** Rótulo honesto del origen: "ejemplo" = regla fija sin IA; "cache" = última propuesta de la IA (sin wifi). */
  tag?: "ejemplo" | "cache";
  /** Ya se ejecutó (lo agrega GET /api/agent/pending): la tarjeta arranca en "hecho". */
  done?: { message: string | null; url: string | null };
};

export type RunResult =
  | { status: "done"; message: string; url?: string }
  | { status: "simulated"; message: string; url: string }
  | { status: "error"; message: string };

export type Proposal = {
  actions: AgentAction[];
  origin: "ia" | "cache" | "ejemplo";
  assessment?: Assessment;
  createdAt?: string;
  expiresAt?: string;
};

const hhmm = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const MAX_ACTIONS = 3;
const BASELINE_DAYS = 14;
const MIN_BASELINE = 3;
const TYPICAL_WEEKS = 3;
const CALENDAR_TYPES = new Set<AgentActionType>(["move_meeting", "block_focus", "block_training", "block_rest", "bedtime"]);

const isCalendarWriteOk = () => process.env.CALENDAR_WRITE_OK === "1";
const localIso = (ms: number) => `${localDayKey(ms)}T${hhmmOf(ms)}:00${OFFSET}`;

type Meeting = { id: string; start: number; end: number; durationMin: number };

/** Eventos con hora de Calendar en [from, to), uno por `id`; si quedó una fila vieja del mismo id, gana la última sincronizada. */
function calendarEvents(userId: string, from: number, to: number): Meeting[] {
  const rows = db
    .select({ json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "calendar"), gte(rawEvents.ts, new Date(from - DAY_MS).toISOString()), lt(rawEvents.ts, new Date(to).toISOString())))
    .orderBy(rawEvents.id)
    .all();
  const byId = new Map<string, Meeting>();
  for (const r of rows) {
    const d = JSON.parse(r.json) as { id?: string | null; start?: string; end?: string | null; allDay?: boolean };
    if (!d.id || d.allDay || !d.start || !d.end) continue;
    const start = Date.parse(d.start);
    const end = Date.parse(d.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < from || start >= to) continue;
    byId.set(d.id, { id: d.id, start, end, durationMin: Math.round((end - start) / MIN) });
  }
  return [...byId.values()].sort((a, b) => a.start - b.start);
}

// Commits por hora local, acumulados en los últimos 14 días (lib/hourly.ts arma un día por vez, no el acumulado).
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
function peakWindow(hours: number[], dayEndHour: number): { from: number; to: number } | null {
  let best = -1;
  let bestN = 0;
  for (let h = 8; h < dayEndHour - 1; h++) {
    const n = hours[h] + hours[h + 1];
    if (n > bestN) [best, bestN] = [h, n];
  }
  return best < 0 ? null : { from: best, to: best + 2 };
}

const countGithub = (userId: string, kind: string, from: number, to: number) =>
  db
    .select({ n: sql<number>`count(*)` })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "github"), eq(rawEvents.kind, kind), gte(rawEvents.ts, new Date(from).toISOString()), lt(rawEvents.ts, new Date(to).toISOString())))
    .get()?.n ?? 0;

/** Lo prometido en Linear: issues asignados (o sin asignar, del respaldo) que siguen abiertos, o que se cerraron esta semana. */
function promisedIssues(userId: string, weekStart: number): PromisedIssue[] {
  const me = getConnection(userId, "linear")?.account?.toLowerCase();
  const rows = db
    .select({ json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "linear"), gte(rawEvents.ts, new Date(weekStart - 30 * DAY_MS).toISOString())))
    .orderBy(rawEvents.id)
    .all();
  type Issue = { identifier?: string; title?: string; estimate?: number | null; completedAt?: string | null; canceledAt?: string | null; state?: { type?: string }; assignee?: { email?: string } | null };
  const latest = new Map<string, Issue>();
  for (const r of rows) {
    const d = JSON.parse(r.json) as Issue;
    if (d.identifier) latest.set(d.identifier, d); // la fila más nueva trae el estado más reciente
  }
  const out: PromisedIssue[] = [];
  for (const i of latest.values()) {
    if (i.canceledAt || i.state?.type === "canceled") continue;
    if (me && i.assignee?.email && i.assignee.email.toLowerCase() !== me) continue;
    const done = Boolean(i.completedAt) || i.state?.type === "completed";
    if (done ? Date.parse(i.completedAt ?? "") >= weekStart : i.state?.type === "started" || i.state?.type === "unstarted") {
      out.push({ id: i.identifier!, title: i.title ?? "", done, weight: i.estimate && i.estimate > 0 ? i.estimate : 1 });
    }
  }
  return out;
}

function moodsToday(userId: string, now: number): number[] {
  return db
    .select({ json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "mood"), gte(rawEvents.ts, new Date(startOfLocalDay(now)).toISOString())))
    .orderBy(rawEvents.ts)
    .all()
    .map((r) => Number((JSON.parse(r.json) as { mood?: unknown }).mood))
    .filter((m) => m >= 1 && m <= 5);
}

type Inputs = {
  now: number;
  today: string;
  meetings: Meeting[]; // todos los eventos con hora de hoy (para no pisarlos; incluye los bloques de Pulso)
  upcoming: Meeting[]; // reuniones que todavía no empezaron (las únicas que se pueden mover)
  sleepMin: number | null;
  restingBpm: number | null;
  typicalBpm: number | null;
  peak: { from: number; to: number } | null;
  hours: number[];
  nudge: ReturnType<typeof getNudge>;
  assessment: Assessment;
  candidates: Candidate[];
};

function gatherInputs(userId: string, now: number): Inputs {
  const cfg = agentConfig();
  const today = localDayKey(now);
  const dayStart = startOfLocalDay(now);
  const weekStart = startOfLocalWeek(now);
  const meetings = calendarEvents(userId, dayStart, dayStart + DAY_MS);
  const { days } = dayInputs(userId, now - (BASELINE_DAYS + 8) * DAY_MS);
  const day = days.get(today);
  const keyAgo = (i: number) => localDayKey(now - i * DAY_MS);
  const prior = Array.from({ length: BASELINE_DAYS }, (_, i) => days.get(keyAgo(i + 1)));
  const enough = (vals: (number | undefined)[]) => (vals.filter((v) => v !== undefined).length >= MIN_BASELINE ? mean(vals) : undefined);
  const baseline = { hrvMs: enough(prior.map((d) => d?.hrvMs)), restingBpm: enough(prior.map((d) => d?.restingBpm)) };
  const weekKeys = Array.from({ length: Math.round((dayStart - weekStart) / DAY_MS) + 1 }, (_, i) => localDayKey(weekStart + i * DAY_MS + 12 * 3600_000));
  const azmDays = weekKeys.map((k) => days.get(k)?.azm).filter((v): v is number => v !== undefined);
  const hasWearable = [...days.values()].some((d) => d.azm !== undefined || d.sleep || d.restingBpm);
  const hours = commitsByHour(userId, now);
  const peak = peakWindow(hours, cfg.dayEndHour);
  const commitsWeek = countGithub(userId, "commit", weekStart, now + 1);
  const prsWeek = countGithub(userId, "pr", weekStart, now + 1);
  const typicalStart = weekStart - TYPICAL_WEEKS * 7 * DAY_MS;
  const typicalCommits = (countGithub(userId, "commit", typicalStart, weekStart) + 3 * countGithub(userId, "pr", typicalStart, weekStart)) / TYPICAL_WEEKS;
  const night = getLastNight(userId);

  const assessment = assess(
    {
      now,
      work: {
        issues: promisedIssues(userId, weekStart),
        commitsWeek,
        prsWeek,
        typicalCommitsWeek: typicalCommits > 0 ? typicalCommits : null,
        meetingsWeek: calendarEvents(userId, weekStart, weekStart + 7 * DAY_MS).filter((m) => !isPulsoEventId(m.id)),
      },
      health: {
        today: day ?? null,
        baseline,
        sleepWeek: Array.from({ length: 7 }, (_, i) => {
          const s = days.get(keyAgo(i))?.sleep;
          return s ? s.asleepMin : null;
        }),
        azmWeek: hasWearable ? azmDays.reduce((a, b) => a + b, 0) : null,
        wakeHHMM: night?.end ?? null,
        meals: getMealsToday(userId).map((m) => ({ time: m.time, kcal: m.kcal })),
        moods: moodsToday(userId, now),
      },
    },
    cfg,
  );
  const candidates = candidatesFor(assessment, { now, busy: meetings, peakFromHour: peak?.from ?? null, wakeHHMM: night?.end ?? null }, cfg);

  return {
    now,
    today,
    meetings,
    upcoming: meetings.filter((m) => m.start > now && !isPulsoEventId(m.id)),
    sleepMin: day?.sleep ? Math.round(day.sleep.asleepMin) : null,
    restingBpm: day?.restingBpm ?? null,
    typicalBpm: baseline.restingBpm === undefined ? null : Math.round(baseline.restingBpm),
    peak,
    hours,
    nudge: getNudge(userId, new Date(now)),
    assessment,
    candidates,
  };
}

const overlaps = (start: number, end: number, meetings: Meeting[], exceptId?: string) =>
  meetings.some((m) => m.id !== exceptId && start < m.end && end > m.start);

/** Candidata → acción. El horario y el destino los fija el código; la IA solo pone el porqué. */
function fromCandidate(c: Candidate, reason: string, tag?: AgentAction["tag"]): AgentAction {
  return {
    id: crypto.randomUUID(),
    type: c.type,
    ...(c.to && { to: c.to }),
    ...(c.minutes && { minutes: c.minutes }),
    ...(c.target && { target: c.target }),
    ...(c.url && { url: c.url }),
    reason,
    isSimulated: c.type === "log_prompt" ? false : !isCalendarWriteOk(),
    ...(tag && { tag }),
  };
}

/** El server decide qué pasa: lo que no cumple se descarta. La IA nunca inventa un evento ni un horario imposible. */
function validate(raw: unknown, inp: Inputs): AgentAction[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentAction[] = [];
  const usedEvents = new Set<string>();
  const dayEnd = atLocalMinute(inp.today, agentConfig().dayEndHour * 60);
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
      if (to === m.start || to <= inp.now || localDayKey(to) !== inp.today || end > dayEnd) continue;
      if (overlaps(to, end, inp.meetings, m.id)) continue;
      usedEvents.add(m.id);
      // `from` sale de la fila del usuario, no de la IA.
      out.push({ ...base, type: "move_meeting", eventId: m.id, from: new Date(m.start).toISOString(), to: new Date(to).toISOString(), isSimulated: !isCalendarWriteOk() });
    } else if (a.type === "block_focus" && typeof a.to === "string") {
      if (out.some((x) => x.type === "block_focus")) continue;
      const to = Date.parse(a.to);
      const minutes = Math.round(Number(a.minutes));
      if (!Number.isFinite(to) || !(minutes >= 15 && minutes <= 180)) continue;
      const end = to + minutes * MIN;
      if (to <= inp.now || localDayKey(to) !== inp.today || end > dayEnd || overlaps(to, end, inp.meetings)) continue;
      out.push({ ...base, type: "block_focus", to: new Date(to).toISOString(), minutes, isSimulated: !isCalendarWriteOk() });
    } else if (a.type === "send_nudge") {
      if (!inp.nudge || out.some((x) => x.type === "send_nudge")) continue;
      out.push({ ...base, type: "send_nudge", isSimulated: false });
    } else if (a.type) {
      // bedtime / block_training / block_rest / log_prompt / block_focus sin horario: solo si su disparador está activo
      const c = inp.candidates.find((x) => x.type === a.type);
      if (!c || out.some((x) => x.type === c.type)) continue;
      out.push(fromCandidate(c, reason));
    }
  }
  return out;
}

const SYSTEM = `Sos el agente de build101: mirás el cuerpo (sueño, pulso, HRV, entrenamiento, comida, ánimo) y el trabajo (avance de la semana contra lo prometido, commits por hora, reuniones) de una persona y proponés acciones concretas para su día.
Te paso una EVALUACIÓN ya calculada ("cómo venís", con flags) y una lista de CANDIDATAS que el código armó con sus disparadores y horarios.
Devolvés SOLO un objeto JSON {"actions":[...]} con COMO MÁXIMO ${MAX_ACTIONS} acciones. Cada acción es uno de:
- {"type":"move_meeting","eventId":"<id de la lista>","to":"<ISO 8601 con offset -03:00, hoy>","reason":"..."}
- {"type":"block_focus","to":"<ISO 8601 con offset -03:00, hoy>","minutes":<15-180>,"reason":"..."}  (o sin "to" para usar la candidata)
- {"type":"block_training","reason":"..."}  (solo si es candidata: bloque para entrenar)
- {"type":"block_rest","reason":"..."}  (solo si es candidata: un descanso corto)
- {"type":"bedtime","reason":"..."}  (solo si es candidata: evento "A dormir HH:MM" con aviso)
- {"type":"log_prompt","reason":"..."}  (solo si es candidata: push para registrar ánimo o comidas)
- {"type":"send_nudge","reason":"..."}  (solo si hay un nudge disponible)
Reglas:
- Elegí primero lo que más pesa en la evaluación (atraso grande, poco sueño o estrés). Si dos cosas chocan, preferí la salud.
- Para las candidatas no cambies el horario: lo fija el código. Solo podés mover reuniones de la lista, por su "id" exacto. Nunca inventes un evento.
- "to" tiene que ser hoy, en el futuro, antes de las 20:00, y no puede pisar otra reunión.
- "reason": UNA oración en español rioplatense que cite un dato de la evaluación ("vas 30% atrasado y tu pico de commits es 15–17", "dormiste 5h10 con el pulso 4 lpm arriba"). Correlación, no causa. Nunca diagnóstico médico. Sin emojis.
- Si nada amerita una acción, devolvé {"actions":[]}.`;

const ACTIONS_SCHEMA = { type: "object", required: ["actions"], properties: { actions: { type: "array" } } };

function assessmentLines(a: Assessment): string[] {
  const h = a.health;
  return [
    `Trabajo (semana): avance esperado ${a.work.expected}%, real ${a.work.actual ?? "sin dato"}%${a.work.gap === null ? "" : ` (gap ${a.work.gap > 0 ? "+" : ""}${a.work.gap})`}; base: ${a.work.basis}.`,
    `Pendiente: ${a.work.pendientes.length ? a.work.pendientes.join("; ") : "nada registrado"}.`,
    `Salud: puntaje build101 ${h.score ?? "sin dato"}; estrés ${h.stress.level} (${h.stress.text}); sueño ${h.sleep.level} (${h.sleep.text}); entrenamiento ${h.training.level} (${h.training.text}); comida ${h.food.level} (${h.food.text}); ánimo ${h.mood.level} (${h.mood.text}).`,
    `Flags: ${a.flags.length ? a.flags.map((f) => `${f.id}: ${f.text}`).join("; ") : "ninguno"}.`,
  ];
}

function buildPrompt(inp: Inputs): string {
  return [
    `Ahora: ${localIso(inp.now)} (${TZ}).`,
    ...assessmentLines(inp.assessment),
    `Candidatas (horario fijo): ${JSON.stringify(inp.candidates.map((c) => ({ type: c.type, ...(c.to && { at: localIso(Date.parse(c.to)) }), ...(c.minutes && { minutes: c.minutes }), ...(c.target && { target: c.target }), why: c.why })))}.`,
    `Sueño de anoche: ${inp.sleepMin === null ? "sin dato" : formatDuration(inp.sleepMin)}. Pulso en reposo hoy: ${inp.restingBpm ?? "sin dato"} bpm; típico (${BASELINE_DAYS} días): ${inp.typicalBpm ?? "sin dato"} bpm.`,
    `Pico de commits (ventana de 2 h, últimos ${BASELINE_DAYS} días): ${inp.peak ? `${inp.peak.from}–${inp.peak.to} h` : "sin commits"}. Commits por hora local (0-23): ${JSON.stringify(inp.hours)}.`,
    `Reuniones de hoy que todavía no empezaron (movibles): ${JSON.stringify(inp.upcoming.map((m) => ({ id: m.id, from: localIso(m.start), durationMin: m.durationMin })))}.`,
    `Todo lo ocupado hoy (no pisarlo): ${JSON.stringify(inp.meetings.map((m) => ({ from: localIso(m.start), to: localIso(m.end) })))}.`,
    `Nudge disponible: ${inp.nudge ? `"${inp.nudge.body}"` : "no"}.`,
  ].join("\n");
}

/**
 * Sin IA: las candidatas de los flags (texto fijo) + el nudge, rotulado [ejemplo]. Mover reuniones queda reservado a la IA:
 * una regla fija que reprograma tu agenda haría que la función principal no dependa de la IA (consigna).
 */
function deterministic(inp: Inputs): AgentAction[] {
  const out = inp.candidates.map((c) => fromCandidate(c, fallbackReason(c), "ejemplo"));
  if (inp.nudge) out.push({ id: crypto.randomUUID(), type: "send_nudge", reason: inp.nudge.body, isSimulated: false, tag: "ejemplo" });
  return out.slice(0, MAX_ACTIONS);
}

type StoredProposal = Proposal & { ts: string };

function recentProposals(userId: string, sinceIso: string): StoredProposal[] {
  return db
    .select({ ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "agent"), eq(rawEvents.kind, "proposal"), gte(rawEvents.ts, sinceIso)))
    .orderBy(desc(rawEvents.ts))
    .all()
    .map((r) => ({ ...(JSON.parse(r.json) as Proposal), ts: r.ts }));
}

/** Última propuesta de la IA de hoy cuyas acciones siguen siendo válidas: el [cache] del dry-run sin wifi. */
function cachedProposal(userId: string, inp: Inputs): AgentAction[] | null {
  for (const p of recentProposals(userId, new Date(startOfLocalDay(inp.now)).toISOString())) {
    if (p.origin === "ejemplo") continue;
    const actions = p.actions.filter((a) => (!a.to || Date.parse(a.to) > inp.now) && (a.type !== "move_meeting" || inp.upcoming.some((m) => m.id === a.eventId)));
    return actions.map((a) => ({ ...a, id: crypto.randomUUID(), tag: "cache" as const, isSimulated: CALENDAR_TYPES.has(a.type) ? !isCalendarWriteOk() : a.isSimulated }));
  }
  return null;
}

/** Propone hasta 3 acciones con la evaluación. La IA elige; si falla, la última de la IA de hoy ([cache]) o las reglas ([ejemplo]). */
export async function proposeActions(userId: string, now = Date.now()): Promise<Proposal> {
  const inp = gatherInputs(userId, now);
  const { assessment } = inp;
  try {
    // Objeto y no array: json_object no admite arrays (ai-service lo rechaza y cae a Groq).
    const raw = await generateJson<unknown>({ contents: buildPrompt(inp), config: { systemInstruction: SYSTEM, responseJsonSchema: ACTIONS_SCHEMA } });
    const list = Array.isArray(raw) ? raw : (raw as { actions?: unknown } | null)?.actions;
    return { actions: validate(list, inp), origin: "ia", assessment };
  } catch (error) {
    console.error("[agent] la IA no propuso, cae a cache/ejemplo", error);
  }
  const cached = cachedProposal(userId, inp);
  if (cached) return { actions: cached, origin: "cache", assessment };
  return { actions: deterministic(inp), origin: "ejemplo", assessment };
}

/** Guarda la propuesta en raw_events con su vencimiento: es lo que `run` relee por `id` (nunca confía en el payload del cliente). */
export function saveProposal(userId: string, proposal: Proposal, now = Date.now()): Proposal {
  const saved = { ...proposal, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + agentConfig().ttlMs).toISOString() };
  insertRawEvents([{ source: "agent", kind: "proposal", userId, ts: saved.createdAt, data: saved }]);
  return saved;
}

/** Última propuesta no vencida, con las acciones ya ejecutadas marcadas. null si no hay ninguna vigente. */
export function pendingProposal(userId: string, now = Date.now()): Proposal | null {
  const [latest] = recentProposals(userId, new Date(now - agentConfig().ttlMs - DAY_MS).toISOString());
  if (!latest || isExpired(latest, now, latest.ts)) return null;
  const done = doneRuns(db, latest.actions.map((a) => a.id));
  const { ts, ...p } = latest;
  return { ...p, createdAt: p.createdAt ?? ts, actions: p.actions.map((a) => (done.has(a.id) ? { ...a, done: done.get(a.id) } : a)) };
}

/** Link para hacerlo a mano en Google Calendar, en el día de la acción. */
export function calendarDayUrl(iso?: string): string {
  const key = localDayKey(iso ? Date.parse(iso) : Date.now()).replaceAll("-", "/");
  return `https://calendar.google.com/calendar/r/day/${key}`;
}

const span = (a: AgentAction) =>
  a.type === "move_meeting"
    ? `de ${hhmm.format(new Date(a.from!))} a ${hhmm.format(new Date(a.to!))}`
    : a.type === "bedtime"
      ? `a las ${hhmm.format(new Date(a.to!))}`
      : `de ${hhmm.format(new Date(a.to!))} a ${hhmm.format(new Date(Date.parse(a.to!) + (a.minutes ?? 0) * MIN))}`;

type GoogleTime = { dateTime?: string; date?: string; timeZone?: string };
const CAL_EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** Qué evento crea cada tipo y con qué clave de idempotencia. */
function eventSpec(userId: string, a: AgentAction) {
  const start = Date.parse(a.to!);
  const day = localDayKey(start);
  const at = hhmmOf(start);
  const cfg = agentConfig();
  switch (a.type) {
    case "bedtime":
      return { id: calendarEventId(userId, "bedtime", day), summary: `A dormir ${at}`, minutes: 15, transparency: "transparent", reminder: cfg.bedtimeReminderMin };
    case "block_training":
      return { id: calendarEventId(userId, "training", day), summary: "Entrenar", minutes: a.minutes ?? cfg.trainingMin, transparency: "opaque", reminder: 10 };
    case "block_rest":
      return { id: calendarEventId(userId, "rest", a.to!), summary: "Descanso", minutes: a.minutes ?? cfg.restMin, transparency: "opaque", reminder: 5 };
    default:
      return { id: calendarEventId(userId, "focus", `${a.to}|${a.minutes}`), summary: "Foco", minutes: a.minutes ?? cfg.focusMin, transparency: "opaque", reminder: 5 };
  }
}

/** events.insert con id determinístico: si ya existe (409), es que ya se creó: no se duplica. */
async function insertCalendarEvent(userId: string, a: AgentAction): Promise<{ result: RunResult; eventId?: string }> {
  const conn = getConnection(userId, "calendar");
  if (!conn) return { result: { status: "error", message: "Calendar no está conectado" } };
  const spec = eventSpec(userId, a);
  const start = Date.parse(a.to!);
  const body = {
    id: spec.id,
    summary: spec.summary,
    description: `Creado por el agente de Pulso. ${a.reason}`,
    start: { dateTime: localIso(start), timeZone: TZ },
    end: { dateTime: localIso(start + spec.minutes * MIN), timeZone: TZ },
    transparency: spec.transparency,
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: spec.reminder }] },
    extendedProperties: { private: { pulso: a.type } },
  };
  try {
    const token = await freshToken(conn);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const res = await fetch(CAL_EVENTS, { method: "POST", headers, body: JSON.stringify(body) });
    let link: string | undefined;
    let message = `${spec.summary} ${span(a)} agendado`;
    if (res.status === 409) {
      const got = await fetch(`${CAL_EVENTS}/${spec.id}`, { headers, cache: "no-store" });
      const ev = got.ok ? ((await got.json()) as { htmlLink?: string; status?: string }) : null;
      link = ev?.htmlLink;
      message = ev?.status === "cancelled" ? `${spec.summary} ya se había creado y lo borraste: no lo vuelvo a crear` : `${spec.summary} ${span(a)} ya estaba en tu Calendar`;
    } else if (!res.ok) {
      throw new Error(`calendar insert ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } else {
      link = ((await res.json()) as { htmlLink?: string }).htmlLink;
    }
    await syncCalendarUser(userId).catch((error) => console.error("[agent] re-sync calendar", error));
    return { result: { status: "done", message, url: link ?? calendarDayUrl(a.to) }, eventId: spec.id };
  } catch (error) {
    console.error(`[agent] ${a.type} falló`, error);
    return { result: { status: "error", message: "Google Calendar no respondió: no se creó nada" } };
  }
}

async function moveMeeting(userId: string, action: AgentAction): Promise<{ result: RunResult; eventId?: string }> {
  const conn = getConnection(userId, "calendar");
  if (!conn) return { result: { status: "error", message: "Calendar no está conectado" } };
  const eventUrl = `${CAL_EVENTS}/${encodeURIComponent(action.eventId!)}`;
  try {
    const token = await freshToken(conn);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const getRes = await fetch(eventUrl, { headers, cache: "no-store" });
    if (!getRes.ok) throw new Error(`calendar get ${getRes.status}: ${(await getRes.text()).slice(0, 200)}`);
    const ev = (await getRes.json()) as { start?: GoogleTime; end?: GoogleTime; htmlLink?: string };
    const start = Date.parse(ev.start?.dateTime ?? "");
    const end = Date.parse(ev.end?.dateTime ?? "");
    if (!Number.isFinite(start) || !Number.isFinite(end)) return { result: { status: "error", message: "la reunión no tiene horario (¿es de todo el día?)" } };
    const to = Date.parse(action.to!);
    // Idempotente: confirmar dos veces no la mueve dos veces.
    if (start !== to) {
      if (start !== Date.parse(action.from!)) return { result: { status: "error", message: "la reunión cambió desde la propuesta: recargá" } };
      // start y end se mueven el mismo delta.
      const delta = to - start;
      const body = {
        start: { dateTime: new Date(start + delta).toISOString(), ...(ev.start?.timeZone && { timeZone: ev.start.timeZone }) },
        end: { dateTime: new Date(end + delta).toISOString(), ...(ev.end?.timeZone && { timeZone: ev.end.timeZone }) },
      };
      const patchRes = await fetch(eventUrl, { method: "PATCH", headers, body: JSON.stringify(body) });
      if (!patchRes.ok) throw new Error(`calendar patch ${patchRes.status}: ${(await patchRes.text()).slice(0, 200)}`);
    }
    // raw_events deduplica por (userId, source, kind, ts): sin esto la fila vieja queda y Trabajo muestra 2 reuniones.
    db.delete(rawEvents)
      .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "calendar"), sql`json_extract(${rawEvents.json}, '$.id') = ${action.eventId}`))
      .run();
    await syncCalendarUser(userId);
    return { result: { status: "done", message: `movida ${span(action)}`, url: ev.htmlLink ?? calendarDayUrl(action.to) }, eventId: action.eventId };
  } catch (error) {
    console.error("[agent] move_meeting falló", error);
    return { result: { status: "error", message: "Google Calendar no respondió: no se movió nada" } };
  }
}

const LOG_PROMPT: Record<NonNullable<AgentAction["target"]>, string> = {
  mood: "¿Cómo venís? Registrá tu ánimo con un toque.",
  meals: "No registraste comidas hoy: sacale una foto a la próxima.",
  both: "Hoy no registraste ánimo ni comidas: un toque y listo.",
};

async function execute(userId: string, action: AgentAction): Promise<{ result: RunResult; eventId?: string }> {
  if (action.type === "send_nudge") {
    const nudge = getNudge(userId);
    if (!nudge) return { result: { status: "error", message: "sin datos para un nudge" } };
    try {
      const { sent } = await sendPush(userId, { title: nudge.title, body: nudge.body, url: "/" });
      return { result: { status: "done", message: sent ? `push enviado a ${sent} dispositivo${sent > 1 ? "s" : ""}` : `sin dispositivos suscritos · ${nudge.body}` } };
    } catch (error) {
      console.error("[agent] push falló", error);
      return { result: { status: "error", message: `push no disponible · ${nudge.body}` } };
    }
  }
  if (action.type === "log_prompt") {
    const body = LOG_PROMPT[action.target ?? "both"];
    try {
      const { sent } = await sendPush(userId, { title: "Pulso", body, url: action.url ?? "/" });
      if (!sent) return { result: { status: "error", message: "sin dispositivos suscritos: activá las notificaciones en Ajustes" } };
      return { result: { status: "done", message: `recordatorio enviado a ${sent} dispositivo${sent > 1 ? "s" : ""}` } };
    } catch (error) {
      console.error("[agent] push falló", error);
      return { result: { status: "error", message: "push no disponible" } };
    }
  }

  // Todo lo de Calendar depende del permiso de escritura: sin él nunca se presenta como ejecutado.
  if (action.isSimulated || !isCalendarWriteOk()) {
    return { result: { status: "simulated", message: `${span(action)} · hacelo a mano en Google Calendar`, url: calendarDayUrl(action.to) } };
  }
  if (action.to && Date.parse(action.to) <= Date.now()) return { result: { status: "error", message: "ese horario ya pasó: recargá" } };
  return action.type === "move_meeting" ? moveMeeting(userId, action) : insertCalendarEvent(userId, action);
}

/**
 * Ejecuta UNA acción de una propuesta vigente, por `id`. Solo se llama desde POST /api/agent/run.
 * Rechaza las propuestas vencidas y las acciones ya ejecutadas; la ejecutada queda marcada en agent_runs.
 */
export async function runAction(userId: string, actionId: string): Promise<RunResult> {
  const now = Date.now();
  const proposal = recentProposals(userId, new Date(now - agentConfig().ttlMs - DAY_MS).toISOString()).find((p) => p.actions.some((a) => a.id === actionId));
  const action = proposal?.actions.find((a) => a.id === actionId);
  if (!proposal || !action) return { status: "error", message: "esa propuesta ya no está vigente: recargá" };
  if (isExpired(proposal, now, proposal.ts)) return { status: "error", message: "esa propuesta venció: recargá para una nueva" };

  const claim = claimRun(db, userId, actionId, action.type, now);
  if (!claim.ok) {
    return claim.reason === "done"
      ? { status: "error", message: `ya se ejecutó${claim.message ? ` · ${claim.message}` : ""}` }
      : { status: "error", message: "ya se está ejecutando" };
  }
  try {
    const { result, eventId } = await execute(userId, action);
    if (result.status === "done") finishRun(db, actionId, { message: result.message, url: result.url, eventId });
    else releaseRun(db, actionId); // error o simulada: no quedó hecha, se puede volver a confirmar
    return result;
  } catch (error) {
    releaseRun(db, actionId);
    throw error;
  }
}
