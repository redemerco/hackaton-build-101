# hackaton-build-101
Hackatón Build 101

## Setup

1. Cloná el repo y abrí Claude Code en la raíz. Te va a ofrecer instalar el plugin **ECC** (skills, agentes y comandos `/ecc:*`): aceptá.
2. Los hooks de ECC corren en perfil `minimal` (lo fija `.claude/settings.json`), así no frenan cada edición durante la hackathon.
3. Abrí tu plan en `plan/` (`santi.md`, `renzo.md`, `joaco.md`); el índice con navegación, dueños y demo es [`plan/README.md`](plan/README.md).

## Correr la app

```bash
npm install
cp .env.example .env.local      # completar keys (GEMINI_API_KEY: aistudio.google.com/apikey); VAPID: npx web-push generate-vapid-keys
npm run dev                     # http://localhost:3000
npm run smoke                   # chequeo rápido de la DB
```

- `http://localhost` ya cuenta como contexto seguro: service worker y push andan sin HTTPS en la laptop.
- El teléfono entra por el túnel ngrok (HTTPS lo pone ngrok). `npm run dev:https` existe pero la primera vez pide sudo (mkcert instala una CA).
- La DB es `data/pulso.db` (SQLite, se crea sola, no se commitea).

## Diseño

Pantallas, dueños y tareas: [`plan/README.md`](plan/README.md).

## Contrato (no romper sin avisar)

| Archivo | Qué expone |
|---|---|
| `lib/db.ts` | `db` (Drizzle), tablas `rawEvents` / `pushSubscriptions`, `insertRawEvents(rows): number` (idempotente por `user_id+source+kind+ts`) |
| `lib/users.ts` | `getCurrentUser()` (server, lee cookie `pulso_user`, default santi), `USERS`, `isUserId`, `type UserId` |
| `lib/user-list.ts` | lo mismo sin `server-only`, para componentes cliente |
| `lib/ai.ts` | Gemini: `MODEL` (`gemini-flash-latest`), `getAI()`, `streamText({ contents, config? }): ReadableStream` → `return new Response(streamText({...}))`. Imágenes: partes `{ inlineData: { mimeType, data } }` |
| `lib/push.ts` | `sendPush(userId, { title, body, url? })` → `{ sent, removed }`, `saveSubscription` |
| `components/glass/` | `Panel` (tarjeta de vidrio con `label`/`meta`), `Sheet` (hoja inferior, `<dialog>` nativo), `TabBar`, utilidades CSS `glass`, `glass-panel`, `press` |
| `components/ascii/` | `AsciiField` + `<Pulse bpm stress/>` (fondo vivo), `Mascot`, `Hypnogram`, `Spinner`, `Caret`, `AsciiScan` (foto → ASCII), `StreamText` (`src` real con respaldo tipeado), `Count` / `DurationCount` (números que cuentan), `Decode` (cifras que se decodifican), `DataChip` |
| `lib/ascii.ts` | `sparkline()`, `asciiLine()`, `hypnogramLanes()`, `formatDuration()`, `asciiField()` (puras, testeadas en `npm run smoke`) |
| `components/screen.tsx` | `Screen`: envolvé el contenido de cada `page.tsx` con esto (transición entre tabs + entrada en cascada) |
| `components/` | `PageHeader`, `EmptyState`, `StatCard`, `ui/*` (shadcn). Colores por dominio: `text-sleep`, `text-heart`, `text-food`, `text-work`, `text-mood`; fuente pixel: `font-pixel` |

| `lib/connections.ts` | Tokens OAuth por usuario (tabla `connections`, aparte de `raw_events` para que nunca lleguen al digest): `getConnectionStatus(userId)` → `{ github, linear, slack }` con la cuenta conectada o `null` (server-only: pasalo como prop a componentes cliente), `deleteConnection` |
| `lib/digest.ts` + `POST /api/digest` | Digest de 7 días en streaming (lo consume `<Digest src="/api/digest">`). Si Gemini falla, re-tipea el último digest guardado |
| `lib/nudge.ts` + `/api/nudge` | `getNudge(userId)` → `{ title, body, isExample }` calculado de datos reales (racha sin cortar, hora, próxima reunión). `GET` lo devuelve; `POST` lo manda por push (si el push falla responde igual el nudge, para mostrarlo in-app). `?user=santi` apunta a otro usuario: es lo que llama el botón demo de Renzo |
| `lib/sources/{github,linear,slack}.ts` | Ingests de trabajo → `raw_events`. Cada uno: `sync<Fuente>User(userId)` (token OAuth del usuario) + respaldo con la key de `.env.local` |

`raw_events`: `source` = fuente (`google_health`, `github`, `linear`, `meal`, `mood`…), `kind` = tipo dentro de la fuente, `ts` = ISO 8601 UTC, `json` = payload crudo.

Google Health escribe `source: "google"` con `kind` `sleep`, `resting_hr`, `hrv` (`ts` = medianoche UTC de la fecha) y `azm` (un registro por minuto en zona). `lib/score.ts` arma el puntaje build101 (0–100) y `lib/ranking.ts` el ranking del workspace de Slack. Re-sync: `GET /api/sync/health`.

### Conexiones (OAuth de GitHub, Linear y Slack · Joaco)

| Ruta | Para qué |
|---|---|
| `GET /api/connect/github\|linear\|slack` | Botón "Conectar": tiene que ser un `<a href>` (redirección de navegador), no `fetch` |
| `GET /api/connect/<p>/callback` | Vuelta del login: guarda el token del usuario actual y vuelve a `/?conexion=<p>-ok` o `<p>-error` (para un toast) |
| `DELETE /api/connect/<p>` | Desconectar |
| `GET /api/sync/github\|linear\|slack` | Re-sincroniza a todos los conectados. Idempotente (`{ inserted }`), sirve para el pull-to-sync |

- Slack: token de usuario con `search:read`; solo se guarda la hora y el tipo de canal de cada mensaje, **nunca el contenido**.
- Variables: `GITHUB_CLIENT_ID/SECRET`, `LINEAR_CLIENT_ID/SECRET`, `SLACK_CLIENT_ID/SECRET`, `SLACK_TEAM_ID`, y `APP_URL` con el origen público (la URL del túnel). Callbacks registrados: `https://pulso.renzodemarco.com.uy/api/connect/<p>/callback` y `https://localhost:3000/...` (Slack exige HTTPS: localmente `npm run dev:https`).
- Workspaces de la demo: Linear `linear.app/pulso-hackaton`, Slack `app-bwf1423.slack.com`.
Next 16.4 con `cacheComponents` **apagado**: todas las páginas son dinámicas, podés usar `getCurrentUser()` sin `Suspense`.

## Qué es IA y qué es cálculo fijo (para la revisión técnica)

| Parte | Qué hace | IA |
|---|---|---|
| **Reporte "cómo vengo" a Slack** (Yo) | interpreta una nota libre nueva + las métricas que la persona habilita y arma riesgo, observaciones y un pedido | **Gemini**, indispensable: sin IA no hay reporte (no tiene plantilla de reemplazo) |
| Foto de comida (Salud) | ítems, gramos y kcal en rangos desde la foto | **Gemini vision** |
| Resúmenes daily (Yo, Salud, Trabajo) y digest (Semana) | narran los datos del día/semana | **Gemini**; sin IA muestran un respaldo rotulado `[sin IA]` o el último real `[cache · IA caída]` |
| Agente (Yo) | propone mover una reunión, bloquear foco o mandar el nudge | **Gemini** (JSON validado en el server); sin IA solo el nudge `[ejemplo]`, nunca mueve reuniones |
| Cruces con papers (Yo) | 9 cruces fijos con umbral de días y efecto mínimo (`lib/insights.ts`) | **determinista** a propósito: la IA solo narra los que pasan el control |
| Puntaje build101 y ranking (Semana) | 0–100 con sueño, HRV/pulso contra tu media y minutos activos (`lib/score.ts`) | determinista |
| Datos de demo | reales (Google Health, GitHub, Slack, Calendar, Linear) · `npm run demo:clear` borra lo simulado que haya quedado | si quedara algo simulado, se rotula `[datos simulados]` |

Comprobación sencilla de calidad de la IA: `npm run eval:ai` (6 casos: forma, contradicción, día tranquilo, privacidad, sin diagnóstico, sin inventar métricas). Herramientas de desarrollo: el código se escribió con asistentes de IA (Claude Code).
