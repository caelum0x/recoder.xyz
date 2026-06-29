import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CodexDriver } from '../../../../src/drivers/codex/codex-driver';
import type { DriverContext } from '../../../../src/contracts/driver-context';
import type { DriverFrame } from '../../../../src/contracts/driver-frame';
import { isTerminalFrame } from '../../../../src/contracts/driver-frame';
import { asRunId } from '../../../../src/types/run-id';
import type { RuntimeTaskInput } from '@recoder/agent-runtimes';

function fakeTaskInput(): RuntimeTaskInput {
  return {
    task: {
      taskId: 'task_1',
      title: 't',
      intent: 'feature_delivery',
      goal: 'g',
      spaceId: 'space_1',
      targetPaths: [],
      forbiddenPaths: [],
      acceptanceCriteria: [],
      verification: { commands: [] },
      approvalRequired: [],
      artifactRequired: [],
    },
    bundle: {
      bundleId: 'b1',
      taskId: 'task_1',
      agentId: 'agent_1',
      runtime: 'codex',
      sharedGoal: 'g',
      acceptanceCriteria: [],
      verificationCommands: [],
      forbiddenActions: [],
      approvalGateIds: [],
      memoryRefIds: [],
      sourceRefs: [],
      compilerVersion: '1',
      compiledAt: new Date().toISOString(),
      renderedPrompt: 'Do the thing.',
    },
    policy: {
      requireSignedEnvelope: false,
      enforceWorkLocks: false,
      allowNetwork: true,
      allowShell: true,
      approvalMode: 'auto',
    },
  };
}

function makeContext(overrides: Partial<DriverContext> = {}): DriverContext {
  const controller = new AbortController();
  const input = fakeTaskInput();
  return {
    runId: asRunId('test'),
    adapterId: 'codex',
    runtimeId: 'rt_1',
    surface: 'codex',
    input,
    policy: input.policy,
    cwd: '/tmp/nonexistent-recoder-cwd',
    // Empty PATH + repo-engine preference disabled guarantees the CLI is not found
    // -> fail-safe path, fully offline. (The repo-built ts/* codex engine would
    // otherwise be preferred over PATH and resolve a real binary.)
    env: { PATH: '', RECODER_DISABLE_REPO_ENGINE: '1' },
    signal: controller.signal,
    now: () => 0,
    emit: () => {},
    log: () => {},
    ...overrides,
  };
}

async function collect(iterable: AsyncIterable<DriverFrame>): Promise<DriverFrame[]> {
  const frames: DriverFrame[] = [];
  for await (const frame of iterable) frames.push(frame);
  return frames;
}

test('a missing codex CLI yields a single failed done with cli_not_found — never fake success', async () => {
  const driver = new CodexDriver();
  const frames = await collect(driver.run(makeContext()));
  const terminals = frames.filter(isTerminalFrame);
  assert.equal(terminals.length, 1, 'exactly one terminal frame');
  const done = terminals[0]!;
  assert.equal(done.ok, false);
  assert.equal(done.code, 'cli_not_found');
});

test('the descriptor declares the codex surface and json mode', () => {
  const driver = new CodexDriver();
  assert.equal(driver.descriptor.kind, 'codex');
  assert.ok(driver.descriptor.surfaces.includes('codex'));
  assert.equal(driver.descriptor.modes[0], 'json');
  assert.equal(driver.descriptor.cli?.binary, 'codex');
});

test('probe reports unavailable truthfully when the CLI is absent', async () => {
  const driver = new CodexDriver();
  const probe = await driver.probe({
    surface: 'codex',
    env: { PATH: '', RECODER_DISABLE_REPO_ENGINE: '1' },
  });
  assert.equal(probe.available, false);
  assert.ok(probe.unavailableReason);
  assert.equal(probe.health.status, 'offline');
});

test('cancel is a no-op when nothing is running (does not throw)', async () => {
  const driver = new CodexDriver();
  await driver.cancel('run_x');
});
