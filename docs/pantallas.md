# Pantallas — rediseño "Vidrio sobre terminal"

Propuesta visual completa (viva, con las 9 pantallas): https://claude.ai/artifact/L7vWgdUTTZ2qRHTxsPKoTE

Nav nueva: **Hoy · Cuerpo · ◉ (cámara) · Trabajo · Semana**. Ajustes se abre tocando el chip de usuario arriba a la derecha.

## Inventario

| # | Pantalla | Ruta | Spine | Dueño | Lee de | Estima |
|---|---|---|---|---|---|---|
| 1 | **Hoy**: mascota + log, 3 vitales (sueño, pulso, ánimo), observación IA, banner de nudge in-app | `/` | sí (base) | Santi | `raw_events` (todas) | 3h |
| 2 | **Cuerpo**: hipnograma ASCII, pulso de la noche, HRV, pasos. Variante **sin wearable** (comidas + ánimo) | `/cuerpo` | sí (#2) | Santi (UI) / Renzo (datos) | `google_health` | 3h |
| 3 | **Cámara**: visor + burbuja de vidrio + lista de comidas de hoy | `/comer` | sí (#3, beat 0:45) | Renzo | `meal` | 2h |
| 4 | **Análisis de comida**: foto escaneándose en ASCII → ítems en gramos + rangos kcal + comentario | hoja sobre `/comer` | sí (#3, beat 0:45) | Renzo (Santi da `<AsciiScan>`) | IA + `meal` | 3h |
| 5 | **Trabajo**: git log, reuniones en bloques, sueño × commits × ánimo 7 días | `/trabajo` | sí (#4, beat 1:20) | Joaco | `github`, `linear`, `calendar` | 3h |
| 6 | **Semana / digest**: texto IA en streaming con pastillas de datos + regenerar | `/semana` | sí (#5, beat 1:20) | Joaco | todas + IA | 3h |
| 7 | **Check-in de ánimo**: hoja con 5 caras ASCII, 1 toque | hoja sobre `/` | sí (#6) | Renzo | `mood` | 1h |
| 8 | **Nudge**: push del sistema (iOS la pinta sola) + banner in-app en Hoy + botón oculto "enviar ahora" | — | sí (#7, beat 1:50) | Joaco (cálculo) / Renzo (botón) | calendar + wearable | 2h |
| 9 | **Wrapped**: card de la semana tipo salida de terminal, compartible | `/semana/wrapped` | sí (#8, beat 2:20) | Joaco | todas | 3h |
| 10 | **Ajustes**: usuario, conectar Google Health, notificaciones, modo demo, "esto es tuyo" (exportar / borrar) | hoja desde el chip de usuario | parcial (stretch #13) | Santi | — | 2h |

Corte de 24h (CLAUDE.md): 1-6 sí o sí; 7, 8, 9 en ese orden; 10 solo lo mínimo (conectar Google + notificaciones).

## Estados que cada pantalla tiene que cubrir

- **Cargando**: spinner braille `⠋` + texto tipo log (`> leyendo sueño…`), nunca pantalla en blanco.
- **Vacío**: qué falta y el botón para conseguirlo ("Conectá Google Health", "Sacale una foto a lo que comés").
- **Sin wearable** (Renzo y Joaco): Cuerpo muestra comidas + ánimo; se pitchea como feature.
- **Error / sin IA**: se muestra el último resultado cacheado con la etiqueta `[cache]`. Toda pantalla que sale en la demo necesita esto.

## Componentes compartidos (los hace Santi primero, en `components/ascii/` y `components/glass/`)

| Componente | Para |
|---|---|
| `glass` / `glass-panel` (utilidades CSS) | todo control y panel |
| `<AsciiField bpm stress>` | fondo vivo de cada pantalla |
| `<TabBar>` con la cámara al centro | layout |
| `<Mascot mood>` + `<LogLine>` | Hoy, Wrapped |
| `<Sparkline values>`, `<Hypnogram stages>`, `<AsciiLine values>` | Cuerpo, Trabajo, Wrapped |
| `<Spinner>`, `<StreamText>` (cursor ▋) | todo lo que espera a la IA |
| `<AsciiScan src>` (foto → ASCII de grueso a fino) | Análisis de comida |
| `<Sheet>` | Ánimo, Análisis, Ajustes |
| `<DataChip kind>` (pastilla con el color del dominio) | digest, observaciones |
