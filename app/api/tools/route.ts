import { TOOLS, runTool } from "@/lib/tools";
import { getCurrentUser } from "@/lib/users";

// GET /api/tools → corre todas las tools de lectura para el usuario actual.
// GET /api/tools?name=comidas_hoy → corre una sola. Solo lectura.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (user.id === "guest") return Response.json({ error: "Iniciá sesión con Google" }, { status: 401 });
  const name = new URL(req.url).searchParams.get("name");
  if (name) {
    const out = runTool(name, user.id);
    return out ? Response.json(out) : Response.json({ error: `No existe la tool ${name}` }, { status: 404 });
  }
  return Response.json({
    user: user.id,
    tools: TOOLS.map((t) => ({ name: t.name, source: t.source, description: t.description, result: t.run(user.id) })),
  });
}
