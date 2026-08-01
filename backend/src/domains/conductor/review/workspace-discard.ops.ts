/**
 * Conductor discard ops — file-level REJECT in the Review flow: restore selected
 * paths to the review base so Apply (= merge) delivers only the accepted set
 * (DESIGN-REFERENCE "accept/reject at set / file / hunk", the FILE level).
 *
 * Host-side git on the workspace's isolated worktree, mirroring the read-only
 * review ops' seams (`workspace-review.ops.ts`) — no module singletons, no
 * `process.env`. Per path: tracked-at-base → `git checkout <base> -- <path>`
 * (restores modified AND worktree-deleted files); added (absent at base) →
 * `git rm -f --ignore-unmatch -- <path>`; unchanged → a truthful 'unchanged',
 * no write. Everything discarded lands as ONE commit on the worktree branch,
 * pathspec-limited so unrelated agent work (staged or not) is never swept in.
 * Degrade-truthful: a single bad path fails THAT path, never the batch; a
 * zero-effect call is a truthful no-op (no empty commit, `committed:false`).
 */
import path from 'node:path';
import { execFileSafe } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import {
  parseNameStatusZ,
  resolveReviewBaseResolved,
  type ReviewOpsDeps,
} from './workspace-review.ops.js';

/** The narrow deps slice the discard op runs over (a subset of the review ops'). */
export type DiscardOpsDeps = Pick<ReviewOpsDeps, 'logger' | 'exec'>;

/** What happened to one requested path — truthful per-path, never batch-faked. */
export type DiscardPathAction = 'restored' | 'removed' | 'unchanged' | 'failed';

export interface DiscardPathResult {
  /** The requested repo-relative path (echoed back for the caller). */
  path: string;
  action: DiscardPathAction;
  /** Present only for `failed` — the truthful per-path reason. */
  reason?: string;
}

/** The `POST /workspaces/:id/files/discard` payload. */
export interface WorkspaceDiscardView {
  workspaceId: string;
  /** The review base the paths were restored to ({@link resolveReviewBaseResolved}). */
  base: string;
  /** True when a discard commit was created (false ⇒ zero-effect no-op). */
  committed: boolean;
  results: DiscardPathResult[];
}

/** Per-path git writes are local — bound them like the per-file diff probes. */
const DISCARD_TIMEOUT_MS = 6_000;
const DISCARD_MAX_BUFFER = 8 * 1024 * 1024;

/**
 * Reject a path that could escape the worktree or become a git option (the
 * SAME guard `converge.ops.ts#isSafeRelPath` applies): no absolute path, no
 * `..` segment, no leading `-`, no NUL. Local mirror — defense-in-depth over
 * the route's 400.
 */
function isSafeRelPath(p: string): boolean {
  if (!p || p.startsWith('-') || p.includes('\0')) return false;
  if (path.isAbsolute(p)) return false;
  return !p.split(/[\\/]/).some((seg) => seg === '..');
}

/**
 * Restore `paths` in the workspace's worktree to the review base, staging and
 * committing the discarded set as ONE commit on the worktree branch (only when
 * something actually changed vs the branch HEAD — never an empty commit). See
 * the module header for the per-path classification. The workspace record is
 * resolved by the CALLER (module) — a missing worktree throws a truthful error.
 */
export async function discardWorkspacePaths(
  deps: DiscardOpsDeps,
  workspace: Workspace,
  paths: readonly string[],
): Promise<WorkspaceDiscardView> {
  const workspaceId = workspace.workspaceId;
  const base = await resolveReviewBaseResolved(deps, workspace);
  if (!workspace.worktreePath) throw new Error(`workspace has no worktree: ${workspaceId}`);
  const wt = workspace.worktreePath;
  const exec = deps.exec ?? execFileSafe;
  const options = { timeoutMs: DISCARD_TIMEOUT_MS, maxBuffer: DISCARD_MAX_BUFFER };

  const results: DiscardPathResult[] = [];
  /** The paths a write actually landed on — the ONLY pathspec the commit sees. */
  const discarded: string[] = [];
  for (const p of paths) {
    if (!isSafeRelPath(p)) {
      results.push({ path: p, action: 'failed', reason: 'unsafe path (absolute, "..", or option-like)' });
      continue;
    }
    try {
      // Classify against base — the path ONLY as a pathspec after the `--` fence.
      const { stdout } = await exec(
        'git',
        ['-C', wt, 'diff', '--name-status', '-z', base, '--', p],
        options,
      );
      const entries = parseNameStatusZ(stdout);
      if (entries.length === 0) {
        // Identical to base (untracked files are out of scope, like the diff edges).
        results.push({ path: p, action: 'unchanged' });
        continue;
      }
      if (entries.every((e) => e.status === 'added')) {
        // Absent at base: remove from worktree AND index (staged deletion).
        await exec('git', ['-C', wt, 'rm', '-f', '--ignore-unmatch', '--', p], options);
        results.push({ path: p, action: 'removed' });
      } else {
        // Tracked at base: restore base content into worktree AND index.
        await exec('git', ['-C', wt, 'checkout', base, '--', p], options);
        results.push({ path: p, action: 'restored' });
      }
      discarded.push(p);
    } catch (err) {
      // One bad path fails THAT path, never the batch.
      const reason = err instanceof Error ? err.message : 'git discard failed';
      deps.logger.warn({ err, workspaceId, path: p }, 'conductor discard path faulted');
      results.push({ path: p, action: 'failed', reason });
    }
  }

  // ONE commit, pathspec-limited to the discarded set so unrelated agent work
  // (staged or not) is never swept in — and ONLY when the set actually differs
  // from the branch HEAD (a worktree-only revert needs no commit).
  let committed = false;
  if (discarded.length > 0) {
    const { stdout } = await exec(
      'git',
      ['-C', wt, 'diff', '--cached', '--name-only', '-z', '--', ...discarded],
      options,
    );
    if (stdout.split('\0').some((line) => line.length > 0)) {
      await exec(
        'git',
        [
          '-C', wt,
          '-c', 'user.email=agent@recoder.dev',
          '-c', 'user.name=Recoder Agent',
          '-c', 'commit.gpgsign=false',
          'commit',
          '-m', `recoder: discard ${discarded.length} path(s) to base`,
          '--', ...discarded,
        ],
        options,
      );
      committed = true;
    }
  }

  return { workspaceId, base, committed, results };
}
