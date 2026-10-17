import { getNudge } from "@/lib/nudge";
import { sendPush } from "@/lib/push";
import { getCurrentUser, isUserId } from "@/lib/users";

// ?user=santi apunta a otro usuario (el botón demo de Renzo dispara el nudge al teléfono del usuario héroe).
async function target(req: Request) {
  const param = new URL(req.url).searchParams.get("user");
  return isUserId(param) ? param : (await getCurrentUser()).id;
}

// GET /api/nudge → el nudge calculado, sin mandarlo (para mostrarlo in-app).
export async function GET(req: Request) {
  return Response.json(getNudge(await target(req)));
}

// POST /api/nudge → lo calcula y lo manda por push. Si el push falla, devuelve igual el nudge para mostrarlo in-app.
export async function POST(req: Request) {
  const userId = await target(req);
  const nudge = getNudge(userId);
  if (!nudge) return Response.json({ nudge: null, sent: 0, error: "sin datos para un nudge" });
  try {
    const result = await sendPush(userId, { title: nudge.title, body: nudge.body, url: "/" });
    return Response.json({ nudge, ...result });
  } catch (error) {
    console.error("[nudge] push falló, queda el in-app", error);
    return Response.json({ nudge, sent: 0, error: "push no disponible" });
  }
}
