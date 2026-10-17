import { NextRequest } from "next/server";
import { publicOrigin } from "@/lib/public-origin";

// GET /api/slack/callback → Slack vuelve con ?code=... (o ?error=...).
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");

  if (error) return html(`❌ Slack devolvió un error: <b>${escapeHtml(error)}</b>`, false);
  if (!code) return html("❌ No llegó el <code>code</code> de Slack.", false);

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return html("❌ Faltan SLACK_CLIENT_ID / SLACK_CLIENT_SECRET en .env.local", false);
  }

  const redirectUri = `${publicOrigin(req)}/api/slack/callback`;

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  const data = await res.json().catch(() => ({}));

  // Slack siempre responde 200; el éxito está en data.ok
  if (!data.ok) {
    return html(`❌ Slack rechazó el canje: <b>${escapeHtml(data.error || "desconocido")}</b>`, false);
  }

  const team = data.team?.name ?? "(sin nombre)";
  const userScopes = data.authed_user?.scope ?? "";
  const hasUserToken = Boolean(data.authed_user?.access_token);

  return html(
    `✅ <b>Slack conectado.</b><br><br>` +
      `workspace: ${escapeHtml(team)}<br>` +
      `user token: ${hasUserToken ? "recibido" : "no"}<br>` +
      `scopes: <pre>${escapeHtml(userScopes.split(",").join("\n"))}</pre>` +
      `<br>Ya podés cerrar esta pestaña.`,
    true,
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function html(body: string, ok: boolean): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<body style="font-family:system-ui;background:#0b0d12;color:#e6e8ee;padding:24px;line-height:1.5">` +
      `<div style="max-width:560px;margin:0 auto;border:1px solid ${ok ? "#2a6" : "#a33"};border-radius:12px;padding:20px">${body}</div>` +
      `</body>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
