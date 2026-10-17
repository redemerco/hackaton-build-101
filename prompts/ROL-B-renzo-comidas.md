# Prompt — Rol B · Renzo: Google Health + Comidas

Pegá todo esto en tu sesión de Claude Code parado en la raíz del repo.

---

CONTEXTO
Hackathon 24-36h, demo en vivo. Producto: **Pulso** — PWA de salud para developers: cruza datos del cuerpo (Fitbit vía Google Health API, fotos de comidas analizadas con Claude vision, check-in de ánimo) con datos del trabajo (GitHub, Linear, Calendar; Slack stretch). Todo individual y privado: anti-bossware por diseño. Somos 3, cada uno con su sesión de Claude Code en este repo, en paralelo. Roles: **A = Santi, B = Renzo (vos), C = Joaco**.

ANTES DE ARRANCAR: leé `PLAN.md` en la raíz (plan completo: demo script, spine, riesgos, Hora 0).

CONTRATO COMPARTIDO (no romperlo — Santi y Joaco trabajan en paralelo):
- Next.js App Router + TypeScript + Tailwind + shadcn/ui, en la raíz del repo. **El scaffold y el sistema de UI los hace Santi (Rol A)** — tus pantallas se arman con sus componentes; si la base no está, no la crees vos: coordiná.
- SQLite + Drizzle: `lib/db.ts`, archivo `data/pulso.db`. Tabla genérica `raw_events(id, source, kind, user_id, ts, json)` — cada ingest escribe JSON crudo ahí; las vistas derivan con queries. Tablas propias solo si hace falta (meals, checkins).
- Usuarios hardcodeados en `lib/users.ts`: "santi" | "renzo" | "joaco" + switcher en la UI. SIN auth real (nada de next-auth).
- IA: **Gemini** (no Claude, por costo). Cliente compartido en `lib/ai.ts`, modelo `gemini-flash-latest`, helper `streamText()` (ver Contrato en el README).
- `.env.local` (NUNCA se commitea): GEMINI_API_KEY, GITHUB_TOKEN, LINEAR_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
- Git: commits chicos y frecuentes directo a `main` (son parte del dataset de la demo). `git pull --rebase` antes de pushear; nunca `push --force`.
- El spine de PLAN.md no se negocia; stretch solo si sobra. Simple > completo.

TU ROL: B — RENZO — GOOGLE HEALTH + COMIDAS (dueño del go/no-go de salud y del beat 0:45 de la demo: la foto en vivo frente a los jueces)

0) GOOGLE HEALTH — CAMINO CRÍTICO, arranca en H0 (lo recibiste de Santi):
   Estado al 17-oct (ya hecho por Santi):
   - Fitbit: la app Google Health muestra los datos (cuenta migrada ✅).
   - Proyecto GCP **`build-101`** (ID `build-101-511915`, dueño: gmail personal de Santi) con **Google Health API** (`health.googleapis.com`, v4) y **Google Calendar API** habilitadas ✅.
   - Pedile a Santi que te sume como **Owner** del proyecto con tu gmail personal (IAM).
   Lo que falta (manual, en https://console.cloud.google.com/auth/overview?project=build-101-511915):
   a. Consent screen: app name `build101` (el nombre del producto todavía no está definido), External, modo **Testing** (no publicar), los 3 como test users con **gmails personales**.
   b. Data Access, scopes (pegarlos a mano):
      `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
      `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
      `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
      `https://www.googleapis.com/auth/calendar.events.readonly`
   c. Clients → Web application, redirect URIs: `http://localhost:3000/api/health/callback` y `https://developers.google.com/oauthplayground`. Client ID/secret → `.env.local` de cada uno (pasalos por privado, nunca al repo).
   d. **Go/no-go**: OAuth 2.0 Playground con "Use your own OAuth credentials", logueado con la cuenta del dueño de la Fitbit: un request de hoy y uno de **sleep de hace 3 meses**. Si la historia viene vacía, las correlaciones usan solo la ventana de la hackathon — avisar al equipo. Discovery doc: `https://health.googleapis.com/$discovery/rest?version=v4`.
   Código:
   - `lib/sources/googleHealth.ts` + `app/api/health/connect` (OAuth authorization code, `access_type=offline`, callback `http://localhost:3000/api/health/callback`) + `app/api/health/sync`. El login lo hace el dueño de la Fitbit, una vez, en la laptop (nunca por el túnel).
   - Ingest a `raw_events` (source `google_health`): sueño con etapas, resting HR diario, HR intraday, pasos, HRV. Historia en chunks: **máx 14 días por query para heart-rate, 90 para el resto**. Límite: 300 req/min.
   - Gotchas: access token dura 1h (refresh expira a los 7 días en Testing — alcanza); los datos aparecen **solo cuando el dispositivo sincroniza** (sync manual antes de cada demo).
   - La vista "Cuerpo" la arma Santi leyendo tus `raw_events` — acordá con él el shape de `kind`/`json`.
   - PLAN B (gate: si Google Health no fluye a H6, se activa sin discusión): parser de export de Apple Health (zip→XML) O generador de datos sintéticos realistas declarado en el pitch — escribe `raw_events` igual.

1) MIENTRAS SANTI SCAFFOLDEA (H0-2, no te bloquees):
   - Issue + diseño del prompt de visión: probalo DIRECTO contra la API de Claude con 2-3 fotos reales de comida (un script suelto alcanza) hasta que el output sea bueno.
   - Hora 0 paso 4: **túnel con dominio estático** (ngrok free incluye uno) — la PWA instalada y su push subscription quedan atadas a ese origin: se fija hoy y no cambia más. El OAuth **nunca pasa por el túnel** (corre en la laptop con callback localhost).

2) PIPELINE DE COMIDAS (apenas la base de Santi esté mergeada):
   - Página "Comida": `<input type="file" accept="image/*" capture="environment">` — **NO getUserMedia** (bugs documentados en PWA standalone de iOS).
   - Re-encodear en el cliente a **JPEG** con canvas y achicar (la API de Claude NO acepta HEIC; máx 10MB).
   - Claude vision: desglose por ítem en gramos + calorías en **RANGOS** (no un número seco — la literatura mide ±30% desde foto) + un comentario con personalidad. Respuesta en streaming visible. Guardar en `raw_events`/meals.
   - Cachear el último análisis bueno (fallback de demo si la API muere en vivo).

3) ÁNIMO: check-in 1 click (1-5) → `raw_events`. Misma zona de UI de registro.

4) TELÉFONOS Y NUDGE DEMO:
   - Instalar la PWA en los 3 teléfonos apenas exista (iOS: el push requiere **home screen**, 16.4+).
   - Botón oculto "enviar ahora" para el beat del nudge (1:50): llama al endpoint de Joaco, que calcula y envía vía `lib/push.ts` de Santi. Vos solo el disparador de demo. SIN cron ni scheduler.

COSTURAS: usás los componentes UI de Santi y `lib/ai.ts` (Gemini); el nudge lo calcula Joaco — vos ponés el botón; Joaco reusa tu OAuth de Google para Calendar; Santi muestra tus datos de salud en "Cuerpo".
NO HAGAS: scaffold/sistema de UI ni vista Cuerpo (Santi), digest/ingests de trabajo (Joaco).
CHECKPOINTS: H8 datos reales de Google Health en `raw_events` + foto → análisis end-to-end funcionando EN EL TELÉFONO.
