# Setup app de Slack (para Joaco)

El botón "Conectar Slack" y las rutas OAuth ya están en la PWA. Falta crear la app
de Slack y pasar las credenciales. **Usar un workspace de demo gratis, NO el del laburo.**

## Pasos en https://api.slack.com/apps

1. **Create New App** → *From scratch*.
   - Name: `Pulso` (o lo que quieras)
   - Workspace: el de **demo** (crear uno gratis si no hay)

2. **OAuth & Permissions**:
   - En *Redirect URLs* → **Add New Redirect URL**:
     ```
     https://pulso.renzodemarco.com.uy/api/slack/callback
     ```
     (Save URLs)
   - En *Scopes → User Token Scopes* → agregar:
     ```
     search:read
     ```
     (solo metadata de actividad; NUNCA contenido de mensajes — ver PLAN.md)

3. **Basic Information → App Credentials**: copiar
   - **Client ID**
   - **Client Secret**

## Qué me pasás

Solo estos dos valores:
```
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
```
Los cargo en el `.env.local` del NAS (que NO se commitea) y reinicio. Listo.

## Probar

Entrar a https://pulso.renzodemarco.com.uy/trabajo → "Conectar Slack" → autorizar
en el workspace de demo → el callback muestra "✅ Slack conectado" con los scopes.
