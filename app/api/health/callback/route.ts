import { NextRequest } from "next/server";
import { publicOrigin } from "@/lib/public-origin";

// GET /api/health/callback → Google vuelve acá con ?code=... (o ?error=...).
// Canjea el code por tokens para confirmar que el login anduvo.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");

  if (error) {
    return html(`❌ Google devolvió un error: <b>${escapeHtml(error)}</b>`, false);
  }
  if (!code) {
    return html("❌ No llegó el <code>code</code> de Google.", false);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return html("❌ Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en .env.local", false);
  }

  const redirectUri = `${publicOrigin(req)}/api/health/callback`;

  // Canje code → tokens
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return html(
      `❌ No se pudo canjear el code (HTTP ${res.status}).<br><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`,
      false,
    );
  }

  const scopes: string = data.scope ?? "";
  const hasRefresh = Boolean(data.refresh_token);

  return html(
    `✅ <b>Login de Google OK.</b><br><br>` +
      `access_token: recibido<br>` +
      `refresh_token: ${hasRefresh ? "sí" : "no (reusó consentimiento)"}<br>` +
      `scopes concedidos:<br><pre>${escapeHtml(scopes.split(" ").join("\n"))}</pre>` +
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
