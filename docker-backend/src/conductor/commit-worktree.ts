/**
 * Commit an agent's pending worktree changes onto its OWN branch.
 *
 * The real interactive agents (e.g. `claude`, `codex`) only EDIT files in the
 * isolated worktree — they do NOT `git commit`. Left uncommitted, the agent's
 * work is invisible to two places that matter:
 *   1. the review diff — `git diff <base>` does not list brand-new untracked
 *      files, so the review panel shows "No changed files" even though the agent
 *      created files;
 *   2. the merge — the agent branch carries no new commit, so a base
 *      `git merge <agentBranch>` finds "Already up to date" and nothing lands.
 *
 * Committing the pending changes (tracked + untracked) onto the agent branch as
 * soon as the agent finishes fixes both: the diff sees a real commit against the
 * base, and the merge has something to deliver.
 *
 * Best-effort + truthful: a clean worktree is a no-op (returns false). Identity
 * is passed per-commit so a throwaway worktree with no global git user never
 * aborts the commit.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

/**
 * Commit all pending (tracked + untracked) changes in `worktreePath` onto the
 * currently checked-out branch. Returns true when a commit was made, false when
 * the worktree was already clean.
 */
export async function commitWorktreeChanges(
  worktreePath: string,
  message: string,
): Promise<boolean> {
  const status = await git(worktreePath, ['status', '--porcelain']);
  if (!status.trim()) return false; // clean worktree — nothing to commit

  await git(worktreePath, ['add', '-A']);
  await git(worktreePath, [
    '-c',
    'user.email=agent@recoder.dev',
    '-c',
    'user.name=Recoder Agent',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-m',
    message,
  ]);
  return true;
}
