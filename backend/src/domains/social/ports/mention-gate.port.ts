/**
 * `MentionGate` — the trust-boundary decision seam. An inbound message that has
 * crossed the transport boundary (webhook HMAC / long-poll) is STILL untrusted
 * channel content; the gate decides whether it may cross into the control plane.
 *
 * Hostile-by-default: `admit` NEVER throws on untrusted input and defaults to
 * REJECT (empty allowlist ⇒ nothing admitted). A `MentionDecision` with
 * `admitted:false` is a clean drop, never an exception.
 */
import type { InboundEnvelope, MentionDecision } from '../types.js';

export interface MentionGate {
  admit(env: InboundEnvelope): Promise<MentionDecision>;
}
