/**
 * SubstrateDiff — a reviewable diff of a workspace's work against its base ref.
 *
 * Promoted verbatim from docker-backend/src/conductor/substrate.ts. Both the
 * local (host-side git over the worktree) and remote (git inside the sandbox)
 * substrates produce this identical shape.
 */
export interface SubstrateDiff {
  /** `git diff --stat` summary against the base ref. */
  stat: string;
  /** Full unified patch of tracked changes against the base ref. */
  patch: string;
  /** Untracked files not yet in the patch. */
  untracked: string[];
  changedFiles: number;
}
