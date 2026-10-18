// Reglas puras del agente: evaluación (trabajo × salud), flags → acciones candidatas, horario silencioso, vencimiento
// e ids determinísticos de Calendar. Sin server-only ni alias "@/": lo importa también scripts/test-agent-rules.mts.
import { createHash } from "node:crypto";
import { scoreDay, type DayInput } from "./score.ts";
import { PRIORITY_LABEL, pickLowerPriority, teamKeyOf, type WorkGate } from "./agent-work.ts";

// Montevideo no tiene horario de verano desde 2015: el offset es fijo (-03:00).
export const TZ = "America/Montevideo";
export const OFFSET = "-03:00";
const OFFSET_MS = -3 * 3600_000;
export const MIN = 60_000;
export const HOUR = 3600_000;
export const DAY_MS = 86400_000;

/** Número de env con default (horas, minutos, metas). Inválido o vacío → default. */
export function envNum(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return process.env[name] !== undefined && process.env[name] !== "" && Number.isFinite(v) ? v : fallback;
}

/** Parámetros que salen de env (todos con default razonable). Se leen en cada llamada: los tests los pisan. */
export function agentConfig() {
  return {
    ttlMs: envNum("AGENT_PROPOSAL_TTL_H", 6) * HOUR,
    quietStart: envNum("AGENT_QUIET_START", 22),
    quietEnd: envNum("AGENT_QUIET_END", 8),
    sleepGoalMin: envNum("AGENT_SLEEP_GOAL_H", 7.5) * 60,
    shortSleepMin: envNum("AGENT_SHORT_SLEEP_H", 6) * 60,
    azmWeekGoal: envNum("AGENT_AZM_WEEK_GOAL", 150),
    workStart: envNum("AGENT_WORK_START", 9),
    workEnd: envNum("AGENT_WORK_END", 18),
    workDays: envNum("AGENT_WORK_DAYS", 5), // lunes a viernes
    behindPct: envNum("AGENT_BEHIND_PCT", 10), // gap en puntos para decir "atrasado"
    logPromptHour: envNum("AGENT_LOG_PROMPT_HOUR", 14),
    trainingHour: envNum("AGENT_TRAINING_HOUR", 18),
    trainingMin: envNum("AGENT_TRAINING_MIN", 45),
    focusMin: envNum("AGENT_FOCUS_MIN", 90),
    restMin: envNum("AGENT_REST_MIN", 20),
    bedtimeReminderMin: envNum("AGENT_BEDTIME_REMINDER_MIN", 30),
    dayEndHour: envNum("AGENT_DAY_END_HOUR", 20), // nada se mueve ni se bloquea después (salvo "a dormir")
    slackBusyMsgs: envNum("AGENT_SLACK_BUSY_MSGS", 25), // mensajes de Slack hoy para decir "mucho Slack"
  };
}
export type AgentConfig = ReturnType<typeof agentConfig>;

// ── tiempo local ────────────────────────────────────────────────────────────
const local = (ms: number) => new Date(ms + OFFSET_MS); // leer con getUTC*
export const localHour = (ms: number) => local(ms).getUTCHours();
export const localMinuteOfDay = (ms: number) => local(ms).getUTCHours() * 60 + local(ms).getUTCMinutes();
export const localDayKey = (ms: number) => local(ms).toISOString().slice(0, 10);
/** 0 = lunes … 6 = domingo. */
export const localWeekday = (ms: number) => (local(ms).getUTCDay() + 6) % 7;
/** Instante de `key` (YYYY-MM-DD local) a los `minutes` minutos del día. */
export const atLocalMinute = (key: string, minutes: number) => Date.parse(`${key}T00:00:00${OFFSET}`) + minutes * MIN;
export const startOfLocalDay = (ms: number) => atLocalMinute(localDayKey(ms), 0);
export const startOfLocalWeek = (ms: number) => startOfLocalDay(ms) - localWeekday(ms) * DAY_MS;
export const hhmmOf = (ms: number) => {
  const m = localMinuteOfDay(ms);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Horario silencioso (default 22 → 8, hora de Uruguay). Soporta ventanas que cruzan la medianoche. */
export function isQuietHour(ms: number, cfg = agentConfig()): boolean {
  const h = localHour(ms);
  return cfg.quietStart > cfg.quietEnd ? h >= cfg.quietStart || h < cfg.quietEnd : h >= cfg.quietStart && h < cfg.quietEnd;
}

/** Vence a `createdAt + TTL` (o al `expiresAt` guardado). Las propuestas viejas sin `expiresAt` usan el TTL actual. */
export function isExpired(p: { createdAt?: string; expiresAt?: string }, now: number, fallbackTs?: string, cfg = agentConfig()): boolean {
  const exp = p.expiresAt ? Date.parse(p.expiresAt) : Date.parse(p.createdAt ?? fallbackTs ?? "") + cfg.ttlMs;
  return !Number.isFinite(exp) || now >= exp;
}

/**
 * Id de evento de Calendar determinístico (base32hex: 0-9 a-v, 5–1024 chars). Mismo usuario + misma cosa → mismo id:
 * confirmar dos veces (o dos propuestas iguales) choca con 409 en vez de duplicar el evento.
 */
export function calendarEventId(userId: string, kind: string, key: string): string {
  return `pulso${createHash("sha256").update(`${userId}|${kind}|${key}`).digest("hex").slice(0, 40)}`;
}
export { isPulsoEvent, isPulsoEventId } from "./pulso-events.ts";

// ── evaluación ──────────────────────────────────────────────────────────────
export type PromisedIssue = { id: string; title: string; done: boolean; weight: number; priority?: number | null };
export type Slot = { start: number; end: number };

export type AssessInput = {
  now: number;
  work: {
    issues: PromisedIssue[]; // Linear: asignados/creados vivos en la semana (abiertos, o cerrados esta semana)
    commitsWeek: number;
    prsWeek: number;
    typicalCommitsWeek: number | null; // media de las semanas anteriores completas
    meetingsWeek: Slot[]; // reuniones de la semana (sin los bloques que crea Pulso)
  };
  health: {
    today: DayInput | null; // sueño de anoche, HRV, pulso y azm de hoy (dayInputs)
    baseline: { hrvMs?: number; restingBpm?: number };
    sleepWeek: (number | null)[]; // minutos dormidos de los últimos 7 días (hoy incluido), null = sin dato
    azmWeek: number | null; // minutos en zona activa desde el lunes; null = sin wearable
    wakeHHMM: string | null; // fin de la última noche, "07:12"
    meals: { time: string; kcal: [number, number] }[];
    moods: number[]; // check-ins de hoy (1–5), en orden
  };
};

export type FlagId = "work_behind" | "work_ahead" | "stressed" | "sleep_short" | "sleep_debt" | "no_training" | "food_missing" | "food_skipped" | "mood_missing" | "mood_low";
export type Flag = { id: FlagId; text: string };
type Level = "bien" | "regular" | "mal" | "sin dato";

export type Assessment = {
  at: string;
  work: { expected: number; actual: number | null; gap: number | null; pendientes: string[]; basis: string; meetingsLeftMin: number };
  health: {
    stress: { level: Level; text: string };
    sleep: { level: Level; lastMin: number | null; debtMin: number; text: string };
    training: { level: Level; todayMin: number | null; weekMin: number | null; goal: number; text: string };
    food: { level: Level; meals: number; text: string };
    mood: { level: Level; last: number | null; text: string };
    score: number | null; // puntaje build101 de hoy (lib/score.ts)
  };
  flags: Flag[];
};

const pct = (x: number) => Math.round(x * 100);
const fmtMin = (m: number) => `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}`;

/** Fracción de la semana laboral que ya pasó (lunes–viernes, AGENT_WORK_START → AGENT_WORK_END). */
export function workWeekElapsed(now: number, cfg = agentConfig()): number {
  const perDay = (cfg.workEnd - cfg.workStart) * 60;
  if (perDay <= 0 || cfg.workDays <= 0) return 0;
  const wd = localWeekday(now);
  if (wd >= cfg.workDays) return 1;
  const today = Math.max(0, Math.min(perDay, localMinuteOfDay(now) - cfg.workStart * 60));
  return (wd * perDay + today) / (cfg.workDays * perDay);
}

function assessWork(w: AssessInput["work"], now: number, cfg: AgentConfig): Assessment["work"] {
  const expected = workWeekElapsed(now, cfg);
  const total = w.issues.reduce((s, i) => s + i.weight, 0);
  const issueRatio = total > 0 ? w.issues.filter((i) => i.done).reduce((s, i) => s + i.weight, 0) / total : null;
  // commits+PRs contra tu semana típica (un PR vale como 3 commits); tope 1: hacer de más no tapa issues abiertos
  const commitRatio = w.typicalCommitsWeek && w.typicalCommitsWeek > 0 ? Math.min(1, (w.commitsWeek + 3 * w.prsWeek) / w.typicalCommitsWeek) : null;
  const parts = [issueRatio, commitRatio].filter((x): x is number => x !== null);
  const actual = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
  const basis = [issueRatio !== null && `issues ${w.issues.filter((i) => i.done).length}/${w.issues.length}`, commitRatio !== null && `commits ${w.commitsWeek} y PRs ${w.prsWeek} vs ~${Math.round(w.typicalCommitsWeek!)} por semana`]
    .filter(Boolean)
    .join(" · ") || "sin Linear ni historial de commits";
  const meetingsLeftMin = Math.round(w.meetingsWeek.filter((m) => m.start > now).reduce((s, m) => s + (m.end - m.start) / MIN, 0));
  const pendientes = w.issues.filter((i) => !i.done).map((i) => `${i.id} ${i.title}`.trim()).slice(0, 5);
  if (meetingsLeftMin > 0) pendientes.push(`${fmtMin(meetingsLeftMin)} de reuniones que quedan en la semana`);
  return { expected: pct(expected), actual: actual === null ? null : pct(actual), gap: actual === null ? null : pct(actual) - pct(expected), pendientes, basis, meetingsLeftMin };
}

function assessHealth(h: AssessInput["health"], now: number, cfg: AgentConfig): Assessment["health"] {
  const t = h.today ?? {};
  // estrés: HRV baja o pulso en reposo alto contra TU línea base (mismos umbrales que el puntaje: -15 % HRV, +3 lpm)
  const hrvLow = t.hrvMs && h.baseline.hrvMs ? t.hrvMs / h.baseline.hrvMs <= 0.85 : false;
  const rhrHigh = t.restingBpm && h.baseline.restingBpm ? t.restingBpm - h.baseline.restingBpm >= 3 : false;
  const hasHeart = Boolean((t.hrvMs && h.baseline.hrvMs) || (t.restingBpm && h.baseline.restingBpm));
  const stressBits = [
    rhrHigh && `pulso en reposo ${t.restingBpm} lpm (típico ${Math.round(h.baseline.restingBpm!)})`,
    hrvLow && `HRV ${Math.round(t.hrvMs!)} ms (típica ${Math.round(h.baseline.hrvMs!)})`,
  ].filter(Boolean);
  const stress = !hasHeart
    ? { level: "sin dato" as Level, text: "sin pulso/HRV o sin línea base" }
    : stressBits.length
      ? { level: (stressBits.length === 2 ? "mal" : "regular") as Level, text: stressBits.join(" y ") }
      : { level: "bien" as Level, text: "pulso y HRV en tu rango" };

  const lastMin = t.sleep ? Math.round(t.sleep.asleepMin) : null;
  const debtMin = Math.round(h.sleepWeek.reduce<number>((s, m) => s + (m === null ? 0 : Math.max(0, cfg.sleepGoalMin - m)), 0));
  const sleepLevel: Level = lastMin === null ? "sin dato" : lastMin < cfg.shortSleepMin ? "mal" : lastMin < cfg.sleepGoalMin || debtMin >= 5 * 60 ? "regular" : "bien";
  const sleep = {
    level: sleepLevel,
    lastMin,
    debtMin,
    text: lastMin === null ? "sin dato de anoche" : `dormiste ${fmtMin(lastMin)} (meta ${fmtMin(cfg.sleepGoalMin)}), deuda de la semana ${fmtMin(debtMin)}`,
  };

  // entrenamiento: azm de la semana contra la meta prorrateada por los días que pasaron
  const daysIn = localWeekday(now) + localMinuteOfDay(now) / 1440;
  const expectedAzm = (cfg.azmWeekGoal * daysIn) / 7;
  const todayMin = t.azm ?? null;
  const trainingLevel: Level = h.azmWeek === null ? "sin dato" : h.azmWeek >= expectedAzm ? "bien" : h.azmWeek >= expectedAzm / 2 ? "regular" : "mal";
  const training = {
    level: trainingLevel,
    todayMin,
    weekMin: h.azmWeek,
    goal: cfg.azmWeekGoal,
    text: h.azmWeek === null ? "sin wearable" : `${h.azmWeek} min en zona activa esta semana (meta ${cfg.azmWeekGoal}, a esta altura ~${Math.round(expectedAzm)}), hoy ${todayMin ?? 0}`,
  };

  const hour = localHour(now);
  const kcalMid = h.meals.reduce((s, m) => s + (m.kcal[0] + m.kcal[1]) / 2, 0);
  const food =
    h.meals.length === 0
      ? { level: (hour >= cfg.logPromptHour ? "mal" : "sin dato") as Level, meals: 0, text: hour >= cfg.logPromptHour ? "no registraste comidas hoy" : "todavía sin comidas registradas" }
      : h.meals.length === 1 && hour >= cfg.logPromptHour + 4
        ? { level: "regular" as Level, meals: 1, text: `una sola comida registrada (${h.meals[0].time}): ¿salteaste alguna?` }
        : { level: "bien" as Level, meals: h.meals.length, text: `${h.meals.length} comida${h.meals.length > 1 ? "s" : ""}, ~${Math.round(kcalMid)} kcal` };

  const last = h.moods.length ? h.moods[h.moods.length - 1] : null;
  const mood =
    last === null
      ? { level: "sin dato" as Level, last, text: "sin check-in de ánimo hoy" }
      : { level: (last <= 2 ? "mal" : last === 3 ? "regular" : "bien") as Level, last, text: `ánimo ${last}/5${h.moods.length > 1 ? ` (${h.moods.join("→")})` : ""}` };

  const score = h.today ? (scoreDay(h.today, h.baseline)?.score ?? null) : null;
  return { stress, sleep, training, food, mood, score };
}

/** Evaluación del día en dos ejes + flags. Pura: mismos datos → misma evaluación. */
export function assess(input: AssessInput, cfg = agentConfig()): Assessment {
  const { now } = input;
  const work = assessWork(input.work, now, cfg);
  const health = assessHealth(input.health, now, cfg);
  const flags: Flag[] = [];
  const hour = localHour(now);
  if (work.gap !== null && work.gap <= -cfg.behindPct) flags.push({ id: "work_behind", text: `vas ${-work.gap}% atrasado en la semana (esperado ${work.expected}%, real ${work.actual}%)` });
  if (work.gap !== null && work.gap >= cfg.behindPct) flags.push({ id: "work_ahead", text: `vas ${work.gap}% adelantado en la semana` });
  if (health.stress.level === "regular" || health.stress.level === "mal") flags.push({ id: "stressed", text: health.stress.text });
  if (health.sleep.lastMin !== null && health.sleep.lastMin < cfg.shortSleepMin) flags.push({ id: "sleep_short", text: `dormiste ${fmtMin(health.sleep.lastMin)}` });
  if (health.sleep.debtMin >= 5 * 60) flags.push({ id: "sleep_debt", text: `deuda de sueño de ${fmtMin(health.sleep.debtMin)} en la semana` });
  if (health.training.level === "mal" && !health.training.todayMin) flags.push({ id: "no_training", text: health.training.text });
  if (health.food.meals === 0 && hour >= cfg.logPromptHour) flags.push({ id: "food_missing", text: health.food.text });
  if (health.food.level === "regular") flags.push({ id: "food_skipped", text: health.food.text });
  if (health.mood.last === null && hour >= cfg.logPromptHour) flags.push({ id: "mood_missing", text: health.mood.text });
  if (health.mood.level === "mal") flags.push({ id: "mood_low", text: health.mood.text });
  return { at: new Date(now).toISOString(), work, health, flags };
}

/** Línea para el push del cron: "Vas 30% atrasado en la semana y dormiste 5h: te propongo 2 cosas". */
export function pushSummary(a: Assessment, n: number): string {
  const bits: string[] = [];
  const f = (id: FlagId) => a.flags.find((x) => x.id === id);
  if (f("work_behind")) bits.push(`vas ${-a.work.gap!}% atrasado en la semana`);
  else if (f("work_ahead")) bits.push(`vas ${a.work.gap}% adelantado en la semana`);
  if (f("sleep_short")) bits.push(f("sleep_short")!.text);
  else if (f("stressed")) bits.push("tu cuerpo marca estrés");
  else if (f("sleep_debt")) bits.push(f("sleep_debt")!.text);
  if (bits.length < 2 && f("no_training")) bits.push("vas corto de entrenamiento");
  const head = bits.length ? bits.join(" y ") : "Miré tu día";
  const cosa = n === 1 ? "1 cosa" : `${n} cosas`;
  return `${head.charAt(0).toUpperCase()}${head.slice(1)}: te propongo ${cosa}`;
}

// ── flags → acciones candidatas ─────────────────────────────────────────────
export type CandidateType = "block_focus" | "bedtime" | "block_training" | "block_rest" | "log_prompt" | "slack_focus" | "linear_create_issue" | "linear_lower_priority";
export type Candidate = {
  type: CandidateType;
  to?: string;
  minutes?: number;
  target?: "mood" | "meals" | "both";
  url?: string;
  why: string;
  title?: string; // linear_create_issue: título exacto
  team?: string; // linear_create_issue: key del team ("PUL")
  issueId?: string; // linear_lower_priority: "PUL-3"
  issueTitle?: string;
  priorityFrom?: number;
  priorityTo?: number;
  /** La conexión no tiene el scope: se propone simulada con "Reconectar" (nunca se ejecuta así). */
  reconnect?: "slack" | "linear";
};

const overlaps = (start: number, end: number, busy: Slot[]) => busy.some((m) => start < m.end && end > m.start);

/** Primer hueco libre de `minutes` desde `from` (redondeado a 15 min) que termine antes de `until`. */
export function freeSlot(busy: Slot[], from: number, minutes: number, until: number): number | null {
  const q = 15 * MIN;
  for (let s = Math.ceil(from / q) * q; s + minutes * MIN <= until; s += q) {
    if (!overlaps(s, s + minutes * MIN, busy)) return s;
  }
  return null;
}

/** Hora de ir a dormir: despertar − meta de sueño, redondeada a 15 min, entre 21:00 y 23:30. Sin despertar: 23:00. */
export function bedtimeFor(now: number, wakeHHMM: string | null, cfg = agentConfig()): number | null {
  const m = wakeHHMM?.match(/^(\d{1,2}):(\d{2})$/);
  let minutes = m ? Number(m[1]) * 60 + Number(m[2]) - cfg.sleepGoalMin : 23 * 60;
  if (minutes < 0) minutes += 1440;
  minutes = Math.round(minutes / 15) * 15;
  minutes = Math.max(21 * 60, Math.min(23 * 60 + 30, minutes));
  const at = atLocalMinute(localDayKey(now), minutes);
  return at > now + 15 * MIN ? at : null;
}

export type CandidateCtx = {
  now: number;
  busy: Slot[];
  peakFromHour: number | null;
  wakeHHMM: string | null;
  /** Slack: estado de la conexión para slack_focus y mensajes de hoy (slack_hoy). Sin esto no se propone. */
  slack?: { gate: WorkGate; messagesToday: number };
  /** Linear: estado de la conexión para escribir e issues de la semana (con prioridad). Sin esto no se propone. */
  linear?: { gate: WorkGate; issues: PromisedIssue[] };
};

/** Disparadores: atrasado → foco; estrés/poco sueño → descanso (antes de las 18) o "a dormir"; poco azm → entrenar; sin registro → log_prompt. */
export function candidatesFor(a: Assessment, ctx: CandidateCtx, cfg = agentConfig()): Candidate[] {
  const has = (id: FlagId) => a.flags.some((f) => f.id === id);
  const text = (id: FlagId) => a.flags.find((f) => f.id === id)?.text ?? "";
  const { now, busy } = ctx;
  const key = localDayKey(now);
  const dayEnd = atLocalMinute(key, cfg.dayEndHour * 60);
  const out: Candidate[] = [];

  if (has("sleep_short") || has("sleep_debt") || has("stressed")) {
    const at = bedtimeFor(now, ctx.wakeHHMM, cfg);
    const why = [text("sleep_short") || text("sleep_debt"), has("stressed") ? text("stressed") : ""].filter(Boolean).join(" y ");
    if (at) out.push({ type: "bedtime", to: new Date(at).toISOString(), minutes: 15, why });
  }
  if (has("work_behind")) {
    const preferred = ctx.peakFromHour !== null ? Math.max(now, atLocalMinute(key, ctx.peakFromHour * 60)) : now;
    const at = freeSlot(busy, preferred, cfg.focusMin, dayEnd) ?? freeSlot(busy, now, cfg.focusMin, dayEnd);
    if (at) out.push({ type: "block_focus", to: new Date(at).toISOString(), minutes: cfg.focusMin, why: text("work_behind") });
  }
  // Slack: compañera del bloque de foco (estado + no molestar mientras dura). Vas atrasado y con mucho Slack → lo dice.
  const focus = out.find((c) => c.type === "block_focus");
  if (focus && ctx.slack && ctx.slack.gate !== "missing") {
    const busySlack = ctx.slack.messagesToday >= cfg.slackBusyMsgs;
    const why = busySlack ? `${text("work_behind")} y llevás ${ctx.slack.messagesToday} mensajes de Slack hoy` : `${text("work_behind")}: que Slack no corte el bloque de foco`;
    out.push({ type: "slack_focus", to: focus.to, minutes: focus.minutes, why, ...(ctx.slack.gate === "reconnect" && { reconnect: "slack" as const }) });
  }
  // Linear: muy atrasado (el doble del umbral) y con la salud mal → bajarle un escalón a 1 issue no urgente.
  const healthBad = a.health.stress.level === "mal" || a.health.sleep.level === "mal" || (a.health.score !== null && a.health.score < 50);
  const lin = ctx.linear && ctx.linear.gate !== "missing" ? ctx.linear : null;
  if (lin && has("work_behind") && a.work.gap !== null && a.work.gap <= -2 * cfg.behindPct && healthBad) {
    const pick = pickLowerPriority(lin.issues);
    if (pick) {
      const why = `${text("work_behind")} y ${a.health.sleep.level === "mal" ? text("sleep_short") || a.health.sleep.text : a.health.stress.level === "mal" ? a.health.stress.text : `tu puntaje está en ${a.health.score}`}`;
      out.push({ type: "linear_lower_priority", issueId: pick.issue.id, issueTitle: pick.issue.title, priorityFrom: pick.from, priorityTo: pick.to, why, ...(lin.gate === "reconnect" && { reconnect: "linear" as const }) });
    }
  }
  // Linear: atrasado con un issue empezado que sigue abierto → tarea de seguimiento para destrabarlo, en su mismo team.
  if (lin && has("work_behind")) {
    const open = lin.issues.filter((i) => !i.done && teamKeyOf(i.id)).sort((x, y) => x.id.localeCompare(y.id))[0];
    if (open) {
      const title = `Seguimiento: destrabar ${open.id}${open.title ? ` ${open.title}` : ""}`.slice(0, 120);
      out.push({ type: "linear_create_issue", title, team: teamKeyOf(open.id)!, why: `${text("work_behind")} y ${open.id} sigue abierto`, ...(lin.gate === "reconnect" && { reconnect: "linear" as const }) });
    }
  }
  if (has("no_training")) {
    const at = freeSlot(busy, Math.max(now, atLocalMinute(key, cfg.trainingHour * 60)), cfg.trainingMin, atLocalMinute(key, 22 * 60));
    if (at) out.push({ type: "block_training", to: new Date(at).toISOString(), minutes: cfg.trainingMin, why: text("no_training") });
  }
  const moodMissing = has("mood_missing");
  const foodMissing = has("food_missing") || has("food_skipped");
  if (moodMissing || foodMissing) {
    const target = moodMissing && foodMissing ? "both" : moodMissing ? "mood" : "meals";
    // ánimo: el check-in está en Yo (/); comidas: la cámara está en Salud (/salud)
    out.push({ type: "log_prompt", target, url: target === "meals" ? "/salud" : "/", why: [moodMissing && text("mood_missing"), foodMissing && (text("food_missing") || text("food_skipped"))].filter(Boolean).join(" y ") });
  }
  if (has("stressed") && localHour(now) < 18) {
    const at = freeSlot(busy, now + 15 * MIN, cfg.restMin, dayEnd);
    if (at) out.push({ type: "block_rest", to: new Date(at).toISOString(), minutes: cfg.restMin, why: text("stressed") });
  }
  return out;
}

/** Texto de respaldo (sin IA) para cada candidata. */
export function fallbackReason(c: Candidate): string {
  const at = c.to ? hhmmOf(Date.parse(c.to)) : "";
  switch (c.type) {
    case "bedtime": return `${cap(c.why)}: te agendo "A dormir ${at}" con aviso, para recuperar.`;
    case "block_focus": return `${cap(c.why)}: te bloqueo ${c.minutes} min de foco a las ${at}.`;
    case "block_training": return `${cap(c.why)}: te reservo ${c.minutes} min para entrenar a las ${at}.`;
    case "block_rest": return `${cap(c.why)}: te reservo ${c.minutes} min de descanso a las ${at}.`;
    case "log_prompt": return `${cap(c.why)}: te mando un recordatorio para registrarlo.`;
    case "slack_focus": return `${cap(c.why)}: te pongo "En foco" y no molestar en Slack de ${at} a ${hhmmOf(Date.parse(c.to!) + (c.minutes ?? 0) * MIN)}.`;
    case "linear_lower_priority": return `${cap(c.why)}: le bajo la prioridad a ${c.issueId} de ${PRIORITY_LABEL[c.priorityFrom!]} a ${PRIORITY_LABEL[c.priorityTo!]}.`;
    case "linear_create_issue": return `${cap(c.why)}: creo "${c.title}" en ${c.team}.`;
  }
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

