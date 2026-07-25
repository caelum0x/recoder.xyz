/**
 * `resolveRepoDefaultBranch` — the single git-native resolver for a repository's
 * REAL integration base branch (`master` / `develop` / `trunk` / a checked-out
 * feature branch — NOT a hardcoded `main`). It is the shared truth the launch
 * path persists a concrete `baseRef` from, and the read/merge edges degrade back
 * to when a legacy workspace was persisted with the detached `HEAD` sentinel.
 *
 * Callable from ANY path inside the repo — the main working tree OR a linked
 * worktree (the agent-branch checkout the conductor's review edges run in). It
 * NEVER throws and NEVER guesses: it returns `undefined` when git genuinely
 * cannot answer (no git / not a repo / detached main tree), so the caller keeps
 * the last-resort literal explicit at its own site instead of hiding it here.
 *
 * Strategy, most-authoritative first:
 *   1. `git worktree list --porcelain` — the FIRST record is ALWAYS the main
 *      working tree (git guarantees the ordering); its `branch refs/heads/<name>`
 *      is the branch every linked worktree was created off, i.e. the integration
 *      base. This is correct read from a linked worktree too.
 *   2. `git symbolic-ref --short refs/remotes/origin/HEAD` — the remote's declared
 *      default (`origin/<name>` → `<name>`) when the repo has an `origin`.
 *   3. `git rev-parse --abbrev-ref HEAD` — the currently checked-out branch (the
 *      main-repo launch case, before any worktree exists); rejected when detached
 *      (git prints the literal `HEAD`).
 */
import { execFileSafe } from '@recoder/substrate';
import type { ExecOptions, ExecResult } from '@recoder/substrate';

/**
 * The exec seam — structurally the same one the probes already inject. `options`
 * is required so a probe whose `execFile` demands it (e.g. {@link MergeabilityExec})
 * is assignable; the real `execFileSafe` (optional options) is assignable too.
 */
export type GitExecFn = (
  bin: string,
  args: readonly string[],
  options: ExecOptions,
) => Promise<ExecResult>;

/** Local ref reads are cheap — bound them like the other conductor git probes. */
const RESOLVE_TIMEOUT_MS = 5_000;
const RESOLVE_MAX_BUFFER = 1024 * 1024;

const BRANCH_PREFIX = 'branch refs/heads/';

/** The FIRST `branch refs/heads/<name>` in the porcelain is the MAIN worktree's. */
function parseMainWorktreeBranch(stdout: string): string | undefined {
  for (const line of stdout.split('\n')) {
    if (line.startsWith(BRANCH_PREFIX)) {
      const name = line.slice(BRANCH_PREFIX.length).trim();
      if (name) return name;
    }
  }
  return undefined;
}

export async function resolveRepoDefaultBranch(
  exec: GitExecFn,
  cwd: string,
): Promise<string | undefined> {
  const options: ExecOptions = {
    timeoutMs: RESOLVE_TIMEOUT_MS,
    maxBuffer: RESOLVE_MAX_BUFFER,
  };

  try {
    const { stdout } = await exec('git', ['-C', cwd, 'worktree', 'list', '--porcelain'], options);
    const branch = parseMainWorktreeBranch(stdout);
    if (branch) return branch;
  } catch {
    /* not a repo / no git / detached main tree — try the next strategy */
  }

  try {
    const { stdout } = await exec(
      'git',
      ['-C', cwd, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
      options,
    );
    const name = stdout.trim().replace(/^origin\//, '');
    if (name) return name;
  } catch {
    /* no origin/HEAD configured — try the next strategy */
  }

  try {
    const { stdout } = await exec('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], options);
    const name = stdout.trim();
    if (name && name !== 'HEAD') return name;
  } catch {
    /* no git / detached — give up truthfully (caller keeps its own last resort) */
  }

  return undefined;
}

/** Convenience binding over the real `execFileSafe` for callers with no exec seam. */
export function resolveRepoDefaultBranchWithDefaultExec(cwd: string): Promise<string | undefined> {
  return resolveRepoDefaultBranch(execFileSafe, cwd);
}
