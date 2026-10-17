# Prompt — Rol A: Fitbit + Frontend

Pegá todo esto en tu sesión de Claude Code parado en la raíz del repo.

---

CONTEXTO
Hackathon 24-36h, demo en vivo. Producto: **Pulso** — PWA de salud para developers: cruza datos del cuerpo (Fitbit vía Google Health API, fotos de comidas analizadas con Claude vision, check-in de ánimo) con datos del trabajo (GitHub, Linear, Calendar; Slack stretch). Todo individual y privado: anti-bossware por diseño. Somos 3 (Santi, Renzo, Joaco), cada uno con su sesión de Claude Code en este repo, en paralelo.

ANTES DE ARRANCAR: leé `PLAN.md` en la raíz (plan completo: demo script, spine, riesgos, Hora 0).

CONTRATO COMPARTIDO (no romperlo — hay 2 personas más trabajando en paralelo):
- Next.js App Router + TypeScript + Tailwind + shadcn/ui, en la raíz del repo. **El scaffold lo hacés VOS, primero que todo.**
- SQLite + Drizzle: `lib/db.ts`, archivo `data/pulso.db`. Tabla genérica `raw_events(id, source, kind, user_id, ts, json)` — cada ingest escribe JSON crudo ahí; las vistas derivan con queries.
- Usuarios hardcodeados en `lib/users.ts`: "santi" | "renzo" | "joaco" + switcher en la UI. SIN auth real (nada de next-auth).
- Cliente Claude compartido en `lib/claude.ts`, modelo `claude-sonnet-5-5`, helper de streaming.
- `.env.local` (NUNCA se commitea): ANTHROPIC_API_KEY, GITHUB_TOKEN, LINEAR_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
- Ingests en `lib/sources/<fuente>.ts`.
- Ritual obligatorio (ES el dataset de la demo): cada feature arranca como issue de GitHub con el scope en el body → rama → PR con "closes #N" → review con al menos un comment real. Nunca commit directo a main.
- El spine de PLAN.md no se negocia; stretch solo si sobra. Simple > completo.

TU ROL: A — FITBIT + FRONTEND (doble camino crítico: el scaffold destraba a los otros dos, Google Health es el go/no-go)

1) SCAFFOLD EXPRÉS (H0-2 — lo primero, PR exprés, mergear YA):
   - create-next-app (TS, Tailwind, App Router) + shadcn/ui + Drizzle/SQLite (`lib/db.ts`, `data/pulso.db`, tabla `raw_events`) + `lib/users.ts` con switcher + `lib/claude.ts` (streaming helper).
   - PWA shell por la **guía oficial de Next, SIN libs**: `app/manifest.ts` + service worker a mano + plumbing de push: `lib/push.ts` con `sendPush(userId, payload)` + route de suscripción (web-push + VAPID). Dev con `next dev --experimental-https`.
   - Layout, navegación y componentes base: sos el dueño del sistema visual. B y C arman sus pantallas con TUS componentes.

2) MANUAL, en paralelo con el scaffold (Hora 0, pasos 1-3 de PLAN.md — son esperas de consola):
   - La Web API clásica de Fitbit SE APAGA el 30-oct-2026: usamos su sucesora, la **Google Health API**.
   - El dueño de la Fitbit abre la app Google Health y confirma: cuenta migrada a Google + datos visibles.
   - Google Cloud: proyecto nuevo, habilitar **Google Health API + Google Calendar API**, OAuth client tipo Web, consent screen External en modo **Testing**, los 3 como test users con **gmails personales** (Workspace puede no servir).
   - OAuth 2.0 Playground con **"Use your own OAuth credentials"** (client id/secret del proyecto): un request de hoy y uno de **sleep de hace 3 meses** (valida que la historia migrada está expuesta). Si falla → plan B YA.

3) GOOGLE HEALTH (código):
   - `lib/sources/googleHealth.ts` + `app/api/health/connect` (OAuth authorization code, `access_type=offline`, callback en `http://localhost:3000/...`) + `app/api/health/sync`.
   - Scopes readonly: sleep, activity_and_fitness, health_metrics_and_measurements.
   - Ingest a `raw_events`: sueño con etapas, resting HR diario, HR intraday, pasos, HRV. Historia en chunks: **máx 14 días por query para heart-rate, 90 para el resto**. Límite: 300 req/min.
   - Gotchas: access token dura 1h (refresh expira a los 7 días en Testing — alcanza); los datos aparecen **solo cuando el dispositivo sincroniza** (sync manual antes de cada demo).

4) FRONTEND:
   - Home/dashboard del usuario + vista "Cuerpo" (sueño por noche, resting HR).
   - Al final (H22+): pasada de polish por las pantallas de B (comidas/ánimo) y C (digest/Wrapped) — misma identidad visual en todo.

5) PLAN B (gate: si Google Health no fluye a H6, se activa sin discusión):
   - Parser de export de Apple Health (zip→XML, offline, sin auth) O generador de datos sintéticos realistas, declarado en el pitch — detrás de la MISMA interfaz: escribe `raw_events` igual.

COSTURAS: exponés `lib/push.ts` (lo usa C para enviar nudges) y los componentes UI (los usan B y C).
NO HAGAS: pipeline de comidas (B), ingests de trabajo/digest (C).
CHECKPOINTS: H2 base mergeada y los otros dos destrabados; H8 datos reales del wearable visibles en tu vista Cuerpo.
