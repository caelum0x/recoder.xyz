/**
 * Dispatch test fixtures — DirectoryAgent / RoutableTask / claim builders used
 * across the dispatch unit tests. Deterministic; no IO.
 */

import type { DirectoryAgent } from '../../src/ports';
import type { RoutableTask, RoutableSpace } from '../../src/dispatch/routing-request';
import type { TaskClaim } from '../../src/domain';

export function makeAgent(overrides: Partial<DirectoryAgent> = {}): DirectoryAgent {
  return {
    agentId: 'agent-a',
    displayName: 'Agent A',
    vendorSurface: 'claude',
    runtimeKind: 'remote',
    health: 'healthy',
    capabilityIds: ['code-generation'],
    supportedIntents: ['feature', 'bug-fix'],
    permissions: { allowGitWrite: true, allowNetwork: true, allowShell: true },
    platform: 'claude_code',
    ...overrides,
  };
}

export function makeTask(overrides: Partial<RoutableTask> = {}): RoutableTask {
  return {
    taskId: 'task-1',
    spaceId: 'space-1',
    intent: 'feature',
    targetPaths: ['src/app/**'],
    forbiddenPaths: [],
    branchPolicy: 'feature_branch',
    requiredCapabilityIds: ['code-generation'],
    ...overrides,
  };
}

export function makeSpace(overrides: Partial<RoutableSpace> = {}): RoutableSpace {
  return {
    spaceId: 'space-1',
    forbiddenPaths: [],
    ...overrides,
  };
}

export function makeClaim(overrides: Partial<TaskClaim> = {}): TaskClaim {
  return {
    claimId: 'claim-1',
    taskId: 'task-1',
    spaceId: 'space-1',
    agentId: 'agent-a',
    status: 'claimed',
    claimedAt: '2026-06-27T00:00:00.000Z',
    leaseUntil: '2026-06-27T00:30:00.000Z',
    fenceToken: 1,
    idempotencyKey: 'idem-1',
    ...overrides,
  };
}
