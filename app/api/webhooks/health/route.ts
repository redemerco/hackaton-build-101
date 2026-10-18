import { createHash, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { getKeyset, signatureKeyId, verifyTinkSignature } from "@/lib/health-signature";
import { handleNotifications, parseNotifications } from "@/lib/health-webhook";

// POST /api/webhooks/health ← Google Health API (suscriptor de proyecto, ver scripts/health-subscriber.sh).
// 1. Authorization == HEALTH_WEBHOOK_SECRET (el valor EXACTO que se cargó en endpointAuthorization.secret,
//    con el esquema incluido, ej. "Bearer xxx"), comparado en tiempo constante → si no, 401.
// 2. {"type":"verification"} → 201 (la doc de subscribers.create pide 201; la guía acepta 200 o 201).
// 3. Firma GOOGLE-HEALTH-API-SIGNATURE (Tink ECDSA P-256) sobre el body crudo → inválida: 401.
//    HEALTH_WEBHOOK_SKIP_SIGNATURE=1 la saltea: SOLO para pruebas locales, nunca en el NAS.
// 4. 204 enseguida; el sync del usuario corre después (after) con debounce. Google reintenta todo lo que no sea 204.
export const dynamic = "force-dynamic";

const sha = (s: string) => createHash("sha256").update(s).digest();
function authorized(header: string | null, secret: string): boolean {
  return header !== null && timingSafeEqual(sha(header), sha(secret)); // hash → mismo largo, sin filtrar longitud
}

export async function POST(req: Request) {
  const secret = process.env.HEALTH_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook/health] falta HEALTH_WEBHOOK_SECRET");
    return new Response(null, { status: 503 }); // nuestro: Google reintenta y no se pierde nada (guarda 7 días)
  }
  if (!authorized(req.headers.get("authorization"), secret)) return new Response(null, { status: 401 });

  const raw = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    console.error("[webhook/health] body no es JSON", raw.slice(0, 200));
    return new Response(null, { status: 204 }); // no tiene arreglo: reintentarlo no sirve
  }
  if ((body as { type?: string } | null)?.type === "verification") return new Response(null, { status: 201 });

  if (process.env.HEALTH_WEBHOOK_SKIP_SIGNATURE !== "1") {
    const sig = req.headers.get("google-health-api-signature");
    if (!sig) return new Response(null, { status: 401 });
    let ok: boolean;
    try {
      ok = verifyTinkSignature(await getKeyset(signatureKeyId(sig)), raw, sig);
    } catch (error) {
      console.error("[webhook/health] no pude bajar el keyset", error);
      return new Response(null, { status: 503 }); // nuestro (gstatic/red): que reintente
    }
    if (!ok) return new Response(null, { status: 401 });
  }

  const items = parseNotifications(body);
  after(() => handleNotifications(items));
  return new Response(null, { status: 204 });
}
