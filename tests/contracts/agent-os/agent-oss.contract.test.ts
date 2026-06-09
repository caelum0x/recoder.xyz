import assert from 'node:assert/strict';
import test from 'node:test';

import { createOssAdapterProfile, mapTaskForOssRuntime } from '../../../packages/agent-oss/src/index';
import type { RuntimePolicy } from '../../../packages/agent-runtimes/src/index';
import type { TaskSpec } from '../../../packages/agent-os/src/index';

const task: TaskSpec = {
  taskId: 'task_oss_1',
  spaceId: 'sp_1',
  title: 'Verify preview in Playwright',
  intent: 'verification',
  goal: 'Open the preview and verify the signup page responds.',
  acceptanceCriteria: ['Preview responds'],
  verification: { commands: ['pnpm test:evals:agent-os'] },
  targetPaths: ['recoder-agents/**'],
  forbiddenPaths: ['.env*'],
  artifactRequired: ['summary', 'verification_output'],
  approvalRequired: [],
};

const policy: RuntimePolicy = {
  requireSignedEnvelope: true,
  enforceWorkLocks: true,
  allowShell: false,
  allowNetwork: true,
  approvalMode: 'manual',
};

test('OSS adapters map Recoder state without owning canonical state', () => {
  const profile = createOssAdapterProfile({
    adapterId: 'playwright-preview',
    provider: 'playwright',
    kind: 'browser_automation',
    displayName: 'Playwright Preview Check',
    supportedTaskIntents: ['verification'],
    emitsRunEvents: true,
    requiresPolicyDecision: true,
  });

  const mapping = mapTaskForOssRuntime(profile, { task, policy });

  assert.equal(profile.ownsCanonicalState, false);
  assert.equal(mapping.adapterId, 'playwright-preview');
  assert.equal(mapping.recoderStateRefs.taskSpecId, 'task_oss_1');
  assert.deepEqual(mapping.externalPayload.verificationCommands, ['pnpm test:evals:agent-os']);
});

test('OSS adapters reject unsupported task intents', () => {
  const profile = createOssAdapterProfile({
    adapterId: 'mem0-memory',
    provider: 'mem0',
    kind: 'memory_provider',
    displayName: 'mem0 Memory Adapter',
    supportedTaskIntents: ['documentation'],
    emitsRunEvents: true,
    requiresPolicyDecision: true,
  });

  assert.throws(() => mapTaskForOssRuntime(profile, { task, policy }), /does not support task intent/);
});
