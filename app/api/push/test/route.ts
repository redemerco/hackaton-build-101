import { getCurrentUser } from "@/lib/users";
import { sendPush } from "@/lib/push";

export async function POST() {
  const user = await getCurrentUser();
  try {
    const result = await sendPush(user.id, {
      title: "build101",
      body: `Hola ${user.name}, las notificaciones andan.`,
      url: "/",
    });
    return Response.json(result);
  } catch (error) {
    console.error("[push/test]", error);
    return Response.json({ error: "No se pudo enviar el push (¿faltan las VAPID keys?)" }, { status: 500 });
  }
}
