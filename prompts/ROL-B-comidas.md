# Prompt — Rol B: Comidas

Pegá todo esto en tu sesión de Claude Code parado en la raíz del repo.

---

CONTEXTO
Hackathon 24-36h, demo en vivo. Producto: **Pulso** — PWA de salud para developers: cruza datos del cuerpo (Fitbit vía Google Health API, fotos de comidas analizadas con Claude vision, check-in de ánimo) con datos del trabajo (GitHub, Linear, Calendar; Slack stretch). Todo individual y privado: anti-bossware por diseño. Somos 3 (Santi, Renzo, Joaco), cada uno con su sesión de Claude Code en este repo, en paralelo.

ANTES DE ARRANCAR: leé `PLAN.md` en la raíz (plan completo: demo script, spine, riesgos, Hora 0).

CONTRATO COMPARTIDO (no romperlo — hay 2 personas más trabajando en paralelo):
- Next.js App Router + TypeScript + Tailwind + shadcn/ui, en la raíz del repo. **El scaffold y el sistema de UI los hace el Rol A** — tus pantallas se arman con sus componentes; si la base no está, no la crees vos: coordiná.
- SQLite + Drizzle: `lib/db.ts`, archivo `data/pulso.db`. Tabla genérica `raw_events(id, source, kind, user_id, ts, json)` — cada ingest escribe JSON crudo ahí; las vistas derivan con queries. Tablas propias solo si hace falta (meals, checkins).
- Usuarios hardcodeados en `lib/users.ts`: "santi" | "renzo" | "joaco" + switcher en la UI. SIN auth real (nada de next-auth).
- Cliente Claude compartido en `lib/claude.ts`, modelo `claude-sonnet-5-5`, helper de streaming.
- `.env.local` (NUNCA se commitea): ANTHROPIC_API_KEY, GITHUB_TOKEN, LINEAR_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
- Ritual obligatorio (ES el dataset de la demo): cada feature arranca como issue de GitHub con el scope en el body → rama → PR con "closes #N" → review con al menos un comment real. Nunca commit directo a main.
- El spine de PLAN.md no se negocia; stretch solo si sobra. Simple > completo.

TU ROL: B — COMIDAS (dueño del beat 0:45 de la demo: la foto en vivo frente a los jueces)

1) MIENTRAS A SCAFFOLDEA (H0-2, no te bloquees):
   - Issue + diseño del prompt de visión: probalo DIRECTO contra la API de Claude con 2-3 fotos reales de comida (un script suelto alcanza) hasta que el output sea bueno.
   - Hora 0 paso 4: **túnel con dominio estático** (ngrok free incluye uno) — la PWA instalada y su push subscription quedan atadas a ese origin: se fija hoy y no cambia más. El OAuth **nunca pasa por el túnel** (corre en la laptop con callback localhost).

2) PIPELINE DE COMIDAS (apenas la base de A esté mergeada):
   - Página "Comida": `<input type="file" accept="image/*" capture="environment">` — **NO getUserMedia** (bugs documentados en PWA standalone de iOS).
   - Re-encodear en el cliente a **JPEG** con canvas y achicar (la API de Claude NO acepta HEIC; máx 10MB).
   - Claude vision: desglose por ítem en gramos + calorías en **RANGOS** (no un número seco — la literatura mide ±30% desde foto) + un comentario con personalidad. Respuesta en streaming visible. Guardar en `raw_events`/meals.
   - Cachear el último análisis bueno (fallback de demo si la API muere en vivo).

3) ÁNIMO: check-in 1 click (1-5) → `raw_events`. Misma zona de UI de registro.

4) TELÉFONOS Y NUDGE DEMO:
   - Instalar la PWA en los 3 teléfonos apenas exista (iOS: el push requiere **home screen**, 16.4+).
   - Botón oculto "enviar ahora" para el beat del nudge (1:50): llama al endpoint de C, que calcula y envía vía `lib/push.ts` de A. Vos solo el disparador de demo. SIN cron ni scheduler.

COSTURAS: usás los componentes UI de A y `lib/claude.ts`; el nudge lo calcula C — vos ponés el botón.
NO HAGAS: scaffold/sistema de UI (A), OAuth de salud (A), digest/ingests de trabajo (C).
CHECKPOINT H8: foto → análisis end-to-end funcionando EN EL TELÉFONO.
