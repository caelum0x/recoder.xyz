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
import { enforceDeliveryApproval } from './delivery-approval.js';

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

export interface CreatePrInput {
  title: string;
  body?: string;
  /** Base branch for the PR (default: the workspace baseRef, else 'main'). */
  base?: string;
  draft?: boolean;
  remote?: string;
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
  await enforceDeliveryApproval(workspace, 'pr');

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
}

export interface MergeResult {
  workspaceId: string;
  branch: string;
  merged: boolean;
}

/**
 * Merge the workspace's PR via `gh pr merge` (server-side merge; no local main
 * checkout). Moves the workspace awaiting_review → merging → merged. Approval/
 * policy MUST be enforced by the caller before this runs.
 */
export async function mergeWorkspace(workspaceId: string, input: MergeInput = {}): Promise<MergeResult> {
  const workspace = await requireWorktree(workspaceId);
  const cwd = workspace.worktreePath;
  const strategy = input.strategy || 'squash';

  // Production rule: a merge is the customer-visible delivery and MUST be
  // approval-gated. If no approval record exists, this throws and surfaces
  // awaiting_approval instead of silently merging.
  await enforceDeliveryApproval(workspace, 'merge');

  await advanceWorkspace(workspaceId, 'merging');
  try {
    const args = ['pr', 'merge', workspace.branch, `--${strategy}`];
    if (input.deleteBranch) args.push('--delete-branch');
    await run(cwd, 'gh', args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await advanceWorkspace(workspaceId, 'failed', undefined, { mergeError: message });
    throw new Error(`merge failed: ${message}`);
  }

  await advanceWorkspace(workspaceId, 'merged', undefined, { mergedAt: new Date().toISOString() });
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
