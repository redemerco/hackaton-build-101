import { cookies } from "next/headers";
import { connect, isProvider, publicOrigin, connectGoogleLogin } from "@/lib/oauth";
import { syncGithubUser } from "@/lib/sources/github";
import { syncLinearUser } from "@/lib/sources/linear";
import { syncSlackUser } from "@/lib/sources/slack";
import { syncGoogleUser } from "@/lib/sources/google";
import { resolveHealthUserId } from "@/lib/health-webhook";
import { syncCalendarUser } from "@/lib/sources/calendar";
import { getCurrentUser, upsertUser } from "@/lib/users";
import { USER_COOKIE } from "@/lib/user-list";

const STATE_COOKIE = "pulso_oauth_state";
const FIRST_SYNC: Partial<Record<string, (userId: string) => Promise<unknown>>> = {
  github: syncGithubUser,
  linear: syncLinearUser,
  slack: syncSlackUser,
  google: syncGoogleUser,
  calendar: syncCalendarUser,
};

// GET /api/connect/<p>/callback?code&state → guarda el token del usuario, trae sus datos y vuelve a la app.
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProvider(provider)) return new Response("Proveedor desconocido", { status: 404 });

  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  const code = url.searchParams.get("code");
  const back = new URL("/", publicOrigin(req));

  if (!code || !expected || url.searchParams.get("state") !== expected) {
    back.searchParams.set("conexion", `${provider}-error`);
    return Response.redirect(back, 302);
  }

  let userId: string;
  try {
    if (provider === "google") {
      // Login de entrada: canjeamos el code UNA vez, sacamos identidad real (sub+email), guardamos
      // la conexión google y abrimos sesión con SU id (el sub). Sin usuarios hardcodeados.
      const identity = await connectGoogleLogin(req, code);
      userId = upsertUser({ id: identity.sub, email: identity.email, name: identity.name ?? identity.email, hasWearable: true });
      jar.set(USER_COOKIE, userId, { sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/" });
    } else {
      // Resto de providers: conexión del usuario ya logueado.
      userId = (await getCurrentUser()).id;
      await connect(req, provider, code, userId);
    }
  } catch (error) {
    console.error(`[connect/${provider}]`, error);
    back.searchParams.set("conexion", `${provider}-error`);
    return Response.redirect(back, 302);
  }

  await FIRST_SYNC[provider]?.(userId).catch((error) =>
    console.error(`[connect/${provider}] primer sync`, error),
  );
  // healthUserId de Google Health (users/me/identity): mapea los avisos del webhook a este usuario.
  if (provider === "google") await resolveHealthUserId(userId).catch((error) => console.error("[connect/google] identity", error));
  back.searchParams.set("conexion", `${provider}-ok`);
  return Response.redirect(back, 302);
}
