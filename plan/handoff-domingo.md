# Handoff domingo 18-oct (freeze ~13:00)

Todo lo de Santi está en `main` y pasa tsc + eslint + smoke + las 5 pantallas en 200. El reporte a Slack se probó de punta a punta con un webhook falso: las fichas apagadas no llegan.

## Renzo: el NAS (bloquea la demo)
1. Poner en el NAS `GEMINI_API_KEY` (o `AI_SERVICE_URL`) y `SLACK_WEBHOOK_URL`, y **redeployar `main`**. Ahora mismo el NAS corre código viejo y todas las rutas de IA dan 502.
2. Verificar: abrir `/api/ai-status`. Tiene que decir `ok: true`.
3. `npm run eval:ai`: anotar el N/6 real para el pitch.
4. En el NAS: `npm run demo:clear` (la demo usa **solo datos reales**; borra lo simulado si se cargó). Después abrir Yo, Salud, Trabajo y Semana una vez para precalentar el caché de la IA.
5. Si sobra tiempo: `app/trabajo/page.tsx`, los rótulos de Calendar fijos (ver `plan/renzo.md`).

## Joaco: pitch
1. La demo usa **datos reales** (Santi con su Fitbit, GitHub, Slack, Calendar y Linear). Si algo aparece rotulado `[datos simulados]`, falta correr `npm run demo:clear` en el NAS.
2. La pieza estrella es Yo → "Contarle a mi equipo cómo vengo" → vista previa → Slack. Practicarla.
3. Para la "comprobación de calidad" de la IA: mostrar el N/6 de `eval:ai`.
4. P2 si sobra: fila de sueño en el Wrapped (`plan/joaco.md` punto 7).

## Seguridad: no se arregló antes del pitch, decirlo si preguntan
- La cookie de usuario no está firmada: cualquiera puede hacerse pasar por otro usuario.
- `/api/nudge`, `/api/sync/*` e `/api/ingesta/procesar` están abiertos.
- El callback de OAuth sin sesión guarda el token como "guest".
