// node scripts/test-health-signature.mts — verificación Tink de GOOGLE-HEALTH-API-SIGNATURE con un keyset P-256 local.
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyTinkSignature, type TinkKeyset } from "../lib/health-signature.ts";

// protobuf a mano: EcdsaPublicKey { version=1 (varint), params=2 (msg), x=3 (bytes), y=4 (bytes) }
const lenField = (field: number, b: Buffer) => Buffer.concat([Buffer.from([(field << 3) | 2, b.length]), b]);
function tinkKey(x: Buffer, y: Buffer): string {
  const params = Buffer.from([0x08, 0x03, 0x10, 0x02, 0x18, 0x02]); // SHA256, NIST_P256, DER
  // x con un 0x00 adelante, como lo serializa Tink (entero big-endian con signo)
  return Buffer.concat([Buffer.from([0x08, 0x00]), lenField(2, params), lenField(3, Buffer.concat([Buffer.from([0]), x])), lenField(4, y)]).toString("base64");
}

function makeKey(keyId: number) {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const entry = {
    keyData: { typeUrl: "type.googleapis.com/google.crypto.tink.EcdsaPublicKey", value: tinkKey(Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")), keyMaterialType: "ASYMMETRIC_PUBLIC" },
    status: "ENABLED",
    keyId,
    outputPrefixType: "TINK",
  };
  const signB64 = (body: string, id = keyId) => {
    const prefix = Buffer.alloc(5);
    prefix[0] = 0x01;
    prefix.writeUInt32BE(id, 1);
    return Buffer.concat([prefix, sign("sha256", Buffer.from(body), { key: privateKey, dsaEncoding: "der" })]).toString("base64");
  };
  return { entry, signB64 };
}

const a = makeKey(3908867516); // keyId > 2^31: prueba el uint32 sin signo
const b = makeKey(257403691);
const keyset: TinkKeyset = { primaryKeyId: a.entry.keyId, key: [b.entry, a.entry] };
const body = JSON.stringify({ data: { healthUserId: "hu-1", dataType: "sleep", operation: "UPSERT", intervals: [] } });

assert.equal(verifyTinkSignature(keyset, body, a.signB64(body)), true, "firma válida (clave primaria)");
assert.equal(verifyTinkSignature(keyset, Buffer.from(body), b.signB64(body)), true, "firma válida (otra clave del keyset)");
assert.equal(verifyTinkSignature(keyset, body.replace("hu-1", "hu-2"), a.signB64(body)), false, "body alterado");
const sig = Buffer.from(a.signB64(body), "base64");
sig[sig.length - 1] ^= 0x01;
assert.equal(verifyTinkSignature(keyset, body, sig.toString("base64")), false, "firma alterada");
assert.equal(verifyTinkSignature(keyset, body, a.signB64(body, b.entry.keyId)), false, "keyId de otra clave");
assert.equal(verifyTinkSignature(keyset, body, a.signB64(body, 42)), false, "keyId desconocido");
assert.equal(verifyTinkSignature({ key: [{ ...a.entry, status: "DISABLED" }] }, body, a.signB64(body)), false, "clave deshabilitada");
assert.equal(verifyTinkSignature(keyset, body, "no-es-base64!!"), false, "header basura");

console.log("test-health-signature: ok (8 casos)");
