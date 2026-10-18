// node scripts/test-agent-rules.mts — evaluación, disparadores de las acciones, horario silencioso, vencimiento
// e idempotencia (id determinístico de Calendar + candado de agent_runs) del agente. Sin red ni IA.
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
  workWeekElapsed,
  type AssessInput,
} from "../lib/agent-rules.ts";

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
type Call = { method: string; url: string; body?: Record<string, unknown> };
function mockFetch(responses: Array<[number, unknown]>) {
  const calls: Call[] = [];
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
  const m = mockFetch([[200, { htmlLink: "L-new" }]]);
  assert.deepEqual(await insertOrRevive(m.fn, hdr, evBody), { outcome: "created", eventId: id1, link: "L-new" });
}
{
  const m = mockFetch([[409, {}], [200, { status: "confirmed", htmlLink: "L-old" }]]);
  assert.deepEqual(await insertOrRevive(m.fn, hdr, evBody), { outcome: "existed", eventId: id1, link: "L-old" });
  assert.deepEqual(m.calls.map((c) => c.method), ["POST", "GET"]);
}
{
  const m = mockFetch([[409, {}], [200, { status: "cancelled" }], [200, { htmlLink: "L-revived" }]]);
  assert.deepEqual(await insertOrRevive(m.fn, hdr, evBody), { outcome: "revived", eventId: id1, link: "L-revived" });
  assert.deepEqual(m.calls.map((c) => c.method), ["POST", "GET", "PATCH"]);
  assert.equal(m.calls[2].body?.status, "confirmed");
  assert.equal(m.calls[2].body?.summary, "A dormir 23:30");
  assert.equal(m.calls[2].body?.id, undefined);
}
{
  const m = mockFetch([[409, {}], [200, { status: "cancelled" }], [403, {}], [200, { htmlLink: "L-again" }]]);
  const r = await insertOrRevive(m.fn, hdr, evBody, 1_000_000);
  assert.equal(r.outcome, "revived");
  assert.equal(r.eventId, `${id1}r${(1_000_000).toString(32)}`);
  assert.equal(m.calls[3].body?.id, r.eventId);
}
{
  const m = mockFetch([[500, {}]]);
  await assert.rejects(insertOrRevive(m.fn, hdr, evBody), /calendar insert 500/);
}

console.log("agent-rules OK");
