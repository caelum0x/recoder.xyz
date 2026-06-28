import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign as cryptoSign,
} from "node:crypto";
import { canonicalJson } from "@recoder/a2a-sdk";
import {
  verifyEd25519Signature,
  toEd25519PublicKey,
} from "../src/ed25519";

/** Sign a payload with a real ed25519 private key over the SDK's canonical bytes. */
function signEd25519(payload: unknown, privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"]): string {
  return cryptoSign(null, Buffer.from(canonicalJson(payload), "utf8"), privateKey).toString("hex");
}

test("verifies a genuine ed25519 signature (PEM public key)", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const payload = { kind: "task.submit", taskId: "t1", n: 3 };
  const sig = signEd25519(payload, privateKey);

  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  assert.equal(verifyEd25519Signature(payload, sig, pem), true);
});

test("verifies against a KeyObject directly", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const payload = { a: 1, b: [true, "x"] };
  const sig = signEd25519(payload, privateKey);
  assert.equal(verifyEd25519Signature(payload, sig, publicKey), true);
});

test("verifies a raw 32-byte public key (hex + base64 SPKI wrapping)", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const payload = { msg: "hello" };
  const sig = signEd25519(payload, privateKey);

  // Extract the raw 32-byte key from the DER SPKI (last 32 bytes).
  const der = publicKey.export({ type: "spki", format: "der" });
  const raw = der.subarray(der.length - 32);

  assert.equal(verifyEd25519Signature(payload, sig, raw.toString("hex")), true);
  assert.equal(verifyEd25519Signature(payload, sig, raw.toString("base64")), true);
});

test("rejects a tampered payload (signature no longer matches)", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const payload = { amount: 100 };
  const sig = signEd25519(payload, privateKey);
  // Same key/sig, mutated payload -> must fail.
  assert.equal(verifyEd25519Signature({ amount: 999 }, sig, publicKey), false);
});

test("rejects a signature from a different key", () => {
  const a = generateKeyPairSync("ed25519");
  const b = generateKeyPairSync("ed25519");
  const payload = { x: 1 };
  const sig = signEd25519(payload, a.privateKey);
  assert.equal(verifyEd25519Signature(payload, sig, b.publicKey), false);
});

test("rejects malformed signature / key without throwing", () => {
  const { publicKey } = generateKeyPairSync("ed25519");
  assert.equal(verifyEd25519Signature({ x: 1 }, "", publicKey), false);
  assert.equal(verifyEd25519Signature({ x: 1 }, "not-hex-or-b64-!!!", publicKey), false);
  assert.equal(verifyEd25519Signature({ x: 1 }, "abcd", "too-short"), false);
});

test("toEd25519PublicKey throws on a wrong-length raw key", () => {
  assert.throws(() => toEd25519PublicKey("00".repeat(16)), /32 bytes/);
});
