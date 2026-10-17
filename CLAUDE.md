# CLAUDE.md — Pulso (hackathon de fin de semana)

Contexto para los agentes de Claude Code del equipo. El plan completo está en `PLAN.md`. Los prompts de cada rol están en `prompts/`.

## Qué estamos construyendo

**Pulso**: una PWA de salud para developers. Muestra **tu cuerpo y tu trabajo en el mismo gráfico**.
- Cuerpo: Fitbit vía **Google Health API** (la Web API clásica de Fitbit se apaga el 30-oct-2026, no se usa), fotos de comida analizadas con Claude vision y check-in de ánimo.
- Trabajo: GitHub, Linear y Google Calendar. Slack es lo primero que se corta.
- Todo es **individual y privado**: nada va a un admin ni a la empresa. Es anti-bossware por diseño.
- Claude narra **observaciones y correlaciones, nunca diagnóstico médico**. El disclaimer de no-medicina se ve en la app.

Es una hackathon de **un fin de semana** con demo en vivo de 3 minutos. Por eso:
- **Simple > completo.** El spine de `PLAN.md` no se negocia; el stretch entra solo si sobra tiempo.
- Planificamos con el **corte de 24h**: el spine llega hasta el digest (punto 5). Ánimo, nudge y Wrapped son bonus en ese orden.
- Nada de abstracciones, multi-agente, tests exhaustivos ni infraestructura "para producción". Si algo no aparece en la demo, probablemente no hace falta.
- Toda feature que se vea en la demo necesita **fallback cacheado**, porque la API o el wifi pueden morir en vivo.

## Equipo y roles (no pisarse)

| Rol | Quién | Dueño de | No toca |
|---|---|---|---|
| A | Santi | Scaffold, PWA shell, sistema de UI, `lib/push.ts`, Google Health OAuth/ingest, vista Cuerpo, polish final | Comidas, ingests de trabajo, digest |
| B | Renzo | Cámara → Claude vision (comidas), check-in de ánimo, túnel ngrok, PWA en los teléfonos, botón demo del nudge | Scaffold/UI, OAuth de salud, digest |
| C | Joaco | Ingests GitHub/Linear/Calendar, digest en streaming, endpoint del nudge, Wrapped, pitch y dry-runs | Scaffold/PWA/UI, cámara/comidas |

Si una tarea cae en el área de otro rol, **avisá y coordiná, no la hagas vos**. Si la base de Santi todavía no está, no la crees: avanzá con lo que no la necesita.

## Contrato compartido (no romperlo)

- **Stack**: Next.js App Router + TypeScript + Tailwind + shadcn/ui, en la raíz del repo. PWA por la guía oficial de Next, sin libs (`app/manifest.ts` + service worker a mano). Dev con `next dev --experimental-https`.
- **DB**: SQLite + Drizzle. `lib/db.ts`, archivo `data/pulso.db`. Tabla genérica:
  `raw_events(id, source, kind, user_id, ts, json)`. Cada ingest escribe el **JSON crudo** ahí y las vistas derivan con queries. No se diseñan schemas propios (solo `meals`/`checkins` si de verdad hace falta).
- **Usuarios**: hardcodeados en `lib/users.ts` (`"santi" | "renzo" | "joaco"`) + switcher en la UI. **Sin auth real** (nada de next-auth).
- **Claude**: cliente compartido en `lib/claude.ts`, modelo `claude-sonnet-5-5`, con helper de streaming. Un solo pipeline simple.
- **Ingests**: en `lib/sources/<fuente>.ts`.
- **Push**: `lib/push.ts` exporta `sendPush(userId, payload)` (web-push + VAPID).
- **Secrets**: en `.env.local`, que **nunca se commitea**: `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `LINEAR_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

**Costuras**: Santi publica `lib/push.ts` y los componentes de UI. Renzo y Joaco arman sus pantallas con esos componentes. Joaco expone el endpoint del nudge y Renzo lo dispara con su botón. Todos escriben a `raw_events` y el digest solo lee de ahí.

## Git: directo a `main`, sin vueltas

- Se commitea y pushea **directo a `main`**. Sin ramas ni PRs obligatorios.
- **Commits chicos y frecuentes**, con mensajes claros (`feat: ...`, `fix: ...`). Los commits son parte del dataset de la demo: el digest cruza commits con sueño y ánimo.
- **Antes de pushear, `git pull --rebase`**: somos 3 pusheando al mismo `main`. Si hay conflicto en un archivo de otro rol, resolvelo conservando su cambio y avisá.
- Nunca `push --force` a `main`.

## Gotchas conocidos (ahorran horas)

- **Linear**: header `Authorization: <API_KEY>` **sin** `Bearer`.
- **Google Health**: OAuth web-server con `access_type=offline`. El access token dura 1h y el refresh vence a los 7 días en modo Testing. Máximo 14 días por query para heart-rate y 90 para el resto; límite de 300 req/min. Los datos llegan **solo cuando el dispositivo sincroniza**.
- **Google Calendar** comparte proyecto y consent screen con Google Health (scope `calendar.events.readonly`): un solo OAuth da salud + calendario.
- **El OAuth nunca pasa por el túnel**: corre en la laptop con callback `localhost`. El teléfono solo lee datos por el túnel.
- **Dominio del túnel fijo** (ngrok estático): la PWA instalada y la push subscription quedan atadas a ese origin.
- **Cámara**: `<input type="file" accept="image/*" capture="environment">`, **no** getUserMedia (tiene bugs en PWAs standalone de iOS). Re-encodear a JPEG con canvas antes de mandar (Claude no acepta HEIC, máx 10MB).
- **Calorías**: siempre en **rangos** y con desglose por ítem en gramos, nunca un número seco.
- **Push en iOS**: requiere la PWA instalada en home screen (iOS 16.4+).
- **Nudges**: sin cron ni scheduler. Se calculan de datos reales y se disparan con un botón oculto de demo.

## Plan B (gate a H6)

Si Google Health no fluye a H6, se activa sin discusión: export de Apple Health o un dataset sintético declarado en el pitch. Va detrás de la **misma interfaz** (escribe a `raw_events` igual) para que el resto de la app no se entere.
