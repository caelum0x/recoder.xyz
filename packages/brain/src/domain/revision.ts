/**
 * A Revision pins the repo state a BrainContext was assembled against. It is the
 * spine of "assemble once, read many": the cache key includes the git HEAD sha,
 * so a new commit (a new sha) yields a different key and the stale repo
 * intelligence is naturally invalidated instead of silently reused.
 *
 * `dirty` records uncommitted changes so a working-tree edit is not mistaken for
 * the committed revision — when dirty, the assembled context is treated as
 * head-scoped-but-not-reusable across edits (the resolver folds dirty into the
 * key).
 */
export interface Revision {
  /** git HEAD sha (or a deterministic stand-in when git is unavailable). */
  readonly head: string;
  /** True when the working tree has uncommitted changes. */
  readonly dirty: boolean;
  /** When this revision was resolved (ISO-8601). */
  readonly resolvedAt: string;
}
