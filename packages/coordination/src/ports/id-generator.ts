/**
 * IdGeneratorPort — issues ids for locks/claims/handoffs/events. Deterministic
 * in tests (FakeIdGenerator). Kept off the pure core so ids are reproducible.
 */

import type { ClaimId, EventId, HandoffId, LockId, SignalId } from '../domain';

export interface IdGeneratorPort {
  lockId(): LockId;
  claimId(): ClaimId;
  handoffId(): HandoffId;
  eventId(): EventId;
  signalId(): SignalId;
}
