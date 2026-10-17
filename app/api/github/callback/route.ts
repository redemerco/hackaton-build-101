import { NextRequest } from "next/server";
import { publicOrigin } from "@/lib/public-origin";

// GET /api/github/callback → GitHub vuelve con ?code=... (o ?error=...).
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");

  if (error) return html(`❌ GitHub devolvió un error: <b>${escapeHtml(error)}</b>`, false);
  if (!code) return html("❌ No llegó el <code>code</code> de GitHub.", false);

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return html("❌ Faltan GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET en .env.local", false);
  }

  const redirectUri = `${publicOrigin(req)}/api/github/callback`;

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (data.error || !data.access_token) {
    return html(`❌ GitHub rechazó el canje: <b>${escapeHtml(data.error_description || data.error || "sin token")}</b>`, false);
  }

  // Confirmar quién se logueó
  let login = "(desconocido)";
  try {
    const me = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${data.access_token}`, Accept: "application/vnd.github+json" },
    });
    const u = await me.json();
    login = u.login ?? login;
  } catch {}

  return html(
    `✅ <b>GitHub conectado.</b><br><br>` +
      `usuario: ${escapeHtml(login)}<br>` +
      `scopes: <pre>${escapeHtml((data.scope || "").split(",").join("\n"))}</pre>` +
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
