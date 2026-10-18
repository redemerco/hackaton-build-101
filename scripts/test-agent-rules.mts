// node scripts/test-agent-rules.mts — evaluación, disparadores de las acciones, horario silencioso, vencimiento
// e idempotencia (id determinístico de Calendar + candado de agent_runs) del agente; Slack y Linear con fetch mockeado. Sin red ni IA.
import assert from "node:assert/strict";
import { createDb } from "../lib/db-core.ts";
import { claimRun, doneRuns, finishRun, releaseRun } from "../lib/agent-runs.ts";
import { insertOrRevive } from "../lib/calendar-insert.ts";
import { isPulsoEvent } from "../lib/pulso-events.ts";
import {
  agentConfig,
  assess,
  bedtimeFor,
  calendarEventId,
  candidatesFor,
  freeSlot,
  hhmmOf,
  isExpired,
  isQuietHour,
  pushSummary,
  fallbackReason,
  workWeekElapsed,
  type AssessInput,
} from "../lib/agent-rules.ts";
import { gateFor, hasScopes, linearCreateIssue, linearIssueUuid, linearLowerPriority, normalizeScopes, pickLowerPriority, slackFocus, WORK_ACTIONS } from "../lib/agent-work.ts";

const uy = (iso: string) => Date.parse(`${iso}-03:00`); // hora de Uruguay
const cfg = agentConfig();

// horario silencioso 22 → 8
assert.equal(isQuietHour(uy("2026-10-14T23:00:00")), true);
assert.equal(isQuietHour(uy("2026-10-14T07:59:00")), true);
assert.equal(isQuietHour(uy("2026-10-14T08:00:00")), false);
assert.equal(isQuietHour(uy("2026-10-14T21:59:00")), false);

// vencimiento (6 h por default)
const created = "2026-10-14T12:00:00.000Z";
assert.equal(isExpired({ createdAt: created }, Date.parse(created) + 5 * 3600_000), false);
assert.equal(isExpired({ createdAt: created }, Date.parse(created) + 6 * 3600_000), true);
assert.equal(isExpired({ expiresAt: "2026-10-14T13:00:00.000Z" }, Date.parse("2026-10-14T13:00:01Z")), true);
assert.equal(isExpired({}, Date.now(), created), true, "vieja sin expiresAt: usa el ts de la fila");

// id de Calendar determinístico y válido (base32hex)
const id1 = calendarEventId("u1", "bedtime", "2026-10-14");
assert.equal(id1, calendarEventId("u1", "bedtime", "2026-10-14"), "mismo usuario + misma cosa → mismo id");
assert.notEqual(id1, calendarEventId("u2", "bedtime", "2026-10-14"));
assert.notEqual(id1, calendarEventId("u1", "bedtime", "2026-10-15"));
assert.match(id1, /^[0-9a-v]{5,1024}$/);

// avance esperado de la semana laboral (lunes–viernes 9–18)
assert.equal(workWeekElapsed(uy("2026-10-12T09:00:00")), 0); // lunes
assert.equal(workWeekElapsed(uy("2026-10-14T13:30:00")), 0.5); // miércoles
assert.equal(workWeekElapsed(uy("2026-10-17T11:00:00")), 1); // sábado

// huecos libres: salta la reunión de 15 a 16
const busy = [{ start: uy("2026-10-14T15:00:00"), end: uy("2026-10-14T16:00:00") }];
assert.equal(freeSlot(busy, uy("2026-10-14T14:50:00"), 90, uy("2026-10-14T20:00:00")), uy("2026-10-14T16:00:00"));
assert.equal(freeSlot(busy, uy("2026-10-14T19:00:00"), 90, uy("2026-10-14T20:00:00")), null);

// a dormir: despertar 07:00 − 7h30 = 23:30; despertar 05:00 → 21:30; tarde para hoy → null
assert.equal(hhmmOf(bedtimeFor(uy("2026-10-14T15:00:00"), "07:00")!), "23:30");
assert.equal(hhmmOf(bedtimeFor(uy("2026-10-14T15:00:00"), "05:00")!), "21:30");
assert.equal(bedtimeFor(uy("2026-10-14T23:40:00"), "07:00"), null);

// evaluación de un miércoles 15:00 cargado: atrasado, dormiste poco, pulso alto, sin entrenar, sin comer ni ánimo
const now = uy("2026-10-14T15:00:00");
const input: AssessInput = {
  now,
  work: {
    issues: [
      { id: "PUL-1", title: "login", done: true, weight: 1 },
      { id: "PUL-2", title: "agente", done: false, weight: 1 },
      { id: "PUL-3", title: "cron", done: false, weight: 1 },
      { id: "PUL-4", title: "ui", done: false, weight: 1 },
    ],
    commitsWeek: 0,
    prsWeek: 0,
    typicalCommitsWeek: null,
    meetingsWeek: busy,
  },
  health: {
    today: { sleep: { asleepMin: 300, deepRemMin: 90, awakeMin: 20 }, restingBpm: 66, hrvMs: 40, azm: 0 },
    baseline: { restingBpm: 60, hrvMs: 50 },
    sleepWeek: [300, 420, 400, null, null, null, null],
    azmWeek: 0,
    wakeHHMM: "07:00",
    meals: [],
    moods: [],
  },
};
const a = assess(input);
assert.equal(a.work.expected, 53);
assert.equal(a.work.actual, 25);
assert.equal(a.work.gap, -28);
assert.ok(a.work.pendientes.some((p) => p.startsWith("PUL-2")));
assert.equal(a.health.stress.level, "mal", "pulso +6 y HRV -20 %");
const flags = a.flags.map((f) => f.id);
for (const f of ["work_behind", "stressed", "sleep_short", "no_training", "food_missing", "mood_missing"] as const) assert.ok(flags.includes(f), `flag ${f}`);
assert.equal(pushSummary(a, 2), "Vas 28% atrasado en la semana y dormiste 5h00: te propongo 2 cosas");

const cands = candidatesFor(a, { now, busy, peakFromHour: 15, wakeHHMM: "07:00" });
const byType = new Map(cands.map((c) => [c.type, c]));
assert.equal(hhmmOf(Date.parse(byType.get("bedtime")!.to!)), "23:30");
assert.equal(hhmmOf(Date.parse(byType.get("block_focus")!.to!)), "16:00", "pico 15 h ocupado por la reunión → 16:00");
assert.equal(hhmmOf(Date.parse(byType.get("block_training")!.to!)), `${String(cfg.trainingHour).padStart(2, "0")}:00`);
assert.deepEqual([byType.get("log_prompt")!.target, byType.get("log_prompt")!.url], ["both", "/"]);
assert.ok(byType.has("block_rest"), "estrés antes de las 18 → descanso");

// día tranquilo: sin flags → sin candidatas
const calm = assess({
  ...input,
  now: uy("2026-10-14T11:00:00"),
  work: { ...input.work, issues: input.work.issues.map((i) => ({ ...i, done: true })) },
  health: { ...input.health, today: { sleep: { asleepMin: 470, deepRemMin: 160, awakeMin: 10 }, restingBpm: 59, hrvMs: 52, azm: 30 }, sleepWeek: [470, 460, 450, null, null, null, null], azmWeek: 70, meals: [{ time: "09:00", kcal: [400, 500] }], moods: [4] },
});
assert.deepEqual(calm.flags.map((f) => f.id), ["work_ahead"]);
assert.deepEqual(candidatesFor(calm, { now: uy("2026-10-14T11:00:00"), busy: [], peakFromHour: null, wakeHHMM: "07:00" }), []);

// log_prompt: antes de las 14 no se dispara; solo comidas → /salud
const morning = assess({ ...input, now: uy("2026-10-14T10:00:00") });
assert.ok(!morning.flags.some((f) => f.id === "food_missing" || f.id === "mood_missing"));
const onlyFood = assess({ ...input, health: { ...input.health, moods: [4] } });
assert.equal(candidatesFor(onlyFood, { now, busy, peakFromHour: null, wakeHHMM: null }).find((c) => c.type === "log_prompt")?.url, "/salud");

// candado de ejecución: confirmar dos veces no ejecuta dos veces
const { db } = createDb(":memory:");
assert.deepEqual(claimRun(db, "u1", "act-1", "bedtime"), { ok: true });
assert.deepEqual(claimRun(db, "u1", "act-1", "bedtime"), { ok: false, reason: "running" });
finishRun(db, "act-1", { message: "A dormir 23:30 agendado", url: "https://calendar.google.com/x", eventId: id1 });
assert.deepEqual(claimRun(db, "u1", "act-1", "bedtime"), { ok: false, reason: "done", message: "A dormir 23:30 agendado", url: "https://calendar.google.com/x" });
assert.deepEqual([...doneRuns(db, ["act-1", "act-2"]).keys()], ["act-1"]);
// error o simulada: se suelta y se puede reintentar
assert.deepEqual(claimRun(db, "u1", "act-2", "log_prompt"), { ok: true });
releaseRun(db, "act-2");
assert.deepEqual(claimRun(db, "u1", "act-2", "log_prompt"), { ok: true });
// un "running" colgado (crash) más viejo que 2 min se puede retomar
assert.deepEqual(claimRun(db, "u1", "act-3", "block_focus", Date.now() - 5 * 60_000), { ok: true });
assert.deepEqual(claimRun(db, "u1", "act-3", "block_focus"), { ok: true });

// bloques de Pulso: por la marca del sync o por el id determinístico (también el recreado con sufijo)
assert.equal(isPulsoEvent({ id: "abc", pulso: true }), true);
assert.equal(isPulsoEvent({ id: id1 }), true);
assert.equal(isPulsoEvent({ id: `${id1}r${Date.now().toString(32)}` }), true);
assert.equal(isPulsoEvent({ id: "reunion123" }), false);
assert.equal(isPulsoEvent({}), false);

// insert con 409: confirmado = ya estaba; borrado (cancelled) = se reactiva o se recrea con otro id
type CalCall = { method: string; url: string; body?: Record<string, unknown> };
function mockCalFetch(responses: Array<[number, unknown]>) {
  const calls: CalCall[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const [status, json] = responses.shift() ?? [500, {}];
    return new Response(JSON.stringify(json), { status });
  };
  return { fn, calls };
}
const evBody = { id: id1, summary: "A dormir 23:30", start: { dateTime: "2026-10-14T23:30:00-03:00" } };
const hdr = { Authorization: "Bearer x" };
{
  const m = mockCalFetch([[200, { htmlLink: "L-new" }]]);
  assert.deepEqual(await insertOrRevive(m.fn, hdr, evBody), { outcome: "created", eventId: id1, link: "L-new" });
}
{
  const m = mockCalFetch([[409, {}], [200, { status: "confirmed", htmlLink: "L-old" }]]);
  assert.deepEqual(await insertOrRevive(m.fn, hdr, evBody), { outcome: "existed", eventId: id1, link: "L-old" });
  assert.deepEqual(m.calls.map((c) => c.method), ["POST", "GET"]);
}
{
  const m = mockCalFetch([[409, {}], [200, { status: "cancelled" }], [200, { htmlLink: "L-revived" }]]);
  assert.deepEqual(await insertOrRevive(m.fn, hdr, evBody), { outcome: "revived", eventId: id1, link: "L-revived" });
  assert.deepEqual(m.calls.map((c) => c.method), ["POST", "GET", "PATCH"]);
  assert.equal(m.calls[2].body?.status, "confirmed");
  assert.equal(m.calls[2].body?.summary, "A dormir 23:30");
  assert.equal(m.calls[2].body?.id, undefined);
}
{
  const m = mockCalFetch([[409, {}], [200, { status: "cancelled" }], [403, {}], [200, { htmlLink: "L-again" }]]);
  const r = await insertOrRevive(m.fn, hdr, evBody, 1_000_000);
  assert.equal(r.outcome, "revived");
  assert.equal(r.eventId, `${id1}r${(1_000_000).toString(32)}`);
  assert.equal(m.calls[3].body?.id, r.eventId);
}
{
  const m = mockCalFetch([[500, {}]]);
  await assert.rejects(insertOrRevive(m.fn, hdr, evBody), /calendar insert 500/);
}

// ── Slack y Linear: gating por scope ────────────────────────────────────────
assert.equal(normalizeScopes(["read", "write"]), "read,write");
assert.equal(normalizeScopes("search:read, users.profile:write dnd:write"), "search:read,users.profile:write,dnd:write");
assert.equal(normalizeScopes(undefined), null);
assert.equal(hasScopes(null, ["write"]), false, "conexión vieja (sin scopes guardados) → sin escritura");
assert.equal(hasScopes("read", ["write"]), false);
assert.equal(hasScopes("read,write", ["write"]), true);
assert.equal(hasScopes("admin", ["write"]), true);
assert.equal(hasScopes("search:read,users.profile:write", WORK_ACTIONS.slack_focus.scopes), false, "falta dnd:write");
assert.equal(gateFor("slack_focus", null), "missing");
assert.equal(gateFor("slack_focus", { scopes: "search:read" }), "reconnect");
assert.equal(gateFor("slack_focus", { scopes: "search:read,users.profile:write,dnd:write" }), "ok");
assert.equal(gateFor("linear_lower_priority", { scopes: null }), "reconnect");

// ── disparadores ────────────────────────────────────────────────────────────
const issues = [
  { id: "PUL-1", title: "login", done: true, weight: 1, priority: 3 },
  { id: "PUL-2", title: "agente", done: false, weight: 1, priority: 2 },
  { id: "PUL-3", title: "cron", done: false, weight: 1, priority: 3 },
  { id: "PUL-4", title: "ui", done: false, weight: 1, priority: 1 },
];
const baseCtx = { now, busy, peakFromHour: 15, wakeHHMM: "07:00" };
const types = (cs: { type: string }[]) => cs.map((c) => c.type);
// sin Slack/Linear en el contexto (o sin conectar): nada nuevo, como antes
for (const t of ["slack_focus", "linear_create_issue", "linear_lower_priority"]) assert.ok(!types(cands).includes(t), `${t} sin conexión no se propone`);
const missing = candidatesFor(a, { ...baseCtx, slack: { gate: "missing", messagesToday: 80 }, linear: { gate: "missing", issues } });
assert.deepEqual(types(missing), types(cands));

const full = candidatesFor(a, { ...baseCtx, slack: { gate: "ok", messagesToday: 40 }, linear: { gate: "ok", issues } });
const fullBy = new Map(full.map((c) => [c.type, c]));
const sf = fullBy.get("slack_focus")!;
assert.ok(sf, "atrasado + bloque de foco → slack_focus");
assert.deepEqual([sf.to, sf.minutes], [fullBy.get("block_focus")!.to, fullBy.get("block_focus")!.minutes], "mismo horario que el bloque de foco");
assert.ok(sf.why.includes("40 mensajes de Slack"), "mucho Slack hoy → lo dice");
assert.equal(sf.reconnect, undefined);
const lp = fullBy.get("linear_lower_priority")!;
assert.deepEqual([lp.issueId, lp.priorityFrom, lp.priorityTo], ["PUL-3", 3, 4], "media → baja; nunca la urgente");
const ci = fullBy.get("linear_create_issue")!;
assert.deepEqual([ci.team, ci.title], ["PUL", "Seguimiento: destrabar PUL-2 agente"]);
for (const c of full) assert.ok(fallbackReason(c).length > 10, `respaldo con texto para ${c.type}`);
assert.match(fallbackReason(lp), /PUL-3 de media a baja/);

// poco Slack: igual acompaña al bloque de foco
assert.ok(!candidatesFor(a, { ...baseCtx, slack: { gate: "ok", messagesToday: 2 } }).find((c) => c.type === "slack_focus")!.why.includes("mensajes"));
// conexión vieja (sin scope): se propone simulada con Reconectar
const old = candidatesFor(a, { ...baseCtx, slack: { gate: "reconnect", messagesToday: 40 }, linear: { gate: "reconnect", issues } });
assert.deepEqual(old.filter((c) => c.reconnect).map((c) => `${c.type}:${c.reconnect}`), ["slack_focus:slack", "linear_lower_priority:linear", "linear_create_issue:linear"]);
// atrasado pero no "muy" atrasado, o con la salud bien → no baja prioridades (crear el seguimiento sí)
const mild = { ...a, work: { ...a.work, gap: -15 } };
assert.deepEqual(types(candidatesFor(mild, { ...baseCtx, linear: { gate: "ok", issues } }).filter((c) => c.type.startsWith("linear"))), ["linear_create_issue"]);
const healthy = { ...a, health: { ...a.health, stress: { level: "bien" as const, text: "" }, sleep: { ...a.health.sleep, level: "bien" as const }, score: 80 } };
assert.ok(!types(candidatesFor(healthy, { ...baseCtx, linear: { gate: "ok", issues } })).includes("linear_lower_priority"));
// solo issues urgentes o sin prioridad → nada que bajar
assert.equal(pickLowerPriority([{ id: "PUL-9", done: false, priority: 1 }, { id: "PUL-8", done: false, priority: 0 }]), null);
assert.deepEqual(pickLowerPriority([{ id: "PUL-9", done: false, priority: 2 }])?.to, 3);
// sin atraso → nada de Slack ni Linear
assert.ok(!types(candidatesFor(calm, { now: uy("2026-10-14T11:00:00"), busy: [], peakFromHour: null, wakeHHMM: "07:00", slack: { gate: "ok", messagesToday: 99 }, linear: { gate: "ok", issues } })).some((t) => t.startsWith("slack") || t.startsWith("linear")));

// id de issue determinístico (UUID v4): mismo pedido → mismo id
const uuid = linearIssueUuid("u1", "PUL", "Seguimiento: destrabar PUL-2");
assert.equal(uuid, linearIssueUuid("u1", "PUL", "  seguimiento: destrabar pul-2 "));
assert.notEqual(uuid, linearIssueUuid("u2", "PUL", "Seguimiento: destrabar PUL-2"));
assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

// ── ejecutores con fetch mockeado: idempotencia ─────────────────────────────
type Call = { url: string; body: string; auth: string };
function mockFetch(handler: (url: string, body: string) => unknown) {
  const calls: Call[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    calls.push({ url: String(url), body, auth: String((init?.headers as Record<string, string>)?.Authorization) });
    return new Response(JSON.stringify(handler(String(url), body)), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { f, calls };
}

// Slack: estado con vencimiento al fin del bloque + DND hasta el fin; repetirlo deja exactamente lo mismo
const block = { start: uy("2026-10-14T16:00:00"), minutes: 90 };
const endSec = uy("2026-10-14T17:30:00") / 1000;
const slack = mockFetch(() => ({ ok: true }));
const r1 = await slackFocus("xoxp-1", block, uy("2026-10-14T16:00:00"), slack.f);
assert.equal(r1.status, "done");
assert.deepEqual(slack.calls.map((c) => c.url), ["https://slack.com/api/users.profile.set", "https://slack.com/api/dnd.setSnooze"]);
assert.equal(slack.calls[0].auth, "Bearer xoxp-1");
const profile = JSON.parse(new URLSearchParams(slack.calls[0].body).get("profile")!);
assert.deepEqual(profile, { status_text: "En foco con Pulso", status_emoji: ":headphones:", status_expiration: endSec });
assert.equal(new URLSearchParams(slack.calls[1].body).get("num_minutes"), "90");
await slackFocus("xoxp-1", block, uy("2026-10-14T16:30:00"), slack.f);
assert.equal(slack.calls[2].body, slack.calls[0].body, "mismo estado y mismo vencimiento");
assert.equal(new URLSearchParams(slack.calls[3].body).get("num_minutes"), "60", "el DND termina a la misma hora");
const late = mockFetch(() => ({ ok: true }));
assert.equal((await slackFocus("x", block, uy("2026-10-14T18:00:00"), late.f)).status, "error");
assert.equal(late.calls.length, 0, "bloque terminado → no toca Slack");
await assert.rejects(slackFocus("x", block, uy("2026-10-14T16:00:00"), mockFetch(() => ({ ok: false, error: "missing_scope" })).f), /missing_scope/);

// Linear: un "servidor" en memoria
function fakeLinear() {
  const created = new Map<string, { identifier: string; url: string; title: string }>();
  const prio = new Map([["PUL-3", 3]]);
  const m = mockFetch((_url, raw) => {
    const { query, variables } = JSON.parse(raw) as { query: string; variables: Record<string, unknown> };
    if (query.includes("issueCreate")) {
      const input = variables.input as { id: string; title: string; teamId: string };
      if (created.has(input.id)) return { errors: [{ message: "duplicate" }] };
      const issue = { identifier: `PUL-${10 + created.size}`, url: `https://linear.app/x/issue/PUL-${10 + created.size}`, title: input.title };
      created.set(input.id, issue);
      return { data: { issueCreate: { success: true, issue } } };
    }
    if (query.includes("issueUpdate")) {
      prio.set(String(variables.id), Number(variables.p));
      return { data: { issueUpdate: { success: true } } };
    }
    if (query.includes("teams")) return { data: { teams: { nodes: variables.key === "PUL" ? [{ id: "team-1", key: "PUL" }] : [] } } };
    const id = String(variables.id);
    if (created.has(id)) return { data: { issue: created.get(id) } };
    if (prio.has(id)) return { data: { issue: { identifier: id, priority: prio.get(id), url: `https://linear.app/x/issue/${id}` } } };
    return { data: null, errors: [{ message: "Entity not found" }] };
  });
  return { ...m, created, prio };
}

const lin = fakeLinear();
const c1 = await linearCreateIssue("lin_1", { userId: "u1", team: "PUL", title: "Seguimiento: destrabar PUL-2" }, lin.f);
assert.equal(c1.status, "done");
assert.equal(lin.calls[0].auth, "Bearer lin_1");
const c2 = await linearCreateIssue("lin_1", { userId: "u1", team: "PUL", title: "Seguimiento: destrabar PUL-2" }, lin.f);
assert.equal(lin.created.size, 1, "confirmar dos veces no duplica el issue");
assert.match(c2.message, /ya estaba creado/);
assert.equal(lin.calls.filter((c) => c.body.includes("issueCreate")).length, 1);
assert.equal((await linearCreateIssue("lin_1", { userId: "u1", team: "NOPE", title: "x y z" }, lin.f)).status, "error", "team desconocido → no crea nada");

const l1 = await linearLowerPriority("lin_1", { issueId: "PUL-3", from: 3, to: 4 }, lin.f);
assert.deepEqual([l1.status, lin.prio.get("PUL-3")], ["done", 4]);
const updates = () => lin.calls.filter((c) => c.body.includes("issueUpdate")).length;
const l2 = await linearLowerPriority("lin_1", { issueId: "PUL-3", from: 3, to: 4 }, lin.f);
assert.match(l2.message, /ya estaba en prioridad baja/);
assert.equal(updates(), 1, "repetirlo no vuelve a escribir");
lin.prio.set("PUL-3", 1); // alguien la pasó a urgente desde la propuesta
assert.equal((await linearLowerPriority("lin_1", { issueId: "PUL-3", from: 3, to: 4 }, lin.f)).status, "error");
assert.equal(updates(), 1, "si cambió, no la pisa");

console.log("agent-rules OK");
