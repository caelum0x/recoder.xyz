/**
 * `A2ATransport` — the WIRE seam: inbound (ingress) + outbound (egress) A2A
 * envelope handling plus agent-card publication. Consumed by social/connectors
 * ingress and conductor egress; implemented by the interop `wire/` group.
 *
 * Ingress is HOSTILE-BY-DEFAULT: an untrusted envelope is only `admitted` after
 * its signature + identity + policy are proven. `ingressEnvelope` NEVER throws
 * on untrusted input — a malformed/forged envelope is a returned
 * `IngressResult` with `admitted: false` (fail-closed), never an exception a
 * caller might treat as "admit".
 */
import type { A2AEnvelope, AgentCard, EgressEnvelope, IngressResult } from '../types.js';

export interface A2ATransport {
  /** Verify + admit one untrusted inbound envelope (signature → identity → policy). */
  ingressEnvelope<TPayload = unknown>(value: unknown): Promise<IngressResult<TPayload>>;
  /** Seal + sign an outbound envelope this instance emits. */
  egressEnvelope<TPayload = unknown>(envelope: A2AEnvelope<TPayload>): Promise<EgressEnvelope<TPayload>>;
  /** Serve this instance's local agent-card. */
  agentCard(): Promise<AgentCard>;
  /** Resolve (and cache) a remote agent-card by url/id. */
  resolveRemoteCard(ref: string): Promise<AgentCard | null>;
}
