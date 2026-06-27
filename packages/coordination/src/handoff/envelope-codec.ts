/**
 * envelope-codec — encode a `Handoff` into a transport `HandoffEnvelope` and
 * decode it back, with a stable dedup-key derivation and a sign/verify seam.
 *
 * The `dedupKey` is the idempotency anchor the bus + ledger key on (MERGED from
 * the `_localEventIds` dedup of `docker-backend/src/a2a/a2a-event-bus.ts`, made
 * a deterministic content key here so two processes derive the same key for the
 * same handoff). Signing is left as a seam: an optional `SignFn` produces a
 * detached signature over the canonical bytes; verification re-derives the
 * canonical bytes and checks the signature.
 *
 * Pure: deterministic given its inputs (the caller supplies envelopeId +
 * emittedAt from the id/clock ports, keeping this module free of IO).
 */

import { hashParts } from '../util';
import type { Handoff, HandoffEnvelope } from '../domain';

/** Detached-signature producer over canonical handoff bytes (sign seam). */
export type SignFn = (canonicalBytes: string) => string;
/** Detached-signature verifier over canonical handoff bytes (verify seam). */
export type VerifyFn = (canonicalBytes: string, signature: string) => boolean;

export type EncodeEnvelopeInput = {
  handoff: Handoff;
  envelopeId: string;
  emittedAt: string;
  traceId?: string;
  /** Optional signer; when absent the envelope is unsigned. */
  sign?: SignFn;
};

/**
 * Canonical, stable string form of the identity-bearing fields of a handoff —
 * the bytes a dedup key and a signature are computed over. Field order is fixed
 * so the encoding is reproducible across processes.
 */
export function canonicalHandoffBytes(handoff: Handoff): string {
  return [
    handoff.handoffId,
    handoff.intent,
    handoff.fromAgentId,
    handoff.toAgentId,
    handoff.sourceTaskId ?? '',
    handoff.targetTaskId ?? '',
    String(handoff.depth),
    handoff.rootHandoffId ?? handoff.handoffId,
  ].join('');
}

/**
 * Derive the dedup key for a handoff. Stable + deterministic so an at-least-once
 * delivery of the same handoff always hashes to the same key (effectively-once).
 */
export function deriveDedupKey(handoff: Handoff): string {
  return `handoff:${handoff.handoffId}:${hashParts([canonicalHandoffBytes(handoff)])}`;
}

/** Encode a handoff into a transport envelope (optionally signed). */
export function encodeEnvelope(input: EncodeEnvelopeInput): HandoffEnvelope {
  const { handoff, envelopeId, emittedAt, traceId, sign } = input;
  const canonical = canonicalHandoffBytes(handoff);
  const envelope: HandoffEnvelope = {
    envelopeId,
    dedupKey: deriveDedupKey(handoff),
    handoff,
    emittedAt,
    ...(traceId ? { traceId } : {}),
    ...(sign ? { signature: sign(canonical) } : {}),
  };
  return envelope;
}

/** Decode the handoff payload out of an envelope. */
export function decodeEnvelope(envelope: HandoffEnvelope): Handoff {
  return envelope.handoff;
}

/**
 * Verify an envelope's signature (if present) and that its dedup key matches the
 * handoff it carries. An unsigned envelope verifies on dedup-key integrity
 * alone; a signed envelope additionally checks the detached signature.
 */
export function verifyEnvelope(envelope: HandoffEnvelope, verify?: VerifyFn): boolean {
  if (envelope.dedupKey !== deriveDedupKey(envelope.handoff)) {
    return false;
  }
  if (envelope.signature === undefined) {
    return true;
  }
  if (!verify) {
    // A signature is present but no verifier was supplied — fail closed.
    return false;
  }
  return verify(canonicalHandoffBytes(envelope.handoff), envelope.signature);
}
