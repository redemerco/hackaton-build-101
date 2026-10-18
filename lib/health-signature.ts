// Verificación de la firma GOOGLE-HEALTH-API-SIGNATURE de los webhooks de Google Health.
// Sin server-only ni alias "@/": lo importa también scripts/test-health-signature.mts.
//
// Doc (developers.google.com/health/webhooks → "Verify the signature"):
//   header = base64( prefijo Tink de 5 bytes [0x01 + keyId uint32 big-endian] + firma DER )
//   firma = ECDSA P-256 / SHA-256 sobre el body crudo (bytes exactos del POST).
//   keyset público (formato JSON de Tink) en gstatic; las claves rotan cada 30 días.
// Hacemos a mano lo que haría Tink PublicKeyVerify: parsear el EcdsaPublicKey (protobuf) y verificar con node:crypto.
import { createPublicKey, verify, type KeyObject } from "node:crypto";
import { healthKeysetTtlMs, healthKeysetUrl } from "./config.ts";

const ECDSA_TYPE_URL = "type.googleapis.com/google.crypto.tink.EcdsaPublicKey";

export type TinkKeyset = {
  primaryKeyId?: number;
  key: {
    keyData: { typeUrl: string; value: string; keyMaterialType?: string };
    status?: string;
    keyId: number;
    outputPrefixType?: string;
  }[];
};

// Protobuf mínimo: solo lo que trae un EcdsaPublicKey (varint y length-delimited).
function readVarint(buf: Buffer, pos: number): [number, number] {
  let value = 0;
  let shift = 0;
  for (;;) {
    if (pos >= buf.length) throw new Error("protobuf truncado");
    const b = buf[pos++];
    value += (b & 0x7f) * 2 ** shift;
    if (!(b & 0x80)) return [value, pos];
    shift += 7;
  }
}

function protoFields(buf: Buffer): Map<number, Buffer> {
  const out = new Map<number, Buffer>();
  let pos = 0;
  while (pos < buf.length) {
    const [tag, p1] = readVarint(buf, pos);
    const field = Math.floor(tag / 8);
    const wire = tag & 7;
    if (wire === 0) pos = readVarint(buf, p1)[1];
    else if (wire === 2) {
      const [len, p2] = readVarint(buf, p1);
      out.set(field, buf.subarray(p2, p2 + len));
      pos = p2 + len;
    } else if (wire === 5) pos = p1 + 4;
    else if (wire === 1) pos = p1 + 8;
    else throw new Error(`protobuf wire type ${wire} no soportado`);
  }
  return out;
}

// Tink guarda x/y como enteros big-endian (a veces con un 0x00 adelante): normalizar a 32 bytes.
function coord32(b: Buffer): Buffer {
  let i = 0;
  while (b.length - i > 32 && b[i] === 0) i++;
  const v = b.subarray(i);
  if (v.length > 32) throw new Error("coordenada P-256 inválida");
  return Buffer.concat([Buffer.alloc(32 - v.length), v]);
}

/** EcdsaPublicKey serializado (campos 3 = x, 4 = y) → clave pública P-256 de node:crypto. */
export function ecdsaPublicKeyFromTink(serialized: Buffer): KeyObject {
  const f = protoFields(serialized);
  const x = f.get(3);
  const y = f.get(4);
  if (!x || !y) throw new Error("EcdsaPublicKey sin x/y");
  return createPublicKey({
    key: { kty: "EC", crv: "P-256", x: coord32(x).toString("base64url"), y: coord32(y).toString("base64url") },
    format: "jwk",
  });
}

/** true si `signatureB64` es una firma válida de `body` con alguna clave habilitada del keyset. */
export function verifyTinkSignature(keyset: TinkKeyset, body: Buffer | string, signatureB64: string): boolean {
  const sig = Buffer.from(signatureB64.trim(), "base64");
  if (sig.length < 6 || sig[0] !== 0x01) return false; // solo prefijo TINK (0x01), que es lo que publica Google
  const keyId = sig.readUInt32BE(1);
  const der = sig.subarray(5);
  const data = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  const k = keyset.key.find(
    (k) => k.keyId === keyId && (k.status ?? "ENABLED") === "ENABLED" && k.keyData.typeUrl === ECDSA_TYPE_URL,
  );
  if (!k) return false;
  try {
    const pub = ecdsaPublicKeyFromTink(Buffer.from(k.keyData.value, "base64"));
    return verify("sha256", data, { key: pub, dsaEncoding: "der" }, der);
  } catch {
    return false;
  }
}

/** keyId del prefijo Tink, o null si el header no lo trae. */
export function signatureKeyId(signatureB64: string): number | null {
  const sig = Buffer.from(signatureB64.trim(), "base64");
  return sig.length >= 5 && sig[0] === 0x01 ? sig.readUInt32BE(1) : null;
}

// Caché del keyset en memoria: HEALTH_KEYSET_TTL_MS (6 h por defecto), y re-fetch (máx. 1/min) si llega un keyId que no conocemos (rotación).
const REFETCH_MIN_MS = 60_000;
let cached: { keyset: TinkKeyset; at: number } | null = null;

async function fetchKeyset(): Promise<TinkKeyset> {
  const res = await fetch(healthKeysetUrl(), { cache: "no-store" });
  if (!res.ok) throw new Error(`keyset ${res.status}`);
  const keyset = (await res.json()) as TinkKeyset;
  if (!Array.isArray(keyset.key)) throw new Error("keyset sin key[]");
  cached = { keyset, at: Date.now() };
  return keyset;
}

/** Keyset vigente; `wantKeyId` fuerza un re-fetch si ese keyId no está en el caché. Tira si no se puede bajar. */
export async function getKeyset(wantKeyId?: number | null): Promise<TinkKeyset> {
  const age = cached ? Date.now() - cached.at : Infinity;
  const known = wantKeyId == null || cached?.keyset.key.some((k) => k.keyId === wantKeyId);
  if (cached && age < healthKeysetTtlMs() && (known || age < REFETCH_MIN_MS)) return cached.keyset;
  try {
    return await fetchKeyset();
  } catch (error) {
    if (cached) return cached.keyset; // gstatic caído: seguimos con lo que había
    throw error;
  }
}
