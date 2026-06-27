import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ClaudeCodeDriver } from '../../../../src/drivers/claude-code/claude-code-driver';
import { writeClaudeMcpConfig } from '../../../../src/drivers/claude-code/claude-mcp-config';
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
      runtime: 'claude_code',
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
      approvalMode: 'manual',
    },
  };
}

function makeContext(overrides: Partial<DriverContext> = {}): DriverContext {
  const controller = new AbortController();
  const input = fakeTaskInput();
  return {
    runId: asRunId('test'),
    adapterId: 'claude-code',
    runtimeId: 'rt_1',
    surface: 'claude_code',
    input,
    policy: input.policy,
    cwd: '/tmp/nonexistent-recoder-cwd',
    // Empty PATH guarantees the CLI is not found -> fail-safe path, fully offline.
    env: { PATH: '' },
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

test('a missing CLI yields a single failed done with cli_not_found — never fake success', async () => {
  const driver = new ClaudeCodeDriver();
  const frames = await collect(driver.run(makeContext()));

  const terminals = frames.filter(isTerminalFrame);
  assert.equal(terminals.length, 1, 'exactly one terminal frame');
  const done = terminals[0]!;
  assert.equal(done.ok, false);
  assert.equal(done.code, 'cli_not_found');
});

test('an already-aborted signal yields a cancelled terminal before spawning', async () => {
  const controller = new AbortController();
  controller.abort();
  // Even with an abort, a missing CLI is detected first; both paths must end terminal.
  const driver = new ClaudeCodeDriver();
  const frames = await collect(driver.run(makeContext({ signal: controller.signal })));
  const terminals = frames.filter(isTerminalFrame);
  assert.equal(terminals.length, 1);
  assert.equal(terminals[0]!.ok, false);
});

test('the descriptor declares the claude_code surface and json mode', () => {
  const driver = new ClaudeCodeDriver();
  assert.equal(driver.descriptor.kind, 'claude_code');
  assert.ok(driver.descriptor.surfaces.includes('claude_code'));
  assert.deepEqual([...driver.descriptor.modes], ['json']);
  assert.equal(driver.descriptor.cli?.binary, 'claude');
});

test('probe reports unavailable truthfully when the CLI is absent', async () => {
  const driver = new ClaudeCodeDriver();
  const probe = await driver.probe({ surface: 'claude_code', env: { PATH: '' } });
  assert.equal(probe.available, false);
  assert.ok(probe.unavailableReason);
  assert.equal(probe.health.status, 'offline');
});

test('writeClaudeMcpConfig returns undefined when there are no servers', async () => {
  assert.equal(await writeClaudeMcpConfig(undefined), undefined);
  assert.equal(await writeClaudeMcpConfig({ mcpServers: {} }), undefined);
});

test('writeClaudeMcpConfig writes a valid .mcp.json passthrough', async () => {
  const filePath = await writeClaudeMcpConfig({
    mcpServers: { recoder: { type: 'sse', url: 'https://mcp.example' } },
  });
  assert.ok(filePath);
  const written = JSON.parse(readFileSync(filePath!, 'utf8'));
  assert.equal(written.mcpServers.recoder.url, 'https://mcp.example');
});
