import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedTaskRunTransition,
  lockCoversPath,
  transitionTaskRun,
  type AgentProfile,
  type TaskRun,
  type TaskSpec,
  type WorkLock,
} from '../../../packages/agent-os/src/index';
import { evaluatePolicy } from '../../../packages/agent-policy/src/index';

function agent(): AgentProfile {
  return {
    agentId: 'codex',
    displayName: 'Codex',
    vendorSurface: 'codex',
    connectorId: 'codex-local',
    runtimeKind: 'local',
    capabilities: [{ capabilityId: 'implementation', kind: 'implementation', label: 'Implementation' }],
    tools: [{ toolName: 'shell', modes: ['execute'] }],
    supportedTaskIntents: ['bugfix'],
    permissions: {
      defaultFileEffect: 'deny',
      pathRules: [{ glob: 'secrets/**', effect: 'deny', reason: 'secret path' }],
      toolRules: [],
      allowNetwork: true,
      allowShell: true,
      allowGitWrite: false,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: true,
    },
    approvalPolicy: { mode: 'policy', requiredRules: [], allowAutoApprovalForLowRisk: false },
    memoryScope: 'repo',
    cwdPolicy: { mode: 'repo_root', allowedRoots: ['/repo'] },
    health: { status: 'healthy', checkedAt: '2026-06-06T00:00:00.000Z' },
    lastSeenAt: '2026-06-06T00:00:00.000Z',
  };
}

function task(): TaskSpec {
  return {
    taskId: 'task-1',
    title: 'Fix signup',
    intent: 'bugfix',
    goal: 'Fix signup crash',
    spaceId: 'space-1',
    repo: 'caelum0x/recoder.xyz',
    branchPolicy: 'create_worktree_branch',
    targetPaths: ['app/**'],
    forbiddenPaths: ['secrets/**'],
    acceptanceCriteria: ['signup no longer crashes'],
    verification: { commands: ['pnpm test'], browserChecks: ['/signup'] },
    approvalRequired: ['before_push'],
    artifactRequired: ['summary', 'test_output'],
  };
}

test('Agent OS task run transitions follow the canonical lifecycle', () => {
  const run: TaskRun = {
    runId: 'run-1',
    taskId: 'task-1',
    spaceId: 'space-1',
    state: 'created',
    updatedAt: '2026-06-06T00:00:00.000Z',
  };

  assert.equal(isAllowedTaskRunTransition('created', 'compiled'), true);
  assert.equal(isAllowedTaskRunTransition('created', 'completed'), false);

  const compiled = transitionTaskRun(run, 'compiled', { now: '2026-06-06T00:01:00.000Z' });
  const routed = transitionTaskRun(compiled, 'routed', { now: '2026-06-06T00:02:00.000Z' });
  const claimed = transitionTaskRun(routed, 'claimed', { now: '2026-06-06T00:03:00.000Z' });
  const running = transitionTaskRun(claimed, 'running', { now: '2026-06-06T00:04:00.000Z' });
  const completed = transitionTaskRun(running, 'completed', { now: '2026-06-06T00:05:00.000Z' });

  assert.equal(completed.state, 'completed');
  assert.equal(completed.completedAt, '2026-06-06T00:05:00.000Z');
  assert.throws(() => transitionTaskRun(completed, 'running'), /Invalid task run transition/);
});

test('policy requires work locks for writes and blocks denied paths', () => {
  const actor = agent();
  const spec = task();
  const lock: WorkLock = {
    lockId: 'lock-1',
    spaceId: spec.spaceId,
    repo: spec.repo,
    pathGlob: 'app/**',
    ownerAgentId: actor.agentId,
    taskId: spec.taskId,
    acquiredAt: '2026-06-06T00:00:00.000Z',
    expiresAt: '2026-06-06T01:00:00.000Z',
  };

  assert.equal(lockCoversPath(lock, 'app/signup/page.tsx'), true);

  const missingLock = evaluatePolicy({
    actor,
    task: spec,
    action: 'file.write',
    target: { path: 'app/signup/page.tsx' },
    now: '2026-06-06T00:10:00.000Z',
  });
  assert.equal(missingLock.effect, 'needs_approval');

  const withLock = evaluatePolicy({
    actor,
    task: spec,
    action: 'file.write',
    target: { path: 'app/signup/page.tsx' },
    workLocks: [lock],
    now: '2026-06-06T00:10:00.000Z',
  });
  assert.equal(withLock.effect, 'allow');

  const denied = evaluatePolicy({
    actor,
    task: spec,
    action: 'file.write',
    target: { path: 'secrets/prod.env' },
    workLocks: [lock],
    now: '2026-06-06T00:10:00.000Z',
  });
  assert.equal(denied.effect, 'deny');
});
