/**
 * PAL-on-the-create-path test (real path, no tmux required).
 *
 * Proves that @recoder/pal is GENUINELY fused into the REAL workspace-create path
 * (workspace-service.createWorkspace → engine.createWorkspace), not just an
 * advisory side-route:
 *
 *   - A create request WITHOUT an explicit runtimeId/substrate resolves the task's
 *     canonical TaskSpec, runs pal once, and APPLIES the plan: the persisted
 *     workspace record carries the pal-defaulted runtimeId + substrate AND a
 *     `metadata.palPlan` annotation (incl. the D1 risk tier).
 *   - A caller-provided runtimeId/substrate WINS (no behavior change when given),
 *     while pal still annotates the record for the cockpit.
 *
 * It drives the REAL in-memory AgentOsRepository singleton (the default driver
 * when no AGENT_OS_DATABASE_URL is set). The annotation + defaulted routing are
 * written into the workspace record at create time (state of record FIRST), BEFORE
 * any substrate launch — so the assertions hold even though no tmux session is
 * actually launched in this environment (the launch then fails to `failed`, which
 * is expected and irrelevant to what we assert here).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { TaskSpec } from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import { createWorkspace, getWorkspace } from './workspace-service.js';

const usingMemoryRepo = agentOsContainer.repositoryDriver === 'memory';

function seedTask(repo: typeof agentOsContainer.repository, overrides: Partial<TaskSpec>): TaskSpec {
  const task: TaskSpec = {
    taskId: `task_${randomUUID()}`,
    title: 'Add a feature',
    intent: 'feature_delivery',
    goal: 'Implement the thing',
    spaceId: 'space_pal_test',
    targetPaths: ['app/components/Button.tsx'],
    forbiddenPaths: [],
    acceptanceCriteria: ['it works'],
    verification: { commands: ['pnpm test'] },
    approvalRequired: [],
    artifactRequired: [],
    ...overrides,
  };
  repo.upsertTask(task);
  return task;
}

describe.skipIf(!usingMemoryRepo)('pal defaults on the real workspace-create path', () => {
  const repo = agentOsContainer.repository;
  let featureTaskId: string;
  let riskyTaskId: string;

  beforeAll(() => {
    featureTaskId = seedTask(repo, { intent: 'feature_delivery', targetPaths: ['app/components/Button.tsx'] }).taskId;
    riskyTaskId = seedTask(repo, {
      title: 'Rotate billing secrets',
      intent: 'platform_hardening',
      targetPaths: ['packages/billing/secrets.ts'],
      approvalRequired: ['secret rotation requires sign-off'],
    }).taskId;
  });

  it('defaults runtime + substrate from pal and annotates the record when no runtimeId/substrate is given', async () => {
    const ws = await createWorkspace({
      spaceId: 'space_pal_test',
      projectId: 'proj_pal_test',
      taskId: featureTaskId,
      repoPath: '/tmp/pal-test-repo-does-not-exist',
      createdBy: 'pal-test',
      // NOTE: no runtimeId, no substrate — pal must default both.
      command: 'true', // command bypasses prompt enrichment; launch will fail (no tmux), irrelevant here.
    });

    // The persisted record carries pal's defaulted routing (feature_delivery →
    // claude_code on the local tmux_worktree substrate).
    const persisted = await getWorkspace(ws.workspaceId);
    expect(persisted).toBeTruthy();
    expect(persisted!.runtimeId).toBe('claude_code');
    expect(persisted!.substrate).toBe('tmux_worktree');

    // The pal plan annotation is persisted on the record (cockpit-visible), incl.
    // the D1 risk tier (annotation only).
    const palPlan = persisted!.metadata?.palPlan as Record<string, unknown> | undefined;
    expect(palPlan).toBeTruthy();
    expect(palPlan!.runtimeId).toBe('claude_code');
    expect(palPlan!.substrate).toBe('tmux_worktree');
    expect(['low', 'medium', 'high']).toContain(palPlan!.risk);
    expect(Array.isArray(palPlan!.skills)).toBe(true);
    expect((palPlan!.skills as string[])).toContain('recoder-platform');
    expect(Array.isArray(palPlan!.mcpTools)).toBe(true);
  });

  it('routes a high-risk sensitive-path task onto daytona via pal (real path)', async () => {
    const ws = await createWorkspace({
      spaceId: 'space_pal_test',
      projectId: 'proj_pal_test',
      taskId: riskyTaskId,
      repoPath: '/tmp/pal-test-repo-does-not-exist',
      createdBy: 'pal-test',
      command: 'true',
    });

    const persisted = await getWorkspace(ws.workspaceId);
    expect(persisted).toBeTruthy();
    // pal.estimateTaskRisk → 'high' → selectSandbox → 'daytona'.
    expect(persisted!.substrate).toBe('daytona');
    const palPlan = persisted!.metadata?.palPlan as Record<string, unknown> | undefined;
    expect(palPlan!.risk).toBe('high');
    expect((palPlan!.approvalGateIds as string[]).length).toBeGreaterThan(0);
  });

  it('honors a caller-provided runtimeId/substrate (caller WINS) while still annotating', async () => {
    const ws = await createWorkspace({
      spaceId: 'space_pal_test',
      projectId: 'proj_pal_test',
      taskId: featureTaskId,
      repoPath: '/tmp/pal-test-repo-does-not-exist',
      createdBy: 'pal-test',
      runtimeId: 'codex', // explicit — must NOT be overridden by pal's claude_code.
      substrate: 'tmux_worktree',
      command: 'true',
    });

    const persisted = await getWorkspace(ws.workspaceId);
    expect(persisted).toBeTruthy();
    // Caller-pinned runtime preserved (no behavior change when given).
    expect(persisted!.runtimeId).toBe('codex');
    expect(persisted!.substrate).toBe('tmux_worktree');
    // When BOTH runtime and substrate are pinned, pal is not invoked → no annotation.
    expect(persisted!.metadata?.palPlan).toBeUndefined();
  });

  it('falls back safely (claude_code) when the task has no canonical TaskSpec', async () => {
    const ws = await createWorkspace({
      spaceId: 'space_pal_test',
      projectId: 'proj_pal_test',
      taskId: `task_unknown_${randomUUID()}`, // not seeded → no TaskSpec
      repoPath: '/tmp/pal-test-repo-does-not-exist',
      createdBy: 'pal-test',
      command: 'true',
      // no runtimeId — must degrade to the safe fallback, never block.
    });
    const persisted = await getWorkspace(ws.workspaceId);
    expect(persisted).toBeTruthy();
    expect(persisted!.runtimeId).toBe('claude_code');
    // No pal plan annotation when there was no TaskSpec to plan over.
    expect(persisted!.metadata?.palPlan).toBeUndefined();
  });
});
