/**
 * Conductor review-publish — outward-facing, approval-gated review actions.
 *
 * Push the workspace branch and open a pull request, or merge it. These run from
 * the workspace's worktree via `git` + the GitHub `gh` CLI (which infers the repo
 * from the worktree), so no main-repo checkout is touched. They are real network
 * actions: callers must enforce approval/policy before invoking, and the ops
 * degrade truthfully (clear errors) when `gh`/remote/auth are absent.
 *
 * See docs/CONDUCTOR-ARCHITECTURE.md (review → merge → archive) and the production
 * rule: branch pushes, PRs, and merges are approval-gated.
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import type { Artifact, MemoryCandidate, Workspace } from '@recoder/agent-os';
import { createLogger } from '../logger';
import { agentOsContainer } from '../agent-os/service-container';
import { advanceWorkspace, getWorkspace } from './workspace-service.js';
import { enforceDeliveryApproval, type DeliveryIntent } from './delivery-approval.js';
import { commitWorktreeChanges } from './commit-worktree.js';

const exec = promisify(execFile);
const logger = createLogger('conductor:publish');

async function requireWorktree(workspaceId: string): Promise<Workspace & { worktreePath: string }> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
  if (!workspace.worktreePath) throw new Error(`workspace has no worktree: ${workspaceId}`);
  return workspace as Workspace & { worktreePath: string };
}

async function run(cwd: string, bin: string, args: string[]): Promise<string> {
  const { stdout } = await exec(bin, args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

/**
 * Decide whether this workspace's repo can deliver through GitHub (`gh pr merge`)
 * or must fall back to a LOCAL git merge.
 *
 * A LOCAL repo (a plain folder the desktop user pointed at — the common case for
 * the local chat product) has no `origin` remote, or its `origin` is not a GitHub
 * URL, or `gh` is not installed/authenticated. In all of those cases there is no
 * PR to merge server-side; we merge the agent branch into the base branch on disk
 * instead so the change actually LANDS in the user's folder. When a real GitHub
 * remote + `gh` are present we keep the proven `gh pr merge` path unchanged.
 *
 * Best-effort + truthful: any probe failure is treated as "no GitHub" (fall back
 * to the always-works local merge) rather than throwing.
 */
async function canUseGithubMerge(cwd: string, remote: string): Promise<boolean> {
  let remoteUrl: string;
  try {
    remoteUrl = await run(cwd, 'git', ['remote', 'get-url', remote]);
  } catch {
    return false; // no such remote → local repo
  }
  if (!/github\.com/i.test(remoteUrl)) return false; // remote exists but isn't GitHub
  try {
    // `gh auth status` exits non-zero when gh is missing or not authenticated.
    await exec('gh', ['auth', 'status'], { cwd, maxBuffer: 1024 * 1024 });
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
async function resolveMainWorktree(worktreePath: string): Promise<string> {
  try {
    const out = await run(worktreePath, 'git', ['worktree', 'list', '--porcelain']);
    const first = out
      .split('\n')
      .find((line) => line.startsWith('worktree '));
    if (first) return first.slice('worktree '.length).trim();
  } catch {
    /* fall through */
  }
  return worktreePath;
}

/**
 * Perform a LOCAL merge of the workspace branch into the base branch, on disk, so
 * the change lands in the user's folder (no GitHub, no `gh`). Runs in the repo's
 * main working tree: checkout base, merge the agent branch (`--no-ff` by default,
 * fast-forward when the strategy is `rebase`). Returns the resulting base HEAD.
 */
async function localMerge(
  worktreePath: string,
  branch: string,
  base: string,
  strategy: MergeInput['strategy'],
): Promise<{ mainRepo: string; base: string }> {
  const mainRepo = await resolveMainWorktree(worktreePath);
  // Move the main tree onto the base branch so the merge lands there.
  await run(mainRepo, 'git', ['checkout', base]);
  if (strategy === 'rebase') {
    // Closest local analogue to a rebase/linear merge: fast-forward only.
    await run(mainRepo, 'git', ['merge', '--ff-only', branch]);
  } else {
    // Default ('merge'/'squash'): a real merge commit so the change is explicit.
    await run(mainRepo, 'git', ['merge', '--no-ff', '-m', `Merge ${branch} into ${base}`, branch]);
  }
  return { mainRepo, base };
}

export interface CreatePrInput {
  title: string;
  body?: string;
  /** Base branch for the PR (default: the workspace baseRef, else 'main'). */
  base?: string;
  draft?: boolean;
  remote?: string;
  /**
   * User-initiated delivery intent. In solo mode a user-initiated PR records the
   * required approval automatically (the click is the approval); ignored for
   * team/cloud (RECODER_SOLO_MODE off), where the standard approval gate applies.
   */
  intent?: DeliveryIntent;
}

export interface CreatePrResult {
  workspaceId: string;
  branch: string;
  base: string;
  url: string;
}

/**
 * Push the workspace branch and open a PR. Requires the worktree to have commits
 * on its branch and `gh` authenticated for the remote. Records the PR url in the
 * workspace metadata; leaves state at awaiting_review (PR open, not yet merged).
 */
export async function createWorkspacePr(workspaceId: string, input: CreatePrInput): Promise<CreatePrResult> {
  const workspace = await requireWorktree(workspaceId);
  const cwd = workspace.worktreePath;
  const remote = input.remote || 'origin';
  const base = input.base || (workspace.baseRef && workspace.baseRef !== 'HEAD' ? workspace.baseRef : 'main');
  if (!input.title?.trim()) throw new Error('PR title is required');

  // Production rule: opening a PR pushes the branch (a customer-visible delivery
  // action) and MUST be approval-gated. If no approval exists, this throws a
  // DeliveryApprovalRequiredError and transitions the workspace to
  // awaiting_approval — the branch is NOT pushed and the PR is NOT opened.
  await enforceDeliveryApproval(workspace, 'pr', input.intent);

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

  await advanceWorkspace(
    workspaceId,
    workspace.state === 'running' ? 'awaiting_review' : workspace.state,
    undefined,
    { pr: { url, base, createdAt: new Date().toISOString() } },
  );
  logger.info({ workspaceId, url, base }, 'workspace PR opened');
  return { workspaceId, branch: workspace.branch, base, url };
}

export interface MergeInput {
  strategy?: 'squash' | 'merge' | 'rebase';
  deleteBranch?: boolean;
  /**
   * User-initiated delivery intent. In solo mode a user-initiated merge records
   * the required approval automatically (the click is the approval); ignored for
   * team/cloud (RECODER_SOLO_MODE off), where the standard approval gate applies.
   */
  intent?: DeliveryIntent;
}

export interface MergeResult {
  workspaceId: string;
  branch: string;
  merged: boolean;
}

/**
 * Merge the workspace's branch into its base. Two paths, chosen truthfully:
 *
 *   - GITHUB repo (`origin` is a GitHub URL AND `gh` is authenticated): the proven
 *     `gh pr merge` server-side merge — no local main checkout. UNCHANGED.
 *   - LOCAL repo (no remote / non-GitHub remote / `gh` unavailable — the common
 *     case for the local desktop chat product): a real on-disk `git merge` of the
 *     agent branch into the base branch in the repo's main working tree, so the
 *     change LANDS in the user's folder.
 *
 * Either way the workspace moves awaiting_review → merging → merged. Approval/
 * policy MUST be enforced by the caller before this runs (gate below).
 */
export async function mergeWorkspace(workspaceId: string, input: MergeInput = {}): Promise<MergeResult> {
  let workspace = await requireWorktree(workspaceId);
  const cwd = workspace.worktreePath;
  const strategy = input.strategy || 'squash';
  const remote = 'origin';
  const base = workspace.baseRef && workspace.baseRef !== 'HEAD' ? workspace.baseRef : 'main';

  // RE-MERGEABLE: a workspace that previously FAILED at the delivery (merge) step
  // can be re-merged once the cause is fixed. `failed -> merging` is illegal, so
  // first return it to review (the legal `failed -> awaiting_review` transition);
  // the merge below then proceeds normally. We only do this when the prior failure
  // was at the merge step (carries `mergeError`) — never resurrect a provisioning
  // failure that has no worktree work to deliver.
  if (workspace.state === 'failed' && workspace.metadata?.mergeError) {
    workspace = (await advanceWorkspace(workspaceId, 'awaiting_review', undefined, {
      remergeFrom: 'failed',
    })) as Workspace & { worktreePath: string };
    logger.info({ workspaceId }, 'workspace restored from failed merge to awaiting_review for re-merge');
  }

  // Production rule: a merge is the customer-visible delivery and MUST be
  // approval-gated. If no approval record exists, this throws and surfaces
  // awaiting_approval instead of silently merging.
  await enforceDeliveryApproval(workspace, 'merge', input.intent);

  const useGithub = await canUseGithubMerge(cwd, remote);

  // LAND THE AGENT WORK: the agent only edits files in the worktree (it does not
  // `git commit`). Commit any pending worktree changes onto the agent branch FIRST
  // so the branch carries a real commit and the merge below actually delivers the
  // edits instead of finding "Already up to date". Best-effort: a clean worktree
  // (agent already committed) is a no-op.
  try {
    const committed = await commitWorktreeChanges(
      cwd,
      `agent: ${workspace.branch}`,
    );
    if (committed) {
      logger.info({ workspaceId, branch: workspace.branch }, 'committed uncommitted agent worktree changes before merge');
    }
  } catch (err) {
    // Committing the agent's work is part of delivery; if it fails the merge would
    // deliver nothing. Surface truthfully but keep the workspace re-mergeable by
    // leaving it in review rather than dropping it to a dead `failed`.
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ workspaceId, err }, 'failed to commit agent worktree changes before merge');
    throw new Error(`merge failed: could not commit agent changes: ${message}`);
  }

  await advanceWorkspace(workspaceId, 'merging');
  const mergeMode: 'github' | 'local' = useGithub ? 'github' : 'local';
  try {
    if (useGithub) {
      const args = ['pr', 'merge', workspace.branch, `--${strategy}`];
      if (input.deleteBranch) args.push('--delete-branch');
      await run(cwd, 'gh', args);
    } else {
      // LOCAL merge: land the agent branch onto the base branch on disk.
      await localMerge(cwd, workspace.branch, base, strategy);
      logger.info({ workspaceId, branch: workspace.branch, base }, 'workspace merged locally (no GitHub remote)');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // RECOVERABLE merge errors keep the workspace in review (re-mergeable), not
    // `failed`: the agent's work is committed and intact on its branch, and a
    // transient cause (e.g. a dirty base tree) can be retried. We record the error
    // on metadata for the audit trail but transition merging -> awaiting_review.
    await advanceWorkspace(workspaceId, 'awaiting_review', undefined, { mergeError: message, mergeMode });
    throw new Error(`merge failed: ${message}`);
  }

  await advanceWorkspace(workspaceId, 'merged', undefined, { mergedAt: new Date().toISOString(), mergeMode });
  await recordDeliveryMemoryCandidate(workspace).catch((err) =>
    logger.warn({ workspaceId, err }, 'delivery memory candidate skipped (best effort)'),
  );
  logger.info({ workspaceId, branch: workspace.branch, strategy }, 'workspace merged');
  return { workspaceId, branch: workspace.branch, merged: true };
}

/**
 * On delivery, propose a reviewable memory candidate (with evidence) — never write
 * durable memory directly (AGENTS.md). Records a pull_request artifact and a
 * candidate referencing it; both are best-effort and never block the merge.
 */
async function recordDeliveryMemoryCandidate(workspace: Workspace): Promise<void> {
  const repo = agentOsContainer.repository;
  const now = new Date().toISOString();

  const artifact: Artifact = {
    artifactId: `art_${randomUUID()}`,
    taskId: workspace.taskId,
    runId: workspace.runId,
    kind: 'pull_request',
    mimeType: 'text/plain',
    public: false,
    createdAt: now,
    createdBy: 'conductor',
    metadata: { workspaceId: workspace.workspaceId, branch: workspace.branch, runtimeId: workspace.runtimeId },
  };
  await repo.upsertArtifact(artifact);

  const candidate: MemoryCandidate = {
    candidateId: `mc_${randomUUID()}`,
    scope: 'repo',
    title: `Conductor delivery: ${workspace.branch}`,
    body: `Workspace ${workspace.workspaceId} (runtime ${workspace.runtimeId}) merged branch ${workspace.branch}. Knowledge sources: ${(workspace.metadata?.knowledgeSources as string[] | undefined)?.join(', ') ?? 'none'}.`,
    status: 'candidate_created',
    evidence: { taskId: workspace.taskId, artifactId: artifact.artifactId },
    proposedBy: 'conductor',
    proposedAt: now,
  };
  await repo.upsertMemoryCandidate(candidate);
}
