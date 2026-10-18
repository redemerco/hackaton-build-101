import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { formatDuration } from "@/lib/ascii";
import { db, rawEvents } from "@/lib/db";

// Nudge contextual: se calcula de datos reales (racha de trabajo sin cortar + hora + próxima reunión) y lo dispara un botón
// (sin cron). Texto determinístico a propósito: en vivo no depende de la IA ni del wifi.
// ponytail: cuando Renzo ingeste pasos de google_health, "sin cortar" pasa a ser "sin moverte" con los pasos reales.

export type Nudge = { title: string; body: string };

const TZ = "America/Argentina/Buenos_Aires";
const hhmm = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const localHour = (d: Date) => Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(d));

const WORK_SOURCES = ["github", "slack", "linear"];
const BREAK_MIN = 45; // un hueco más largo que esto corta la racha
const LONG_STREAK_MIN = 90;
const MIN = 60_000;

// Calendar guarda solo horarios (sin título ni invitados): ver lib/sources/calendar.ts.
type Meeting = { start: string; allDay?: boolean };

const freeTime = (min: number) => (min < 60 ? `${min} min` : formatDuration(min));

export function getNudge(userId: string, now = new Date()): Nudge | null {
  const since = new Date(now.getTime() - 12 * 60 * MIN).toISOString();
  const events = db
    .select({ source: rawEvents.source, kind: rawEvents.kind, ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), gte(rawEvents.ts, since), inArray(rawEvents.source, [...WORK_SOURCES, "calendar"])))
    .orderBy(rawEvents.ts)
    .all();

  const work = events.filter((e) => WORK_SOURCES.includes(e.source)).map((e) => ({ ...e, t: Date.parse(e.ts) }));
  if (work.length === 0) return null;

  // Racha actual: desde el último evento hacia atrás, mientras no haya un hueco de más de BREAK_MIN.
  const last = work[work.length - 1];
  const isWorkingNow = now.getTime() - last.t < BREAK_MIN * MIN;
  let start = last;
  for (let i = work.length - 2; i >= 0 && start.t - work[i].t < BREAK_MIN * MIN; i--) start = work[i];
  const streak = work.filter((e) => e.t >= start.t);
  const streakMin = Math.round((now.getTime() - start.t) / MIN);
  const commits = streak.filter((e) => e.kind === "commit").length;
  const messages = streak.filter((e) => e.source === "slack").length;
  const what = [commits && `${commits} commit${commits > 1 ? "s" : ""}`, messages && `${messages} mensaje${messages > 1 ? "s" : ""}`]
    .filter(Boolean)
    .join(" y ");

  const next = events
    .filter((e) => e.source === "calendar")
    .map((e) => JSON.parse(e.json) as Meeting)
    .filter((m) => !m.allDay)
    .map((m) => ({ ...m, t: Date.parse(m.start) }))
    .find((m) => m.t > now.getTime() && m.t - now.getTime() < 3 * 60 * MIN);
  const gap = next ? ` y tenés ${freeTime(Math.round((next.t - now.getTime()) / MIN))} libres antes de tu próxima reunión` : "";

  const hour = localHour(now);
  if (isWorkingNow && hour < 6) {
    return {
      title: "build101 · son las " + hhmm.format(now),
      body: `Llevás ${formatDuration(streakMin)} sin cortar${what ? ` (${what})` : ""}. El código va a seguir ahí mañana; tu sueño de hoy no. Cortá acá.`,
    };
  }
  if (isWorkingNow && streakMin >= LONG_STREAK_MIN) {
    return {
      title: "build101",
      body: `Llevás ${formatDuration(streakMin)} sin cortar${what ? ` (${what})` : ""}${gap}. Caminá 10 minutos.`,
    };
  }
  const todayCommits = work.filter((e) => e.kind === "commit").length;
  return {
    title: "build101",
    body: `Arrancaste a las ${hhmm.format(new Date(work[0].t))} y llevás ${todayCommits} commit${todayCommits === 1 ? "" : "s"}${gap}. Buen momento para estirar y tomar agua.`,
  };
}
