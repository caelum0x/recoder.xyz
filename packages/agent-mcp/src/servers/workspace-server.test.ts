import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgentProfile } from '@recoder/agent-os';
import { McpRegistry } from '../registry';
import { McpToolRouter } from '../host/tool-router';
import { estimateMcpToolRisk } from '../policy/tool-risk';
import {
  registerWorkspaceMcpTools,
  workspaceMcpServer,
  type WorkspaceCreateInput,
  type WorkspaceDiffResult,
  type WorkspaceMergeInput,
  type WorkspaceMergeResult,
  type WorkspaceRecord,
  type WorkspaceRepositoryPort,
} from './workspace-server';

function actor(): AgentProfile {
  return { agentId: 'agent_ws', permissions: { toolRules: [] } } as unknown as AgentProfile;
}

/**
 * In-memory implementation of the injected workspace control-plane port — the
 * SAME contract docker-backend's conductor implements over its store of record.
 * The MCP handlers do REAL calls against this; tests assert state materializes
 * and that an un-approved merge surfaces a truthful error (no faked success).
 */
class InMemoryWorkspaceRepo implements WorkspaceRepositoryPort {
  readonly workspaces = new Map<string, WorkspaceRecord>();
  /** When set, merge throws this — models the conductor's delivery approval gate. */
  mergeBlockedReason: string | null = null;

  async createWorkspace(input: WorkspaceCreateInput): Promise<WorkspaceRecord> {
    const workspaceId = `ws_${this.workspaces.size + 1}`;
    const record: WorkspaceRecord = {
      workspaceId,
      state: 'running',
      branch: input.branch ?? `agent/${workspaceId}`,
      baseRef: input.baseRef ?? 'main',
      spaceId: input.spaceId,
      repo: input.repo,
      worktreePath: `/tmp/${workspaceId}`,
    };
    this.workspaces.set(workspaceId, record);
    return record;
  }

  async diffWorkspace(workspaceId: string): Promise<WorkspaceDiffResult> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) throw new Error(`workspace not found: ${workspaceId}`);
    return {
      workspaceId,
      baseRef: ws.baseRef ?? 'main',
      branch: ws.branch ?? 'unknown',
      stat: ' src/index.ts | 2 +-',
      patch: '--- a/src/index.ts\n+++ b/src/index.ts\n',
      untracked: ['notes.txt'],
      changedFiles: 1,
    };
  }

  async mergeWorkspace(workspaceId: string, input: WorkspaceMergeInput): Promise<WorkspaceMergeResult> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) throw new Error(`workspace not found: ${workspaceId}`);
    if (this.mergeBlockedReason) throw new Error(this.mergeBlockedReason);
    const merged: WorkspaceRecord = { ...ws, state: 'merged' };
    this.workspaces.set(workspaceId, merged);
    return { workspaceId, branch: ws.branch ?? 'unknown', merged: true };
  }
}

function wire(repo: InMemoryWorkspaceRepo): McpToolRouter {
  const router = new McpToolRouter(new McpRegistry());
  registerWorkspaceMcpTools(router, repo);
  return router;
}

test('workspace server registers the full create/diff/merge tool set', () => {
  assert.deepEqual(workspaceMcpServer.toolNames, ['workspace.create', 'workspace.diff', 'workspace.merge']);
  assert.equal(workspaceMcpServer.kind, 'workspace');
});

test('workspace.create provisions a real workspace through the injected port', async () => {
  const repo = new InMemoryWorkspaceRepo();
  const router = wire(repo);

  const created = await router.call({
    server: workspaceMcpServer,
    toolName: 'workspace.create',
    actor: actor(),
    args: { prompt: 'Fix the bug', spaceId: 'space_1', repo: 'recoder.xyz', baseRef: 'main' },
  });
  const record = created.content as WorkspaceRecord;
  assert.equal(record.workspaceId, 'ws_1');
  assert.equal(record.state, 'running');
  assert.equal(repo.workspaces.get('ws_1')?.repo, 'recoder.xyz'); // really persisted
  assert.equal(created.metadata?.workspaceId, 'ws_1');
});

test('workspace.create requires a prompt (truthful validation, not faked success)', async () => {
  const repo = new InMemoryWorkspaceRepo();
  const router = wire(repo);
  await assert.rejects(
    () =>
      router.call({
        server: workspaceMcpServer,
        toolName: 'workspace.create',
        actor: actor(),
        args: {},
      }),
    /prompt is required/,
  );
  assert.equal(repo.workspaces.size, 0);
});

test('workspace.diff returns the reviewable worktree diff against the base ref', async () => {
  const repo = new InMemoryWorkspaceRepo();
  const router = wire(repo);
  await repo.createWorkspace({ prompt: 'work' });

  const result = await router.call({
    server: workspaceMcpServer,
    toolName: 'workspace.diff',
    actor: actor(),
    args: { workspaceId: 'ws_1' },
  });
  const diff = result.content as WorkspaceDiffResult;
  assert.equal(diff.workspaceId, 'ws_1');
  assert.equal(diff.changedFiles, 1);
  assert.deepEqual(diff.untracked, ['notes.txt']);
  assert.equal(result.metadata?.changedFiles, 1);
});

test('workspace.diff on an unknown workspace surfaces a truthful not-found error', async () => {
  const repo = new InMemoryWorkspaceRepo();
  const router = wire(repo);
  await assert.rejects(
    () =>
      router.call({
        server: workspaceMcpServer,
        toolName: 'workspace.diff',
        actor: actor(),
        args: { workspaceId: 'ws_missing' },
      }),
    /workspace not found/,
  );
});

test('workspace.merge merges when the port allows it and persists the merged state', async () => {
  const repo = new InMemoryWorkspaceRepo();
  const router = wire(repo);
  await repo.createWorkspace({ prompt: 'work' });

  const result = await router.call({
    server: workspaceMcpServer,
    toolName: 'workspace.merge',
    actor: actor(),
    args: { workspaceId: 'ws_1', strategy: 'squash', deleteBranch: true },
  });
  const merged = result.content as WorkspaceMergeResult;
  assert.equal(merged.merged, true);
  assert.equal(repo.workspaces.get('ws_1')?.state, 'merged');
});

test('workspace.merge surfaces the delivery-approval gate instead of faking success', async () => {
  const repo = new InMemoryWorkspaceRepo();
  repo.mergeBlockedReason = 'merge requires approval: no approval record';
  const router = wire(repo);
  await repo.createWorkspace({ prompt: 'work' });

  await assert.rejects(
    () =>
      router.call({
        server: workspaceMcpServer,
        toolName: 'workspace.merge',
        actor: actor(),
        args: { workspaceId: 'ws_1' },
      }),
    /requires approval/,
  );
  // State unchanged — the un-approved merge did not mutate the workspace.
  assert.equal(repo.workspaces.get('ws_1')?.state, 'running');
});

test('workspace.merge is classified high-risk (delivery action) by the risk estimator', () => {
  assert.equal(estimateMcpToolRisk('workspace.merge'), 'high');
});
