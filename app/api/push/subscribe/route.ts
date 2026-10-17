import { getCurrentUser } from "@/lib/users";
import { isStoredSubscription, saveSubscription } from "@/lib/push";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { subscription?: unknown } | null;
  if (!isStoredSubscription(body?.subscription)) {
    return Response.json({ error: "Suscripción inválida" }, { status: 400 });
  }
  const user = await getCurrentUser();
  await saveSubscription(user.id, body.subscription);
  return Response.json({ ok: true });
}
