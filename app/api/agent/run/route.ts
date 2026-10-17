import { runAction } from "@/lib/agent";
import { getCurrentUser } from "@/lib/users";

// POST /api/agent/run { id } → ejecuta UNA acción de la última propuesta guardada. Del cliente solo se usa el id:
// la acción (evento, horario) se relee de raw_events, nunca del payload.
export async function POST(req: Request) {
  const { id: userId } = await getCurrentUser();
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof body?.id !== "string") return Response.json({ status: "error", message: "falta el id de la acción" }, { status: 400 });
  return Response.json(await runAction(userId, body.id));
}
