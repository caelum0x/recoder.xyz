/**
 * `signed-ingress.gate` — the hostile-by-default admission point for untrusted
 * inbound A2A envelopes. This is the SKELETON the interop wire group fills with
 * `@recoder/interop`'s `admitSignedMcpCall` (HMAC + ed25519 signature → MCP tool
 * policy). It is intentionally minimal here, but it is REAL fail-closed security:
 * with no verifier wired it DENIES (unless local-dev insecure ingress is
 * explicitly allowed), so an unfinished wire never becomes an open door.
 *
 * The `IngressVerifier` seam is what `ext-authz.middleware.ts` consumes: inject
 * the real `@recoder/interop` verifier and this gate delegates to it; leave it
 * unwired and every envelope is rejected `signed_ingress_unwired` (503).
 */
import type { IngressResult } from '../types.js';

/** The signing posture the gate enforces (mirrors `InteropConfig`). */
export interface SignedIngressConfig {
  /** Reject unsigned envelopes (forced on in production). */
  readonly requireSigned: boolean;
  /** Shared HMAC secret; `null` -> HMAC envelopes cannot be admitted. */
  readonly hmacSecret: string | null;
  /** Allow unsigned ingress in local dev only (never in production). */
  readonly allowInsecure: boolean;
}

/**
 * The pluggable verifier the wire group injects. Returning a rejection is a
 * clean DENY; it must NEVER throw on untrusted input (that is the whole point of
 * a hostile-by-default edge). The wire group wires `@recoder/interop`
 * `admitSignedMcpCall` here.
 */
export interface IngressVerifier {
  admit<TPayload = unknown>(value: unknown): IngressResult<TPayload> | Promise<IngressResult<TPayload>>;
}

/** A signed-ingress gate: `admit(value)` -> fail-closed `IngressResult`. */
export interface SignedIngressGate {
  admit<TPayload = unknown>(value: unknown): Promise<IngressResult<TPayload>>;
}

function denied(status: number, code: string, reason: string): IngressResult<never> {
  return { admitted: false, status, code, reason };
}

/**
 * Build the signed-ingress gate. Precedence:
 *   1. A wired `verifier` is authoritative (delegates; converts a throw to a
 *      fail-closed 503 rather than propagating).
 *   2. No verifier + `allowInsecure` + not `requireSigned` -> admit (dev only).
 *   3. Otherwise -> deny (fail-closed), the safe default while the wire is unbuilt.
 */
export function createSignedIngressGate(
  config: SignedIngressConfig,
  verifier?: IngressVerifier,
): SignedIngressGate {
  return {
    async admit<TPayload = unknown>(value: unknown): Promise<IngressResult<TPayload>> {
      if (verifier) {
        try {
          return await verifier.admit<TPayload>(value);
        } catch {
          // A verifier fault is an infrastructure failure — deny, never admit.
          return denied(503, 'signed_ingress_verifier_fault', 'Ingress verifier faulted — rejected (fail-closed).');
        }
      }
      if (!config.requireSigned && config.allowInsecure) {
        // Local-dev escape hatch ONLY: explicitly opted-in unsigned ingress.
        return {
          admitted: true,
          status: 200,
          code: 'insecure_ingress_allowed',
          reason: 'Unsigned ingress admitted (local dev; insecure ingress allowed).',
          payload: value as TPayload,
        };
      }
      return denied(503, 'signed_ingress_unwired', 'Signed-ingress verifier not wired — rejected (fail-closed).');
    },
  };
}
