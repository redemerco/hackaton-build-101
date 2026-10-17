# Prompt — Rol A · Santi: Frontend

Pegá todo esto en tu sesión de Claude Code parado en la raíz del repo.

---

CONTEXTO
Hackathon 24-36h, demo en vivo. Producto: **Pulso** — PWA de salud para developers: cruza datos del cuerpo (Fitbit vía Google Health API, fotos de comidas analizadas con Claude vision, check-in de ánimo) con datos del trabajo (GitHub, Linear, Calendar; Slack stretch). Todo individual y privado: anti-bossware por diseño. Somos 3, cada uno con su sesión de Claude Code en este repo, en paralelo. Roles: **A = Santi (vos), B = Renzo, C = Joaco**.

ANTES DE ARRANCAR: leé `PLAN.md` en la raíz (plan completo: demo script, spine, riesgos, Hora 0).

CONTRATO COMPARTIDO (no romperlo — Renzo y Joaco trabajan en paralelo):
- Next.js App Router + TypeScript + Tailwind + shadcn/ui, en la raíz del repo. **El scaffold lo hacés VOS, primero que todo.**
- SQLite + Drizzle: `lib/db.ts`, archivo `data/pulso.db`. Tabla genérica `raw_events(id, source, kind, user_id, ts, json)` — cada ingest escribe JSON crudo ahí; las vistas derivan con queries.
- Usuarios hardcodeados en `lib/users.ts`: "santi" | "renzo" | "joaco" + switcher en la UI. SIN auth real (nada de next-auth).
- IA: **Gemini** (no Claude, por costo). Cliente compartido en `lib/ai.ts`, modelo `gemini-flash-latest`, helper `streamText()` (ver Contrato en el README).
- `.env.local` (NUNCA se commitea): GEMINI_API_KEY, GITHUB_TOKEN, LINEAR_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
- Ingests en `lib/sources/<fuente>.ts`.
- Git: commits chicos y frecuentes directo a `main` (son parte del dataset de la demo). `git pull --rebase` antes de pushear; nunca `push --force`.
- El spine de PLAN.md no se negocia; stretch solo si sobra. Simple > completo.

TU ROL: A — SANTI — FRONTEND (camino crítico: el scaffold destraba a Renzo y Joaco). Google Health (GCP, OAuth, ingest, plan B) pasó a Renzo — ver `prompts/ROL-B-renzo-comidas.md`.

1) SCAFFOLD EXPRÉS (H0-2 — lo primero, PR exprés, mergear YA):
   - create-next-app (TS, Tailwind, App Router) + shadcn/ui + Drizzle/SQLite (`lib/db.ts`, `data/pulso.db`, tabla `raw_events`) + `lib/users.ts` con switcher + `lib/ai.ts` (Gemini, streaming helper).
   - PWA shell por la **guía oficial de Next, SIN libs**: `app/manifest.ts` + service worker a mano + plumbing de push: `lib/push.ts` con `sendPush(userId, payload)` + route de suscripción (web-push + VAPID). Dev con `next dev --experimental-https`.
   - Layout, navegación y componentes base: sos el dueño del sistema visual. Renzo y Joaco arman sus pantallas con TUS componentes.

2) FRONTEND:
   - Home/dashboard del usuario + vista "Cuerpo" (sueño por noche, resting HR): lee de `raw_events` (source `google_health`) lo que ingesta Renzo. Mientras no haya datos reales, armala contra filas de ejemplo con el mismo shape.
   - Al final (H22+): pasada de polish por las pantallas de Renzo (comidas/ánimo/salud) y Joaco (digest/Wrapped) — misma identidad visual en todo.

COSTURAS: exponés `lib/push.ts` (lo usa Joaco para enviar nudges) y los componentes UI (los usan Renzo y Joaco). Si sos el dueño de la Fitbit, el login OAuth de Health lo hacés vos una vez en la laptop (Renzo te avisa).
NO HAGAS: Google Health / GCP / plan B (Renzo), pipeline de comidas (Renzo), ingests de trabajo/digest (Joaco).
CHECKPOINTS: H2 base mergeada y los otros dos destrabados; H8 vista Cuerpo mostrando los datos que ingestó Renzo.
