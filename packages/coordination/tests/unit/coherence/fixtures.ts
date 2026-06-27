/**
 * Deterministic fixtures + builders for coherence unit tests. No clock, no IO —
 * every value is explicit so tests are reproducible (mirrors packages/brain's
 * fake-port style).
 */

import type {
  AgentPresence,
  DependencyEdge,
  Handoff,
  TaskClaim,
  TaskNode,
  WorkLock,
  WorkSignal,
} from '../../../src/domain';
import {
  emptySnapshot,
  type CoordinationSnapshot,
  type LiveRun,
  type SnapshotConfig,
  type SquadMemberView,
} from '../../../src/coherence/snapshot';

export const NOW = '2026-06-27T12:00:00.000Z';

export const TEST_CONFIG: SnapshotConfig = {
  claimRecoveryWindowMs: 90_000,
  heartbeatTimeoutMs: 5 * 60_000,
};

/** Minutes-before-NOW as an ISO string. */
export function minutesAgo(minutes: number, base = NOW): string {
  return new Date(Date.parse(base) - minutes * 60_000).toISOString();
}

/** Minutes-after-NOW as an ISO string. */
export function minutesFromNow(minutes: number, base = NOW): string {
  return new Date(Date.parse(base) + minutes * 60_000).toISOString();
}

export function lock(overrides: Partial<WorkLock> = {}): WorkLock {
  return {
    lockId: 'lock_1',
    spaceId: 'space_1',
    repo: 'repo_1',
    pathGlob: 'src/**',
    ownerAgentId: 'agent_1',
    taskId: 'task_1',
    acquiredAt: minutesAgo(10),
    expiresAt: minutesFromNow(20),
    fenceToken: 1,
    kind: 'exclusive',
    ...overrides,
  };
}

export function claim(overrides: Partial<TaskClaim> = {}): TaskClaim {
  return {
    claimId: 'claim_1',
    taskId: 'task_1',
    spaceId: 'space_1',
    agentId: 'agent_1',
    runId: 'run_1',
    status: 'claimed',
    claimedAt: minutesAgo(1),
    leaseUntil: minutesFromNow(10),
    fenceToken: 1,
    idempotencyKey: 'idem_1',
    ...overrides,
  };
}

export function task(overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    taskId: 'task_1',
    spaceId: 'space_1',
    state: 'running',
    ...overrides,
  };
}

export function run(overrides: Partial<LiveRun> = {}): LiveRun {
  return {
    runId: 'run_1',
    taskId: 'task_1',
    spaceId: 'space_1',
    agentId: 'agent_1',
    alive: true,
    lastEventAt: minutesAgo(1),
    ...overrides,
  };
}

export function presence(overrides: Partial<AgentPresence> = {}): AgentPresence {
  return {
    agentId: 'agent_1',
    status: 'busy',
    lastSeen: minutesAgo(1),
    currentTaskId: 'task_1',
    ...overrides,
  };
}

export function handoff(overrides: Partial<Handoff> = {}): Handoff {
  return {
    handoffId: 'handoff_1',
    intent: 'delegate',
    fromAgentId: 'agent_1',
    toAgentId: 'agent_2',
    spaceId: 'space_1',
    sourceTaskId: 'task_1',
    targetTaskId: 'task_2',
    prompt: 'pick this up',
    status: 'delegated',
    depth: 1,
    initiatedAt: minutesAgo(1),
    ...overrides,
  };
}

export function squadMember(overrides: Partial<SquadMemberView> = {}): SquadMemberView {
  return {
    squadId: 'squad_1',
    memberId: 'agent_1',
    believedTaskId: 'task_1',
    believedBusy: true,
    ...overrides,
  };
}

export function depEdge(overrides: Partial<DependencyEdge> = {}): DependencyEdge {
  return {
    taskId: 'task_1',
    dependsOnTaskId: 'task_0',
    kind: 'blocks',
    ...overrides,
  };
}

export function openSignal(overrides: Partial<WorkSignal> = {}): WorkSignal {
  return {
    signalId: 'signal_x',
    taskId: 'task_1',
    source: 'coherence',
    sourceId: 'src_1',
    title: 'pre-existing',
    severity: 'medium',
    status: 'open',
    detectedReason: 'claim_lost',
    whyItMatters: 'why',
    recommendedNextAction: 'what',
    agentHandoffPrompt: 'prompt',
    detectedAt: minutesAgo(5),
    ...overrides,
  };
}

/** Build a snapshot from partial parts (everything else empty). */
export function snapshot(parts: Partial<CoordinationSnapshot> = {}): CoordinationSnapshot {
  return {
    ...emptySnapshot(NOW, TEST_CONFIG),
    ...parts,
  };
}
