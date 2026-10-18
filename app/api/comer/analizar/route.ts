import { aiErrorReason, generateJson } from "@/lib/ai";
import type { MealAnalysis } from "@/lib/meals";

export const maxDuration = 30;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

// POST /api/comer/analizar  (body: multipart con campo "photo")
// Manda la foto a la IA (lib/ai.ts: ai-service de PiWS o Gemini directo) y devuelve el análisis real de la comida (ítems en gramos + rangos de kcal).
const SYSTEM = `Sos un nutricionista que estima calorías a partir de una foto de comida.
Devolvés SOLO un JSON válido, sin texto alrededor, con esta forma exacta:
{"items":[{"name":"string en español","grams":[min,max],"kcal":[min,max]}],"comment":"una frase corta, útil y sin culpa"}
Reglas:
- Un ítem por alimento visible. Nombres en español rioplatense.
- grams y kcal son rangos [min,max] con ~30% de incertidumbre (la foto no es exacta).
- No inventes alimentos que no se ven. Si la foto no es comida, devolvé items:[] y un comment aclarándolo.`;

export async function POST(req: Request): Promise<Response> {
  let bytes: Buffer;
  let mimeType = "image/jpeg";
  try {
    const form = await req.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) return Response.json({ error: "Falta la foto" }, { status: 400 });
    // solo imágenes y de un tamaño razonable: no se manda cualquier archivo a Gemini
    if (file.type && !file.type.startsWith("image/")) return Response.json({ error: "Eso no es una foto" }, { status: 400 });
    if (file.size > MAX_PHOTO_BYTES) return Response.json({ error: "La foto pesa más de 10 MB" }, { status: 413 });
    mimeType = file.type || mimeType;
    bytes = Buffer.from(await file.arrayBuffer());
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }

  try {
    // generateJson reintenta ante 503/429 y parsea; la imagen va como inlineData (→ image_url en ai-service)
    const parsed = await generateJson<Partial<MealAnalysis>>({
      config: { systemInstruction: SYSTEM },
      contents: [
        { role: "user", parts: [
          { text: "Analizá esta comida." },
          { inlineData: { mimeType, data: bytes.toString("base64") } },
        ] },
      ],
    });

    // Normalización defensiva: garantizamos la forma que la UI espera.
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter((it): it is NonNullable<typeof it> => !!it && typeof it.name === "string")
          .map((it) => ({
            name: String(it.name),
            grams: toRange(it.grams),
            kcal: toRange(it.kcal),
          }))
      : [];
    const comment = typeof parsed.comment === "string" ? [parsed.comment] : parsed.comment ?? [];

    return Response.json({ items, comment } satisfies MealAnalysis);
  } catch (error) {
    console.error("[comer/analizar]", error);
    // 503 y no 502: detrás de Cloudflare un 502 pierde el cuerpo y no se ve el motivo
    return Response.json({ error: "No se pudo analizar la foto", reason: aiErrorReason(error) }, { status: 503 });
  }
}

// Acepta [a,b], número suelto o basura → siempre un rango [min,max] de enteros.
function toRange(v: unknown): [number, number] {
  if (Array.isArray(v) && v.length >= 2) return [Math.round(Number(v[0]) || 0), Math.round(Number(v[1]) || 0)];
  if (typeof v === "number") return [Math.round(v * 0.85), Math.round(v * 1.15)];
  return [0, 0];
}
