import { NextRequest } from "next/server";
import { publicOrigin } from "@/lib/public-origin";

// GET /api/linear/callback → Linear vuelve con ?code=... (o ?error=...).
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");

  if (error) return html(`❌ Linear devolvió un error: <b>${escapeHtml(error)}</b>`, false);
  if (!code) return html("❌ No llegó el <code>code</code> de Linear.", false);

  const clientId = process.env.LINEAR_CLIENT_ID;
  const clientSecret = process.env.LINEAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return html("❌ Faltan LINEAR_CLIENT_ID / LINEAR_CLIENT_SECRET en .env.local", false);
  }

  const redirectUri = `${publicOrigin(req)}/api/linear/callback`;

  const res = await fetch("https://api.linear.app/oauth/token", {
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

  if (!res.ok || !data.access_token) {
    return html(`❌ Linear rechazó el canje: <b>${escapeHtml(data.error || `HTTP ${res.status}`)}</b>`, false);
  }

  // Confirmar quién se logueó via GraphQL viewer
  let me = "(desconocido)";
  try {
    const g = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: data.access_token },
      body: JSON.stringify({ query: "{ viewer { name email } }" }),
    });
    const j = await g.json();
    const v = j?.data?.viewer;
    if (v) me = `${v.name} <${v.email}>`;
  } catch {}

  return html(
    `✅ <b>Linear conectado.</b><br><br>` +
      `usuario: ${escapeHtml(me)}<br>` +
      `scopes: ${escapeHtml(data.scope || "read")}<br>` +
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
