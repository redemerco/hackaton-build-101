// npm run smoke — chequea roundtrip e idempotencia de raw_events en una DB en memoria.
import assert from "node:assert/strict";
import { createDb, rawEvents } from "../lib/db-core.ts";
import { asciiField, asciiLine, formatDuration, hypnogramLanes, sparkline } from "../lib/ascii.ts";

const { db, insertRawEvents } = createDb(":memory:");
const row = { source: "smoke", kind: "ping", userId: "santi", ts: "2026-10-17T00:00:00.000Z", data: { ok: true } };

assert.equal(insertRawEvents([row]), 1);
assert.equal(insertRawEvents([row]), 0, "re-insertar el mismo evento no debe duplicar");

const rows = db.select().from(rawEvents).all();
assert.equal(rows.length, 1);
assert.deepEqual(JSON.parse(rows[0].json), { ok: true });

// primitivas ASCII
assert.equal(sparkline([0, 7]), "▁█");
assert.equal(sparkline([3, 3, 3]), "▁▁▁", "serie plana no divide por cero");
assert.equal(formatDuration(432), "7h12");
assert.deepEqual(hypnogramLanes(["deep", "rem"]), { awake: "··", rem: "·█", light: "··", deep: "█·" });
assert.equal(asciiLine([1, 2, 3], 3).split("\n").length, 3);
const field = asciiField({ cols: 20, rows: 5, t: 1, bpm: 60, stress: 0.9 });
assert.deepEqual(field.split("\n").map((l) => l.length), [20, 20, 20, 20, 20]);

// porciones de comida
const { scaleItem, totalKcal } = await import("../lib/meals.ts");
const half = scaleItem({ name: "x", grams: [100, 150], kcal: [200, 300] }, 0.5);
assert.deepEqual(half.kcal, [100, 150]);
assert.deepEqual(totalKcal([half, { kcal: [10, 20] }]), [110, 170]);

const baseDay = { sleepMin: 432, avgSleepMin: 420, meetings: 2, mood: 4, lateCommitAt: null, mealMinutesAgo: null, goodNightsStreak: 1, hour: 15 };
// daemon: cada estado y cada cara compone una grilla de 40×40 sin desarmarse
const daemon = await import("../lib/daemon.ts");
for (const st of Object.keys(daemon.STATES) as (keyof typeof daemon.STATES)[]) {
  for (const buddy of daemon.BUDDIES) {
    for (const eyes of [undefined, "blink", "wide", "happy"] as const) {
      const rows = daemon.composeBody(buddy, st, { eyes });
      assert.equal(rows.length, 40);
      assert.ok(rows.every((r) => r.length === 40), `${buddy}/${st}/${eyes} desarmado`);
      assert.ok(daemon.toRuns(buddy, rows).every((r) => r.fill !== "#ff00ff"), `${buddy}/${st} usa un color sin paleta`);
    }
  }
  assert.ok(daemon.linesFor(st, baseDay).length > 0, `${st} sin frases`);
}
assert.equal(daemon.BUDDIES.length, 4);
// prioridad: lo urgente gana
assert.equal(daemon.deriveState({ ...baseDay, hour: 3 }), "durmiendo");
assert.equal(daemon.deriveState({ ...baseDay, sleepMin: 250 }), "fundido");
assert.equal(daemon.deriveState({ ...baseDay, lateCommitAt: "02:14" }), "buho");
assert.equal(daemon.deriveState({ ...baseDay, meetings: 4 }), "reunionitis");
assert.equal(daemon.deriveState({ ...baseDay, mood: 2 }), "cansado");
assert.equal(daemon.deriveState({ ...baseDay, mealMinutesAgo: 10 }), "comiendo");
assert.equal(daemon.deriveState(baseDay), "enforma");


// puntaje build101
const { scoreDay } = await import("../lib/score.ts");
const goodNight = { asleepMin: 460, deepRemMin: 190, awakeMin: 10 };
assert.equal(scoreDay({}, {}), null, "sin datos no hay puntaje");
assert.equal(scoreDay({ sleep: goodNight }, {})?.score, 100, "solo sueño: se puntúa sobre lo que hay");
assert.equal(scoreDay({ sleep: goodNight }, {})?.isPartial, true);
const full = scoreDay({ sleep: goodNight, hrvMs: 55, restingBpm: 56, azm: 30 }, { hrvMs: 50, restingBpm: 58 });
assert.equal(full?.score, 100);
assert.equal(full?.isPartial, false);
const rough = scoreDay({ sleep: { asleepMin: 300, deepRemMin: 60, awakeMin: 60 }, hrvMs: 36, restingBpm: 64, azm: 0 }, { hrvMs: 50, restingBpm: 58 });
assert.ok(rough && rough.score < 30, `noche mala + recuperación baja puntúa bajo (${rough?.score})`);
const mid = scoreDay({ sleep: { asleepMin: 400, deepRemMin: 120, awakeMin: 30 }, hrvMs: 48, restingBpm: 59, azm: 10 }, { hrvMs: 50, restingBpm: 58 });
assert.ok(mid && mid.score > rough!.score && mid.score < 100, `noche media queda en el medio (${mid?.score})`);
console.log("smoke OK");
