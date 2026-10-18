import "server-only";
import { saveConnection, type Connection, type Provider } from "@/lib/connections";
import { LINEAR_SCOPE, normalizeScopes, SLACK_USER_SCOPE } from "@/lib/agent-work";

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
  /** Params extra para la URL de authorize (Google: offline + consent para traer refresh_token). */
  extraAuthParams?: Record<string, string>;
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
    // "write": el agente crea issues y baja prioridades (siempre con Confirmar). Las conexiones viejas quedan en "read".
    scope: LINEAR_SCOPE,
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
    // Token de usuario. search:read: contamos mensajes y horarios, jamás leemos el contenido.
    // users.profile:write + dnd:write: estado "En foco" y no molestar durante un bloque de foco (solo con Confirmar).
    // OJO: tienen que estar en "User Token Scopes" de la app en api.slack.com o el authorize falla (invalid_scope).
    scope: SLACK_USER_SCOPE,
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
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    // Login de entrada: identifica al usuario (openid/email) y conecta Fitbit (Google Health).
    // OJO: la Google Health API rechaza el token (403 DISALLOWED_OAUTH_SCOPES) si incluye scopes
    // que no son de Health, como Calendar. Por eso Calendar NO va acá; iría en un OAuth aparte.
    scope: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
      "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
      "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
    ].join(" "),
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // offline + consent: para recibir refresh_token y re-mostrar el consentimiento.
    // SIN include_granted_scopes: ese parámetro acumulaba scopes viejos (Calendar) y la
    // Health API rechaza el token si trae scopes que no son de Health (403 DISALLOWED_OAUTH_SCOPES).
    extraAuthParams: { access_type: "offline", prompt: "select_account consent" }, // select_account: después de "Cerrar sesión" deja elegir otra cuenta
    account: async (token) => {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return (await res.json()).email;
    },
  },
  calendar: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    // Conexión aparte del login: su token SOLO tiene Calendar, así no rompe la Health API.
    scope: ["https://www.googleapis.com/auth/calendar.events", "openid", "email"].join(" "),
    // Reusa el mismo cliente OAuth de Google (CALENDAR_CLIENT_ID opcional por si se separa).
    clientId: process.env.CALENDAR_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.CALENDAR_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET,
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    account: async (token) => {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return (await res.json()).email;
    },
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

/** `scope`: Slack lo manda como "a,b" en authed_user; Linear como array o string. */
type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: unknown; error?: string };

/** Scopes otorgados; si la respuesta no los trae, OAuth dice que se otorgó lo pedido. */
const grantedScopes = (p: Provider, t: TokenResponse) => normalizeScopes(t.scope) ?? normalizeScopes(PROVIDERS[p].scope);

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
  saveConnection({ userId, provider: p, account, token: t.access_token!, refreshToken: t.refresh_token ?? null, expiresAt: expiry(t), scopes: grantedScopes(p, t) });
  return account;
}

export type GoogleIdentity = { sub: string; email: string; name?: string };

/**
 * Login con Google: canjea el `code` UNA sola vez (el code es de un solo uso),
 * lee la identidad real (sub + email) del userinfo, y guarda la conexión google
 * del usuario recién identificado. Devuelve la identidad para crear/abrir sesión.
 */
export async function connectGoogleLogin(req: Request, code: string): Promise<GoogleIdentity> {
  const t = await requestToken("google", { code, grant_type: "authorization_code", redirect_uri: callbackUrl(req, "google") });
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${t.access_token}` },
  });
  const info = (await res.json()) as { sub?: string; email?: string; name?: string };
  if (!info.sub || !info.email) throw new Error("google userinfo sin sub/email");
  const identity: GoogleIdentity = { sub: info.sub, email: info.email, name: info.name };
  saveConnection({ userId: identity.sub, provider: "google", account: identity.email, token: t.access_token!, refreshToken: t.refresh_token ?? null, expiresAt: expiry(t), scopes: grantedScopes("google", t) });
  return identity;
}

/** Token vigente: si vence en menos de un minuto y hay refresh token (Linear), lo renueva. GitHub no vence. */
export async function freshToken(c: Connection): Promise<string> {
  if (!c.expiresAt || !c.refreshToken || Date.parse(c.expiresAt) - Date.now() > 60_000) return c.token;
  const t = await requestToken(c.provider as Provider, { grant_type: "refresh_token", refresh_token: c.refreshToken });
  saveConnection({ ...c, token: t.access_token!, refreshToken: t.refresh_token ?? c.refreshToken, expiresAt: expiry(t), scopes: normalizeScopes(t.scope) ?? c.scopes });
  return t.access_token!;
}
