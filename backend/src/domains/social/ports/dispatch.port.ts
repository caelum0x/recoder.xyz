/**
 * `DispatchPort` — the seam into the two things an admitted inbound message can
 * become: a conductor workspace dispatch (`/run …`) or a conversational
 * reply-agent turn. Both are consumed via PORTS so the social domain degrades
 * safely when the conductor or inference dependency is not on disk.
 */
import type { DispatchOutcome, InboundEnvelope, ParsedCommand } from '../types.js';

export interface DispatchPort {
  /**
   * Turn a `/run …` inbound into a conductor workspace + Run. Degrade-safe: when
   * the conductor dependency is absent, returns a `DispatchOutcome` with an
   * `error` (never a faked run id).
   */
  dispatchToConductor(env: InboundEnvelope, command: ParsedCommand): Promise<DispatchOutcome>;
  /**
   * Answer a conversational inbound with a bounded reply-agent turn. Degrade-safe:
   * when the inference gateway is absent, returns a `DispatchOutcome` with an
   * `error` (never a fabricated reply).
   */
  replyInChannel(env: InboundEnvelope): Promise<DispatchOutcome>;
}
