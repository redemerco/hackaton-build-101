import "server-only";
import type { Cross } from "@/lib/cross";
import { fmtMin } from "@/lib/insights";
import { getCachedSummary, type SummaryCount } from "@/lib/summary";
import type { Today } from "@/lib/today";

// Resumen daily de Yo: cómo venís hoy en cuerpo y trabajo. NO relee raw_events: usa los resúmenes de Salud y
// Trabajo ya generados, los números del día y los cruces de lib/insights que pasaron sus umbrales.
export const ME_SYSTEM = `Sos build101, la observabilidad personal de un developer. Te paso hechos YA calculados de su día y cruces entre su cuerpo y su trabajo que ya pasaron un control estadístico.
Escribí en español rioplatense, cálido y directo, como un compañero que mira tus métricas.
- Exactamente 3 oraciones, texto plano: sin listas, negritas, títulos ni emojis.
- 1ª: cómo viene hoy (cuerpo y trabajo juntos). 2ª: el cruce más importante de la lista, con su número y cuántos días lo respaldan. 3ª: una sola cosa chica y concreta para hoy, que la persona controle.
- Usá SOLO los números que te paso. No inventes cruces ni causas: son coincidencias en sus datos ("coincide con", nunca "te causa").
- Si un cruce está marcado como hipótesis, decilo ("en tus datos, aunque no hay estudios").
- Nunca diagnostiques ni nombres enfermedades. Si faltan datos, decilo en media oración.`;

/** Respaldo sin IA (se rotula "[sin IA]"): los mismos hechos y el cruce más fuerte, armados con plantilla. */
export function meFallback(today: Today, cross: Cross): string {
  const commits = cross.today.hours.reduce((n, h) => n + h.commits, 0);
  const meetingMin = cross.today.hours.reduce((n, h) => n + h.meetingMin, 0);
  const day = [
    today.sleepMin !== null ? `Dormiste ${fmtMin(today.sleepMin)}` : null,
    commits ? `llevás ${commits} commit${commits === 1 ? "" : "s"}` : null,
    meetingMin ? `${fmtMin(meetingMin)} de reuniones` : null,
  ].filter(Boolean);
  const top = cross.insights[0];
  return `${day.length ? `${day.join(", ")}. ` : ""}${top ? `${top.text} ${top.tryThis}` : "Todavía no hay cruces con datos suficientes."}`;
}

export function buildMePrompt(userId: string, today: Today, cross: Cross, isSimulated = false): { system: string; prompt: string; counts: SummaryCount[] } {
  const health = getCachedSummary(userId, "health");
  const work = getCachedSummary(userId, "work");
  const hours = cross.today.hours;
  const commits = hours.reduce((n, h) => n + h.commits, 0);
  const meetingMin = hours.reduce((n, h) => n + h.meetingMin, 0);
  const azm = hours.reduce((n, h) => n + h.azm, 0);
  const peak = hours.reduce((best, h) => (h.commits > best.commits ? h : best), hours[0]);

  const facts = [
    today.sleepMin !== null ? `Durmió ${fmtMin(today.sleepMin)} anoche.` : "Sin dato de sueño de anoche.",
    today.restingBpm !== null ? `Pulso en reposo ${today.restingBpm} lpm${today.restingTypical ? ` (su típico ${today.restingTypical[0]}–${today.restingTypical[1]})` : ""}.` : null,
    today.hrvMs !== null ? `HRV ${today.hrvMs} ms${today.hrvTypical ? ` (típico ${today.hrvTypical[0]}–${today.hrvTypical[1]})` : ""}.` : null,
    today.mood !== null ? `Ánimo de hoy: ${today.mood}/5.` : "Todavía no hizo el check-in de ánimo.",
    `Hoy: ${commits} commits${commits ? ` (pico a las ${peak.hour} h)` : ""}, ${fmtMin(meetingMin)} de reuniones, ${azm} min en zona activa.`,
  ].filter(Boolean);

  const crosses = cross.insights.slice(0, 3).map((i) => `- ${i.text} [${i.basis}; ${i.isHypothesis ? "hipótesis" : `respaldo: ${i.evidence}`}] Prueba sugerida: ${i.tryThis}`);
  const prompt = [
    isSimulated ? "Ojo: estos datos son SIMULADOS para una demo; decilo en media oración al final." : null,
    `Hechos de hoy:\n${facts.join("\n")}`,
    crosses.length ? `Cruces que pasaron el control (de más a menos fuerte):\n${crosses.join("\n")}` : "Todavía no hay cruces con datos suficientes: decilo y no inventes ninguno.",
    health ? `Resumen de salud de hoy (lo escribió otra IA con sus datos):\n${health.text}` : null,
    work ? `Resumen de trabajo de hoy:\n${work.text}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    system: ME_SYSTEM,
    prompt,
    counts: [
      { label: today.sleepMin !== null ? "noche" : "noches", value: today.sleepMin !== null ? 1 : 0 },
      { label: "commits", value: commits },
      { label: "min de reunión", value: meetingMin },
      { label: cross.insights.length === 1 ? "cruce" : "cruces", value: cross.insights.length },
      { label: "resumen de salud", value: health ? 1 : 0 },
      { label: "resumen de trabajo", value: work ? 1 : 0 },
    ],
  };
}
