import { cookies } from "next/headers";
import { connect, isProvider, publicOrigin } from "@/lib/oauth";
import { syncGithubUser } from "@/lib/sources/github";
import { syncLinearUser } from "@/lib/sources/linear";
import { syncSlackUser } from "@/lib/sources/slack";
import { getCurrentUser } from "@/lib/users";

const STATE_COOKIE = "pulso_oauth_state";
const FIRST_SYNC = { github: syncGithubUser, linear: syncLinearUser, slack: syncSlackUser };

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

  const user = await getCurrentUser();
  try {
    await connect(req, provider, code, user.id);
  } catch (error) {
    console.error(`[connect/${provider}]`, error);
    back.searchParams.set("conexion", `${provider}-error`);
    return Response.redirect(back, 302);
  }
  // Primer sync en el momento: al volver a la app ya se ven los datos. Si falla, la conexión igual quedó.
  await FIRST_SYNC[provider](user.id).catch((error) =>
    console.error(`[connect/${provider}] primer sync`, error),
  );
  back.searchParams.set("conexion", `${provider}-ok`);
  return Response.redirect(back, 302);
}
