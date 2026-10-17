import "server-only";
import { saveConnection, type Connection, type Provider } from "@/lib/connections";

// OAuth web-server de GitHub y Linear: botón "Conectar" → login en el proveedor → /api/connect/<p>/callback.
type Config = {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  /** Slack pide los permisos de usuario en `user_scope`; el resto en `scope`. */
  scopeParam?: "scope" | "user_scope";
  /** Parámetros extra para la URL de login. */
  extraParams?: Record<string, string | undefined>;
  clientId?: string;
  clientSecret?: string;
  /** Login o email de la cuenta, para mostrar "conectado como …". */
  account: (token: string) => Promise<string>;
  /** Saca el token de la respuesta si no viene arriba de todo (Slack lo anida en `authed_user`). */
  readToken?: (body: Record<string, unknown>) => TokenResponse;
};

export const PROVIDERS: Record<Provider, Config> = {
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    // OAuth Apps no tienen un scope de solo lectura para repos privados: "repo" es el mínimo que los ve.
    scope: "repo read:user",
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    account: async (token) => {
      const res = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${token}` } });
      return (await res.json()).login;
    },
  },
  linear: {
    authorizeUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    scope: "read",
    clientId: process.env.LINEAR_CLIENT_ID,
    clientSecret: process.env.LINEAR_CLIENT_SECRET,
    account: async (token) => {
      const res = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        // Token OAuth de Linear: este SÍ va con "Bearer" (la API key personal no).
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ viewer { email } }" }),
      });
      return (await res.json()).data.viewer.email;
    },
  },
  slack: {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    // Token de usuario, solo búsqueda: contamos mensajes y horarios, jamás leemos el contenido.
    scope: "search:read",
    scopeParam: "user_scope",
    // Con el team, Slack va directo al workspace de la demo en vez de preguntar "¿cuál es tu workspace?".
    extraParams: { team: process.env.SLACK_TEAM_ID },
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    account: async (token) => {
      const res = await fetch("https://slack.com/api/auth.test", { headers: { Authorization: `Bearer ${token}` } });
      const me = await res.json();
      return `${me.user}@${me.team}`;
    },
    readToken: (body) => (body.ok ? (body.authed_user as TokenResponse) : { error: String(body.error) }),
  },
};

export function isProvider(p: string): p is Provider {
  return p in PROVIDERS;
}

/** Origen público del pedido: el dominio de ngrok si entra por el túnel, localhost si no. */
export function publicOrigin(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return process.env.APP_URL ?? `${proto}://${host}`;
}

export const callbackUrl = (req: Request, p: Provider) => `${publicOrigin(req)}/api/connect/${p}/callback`;

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };

async function requestToken(p: Provider, params: Record<string, string>): Promise<TokenResponse> {
  const cfg = PROVIDERS[p];
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId ?? "", client_secret: cfg.clientSecret ?? "", ...params }),
  });
  const raw = await res.json();
  const body: TokenResponse = cfg.readToken ? cfg.readToken(raw) : raw;
  if (!res.ok || !body.access_token) throw new Error(`${p} token: ${res.status} ${body.error ?? ""}`);
  return body;
}

const expiry = (t: TokenResponse) => (t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null);

/** Canjea el `code` del callback, guarda la conexión del usuario y devuelve la cuenta conectada. */
export async function connect(req: Request, p: Provider, code: string, userId: string): Promise<string> {
  const t = await requestToken(p, { code, grant_type: "authorization_code", redirect_uri: callbackUrl(req, p) });
  const account = await PROVIDERS[p].account(t.access_token!);
  saveConnection({ userId, provider: p, account, token: t.access_token!, refreshToken: t.refresh_token ?? null, expiresAt: expiry(t) });
  return account;
}

/** Token vigente: si vence en menos de un minuto y hay refresh token (Linear), lo renueva. GitHub no vence. */
export async function freshToken(c: Connection): Promise<string> {
  if (!c.expiresAt || !c.refreshToken || Date.parse(c.expiresAt) - Date.now() > 60_000) return c.token;
  const t = await requestToken(c.provider as Provider, { grant_type: "refresh_token", refresh_token: c.refreshToken });
  saveConnection({ ...c, token: t.access_token!, refreshToken: t.refresh_token ?? c.refreshToken, expiresAt: expiry(t) });
  return t.access_token!;
}
