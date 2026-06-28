/**
 * workspace-diff — assemble a SubstrateDiff from the three raw git outputs both
 * substrates already collect (design §4.8 / §8). Mechanism-only and pure: it
 * does NOT shell out (that is the substrate's job, host-side over the worktree
 * or inside the sandbox) — it parses the captured `git diff --stat`, `git diff`,
 * and `git status --porcelain` text into the shared SubstrateDiff shape.
 *
 * This is the one place the `--stat`/porcelain parsing lives; the local
 * (tmux_worktree) and remote (daytona) substrates feed their git output through
 * it so the produced diff is identical regardless of where git ran.
 */
import type { SubstrateDiff } from '../contract/index.js';
import { parseUntracked } from './untracked.js';
import { countChangedFiles } from './diff-summary.js';

export interface RawGitDiffOutput {
  /** Raw `git diff --stat <base>` stdout. */
  stat: string;
  /** Raw `git diff <base>` stdout (the full unified patch). */
  patch: string;
  /** Raw `git status --porcelain` stdout. */
  status: string;
}

/**
 * Build a SubstrateDiff from the raw git outputs. `stat` is trimmed (matching
 * the proven substrate behavior), untracked files come from the porcelain
 * status, and `changedFiles` = tracked-stat lines + untracked count.
 */
export function buildSubstrateDiff(raw: RawGitDiffOutput): SubstrateDiff {
  const untracked = parseUntracked(raw.status);
  const stat = raw.stat.trim();
  const changedFiles = countChangedFiles(stat, untracked);
  return { stat, patch: raw.patch, untracked, changedFiles };
}
