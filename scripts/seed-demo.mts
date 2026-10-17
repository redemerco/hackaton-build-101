// npm run seed:demo            → carga datos SIMULADOS para ver el ranking (Semana) y el Cuerpo de cada uno.
// npm run seed:demo -- --clear → los borra.
// Todo lo simulado lleva `_mock: true` en el JSON (y token "mock" en connections): la UI lo rotula como simulado
// y --clear lo saca sin tocar datos reales. Solo se simulan usuarios que no tienen datos reales de Google Health.
import Database from "better-sqlite3";
import { createDb } from "../lib/db-core.ts";

const DB_PATH = "data/pulso.db";
const DAYS = 21;
const MOCK_TOKEN = "mock";
const DEMO_TEAM = "build101-demo";
const TZ_OFFSET = "-10800s"; // Montevideo
const TZ_OFFSET_MS = -3 * 3600_000;

// Cada perfil tiene su "personalidad" de sueño y recuperación para que el ranking quede variado.
const PEOPLE = [
  { id: "santi", buddy: "daemon", tint: "cielo", sleepMin: 440, deepRem: 0.38, awake: 14, rhr: 57, hrv: 52, azm: 26 },
  { id: "renzo", buddy: "gato", tint: "coral", sleepMin: 395, deepRem: 0.33, awake: 25, rhr: 61, hrv: 44, azm: 14 },
  { id: "joaco", buddy: "patito", tint: "menta", sleepMin: 350, deepRem: 0.27, awake: 38, rhr: 64, hrv: 38, azm: 6 },
] as const;

createDb(DB_PATH); // asegura raw_events
const sqlite = new Database(DB_PATH);
sqlite.exec(`
CREATE TABLE IF NOT EXISTS connections (user_id TEXT NOT NULL, provider TEXT NOT NULL, account TEXT NOT NULL, token TEXT NOT NULL,
  refresh_token TEXT, expires_at TEXT, created_at TEXT NOT NULL, PRIMARY KEY (user_id, provider));
CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY, buddy TEXT NOT NULL, tint TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, has_wearable INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
`);

if (process.argv.includes("--clear")) {
  const ev = sqlite.prepare(`DELETE FROM raw_events WHERE json LIKE '%"_mock":true%'`).run();
  const cn = sqlite.prepare(`DELETE FROM connections WHERE token = ?`).run(MOCK_TOKEN);
  console.log(`borrados: ${ev.changes} eventos simulados, ${cn.changes} conexiones simuladas`);
  process.exit(0);
}

// Semilla fija: el mismo seed da siempre los mismos números (útil para comparar capturas).
let seed = 101;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const jitter = (value: number, spread: number) => value + (rand() * 2 - 1) * spread;

const now = new Date();
const isoZ = (ms: number) => new Date(ms).toISOString();
const insert = sqlite.prepare(`INSERT OR IGNORE INTO raw_events (source, kind, user_id, ts, json) VALUES ('google', ?, ?, ?, ?)`);
const insertAny = sqlite.prepare(`INSERT OR IGNORE INTO raw_events (source, kind, user_id, ts, json) VALUES (?, ?, ?, ?, ?)`);
const NAMES: Record<string, string> = { santi: "Santi", renzo: "Renzo", joaco: "Joaco" };
const hasReal = sqlite.prepare(`SELECT 1 FROM raw_events WHERE source = 'google' AND user_id = ? AND json NOT LIKE '%"_mock":true%' LIMIT 1`);

// Todos al mismo workspace de Slack: el del primero que tenga Slack real, o uno de demo.
const realSlack = sqlite.prepare(`SELECT account FROM connections WHERE provider = 'slack' AND token != ? LIMIT 1`).get(MOCK_TOKEN) as { account: string } | undefined;
const team = realSlack?.account.split("@").at(-1) ?? DEMO_TEAM;

let events = 0;
for (const p of PEOPLE) {
  sqlite
    .prepare(`INSERT OR IGNORE INTO connections (user_id, provider, account, token, created_at) VALUES (?, 'slack', ?, ?, ?)`)
    .run(p.id, `${p.id}@${team}`, MOCK_TOKEN, now.toISOString());
  // usuario simulado (el login real crea el suyo con el id de Google; este no lo pisa)
  sqlite.prepare(`INSERT OR IGNORE INTO users (id, email, name, has_wearable, created_at) VALUES (?, ?, ?, 1, ?)`).run(p.id, `${p.id}@demo.build101`, NAMES[p.id], now.toISOString());
  // el personaje solo si la persona todavía no eligió uno
  sqlite.prepare(`INSERT OR IGNORE INTO profiles (user_id, buddy, tint, updated_at) VALUES (?, ?, ?, ?)`).run(p.id, p.buddy, p.tint, now.toISOString());

  if (hasReal.get(p.id)) {
    console.log(`${p.id}: tiene datos reales de Google Health, no se simula`);
    continue;
  }

  for (let i = 0; i < DAYS; i++) {
    // día local i días atrás, a la medianoche de Montevideo
    const local = new Date(now.getTime() + TZ_OFFSET_MS - i * 86400_000);
    const [y, m, d] = [local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()];
    const midnightUtc = Date.UTC(y, m - 1, d) - TZ_OFFSET_MS;
    const date = { year: y, month: m, day: d };

    // noche que termina ese día a las ~07:15 local; un par de noches malas para que haya movimiento
    const isBadNight = i % 4 === 2;
    const asleep = Math.round(jitter(isBadNight ? p.sleepMin - 90 : p.sleepMin, 25));
    const deepRem = Math.round(asleep * jitter(p.deepRem, 0.04));
    const awake = Math.round(jitter(isBadNight ? p.awake + 25 : p.awake, 6));
    const end = midnightUtc + jitter(7.25, 0.5) * 3600_000;
    const start = end - (asleep + awake) * 60_000;
    const sleep = {
      sleep: {
        interval: { startTime: isoZ(start), endTime: isoZ(end), startUtcOffset: TZ_OFFSET, endUtcOffset: TZ_OFFSET },
        type: "STAGES",
        summary: {
          stagesSummary: [
            { type: "DEEP", minutes: String(Math.round(deepRem * 0.45)) },
            { type: "REM", minutes: String(deepRem - Math.round(deepRem * 0.45)) },
            { type: "LIGHT", minutes: String(asleep - deepRem) },
            { type: "AWAKE", minutes: String(awake) },
          ],
        },
      },
      _mock: true,
    };
    events += insert.run("sleep", p.id, isoZ(start), JSON.stringify(sleep)).changes;

    const dayTs = isoZ(Date.UTC(y, m - 1, d));
    const rhr = Math.round(jitter(isBadNight ? p.rhr + 4 : p.rhr, 1.5));
    const hrv = jitter(isBadNight ? p.hrv * 0.8 : p.hrv, 3);
    events += insert.run("resting_hr", p.id, dayTs, JSON.stringify({ dailyRestingHeartRate: { date, beatsPerMinute: String(rhr) }, _mock: true })).changes;
    events += insert
      .run("hrv", p.id, dayTs, JSON.stringify({ dailyHeartRateVariability: { date, averageHeartRateVariabilityMilliseconds: Number(hrv.toFixed(1)) }, _mock: true }))
      .changes;

    // minutos en zona: un bloque a la tarde (18 h local), uno por minuto como manda la API
    const azm = Math.max(0, Math.round(jitter(p.azm, 8)));
    for (let k = 0; k < azm; k++) {
      const t = midnightUtc + 18 * 3600_000 + k * 60_000;
      if (t > now.getTime()) break;
      const point = { activeZoneMinutes: { interval: { startTime: isoZ(t), startUtcOffset: TZ_OFFSET }, heartRateZone: "FAT_BURN", activeZoneMinutes: "1" }, _mock: true };
      events += insert.run("azm", p.id, isoZ(t), JSON.stringify(point)).changes;
    }

    // trabajo del día: commits, Slack y reuniones (horarios), más un check-in de ánimo que acompaña a la noche
    const at = (h: number) => midnightUtc + h * 3600_000;
    const isHeavy = i % 4 === 1; // días de muchas reuniones
    // las noches malas vienen de trabajar tarde: si la noche que termina mañana (i-1) es mala, hoy se trabaja hasta tarde
    const late = (i - 1) % 4 === 2 ? [23.3, 23.8, 0.6 + 24] : [];
    const commitHours = [10.2, 11.1, 15.4, 16.2, 17.5, ...late].map((h) => jitter(h, 0.3));
    for (const h of commitHours) {
      const t = at(h);
      if (t > now.getTime()) continue;
      events += insertAny.run("github", "commit", p.id, isoZ(t), JSON.stringify({ commit: { message: "commit simulado", author: { date: isoZ(t) } }, _mock: true })).changes;
    }
    for (let k = 0; k < 18; k++) {
      const t = at(jitter(13, 4));
      if (t <= now.getTime()) events += insertAny.run("slack", "message", p.id, isoZ(t), JSON.stringify({ _mock: true })).changes;
    }
    const meetings = isHeavy ? [[9.5, 11], [11.5, 13], [14, 15.5], [16, 17.5]] : [[10, 10.5], [15, 16]];
    for (const [a, b] of meetings) {
      const start = at(a);
      if (start > now.getTime()) continue;
      events += insertAny.run("calendar", "event", p.id, isoZ(start), JSON.stringify({ start: isoZ(start), end: isoZ(at(b)), _mock: true })).changes;
    }
    const moodAt = at(jitter(13, 1));
    const mood = Math.max(1, Math.min(5, Math.round(jitter(isBadNight ? 2.3 : isHeavy ? 3 : 4, 0.6))));
    if (moodAt <= now.getTime()) events += insertAny.run("mood", "checkin", p.id, isoZ(moodAt), JSON.stringify({ mood, _mock: true })).changes;
  }
}
console.log(`listo: ${events} eventos simulados en ${DB_PATH} (workspace "${team}"). Borrar: npm run seed:demo -- --clear`);
