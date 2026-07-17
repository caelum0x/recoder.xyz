/**
 * `signed-vouch.adapter` — the REAL {@link SignedVouch} over the shared
 * connector-ingress HMAC secret (`SOCIAL_INGRESS_SECRET`).
 *
 * An admitted inbound message is RE-PROVEN through the same envelope algebra the
 * interop edge uses: the envelope-projected payload is sealed with
 * `@recoder/interop`'s `sealConnectorIngress` (canonical-JSON HMAC-SHA256 via
 * `@recoder/a2a-sdk`) and the resulting signature is independently verified with
 * `verifyHmacSha256Signature`. A message only re-admits when the seal→verify
 * round-trip proves the configured secret produces a self-consistent canonical
 * signature over exactly the fields the trust boundary gates on.
 *
 * DEGRADE LAW (mirrors `config.ts` — "null secret ⇒ inert"): this factory
 * returns `null` when no ingress secret is configured, so the mention gate
 * simply SKIPS the vouch step (it is never faked). Any fault inside the vouch
 * resolves `false` — the gate drops the message (`vouch_rejected`), never
 * admits on error.
 */
import { sealConnectorIngress, type ConnectorIngressPayload } from '@recoder/interop';
import { verifyHmacSha256Signature } from '@recoder/a2a-sdk';
import type { SignedVouch } from './mention-gate.adapter.js';
import type { InboundEnvelope } from '../types.js';

export interface SignedVouchDeps {
  /** The shared connector-ingress HMAC secret; `null`/empty ⇒ no vouch (inert). */
  readonly secret: string | null;
  /** Key id naming this gateway in the sealed envelope. */
  readonly keyId?: string;
  /** Injectable clock for deterministic envelope timestamps in tests. */
  readonly now?: () => Date;
}

const DEFAULT_KEY_ID = 'social-ingress';

/** Project the domain envelope onto the wire-agnostic ingress payload. */
function toIngressPayload(env: InboundEnvelope, timestamp: number): ConnectorIngressPayload {
  return {
    channel: env.channel,
    accountId: 'default',
    messageId: env.providerMsgId,
    conversationId: env.chatRef,
    text: env.text,
    wasMentioned: env.mentioned ?? false,
    timestamp,
  };
}

/**
 * Build the signed connector-ingress vouch, or `null` when no secret is
 * configured (the gate skips the step — inert, never a faked vouch).
 */
export function createSealedIngressVouch(deps: SignedVouchDeps): SignedVouch | null {
  const secret = deps.secret?.trim();
  if (!secret) return null;
  const keyId = deps.keyId ?? DEFAULT_KEY_ID;
  const now = deps.now ?? ((): Date => new Date());

  return {
    vouch(env: InboundEnvelope): boolean {
      try {
        const at = now();
        const payload = toIngressPayload(env, at.getTime());
        const sealed = sealConnectorIngress({
          message: payload,
          secret,
          keyId,
          signedAt: at.toISOString(),
        });
        // Independent re-verification of the sealed signature over the SAME
        // canonical payload — the edge's own verify primitive, no special case.
        return verifyHmacSha256Signature(sealed.payload, sealed.signature.signature, secret);
      } catch {
        return false; // fault ⇒ drop (never admit on error)
      }
    },
  };
}
