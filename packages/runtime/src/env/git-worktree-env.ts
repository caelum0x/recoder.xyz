import type { CwdPolicy } from '@recoder/agent-os';
import { resolveCwd } from '../drivers/shared/cwd-resolver';

/**
 * Branch/worktree policy honored when resolving a run's working directory.
 * Mirrors `TaskSpec.branchPolicy`.
 */
export type BranchPolicy = 'reuse_branch' | 'create_worktree_branch' | 'no_git_write';

export type WorktreeResolveInput = {
  branchPolicy?: BranchPolicy;
  cwdPolicy?: CwdPolicy;
  repoRoot?: string;
  workspaceRoot?: string;
  taskPath?: string;
  fallback: string;
};

export type ResolvedWorktree = {
  /** The concrete, policy-bounded working directory the CLI runs in. */
  cwd: string;
  /** The branch the run should write to, when git writes are permitted. */
  branch?: string;
  /** Whether a dedicated worktree was (or should be) created for this run. */
  isWorktree: boolean;
};

/**
 * Resolve a run's working directory, honoring `branchPolicy`.
 *
 * `reuse_branch` and `no_git_write` resolve directly via the cwd-resolver (no new worktree).
 *
 * TODO(wave): `create_worktree_branch` requires creating/reusing a git worktree per run via
 * `@recoder/git-nexus`. That integration is not wired yet, so this resolver returns the
 * policy-bounded cwd with `isWorktree: false` and the requested branch name, and the caller
 * must NOT assume isolation it did not get. This is intentionally explicit rather than
 * silently creating an unmanaged worktree.
 */
export function resolveWorktree(input: WorktreeResolveInput): ResolvedWorktree {
  const cwd = resolveCwd({
    policy: input.cwdPolicy,
    repoRoot: input.repoRoot,
    workspaceRoot: input.workspaceRoot,
    taskPath: input.taskPath,
    fallback: input.fallback,
  });

  const branchPolicy = input.branchPolicy ?? 'reuse_branch';
  if (branchPolicy === 'no_git_write') {
    return { cwd, isWorktree: false };
  }

  // TODO(wave): create_worktree_branch should provision an isolated worktree; until that
  // lands we resolve in-place and report isWorktree=false truthfully.
  return { cwd, isWorktree: false };
}
