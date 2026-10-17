# Plan hackathon — "Pulso" (nombre tentativo): salud para devs, tu cuerpo y tu repo en el mismo gráfico

## Contexto

Hackathon de 24-36h, demo **en vivo**, tema: producto con base de IA. Equipo de 3 (Santi, Renzo, Joaco), construyendo 100% con herramientas de IA. Pivot final del equipo: **PWA de salud para developers** que cruza datos del cuerpo (Fitbit API + fotos de comidas analizadas con IA + check-in de ánimo) con datos del trabajo (GitHub, Linear, Slack, Google Calendar).

Decisiones ya tomadas: solo vista **individual** (tu salud + tu laburo, 100% privado — la privacidad deja de ser un problema: son tus datos, para vos), hay una **Fitbit con datos reales** en el equipo, Claude API propia, web/PWA (desktop no es requisito).

**Alerta de factibilidad (verificada 17-oct-2026):** la Web API clásica de Fitbit **se apaga el 30-oct-2026** — no se construye sobre ella. Se usa su sucesora, la **Google Health API** (GA desde mar-2026): se registra en Google Cloud Console, consent screen en modo Testing con los 3 como test users (**gmails personales** — cuentas Workspace pueden no servir). Bonus: comparte proyecto y consent screen con Google Calendar → **un solo OAuth da salud + calendario**.

**Pitch de una frase:** *los devs tienen observabilidad para todo — CPU, latencia, uptime — menos para ellos mismos. Pulso es la observabilidad del developer: tu cuerpo y tu trabajo en el mismo gráfico.*

## Principio (hereda la tesis anterior, ahora más fuerte)

- Todo es **del individuo y para el individuo**. Nada va a un admin ni a la empresa. Es lo contrario del bossware por diseño, no por promesa.
- SPACE (CACM 2021) como respaldo: las horas extra son "brute-force work to overcome bad systems or poor planning" — la app te muestra a VOS lo que tu semana de trabajo le hace a tu cuerpo.
- Correlación ≠ causalidad: Claude narra **observaciones** ("los días con +4h de reuniones dormiste 1h menos"), nunca diagnóstico médico. Disclaimer de no-medicina en la app.

## La IA (dónde vive, concreto)

1. **Foto de comida → análisis**: cámara de la PWA → Claude vision → calorías/macros estimados + comentario con personalidad ("tercera pizza de la semana de deploy").
2. **El digest personal con correlaciones**: Claude recibe tu semana completa (sueño, pulso, pasos, comidas, ánimo, commits, PRs, issues de Linear, reuniones) → insights narrados en streaming: "Tu mejor día de código fue el que dormiste 7h y tuviste 1 sola reunión."
3. **Nudges contextuales**: cruza calendar + actividad del wearable: "tenés 40 min libres antes de la daily y llevás 3h sin moverte → caminá."
4. **Check-in de ánimo** (1 click/día) correlacionado con todo lo demás — la dimensión subjetiva que SPACE exige.
5. **Semana Wrapped personal**: card compartible (opt-in) con tu semana cuerpo+código.

## Momento clave: nosotros somos el dataset

Los 3 usan la app **durante toda la hackathon**: foto a cada comida, check-in de ánimo, trabajo por issues/PRs, reuniones reales en calendar. **El dueño de la Fitbit es el usuario héroe** (wearable + meses de historia real para las correlaciones); los otros dos corren el perfil **"sin wearable"** (comidas + ánimo + trabajo), y eso se pitchea como feature ("funciona sin wearable"), no como hueco. La demo muestra la hackathon misma a través del producto; la ventana de la hackathon aporta el "en vivo".

Checkpoints de dataset: a H8 hay datos de Fitbit ingestados + ≥1 comida analizada; a H20 hay ≥2 días de hackathon completos trackeados (sueño colapsando incluido — eso es oro para la demo).

## Demo script (3 min — esto es el spec)

Patrón de las demos ganadoras (investigado en la ronda anterior): **input real → transformación visible en un click → la IA se VE trabajar → artefacto final concreto.**

- **0:00** Hook: "Monitoreamos CPU, latencia y uptime de todo. Lo único sin observabilidad en un equipo de software es el developer."
- **0:20** Input real: la Fitbit de uno de nosotros, con sus datos reales de meses, conectada a la app instalada en el teléfono (PWA en home screen).
- **0:45** **Momento cámara, en vivo**: le sacamos una foto a una comida/snack frente a los jueces → Claude la analiza en streaming en pantalla.
- **1:20** La correlación estrella, con datos de ESTA hackathon: "este es el sueño de [dueño de la Fitbit] estas dos noches vs. sus commits — acá está el bajón de las 4am que la app le avisó." (Honesto si un juez pregunta de quién es el dato: es suyo; los otros dos corren el perfil sin wearable.)
- **1:50** Nudge push llegando al teléfono en vivo ("llevás 3h sentado y tenés hueco antes del pitch — caminá").
- **2:20** Artefacto final: **Semana Wrapped** del equipo durante la hackathon.
- **2:40** Cierre: "Tus datos, tu dispositivo, nadie más los ve — ni tu empresa. SPACE dice que las horas extra son el sistema fallando, no el dev: esta app te lo muestra antes de que te queme."

## Features rankeadas (orden de construcción = orden de corte inverso)

**Spine (sin esto no hay demo):**
1. PWA base: Next.js instalable (manifest + service worker), switcher de usuario sin auth real (3 usuarios hardcodeados).
2. **Google Health API (Fitbit) OAuth + ingest**: sueño con etapas, pulso (reposo diario + intraday a 1s), HRV, pasos (1 min), SpO2. OAuth estándar de Google web-server con `access_type=offline` (access token dura 1h; en Testing el refresh vence a los 7 días — sobra). Historia en chunks: máx 14 días por query para heart-rate, 90 para el resto. 300 req/min/usuario. **Los datos llegan solo cuando el dispositivo sincroniza** → sync manual antes de cada dry-run y del pitch. Camino crítico — arranca en H0.
3. Foto de comida → Claude vision → registro nutricional (cámara desde la PWA).
4. Ingest trabajo nivel 1: **GitHub (OAuth por usuario, sobre el login de Renzo)** + **Linear (API key)**.
5. Digest personal con correlaciones, **en streaming** (la IA tiene que verse trabajar). Fallback cacheado con efecto typewriter.
6. Check-in de ánimo (1 click).
7. Nudge: al menos 1 real por push (`web-push` + VAPID; en iOS requiere la PWA **instalada en home screen**, iOS 16.4+ — instalarla en los 3 teléfonos el día 1). Fallback: nudge in-app. Sin scheduler ni cron: el nudge se calcula de datos reales y se dispara con un botón oculto "enviar ahora" durante la demo (mismo patrón que "regenerar").
8. Semana Wrapped card (artefacto de cierre).

**Integraciones de trabajo — línea de corte explícita** (eligieron las 4; este es el orden de entrada y de corte):
- GitHub: siempre. Cada usuario conecta **su** GitHub desde el celu con el OAuth que arma Renzo; el ingest usa el token de ese usuario y trae su actividad. Mientras el OAuth no esté, un PAT en `.env.local` alimenta el mismo ingest (misma interfaz).
- Linear: siempre (API key personal) — *con la condición de usarlo de verdad durante la hackathon para que haya datos*.
- Google Calendar: **sube de prioridad** — vive en el mismo proyecto de Google Cloud y la misma consent screen que Google Health (scope `calendar.events.readonly`): un solo login OAuth da salud + calendario. Entra apenas el OAuth de Health funcione.
- Slack: **el primero que se corta**. OAuth más friccionado y el dato (horas activas en chat) es el que menos suma. Si entra: user token con scope `search:read` (`search.messages` — cuenta mensajes y horarios, jamás contenido). Fallback cero-fricción: crear un workspace gratis solo para la demo.

**Stretch (en orden):**
9. Calendar OAuth real.
10. Slack (user token, solo metadata de actividad — jamás contenido de mensajes).
11. Digest en audio (TTS — "escuchá tu semana camino al trabajo").
12. Hidratación/cafeína quick-log.
13. Export/borrado total de datos (botón "esto es tuyo" — barato y refuerza el pitch).

## Stack (mi call — ajustable con la factibilidad)

- **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui**, PWA por la **guía oficial de Next, sin libs**: `app/manifest.ts` + service worker a mano + `web-push` con VAPID; `next dev --experimental-https` (HTTPS es requisito de PWA/push). Serwist solo si hiciera falta offline (no hace falta para la demo).
- **Cámara: `<input type="file" accept="image/*" capture="environment">`** — getUserMedia tiene bugs documentados en PWAs standalone de iOS. Re-encodear a JPEG y achicar en el cliente (canvas) antes de mandar: la API de Claude no acepta HEIC, máx 10MB, ~1.5k tokens por imagen de 1092².
- **SQLite local (Drizzle)** — cero setup. JSON crudo de cada fuente + queries que derivan; no diseñar schema propio.
- **Claude API** (`claude-sonnet-5-5`): vision para comidas, streaming para digest. Un solo pipeline simple, sin multi-agente (lección PostHog). Comidas: desglose por ítem en gramos y **rangos** de calorías, no un número seco — la literatura mide ~±30% desde foto; con rangos somos honestos y defendibles ante jueces.
- **Google Health API + Calendar** (mismo OAuth); **Octokit** con PAT; **Linear GraphQL** con API key — ojo: header `Authorization: <API_KEY>` **sin** "Bearer" (ahorra 30 min de debugging); Slack según línea de corte.
- **Demo: laptop en localhost; el teléfono entra por túnel HTTPS con dominio estático (ngrok free incluye uno) sobre hotspot propio.** La PWA instalada y su push subscription quedan atadas al origin: el dominio se fija en H0 y no cambia más, o la PWA instalada el día 1 muere antes del pitch. El OAuth **nunca pasa por el túnel**: corre una sola vez por usuario en la laptop con callback `localhost`; el teléfono solo lee datos a través del túnel. Backup: deploy Vercel + Neon si el túnel molesta en el dry-run 1. Resiliencia: datos pre-ingestados, fallbacks cacheados.
- Login y OAuth de GitHub por usuario: **real**, lo arma Renzo. El switcher queda hasta que su login esté en `main`.

## Reparto (3 personas, todos con IA)

- **A — Santi — Frontend**: scaffold exprés de la base (destraba a los otros dos) + PWA shell + sistema de UI y componentes compartidos + vista Cuerpo (sobre los datos que ingesta Renzo) + polish final de todas las pantallas.
- **B — Renzo — Google Health + Comidas**: GCP (consent screen, cliente OAuth, Playground go/no-go) + Google Health OAuth/ingest + plan B; cámara → Claude vision (gramos + rangos) en el teléfono, check-in de ánimo, túnel de dominio estático + instalación de la PWA en los 3 teléfonos, botón demo del nudge. Dueño del go/no-go de salud y del beat 0:45.
- **C — Joaco — El resto (trabajo + cerebro + pitch)**: ingest GitHub/Linear (+Calendar sobre el OAuth de Renzo), digest en streaming, cálculo y envío del nudge (vía `lib/push.ts` de Santi), Wrapped, pitch y dry-runs.

Costuras (para que todo conecte): A publica `lib/push.ts` (sendPush) y los componentes de UI; B y C arman sus pantallas con esos componentes; C expone el endpoint del nudge que B dispara desde su botón; todos escriben a `raw_events` y el digest de C solo lee de ahí.

Hora 0 (los 3 juntos, 1 hora máx), en este orden:
1. **Check de la Fitbit — el go/no-go real**: el dueño abre la app Google Health y confirma que su cuenta está migrada a Google y los datos se ven (los logins Fitbit murieron en sep-2026; cuentas no migradas **perdieron sus datos**).
2. Proyecto en Google Cloud: habilitar Health API + Calendar API, cliente OAuth web, consent screen External en modo Testing, los 3 como test users con gmails personales.
3. **Token sin escribir código, con NUESTRAS credenciales**: en el OAuth 2.0 Playground, "Use your own OAuth credentials" con el client ID/secret del proyecto recién creado — el Playground con el cliente default de Google puede pasar donde nuestra app fallaría. Dos requests: uno de hoy y uno de **sleep de hace 3 meses**, que valida que la historia migrada de la Fitbit está expuesta. Si la historia viene vacía, el beat de correlaciones usa solo la ventana de la hackathon y lo sabemos desde el día 0.
4. **Fijar el dominio estático del túnel** (ngrok free incluye uno): la PWA y el push quedan atados a ese origin desde el día 1.
5. Repo + esqueleto PWA + PAT de GitHub + API key de Linear + contrato "JSON crudo por fuente".

Después, paralelo total. **Si el paso 1 o 3 falla → plan B inmediato**: export de Apple Health si hay iPhone/Watch (zip sin auth, se parsea offline) o dataset sintético declarado en el pitch — misma UI, cero vergüenza.

## Timeline (36h)

- **H0-2**: setup (app Fitbit OAuth, repo, esqueleto PWA, keys de todo).
- **H2-8**: vertical slice: datos reales de Google Health visibles en la app + 1 foto de comida analizada end-to-end. **Si Google Health no fluye a H6, se activa plan B sin discusión** (export/datos sintéticos con la misma UI).
- **H8-16**: ingest GitHub/Linear + digest de correlaciones en streaming.
- **H16-22**: ánimo + nudges + Wrapped + Calendar (mock→real si hay aire).
- **H22-26**: polish + stretch solo si el spine está cerrado.
- **H26-30**: 3 dry-runs completos cronometrados (incluye el beat de la foto en vivo y el push al teléfono) + fallbacks + dormir.

**Si son 24h y no 36**: corta después del punto 5 del spine (digest). Ánimo/nudge/Wrapped pasan a stretch; el demo script pierde los beats de 1:50 y 2:20 y sigue en pie.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| La cuenta Fitbit nunca migró a Google (datos borrados) o el OAuth de Health traba | Check en Hora 0 (app Google Health + OAuth Playground); plan B automático a H6: export de Apple Health o dataset sintético declarado |
| Datos del wearable no aparecen | Solo llegan al sincronizar el dispositivo: sync manual antes de cada dry-run y del pitch |
| Jueces preguntan por precisión de calorías | Rangos, no números; Cal AI (15M descargas, ~US$30M/año, comprada por MyFitnessPal, corre sobre modelos de Anthropic) opera con la misma tolerancia — el mercado ya la validó |
| 4 OAuths se comen la hackathon | Línea de corte explícita: GitHub/Linear sí o sí, Calendar mock primero, Slack último |
| Claude API falla durante el pitch | Digest y análisis de comida cacheados que se re-reproducen con efecto typewriter |
| Push en iOS no llega | Requiere PWA instalada en home screen (iOS 16.4+): instalar en los 3 teléfonos el día 1; fallback: nudge in-app con la app abierta |
| Correlaciones con 30h de datos = ruido | La Fitbit trae meses de historia real; la hackathon aporta el vivo. Claude narra observaciones, no causalidad |
| Wifi de hackathon | localhost + datos pre-ingestados + teléfono por hotspot propio |
| Nuestro propio scope creep | Spine no se negocia; stretch se corta en orden inverso |
| "Es una app médica" (pregunta de juez) | No: observabilidad personal, disclaimers, cero diagnóstico. Tus datos nunca salen de tu instancia |

## Posicionamiento (investigación verificada, 17-oct-2026)

**El hueco está libre** (hasta donde se pudo verificar — nadie encontrado une el cuerpo del dev con su semana de trabajo):
- **Exist.io** (vivo, US$6,99/mes) es lo más cercano: correlaciona GitHub, Calendar, Oura, Apple Health… pero es genérico, y no integra Linear ni Slack.
- **Rootly On-Call Health** (beta, open source) es el competidor del lado trabajo: burnout desde Slack/GitHub/Linear/Jira — **sin wearables**. Nosotros somos sus dos mitades juntas.
- **Lifestack** planifica tu calendario según el wearable — sin datos de trabajo dev.
- **Whoop/Oura** te dicen cómo dormiste; nosotros te decimos **qué de tu semana laboral te lo causó**.

**Munición de pitch:**
- **Cal AI** validó el apetito por foto→nutrición: 15M+ descargas, ~US$30M/año, comprada por MyFitnessPal (2026), corre sobre modelos de Anthropic. Su crítica famosa (no ve el aceite oculto) la respondemos con rangos honestos.
- No se encontró ningún ganador de hackathon 2024-2026 en developer health/burnout — espacio fresco para los jueces.
- Hereda de la ronda anterior: bossware (EFF: "indistinguishable from stalkerware", Hubstaff/Time Doctor publican guías anti-mouse-jiggler), SPACE ("brute-force work to overcome bad systems"), patrón de demo ganadora, y la vara "this feels like a product, not a hackathon project".

## Verificación

1. **Hora 0, pasos 1-3**: app Google Health con datos visibles + token desde OAuth Playground **con las credenciales del proyecto propio** + request de sleep de hace 3 meses. Es el go/no-go de todo el lado salud, sin escribir código.
2. **Vertical slice a H8**: Google Health real → app, foto → análisis. Si no, plan B automático.
3. **Checkpoints de dataset**: H8 (wearable + 1 comida), H20 (2 días completos trackeados de los 3).
4. **3 dry-runs** del demo script completo, cronometrados, con el teléfono real (túnel + hotspot probados, Fitbit sincronizada antes de cada uno) y fallbacks probados (matar túnel y wifi en el dry-run 2).
