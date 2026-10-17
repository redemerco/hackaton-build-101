# Renzo — Trabajo y acciones del agente

**Objetivo**: que `/trabajo` tenga un **resumen daily de trabajo (IA)** real sobre commits, Linear, Slack y reuniones, y que en **Yo** el agente **proponga acciones concretas** (mover una reunión, bloquear foco, mandarme el nudge) y las **ejecute solo con Confirmar**. Es el beat de originalidad del pitch (1:55): "el agente mueve tu agenda con datos de tu cuerpo".

**Tuyo**: `app/trabajo/page.tsx`, `lib/work.ts`, `lib/work-signals.ts`, `lib/summary-work.ts` (nuevo), `app/api/summary/work/route.ts` (nuevo), `lib/agent.ts` (nuevo), `components/agent-actions.tsx` (nuevo), `app/api/agent/propose/route.ts` y `app/api/agent/run/route.ts` (nuevos; `app/api/agent/read` ya existe, no lo pises), `lib/sources/calendar.ts`, la entrada `calendar` de `lib/oauth.ts` (solo el scope), `components/nudge-banner.tsx`.
**No tocás**: `app/page.tsx` salvo la línea acordada del slot, `lib/summary.ts` / `components/summary.tsx` / `lib/ai.ts` / `lib/hourly.ts` / `lib/today.ts` (Santi), `app/salud/*`, `lib/body.ts`, `lib/digest.ts` (Joaco), `lib/sources/github|linear|slack.ts`.

## Tareas

### P0 — esta noche (no depende del rename de Santi)

**1. `lib/summary-work.ts` → `buildWorkPrompt(userId)`** (`feat: prompt del resumen daily de trabajo`)
- Firma del contrato: `{ system, prompt, counts }`. Insumos que ya existen: `getWorkDay(userId)` (log y commits por día, `lib/work.ts`), `getLinearWeek` + `getSlackToday` (`lib/work-signals.ts`) y las filas `source: "calendar"` de hoy (exportá `meetingSlotsToday` de `lib/work.ts`, que es tuyo). Prompt: eventos **de hoy** en hora local (`America/Montevideo`, como `work-signals`), con el formato de `buildDigestPrompt` (`lib/digest.ts`) pero 1 día y sin releer GitHub crudo: solo primera línea del commit.
- System: build101 (no "Pulso"), 3–4 oraciones rioplatenses, texto plano, "qué hiciste hoy y en qué horas, dónde se amontona (reuniones vs commits), nada de cuerpo" (eso es de Salud; el cruce lo hace el resumen Yo). Correlación no causa. Si una fuente no está conectada, media oración diciéndolo, no inventar.
- `counts`: `[{ label: "commits", n }, { "PRs", n }, { "issues", n }, { "mensajes", n }, { "reuniones", n }]`; una fuente desconectada va con `n: 0`.
- Terminado: `buildWorkPrompt("renzo").prompt` muestra los commits de hoy y `counts.commits` coincide con el `git log` de Trabajo.

**2. `app/api/summary/work/route.ts` + `<Summary>` en Trabajo** (`feat: resumen daily de trabajo en streaming`)
- `POST` = `streamSummary({ userId, kind: "work", ...buildWorkPrompt(userId) })`; `GET` devuelve `{ counts }`. Depende de `lib/summary.ts` de Santi (sáb 21:00); hasta que esté, probá el prompt con `streamText` directo en la ruta y cambiás una línea después.
- En `app/trabajo/page.tsx`: `<Summary label="hoy, en trabajo" src="/api/summary/work" fallback={EXAMPLE_WORK_SUMMARY} counts={counts} isExample={day.isExample} />` arriba del git log. El fallback fijo vive en `lib/summary-work.ts` y tipea con `[ejemplo]`.
- Terminado (es el caso "nuevo" de la rúbrica): hacés un commit → pull-to-sync → Regenerar: el pie "datos usados" suma 1 commit y el texto lo menciona. Sin `GEMINI_API_KEY` re-tipea `[cache · IA no disponible]`.

**3. Rótulos de Trabajo que hoy mienten** (`fix: Trabajo rotula solo lo que es ejemplo`)
- `app/trabajo/page.tsx:119` "Calendar pendiente" y `:162` `[ejemplo · falta Calendar]` son fijos aunque Calendar esté conectado: condicioná con `getConnection(userId, "calendar")` (`lib/connections.ts`). Con Calendar y 0 reuniones: "sin reuniones hoy", no `[ejemplo]`.
- `lib/work.ts:59`: `week.sleepMin` y `week.mood` salen de `EXAMPLE_DAY` mezclados con commits reales. Sueño real por día con `dayInputs(userId, 7 días)` (`lib/ranking.ts`, Santi la exporta esta noche) y ánimo con `source: "mood"` por día; si falta un día, `null` y la sparkline lo muestra como `·`. Si no llegás, rotulá las dos filas `[ejemplo]` en el panel.
- `CorrelationNote` (`page.tsx:51`) tiene una oración fija ("dormiste menos de 6 h…") en la rama `hasEnough`: calculala de las series o dejá solo la barra de días + "correlación, no causa".
- Terminado: en Trabajo con Calendar conectado no aparece `[ejemplo]` en reuniones; con todo desconectado todo dice `[ejemplo]`.

**4. Calendar: `id` del evento y scope de escritura** (`feat: calendar guarda id y pide events (escritura)`)
- `lib/sources/calendar.ts`: en `safe` agregá `id: ev.id` (sigue sin título ni invitados). Es lo que `runAction` necesita para `events.patch`.
- `lib/oauth.ts:99`: `calendar.events.readonly` → `https://www.googleapis.com/auth/calendar.events`. **Verificar** que el scope esté habilitado en el consent screen del proyecto GCP `build-101-511915` (`gcloud --configuration=build101`) y que la cuenta de Santi sea test user; con `prompt: "consent"` ya seteado, basta con reconectar Calendar en Ajustes. Es seguro para Health: el token `calendar` es aparte del `google`, así que no reaparece el 403 `DISALLOWED_OAUTH_SCOPES` del comentario de `lib/oauth.ts:73`.
- Terminado: después de reconectar, `curl -X PATCH .../calendars/primary/events/<id>` con el token de la DB devuelve 200. **Avisá en el grupo**: los 3 reconectan Calendar antes del freeze. Si a dom 10:00 el PATCH no devuelve 200, el agente queda `[simulado]` (fallback de la tarea 6) y no se discute más.

### P1 — domingo hasta las 10:00

**5. `lib/agent.ts` → `proposeActions(userId)`** (`feat: el agente propone acciones con datos reales`)
- Firma del contrato: `AgentAction = { id, type: "move_meeting" | "block_focus" | "send_nudge", eventId?, from?, to?, minutes?, reason, isSimulated }`. Insumos: reuniones de hoy que todavía no empezaron (filas `calendar` con `id`), sueño de anoche y pulso vs típico (`dayInputs`), commits por hora (`getHourly`, Santi) y el nudge calculado (`getNudge`).
- La IA elige, el código valida: `generateJson<AgentAction[]>` (`lib/ai.ts`, Santi esta noche) con la lista de reuniones (solo `id`, `from`, `durationMin`) + los números, y un system que pide **como máximo 2 acciones** con `reason` de una oración que cite un dato ("dormiste 4h10 y tu pico de commits es 15–17"). Del lado del server: todo `eventId` tiene que existir en las filas del usuario, `to` tiene que ser ISO válido del mismo día y no pisar otra reunión; lo que no pasa se descarta. La IA nunca inventa un evento.
- Sin Gemini: una propuesta determinística (la reunión más próxima al pico de commits, o `send_nudge` si no hay reuniones) rotulada `[ejemplo]`. `isSimulated = process.env.CALENDAR_WRITE_OK !== "1"` (`connections` no guarda el scope; la variable la ponés en `.env.local` recién cuando el PATCH de la tarea 4 devuelva 200).
- `app/api/agent/propose/route.ts`: `GET` → `AgentAction[]`, y guarda la lista en `raw_events` `source: "agent"`, `kind: "proposal"`, `{ actions }`: es lo que `run` relee por `id`, y es el `[cache]` que re-tipea la tarjeta en el dry-run sin wifi (en vez de caer a `[ejemplo]`).
- Terminado: con un evento real a las 15:00 en el Calendar de Santi y una noche corta, `GET /api/agent/propose` devuelve un `move_meeting` con ese `eventId` y una razón que cita el sueño. Lo probás en seco: sin confirmar no cambia nada.

**6. `runAction` + `<AgentActions />` en Yo** (`feat: acciones del agente con confirmación`)
- `runAction(userId, action)` solo desde `POST /api/agent/run`, que **relee la acción por `id` de la última propuesta guardada** (`source: "agent"`), no confía en el payload del cliente. `send_nudge` → la lógica de `POST /api/nudge` (reusá `getNudge` + `sendPush`); `move_meeting` → `events.patch` en `calendars/primary/events/{eventId}` con `freshToken(getConnection(userId, "calendar"))` moviendo `start` **y** `end` el mismo delta, después `syncCalendarUser(userId)`; `block_focus` → P2 (`events.insert`).
- **Ojo dedupe**: `raw_events` deduplica por `(userId, source, kind, ts)` (`lib/db-core.ts:20`), así que al mover la reunión el re-sync inserta una fila nueva con el `ts` nuevo y **la vieja queda**: Trabajo mostraría 2 reuniones. En `runAction`, antes del re-sync, borrá las filas `calendar` del usuario cuyo `json` tenga ese `id` (una query; `lib/db.ts` expone `db`).
- Si `isSimulated`: no ejecuta; la tarjeta dice `[simulado]`, muestra "de 15:00 a 16:30" y un link `https://calendar.google.com/calendar/r/day/<yyyy/mm/dd>` para hacerlo a mano. Nunca una acción simulada presentada como ejecutada.
- `components/agent-actions.tsx` (client): carga `GET /api/agent/propose`, una tarjeta por acción con `reason` y botón **Confirmar** → `POST /api/agent/run` → estado "hecho ✓ · ver en Google Calendar" / `[simulado]` / error en texto. Mismo lenguaje que `NudgeBanner` (glass, mono). Se monta en el `<section id="acciones">` que deja Santi en `app/page.tsx` (tarea 6 de santi.md): tu commit toca una sola línea ahí y **saca `<NudgeBanner>` en el mismo commit** (santi.md, Abierto 3): el nudge pasa a ser la acción `send_nudge`.
- Terminado: en el teléfono de Santi, Confirmar mueve el evento y se ve movido en Google Calendar real en menos de 10 s; en Trabajo aparece una sola reunión, en el horario nuevo. **Dom 10:00: creá el evento de prueba en el Calendar de Santi (15:00, 30 min)**; sin ese evento el beat 1:55 no tiene qué mover.

### P2 — solo después del freeze de código, si sobra

**7.** `block_focus` real: `events.insert` de un bloque "foco" de `minutes` en la hora pico de commits (mismo scope, misma validación).
**8.** Rename "Pulso" → "build101" en los títulos de `lib/nudge.ts` (`:22`, `:68`, `:75`, `:82`): `lib/nudge.ts` y `/api/nudge` pasan a ser tuyos (el nudge vive en el agente).
**9.** Trabajo: `hourBars` de commits por hora reusando `getHourly` en vez de solo Slack; polish con Santi.

## Lo que falta (detectado en el código, tu área)

| Qué | Dónde | Tarea |
|---|---|---|
| Ningún resumen IA en Trabajo; `/api/ingesta/procesar` existe y nadie lo usa | `app/trabajo/page.tsx` | 1, 2 |
| `[ejemplo · falta Calendar]` y "Calendar pendiente" fijos aunque Calendar esté conectado | `app/trabajo/page.tsx:119,162` | 3 |
| Sueño y ánimo de la semana son `EXAMPLE_DAY` mezclados con commits reales, sin rótulo | `lib/work.ts:59,85` | 3 |
| Oración de correlación fija en la rama "hay datos" | `app/trabajo/page.tsx:51` | 3 |
| Calendar no guarda `id` del evento: no se puede mover nada | `lib/sources/calendar.ts:34` (`safe`) | 4 |
| Scope de Calendar solo lectura | `lib/oauth.ts:99` | 4 |
| Dedupe por `ts`: mover una reunión deja la fila vieja | `lib/db-core.ts:20` | 6 |
| `POST /api/nudge` existe y ninguna UI lo dispara | `app/api/nudge/route.ts` | 6 (`send_nudge`) |
| "Pulso" en títulos del nudge | `lib/nudge.ts:22,68,75,82` | 8 |

## Abierto a cambios

1. ¿Las propuestas las elige Gemini (`generateJson` + validación en server) o son reglas fijas? Propuesta: Gemini, porque es el punto de "calidad de IA" y cambia con los datos en vivo; las reglas quedan solo como fallback `[ejemplo]`.
2. ¿Cambiás el scope de Calendar esta noche (obliga a los 3 a reconectar) o dejás el agente `[simulado]` desde el arranque? Propuesta: esta noche, con gate dom 10:00; el `[simulado]` queda listo igual.
3. `lib/work.ts` no tenía dueño: lo tomás vos (Trabajo lo consume) aunque los ingests sean de Joaco. Si él prefiere tenerlo, le pasás la tarea 3 y no lo tocás.
4. ¿`<AgentActions />` va en Yo (contrato) o también una tarjeta chica en Trabajo? Propuesta: solo Yo; Trabajo ya tiene demasiados paneles.

## Coordinación

| Con | Archivo | Regla |
|---|---|---|
| Santi | `app/page.tsx` | Agregás una sola línea (`<AgentActions />`) en el slot `#acciones` que él deja, y sacás `<NudgeBanner>` en ese commit. Pull-rebase antes de cada push, los dos. |
| Santi | `lib/summary.ts`, `components/summary.tsx`, `lib/ai.ts` (`generateJson`), `lib/hourly.ts`, `lib/ranking.ts` (`dayInputs`) | Los consumís; cambios de firma solo con aviso en el grupo. Si a las 21:00 no están, arrancás por la tarea 1 y el `[simulado]`. |
| Joaco | `lib/nudge.ts`, `app/api/nudge/route.ts` | Pasan a ser tuyos: los reusás desde `runAction` (`getNudge` + `sendPush`). |
| Joaco | `lib/sources/calendar.ts`, `lib/oauth.ts` | Son tuyos por este plan: le avisás del `id` y del scope porque `lib/digest.ts` y `lib/nudge.ts` leen `calendar`. |
| Los 3 | Ajustes → Calendar | Después del commit del scope, todos reconectan Calendar antes del freeze (dom 13:00). |
