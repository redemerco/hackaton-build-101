import { NextRequest } from "next/server";
import { publicOrigin } from "@/lib/public-origin";

// Slack: solo metadata de actividad (search:read), jamás contenido de mensajes (ver PLAN.md).
const USER_SCOPES = ["search:read"];

// GET /api/slack/connect → manda al usuario al OAuth de Slack.
export async function GET(req: NextRequest) {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return new Response("Falta SLACK_CLIENT_ID en .env.local", { status: 500 });
  }

  const redirectUri = `${publicOrigin(req)}/api/slack/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    user_scope: USER_SCOPES.join(","), // user token, no bot
    redirect_uri: redirectUri,
  });

  const authUrl = `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  return Response.redirect(authUrl, 302);
}
