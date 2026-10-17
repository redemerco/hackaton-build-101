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

console.log("smoke OK");
