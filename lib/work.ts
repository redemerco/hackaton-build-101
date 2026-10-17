import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, rawEvents } from "@/lib/db";

export type Commit ={ time: string; message: string; additions: number; deletions: number };
export type WorkLogEntry = ({ type: "commit" } & Commit) | { type: "pr"; title: string };

export type WorkDay = {
  log: WorkLogEntry[];
  commits: number;
  /** Reuniones en franjas de 20 min entre 09 y 18 h: [desde, hasta) en índices de franja. */
  meetingSlots: [number, number][];
  week: { sleepMin: number[]; commits: number[]; mood: number[] }; // lu..hoy
  /** Días con los tres datos (sueño, commits, ánimo). Por debajo de MIN_DAYS_FOR_CORRELATION no se afirma nada. */
  daysOfData: number;
  isExample: boolean;
};

export const MEETING_SLOTS_PER_DAY = 27; // 09 → 18 en franjas de 20 min

const TZ = "America/Argentina/Buenos_Aires";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }); // YYYY-MM-DD local
const hhmm = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const LOG_MAX = 8;

// Commits y PRs reales de raw_events. Sin datos de GitHub, cae al día de ejemplo.
// ponytail: reuniones, sueño y ánimo siguen de ejemplo hasta que entren Calendar (Joaco) y Google Health/ánimo (Renzo).
export function getWorkDay(userId: string): WorkDay {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .select()
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "github"), gte(rawEvents.ts, since)))
    .orderBy(desc(rawEvents.ts))
    .all();
  if (rows.length === 0) return EXAMPLE_DAY;

  const log: WorkLogEntry[] = [];
  for (const r of rows) {
    if (log.length >= LOG_MAX) break;
    const d = JSON.parse(r.json);
    if (r.kind === "commit") {
      const message = d.commit?.message?.split("\n")[0] ?? "";
      log.push({ type: "commit", time: hhmm.format(new Date(r.ts)), message, additions: 0, deletions: 0 });
    } else if (r.kind === "pr") {
      log.push({ type: "pr", title: `PR #${d.number} ${(d.merged_at ?? d.pull_request?.merged_at) ? "mergeado" : d.state}` });
    }
  }

  // Últimos 7 días, de hace 6 días a hoy, en hora local.
  const days = Array.from({ length: 7 }, (_, i) => dayKey.format(new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000)));
  const commitsPerDay = days.map((day) => rows.filter((r) => r.kind === "commit" && dayKey.format(new Date(r.ts)) === day).length);

  return {
    ...EXAMPLE_DAY,
    log,
    commits: commitsPerDay[6],
    week: { ...EXAMPLE_DAY.week, commits: commitsPerDay },
    isExample: false,
  };
}

const EXAMPLE_DAY: WorkDay = {
    log: [
      { type: "commit", time: "14:02", message: "feat: scaffold base", additions: 412, deletions: 0 },
      { type: "commit", time: "12:30", message: "docs: CLAUDE.md", additions: 88, deletions: 0 },
      { type: "pr", title: "PR #3 mergeado · 1 review" },
      { type: "commit", time: "11:15", message: "fix: cookie usuario", additions: 6, deletions: 2 },
      { type: "commit", time: "10:40", message: "chore: shadcn init", additions: 903, deletions: 0 },
    ],
    commits: 9,
    meetingSlots: [[3, 6], [18, 20]],
    week: {
      sleepMin: [402, 431, 352, 470, 410, 440, 432],
      commits: [6, 5, 3, 11, 4, 7, 9],
      mood: [3, 3, 2, 5, 3, 4, 4],
    },
    daysOfData: 34,
    isExample: true,
};

// Exist.io pide 21 días antes de mostrar una correlación; usamos el mismo umbral.
export const MIN_DAYS_FOR_CORRELATION = 21;

/** Confianza 1..5 según cuántos días hay (separada de la fuerza de la relación, como Exist.io). */
export function confidenceStars(days: number): number {
  if (days < MIN_DAYS_FOR_CORRELATION) return 0;
  return Math.min(5, 2 + Math.floor((days - MIN_DAYS_FOR_CORRELATION) / 14));
}

export function meetingMinutes(slots: readonly [number, number][]): number {
  return slots.reduce((sum, [a, b]) => sum + (b - a) * 20, 0);
}
