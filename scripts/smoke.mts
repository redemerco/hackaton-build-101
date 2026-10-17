// npm run smoke — chequea roundtrip e idempotencia de raw_events en una DB en memoria.
import assert from "node:assert/strict";
import { createDb, rawEvents } from "../lib/db-core.ts";

const { db, insertRawEvents } = createDb(":memory:");
const row = { source: "smoke", kind: "ping", userId: "santi", ts: "2026-10-17T00:00:00.000Z", data: { ok: true } };

assert.equal(insertRawEvents([row]), 1);
assert.equal(insertRawEvents([row]), 0, "re-insertar el mismo evento no debe duplicar");

const rows = db.select().from(rawEvents).all();
assert.equal(rows.length, 1);
assert.deepEqual(JSON.parse(rows[0].json), { ok: true });

console.log("smoke OK");
