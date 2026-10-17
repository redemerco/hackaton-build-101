import "server-only";
import { and, asc, eq, gte } from "drizzle-orm";
import { db, rawEvents } from "@/lib/db";
import type { UserId } from "@/lib/users";

// Lecturas para la pantalla Trabajo de lo que ya ingestan lib/sources/linear.ts y slack.ts (Joaco). Solo lectura.
const TZ = "America/Montevideo";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const hourOf = new Intl.DateTimeFormat("es-UY", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" });
const hhmm = new Intl.DateTimeFormat("es-UY", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** "Fuera de horario" = desde las 20 o antes de las 8 (las ventanas de PagerDuty, simplificadas). */
const AFTER_HOURS_FROM = 20;
const AFTER_HOURS_TO = 8;
const MAX_ISSUES = 4;

export type LinearIssue = { id: string; title: string; state: string };
export type LinearWeek = { created: number; started: number; completed: number; inProgress: LinearIssue[]; hasData: boolean };

/** Issues de Linear de los últimos 7 días: cuántos se crearon, empezaron y completaron, y cuáles siguen en curso. */
export function getLinearWeek(userId: UserId, now = new Date()): LinearWeek {
  const rows = db
    .select({ kind: rawEvents.kind, json: rawEvents.json, ts: rawEvents.ts })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "linear"), gte(rawEvents.ts, new Date(now.getTime() - WEEK_MS).toISOString())))
    .orderBy(asc(rawEvents.ts))
    .all();
  const count = (kind: string) => rows.filter((r) => r.kind === kind).length;

  // último estado conocido de cada issue
  const latest = new Map<string, LinearIssue & { type: string }>();
  for (const r of rows) {
    const d = JSON.parse(r.json) as { identifier?: string; title?: string; state?: { name?: string; type?: string } };
    if (!d.identifier) continue;
    latest.set(d.identifier, { id: d.identifier, title: d.title ?? "", state: d.state?.name ?? "", type: d.state?.type ?? "" });
  }
  const inProgress = [...latest.values()].filter((i) => i.type === "started").slice(-MAX_ISSUES).reverse();

  return { created: count("issue_created"), started: count("issue_started"), completed: count("issue_completed"), inProgress, hasData: rows.length > 0 };
}

export type SlackToday = {
  messages: number;
  first: string | null;
  last: string | null;
  byHour: number[];           // 24 valores, mensajes por hora de hoy
  afterHoursWeek: number[];   // 7 valores (de hace 6 días a hoy): mensajes fuera de horario
  afterHoursToday: number;
  hasData: boolean;
};

const isAfterHours = (h: number) => h >= AFTER_HOURS_FROM || h < AFTER_HOURS_TO;

/** Actividad en Slack (solo horarios, nunca contenido): hoy por hora y fuera de horario en la semana. */
export function getSlackToday(userId: UserId, now = new Date()): SlackToday {
  const rows = db
    .select({ ts: rawEvents.ts })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "slack"), gte(rawEvents.ts, new Date(now.getTime() - WEEK_MS).toISOString())))
    .orderBy(asc(rawEvents.ts))
    .all()
    .map((r) => new Date(r.ts));

  const today = dayKey.format(now);
  const todays = rows.filter((d) => dayKey.format(d) === today);
  const byHour = Array.from({ length: 24 }, (_, h) => todays.filter((d) => Number(hourOf.format(d)) === h).length);
  const days = Array.from({ length: 7 }, (_, i) => dayKey.format(new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000)));
  const afterHoursWeek = days.map((k) => rows.filter((d) => dayKey.format(d) === k && isAfterHours(Number(hourOf.format(d)))).length);

  return {
    messages: todays.length,
    first: todays.length ? hhmm.format(todays[0]) : null,
    last: todays.length ? hhmm.format(todays[todays.length - 1]) : null,
    byHour,
    afterHoursWeek,
    afterHoursToday: afterHoursWeek[6],
    hasData: rows.length > 0,
  };
}
