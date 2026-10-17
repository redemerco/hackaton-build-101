# Joaco — Salud (ex Cuerpo + Comer) y Semana

**Objetivo**: que **Salud** sea la pantalla del cuerpo: sueño, pulso/HRV, movimiento, la cámara de comidas con las comidas de hoy **guardadas de verdad**, y un **resumen daily de salud (IA)** que cambia cuando el jurado saca una foto o toca el ánimo. **Semana** queda como está, solo polish.

**Tuyo**: `app/salud/page.tsx` (después del rename de Santi), `lib/body.ts`, `lib/meals.ts`, `components/meal-camera.tsx`, `app/actions/meal.ts` (nuevo), `lib/summary-health.ts` (nuevo), `app/api/summary/health/route.ts` (nuevo), `app/api/comer/analizar/route.ts`, `lib/digest.ts`, `app/api/digest/route.ts`, `components/digest.tsx`, `lib/wrapped.ts`, `lib/week.ts`, `app/semana/*`, `components/wrapped-slides.tsx`.
**No tocás**: `app/page.tsx`, `lib/today.ts`, `lib/hourly.ts`, `lib/summary.ts`, `components/summary.tsx`, `lib/ai.ts`, `lib/ranking.ts`, `components/ranking.tsx`, `components/glass/tab-bar.tsx` (Santi); `app/trabajo/*`, `lib/agent.ts`, `lib/nudge.ts`, `/api/nudge`, `lib/sources/*` (Renzo). `app/cuerpo` y `app/comer` **no los abrís**: hasta que el commit `feat: nav Yo · Salud · Trabajo · Semana` esté en `main`, trabajás solo en los archivos nuevos y en `lib/body.ts` / `components/meal-camera.tsx` (no se mueven en el rename).

Contrato y firmas: `plan/README.md` → Contrato. Caché y streaming van por `lib/summary.ts` de Santi (llega ~21:00); el prompt y el guardado de comidas no dependen de eso: arrancá por ahí.

## Tareas

### P0 — esta noche, sin esperar el rename

**1. Guardar la comida** (`feat: las comidas se guardan en raw_events`)
- `app/actions/meal.ts` `saveMeal(items: MealItem[], comment: string): Promise<void>`, copia de `app/actions/mood.ts`: validar (`items.length > 0`, rangos numéricos, nombres ≤ 60 chars), `insertRawEvents([{ source: "meal", kind: "photo", userId, ts: now, data: { items, comment, totalKcal: totalKcal(items) } }])`, `revalidatePath("/salud")`. Forma exacta del JSON: README → Contrato → Comidas (`comment` como string: `analysis.comment.join("")`).
- `components/meal-camera.tsx:123`: `onSave` pasa a recibir los ítems **ya escalados** por porción (`MealResult` los tiene en `items`, hoy no salen del componente). `onSave` llama `saveMeal`, toast `comida guardada`, `reactDaemon` como ahora. Si falla: toast de error, la hoja no se cierra.
- `lib/body.ts`: `getMealsToday(userId): { time: string; title: string; kcal: [number, number] }[]` leyendo `source: "meal"` del día local (`America/Montevideo`, como `lib/ranking.ts`); `title` = nombres de los ítems unidos con ", ". Misma forma que `MealEntry` de `lib/meals.ts`, que es client-safe y no puede tocar la DB.
- Terminado: foto → Guardar → `sqlite3 data/pulso.db "select json from raw_events where source='meal'"` muestra la fila; `lib/today.ts` `mealMinutesAgo` y la fila "comidas" de `lib/wrapped.ts` la levantan solas (ya leen `source: "meal"`).

**2. `lib/summary-health.ts` → `buildHealthPrompt(userId): { system, prompt, counts }`** (`feat: resumen daily de salud`)
- Insumos, todos reales y de **hoy** (día local `America/Montevideo`): última noche (`getLastNight`: inicio/fin, minutos por etapa de `stageMinutes ?? minutesByStage`), pulso en reposo y HRV de hoy vs media de los 14 días anteriores (de `dayInputs(userId, 21 días)` de `lib/ranking.ts`, que Santi exporta esta noche), AZM de hoy, comidas de hoy (hora, ítems, rango de kcal), **todos** los check-ins de ánimo de hoy con hora (`source: "mood"`, para que el cambio del jurado se note), y el **puntaje build101** del día (`scoreDay` de `lib/score.ts` con la misma línea base que `scoresFor` en `lib/ranking.ts:115`; ver Coordinación). Sin datos simulados (`_mock`) salvo rotularlos en el prompt como "simulados".
- System (rioplatense, 3–4 oraciones, texto plano, nombre **build101**): "cómo venís hoy de cuerpo: sueño, recuperación (pulso/HRV contra TU típico, no la población), movimiento, comida, ánimo y el puntaje build101 del día; citá números; correlación, no causa; nunca diagnóstico ni consejo médico ni nombres de enfermedades; si falta una fuente decilo en media oración, no inventes; cerrá con una sugerencia chica para lo que queda del día". Si no hay ningún dato real: el prompt dice "no hay datos de hoy: decilo en una línea y sugerí sincronizar la Fitbit".
- `counts`: `[{ label: "noche", n }, { label: "días con pulso/HRV", n }, { label: "comidas hoy", n }, { label: "check-ins hoy", n }, { label: "puntaje build101", 1|0 }]`. El pie "datos usados" de `<Summary>` es la comprobación de calidad del beat 0:50.
- `EXAMPLE_HEALTH_SUMMARY` (`readonly StreamPart[]`, texto fijo `[ejemplo]`) en el mismo archivo.
- Terminado: `node --import tsx -e` (o un `console.log` temporal) imprime un prompt con tu noche real y la comida del punto 1.

### P0 — esta noche, después del commit del rename (~21:00)

**3. Ruta y panel en Salud** (`feat: Salud con resumen daily y comidas reales`)
- `app/api/summary/health/route.ts`: `POST` → `new Response(streamSummary({ userId, kind: "health", ...buildHealthPrompt(userId) }))`; `GET` → `{ counts }`. Igual que `/api/digest`: texto plano en streaming; el caché lo escribe `lib/summary.ts`, vos no guardás nada.
- `app/salud/page.tsx`: orden de paneles **resumen → cámara + comidas de hoy → sueño → pulso → movimiento**. `const { counts } = buildHealthPrompt(user.id)` en la página (server) y `<Summary label="hoy, en el cuerpo" src="/api/summary/health" counts={counts} fallback={EXAMPLE_HEALTH_SUMMARY} />` arriba. Lista "hoy" con `getMealsToday`; `EXAMPLE_MEALS_TODAY` + rótulo `[ejemplo]` solo si está vacía.
- El `if (!user.hasWearable)` (`app/cuerpo/page.tsx:16`, mañana `app/salud/page.tsx`) hoy tapa toda la pantalla: resumen, cámara y comidas se renderizan **siempre**; solo sueño/pulso/movimiento muestran el `EmptyState` sin wearable. (El `hasWearable` hardcodeado lo arregla Santi en su P2 #9; no lo dupliques.)
- Terminado: en Salud el resumen cita la comida que acabás de guardar y la noche real; sin `GEMINI_API_KEY` re-tipea `[cache]`; sin caché tipea `[ejemplo]`.

**4. `lib/body.ts` sin ejemplos escondidos en noches reales** (`fix: pulso, HRV y movimiento reales en Salud`)
- `parseNight` (`lib/body.ts:97`) hace `{ ...exampleNight(), ... }`: una noche real sale con pulso 58, HRV 48, curva de pulso y pasos de ejemplo bajo el rótulo "Google Health" (README → Estado actual #8). `restingBpm`, `hrvMs`, `restingTypical`, `hrvTypical`: de `dayInputs` (hoy; "típico" con la **misma fórmula que `lib/today.ts` de Santi**, acordar una línea para que Yo y Salud no muestren dos típicos distintos). Si no hay dato de hoy, el valor queda `null` y el panel lo muestra como `—` (cambia la forma de `Night`: avisar, ver Coordinación).
- `hrNight` y `stepsByHour` **no tienen fuente**: `lib/sources/google.ts` ingesta solo `sleep`, `resting_hr`, `hrv` y `azm`. Propuesta ponytail: sacar la curva de pulso nocturna y el "mínimo a las"; reemplazar el panel "pasos · 08 → 19 h" por **"movimiento · 7 días"** con el AZM diario de `dayInputs` en `sparkline`. Cero datos inventados en pantalla.
- Terminado: con tu Fitbit sincronizada, reposo y HRV coinciden con la app de Google Health; `isExample` solo cuando no hay noche real o es `_mock`.

### P1 — domingo hasta las 10:00

**5. Ensayar el beat 0:50 completo** (sin código nuevo si 1–4 están)
- Foto → Guardar → la lista "hoy" cambia → Regenerar → el resumen nombra la comida y "datos usados" suma 1. Jurado toca el ánimo en Yo → vuelve a Salud → Regenerar → cambia la oración del ánimo. Si Gemini no nombra la comida, el prompt la lista al final con "lo más reciente:" (los modelos pesan más el cierre). Si el ida y vuelta Yo → Salud pesa en el guion, proponé en el grupo montar `<MoodCheckin>` también en Salud (una línea + `revalidatePath("/salud")` en `app/actions/mood.ts`); es decisión del grupo, ánimo queda en Yo.
- Fallback de la foto: el guion dice "análisis cacheado `[cache]`", hoy la cámara solo muestra error (`components/meal-camera.tsx:100`). Barato: `app/salud/page.tsx` pasa `lastMeal` (última de `getMealsToday`) como prop a `<MealCamera>`; si `/api/comer/analizar` falla, se muestra con rótulo `[cache · IA no disponible]`. Nunca el `EXAMPLE_ANALYSIS` como si fuera real.

**6. Polish de Semana** (`fix: build101 en el digest y rótulo [cache]`)
- `lib/digest.ts:8`: "Sos Pulso" → "Sos build101"; zona horaria `America/Montevideo` como el resto (mismo offset, pero que no diga Buenos Aires en el prompt).
- `components/digest.tsx:15`: cuando el stream arranca con `[cache · IA no disponible]` el meta dice `gemini`. Propuesta: reemplazar `<Digest>` por `<Summary label="tu digest" src="/api/digest" …>` de Santi (ya detecta el prefijo) y dejar el link "Ver Wrapped" como botón aparte en `app/semana/page.tsx`. Si `<Summary>` no está a las 10:00, no se toca.
- Terminado: dry-run con wifi cortado (13:30 y 14:30): Semana y Salud re-tipean `[cache]`, nada dice `gemini` sobre texto cacheado.

### P2 — después del freeze, si sobra

**7.** `lib/wrapped.ts:9`: fila y highlight de **sueño** (`dayInputs` → promedio de la semana + sparkline de 7 noches). Es el ponytail que quedó pendiente; 20 líneas.
**8.** `app/api/comer/analizar/route.ts`: migrar `generateWithRetry` a `generateJson` de Santi (él no migra; es tu decisión).
**9.** Puntaje build101 del día como `Panel` en Salud (`scoreDay` → "72 · parcial"), para que el número del ranking tenga de dónde salir.

## Lo que falta (detectado en el código, tu área)

| Qué | Dónde | Tarea |
|---|---|---|
| La comida nunca se guarda (`onSave` solo hace toast) | `components/meal-camera.tsx:109` | 1 |
| Lista "hoy" es `EXAMPLE_MEALS_TODAY` | `app/comer/page.tsx:15,38` | 1, 3 |
| Pulso 58 / HRV 48 / curva / pasos de ejemplo dentro de noches reales, rótulo "Google Health" | `lib/body.ts:97` | 4 |
| Sin wearable no hay cámara ni resumen (EmptyState tapa todo) | `app/cuerpo/page.tsx:16` | 3 |
| No existe resumen daily de salud | — | 2, 3 |
| "Pulso" y "Buenos Aires" en el system del digest | `lib/digest.ts:8` | 6 |
| Meta `gemini` sobre texto `[cache]` | `components/digest.tsx:15` | 6 |
| Foto sin fallback cacheado (solo error) | `components/meal-camera.tsx:100` | 5 |
| Wrapped sin sueño | `lib/wrapped.ts:9` | 7 |
| Retry de Gemini duplicado | `app/api/comer/analizar/route.ts` | 8 |

## Abierto a cambios

1. ¿Panel de pulso **sin** curva nocturna (propuesta: solo reposo, HRV y típico, todo real) o se deja la curva con rótulo `[ejemplo]`? La curva es linda pero es inventada y el jurado la mira al lado de "Google Health".
2. ¿Quién calcula el puntaje build101 para el resumen? Propuesta: Santi exporta también `scoresFor` de `lib/ranking.ts:115` (misma forma, una palabra). Si no, copiás las 8 líneas de `scoreOn` con comentario. **No** uses `getRanking(me).rows`: sin puntajes reales devuelve `exampleRanking` (82/74/61) y entraría al prompt como dato.
3. ¿El resumen de Yo (Santi) necesita que Salud se haya abierto antes? En el guion Yo (0:20) va antes que Salud (0:50): o abrís Salud en el dry-run de 13:30 para dejar el caché, o `/api/summary/me` dispara `streamSummary({ kind: "health", ...buildHealthPrompt(userId) })` si no hay caché. Vos no tocás su ruta; se lo proponés.
4. ¿Fallback de la foto con la última comida guardada `[cache]` (tarea 5) o solo el error? Propuesta: `[cache]`, el guion lo promete.

## Coordinación

| Con | Archivo | Regla |
|---|---|---|
| Santi | `app/salud/page.tsx` | Él hace el rename y pega la cámara en un commit (~21:00) y avisa en el grupo; recién ahí lo abrís. Hasta entonces: tareas 1 y 2. |
| Santi | `lib/ranking.ts` (`dayInputs`, y si acepta `scoresFor`) | Los consumís, no los editás. Si falta algo, pedíselo. |
| Santi | `lib/body.ts` (`Night`) | Es tuyo, pero `getLastNight` lo usa su `lib/hourly.ts` (solo start/end) y `Pulse bpm`: si `restingBpm` pasa a nullable, avisá antes de pushear. |
| Santi | `lib/summary.ts`, `components/summary.tsx`, `lib/ai.ts` | Los consumís. Tu única obligación: `/api/summary/health` pasa por `streamSummary` (es el único que escribe el caché `kind: "health"` que su resumen de Yo lee con `getCachedSummary`) y el texto se entiende solo, porque él lo cita. |
| Renzo | `lib/work.ts` | Es tuyo históricamente; él cambia 15 líneas (sueño/ánimo reales en el panel de 7 días) y te avisa. No lo toques esta noche. |
| Renzo | `lib/nudge.ts`, `/api/nudge` | Pasan a ser de él (el nudge vive en el agente). |
| Renzo | `lib/sources/google.ts` | Si querés pulso intradía o pasos reales para Salud, se lo pedís; no agregues kinds vos. Para mañana no hace falta (AZM alcanza). |
| Todos | `raw_events` `source: "meal"` | Forma del JSON fija (Contrato). `lib/today.ts`, `lib/wrapped.ts` y `lib/hourly.ts` ya la leen. |

Git: directo a `main`, commits chicos (`feat:`/`fix:`), `git pull --rebase` antes de cada push, nunca `--force`. Conflicto en `app/salud/page.tsx` con Santi: conservás su cambio y avisás.
