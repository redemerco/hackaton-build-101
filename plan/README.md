# Plan build101 — reestructura final (sáb 17-oct, noche → pitch dom 18-oct)

Reemplaza a los planes viejos (`PLAN.md`, `prompts/`, `docs/pantallas.md`), ya borrados del repo. Un archivo por persona: [`santi.md`](santi.md) · [`renzo.md`](renzo.md) · [`joaco.md`](joaco.md). Los planes son propuestas: cada uno decide qué incorpora, pero el **contrato** y el **orden del rename** no se discuten.

## Estado actual (lo que ya anda en `main`)

1. Login con Google = usuario + Fitbit (Google Health) real. Ingest de sueño (90 días), pulso en reposo, HRV y AZM (21 días) en `raw_events` `source: "google"`.
2. OAuth por usuario de GitHub, Linear, Slack y Calendar (token aparte, `calendar.events.readonly`). Ingests en `lib/sources/*` escriben `raw_events`; `/api/sync/<fuente>`.
3. Cámara → `/api/comer/analizar` (Gemini vision, JSON con rangos) → hoja con ítems y porciones. **La comida nunca se guarda** (`MealCamera.onSave` solo hace toast; no hay ningún `source: "meal"` escrito).
4. Check-in de ánimo real (`source: "mood"`). Nudge calculado real (`lib/nudge.ts`, `/api/nudge`), pero ninguna UI hace el `POST`.
5. Digest **semanal** en streaming con caché (`lib/digest.ts` + `/api/digest`), Wrapped con datos reales, ranking del equipo por puntaje build101 (`lib/score.ts`), `npm run seed:demo` rotulado `[datos simulados]`.
6. UI "vidrio sobre terminal" completa, compañero pixel art por usuario, push (VAPID) con toggle en Ajustes, pull-to-sync (solo github+health).
7. Pantallas: `/` Hoy · `/cuerpo` · `/comer` · `/trabajo` · `/semana` · `/semana/wrapped`. Tab bar con la cámara al centro.
8. Ejemplos que todavía se presentan como reales: `today.insight` fijo con rótulo `gemini` (`app/page.tsx:75`), pulso/HRV/pasos de ejemplo dentro de noches reales (`lib/body.ts` `parseNight`), `EXAMPLE_DAY.week.sleepMin/mood` mezclados con commits reales (`lib/work.ts`), `[ejemplo · falta Calendar]` estático en Trabajo aunque Calendar esté conectado.
9. "Pulso" sigue en `DIGEST_SYSTEM` y en los títulos del nudge. El producto se llama **build101**.
10. `/api/ingesta/procesar` (texto → digest, sin DB) y `/api/agent/read` (lectura con token) existen; nadie los usa en la UI.

## Nueva navegación

| Tab | Ruta | Qué tiene | Dueño |
|---|---|---|---|
| **Yo** | `/` | compañero + vitales, **gráfica cruzada trabajo × salud por hora**, **resumen daily Yo (IA)**, **acciones del agente** (mover reunión, bloquear foco, nudge) con confirmación | Santi (pantalla, gráfica, resumen) · Renzo (acciones) |
| **Salud** | `/salud` (ex `/cuerpo`) | sueño, pulso, HRV, movimiento, **cámara de comidas + comidas de hoy** (ex `/comer`), **resumen daily salud (IA)** | Joaco |
| **Trabajo** | `/trabajo` | git log, Linear, Slack, reuniones, **resumen daily trabajo (IA)** | Renzo |
| **Semana** | `/semana` + `/semana/wrapped` | digest semanal, ranking, Wrapped. **Queda como está**, solo polish | Joaco (digest/Wrapped) · Santi (ranking) |

Decisiones tomadas (una línea cada una):
- **Comer se funde en Salud**: la foto es un dato de salud más, y así el tab bar queda en 4 sin botón especial.
- **Tab bar: Yo · Salud · Trabajo · Semana**, 4 tabs iguales, sin cámara al centro (nota 1 del equipo).
- **El resumen de Yo no vuelve a leer `raw_events`**: consume los resúmenes cacheados de Salud y Trabajo + los números del día. Tres prompts, cero duplicación.
- **El nudge pasa a ser una acción del agente en Yo** ("mandarme el nudge ahora"): muere el botón oculto separado.
- **Ánimo queda en Yo** (ya es real; nadie lo toca).
- **El rename lo hace Santi solo, esta noche, en un commit** (`app/cuerpo → app/salud`, borrar `app/comer`, mover `<MealCamera>`, tab bar). Hasta que ese commit esté en `main`, Joaco no toca `app/cuerpo`/`app/salud`.

## Contrato compartido (lo que no se rompe)

Sigue vigente todo el **Contrato** del `README.md` (db, users, `lib/ai.ts`, push, componentes glass/ascii, conexiones, `raw_events` con `source/kind/ts/json`). Se agrega:

| Pieza | Firma / forma | Quién la publica | Cuándo |
|---|---|---|---|
| `lib/summary.ts` | `streamSummary({ userId, kind: "health" \| "work" \| "me", system, prompt, force? }): Response` (devolvelo directo desde el route). Guarda en `raw_events` `source: "summary"` `{ text, hash }`. **Mismo prompt = reusa el último sin llamar a Gemini** (ahorra cuota); el ↻ de `<Summary>` manda `?force=1` → el route lee `new URL(req.url).searchParams.has("force")` y lo pasa. Si Gemini falla re-tipea el último con `[cache · IA no disponible] ` (la UI lo rotula `[cache · IA caída]`); sin key ni caché responde 503 y el cliente tipea el `fallback` rotulado `[sin IA]`. `getCachedSummary(userId, kind): { text, ts, hash? } \| null`. | Santi | ✅ |
| `lib/ai.ts` | se agrega `generateJson<T>({ system, contents }): Promise<T>` (con el retry 503/429 que hoy está duplicado en `app/api/comer/analizar/route.ts` y `app/api/ingesta/procesar/route.ts`) | Santi | esta noche |
| Prompts | `lib/summary-health.ts` (Joaco), `lib/summary-work.ts` (Renzo), `lib/summary-me.ts` (Santi). Cada uno exporta `buildXPrompt(userId): { system, prompt, counts }`. `counts` = `{ label: string; n: number }[]` ("3 noches", "12 commits") y se muestra en la UI como **"datos usados"** (comprobación de calidad para la rúbrica). | cada uno | |
| Rutas | `POST /api/summary/health` (Joaco), `/api/summary/work` (Renzo), `/api/summary/me` (Santi). Mismo contrato que `/api/digest`: texto plano en streaming. `GET` devuelve `{ counts }`. | cada uno | |
| UI del resumen | `<Summary src="/api/summary/<kind>" fallback counts />` = `components/digest.tsx` generalizado (label, meta `gemini` / `[cache]` / `[ejemplo]`, botón Regenerar, pie "datos usados"). | Santi | esta noche |
| Comidas | se guardan en `raw_events` `source: "meal"`, `kind: "photo"`, `{ items, comment, totalKcal: [lo, hi] }` (ya lo lee `lib/today.ts` `mealMinutesAgo` y `lib/wrapped.ts`). | Joaco | |
| Datos por hora | `lib/hourly.ts` `getHourly(userId, date = hoy): HourBucket[24]` con `{ hour, commits, messages, meetingMin, azm, meals, mood? }` y `sleep: { startHour, endHour } \| null`. Es el insumo de la gráfica de Yo; Salud/Trabajo pueden reusarlo. | Santi | |
| Salud diaria | `dayInputs(userId, sinceMs)` de `lib/ranking.ts` pasa a exportarse (pulso en reposo, HRV, AZM, sueño por día). Nadie reparsea Google Health por su cuenta. | Santi | esta noche |
| Acciones del agente | `lib/agent.ts` `proposeActions(userId): Promise<AgentAction[]>` con `AgentAction = { id, type: "move_meeting" \| "block_focus" \| "send_nudge", eventId?, from?, to?, minutes?, reason, isSimulated }`; `runAction(userId, action)` solo desde el botón Confirmar. Calendar guarda `id` del evento (sin título) en `lib/sources/calendar.ts`. | Renzo | |
| Rótulos | Todo lo que no es dato real o IA real dice `[ejemplo]`, `[cache]` o `[simulado]` en pantalla. Nunca `gemini` sobre un texto fijo. | todos | |

Git: directo a `main`, commits chicos, `git pull --rebase` antes de cada push, nunca `--force`. Conflicto en archivo ajeno: conservás el cambio del otro y avisás.

## Prioridad y cortes

| Hora | Hito | Si no llega |
|---|---|---|
| **sáb 21:00** | Santi: rename + tab bar + `lib/summary.ts` + `<Summary>` en `main` | Joaco y Renzo arrancan por sus prompts (`lib/summary-*.ts`), que no dependen del rename |
| **sáb 02:00** | Los 3 resúmenes daily en streaming con caché; comidas guardadas; Calendar con `id` | Resumen que no esté → panel con `[ejemplo]`, no se demuestra |
| **dom 10:00** | Gráfica cruzada en Yo; acciones del agente proponiendo; comprobación de calidad ("datos usados") | Acciones sin Calendar write verificado → se ejecutan en seco y dicen `[simulado]` |
| **dom 13:00** | **FREEZE.** Solo fixes. Fitbit sincronizada, `npm run build` verde, Gemini key con cuota | Lo P1 que no esté se corta; P2 ni se abre |
| **dom 13:30 y 14:30** | 2 dry-runs cronometrados (el 2º con wifi cortado: todo re-tipea `[cache]`) | |

Orden de corte inverso: P2 de todos → acciones reales de Calendar (quedan `[simulado]`) → gráfica cruzada (queda la de 7 días de Trabajo) → resumen Yo (queda el de Salud en Yo).

## Guion de demo (3 min, nueva estructura)

| t | Beat | Pantalla | Fallback |
|---|---|---|---|
| 0:00 | Hook: "monitoreamos CPU y uptime de todo menos del developer. build101 es tu observabilidad: cuerpo y trabajo en el mismo gráfico". | Yo (teléfono de Santi, Fitbit real) | — |
| 0:20 | **Yo**: la gráfica por hora de hoy (commits, reuniones, movimiento, sueño) y el resumen Yo tipeándose en vivo. "Esto es de hoy, de esta hackathon". | Yo | `[cache]` |
| 0:50 | **Salud, en vivo**: foto a lo que tenga el jurado (puede elegir qué) → ítems en gramos y rangos. Guardar. Regenerar el resumen de salud: la comida nueva aparece. **Comprobación de calidad**: "datos usados: 1 noche, 3 comidas…" y el jurado cambia el check-in de ánimo → el resumen cambia. | Salud | análisis cacheado `[cache]` |
| 1:30 | **Trabajo**: commits reales de la hackathon, Linear, reuniones; resumen de trabajo. "Correlación, no causa". | Trabajo | `[cache]` |
| 1:55 | **Yo → acciones**: el agente propone "mover la reunión de 15:00 a 16:30 porque dormiste 4h y tenés el pico de commits a esa hora" → Confirmar → se ve movida en Google Calendar real. | Yo | `[simulado]` si el scope de escritura no está |
| 2:25 | **Semana**: Wrapped de la hackathon + ranking del equipo (rotulado `[datos simulados]` donde corresponda). | Semana | ya es local |
| 2:45 | Cierre: "tus datos, tu dispositivo: con tu equipo solo compartís un puntaje. Nunca diagnóstico." | — | — |

Rúbrica: producto funcionando 35 % (todo real end-to-end), problema y valor 25 % (hook + privacidad), **calidad de IA 20 %** (3 resúmenes con "datos usados" + cambio en vivo), experiencia 10 % (UI), originalidad 10 % (agente que actúa sobre tu agenda con tus datos de cuerpo).

## Antes de la demo (dom 18-oct): checklist del NAS

| Qué | Cómo | Si falla |
|---|---|---|
| IA andando | `GEMINI_API_KEY` en el entorno del NAS → abrir `/api/ai-status` → `"ok": true` | el campo `reason` dice qué arreglar |
| Reporte a Slack | crear un Incoming Webhook (api.slack.com/apps → Incoming Webhooks) a un canal **privado** de la demo → `SLACK_WEBHOOK_URL` en el NAS | sin la variable, el botón dice "Falta configurar Slack" (no se rompe nada) |
| Comprobación de calidad de IA | `npm run eval:ai` en el NAS (o donde esté la key) → imprime **N/6** | en el pitch se dice el N real, nunca uno supuesto |
| Caché de la IA | con wifi bueno, abrir Yo, Salud, Trabajo y Semana una vez y tocar ↻ en cada resumen: queda guardado y si Gemini cae en vivo se re-tipea rotulado `[cache · IA caída]` | sin esto, sin IA se ve el respaldo `[sin IA]` |
| Datos de la demo | `npm run seed:demo` (rotulado `[datos simulados]`) · borrar con `npm run seed:demo -- --clear` | — |

Flujo estrella para el jurado: **Yo → "Contarle a mi equipo cómo vengo"** → el jurado escribe cómo se siente → la IA cruza la nota con las métricas (salud y ánimo solo si se prenden) → vista previa idéntica al mensaje → **Mandar a Slack**. Sin IA no hay reporte: es la parte donde la IA es indispensable.
