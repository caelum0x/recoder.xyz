/**
 * A2A signing — the crypto primitives behind ingress verification and OUTBOUND
 * envelope signing, composed from `@recoder/a2a-sdk` (HMAC-SHA256) and the
 * interop-owned ed25519 verifier.
 *
 * The signed bytes are always `canonicalJson(payload)`, byte-identical across
 * algorithms, so a producer can swap HMAC ↔ ed25519 without changing what is
 * signed. The interop edge VERIFIES inbound (see signed-ingress-gate) and SIGNS
 * outbound (so a Recoder agent reaching out to an external A2A agent carries a
 * valid signature).
 */
export {
  canonicalJson,
  createHmacSha256Signature,
  verifyHmacSha256Signature,
  createSignedEnvelope,
  createSignedEnvelopeSignature,
  isSignedEnvelope,
  validateSignedEnvelopeIngress,
  type SignedEnvelope,
} from "@recoder/a2a-sdk";

export {
  verifyEd25519Signature,
  toEd25519PublicKey,
  type Ed25519PublicKey,
} from "../../ed25519";
