# Santi — Yo, navegación y libs compartidas

**Objetivo**: que `/` sea **Yo**: una gráfica que cruza trabajo y salud por hora del día, y un resumen daily (IA) de cómo venís en los dos. Antes de eso, destrabar a los otros dos: rename + tab bar + `lib/summary.ts` esta noche.

**Tuyo**: `app/page.tsx`, `components/glass/tab-bar.tsx`, `lib/today.ts`, `lib/hourly.ts` (nuevo), `lib/summary.ts` (nuevo), `lib/summary-me.ts` (nuevo), `app/api/summary/me/route.ts` (nuevo), `components/summary.tsx` (nuevo), `components/cross-chart.tsx` (nuevo), `lib/ai.ts`, `lib/ranking.ts`, `components/ranking.tsx`, `components/pull-to-sync.tsx`, `components/settings-sheet.tsx`.
**No tocás**: `app/salud/*` y `lib/body.ts` después del rename (Joaco), `app/trabajo/*` y `lib/agent.ts` (Renzo), `lib/sources/*`, `lib/digest.ts`, `lib/wrapped.ts`.

## Estado (sáb 17-oct, noche)

| # | Tarea | Estado |
|---|---|---|
| 1 | Nav Yo · Salud · Trabajo · Semana | ✅ `1547d08` (+ redirects `/cuerpo`, `/comer` → `/salud`) |
| 2 | `lib/summary.ts` + `components/summary.tsx` + `generateJson` | ✅ `e9e3f5d`. Firma real: `streamSummary({ userId, kind, system, prompt }): Response`, `getCachedSummary(userId, kind)`. Caché verificada (re-tipea `[cache · IA no disponible]`). **Sin verificar con Gemini en vivo** (no hay `GEMINI_API_KEY` local) |
| 3 | Exportar `dayInputs` / `scoresFor` | ✅ `660d273` |
| 4 | Yo sin números fijos | ✅ pulso/HRV/sueño de `lib/cross.ts` (`recentVitals`) |
| 5 | Datos por hora | ✅ `lib/hourly.ts` (`hourlyFor`, `dailySeries`, puro + smoke). La madrugada (00–04) cuenta como noche del día anterior |
| 6 | Yo: gráfica + resumen + slot | ✅ `components/cross-chart.tsx`, `/api/summary/me`, `<section id="acciones">` (Renzo ya montó el agente) |
| 7 | Rótulos + pull-to-sync | ✅ `d9e716b` (sync de las 5 fuentes) |
| extra | Cruces con papers | ✅ `lib/insights.ts`: 9 cruces fijos con umbral de días, efecto mínimo, fuente y "→ probá…". Lo que no da se dice ("sin diferencia clara", "horario regular") |
| extra | Cerrar sesión | ✅ `4e1ef40` (Ajustes → sesión) |
| 8–10 | P2 | sin tocar: Salud/Trabajo son de sus dueños; `hasWearable` ya lo resolvió Renzo con la tabla `users` |

## Tareas

### P0 — esta noche, antes de las 21:00 (destraba a los otros)

**1. Rename y tab bar, en UN commit** (`feat: nav Yo · Salud · Trabajo · Semana`)
- `git mv app/cuerpo app/salud`; en `app/salud/page.tsx` cambiar títulos "Cuerpo" → "Salud" y pegar el `<Panel>` de la cámara de `app/comer/page.tsx` (el `<MealCamera />` y la lista "hoy", tal cual, con su `[ejemplo]`). Borrar `app/comer`.
- `components/glass/tab-bar.tsx`: `TABS` = `{ "/", "Yo", UserIcon } · { "/salud", "Salud", HeartPulseIcon } · { "/trabajo", … } · { "/semana", … }`. Sacar el caso `Icon === null`, la columna `72px` del grid (`grid-cols-4`) y el `-mt-7`. La pastilla ya se mide sola.
- `app/page.tsx`: `<h1 className="sr-only">Yo, …` y el `PageHeader` si lo agregás.
- Terminado: las 4 tabs navegan, `/cuerpo` y `/comer` no existen, `npm run build` verde. **Avisá en el grupo apenas esté en `main`**: Joaco arranca Salud después de ese commit.

**2. `lib/summary.ts` + `components/summary.tsx`** (`feat: resúmenes daily con caché`)
- Generalizar `app/api/digest/route.ts` + `saveDigest/getCachedDigest` de `lib/digest.ts`: `streamSummary({ userId, kind, system, prompt })` y `getCachedSummary(userId, kind)` (caché en `raw_events` `source: "summary"`, `kind: "health" | "work" | "me"`). Firma exacta en `plan/README.md` → Contrato. No toques `lib/digest.ts`: Joaco lo sigue usando para Semana.
- `components/summary.tsx`: copia de `components/digest.tsx` con props `{ label, src, fallback, counts, isExample }`: meta `gemini` si vino live, `[cache · IA no disponible]` si el stream arrancó con ese prefijo, `[ejemplo]` si tipeó el fallback; botón Regenerar; pie `datos usados: 1 noche · 12 commits · 2 reuniones` a partir de `counts`. Sin link a Wrapped.
- `lib/ai.ts`: agregar `generateJson<T>({ system, contents }): Promise<T>` con `responseMimeType: "application/json"` y el retry 503/429 que hoy está duplicado en `app/api/comer/analizar/route.ts` y `app/api/ingesta/procesar/route.ts`. No migres esos dos: avisá y que cada dueño lo use si quiere.
- Terminado: `curl -X POST localhost:3000/api/summary/me` tipea texto (aunque el prompt sea provisorio) y la segunda vez sin `GEMINI_API_KEY` re-tipea `[cache …]`.

**3. Exportar `dayInputs` de `lib/ranking.ts`** (una línea: `export function dayInputs`). Joaco lo necesita para Salud y vos para Yo. Ya trae `sleep`, pulso, HRV y AZM por día; no cambies la forma.

### P0 — esta noche

**4. `lib/today.ts` sin números fijos** (`fix: Yo lee pulso, HRV y reuniones reales`)
- `restingBpm`, `hrvMs`, `restingTypical`, `hrvTypical`: de `dayInputs(userId, 21 días)` (hoy y media de los 14 anteriores, como `scoresFor` en `lib/ranking.ts`). `meetings`: contar `source: "calendar"` de hoy (la lógica de `meetingSlotsToday` en `lib/work.ts`; copiá las 10 líneas, no importes `server-only` cruzado).
- `sleepWeek`: 7 noches reales de `dayInputs` (hoy mezcla 6 de ejemplo + 1 real sin rótulo). Si faltan noches, `null` y la sparkline las muestra como `·`.
- **`insight` se borra**: hoy `app/page.tsx:75` muestra un string fijo con rótulo `gemini` (rúbrica: nada precargado presentado como IA). Lo reemplaza el `<Summary>` de la tarea 6.
- Terminado: en Yo, con tu Fitbit sincronizada, sueño/pulso/HRV coinciden con la app de Google Health; sin datos muestra `[ejemplo]`.

**5. `lib/hourly.ts` → `getHourly(userId, date)`** (`feat: datos por hora para la gráfica cruzada`)
- 24 buckets `{ hour, commits, messages, meetingMin, azm, meals, mood }` + `sleep: { startHour, endHour } | null` leyendo `raw_events` del día local (`America/Montevideo`, como `lib/work-signals.ts`): `github/commit`, `slack`, `calendar/event` (repartir `durationMin` por hora), `google/azm` (un registro por minuto: sumar por hora), `meal`, `mood`. Sueño: de la última noche (`getLastNight` en `lib/body.ts`, hora de inicio/fin).
- Puro sobre filas: agregá un assert a `scripts/smoke.mts` con 3 eventos sintéticos (es la "comprobación sencilla" barata).
- Terminado: `getHourly("santi")` devuelve commits en las horas en que commiteaste hoy.

### P1 — domingo hasta las 10:00

**6. Yo: gráfica cruzada + resumen** (`feat: Yo cruza trabajo y salud`)
- `components/cross-chart.tsx`: dos franjas de 24 columnas en `<pre>` monoespaciado (mismo lenguaje que `hourBars` de `app/trabajo/page.tsx`): arriba trabajo (`commits + messages` con `▁▂▃…█`, reuniones como `█` en `text-work`), abajo salud (sueño como banda `text-sleep`, `azm` en `text-heart`, comidas como `◆` en `text-food`, check-in como la cara). Eje `00 06 12 18 23`. Server component, sin librerías de gráficos (decisión: ASCII es más barato, más rápido y es la identidad de la app).
- `lib/summary-me.ts` `buildMePrompt(userId)`: **no relee `raw_events`**: arma el prompt con `getCachedSummary(userId, "health")`, `getCachedSummary(userId, "work")` y 6 números de `getToday` + `getHourly` (sueño, pulso vs típico, commits, reuniones, hora pico de commits, comidas). System: 3 oraciones, rioplatense, "cómo venís hoy en cuerpo y trabajo y qué cruce se ve", correlación no causa, sin diagnóstico. `counts`: `[{ "resumen salud", 1|0 }, { "resumen trabajo", 1|0 }, { "commits", n }, …]`. Si faltan los dos resúmenes, el prompt dice "solo tenés números" y el pie lo muestra.
- `app/api/summary/me/route.ts` y `<Summary label="hoy, en una" src="/api/summary/me" …>` en `app/page.tsx` reemplazando el panel "observación". Fallback: un texto `[ejemplo]` fijo en `lib/summary-me.ts`.
- Dejá un `<section id="acciones">` vacío (o un `{children}` slot) debajo del resumen: ahí Renzo monta `<AgentActions />`. Acordá el nombre con él para que su commit toque `app/page.tsx` en una sola línea.
- Terminado: Yo muestra gráfica con los commits de hoy y el resumen cita algo que está en el de Salud o Trabajo.

**7. Rótulos y cortes de ejemplo que siguen en tus archivos** (`fix: rotular ejemplos`)
- `NudgeBanner` en `app/page.tsx`: si `getNudge().isExample`, prefijo `[ejemplo]`. (Después Renzo lo mueve a acción del agente; hasta entonces queda.)
- `components/pull-to-sync.tsx:9`: sumar `/api/sync/calendar`, `/api/sync/linear`, `/api/sync/slack` a `SYNC_ENDPOINTS` (hoy solo github+health).
- `lib/ranking.ts` `exampleRanking`: ya rotula; verificá que `[ejemplo]` se vea en `components/ranking.tsx` cuando no hay puntajes reales.

### P2 — solo después del freeze de código, si sobra

**8.** Polish de Salud y Trabajo con la misma identidad (pasada rápida, sin cambiar lógica; coordinada con el dueño).
**9.** `USERS` en `lib/user-list.ts`: `hasWearable` por conexión real (`getConnection(userId, "google")`) en vez de hardcodeado; hoy `app/salud/page.tsx` muestra "sin wearable" a Renzo y Joaco aunque logueen con Google.
**10.** Imagen compartible del Wrapped (`next/og`) — ya marcado ponytail en `app/semana/wrapped/page.tsx`.

## Lo que falta (detectado en el código, tu área)

| Qué | Dónde | Tarea |
|---|---|---|
| Texto fijo presentado como IA | `app/page.tsx:75`, `lib/today.ts:96` | 4 |
| Pulso 58 / HRV 48 / reuniones 2 hardcodeados | `lib/today.ts:90-95` | 4 |
| Sueño de la semana: 6 de ejemplo + 1 real, sin rótulo | `lib/today.ts:84-85` | 4 |
| No existe dato por hora del día | — | 5 |
| Pull-to-sync no sincroniza Calendar/Linear/Slack | `components/pull-to-sync.tsx:9` | 7 |
| Retry de Gemini duplicado en dos rutas | `app/api/comer/analizar/route.ts`, `app/api/ingesta/procesar/route.ts` | 2 (`generateJson`) |
| Botón de cámara al centro del tab bar | `components/glass/tab-bar.tsx:634` | 1 |

## Abierto a cambios

1. ¿La gráfica cruzada va en ASCII (2 franjas de 24 columnas) o preferís SVG inline? ASCII es media hora; SVG es 2 h y rompe la identidad.
2. ¿El resumen Yo consume los de Salud y Trabajo cacheados (propuesta: cero duplicación, pero depende de que el usuario haya abierto esas pantallas o de que la ruta `me` los dispare primero) o relee los números y nada más?
3. ¿Dejás `NudgeBanner` en Yo o lo sacás cuando Renzo monte las acciones? Propuesta: lo saca Renzo en su commit.
4. ¿Semana queda igual (digest semanal + ranking + Wrapped)? Propuesta: sí, es lo que más funciona y nadie tiene tiempo de rediseñarlo.

## Coordinación

| Con | Archivo | Regla |
|---|---|---|
| Joaco | `app/salud/page.tsx` | Vos hacés el rename y pegás la cámara; después es de él. No lo tocás hasta el polish P2. |
| Joaco | `lib/ranking.ts` (`dayInputs`) | Exportás y no cambiás la forma. |
| Renzo | `app/page.tsx` | Él agrega una sola línea (`<AgentActions />`) en el slot acordado. Pull-rebase antes de cada push, los dos. |
| Renzo | `lib/ai.ts` | Si quiere `generateJson` para el agente, lo usa; vos no tocás `lib/agent.ts`. |
| Los dos | `lib/summary.ts`, `components/summary.tsx` | Cambios de firma solo con aviso en el grupo. |
