/**
 * `ed25519-ingress.gate` — asymmetric envelope verification layered IN FRONT of
 * the frozen HMAC signed-ingress gate. An inbound envelope whose signature
 * algorithm is `ed25519` is verified here (the a2a-sdk's HMAC path rejects it as
 * `unsupported_algorithm`); every other value falls through to the inner gate
 * unchanged, so the existing HMAC posture is untouched.
 *
 * Verification composes `@recoder/interop`'s real `verifyEd25519Signature`
 * (EdDSA over the SDK's `canonicalJson(payload)` — byte-identical to what the
 * HMAC path signs) with key resolution from the peer trust surface:
 *
 *   1. TIMING — the same `signed_at` future-skew + `expires_at` checks the SDK
 *      applies to HMAC envelopes (algorithm parity on freshness).
 *   2. KEY    — the signature's `key_id` resolves via the `PeerKeyResolver`
 *      (config static map first, then the peer registry's `public_key`).
 *   3. SIG    — asymmetric verify; the verifier never holds the signer's secret.
 *
 * Enforcement is config-driven (`Ed25519Mode`):
 *   - `enforce`    — any unresolved key / invalid signature / bad timing is a
 *                    truthful DENY (production default; fail-closed).
 *   - `permissive` — the failure is LOGGED and the envelope is allowed (solo
 *                    default so nothing breaks before peers exchange keys); the
 *                    admission code says `unverified` — never a faked "verified".
 * A malformed domain payload is 400 in BOTH modes, and a verifier fault is a
 * fail-closed 503 — this gate never throws on untrusted input.
 */
import { isSignedEnvelope, type SignedEnvelope } from '@recoder/a2a-sdk';
import { verifyEd25519Signature } from '@recoder/interop';
import type { Logger } from '../../../shared/logger.js';
import type { Ed25519Mode } from '../config.js';
import type { AgentRegistryRepo } from '../ports/agent-registry.repo.js';
import type { IngressResult } from '../types.js';
import type { EnvelopeService } from './a2a-envelope.service.js';
import { createReplayGuard, type ReplayGuard } from './replay-guard.js';
import type { IngressAdmissionContext, SignedIngressGate } from './signed-ingress.gate.js';
import { checkPayloadTaskHistory, TASK_HISTORY_INVALID_CODE } from './task-history.guard.js';

/** Resolve the ed25519 public key trusted for a signature `key_id`; `null` ⇒ unknown. */
export type PeerKeyResolver = (keyId: string) => Promise<string | null>;

export interface PeerKeyResolverDeps {
  /** Config-injected trust map: `key_id` → public key (raw hex/base64 or PEM). */
  readonly staticKeys: Readonly<Record<string, string>>;
  /** The peer registry whose `public_key` column backs dynamic resolution. */
  readonly registry?: AgentRegistryRepo;
  /** Owner scope for registry lookups; absent/`null` ⇒ registry resolution off. */
  readonly registryOwnerId?: string | null;
  readonly logger?: Logger;
}

/**
 * Build the peer-key resolver: static config keys win, then the peer registry
 * (`key_id` = registered agent id, key from `public_key` or the agent card).
 * A registry fault resolves `null` (key unresolved) — truthful, never a throw.
 */
export function createPeerKeyResolver(deps: PeerKeyResolverDeps): PeerKeyResolver {
  return async (keyId: string): Promise<string | null> => {
    const fromConfig = deps.staticKeys[keyId];
    if (typeof fromConfig === 'string' && fromConfig.length > 0) return fromConfig;
    if (!deps.registry || !deps.registryOwnerId) return null;
    try {
      const row = await deps.registry.get(keyId, deps.registryOwnerId);
      const key = row?.publicKey ?? row?.card.publicKey;
      return typeof key === 'string' && key.length > 0 ? key : null;
    } catch (err: unknown) {
      deps.logger?.warn(
        { keyId, err: err instanceof Error ? err.message : String(err) },
        'ed25519 peer-key registry lookup failed — key unresolved',
      );
      return null;
    }
  };
}

export interface Ed25519IngressGateDeps {
  /** The frozen HMAC signed-ingress gate every non-ed25519 value falls through to. */
  readonly inner: SignedIngressGate;
  /** The envelope service that recovers the domain envelope from a signed one. */
  readonly envelope: EnvelopeService;
  readonly resolveKey: PeerKeyResolver;
  readonly mode: Ed25519Mode;
  /**
   * Refuse an EXTERNAL (untrusted) shared-HMAC SIGNED envelope rather than
   * verifying it against the symmetric secret (audit #27). The shared HMAC is a
   * secret ANY holder can forge, so when this is `true` (production posture,
   * wired from `requireSignedIngress`) a cross-tenant sender MUST present a
   * per-sender ed25519 signature; the shared-HMAC path is reserved for
   * `trusted` intra-cluster callers. When `false` (local-dev insecure posture)
   * non-ed25519 traffic falls through to the inner gate unchanged.
   */
  readonly refuseExternalHmac: boolean;
  /** Max ms of future clock skew tolerated on `signed_at` (SDK default: 5 min). */
  readonly maxFutureSkewMs?: number;
  /**
   * The TTL-bounded seen-cache that rejects a REPLAYED signed envelope (same
   * `jti`) within its validity window. Injectable/clearable for tests; when
   * absent a fresh in-process guard is created so production is protected by
   * default. Only SIGNED envelopes (which carry a unique `jti`) are guarded —
   * bare/insecure-dev payloads are untouched.
   */
  readonly replayGuard?: ReplayGuard;
  readonly logger?: Logger;
}

const DEFAULT_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

interface Rejection {
  readonly status: number;
  readonly code: string;
  readonly reason: string;
}

function denied(status: number, code: string, reason: string): IngressResult<never> {
  return { admitted: false, status, code, reason };
}

/**
 * The same `signed_at`/`expires_at` freshness rules the SDK applies to HMAC
 * envelopes, so ed25519 envelopes carry identical replay/skew guarantees.
 */
function checkTiming(env: SignedEnvelope, maxFutureSkewMs: number, now?: Date): Rejection | null {
  const nowMs = now?.getTime() ?? Date.now();
  const signedAtMs = Date.parse(env.signature.signed_at);
  if (!Number.isFinite(signedAtMs)) {
    return { status: 400, code: 'signed_envelope_bad_timestamp', reason: 'Signed A2A envelope has an invalid signed_at timestamp.' };
  }
  if (signedAtMs - nowMs > maxFutureSkewMs) {
    return { status: 401, code: 'signed_envelope_not_yet_valid', reason: 'Signed A2A envelope timestamp is too far in the future.' };
  }
  // Bound signed_at age REGARDLESS of expires_at (recoder-6qym). A present (or
  // attacker-attached far-future) expires_at must NOT remove the freshness
  // bound: an over-age envelope is replayable once the TTL-bounded replay guard
  // forgets its jti. This unconditional max-age check extends the no-expires_at
  // bound (recoder-9yp6) to every envelope.
  if (nowMs - signedAtMs > maxFutureSkewMs) {
    return { status: 401, code: 'signed_envelope_stale', reason: 'Signed A2A envelope is too old.' };
  }
  if (env.signature.expires_at !== undefined) {
    const expiresAtMs = Date.parse(env.signature.expires_at);
    if (!Number.isFinite(expiresAtMs)) {
      return { status: 400, code: 'signed_envelope_bad_timestamp', reason: 'Signed A2A envelope has an invalid expires_at timestamp.' };
    }
    if (expiresAtMs < nowMs) {
      return { status: 401, code: 'signed_envelope_expired', reason: 'Signed A2A envelope expired.' };
    }
  }
  return null;
}

/**
 * Build the ed25519-aware signed-ingress gate (a decorator over the frozen HMAC
 * gate). Pure factory; never throws on untrusted input.
 */
export function createEd25519IngressGate(deps: Ed25519IngressGateDeps): SignedIngressGate {
  const { inner, envelope, resolveKey, mode, refuseExternalHmac, logger } = deps;
  const maxFutureSkewMs = deps.maxFutureSkewMs ?? DEFAULT_MAX_FUTURE_SKEW_MS;
  const replayGuard = deps.replayGuard ?? createReplayGuard();

  /**
   * REPLAY protection for an already-verified signed envelope: require a unique
   * `jti` (the signed-envelope id) and reject a second presentation of the same
   * signature within its validity window. Returns a `Rejection` to deny, or
   * `null` to let admission proceed. Records the jti only on first sight so a
   * rejected/unverified envelope never poisons the cache.
   */
  function enforceReplay(env: SignedEnvelope, now?: Date): Rejection | null {
    const jti = env.id;
    if (typeof jti !== 'string' || jti.length === 0) {
      return {
        status: 400,
        code: 'signed_envelope_missing_jti',
        reason: 'Signed A2A envelope is missing a unique id (jti) required for replay protection.',
      };
    }
    const nowMs = now?.getTime() ?? Date.now();
    const expiresRaw = env.signature.expires_at !== undefined ? Date.parse(env.signature.expires_at) : NaN;
    const first = replayGuard.remember(jti, {
      nowMs,
      ...(Number.isFinite(expiresRaw) ? { expiresAtMs: expiresRaw } : {}),
    });
    if (!first) {
      return {
        status: 401,
        code: 'signed_envelope_replayed',
        reason: 'Signed A2A envelope replay detected — this signature was already admitted within its validity window.',
      };
    }
    return null;
  }

  async function verify(env: SignedEnvelope, now?: Date): Promise<Rejection | null> {
    const timing = checkTiming(env, maxFutureSkewMs, now);
    if (timing) return timing;
    const publicKey = await resolveKey(env.signature.key_id);
    if (publicKey === null) {
      return {
        status: 401,
        code: 'signed_envelope_key_unknown',
        reason: `No trusted ed25519 public key for key_id: ${env.signature.key_id}`,
      };
    }
    // `verifyEd25519Signature` never throws — malformed key/signature is `false`.
    if (!verifyEd25519Signature(env.payload, env.signature.signature, publicKey)) {
      return { status: 401, code: 'signed_envelope_bad_signature', reason: 'Invalid ed25519 A2A envelope signature.' };
    }
    return null;
  }

  /**
   * Admit the (verified or permissively-allowed) envelope's domain payload. A
   * `verifiedKeyId` is threaded through ONLY on the cryptographically-verified
   * path so the admitted result carries the trustworthy sender identity; the
   * permissive-unverified path passes none (never labels an unverified sender).
   */
  function admitDomain<TPayload>(
    raw: unknown,
    code: string,
    reason: string,
    verifiedKeyId?: string,
  ): IngressResult<TPayload> {
    const domain = envelope.parseEnvelope<TPayload>(raw);
    if (!domain) {
      return denied(400, 'envelope_payload_malformed', 'Signed envelope payload is not a well-formed A2A domain envelope.');
    }
    // A task-history projection in the payload is untrusted remote state — a
    // malformed/illegal chain is rejected in BOTH modes (like a malformed
    // payload), even when a permissive posture would allow an unverified sender.
    const history = checkPayloadTaskHistory(domain.payload);
    if (!history.ok) {
      return denied(400, TASK_HISTORY_INVALID_CODE, history.reason);
    }
    const signer = verifiedKeyId ? { keyId: verifiedKeyId, from: domain.from } : undefined;
    return { admitted: true, status: 200, code, reason, payload: domain.payload, ...(signer ? { signer } : {}) };
  }

  return {
    async admit<TPayload = unknown>(
      value: unknown,
      now?: Date,
      context?: IngressAdmissionContext,
    ): Promise<IngressResult<TPayload>> {
      if (!isSignedEnvelope(value) || value.signature.algorithm !== 'ed25519') {
        // Non-ed25519: a shared-HMAC SIGNED envelope, or a bare/non-envelope value.
        // The symmetric shared-HMAC secret is forgeable by any holder, so an
        // EXTERNAL (untrusted) caller that presents a shared-HMAC signature is
        // REFUSED here — it must use a per-sender ed25519 signature. Fail-closed:
        // we never verify an external envelope against the shared secret. Bare /
        // non-envelope values are NOT refused here (they carry no shared-HMAC
        // claim); they fall through so the inner gate fail-closes per its posture.
        if (refuseExternalHmac && !context?.trusted && isSignedEnvelope(value)) {
          logger?.warn(
            { keyId: value.signature.key_id, algorithm: value.signature.algorithm },
            'external A2A ingress presented a shared-HMAC signature — refused (per-sender ed25519 required)',
          );
          return denied(
            401,
            'external_ingress_requires_ed25519',
            'External A2A ingress must present a per-sender ed25519 signature; the shared-HMAC path is reserved for intra-cluster callers.',
          );
        }
        const innerResult = await inner.admit<TPayload>(value, now, context);
        // Replay-guard the trusted shared-HMAC path too: a signed envelope the
        // inner gate admitted must not be re-admitted within its validity window.
        // Bare/insecure-dev values carry no signature/jti and are left untouched.
        if (innerResult.admitted && isSignedEnvelope(value)) {
          const replay = enforceReplay(value, now);
          if (replay) return denied(replay.status, replay.code, replay.reason);
        }
        return innerResult;
      }
      let rejection: Rejection | null;
      try {
        rejection = await verify(value, now);
      } catch (err: unknown) {
        // Infrastructure fault (not a verification outcome) — fail closed in BOTH modes.
        logger?.error(
          { keyId: value.signature.key_id, err: err instanceof Error ? err.message : String(err) },
          'ed25519 ingress verifier faulted — failing closed',
        );
        return denied(503, 'ed25519_verifier_fault', 'ed25519 ingress verifier faulted — rejected (fail-closed).');
      }
      if (rejection === null) {
        // Verified: enforce replay protection before admitting the payload.
        const replay = enforceReplay(value, now);
        if (replay) return denied(replay.status, replay.code, replay.reason);
        return admitDomain<TPayload>(value, 'ingress_admitted', 'Verified ed25519 A2A envelope.', value.signature.key_id);
      }
      if (mode === 'enforce') {
        return denied(rejection.status, rejection.code, rejection.reason);
      }
      // Permissive posture: log the truthful failure, allow the envelope, and
      // NEVER label it verified.
      logger?.warn(
        { keyId: value.signature.key_id, code: rejection.code, reason: rejection.reason },
        'permissive ed25519 ingress: verification failed — logged and allowed',
      );
      return admitDomain<TPayload>(value, 'ingress_admitted_unverified', `Permissive ed25519 ingress (unverified): ${rejection.reason}`);
    },
  };
}
