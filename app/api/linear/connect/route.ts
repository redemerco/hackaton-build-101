import { NextRequest } from "next/server";
import { publicOrigin } from "@/lib/public-origin";

// Scope read: leer issues/actividad del usuario en Linear.
const SCOPES = ["read"];

// GET /api/linear/connect → OAuth de Linear (authorize).
export async function GET(req: NextRequest) {
  const clientId = process.env.LINEAR_CLIENT_ID;
  if (!clientId) {
    return new Response("Falta LINEAR_CLIENT_ID en .env.local", { status: 500 });
  }

  const redirectUri = `${publicOrigin(req)}/api/linear/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(","),
    prompt: "consent",
  });

  const authUrl = `https://linear.app/oauth/authorize?${params.toString()}`;
  return Response.redirect(authUrl, 302);
}
