import "server-only";
import { and, eq, gte, ne } from "drizzle-orm";
import { moodFace, sparkline } from "@/lib/ascii";
import { db, rawEvents } from "@/lib/db";
import { EXAMPLE_WRAPPED, type WrappedHighlight, type WrappedRow } from "@/lib/week";

// Semana Wrapped con datos reales de raw_events, con la misma forma que EXAMPLE_WRAPPED.
// Solo entra lo que tiene datos: no se mezclan números de ejemplo con reales (la consigna de rotular ejemplos).
// ponytail: sueño entra cuando se lea google_health (Renzo ya lo ingesta).

export type Wrapped = {
  week: number;
  archetype: { name: string; why: string };
  rows: WrappedRow[];
  bestDay: { name: string; lines: string[] };
  highlights: WrappedHighlight[];
  isExample: boolean;
};

const TZ = "America/Argentina/Buenos_Aires";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const weekday = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, weekday: "long" });
const localHour = (t: number) => Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(t));
const DAY = 24 * 60 * 60 * 1000;

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function getWrapped(userId: string, now = new Date()): Wrapped {
  const rows = db
    .select({ source: rawEvents.source, kind: rawEvents.kind, ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), gte(rawEvents.ts, new Date(now.getTime() - 7 * DAY).toISOString()), ne(rawEvents.source, "digest")))
    .all()
    .map((r) => ({ ...r, t: Date.parse(r.ts), day: dayKey.format(Date.parse(r.ts)) }));
  if (rows.length === 0) return EXAMPLE_WRAPPED;

  const days = Array.from({ length: 7 }, (_, i) => dayKey.format(now.getTime() - (6 - i) * DAY));
  const perDay = (pick: (r: (typeof rows)[number]) => boolean) => days.map((d) => rows.filter((r) => r.day === d && pick(r)).length);

  const isCommit = (r: (typeof rows)[number]) => r.source === "github" && r.kind === "commit";
  const commits = rows.filter(isCommit);
  const commitsPerDay = perDay(isCommit);
  const nightCommits = commits.filter((r) => localHour(r.t) < 6).length;
  const messages = rows.filter((r) => r.source === "slack");
  const messagesPerDay = perDay((r) => r.source === "slack");
  const issuesDone = rows.filter((r) => r.source === "linear" && r.kind === "issue_completed").length;
  const issuesOpened = rows.filter((r) => r.source === "linear" && r.kind === "issue_created").length;
  const meals = rows.filter((r) => r.source === "meal");
  const isMeeting = (r: (typeof rows)[number]) => r.source === "calendar" && r.t <= now.getTime() && !JSON.parse(r.json).allDay;
  const meetings = rows.filter(isMeeting);
  const meetingsPerDay = perDay(isMeeting);
  const moods = rows.filter((r) => r.source === "mood").map((r) => ({ day: r.day, mood: Number(JSON.parse(r.json).mood) }));
  const moodAvg = moods.length ? moods.reduce((s, m) => s + m.mood, 0) / moods.length : null;

  const best = days.reduce((a, d, i) => (commitsPerDay[i] > commitsPerDay[days.indexOf(a)] ? d : a), days[6]);
  const bestIdx = days.indexOf(best);
  const bestMood = moods.filter((m) => m.day === best).at(-1)?.mood;

  // Identidad antes que números (como Spotify/Oura): el rasgo más marcado de la semana.
  const archetype =
    nightCommits >= 2
      ? { name: "Búho de merges", why: `${plural(nightCommits, "commit")} de tus ${commits.length} fueron entre la medianoche y las 6` }
      : messages.length > commits.length * 3
        ? { name: "Hilo infinito", why: `${plural(messages.length, "mensaje")} en Slack contra ${plural(commits.length, "commit")}` }
        : meetings.length > commits.length
          ? { name: "Agenda llena", why: `${plural(meetings.length, "reunión", "reuniones")} contra ${plural(commits.length, "commit")}` }
        : issuesDone >= 3
          ? { name: "Cierra-tickets", why: `${plural(issuesDone, "issue")} terminados en Linear` }
          : { name: "Ritmo constante", why: `${plural(commits.length, "commit")} repartidos en ${plural(commitsPerDay.filter(Boolean).length, "día")}` };

  const wrappedRows: WrappedRow[] = [];
  if (commits.length) wrappedRows.push({ label: "commits", value: String(commits.length), spark: sparkline(commitsPerDay), kind: "work" });
  if (messages.length) wrappedRows.push({ label: "slack", value: String(messages.length), spark: sparkline(messagesPerDay), kind: "work" });
  if (issuesOpened + issuesDone) wrappedRows.push({ label: "issues", value: String(issuesOpened), note: `${issuesDone} cerrados`, kind: "work" });
  if (meetings.length) wrappedRows.push({ label: "reuniones", value: String(meetings.length), spark: sparkline(meetingsPerDay), kind: "work" });
  if (meals.length) wrappedRows.push({ label: "comidas", value: String(meals.length), kind: "food" });
  if (moodAvg !== null) wrappedRows.push({ label: "ánimo", value: moodFace(Math.round(moodAvg)), note: `${moodAvg.toFixed(1)} / 5`, kind: "mood" });

  const highlights: WrappedHighlight[] = [];
  if (commits.length) {
    highlights.push({
      id: "commits",
      kind: "work",
      big: String(commits.length),
      label: "commits",
      spark: sparkline(commitsPerDay),
      caption: `Tu mejor día fue el ${weekday.format(Date.parse(`${best}T12:00:00-03:00`))}: ${plural(commitsPerDay[bestIdx], "commit")}.`,
    });
  }
  if (nightCommits) {
    highlights.push({
      id: "noche",
      kind: "sleep",
      big: String(nightCommits),
      label: nightCommits === 1 ? "commit de madrugada" : "commits de madrugada",
      spark: sparkline(perDay((r) => isCommit(r) && localHour(r.t) < 6)),
      caption: "Entre la medianoche y las 6. Correlación, no causa, pero tu sueño se entera.",
    });
  }
  if (messages.length) {
    highlights.push({
      id: "slack",
      kind: "work",
      big: String(messages.length),
      label: "mensajes en Slack",
      spark: sparkline(messagesPerDay),
      caption: "Contamos cuándo, nunca qué: el contenido no sale de Slack.",
    });
  }
  if (moodAvg !== null) {
    highlights.push({
      id: "animo",
      kind: "mood",
      big: moodAvg.toFixed(1),
      label: "ánimo promedio",
      spark: sparkline(days.map((d) => moods.filter((m) => m.day === d).at(-1)?.mood ?? 0)),
      caption: `${plural(moods.length, "check-in")} esta semana.`,
    });
  }

  return {
    week: isoWeek(now),
    archetype,
    rows: wrappedRows,
    bestDay: {
      name: weekday.format(Date.parse(`${best}T12:00:00-03:00`)),
      lines: [
        `${plural(commitsPerDay[bestIdx], "commit")} · ${plural(meetingsPerDay[bestIdx], "reunión", "reuniones")}`,
        bestMood ? `ánimo ${moodFace(bestMood)}` : "",
      ].filter(Boolean),
    },
    highlights,
    isExample: false,
  };
}
