import type { AgentProfile, TaskSpec, WorkLock } from '@recoder/agent-os';

/**
 * Test fixtures: minimal, valid agent-os domain objects with deny-biased
 * defaults (read-only agent, write-lock required) that individual tests relax.
 */

export function makeAgent(overrides?: Partial<AgentProfile>): AgentProfile {
  const base: AgentProfile = {
    agentId: 'agent-1',
    displayName: 'Test Agent',
    vendorSurface: 'claude_code',
    connectorId: 'conn-1',
    runtimeKind: 'local',
    capabilities: [],
    tools: [],
    supportedTaskIntents: [],
    permissions: {
      defaultFileEffect: 'deny',
      pathRules: [],
      toolRules: [],
      allowNetwork: false,
      allowShell: false,
      allowGitWrite: false,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: true,
    },
    approvalPolicy: {
      mode: 'policy',
      requiredRules: [],
      allowAutoApprovalForLowRisk: false,
    },
    memoryScope: 'none',
    cwdPolicy: { mode: 'repo_root', allowedRoots: [] },
    health: { status: 'healthy', checkedAt: '2026-01-01T00:00:00.000Z' },
    lastSeenAt: '2026-01-01T00:00:00.000Z',
  };
  return {
    ...base,
    ...overrides,
    permissions: { ...base.permissions, ...(overrides?.permissions ?? {}) },
  };
}

export function makeTask(overrides?: Partial<TaskSpec>): TaskSpec {
  const base: TaskSpec = {
    taskId: 'task-1',
    title: 'Test task',
    intent: 'feature_delivery',
    goal: 'do the thing',
    spaceId: 'space-1',
    targetPaths: ['src/**'],
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verification: { commands: [] },
    approvalRequired: [],
    artifactRequired: [],
  };
  return { ...base, ...overrides };
}

export function makeLock(overrides?: Partial<WorkLock>): WorkLock {
  const base: WorkLock = {
    lockId: 'lock-1',
    spaceId: 'space-1',
    pathGlob: 'src/**',
    ownerAgentId: 'agent-1',
    taskId: 'task-1',
    acquiredAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2030-01-01T00:00:00.000Z',
  };
  return { ...base, ...overrides };
}
