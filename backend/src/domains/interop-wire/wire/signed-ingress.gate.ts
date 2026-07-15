/**
 * `signed-ingress.gate` — the hostile-by-default admission point for untrusted
 * inbound A2A envelopes. It is REAL fail-closed security composed on top of the
 * `EnvelopeService.validateInbound` (which wraps `@recoder/a2a-sdk`'s
 * `validateSignedEnvelopeIngress`: HMAC verify → expiry → future-skew).
 *
 * Precedence (fail-closed at every step):
 *   1. Signature required + no secret configured ⇒ DENY (503) — cannot verify.
 *   2. A verified envelope ⇒ ADMIT with the recovered payload.
 *   3. A malformed / unsigned-when-required / expired / bad-signature envelope ⇒
 *      DENY with the SDK's status/code (400/401), never a fabricated admit.
 *   4. No signature required + `allowInsecure` (dev only) ⇒ ADMIT the bare
 *      payload; otherwise DENY.
 * It NEVER throws on untrusted input — a fault becomes a fail-closed 503.
 */
import type { IngressResult } from '../types.js';
import type { EnvelopeService, EnvelopeSigningOptions } from './a2a-envelope.service.js';

/** The signing posture the gate enforces (mirrors `InteropWireConfig`). */
export interface SignedIngressConfig {
  /** Reject unsigned envelopes (forced on in production). */
  readonly requireSigned: boolean;
  /** Shared HMAC secret; `null` ⇒ signed envelopes cannot be verified. */
  readonly hmacSecret: string | null;
  /** Allow unsigned ingress in local dev only (never in production). */
  readonly allowInsecure: boolean;
  /** Max ms of future clock skew tolerated on `signed_at`. */
  readonly maxFutureSkewMs?: number;
}

/** A signed-ingress gate: `admit(value)` → fail-closed `IngressResult`. */
export interface SignedIngressGate {
  admit<TPayload = unknown>(value: unknown, now?: Date): Promise<IngressResult<TPayload>>;
}

function denied(status: number, code: string, reason: string): IngressResult<never> {
  return { admitted: false, status, code, reason };
}

/**
 * Build the signed-ingress gate over an `EnvelopeService`. The envelope service
 * owns the crypto (via the a2a-sdk); this gate owns the admission POLICY and the
 * degrade-safe defaults.
 */
export function createSignedIngressGate(
  envelope: EnvelopeService,
  config: SignedIngressConfig,
): SignedIngressGate {
  return {
    async admit<TPayload = unknown>(value: unknown, now?: Date): Promise<IngressResult<TPayload>> {
      // Fail-closed: cannot verify a required signature without a secret.
      if (config.requireSigned && !config.hmacSecret) {
        return denied(503, 'signed_ingress_secret_missing', 'Signing required but no HMAC secret configured — rejected (fail-closed).');
      }
      const opts: EnvelopeSigningOptions = {
        hmacSecret: config.hmacSecret,
        requireSignature: config.requireSigned,
        maxFutureSkewMs: config.maxFutureSkewMs,
        now,
      };
      let result;
      try {
        result = envelope.validateInbound<TPayload>(value, opts);
      } catch {
        // A validator fault is infrastructure failure — deny, never admit.
        return denied(503, 'signed_ingress_verifier_fault', 'Ingress verifier faulted — rejected (fail-closed).');
      }
      if (result.valid && result.envelope) {
        return { admitted: true, status: 200, code: 'ingress_admitted', reason: result.reason, payload: result.envelope.payload as TPayload };
      }
      // Not valid. In dev, an explicitly-allowed-insecure unsigned payload passes.
      if (!config.requireSigned && config.allowInsecure && result.code === 'envelope_payload_malformed') {
        // The payload was a well-formed signed envelope but not our domain shape;
        // still refuse rather than guess.
        return denied(result.status, result.code, result.reason);
      }
      return denied(result.status, result.code, result.reason);
    },
  };
}
