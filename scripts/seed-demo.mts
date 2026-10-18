// npm run seed:demo            → carga datos SIMULADOS para ver el ranking (Semana) y el Cuerpo de cada uno.
// npm run seed:demo -- --clear → los borra.
// Todo lo simulado lleva `_mock: true` en el JSON (y token "mock" en connections): la UI lo rotula como simulado
// y --clear lo saca sin tocar datos reales. Solo se simulan usuarios que no tienen datos reales de Google Health.
import Database from "better-sqlite3";
import { createDb } from "../lib/db-core.ts";

const DB_PATH = "data/pulso.db";
const DAYS = 28; // > 21 días con sueño + commits + ánimo: el umbral de correlación de Trabajo se alcanza
// mensajes con forma de commit real (la pantalla igual rotula [datos simulados])
// repos de los commits simulados: 2 de cada 3 al proyecto principal (lo usa el reparto por proyecto de Yo)
const REPOS = ["build101", "build101", "entraste-api"];
const COMMIT_MESSAGES = [
  "feat: endpoint de pagos con reintentos",
  "fix: race en el refresh del token",
  "refactor: separar el parser de webhooks",
  "test: casos borde del calendario",
  "fix: timezone en el reporte semanal",
  "chore: bump de dependencias",
  "feat: filtro por proyecto en el dashboard",
  "fix: null en el onboarding",
  "docs: cómo levantar el entorno local",
];
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
CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY, buddy TEXT NOT NULL, tint TEXT NOT NULL, share_score INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, has_wearable INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
`);

if (process.argv.includes("--clear")) {
  const ev = sqlite.prepare(`DELETE FROM raw_events WHERE json LIKE '%"_mock":true%'`).run();
  const cn = sqlite.prepare(`DELETE FROM connections WHERE token = ?`).run(MOCK_TOKEN);
  // los usuarios que creó el seed (email @demo.build101) y sus personajes; los reales no se tocan
  const pr = sqlite.prepare(`DELETE FROM profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@demo.build101')`).run();
  const us = sqlite.prepare(`DELETE FROM users WHERE email LIKE '%@demo.build101'`).run();
  console.log(`borrados: ${ev.changes} eventos, ${cn.changes} conexiones, ${us.changes} usuarios y ${pr.changes} personajes simulados`);
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

/**
 * Etapas como las manda Google Health (stages[] con inicio y fin), en ciclos de ~90 min:
 * profundo al principio de la noche, REM al final, un despertar corto al empezar y el resto repartido.
 */
function nightStages(startMs: number, deep: number, rem: number, light: number, awake: number) {
  const CYCLES = 5;
  const out: { startTime: string; endTime: string; type: string }[] = [];
  let t = startMs;
  const push = (type: string, min: number) => {
    if (min <= 0) return;
    out.push({ startTime: isoZ(t), endTime: isoZ(t + min * 60_000), type });
    t += min * 60_000;
  };
  push("AWAKE", Math.round(awake * 0.6));
  for (let c = 0; c < CYCLES; c++) {
    const early = 1 - c / (CYCLES - 1); // 1 al principio, 0 al final
    const deepC = Math.round((deep * (0.5 + early)) / CYCLES / 1);
    const remC = Math.round((rem * (1.5 - early)) / CYCLES);
    push("LIGHT", Math.round(light / CYCLES / 2));
    push("DEEP", Math.min(deepC, Math.round(deep / 2)));
    push("LIGHT", Math.round(light / CYCLES / 2));
    push("REM", remC);
    if (c === 2) push("AWAKE", Math.round(awake * 0.4));
  }
  return out;
}

let events = 0;
for (const p of PEOPLE) {
  sqlite
    .prepare(`INSERT OR IGNORE INTO connections (user_id, provider, account, token, created_at) VALUES (?, 'slack', ?, ?, ?)`)
    .run(p.id, `${p.id}@${team}`, MOCK_TOKEN, now.toISOString());
  // usuario simulado (el login real crea el suyo con el id de Google; este no lo pisa)
  sqlite.prepare(`INSERT OR IGNORE INTO users (id, email, name, has_wearable, created_at) VALUES (?, ?, ?, 1, ?)`).run(p.id, `${p.id}@demo.build101`, NAMES[p.id], now.toISOString());
  // el personaje solo si la persona todavía no eligió uno
  try {
    sqlite.exec(`ALTER TABLE profiles ADD COLUMN share_score INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // ya existe
  }
  // los simulados entran al ranking (opt-in) para que la demo lo muestre
  sqlite.prepare(`INSERT INTO profiles (user_id, buddy, tint, share_score, updated_at) VALUES (?, ?, ?, 1, ?) ON CONFLICT(user_id) DO UPDATE SET share_score = 1`).run(p.id, p.buddy, p.tint, now.toISOString());

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
    // la semana de la hackathon (los 6 días cerrados): más trabajo y el cuerpo un poco peor, para que el mapa de estrés se mueva
    const isCrunch = i >= 1 && i <= 6;
    const asleep = Math.round(jitter((isBadNight ? p.sleepMin - 90 : p.sleepMin) - (isCrunch ? 35 : 0), 25));
    const deepRem = Math.round(asleep * jitter(p.deepRem, 0.04));
    const awake = Math.round(jitter(isBadNight ? p.awake + 25 : p.awake, 6));
    const end = midnightUtc + jitter(7.25, 0.5) * 3600_000;
    const start = end - (asleep + awake) * 60_000;
    const sleep = {
      sleep: {
        interval: { startTime: isoZ(start), endTime: isoZ(end), startUtcOffset: TZ_OFFSET, endUtcOffset: TZ_OFFSET },
        type: "STAGES",
        stages: nightStages(start, Math.round(deepRem * 0.45), deepRem - Math.round(deepRem * 0.45), asleep - deepRem, awake),
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
    const rhr = Math.round(jitter((isBadNight ? p.rhr + 4 : p.rhr) + (isCrunch ? 3 : 0), 1.5));
    const hrv = jitter((isBadNight ? p.hrv * 0.8 : p.hrv) * (isCrunch ? 0.85 : 1), 3);
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
    const commitHours = [10.2, 11.1, 15.4, 16.2, 17.5, ...(isCrunch ? [19.4, 20.6, 21.8] : []), ...late].map((h) => jitter(h, 0.3));
    for (const [k, h] of commitHours.entries()) {
      const t = at(h);
      if (t > now.getTime()) continue;
      events += insertAny.run("github", "commit", p.id, isoZ(t), JSON.stringify({ commit: { message: COMMIT_MESSAGES[(i * 3 + k) % COMMIT_MESSAGES.length], author: { date: isoZ(t) } }, html_url: `https://github.com/demo/${REPOS[(i + k) % REPOS.length]}/commit/${i}-${k}`, _mock: true })).changes;
    }
    // PRs: cada 3 días en el proyecto principal y cada 6 en el otro ("dónde se fue tu semana" solo cuenta repos con PR)
    const prRepo = i % 3 === 0 ? REPOS[0] : i % 6 === 4 ? REPOS[2] : null;
    if (prRepo && at(16.5) <= now.getTime()) {
      events += insertAny.run("github", "pr", p.id, isoZ(at(16.5)), JSON.stringify({ title: "PR simulado", html_url: `https://github.com/demo/${prRepo}/pull/${100 + i}`, _mock: true })).changes;
    }
    for (let k = 0; k < (isCrunch ? 30 : 18); k++) {
      const t = at(jitter(13, 4));
      if (t <= now.getTime()) events += insertAny.run("slack", "message", p.id, isoZ(t), JSON.stringify({ _mock: true })).changes;
    }
    const meetings = isHeavy ? [[9.5, 11], [11.5, 13], [14, 15.5], [16, 17.5]] : [[10, 10.5], [15, 16]];
    for (const [a, b] of meetings) {
      const start = at(a);
      if (start > now.getTime()) continue;
      events += insertAny.run("calendar", "event", p.id, isoZ(start), JSON.stringify({ start: isoZ(start), end: isoZ(at(b)), _mock: true })).changes;
    }
    // comidas (como las guarda la cámara: app/actions/meal.ts)
    const MEALS = [
      { h: 8.5, items: [{ name: "café con leche", grams: [200, 250], kcal: [90, 130] }, { name: "tostadas", grams: [60, 80], kcal: [160, 220] }] },
      { h: 13.2, items: [{ name: "milanesa con ensalada", grams: [250, 350], kcal: [520, 700] }] },
      { h: isBadNight ? 23 : 21, items: [{ name: isBadNight ? "pizza" : "tarta de verdura", grams: [250, 350], kcal: isBadNight ? [700, 900] : [380, 520] }] },
    ];
    for (const m of MEALS) {
      const t = at(jitter(m.h, 0.4));
      if (t > now.getTime()) continue;
      const totalKcal = [m.items.reduce((n, it) => n + it.kcal[0], 0), m.items.reduce((n, it) => n + it.kcal[1], 0)];
      events += insertAny.run("meal", "photo", p.id, isoZ(t), JSON.stringify({ items: m.items, comment: "comida simulada", totalKcal, _mock: true })).changes;
    }

    const moodAt = at(jitter(13, 1));
    const mood = Math.max(1, Math.min(5, Math.round(jitter(isBadNight ? 2.3 : isHeavy ? 3 : 4, 0.6))));
    if (moodAt <= now.getTime()) events += insertAny.run("mood", "checkin", p.id, isoZ(moodAt), JSON.stringify({ mood, _mock: true })).changes;
  }
}
console.log(`listo: ${events} eventos simulados en ${DB_PATH} (workspace "${team}"). Borrar: npm run seed:demo -- --clear`);
