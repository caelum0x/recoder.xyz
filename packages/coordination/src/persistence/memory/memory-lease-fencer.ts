/**
 * MemoryLeaseFencer — in-memory `LeaseFencerPort`. Issues strictly-increasing
 * monotonic fence tokens per scope key so a stale writer cannot clobber a
 * re-acquired lock. The Redis adapter (wave-2) replaces the Map with an atomic
 * `INCR` for cross-process monotonicity.
 */

import type { LeaseFencerPort } from '../../ports';

export class MemoryLeaseFencer implements LeaseFencerPort {
  private readonly tokens = new Map<string, number>();

  async issue(scopeKey: string): Promise<number> {
    const next = (this.tokens.get(scopeKey) ?? 0) + 1;
    this.tokens.set(scopeKey, next);
    return next;
  }

  async verify(scopeKey: string, token: number): Promise<boolean> {
    const current = this.tokens.get(scopeKey) ?? 0;
    return token >= current;
  }
}
