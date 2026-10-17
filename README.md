# hackaton-build-101
Hackatón Build 101

## Setup

1. Cloná el repo y abrí Claude Code en la raíz. Te va a ofrecer instalar el plugin **ECC** (skills, agentes y comandos `/ecc:*`): aceptá.
2. Los hooks de ECC corren en perfil `minimal` (lo fija `.claude/settings.json`), así no frenan cada edición durante la hackathon.
3. Abrí tu prompt en `prompts/` (A = Santi, B = Renzo, C = Joaco) y pegalo en tu sesión. El plan completo está en `PLAN.md`.

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

## Contrato (no romper sin avisar)

| Archivo | Qué expone |
|---|---|
| `lib/db.ts` | `db` (Drizzle), tablas `rawEvents` / `pushSubscriptions`, `insertRawEvents(rows): number` (idempotente por `user_id+source+kind+ts`) |
| `lib/users.ts` | `getCurrentUser()` (server, lee cookie `pulso_user`, default santi), `USERS`, `isUserId`, `type UserId` |
| `lib/user-list.ts` | lo mismo sin `server-only`, para componentes cliente |
| `lib/ai.ts` | Gemini: `MODEL` (`gemini-flash-latest`), `getAI()`, `streamText({ contents, config? }): ReadableStream` → `return new Response(streamText({...}))`. Imágenes: partes `{ inlineData: { mimeType, data } }` |
| `lib/push.ts` | `sendPush(userId, { title, body, url? })` → `{ sent, removed }`, `saveSubscription` |
| `components/` | `PageHeader`, `EmptyState`, `StatCard`, `ui/*` (shadcn: button, card, badge, skeleton, sonner, select) |

`raw_events`: `source` = fuente (`google_health`, `github`, `linear`, `meal`, `mood`…), `kind` = tipo dentro de la fuente, `ts` = ISO 8601 UTC, `json` = payload crudo.
Next 16.4 con `cacheComponents` **apagado**: todas las páginas son dinámicas, podés usar `getCurrentUser()` sin `Suspense`.
