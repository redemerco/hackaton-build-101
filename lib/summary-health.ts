import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { formatDuration } from "@/lib/ascii";
import { getLastNight, getMealsToday, minutesByStage } from "@/lib/body";
import { db, rawEvents } from "@/lib/db";
import { formatRange } from "@/lib/meals";
import { dayInputs, scoresFor } from "@/lib/ranking";
import { mean } from "@/lib/score";
import type { SummaryCount } from "@/lib/summary";

// Resumen daily de salud (IA): "cómo venís hoy de cuerpo". Solo datos reales de HOY (día local Montevideo);
// lo simulado (scripts/seed-demo.mts) se rotula en el prompt. Lo consume /api/summary/health vía streamSummary.

const TZ = "America/Montevideo";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const hhmm = new Intl.DateTimeFormat("es-UY", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const DAY = 86400_000;
const BASELINE_DAYS = 14;
const HISTORY_DAYS = 21;

export const HEALTH_SYSTEM = `Sos build101, la observabilidad personal de un developer. Te paso cómo viene HOY su cuerpo.
Escribí en español rioplatense, cálido y directo, en 3 o 4 oraciones de texto plano: sin listas, negritas, títulos ni emojis.
- Cubrí sueño, recuperación (pulso en reposo y HRV contra SU típico de las últimas semanas, no contra la población), movimiento, comida, ánimo y el puntaje build101 del día.
- Citá números concretos de los datos.
- Son correlaciones, no causas. Nunca diagnostiques, ni des consejo médico, ni nombres enfermedades.
- Si falta una fuente, decilo en media oración; no inventes.
- Si hay varios check-ins de ánimo, contá cómo cambió durante el día.
- Cerrá con una sugerencia chica y concreta para lo que queda del día.`;

export function buildHealthPrompt(userId: string, now = Date.now()): { system: string; prompt: string; counts: SummaryCount[] } {
  const today = dayKey.format(now);
  const lines: string[] = [];

  const night = getLastNight(userId); // null = sin noche real (ya no hay noche de ejemplo)
  const hasNight = night !== null;
  if (night) {
    const st = night.stageMinutes ?? minutesByStage(night.stages);
    const asleep = st.deep + st.rem + st.light;
    lines.push(
      `Última noche: ${night.start} → ${night.end}, dormido ${formatDuration(asleep)} (profundo ${formatDuration(st.deep)}, REM ${formatDuration(st.rem)}, liviano ${formatDuration(st.light)}, despierto ${formatDuration(st.awake)})${night.isSimulated ? " [datos simulados]" : ""}.`,
    );
  }

  const { days, isSimulated } = dayInputs(userId, now - HISTORY_DAYS * DAY);
  const tag = isSimulated ? " [datos simulados]" : "";
  const day = days.get(today);
  const prior = Array.from({ length: BASELINE_DAYS }, (_, i) => days.get(dayKey.format(now - (i + 1) * DAY)));
  const typicalBpm = mean(prior.map((d) => d?.restingBpm));
  const typicalHrv = mean(prior.map((d) => d?.hrvMs));
  const vs = (typical: number | undefined, unit: string) => (typical ? ` (tu típico de ${BASELINE_DAYS} días: ${Math.round(typical)} ${unit})` : " (todavía sin típico propio)");
  if (day?.restingBpm) lines.push(`Pulso en reposo hoy: ${day.restingBpm} lpm${vs(typicalBpm, "lpm")}${tag}.`);
  if (day?.hrvMs) lines.push(`HRV hoy: ${Math.round(day.hrvMs)} ms${vs(typicalHrv, "ms")}${tag}.`);
  if (day?.azm !== undefined) lines.push(`Movimiento hoy: ${day.azm} minutos en zona activa${tag}.`);
  const heartDays = [...days.values()].filter((d) => d.restingBpm || d.hrvMs).length;

  const meals = getMealsToday(userId);
  if (meals.length) lines.push(`Comidas de hoy: ${meals.map((m) => `${m.time} ${m.title} (${formatRange(m.kcal)} kcal)`).join("; ")}.`);

  const moods = db
    .select({ ts: rawEvents.ts, json: rawEvents.json })
    .from(rawEvents)
    .where(and(eq(rawEvents.userId, userId), eq(rawEvents.source, "mood"), gte(rawEvents.ts, new Date(now - 36 * 60 * 60 * 1000).toISOString())))
    .orderBy(rawEvents.ts)
    .all()
    .filter((r) => dayKey.format(Date.parse(r.ts)) === today)
    .map((r) => `${hhmm.format(Date.parse(r.ts))} → ${JSON.parse(r.json).mood}`);
  if (moods.length) lines.push(`Check-ins de ánimo de hoy (1 = mal, 5 = muy bien): ${moods.join(", ")}.`);

  const score = scoresFor(userId, now).today;
  if (score) lines.push(`Puntaje build101 de hoy: ${score.score}/100${score.isPartial ? " (parcial: falta alguna parte)" : ""}${tag}.`);

  // Los modelos pesan más el cierre: lo último que pasó va al final para que se note el cambio en vivo.
  const lastMeal = meals.at(-1);
  if (lastMeal) lines.push(`Lo más reciente: a las ${lastMeal.time} comió ${lastMeal.title}.`);

  const prompt = lines.length
    ? `Datos de hoy (${today}):\n${lines.join("\n")}`
    : "No hay datos de hoy: decilo en una línea y sugerí sincronizar la Fitbit.";

  return {
    system: HEALTH_SYSTEM,
    prompt,
    counts: [
      { label: "noche", value: hasNight ? 1 : 0 },
      { label: "días con pulso/HRV", value: heartDays },
      { label: "comidas hoy", value: meals.length },
      { label: "check-ins hoy", value: moods.length },
      { label: "puntaje build101", value: score ? 1 : 0 },
    ],
  };
}

export const EXAMPLE_HEALTH_SUMMARY =
  "[ejemplo] Dormiste 6h40 y el pulso en reposo está en 61 lpm, dos arriba de tu típico. Llevás 2 comidas y el ánimo pasó de 3 a 4 después de almorzar. Correlación, no causa: aprovechá para caminar 10 minutos antes de la próxima reunión.";
