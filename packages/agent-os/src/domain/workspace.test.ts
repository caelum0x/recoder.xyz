import assert from 'node:assert/strict';
import test from 'node:test';
import { transitionWorkspace, type Workspace } from './workspace';

test('transitionWorkspace preserves the optional tenant binding', () => {
  const ws: Workspace = {
    workspaceId: 'w1', spaceId: 's1', projectId: 'p1', taskId: 't1',
    runtimeId: 'claude_code', substrate: 'tmux_worktree', branch: 'b', baseRef: 'main',
    state: 'created', createdBy: 'u1', createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    tenant: { tenantId: 't-9', orgId: 'org-9' },
  };
  const next = transitionWorkspace(ws, 'setting_up', { now: '2026-07-11T00:01:00.000Z' });
  assert.deepEqual(next.tenant, { tenantId: 't-9', orgId: 'org-9' });
});
