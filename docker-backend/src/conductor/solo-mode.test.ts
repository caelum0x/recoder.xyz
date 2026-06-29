/**
 * Conductor SOLO MODE unit tests.
 *
 * Proves the env gate (isSoloMode / isUserInitiatedSoloApproval) and that
 * recordSoloApproval writes a real, audited `approved` Approval attributed to the
 * user. The full enforce-gate behavior (solo merges; team denies) is covered in
 * delivery-approval.test.ts against the real gate + governance.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Workspace } from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import {
  isSoloMode,
  isUserInitiatedSoloApproval,
  recordSoloApproval,
  SOLO_DEFAULT_DECIDED_BY,
} from './solo-mode.js';

const usingMemoryRepo = agentOsContainer.repositoryDriver === 'memory';

function workspace(taskId: string): Workspace {
  const now = new Date().toISOString();
  return {
    workspaceId: `ws_${randomUUID()}`,
    spaceId: 'space_solo',
    projectId: 'proj_solo',
    taskId,
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'recoder/solo-test',
    baseRef: 'HEAD',
    worktreePath: '/tmp/solo-test',
    state: 'running',
    createdBy: 'solo-test',
    createdAt: now,
    updatedAt: now,
    metadata: {},
  };
}

describe('solo-mode env gate', () => {
  it('isSoloMode: truthy opt-in values enable it', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes', 'on', ' On ']) {
      expect(isSoloMode({ RECODER_SOLO_MODE: v } as NodeJS.ProcessEnv)).toBe(true);
    }
  });

  it('isSoloMode: unset / falsey keeps the team gate', () => {
    expect(isSoloMode({} as NodeJS.ProcessEnv)).toBe(false);
    for (const v of ['0', 'false', 'no', 'off', '']) {
      expect(isSoloMode({ RECODER_SOLO_MODE: v } as NodeJS.ProcessEnv)).toBe(false);
    }
  });

  it('isUserInitiatedSoloApproval: requires solo mode AND an explicit approve intent', () => {
    const on = { RECODER_SOLO_MODE: '1' } as NodeJS.ProcessEnv;
    const off = {} as NodeJS.ProcessEnv;
    expect(isUserInitiatedSoloApproval({ approve: true }, on)).toBe(true);
    // No click -> not user-initiated, even in solo mode.
    expect(isUserInitiatedSoloApproval({ approve: false }, on)).toBe(false);
    expect(isUserInitiatedSoloApproval(undefined, on)).toBe(false);
    // Click but team mode -> standard gate applies.
    expect(isUserInitiatedSoloApproval({ approve: true }, off)).toBe(false);
  });
});

describe.skipIf(!usingMemoryRepo)('solo-mode recordSoloApproval', () => {
  const repo = agentOsContainer.repository;

  it('records an approved Approval attributed to the user (decidedBy)', async () => {
    const taskId = `task_solo_${randomUUID()}`;
    const ws = workspace(taskId);
    const recorded = await recordSoloApproval(ws, 'merge', { approve: true, decidedBy: 'alice' });
    expect(recorded.status).toBe('approved');
    expect(recorded.decidedBy).toBe('alice');
    expect(recorded.requiredAt).toBe('after_verification');
    expect((recorded.metadata as Record<string, unknown>).soloMode).toBe(true);

    const all = await repo.listApprovals();
    expect(all.some((a) => a.approvalId === recorded.approvalId && a.taskId === taskId)).toBe(true);
  });

  it('defaults decidedBy to the desktop user when none supplied', async () => {
    const ws = workspace(`task_solo_${randomUUID()}`);
    const recorded = await recordSoloApproval(ws, 'pr', { approve: true });
    expect(recorded.decidedBy).toBe(SOLO_DEFAULT_DECIDED_BY);
    expect(recorded.requiredAt).toBe('before_pr');
  });
});
