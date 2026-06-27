/**
 * HandoffStorePort — persists handoffs + their delegation-chain depth + the
 * dedup ledger so delivery is effectively-once and dedup survives restart
 * (MERGED from the `_localEventIds` dedup of the A2A bus, made durable).
 */

import type { Handoff } from '../domain';

export interface HandoffStorePort {
  put(handoff: Handoff): Promise<Handoff>;
  get(handoffId: string): Promise<Handoff | undefined>;
  /** All handoffs in a delegation chain, ordered by depth. */
  chain(rootHandoffId: string): Promise<Handoff[]>;
  /** True if a delivery with this dedup key was already seen. */
  hasDedupKey(dedupKey: string): Promise<boolean>;
  /** Record a dedup key as seen (idempotent). */
  recordDedupKey(dedupKey: string): Promise<void>;
}
