/**
 * dedup-ledger — at-least-once delivery → effectively-once.
 *
 * MERGED from the `_localEventIds` Set + `LOCAL_ID_CAP` trimming in
 * `docker-backend/src/a2a/a2a-event-bus.ts`. The original kept a mutable Set on
 * the bus instance and skipped re-emitting events it had already published.
 * Here it is a first-class, IMMUTABLE in-memory ledger built on the foundation's
 * `BoundedSet` (which already encodes the cap+trim logic). The durable side
 * (survives restart) is the `HandoffStorePort.hasDedupKey`/`recordDedupKey`
 * pair; this in-memory ledger is the fast-path that avoids a store round-trip
 * for keys seen this process.
 *
 * Pure: every `remember` returns a NEW ledger; deciding whether to drop a
 * delivery is a pure predicate over the ledger.
 */

import { BoundedSet } from '../util';

/** Default in-memory dedup capacity, mirroring the A2A bus `LOCAL_ID_CAP`. */
export const DEFAULT_DEDUP_CAP = 10_000;

export class DedupLedger {
  private readonly keys: BoundedSet<string>;

  private constructor(keys: BoundedSet<string>) {
    this.keys = keys;
  }

  /** Create an empty ledger with an optional capacity (defaults to the A2A cap). */
  static empty(cap: number = DEFAULT_DEDUP_CAP): DedupLedger {
    return new DedupLedger(new BoundedSet<string>(cap));
  }

  /** Rehydrate a ledger from previously-seen keys (e.g. loaded from the store). */
  static from(seen: ReadonlyArray<string>, cap: number = DEFAULT_DEDUP_CAP): DedupLedger {
    return new DedupLedger(new BoundedSet<string>(cap, seen));
  }

  /** True if a delivery with this dedup key was already seen. */
  has(dedupKey: string): boolean {
    return this.keys.has(dedupKey);
  }

  /** A NEW ledger that additionally remembers `dedupKey` (oldest trimmed past cap). */
  remember(dedupKey: string): DedupLedger {
    const next = this.keys.add(dedupKey);
    return next === this.keys ? this : new DedupLedger(next);
  }

  get size(): number {
    return this.keys.size;
  }
}

/** A dedup decision: drop the duplicate, or accept + the ledger that now remembers it. */
export type DedupDecision =
  | { readonly duplicate: true }
  | { readonly duplicate: false; readonly ledger: DedupLedger };

/**
 * Decide a delivery against the ledger. Pure: returns the duplicate verdict and,
 * when accepted, the next ledger to carry forward.
 */
export function decideDedup(ledger: DedupLedger, dedupKey: string): DedupDecision {
  if (ledger.has(dedupKey)) {
    return { duplicate: true };
  }
  return { duplicate: false, ledger: ledger.remember(dedupKey) };
}
