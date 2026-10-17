# Prompt — Rol C · Joaco: El resto (trabajo + cerebro + pitch)

Pegá todo esto en tu sesión de Claude Code parado en la raíz del repo.

---

CONTEXTO
Hackathon 24-36h, demo en vivo. Producto: **Pulso** — PWA de salud para developers: cruza datos del cuerpo (Fitbit vía Google Health API, fotos de comidas analizadas con Claude vision, check-in de ánimo) con datos del trabajo (GitHub, Linear, Calendar; Slack stretch). Todo individual y privado: anti-bossware por diseño. Somos 3, cada uno con su sesión de Claude Code en este repo, en paralelo. Roles: **A = Santi, B = Renzo, C = Joaco (vos)**.

ANTES DE ARRANCAR: leé `PLAN.md` en la raíz (plan completo: demo script, spine, riesgos, Hora 0).

CONTRATO COMPARTIDO (no romperlo — Santi y Renzo trabajan en paralelo):
- Next.js App Router + TypeScript + Tailwind + shadcn/ui, en la raíz del repo. **El scaffold y el sistema de UI los hace Santi (Rol A)** — tus pantallas se arman con sus componentes; si la base no está, no la crees vos: empezá por los ingests (no necesitan UI).
- SQLite + Drizzle: `lib/db.ts`, archivo `data/pulso.db`. Tabla genérica `raw_events(id, source, kind, user_id, ts, json)` — cada ingest escribe JSON crudo ahí; las vistas derivan con queries.
- Usuarios hardcodeados en `lib/users.ts`: "santi" | "renzo" | "joaco" + switcher en la UI. SIN auth real (nada de next-auth).
- IA: **Gemini** (no Claude, por costo). Cliente compartido en `lib/ai.ts`, modelo `gemini-flash-latest`, helper `streamText()` (ver Contrato en el README).
- `.env.local` (NUNCA se commitea): GEMINI_API_KEY, GITHUB_TOKEN, LINEAR_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
- Ingests en `lib/sources/<fuente>.ts`.
- Git: commits chicos y frecuentes directo a `main` (son parte del dataset de la demo). `git pull --rebase` antes de pushear; nunca `push --force`.
- El spine de PLAN.md no se negocia; stretch solo si sobra. Simple > completo.

TU ROL: C — JOACO — EL RESTO: trabajo + cerebro + pitch

1) INGESTS DE TRABAJO (arrancá por acá: no necesitan la base de Santi):
   - `lib/sources/github.ts`: Octokit con GITHUB_TOKEN (PAT) → commits, PRs, issues, reviews **de este mismo repo** → `raw_events`.
   - `lib/sources/linear.ts`: GraphQL `https://api.linear.app/graphql` — **OJO: header `Authorization: <API_KEY>` SIN "Bearer"** (ahorra 30 min de debugging). Issues y estados → `raw_events`.
   - Calendar: primero tile con carga manual/mock; el OAuth real **comparte el proyecto y consent screen que configura Renzo** (scope `calendar.events.readonly`) — recién cuando Renzo tenga Health andando.
   - Slack NO (primero en cortarse; solo si sobra absolutamente todo).

2) EL DIGEST (el cerebro — beat 1:20 de la demo):
   - `app/api/digest`: junta la ventana elegida (sueño, HR, pasos, comidas, ánimo, commits, PRs, reuniones) del usuario leyendo SOLO de `raw_events` → UN prompt a Claude → observaciones correlacionadas narradas con tono humano. **Jamás diagnóstico médico** — "correlación, no causalidad", disclaimer visible.
   - **Streaming a la UI** (la IA tiene que VERSE trabajar) + fallback cacheado que se re-reproduce con efecto typewriter si la API muere en vivo.
   - Un solo pipeline simple. Nada multi-agente.

3) NUDGE (beat 1:50): endpoint que calcula el texto (calendar × actividad del wearable: "llevás 3h sentado y tenés hueco antes del pitch") y lo envía con `lib/push.ts` de Santi. Renzo pone el botón demo que te llama. SIN cron.

4) WRAPPED (beat 2:20): card compartible "Semana Wrapped" con lo mejor del período (stats + una línea escrita por Claude).

5) PITCH Y DRY-RUNS: sos dueño del demo script de PLAN.md. A H26: **3 dry-runs cronometrados**, Fitbit sincronizada antes de cada uno, matar túnel y wifi en el dry-run 2.

COSTURAS: leés todo de `raw_events`; enviás push con `lib/push.ts` de Santi; tus pantallas usan los componentes de Santi.
NO HAGAS: scaffold/PWA/sistema de UI (Santi), cámara/comidas (Renzo).
CHECKPOINT H16: digest real en streaming con datos de las 3 fuentes.
