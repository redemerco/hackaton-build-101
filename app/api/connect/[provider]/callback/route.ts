import { cookies } from "next/headers";
import { connect, isProvider, publicOrigin } from "@/lib/oauth";
import { syncGithubUser } from "@/lib/sources/github";
import { syncLinearUser } from "@/lib/sources/linear";
import { syncSlackUser } from "@/lib/sources/slack";
import { syncGoogleUser } from "@/lib/sources/google";
import { getCurrentUser } from "@/lib/users";
import { USER_COOKIE, USERS, type UserId } from "@/lib/user-list";

const STATE_COOKIE = "pulso_oauth_state";
const FIRST_SYNC: Partial<Record<string, (userId: string) => Promise<unknown>>> = {
  github: syncGithubUser,
  linear: syncLinearUser,
  slack: syncSlackUser,
  google: syncGoogleUser,
};

// Google es el login de entrada: mapea el email de la cuenta al usuario de Pulso.
// Lo que no matchea cae en "santi" (el que tiene wearable) para que la demo muestre datos.
const GOOGLE_EMAIL_TO_USER: Record<string, UserId> = {
  "santiagososatraibel@gmail.com": "santi",
  "rdemarcob@gmail.com": "renzo",
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

  // Para github/linear/slack la conexión es del usuario actual. Para google (login) el usuario
  // se decide por el email que devuelve el OAuth, así que primero necesitamos saber quién es.
  const current = await getCurrentUser();
  let userId: string = current.id;
  try {
    const account = await connect(req, provider, code, userId);
    if (provider === "google") {
      const mapped = GOOGLE_EMAIL_TO_USER[account.toLowerCase()] ?? "santi";
      // Mover la conexión al usuario mapeado si difiere, y setear la sesión (login).
      if (mapped !== userId) {
        await connect(req, provider, code, mapped).catch(() => {});
        userId = mapped;
      }
      jar.set(USER_COOKIE, mapped, { sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/" });
    }
  } catch (error) {
    console.error(`[connect/${provider}]`, error);
    back.searchParams.set("conexion", `${provider}-error`);
    return Response.redirect(back, 302);
  }
  // Primer sync en el momento (google todavía no tiene sync: se omite sin romper).
  await FIRST_SYNC[provider]?.(userId).catch((error) =>
    console.error(`[connect/${provider}] primer sync`, error),
  );
  back.searchParams.set("conexion", `${provider}-ok`);
  return Response.redirect(back, 302);
}
