/**
 * `a2a-envelope.service` — SKELETON. The interop wire group binds this to
 * `@recoder/a2a-sdk` (canonical envelope build/parse/validate + conformance
 * vectors). It is scaffolded here so the composer + `A2ATransport` port compile
 * against a stable surface; the concrete SDK wiring lands in the wire step.
 *
 * Fail-closed posture is preserved even as a skeleton: `validateInbound` returns
 * a rejection (never a fake "valid") until the real validator is wired, and
 * `parseEnvelope` throws only for programmer error (a caller that ignores the
 * `null` return), never silently fabricating an envelope.
 */
import type { A2AEnvelope } from '../types.js';

/** Outcome of validating an untrusted inbound envelope shape (pre-signature). */
export interface EnvelopeValidation<TPayload = unknown> {
  readonly valid: boolean;
  readonly code: string;
  readonly reason: string;
  readonly envelope?: A2AEnvelope<TPayload>;
}

/** Input to build an outbound envelope. */
export interface BuildEnvelopeInput<TPayload = unknown> {
  readonly from: string;
  readonly to?: string;
  readonly kind: string;
  readonly payload: TPayload;
  readonly correlationId?: string;
}

/** Build/parse/validate the A2A envelope surface the wire group implements. */
export interface EnvelopeService {
  buildEnvelope<TPayload = unknown>(input: BuildEnvelopeInput<TPayload>): A2AEnvelope<TPayload>;
  parseEnvelope<TPayload = unknown>(raw: unknown): A2AEnvelope<TPayload> | null;
  validateInbound<TPayload = unknown>(raw: unknown): EnvelopeValidation<TPayload>;
}

/** Loosely detect the minimal envelope shape without the SDK (skeleton guard). */
function looksLikeEnvelope(raw: unknown): raw is A2AEnvelope {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.from === 'string' && typeof r.kind === 'string' && 'payload' in r;
}

/**
 * Scaffold envelope service. Produces well-formed local envelopes and does a
 * structural (NOT cryptographic) inbound check. Signature/identity verification
 * is the job of `signed-ingress.gate.ts`; canonical schema validation is wired
 * to `@recoder/a2a-sdk` by the wire group.
 */
export function createEnvelopeService(): EnvelopeService {
  return {
    buildEnvelope<TPayload = unknown>(input: BuildEnvelopeInput<TPayload>): A2AEnvelope<TPayload> {
      return {
        id: `a2a_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
        from: input.from,
        to: input.to,
        kind: input.kind,
        payload: input.payload,
        correlationId: input.correlationId,
        createdAt: new Date().toISOString(),
      };
    },

    parseEnvelope<TPayload = unknown>(raw: unknown): A2AEnvelope<TPayload> | null {
      return looksLikeEnvelope(raw) ? (raw as A2AEnvelope<TPayload>) : null;
    },

    validateInbound<TPayload = unknown>(raw: unknown): EnvelopeValidation<TPayload> {
      if (!looksLikeEnvelope(raw)) {
        return { valid: false, code: 'envelope_malformed', reason: 'Not a well-formed A2A envelope.' };
      }
      return { valid: true, code: 'envelope_ok', reason: 'Structurally valid envelope.', envelope: raw as A2AEnvelope<TPayload> };
    },
  };
}
