import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { formatDuration } from "@/lib/ascii";
import { getLastNight, getMealsToday, minutesByStage } from "@/lib/body";
import { db, rawEvents } from "@/lib/db";
import type { UserId } from "@/lib/users";
import { getLinearWeek, getSlackToday } from "@/lib/work-signals";

// Tools de lectura: cada una responde UNA pregunta concreta sobre los datos de las apps conectadas del usuario
// (ya ingestados en raw_events). Nombre + descripción + run() → listas para function calling de Gemini.
// Solo lectura, solo el usuario actual. null = esa fuente no tiene datos.

export type Tool = { name: string; source: string; description: string; run: (userId: UserId) => unknown };

const TZ = "America/Montevideo";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const hhmm = new Intl.DateTimeFormat("es-UY", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const DAY = 86400_000;

/** Eventos de hoy (día local) de una fuente, del más viejo al más nuevo. */
function today(userId: string, source: string, kind?: string) {
  const conds = [eq(rawEvents.userId, userId), eq(rawEvents.source, source), gte(rawEvents.ts, new Date(Date.now() - 1.5 * DAY).toISOString())];
  if (kind) conds.push(eq(rawEvents.kind, kind));
  const key = dayKey.format(Date.now());
  return db
    .select({ ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(...conds))
    .orderBy(rawEvents.ts)
    .all()
    .filter((r) => dayKey.format(Date.parse(r.ts)) === key)
    .map((r) => ({ time: hhmm.format(Date.parse(r.ts)), data: JSON.parse(r.json) as Record<string, unknown> }));
}

/** Último evento de una fuente/kind, o null. */
function latest(userId: string, source: string, kind: string) {
  const row = db
    .select({ ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, source), eq(rawEvents.kind, kind)))
    .orderBy(desc(rawEvents.ts))
    .get();
  return row ? { ts: row.ts, data: JSON.parse(row.json) as Record<string, unknown> } : null;
}

export const TOOLS: Tool[] = [
  {
    name: "ultima_noche",
    source: "google",
    description: "Última noche de sueño del wearable: hora de inicio y fin, tiempo dormido y minutos por etapa.",
    run: (userId) => {
      const n = getLastNight(userId);
      if (!n) return null;
      const st = n.stageMinutes ?? minutesByStage(n.stages);
      return {
        inicio: n.start,
        fin: n.end,
        dormido: formatDuration(st.deep + st.rem + st.light),
        etapas: { profundo: st.deep, rem: st.rem, liviano: st.light, despierto: st.awake },
        simulada: n.isSimulated === true,
      };
    },
  },
  {
    name: "pulso_y_hrv",
    source: "google",
    description: "Último pulso en reposo (lpm) y última variabilidad cardíaca HRV (ms) registrados por el wearable.",
    run: (userId) => {
      const hr = latest(userId, "google", "resting_hr");
      const hrv = latest(userId, "google", "hrv");
      if (!hr && !hrv) return null;
      const bpm = Number((hr?.data.dailyRestingHeartRate as Record<string, unknown> | undefined)?.beatsPerMinute);
      const ms = Number((hrv?.data.dailyHeartRateVariability as Record<string, unknown> | undefined)?.averageHeartRateVariabilityMilliseconds);
      return {
        pulsoReposo: bpm > 0 ? { lpm: bpm, dia: hr!.ts.slice(0, 10) } : null,
        hrv: ms > 0 ? { ms: Math.round(ms), dia: hrv!.ts.slice(0, 10) } : null,
      };
    },
  },
  {
    name: "comidas_hoy",
    source: "meal",
    description: "Comidas fotografiadas y guardadas hoy: hora, qué tenía y rango de calorías.",
    run: (userId) => {
      const meals = getMealsToday(userId);
      return meals.length ? meals : null;
    },
  },
  {
    name: "animo_hoy",
    source: "mood",
    description: "Check-ins de ánimo de hoy (1 = mal, 5 = muy bien) con su hora, para ver cómo cambió en el día.",
    run: (userId) => {
      const moods = today(userId, "mood").map((m) => ({ hora: m.time, animo: m.data.mood }));
      return moods.length ? moods : null;
    },
  },
  {
    name: "commits_hoy",
    source: "github",
    description: "Commits de hoy en GitHub: cuántos, a qué hora y el mensaje de cada uno.",
    run: (userId) => {
      const commits = today(userId, "github", "commit").map((c) => ({
        hora: c.time,
        mensaje: String((c.data.commit as Record<string, unknown> | undefined)?.message ?? "").split("\n")[0],
      }));
      return commits.length ? { total: commits.length, commits } : null;
    },
  },
  {
    name: "linear_semana",
    source: "linear",
    description: "Issues de Linear de los últimos 7 días: creados, empezados, terminados y cuáles siguen en curso.",
    run: (userId) => {
      const w = getLinearWeek(userId);
      return w.hasData ? { creados: w.created, empezados: w.started, terminados: w.completed, enCurso: w.inProgress } : null;
    },
  },
  {
    name: "slack_hoy",
    source: "slack",
    description: "Actividad en Slack hoy (solo horarios, nunca contenido): cuántos mensajes, primero, último y fuera de horario.",
    run: (userId) => {
      const s = getSlackToday(userId);
      return s.hasData ? { mensajes: s.messages, primero: s.first, ultimo: s.last, fueraDeHorario: s.afterHoursToday } : null;
    },
  },
  {
    name: "reuniones_hoy",
    source: "calendar",
    description: "Reuniones de hoy del calendario (solo horarios, sin título ni invitados): inicio, fin y duración.",
    run: (userId) => {
      const events = today(userId, "calendar", "event")
        .filter((e) => !e.data.allDay)
        .map((e) => ({ inicio: e.time, fin: e.data.end ? hhmm.format(Date.parse(String(e.data.end))) : null, minutos: e.data.durationMin }));
      return events.length ? events : null;
    },
  },
];

export function runTool(name: string, userId: UserId): { name: string; source: string; result: unknown } | null {
  const tool = TOOLS.find((t) => t.name === name);
  return tool ? { name: tool.name, source: tool.source, result: tool.run(userId) } : null;
}
