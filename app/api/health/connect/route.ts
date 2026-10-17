import { NextRequest } from "next/server";
import { publicOrigin } from "@/lib/public-origin";

// Scopes mínimos para probar el login de Google Health + Calendar.
const SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "openid",
  "email",
];

// GET /api/health/connect → manda al usuario al login de Google (OAuth consent).
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return new Response("Falta GOOGLE_CLIENT_ID en .env.local", { status: 500 });
  }

  // El redirect_uri tiene que coincidir EXACTO con uno de los registrados en la consola.
  // Detrás del túnel (cloudflared) el origin interno es http://localhost:3228, así que
  // priorizamos PULSO_PUBLIC_URL y, si no, los headers X-Forwarded-* que pone el proxy.
  const redirectUri = `${publicOrigin(req)}/api/health/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return Response.redirect(authUrl, 302);
}
