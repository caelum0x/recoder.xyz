/**
 * `a2a-envelope.service` — the REAL A2A envelope build/seal/parse/validate
 * surface, composed on top of `@recoder/a2a-sdk`'s canonical signed-envelope
 * primitives (`createSignedEnvelope`, `createSignedEnvelopeSignature`,
 * `validateSignedEnvelopeIngress`, `isSignedEnvelope`).
 *
 * This is the wire group's binding of the SDK: the domain-facing `A2AEnvelope`
 * projection (id/from/kind/payload) is carried INSIDE the canonical envelope's
 * `payload`, and the envelope is HMAC-SHA256 signed with the instance's key.
 *
 * Fail-closed posture: `validateInbound` returns a rejection (never a fabricated
 * "valid") on a malformed/unsigned-when-required/expired/bad-signature envelope,
 * and it NEVER throws on untrusted input.
 */
import {
  createSignedEnvelope,
  createSignedEnvelopeSignature,
  isSignedEnvelope,
  validateSignedEnvelopeIngress,
  type SignedEnvelope,
} from '@recoder/a2a-sdk';
import type { A2AEnvelope } from '../types.js';

/** The canonical `payload_type` this domain seals its A2A message envelopes as. */
export const A2A_MESSAGE_PAYLOAD_TYPE = 'recoder.a2a.message';

/** Input to build an outbound (unsealed) domain envelope. */
export interface BuildEnvelopeInput<TPayload = unknown> {
  readonly from: string;
  readonly to?: string;
  readonly kind: string;
  readonly payload: TPayload;
  readonly correlationId?: string;
  /** Override the generated id (tests / correlation). */
  readonly id?: string;
  /** Override the generated timestamp (tests). */
  readonly createdAt?: string;
}

/** Outcome of validating an untrusted inbound signed envelope. */
export interface EnvelopeValidation<TPayload = unknown> {
  readonly valid: boolean;
  readonly status: number;
  readonly code: string;
  readonly reason: string;
  /** The verified domain envelope — present only when `valid === true`. */
  readonly envelope?: A2AEnvelope<TPayload>;
}

/** Options for sealing/validating (secret + clock injection for tests). */
export interface EnvelopeSigningOptions {
  /** HMAC secret; `null`/absent ⇒ sealing produces an unsigned marker signature. */
  readonly hmacSecret?: string | null;
  /** Key id naming the signing party. */
  readonly keyId?: string;
  /** Require a real signature on inbound (production posture). */
  readonly requireSignature?: boolean;
  /** Injected clock for deterministic expiry/skew tests. */
  readonly now?: Date;
  /** Max ms of future clock skew tolerated. */
  readonly maxFutureSkewMs?: number;
}

/** The build/seal/parse/validate surface the composer + transport bind to. */
export interface EnvelopeService {
  /** Build an unsealed domain envelope (local id/timestamp stamped). */
  buildEnvelope<TPayload = unknown>(input: BuildEnvelopeInput<TPayload>): A2AEnvelope<TPayload>;
  /** Seal + HMAC-sign a domain envelope into a canonical `SignedEnvelope`. */
  sealEnvelope<TPayload = unknown>(
    envelope: A2AEnvelope<TPayload>,
    options?: EnvelopeSigningOptions,
  ): SignedEnvelope<A2AEnvelope<TPayload>>;
  /** Structurally recover a domain envelope from a signed envelope's payload. */
  parseEnvelope<TPayload = unknown>(raw: unknown): A2AEnvelope<TPayload> | null;
  /** Verify + validate an untrusted inbound signed envelope (fail-closed). */
  validateInbound<TPayload = unknown>(
    raw: unknown,
    options?: EnvelopeSigningOptions,
  ): EnvelopeValidation<TPayload>;
}

function newId(): string {
  return `a2a_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}

/** Structural guard for the domain-facing envelope projection (no crypto). */
function looksLikeDomainEnvelope(raw: unknown): raw is A2AEnvelope {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.from === 'string' &&
    typeof r.kind === 'string' &&
    'payload' in r &&
    typeof r.createdAt === 'string'
  );
}

/** Build the envelope service. Pure factory; no singletons. */
export function createEnvelopeService(defaults: EnvelopeSigningOptions = {}): EnvelopeService {
  return {
    buildEnvelope<TPayload = unknown>(input: BuildEnvelopeInput<TPayload>): A2AEnvelope<TPayload> {
      // Omit absent optional keys entirely: the SDK's canonical JSON serializes a
      // present-but-`undefined` key differently from a missing one, so a sealed
      // envelope carrying `to: undefined` would fail signature verification after
      // a JSON wire roundtrip (the key vanishes). Wire-stable by construction.
      return {
        id: input.id ?? newId(),
        from: input.from,
        ...(input.to !== undefined ? { to: input.to } : {}),
        kind: input.kind,
        payload: input.payload,
        ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
        createdAt: input.createdAt ?? new Date().toISOString(),
      };
    },

    sealEnvelope<TPayload = unknown>(
      envelope: A2AEnvelope<TPayload>,
      options: EnvelopeSigningOptions = {},
    ): SignedEnvelope<A2AEnvelope<TPayload>> {
      const secret = options.hmacSecret ?? defaults.hmacSecret ?? null;
      const keyId = options.keyId ?? defaults.keyId ?? 'recoder-a2a';
      const signedAt = (options.now ?? defaults.now ?? new Date()).toISOString();
      // With a secret we produce a real HMAC signature; without one we emit an
      // explicit unsigned marker (empty signature) — NEVER a fabricated one.
      const signature = secret
        ? createSignedEnvelopeSignature({ payload: envelope, secret, keyId, signedAt })
        : { algorithm: 'hmac-sha256' as const, key_id: keyId, signature: '', signed_at: signedAt };
      return createSignedEnvelope<A2AEnvelope<TPayload>>({
        id: envelope.id,
        payload_type: A2A_MESSAGE_PAYLOAD_TYPE,
        payload: envelope,
        signature,
      });
    },

    parseEnvelope<TPayload = unknown>(raw: unknown): A2AEnvelope<TPayload> | null {
      // A signed envelope carries the domain envelope in its payload.
      if (isSignedEnvelope(raw)) {
        const payload = (raw as SignedEnvelope).payload;
        return looksLikeDomainEnvelope(payload) ? (payload as A2AEnvelope<TPayload>) : null;
      }
      // Or the bare domain envelope (unsealed, local path).
      return looksLikeDomainEnvelope(raw) ? (raw as A2AEnvelope<TPayload>) : null;
    },

    validateInbound<TPayload = unknown>(
      raw: unknown,
      options: EnvelopeSigningOptions = {},
    ): EnvelopeValidation<TPayload> {
      const secret = options.hmacSecret ?? defaults.hmacSecret ?? undefined;
      const requireSignature = options.requireSignature ?? defaults.requireSignature ?? Boolean(secret);
      const ingress = validateSignedEnvelopeIngress<A2AEnvelope<TPayload>>(raw, {
        secret: secret ?? undefined,
        requireSignature,
        now: options.now ?? defaults.now,
        maxFutureSkewMs: options.maxFutureSkewMs ?? defaults.maxFutureSkewMs,
      });
      if (!ingress.ok) {
        return { valid: false, status: ingress.status, code: ingress.code, reason: ingress.message };
      }
      const domain = looksLikeDomainEnvelope(ingress.payload) ? (ingress.payload as A2AEnvelope<TPayload>) : undefined;
      if (!domain) {
        return {
          valid: false,
          status: 400,
          code: 'envelope_payload_malformed',
          reason: 'Signed envelope payload is not a well-formed A2A domain envelope.',
        };
      }
      return { valid: true, status: 200, code: 'envelope_ok', reason: 'Verified A2A envelope.', envelope: domain };
    },
  };
}
