import { cookies } from "next/headers";
import { deleteConnection } from "@/lib/connections";
import { PROVIDERS, callbackUrl, isProvider } from "@/lib/oauth";
import { getCurrentUser } from "@/lib/users";

const STATE_COOKIE = "pulso_oauth_state";

// GET /api/connect/github|linear|slack → redirige al login del proveedor (lo usa el botón "Conectar" de Ajustes).
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProvider(provider)) return new Response("Proveedor desconocido", { status: 404 });
  const cfg = PROVIDERS[provider];
  if (!cfg.clientId) return new Response(`Falta ${provider.toUpperCase()}_CLIENT_ID en .env.local`, { status: 500 });

  // state anti-CSRF: el callback solo acepta la vuelta del login que arrancó este navegador.
  const state = crypto.randomUUID();
  (await cookies()).set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });

  const url = new URL(cfg.authorizeUrl);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: callbackUrl(req, provider),
    [cfg.scopeParam ?? "scope"]: cfg.scope,
    state,
    response_type: "code",
    ...(cfg.extraAuthParams ?? {}),
  }).toString();
  for (const [k, v] of Object.entries(cfg.extraParams ?? {})) if (v) url.searchParams.set(k, v);
  return Response.redirect(url, 302);
}

// DELETE /api/connect/github|linear → desconecta (borra el token del usuario actual).
export async function DELETE(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProvider(provider)) return new Response("Proveedor desconocido", { status: 404 });
  deleteConnection((await getCurrentUser()).id, provider);
  return new Response(null, { status: 204 });
}
