import { NextRequest } from "next/server";
import { publicOrigin } from "@/lib/public-origin";

// Scopes: leer actividad del usuario y sus repos (metadata de commits/PRs/issues).
const SCOPES = ["read:user", "repo"];

// GET /api/github/connect → OAuth de GitHub (authorize).
export async function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    return new Response("Falta GITHUB_OAUTH_CLIENT_ID en .env.local", { status: 500 });
  }

  const redirectUri = `${publicOrigin(req)}/api/github/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    allow_signup: "false",
  });

  const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
  return Response.redirect(authUrl, 302);
}
