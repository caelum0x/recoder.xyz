/**
 * MemoryHandoffStore — Map-backed `HandoffStorePort` with an in-memory dedup
 * ledger. Persists handoffs + their delegation-chain depth and records dedup
 * keys so delivery is effectively-once within the process. The Postgres adapter
 * (wave-2) makes the dedup ledger durable across restart.
 */

import type { Handoff } from '../../domain';
import type { HandoffStorePort } from '../../ports';

export class MemoryHandoffStore implements HandoffStorePort {
  private readonly handoffs = new Map<string, Handoff>();
  private readonly dedupKeys = new Set<string>();

  async put(handoff: Handoff): Promise<Handoff> {
    const stored: Handoff = { ...handoff };
    this.handoffs.set(stored.handoffId, stored);
    return { ...stored };
  }

  async get(handoffId: string): Promise<Handoff | undefined> {
    const handoff = this.handoffs.get(handoffId);
    return handoff ? { ...handoff } : undefined;
  }

  async chain(rootHandoffId: string): Promise<Handoff[]> {
    const out: Handoff[] = [];
    for (const handoff of this.handoffs.values()) {
      const root = handoff.rootHandoffId ?? handoff.handoffId;
      if (root === rootHandoffId) {
        out.push({ ...handoff });
      }
    }
    return out.sort((a, b) => a.depth - b.depth);
  }

  async hasDedupKey(dedupKey: string): Promise<boolean> {
    return this.dedupKeys.has(dedupKey);
  }

  async recordDedupKey(dedupKey: string): Promise<void> {
    this.dedupKeys.add(dedupKey);
  }
}
