/**
 * @module signed-envelope
 *
 * Canonical signed ingress wrapper for Recoder A2A envelopes.
 */

export const SIGNED_ENVELOPE_VERSION = '1.0.0' as const;

export type SignedEnvelopeAlgorithm = 'hmac-sha256' | 'ed25519';

export type SignedEnvelopeSignature = {
  algorithm: SignedEnvelopeAlgorithm;
  key_id: string;
  signature: string;
  signed_at: string;
  expires_at?: string;
};

export type SignedEnvelope<TPayload = unknown> = {
  envelope_version: typeof SIGNED_ENVELOPE_VERSION;
  id: string;
  payload_type: string;
  payload: TPayload;
  signature: SignedEnvelopeSignature;
  metadata?: Record<string, unknown>;
};

export type CreateSignedEnvelopeInput<TPayload> = {
  id: string;
  payload_type: string;
  payload: TPayload;
  signature: SignedEnvelopeSignature;
  metadata?: Record<string, unknown>;
};

export function createSignedEnvelope<TPayload>(input: CreateSignedEnvelopeInput<TPayload>): SignedEnvelope<TPayload> {
  return {
    envelope_version: SIGNED_ENVELOPE_VERSION,
    id: input.id,
    payload_type: input.payload_type,
    payload: input.payload,
    signature: input.signature,
    metadata: input.metadata,
  };
}

export function isSignedEnvelope(value: unknown): value is SignedEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SignedEnvelope>;
  return candidate.envelope_version === SIGNED_ENVELOPE_VERSION
    && typeof candidate.id === 'string'
    && typeof candidate.payload_type === 'string'
    && !!candidate.signature
    && typeof candidate.signature === 'object'
    && typeof candidate.signature.signature === 'string'
    && typeof candidate.signature.key_id === 'string'
    && typeof candidate.signature.signed_at === 'string';
}
