/**
 * Conductor publish ops — outward-facing review actions: push the workspace
 * branch and open a pull request, or merge it. Ported from the proven v1
 * `conductor/review-publish.ts` + `commit-worktree.ts` onto the domain's
 * injected seams. The APPROVAL seam changed with the port: the v1
 * delivery-approval ladder is replaced by the domain's governance gate — the
 * composer runs `guardConductorWrite('workspace.pr'|'workspace.merge')` BEFORE
 * calling these ops, so a deny never reaches the git/gh execution below.
 *
 * These run from the workspace's worktree via `git` + the GitHub `gh` CLI
 * (which infers the repo from the worktree), so no main-repo checkout is
 * touched by the PR path. Real network actions degrade truthfully (clear
 * errors) when `gh`/remote/auth are absent — the merge falls back to a real
 * on-disk `git merge` so the change LANDS in the user's folder (the common
 * local desktop case).
 */
import { execFileSafe } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { AdvanceWorkspaceFn } from './workspace-review.ops.js';
import { resolveRepoDefaultBranch } from '../git-default-branch.js';

/**
 * Resolve the base branch a workspace's branch merges into: the persisted
 * `baseRef` when it is a concrete ref, else the repo's REAL integration base
 * resolved git-native from the worktree (NOT a hardcoded `main`), else — only
 * when git cannot answer — the literal `main` last resort. Never throws.
 */
async function resolvePublishBase(
  deps: PublishOpsDeps,
  workspace: Workspace & { worktreePath: string },
): Promise<string> {
  if (workspace.baseRef && workspace.baseRef !== 'HEAD') return workspace.baseRef;
  const resolved = await resolveRepoDefaultBranch(deps.exec ?? execFileSafe, workspace.worktreePath);
  return resolved ?? 'main';
}

export interface PublishOpsDeps {
  readonly getWorkspace: (workspaceId: string) => Promise<Workspace | null>;
  readonly advanceWorkspace: AdvanceWorkspaceFn;
  readonly logger: Logger;
  /** Child-process seam; defaults to `execFileSafe`. */
  readonly exec?: typeof execFileSafe;
}

export interface CreatePrInput {
  title: string;
  body?: string;
  /** Base branch for the PR (default: the workspace baseRef, else 'main'). */
  base?: string;
  draft?: boolean;
  remote?: string;
}

export interface CreatePrResultView {
  workspaceId: string;
  branch: string;
  base: string;
  url: string;
}

export interface MergeInput {
  strategy?: 'squash' | 'merge' | 'rebase';
  deleteBranch?: boolean;
}

export interface MergeResultView {
  workspaceId: string;
  branch: string;
  merged: boolean;
  /** How the merge was delivered: `github` (`gh pr merge`) or `local` (on-disk `git merge`). */
  mergeMode?: 'github' | 'local';
  /**
   * The durable governance-audit chain id this merge was sealed into (the
   * increment-2 close: POST /merge now returns its audit id so the cockpit's
   * evidence artifact cites a queryable chain entry). `null` when sealing was
   * best-effort-skipped (governance unavailable) — truthful, never fabricated.
   */
  auditId?: string | null;
  /** The sealed entry's chain sequence number (companion to {@link auditId}). */
  auditSeq?: number | null;
  /** The sealed entry hash (tamper-evident chain leaf for the merge). */
  auditEntryHash?: string | null;
  /**
   * The `contentHash` of the exportable convergence evidence record emitted for
   * this merge (step-3 headline artifact) — the client cites it and pulls the full
   * record from `GET …/evidence`. `null`/absent when evidence emission was
   * best-effort-skipped (truthful, never fabricated).
   */
  evidenceHash?: string | null;
  /**
   * A non-blocking MERGE TRUST advisory (`warn` mode, or a `block`-mode medium-trust
   * merge): the trust summary + the specific things to review. ABSENT when the trust
   * gate is `off` or the merge was high-trust. A `block`-mode LOW-trust merge never
   * reaches here — it is refused before the merge runs.
   */
  trustWarning?: string;
  /** The convergence trust tier/score this merge was gated on (echoed for the UI/audit). */
  trustTier?: 'high' | 'medium' | 'low';
  trustScore?: number;
  /**
   * The specific things a reviewer should check before trusting this merge (the
   * trust review flags, e.g. "LLM-assisted merge", "N files were contested").
   * ABSENT/empty when the gate is `off` or there is nothing to flag. Turns the
   * bare tier/score badge into an actionable checklist at the merge decision point.
   */
  trustFlags?: readonly string[];
  /**
   * The cross-candidate self-consistency vote (recoder-je8w) — how much the N
   * independent agents agreed on the files they both touched. ABSENT for a `solo`
   * merge (nothing to vote on); the compare view renders converged/diverged rows.
   */
  vote?: import('../evidence/finding-vote.js').CandidateVote;
}

async function requireWorktree(
  deps: PublishOpsDeps,
  workspaceId: string,
): Promise<Workspace & { worktreePath: string }> {
  const workspace = await deps.getWorkspace(workspaceId);
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
  if (!workspace.worktreePath) throw new Error(`workspace has no worktree: ${workspaceId}`);
  return workspace as Workspace & { worktreePath: string };
}

function makeRun(deps: PublishOpsDeps) {
  const exec = deps.exec ?? execFileSafe;
  return async (cwd: string, bin: string, args: string[]): Promise<string> => {
    const { stdout } = await exec(bin, args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    return stdout.trim();
  };
}

/**
 * Commit all pending (tracked + untracked) changes in `worktreePath` onto the
 * currently checked-out branch. The real interactive agents only EDIT files —
 * they do not `git commit` — so without this the review diff misses new files
 * and the merge finds "Already up to date". Returns true when a commit was
 * made, false when the worktree was already clean. Identity is passed
 * per-commit so a throwaway worktree with no global git user never aborts.
 */
export async function commitWorktreeChanges(
  deps: PublishOpsDeps,
  worktreePath: string,
  message: string,
): Promise<boolean> {
  const run = makeRun(deps);
  const status = await run(worktreePath, 'git', ['status', '--porcelain']);
  if (!status.trim()) return false; // clean worktree — nothing to commit

  await run(worktreePath, 'git', ['add', '-A']);
  await run(worktreePath, 'git', [
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

/**
 * Decide whether this workspace's repo can deliver through GitHub (`gh pr merge`)
 * or must fall back to a LOCAL git merge. A LOCAL repo (a plain folder the
 * desktop user pointed at) has no `origin` remote, or its `origin` is not a
 * GitHub URL, or `gh` is not installed/authenticated. Best-effort + truthful:
 * any probe failure is treated as "no GitHub" (fall back to the always-works
 * local merge) rather than throwing.
 */
async function canUseGithubMerge(
  deps: PublishOpsDeps,
  cwd: string,
  remote: string,
): Promise<boolean> {
  const run = makeRun(deps);
  let remoteUrl: string;
  try {
    remoteUrl = await run(cwd, 'git', ['remote', 'get-url', remote]);
  } catch {
    return false; // no such remote → local repo
  }
  if (!/github\.com/i.test(remoteUrl)) return false; // remote exists but isn't GitHub
  try {
    // `gh auth status` exits non-zero when gh is missing or not authenticated.
    await run(cwd, 'gh', ['auth', 'status']);
  } catch {
    return false; // gh absent / not authenticated → cannot drive a PR merge
  }
  return true;
}

/**
 * Resolve the repository's PRIMARY working tree (where the base branch lives and
 * can be checked out) from a workspace worktree path. The agent branch is checked
 * out in the worktree, so the base-branch merge must run in the main working tree.
 * `git worktree list --porcelain` lists the main tree first; fall back to the
 * worktree itself if the list can't be parsed.
 */
async function resolveMainWorktree(deps: PublishOpsDeps, worktreePath: string): Promise<string> {
  const run = makeRun(deps);
  try {
    const out = await run(worktreePath, 'git', ['worktree', 'list', '--porcelain']);
    const first = out.split('\n').find((line) => line.startsWith('worktree '));
    if (first) return first.slice('worktree '.length).trim();
  } catch {
    /* fall through */
  }
  return worktreePath;
}

/**
 * Best-effort cleanup of a half-completed merge in the main working tree: a
 * failing `git merge` can leave MERGE_HEAD + conflict markers behind, making
 * the on-disk state untruthful and the next re-merge attempt permanently stuck.
 * `git merge --abort` is a no-op when no merge is in progress — but a conflicted
 * `git merge --squash` creates NO MERGE_HEAD, so its staged/partial state needs
 * the follow-up `git reset --merge`. Both are swallowed: this is a safety net
 * for the truthful error already being surfaced to the caller.
 */
async function abortInProgressMerge(deps: PublishOpsDeps, mainRepo: string): Promise<void> {
  const run = makeRun(deps);
  try {
    await run(mainRepo, 'git', ['merge', '--abort']);
  } catch {
    /* no merge in progress, or repo can't abort — nothing more we can do safely */
  }
  try {
    await run(mainRepo, 'git', ['reset', '--merge']);
  } catch {
    /* nothing to reset — the tree is already as clean as we can make it */
  }
}

/**
 * Perform a LOCAL merge of the workspace branch into the base branch, on disk,
 * in the repo's main working tree: checkout base, then land the branch per the
 * strategy — 'squash' (the default) stages the branch's combined diff and
 * commits it as exactly ONE squashed commit (single parent, no merge parents);
 * 'merge' is an explicit `--no-ff` merge commit; 'rebase' is the closest local
 * analogue, fast-forward-only. A squash that stages nothing (branch already
 * merged) truthfully SKIPS the commit instead of failing on an empty commit.
 * On ANY merge failure the in-progress merge is aborted before re-throwing, so
 * the main tree is left CLEAN on the base branch — never a half-merged folder.
 */
async function localMerge(
  deps: PublishOpsDeps,
  worktreePath: string,
  branch: string,
  base: string,
  strategy: MergeInput['strategy'],
): Promise<void> {
  const run = makeRun(deps);
  const mainRepo = await resolveMainWorktree(deps, worktreePath);
  await run(mainRepo, 'git', ['checkout', base]);
  try {
    if (strategy === 'rebase') {
      // Closest local analogue to a rebase/linear merge: fast-forward only.
      await run(mainRepo, 'git', ['merge', '--ff-only', branch]);
    } else if (strategy === 'merge') {
      // Explicit 'merge': a real merge commit so the change is explicit.
      await run(mainRepo, 'git', ['merge', '--no-ff', '-m', `Merge ${branch} into ${base}`, branch]);
    } else {
      // Default ('squash'): stage the branch's combined diff, then land it as
      // ONE squashed commit — the doc-specified single-commit Apply.
      await run(mainRepo, 'git', ['merge', '--squash', branch]);
      if (await hasStagedChanges(deps, mainRepo)) {
        await run(mainRepo, 'git', [
          '-c',
          'user.email=agent@recoder.dev',
          '-c',
          'user.name=Recoder Agent',
          '-c',
          'commit.gpgsign=false',
          'commit',
          '-m',
          `Squash ${branch} into ${base}`,
        ]);
      } else {
        // Already up to date — committing would fail on an empty commit.
        deps.logger.info(
          { branch, base },
          'squash merge staged nothing (already up to date) — skipping commit',
        );
      }
    }
  } catch (err) {
    await abortInProgressMerge(deps, mainRepo);
    throw err;
  }
}

/** True when the index differs from HEAD (`git diff --cached --quiet` exits 1). */
async function hasStagedChanges(deps: PublishOpsDeps, mainRepo: string): Promise<boolean> {
  const run = makeRun(deps);
  try {
    await run(mainRepo, 'git', ['diff', '--cached', '--quiet']);
    return false; // exit 0 — nothing staged
  } catch {
    return true; // non-zero exit — staged changes present
  }
}

/**
 * Push the workspace branch and open a PR. Requires the worktree to have commits
 * on its branch and `gh` authenticated for the remote. Records the PR url in the
 * workspace metadata; leaves state at awaiting_review (PR open, not yet merged).
 * The composer's governance gate MUST have allowed `workspace.pr` before this runs.
 */
export async function createWorkspacePr(
  deps: PublishOpsDeps,
  workspaceId: string,
  input: CreatePrInput,
): Promise<CreatePrResultView> {
  const workspace = await requireWorktree(deps, workspaceId);
  const run = makeRun(deps);
  const cwd = workspace.worktreePath;
  const remote = input.remote || 'origin';
  const base = input.base || (await resolvePublishBase(deps, workspace));
  if (!input.title?.trim()) throw new Error('PR title is required');

  // Land the agent's pending edits on the branch so the PR carries them.
  await commitWorktreeChanges(deps, cwd, `agent: ${workspace.branch}`);

  await run(cwd, 'git', ['push', '-u', remote, workspace.branch]);

  const args = [
    'pr',
    'create',
    '--head',
    workspace.branch,
    '--base',
    base,
    '--title',
    input.title,
    '--body',
    input.body ?? '',
  ];
  if (input.draft) args.push('--draft');
  const url = await run(cwd, 'gh', args);

  await deps.advanceWorkspace(
    workspaceId,
    workspace.state === 'running' ? 'awaiting_review' : workspace.state,
    undefined,
    { pr: { url, base, createdAt: new Date().toISOString() } },
  );
  deps.logger.info({ workspaceId, url, base }, 'workspace PR opened');
  return { workspaceId, branch: workspace.branch, base, url };
}

/**
 * Merge the workspace's branch into its base. Two paths, chosen truthfully:
 *
 *   - GITHUB repo (`origin` is a GitHub URL AND `gh` is authenticated): the
 *     proven `gh pr merge` server-side merge — no local main checkout.
 *   - LOCAL repo (no remote / non-GitHub remote / `gh` unavailable — the common
 *     desktop case): a real on-disk `git merge` of the agent branch into the
 *     base branch in the repo's main working tree, so the change LANDS in the
 *     user's folder.
 *
 * Either way the workspace moves awaiting_review → merging → merged; a merge
 * failure returns it to awaiting_review (re-mergeable) with the truthful error
 * on metadata — never a dead half-merged state. The composer's governance gate
 * MUST have allowed `workspace.merge` before this runs.
 */
export async function mergeWorkspace(
  deps: PublishOpsDeps,
  workspaceId: string,
  input: MergeInput = {},
): Promise<MergeResultView> {
  let workspace = await requireWorktree(deps, workspaceId);
  const run = makeRun(deps);
  const cwd = workspace.worktreePath;
  const strategy = input.strategy || 'squash';
  const remote = 'origin';
  const base = await resolvePublishBase(deps, workspace);

  // RE-MERGEABLE: a workspace that previously FAILED at the delivery (merge) step
  // can be re-merged once the cause is fixed. `failed -> merging` is illegal, so
  // first return it to review; only when the prior failure was at the merge step
  // (carries `mergeError`) — never resurrect a provisioning failure.
  if (workspace.state === 'failed' && workspace.metadata?.mergeError) {
    workspace = (await deps.advanceWorkspace(workspaceId, 'awaiting_review', undefined, {
      remergeFrom: 'failed',
    })) as Workspace & { worktreePath: string };
    deps.logger.info({ workspaceId }, 'workspace restored from failed merge to awaiting_review for re-merge');
  }

  const useGithub = await canUseGithubMerge(deps, cwd, remote);

  // LAND THE AGENT WORK: commit any pending worktree changes onto the agent
  // branch FIRST so the merge actually delivers the edits instead of finding
  // "Already up to date".
  try {
    const committed = await commitWorktreeChanges(deps, cwd, `agent: ${workspace.branch}`);
    if (committed) {
      deps.logger.info(
        { workspaceId, branch: workspace.branch },
        'committed uncommitted agent worktree changes before merge',
      );
    }
  } catch (err) {
    // If the commit fails the merge would deliver nothing — surface truthfully
    // but keep the workspace re-mergeable (still in review, not `failed`).
    const message = err instanceof Error ? err.message : String(err);
    deps.logger.warn({ workspaceId, err }, 'failed to commit agent worktree changes before merge');
    throw new Error(`merge failed: could not commit agent changes: ${message}`);
  }

  await deps.advanceWorkspace(workspaceId, 'merging');
  const mergeMode: 'github' | 'local' = useGithub ? 'github' : 'local';
  try {
    if (useGithub) {
      // Push the just-committed agent branch to the remote FIRST. `gh pr merge`
      // merges the REMOTE PR head, so without this the merge lands the STALE
      // remote branch and silently drops the local commit(s) made above
      // (commitWorktreeChanges) — the merged PR would omit the agent's edits. (recoder-cbeu)
      await run(cwd, 'git', ['push', remote, workspace.branch]);
      const args = ['pr', 'merge', workspace.branch, `--${strategy}`];
      if (input.deleteBranch) args.push('--delete-branch');
      await run(cwd, 'gh', args);
    } else {
      await localMerge(deps, cwd, workspace.branch, base, strategy);
      deps.logger.info(
        { workspaceId, branch: workspace.branch, base },
        'workspace merged locally (no GitHub remote)',
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // RECOVERABLE: the agent's work is committed and intact on its branch —
    // return to review (re-mergeable) with the truthful error on metadata.
    await deps.advanceWorkspace(workspaceId, 'awaiting_review', undefined, {
      mergeError: message,
      mergeMode,
    });
    throw new Error(`merge failed: ${message}`);
  }

  await deps.advanceWorkspace(workspaceId, 'merged', undefined, {
    mergedAt: new Date().toISOString(),
    mergeMode,
  });
  deps.logger.info({ workspaceId, branch: workspace.branch, strategy }, 'workspace merged');
  return { workspaceId, branch: workspace.branch, merged: true, mergeMode };
}
