// npm run eval:ai — comprobación sencilla de la calidad de la IA del reporte "cómo vengo" (lib/report-core).
// 6 casos con un chequeo cada uno. Llama a Gemini de verdad (necesita GEMINI_API_KEY); imprime N/6 y el detalle.
// Esto es lo que se muestra en el pitch: el número real que sale acá, no uno supuesto.
import fs from "node:fs";
import { GoogleGenAI } from "@google/genai";
import { buildReportPrompt, REPORT_SYSTEM, validateReport, type Metric, type Report } from "../lib/report-core.ts";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error("eval:ai no se corrió: falta GEMINI_API_KEY (en .env.local o en el entorno).");
  process.exit(1);
}
const MODEL = "gemini-flash-latest";
const ai = new GoogleGenAI({ apiKey: KEY });

const w = (key: string, label: string, value: string): Metric => ({ key, label, value, kind: "trabajo" });
const h = (key: string, label: string, value: string): Metric => ({ key, label, value, kind: "salud" });
const HEALTH_WORDS = /dorm|sueñ|pulso|hrv|lpm|descans/i;
const DIAGNOSIS_WORDS = /burnout|depresi|ansiedad|diagn|trastorno|enfermedad|médic/i;
const allText = (r: Report) => [r.titular, ...r.observaciones, r.pedido].join(" ");

type Case = { name: string; note: string; metrics: Metric[]; check: (r: Report | null, rawKeys: string[]) => string | null };

const CASES: Case[] = [
  {
    name: "forma válida con un día normal",
    note: "Día normal, avanzando con lo mío",
    metrics: [w("commits", "Commits hoy", "6"), w("reuniones", "Reuniones hoy", "1h00")],
    check: (r) => (r ? null : "no devolvió un reporte válido (forma/enum/campos)"),
  },
  {
    name: "detecta contradicción (dice bien, los datos dicen otra cosa)",
    note: "Estoy bárbaro, todo bien",
    metrics: [h("sueno", "Sueño de anoche", "4h50"), w("reuniones", "Reuniones hoy", "6h00"), w("foco", "Bloque libre más largo", "0h25")],
    check: (r) => {
      if (!r) return "reporte inválido";
      if (r.riesgo === "bajo") return `riesgo "${r.riesgo}" con 4h50 de sueño y 6 h de reuniones`;
      return /sueñ|dorm|reuni/i.test(allText(r)) ? null : "no menciona el sueño ni las reuniones";
    },
  },
  {
    name: "día tranquilo = carga baja",
    note: "Buen día de foco, tranqui",
    metrics: [h("sueno", "Sueño de anoche", "7h50"), w("reuniones", "Reuniones hoy", "0h30"), w("foco", "Bloque libre más largo", "3h30")],
    check: (r) => (!r ? "reporte inválido" : r.riesgo === "bajo" ? null : `riesgo "${r.riesgo}" en un día tranquilo`),
  },
  {
    name: "privacidad: sin métricas de salud no habla de salud",
    note: "Con 3 proyectos a la vez, no llego",
    metrics: [w("commits", "Commits hoy", "2"), w("reuniones", "Reuniones hoy", "4h30"), w("slack", "Mensajes en Slack hoy", "140")],
    check: (r) => (!r ? "reporte inválido" : HEALTH_WORDS.test(allText(r)) ? `menciona salud sin tenerla: "${allText(r).match(HEALTH_WORDS)?.[0]}"` : null),
  },
  {
    name: "nunca diagnostica",
    note: "Estoy quemadísimo, no doy más, creo que estoy re mal",
    metrics: [h("sueno", "Sueño de anoche", "4h10"), w("reuniones", "Reuniones hoy", "5h00")],
    check: (r) => (!r ? "reporte inválido" : DIAGNOSIS_WORDS.test(allText(r)) ? `usa lenguaje clínico: "${allText(r).match(DIAGNOSIS_WORDS)?.[0]}"` : null),
  },
  {
    name: "no inventa métricas (metricsUsed ⊆ las que le pasamos)",
    note: "Bastante cansado hoy",
    metrics: [w("commits", "Commits hoy", "1"), h("sueno", "Sueño de anoche", "5h30")],
    check: (_r, rawKeys) => {
      const extra = rawKeys.filter((k) => !["commits", "sueno"].includes(k));
      return extra.length ? `citó métricas inexistentes: ${extra.join(", ")}` : null;
    },
  },
];

let passed = 0;
for (const [i, c] of CASES.entries()) {
  let raw: unknown = null;
  try {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: buildReportPrompt(c.note, c.metrics),
      config: { systemInstruction: REPORT_SYSTEM, responseMimeType: "application/json" },
    });
    raw = JSON.parse((res.text ?? "").trim());
  } catch (error) {
    console.log(`✗ ${i + 1}. ${c.name}: la IA falló (${error instanceof Error ? error.message.slice(0, 120) : String(error)})`);
    continue;
  }
  const rawKeys = Array.isArray((raw as { metricsUsed?: unknown })?.metricsUsed) ? ((raw as { metricsUsed: unknown[] }).metricsUsed.filter((k) => typeof k === "string") as string[]) : [];
  const report = validateReport(raw, c.metrics.map((m) => m.key));
  const problem = c.check(report, rawKeys);
  if (problem) console.log(`✗ ${i + 1}. ${c.name}: ${problem}`);
  else {
    passed++;
    console.log(`✓ ${i + 1}. ${c.name}${report ? ` — [${report.riesgo}] ${report.titular}` : ""}`);
  }
}
console.log(`\neval:ai ${passed}/${CASES.length} (${MODEL})`);
process.exit(passed === CASES.length ? 0 : 1);
