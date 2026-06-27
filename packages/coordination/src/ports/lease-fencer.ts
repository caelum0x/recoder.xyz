/**
 * LeaseFencerPort — issues + verifies monotonic fence tokens so a stale writer
 * cannot clobber a re-acquired lock. `issue` returns a strictly increasing
 * token per (spaceId,repo,pathGlob) scope; `verify` rejects a token below the
 * current one.
 */

export interface LeaseFencerPort {
  /** Issue the next monotonic fence token for a lock scope. */
  issue(scopeKey: string): Promise<number>;
  /** True if `token` is current (>= the latest issued) for the scope. */
  verify(scopeKey: string, token: number): Promise<boolean>;
}
