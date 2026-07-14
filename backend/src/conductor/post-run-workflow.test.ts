/**
 * Tests for post-run-workflow — the conductor's post-run delivery graph
 * (verify -> browser-check -> memory PLUS verify -> approval -> pull-request ->
 * deploy), driven by the OWNED @recoder/agent-workflows runner.
 *
 * These pin the SAFETY contract of the extended graph (INTEGRATION-PLAN §b.1
 * item 3): approval / pull-request / deploy are REAL dependency-ordered nodes,
 * and the pull-request handler NEVER opens a PR the human did not ask for:
 *
 *   - the approval node consults the REAL delivery gate (checkDeliveryApproval)
 *     and reports a truthful `skipped` (approval-pending) when the gate is open;
 *   - the pull-request handler RE-CHECKS the gate itself (the runner only
 *     cascade-skips on a FAILED dependency, so a skipped approval node would not
 *     stop it) and additionally requires the explicit `metadata.autoPr` opt-in
 *     and the absence of an already-recorded `metadata.pr`;
 *   - deploy is a truthful skip (no conductor deploy target exists);
 *   - unknown node kinds report `skipped`, never a fake `completed`.
 *
 * Mocking style mirrors completion-watcher.test.ts / browser-check.test.ts: the
 * conductor collaborators post-run-workflow calls (delivery-approval gate,
 * review-publish PR action, delivery-summary builders, browser-check, workspace
 * lookup, coordination handoff) are the ONLY seams stubbed, via vi.mock; the
 * REAL @recoder/agent-workflows runner + node builders execute the graph.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Workspace } from '@recoder/agent-os';

vi.mock('./delivery-summary.js', () => ({
  generateDeliverySummary: vi.fn(),
  generateMemoryCandidate: vi.fn(),
}));
vi.mock('./browser-check.js', () => ({
  runBrowserCheck: vi.fn(),
}));
vi.mock('./workspace-service.js', () => ({
  getWorkspace: vi.fn(),
}));
vi.mock('./coordination-integration.js', () => ({
  emitReviewHandoff: vi.fn(),
}));
vi.mock('./delivery-approval.js', () => ({
  checkDeliveryApproval: vi.fn(),
}));
vi.mock('./review-publish.js', () => ({
  createWorkspacePr: vi.fn(),
}));

import { generateDeliverySummary, generateMemoryCandidate } from './delivery-summary.js';
import { runBrowserCheck } from './browser-check.js';
import { getWorkspace } from './workspace-service.js';
import { checkDeliveryApproval } from './delivery-approval.js';
import { createWorkspacePr } from './review-publish.js';
import {
  buildPostRunDefinition,
  createPostRunNodeExecutor,
  runPostRunDelivery,
} from './post-run-workflow.js';
import type { WorkflowNode } from '@recoder/agent-workflows';

const WORKSPACE_ID = 'ws_post_run_test';

function makeWorkspace(metadata: Record<string, unknown> = {}): Workspace {
  const now = new Date().toISOString();
  return {
    workspaceId: WORKSPACE_ID,
    spaceId: 'space_test',
    projectId: 'proj_test',
    taskId: 'task_post_run_test',
    runtimeId: 'claude_code',
    substrate: 'in_process',
    branch: 'recoder/post-run-test',
    baseRef: 'main',
    state: 'running',
    createdBy: 'test',
    createdAt: now,
    updatedAt: now,
    metadata,
  } as Workspace;
}

/** Program the happy-path collaborators so only the delivery gate varies per test. */
function primeCollaborators(workspace: Workspace): void {
  vi.mocked(getWorkspace).mockResolvedValue(workspace);
  vi.mocked(generateDeliverySummary).mockResolvedValue({
    workspaceId: WORKSPACE_ID,
    taskId: workspace.taskId,
    runtimeId: workspace.runtimeId,
    changedFiles: 1,
    success: true,
    exitCode: 0,
  } as never);
  vi.mocked(generateMemoryCandidate).mockResolvedValue(null);
  vi.mocked(runBrowserCheck).mockResolvedValue({
    attempted: false,
    result: null,
    artifact: null,
  } as never);
}

function statusOf(
  result: Awaited<ReturnType<typeof runPostRunDelivery>>,
  nodeId: string,
) {
  return result.nodeStatuses.find((n) => n.nodeId === nodeId);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('buildPostRunDefinition (graph shape)', () => {
  it('contains all six nodes with the documented dependency edges', () => {
    const def = buildPostRunDefinition(WORKSPACE_ID);

    const byId = new Map(def.nodes.map((n) => [n.nodeId, n]));
    expect(def.nodes).toHaveLength(6);

    const expectEdge = (nodeId: string, kind: string, dependsOn: string[] | undefined) => {
      const node = byId.get(nodeId);
      expect(node, `node ${nodeId} missing from definition`).toBeDefined();
      expect(node?.kind).toBe(kind);
      expect(node?.dependsOn ?? undefined).toEqual(dependsOn);
    };

    expectEdge('post-run-verify', 'verification', undefined);
    expectEdge('post-run-browser-check', 'browser-check', ['post-run-verify']);
    expectEdge('post-run-memory', 'memory', ['post-run-verify', 'post-run-browser-check']);
    expectEdge('post-run-approval', 'approval', ['post-run-verify']);
    expectEdge('post-run-pr', 'pull-request', ['post-run-approval']);
    expectEdge('post-run-deploy', 'deploy', ['post-run-pr']);
  });
});

describe('runPostRunDelivery (extended delivery graph)', () => {
  it('with no approval recorded: approval + pull-request skip truthfully and NO PR is opened', async () => {
    // Opt-in IS present, so the only thing between the graph and a PR is the
    // human approval gate — the exact scenario the safety re-check must catch.
    primeCollaborators(makeWorkspace({ autoPr: true }));
    vi.mocked(checkDeliveryApproval).mockResolvedValue({
      approved: false,
      reason: 'no approved pr approval for task task_post_run_test',
    });

    const result = await runPostRunDelivery(WORKSPACE_ID);

    expect(result.ranViaRunner).toBe(true);
    expect(statusOf(result, 'post-run-approval')?.status).toBe('skipped');
    expect(statusOf(result, 'post-run-approval')?.output?.reason).toBe('approval-pending');
    expect(statusOf(result, 'post-run-pr')?.status).toBe('skipped');
    expect(statusOf(result, 'post-run-pr')?.output?.reason).toBe('approval-pending');
    // SAFETY: the gate was open — the PR action must never fire.
    expect(createWorkspacePr).not.toHaveBeenCalled();
  });

  it('without the autoPr opt-in: pull-request skips (auto-pr-not-requested) even when approved', async () => {
    primeCollaborators(makeWorkspace({}));
    vi.mocked(checkDeliveryApproval).mockResolvedValue({ approved: true, approvalId: 'ap_1' });

    const result = await runPostRunDelivery(WORKSPACE_ID);

    expect(statusOf(result, 'post-run-approval')?.status).toBe('completed');
    expect(statusOf(result, 'post-run-pr')?.status).toBe('skipped');
    expect(statusOf(result, 'post-run-pr')?.output?.reason).toBe('auto-pr-not-requested');
    // SAFETY: no human asked for an automated PR — never open one.
    expect(createWorkspacePr).not.toHaveBeenCalled();
  });

  it('with an approved gate + the autoPr opt-in: opens the PR once and reports the URL', async () => {
    primeCollaborators(makeWorkspace({ autoPr: true }));
    vi.mocked(checkDeliveryApproval).mockResolvedValue({ approved: true, approvalId: 'ap_2' });
    vi.mocked(createWorkspacePr).mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      branch: 'recoder/post-run-test',
      base: 'main',
      url: 'https://github.com/recoder/example/pull/42',
    });

    const result = await runPostRunDelivery(WORKSPACE_ID);

    expect(statusOf(result, 'post-run-approval')?.status).toBe('completed');
    expect(statusOf(result, 'post-run-approval')?.output?.approved).toBe(true);
    expect(statusOf(result, 'post-run-pr')?.status).toBe('completed');
    expect(statusOf(result, 'post-run-pr')?.output?.url).toBe(
      'https://github.com/recoder/example/pull/42',
    );
    expect(createWorkspacePr).toHaveBeenCalledTimes(1);
    expect(createWorkspacePr).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({ title: expect.any(String) }),
    );
  });

  it('never duplicates an already-recorded PR (metadata.pr present)', async () => {
    primeCollaborators(
      makeWorkspace({ autoPr: true, pr: { url: 'https://github.com/recoder/example/pull/7' } }),
    );
    vi.mocked(checkDeliveryApproval).mockResolvedValue({ approved: true, approvalId: 'ap_3' });

    const result = await runPostRunDelivery(WORKSPACE_ID);

    expect(statusOf(result, 'post-run-pr')?.status).toBe('skipped');
    expect(statusOf(result, 'post-run-pr')?.output?.reason).toBe('pr-already-exists');
    expect(createWorkspacePr).not.toHaveBeenCalled();
  });

  it('reports a truthful FAILED pull-request node when createWorkspacePr throws', async () => {
    primeCollaborators(makeWorkspace({ autoPr: true }));
    vi.mocked(checkDeliveryApproval).mockResolvedValue({ approved: true, approvalId: 'ap_4' });
    vi.mocked(createWorkspacePr).mockRejectedValue(new Error('gh: not authenticated'));

    const result = await runPostRunDelivery(WORKSPACE_ID);

    const pr = statusOf(result, 'post-run-pr');
    expect(pr?.status).toBe('failed');
    expect(pr?.error).toContain('gh: not authenticated');
    // A failed delivery node must never let deploy pretend to run.
    expect(statusOf(result, 'post-run-deploy')?.status ?? 'skipped').not.toBe('completed');
  });

  it('deploy always reports skipped with reason no-deploy-target-configured', async () => {
    for (const approved of [false, true]) {
      vi.resetAllMocks();
      primeCollaborators(makeWorkspace({}));
      vi.mocked(checkDeliveryApproval).mockResolvedValue(
        approved ? { approved: true, approvalId: 'ap_5' } : { approved: false, reason: 'none' },
      );

      const result = await runPostRunDelivery(WORKSPACE_ID);

      const deploy = statusOf(result, 'post-run-deploy');
      expect(deploy?.status).toBe('skipped');
      expect(deploy?.output?.reason).toBe('no-deploy-target-configured');
    }
  });

  it('keeps the original verify/browser/memory behavior intact', async () => {
    primeCollaborators(makeWorkspace({}));
    vi.mocked(checkDeliveryApproval).mockResolvedValue({ approved: false, reason: 'none' });

    const result = await runPostRunDelivery(WORKSPACE_ID);

    expect(statusOf(result, 'post-run-verify')?.status).toBe('completed');
    expect(statusOf(result, 'post-run-browser-check')?.status).toBe('skipped');
    expect(statusOf(result, 'post-run-memory')?.status).toBe('completed');
    expect(result.summary?.changedFiles).toBe(1);
  });

  it('skips the approval node truthfully when the gate check itself throws', async () => {
    primeCollaborators(makeWorkspace({ autoPr: true }));
    vi.mocked(checkDeliveryApproval).mockRejectedValue(new Error('repository unavailable'));

    const result = await runPostRunDelivery(WORKSPACE_ID);

    expect(statusOf(result, 'post-run-approval')?.status).toBe('skipped');
    expect(statusOf(result, 'post-run-pr')?.status).toBe('skipped');
    expect(createWorkspacePr).not.toHaveBeenCalled();
  });
});

describe('createPostRunNodeExecutor (unknown kinds)', () => {
  it('reports skipped — never a fake completed — for an unhandled node kind', async () => {
    const executor = createPostRunNodeExecutor(WORKSPACE_ID, {
      summary: null,
      candidate: null,
      browserVerification: null,
    });
    const unknownNode = {
      nodeId: 'post-run-mystery',
      kind: 'condition',
      label: 'Mystery',
      config: {},
    } as WorkflowNode;

    const result = await executor(unknownNode, {} as never);

    expect(result.status).toBe('skipped');
    expect(result.output?.reason).toBe('unhandled-node-kind');
  });
});
