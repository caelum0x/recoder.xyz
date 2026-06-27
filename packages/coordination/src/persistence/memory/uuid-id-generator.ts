/**
 * UuidIdGenerator — `IdGeneratorPort` backed by `crypto.randomUUID`, prefixed
 * per id kind so ids are self-describing in logs. Tests use a deterministic
 * `SequentialIdGenerator` instead so emitted ids are reproducible.
 */

import { randomUUID } from 'node:crypto';
import {
  asClaimId,
  asEventId,
  asHandoffId,
  asLockId,
  asSignalId,
  type ClaimId,
  type EventId,
  type HandoffId,
  type LockId,
  type SignalId,
} from '../../domain';
import type { IdGeneratorPort } from '../../ports';

export class UuidIdGenerator implements IdGeneratorPort {
  lockId(): LockId {
    return asLockId(`lock_${randomUUID()}`);
  }

  claimId(): ClaimId {
    return asClaimId(`claim_${randomUUID()}`);
  }

  handoffId(): HandoffId {
    return asHandoffId(`handoff_${randomUUID()}`);
  }

  eventId(): EventId {
    return asEventId(`evt_${randomUUID()}`);
  }

  signalId(): SignalId {
    return asSignalId(`sig_${randomUUID()}`);
  }
}

/**
 * SequentialIdGenerator — deterministic `IdGeneratorPort` for tests. Each kind
 * has its own monotonic counter so ids are stable and readable.
 */
export class SequentialIdGenerator implements IdGeneratorPort {
  private readonly counters: Record<string, number> = {};

  private next(prefix: string): string {
    const value = (this.counters[prefix] ?? 0) + 1;
    this.counters[prefix] = value;
    return `${prefix}_${value}`;
  }

  lockId(): LockId {
    return asLockId(this.next('lock'));
  }

  claimId(): ClaimId {
    return asClaimId(this.next('claim'));
  }

  handoffId(): HandoffId {
    return asHandoffId(this.next('handoff'));
  }

  eventId(): EventId {
    return asEventId(this.next('evt'));
  }

  signalId(): SignalId {
    return asSignalId(this.next('sig'));
  }
}
