/**
 * continueWorkspace guards — the CONTINUE/CHAT path must degrade truthfully:
 * reject a missing/terminal/running/no-worktree workspace with a clear error
 * instead of guessing or re-provisioning. The happy path (a real 2nd run in the
 * same worktree, the landed change, the new RunEvents) is proven end-to-end by
 * scripts/e2e-conductor-local-merge-continue.ts.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import type { Workspace } from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import { continueWorkspace } from './continue-workspace.js';

function seed(state: Workspace['state'], patch: Partial<Workspace> = {}): Promise<Workspace> {
  const now = new Date().toISOString();
  const id = `ws_cont_${Math.random().toString(36).slice(2)}`;
  return Promise.resolve(
    agentOsContainer.repository.upsertWorkspace({
      workspaceId: id,
      spaceId: 'space_t',
      projectId: 'proj_t',
      taskId: `task_${id}`,
      runtimeId: 'recoder_code',
      substrate: 'in_process',
      branch: `recoder/${id}`,
      baseRef: 'main',
      worktreePath: '/tmp/does-not-matter',
      state,
      createdBy: 't',
      createdAt: now,
      updatedAt: now,
      metadata: {},
      ...patch,
    }),
  );
}

describe('continueWorkspace guards', () => {
  beforeEach(() => {
    expect(agentOsContainer.repositoryDriver).toBe('memory');
  });

  it('requires non-empty text', async () => {
    const ws = await seed('awaiting_review');
    await expect(continueWorkspace(ws.workspaceId, { text: '   ' })).rejects.toThrow(/text is required/);
  });

  it('rejects an unknown workspace', async () => {
    await expect(continueWorkspace('ws_missing', { text: 'hi' })).rejects.toThrow(/not found/);
  });

  it('rejects a workspace with no worktree', async () => {
    const ws = await seed('awaiting_review', { worktreePath: undefined });
    await expect(continueWorkspace(ws.workspaceId, { text: 'hi' })).rejects.toThrow(/no worktree/);
  });

  it('rejects a still-running workspace (one active run at a time)', async () => {
    const ws = await seed('running');
    await expect(continueWorkspace(ws.workspaceId, { text: 'hi' })).rejects.toThrow(/already has a running agent/);
  });

  it('rejects a merged (terminal-for-continue) workspace', async () => {
    const ws = await seed('merged');
    await expect(continueWorkspace(ws.workspaceId, { text: 'hi' })).rejects.toThrow(/cannot continue a merged/);
  });

  it('rejects an archived workspace', async () => {
    const ws = await seed('archived');
    await expect(continueWorkspace(ws.workspaceId, { text: 'hi' })).rejects.toThrow(/cannot continue a archived/);
  });
});
