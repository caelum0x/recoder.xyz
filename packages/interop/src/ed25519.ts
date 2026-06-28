import { verify as cryptoVerify, createPublicKey, type KeyObject } from "node:crypto";
import { canonicalJson } from "@recoder/a2a-sdk";

/**
 * Real ed25519 signature verification for signed A2A envelopes.
 *
 * The a2a-sdk's `SignedEnvelopeAlgorithm` union already admits `'ed25519'`, but
 * its `validateSignedEnvelopeIngress` only verifies `'hmac-sha256'` and rejects
 * ed25519 as `signed_envelope_unsupported_algorithm`. This module closes that gap
 * with genuine asymmetric verification (node:crypto, EdDSA over Ed25519), so an
 * inbound envelope signed by a peer's private key can be admitted by its public
 * key — the asymmetric trust model the interop edge needs (the verifier never
 * holds the signer's secret).
 *
 * The signed bytes are the SDK's `canonicalJson(payload)` — byte-identical to what
 * the HMAC path signs — so an envelope can be HMAC- or ed25519-signed over the
 * exact same canonical payload, and a producer can swap algorithms without
 * changing what is signed.
 */

/** A public key the verifier trusts: a KeyObject or a PEM/SPKI string. */
export type Ed25519PublicKey = KeyObject | string;

/**
 * Coerce an accepted public-key form into a node KeyObject. A raw 32-byte ed25519
 * public key (hex or base64) is wrapped in DER SPKI; a PEM string / KeyObject is
 * used as-is. Throws on an unparseable key (the caller treats that as a verify
 * failure, never an admission).
 */
export function toEd25519PublicKey(key: Ed25519PublicKey): KeyObject {
  if (typeof key !== "string") {
    return key;
  }
  const trimmed = key.trim();
  if (trimmed.includes("BEGIN")) {
    return createPublicKey(trimmed);
  }
  // Treat a bare key as 32 raw ed25519 public-key bytes (hex or base64).
  const raw = decodeRawKey(trimmed);
  if (raw.length !== 32) {
    throw new Error(
      `ed25519 public key must be 32 bytes, got ${raw.length}`,
    );
  }
  // DER SPKI prefix for an Ed25519 public key (RFC 8410): the fixed 12-byte
  // AlgorithmIdentifier header followed by the 32-byte key.
  const spkiPrefix = Buffer.from([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
  ]);
  return createPublicKey({
    key: Buffer.concat([spkiPrefix, raw]),
    format: "der",
    type: "spki",
  });
}

/** Decode a key string as hex when it looks hex, else base64. */
function decodeRawKey(value: string): Buffer {
  if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
    return Buffer.from(value, "hex");
  }
  return Buffer.from(value, "base64");
}

/** Decode a signature string as hex when it looks hex, else base64. */
function decodeSignature(signature: string): Buffer | null {
  if (signature.length === 0) {
    return null;
  }
  if (/^[0-9a-fA-F]+$/.test(signature) && signature.length % 2 === 0) {
    return Buffer.from(signature, "hex");
  }
  const buf = Buffer.from(signature, "base64");
  return buf.length > 0 ? buf : null;
}

/**
 * Verify an ed25519 signature over `canonicalJson(payload)`. Returns false on any
 * malformed key/signature rather than throwing, so a bad input is a clean DENY at
 * the gate (never a crash, never an admission). An empty signature is always false.
 */
export function verifyEd25519Signature(
  payload: unknown,
  signature: string,
  publicKey: Ed25519PublicKey,
): boolean {
  let key: KeyObject;
  try {
    key = toEd25519PublicKey(publicKey);
  } catch {
    return false;
  }
  const sig = decodeSignature(signature);
  if (sig === null) {
    return false;
  }
  try {
    return cryptoVerify(
      null,
      Buffer.from(canonicalJson(payload), "utf8"),
      key,
      sig,
    );
  } catch {
    return false;
  }
}
