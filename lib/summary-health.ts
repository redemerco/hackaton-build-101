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
// lo simulado (el viejo seed de demo) se rotula en el prompt. Lo consume /api/summary/health vía streamSummary.

const TZ = "America/Montevideo";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const hhmm = new Intl.DateTimeFormat("es-UY", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const DAY = 86400_000;
const BASELINE_DAYS = 14;
const HISTORY_DAYS = 21;

export const HEALTH_SYSTEM = `Sos build101: le contás a un developer cómo viene HOY su cuerpo.
Escribí EXACTAMENTE 3 oraciones, máximo 55 palabras en total, en español rioplatense, texto plano (sin listas, negritas ni emojis):
1. Cómo durmió y cómo está su recuperación, con números (pulso y HRV contra SU típico, no contra la población).
2. Lo más reciente de hoy: la última comida y, si hay varios check-ins, cómo cambió el ánimo.
3. Una sugerencia concreta para lo que queda del día, con hora o duración ("caminá 10 minutos antes de las 16").
Correlación, no causa. Prohibido: elogios, relleno, diagnósticos o consejo médico. Si falta una fuente, mencionalo una sola vez y en pocas palabras; nunca inventes.`;

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
  if (score) lines.push(`Recuperación de hoy (0–100): ${score.score}/100${score.isPartial ? " (parcial: falta alguna parte)" : ""}${tag}.`);

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
      { label: "recuperación del día", value: score ? 1 : 0 },
    ],
  };
}

// Respaldo sin IA: no inventa números (un ejemplo con cifras contradecía las tarjetas reales de la pantalla).
export const EXAMPLE_HEALTH_SUMMARY =
  "La IA no respondió ahora y todavía no hay un resumen guardado. Tus datos de abajo son reales; tocá ↻ para intentar de nuevo.";
