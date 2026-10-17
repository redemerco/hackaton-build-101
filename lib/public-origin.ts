import { NextRequest } from "next/server";

// Calcula el origin público real de la app.
// Detrás de cloudflared, req.url trae el origin interno (http://localhost:3228),
// que NO coincide con el redirect_uri registrado en el proveedor OAuth. Por eso:
//   1) PULSO_PUBLIC_URL si está seteada (lo más confiable)
//   2) headers X-Forwarded-Proto / X-Forwarded-Host que agrega el proxy
//   3) fallback al origin del request
export function publicOrigin(req: NextRequest): string {
  const envUrl = process.env.PULSO_PUBLIC_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");

  const xfHost = req.headers.get("x-forwarded-host");
  const xfProto = req.headers.get("x-forwarded-proto") ?? "https";
  if (xfHost) return `${xfProto}://${xfHost}`;

  return new URL(req.url).origin;
}
