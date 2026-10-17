import "server-only";
import { and, count, eq, gte, max } from "drizzle-orm";
import { getConnection, getConnectionStatus } from "@/lib/connections";
import { db, rawEvents } from "@/lib/db";
import type { UserId } from "@/lib/users";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type SourceId = "github" | "linear" | "slack" | "calendar" | "health";

export type SourceOverview = {
  id: SourceId;
  name: string;
  reads: string;          // qué leemos
  never: string;          // qué nunca leemos (la promesa anti-bossware, a la vista)
  connect: "oauth" | "login" | "pending"; // login: viene con el "Iniciar sesión con Google" de la entrada
  owner?: string;         // quién lo está construyendo, si todavía no existe
  configured: boolean;    // el server tiene el CLIENT_ID para arrancar el login
  account: string | null; // "conectado como …"
  lastEventAt: string | null;
  events7d: number;
};

const SOURCES: Omit<SourceOverview, "configured" | "account" | "lastEventAt" | "events7d">[] = [
  { id: "github", name: "GitHub", reads: "commits, PRs y reviews, con su hora", never: "el código", connect: "oauth" },
  { id: "linear", name: "Linear", reads: "issues creados, empezados y cerrados", never: "comentarios", connect: "oauth" },
  { id: "slack", name: "Slack", reads: "cuántos mensajes mandás y a qué hora", never: "el texto, los canales ni con quién", connect: "oauth" },
  { id: "health", name: "Google Health", reads: "sueño por etapas (Fitbit)", never: "nada sale de tu cuenta", connect: "login" },
  { id: "calendar", name: "Google Calendar", reads: "cuántas reuniones y cuándo", never: "títulos ni invitados", connect: "oauth" },
];

// en raw_events cada fuente se guarda con este `source`
const RAW_SOURCE: Record<SourceId, string> = { github: "github", linear: "linear", slack: "slack", calendar: "calendar", health: "google" };

/** Estado de cada fuente para el usuario actual: conexión, configuración y frescura de los datos. */
export function getSourcesOverview(userId: UserId, now = new Date()): SourceOverview[] {
  const status = getConnectionStatus(userId);
  const configured: Record<SourceId, boolean> = {
    github: Boolean(process.env.GITHUB_CLIENT_ID),
    linear: Boolean(process.env.LINEAR_CLIENT_ID),
    slack: Boolean(process.env.SLACK_CLIENT_ID),
    calendar: Boolean(process.env.CALENDAR_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID),
    health: false,
  };
  const since = new Date(now.getTime() - WEEK_MS).toISOString();

  return SOURCES.map((s) => {
    const source = RAW_SOURCE[s.id];
    const last = db.select({ ts: max(rawEvents.ts) }).from(rawEvents).where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, source))).get();
    const week = db
      .select({ n: count() })
      .from(rawEvents)
      .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, source), gte(rawEvents.ts, since)))
      .get();
    const account =
      s.id === "github" || s.id === "linear" || s.id === "slack" || s.id === "calendar" ? status[s.id] : s.id === "health" ? (getConnection(userId, "google")?.account ?? null) : null;
    return { ...s, configured: configured[s.id], account, lastEventAt: last?.ts ?? null, events7d: week?.n ?? 0 };
  });
}
