import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Auth por token Bearer contra una env (mismo contrato que /api/agent/read: sin env → 500, token mal → 401),
// comparando en tiempo constante como /api/webhooks/health (hash → mismo largo, no filtra la longitud).
const sha = (s: string) => createHash("sha256").update(s).digest();

export function checkBearer(req: Request, envName: string): Response | null {
  const token = process.env[envName];
  if (!token) return Response.json({ error: `${envName} no configurado en el servidor` }, { status: 500 });
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!bearer || !timingSafeEqual(sha(bearer), sha(token))) return Response.json({ error: "No autorizado" }, { status: 401 });
  return null;
}
