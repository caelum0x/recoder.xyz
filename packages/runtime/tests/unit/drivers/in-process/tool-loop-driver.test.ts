import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InProcessDriver, createInProcessDriver } from '../../../../src/drivers/in-process/tool-loop-driver';
import type { DriverContext } from '../../../../src/contracts/driver-context';
import type { DriverFrame } from '../../../../src/contracts/driver-frame';
import { isTerminalFrame } from '../../../../src/contracts/driver-frame';
import { asRunId } from '../../../../src/types/run-id';
import type { RuntimeTaskInput } from '@recoder/agent-runtimes';
import { makeMockModel, textTurn, type MockTurn } from './mock-model';

function fakeTaskInput(overrides?: { title?: string; prompt?: string; allowShell?: boolean }): RuntimeTaskInput {
  return {
    task: {
      taskId: 'task_1',
      title: overrides?.title ?? 'Do the thing.',
      intent: 'feature_delivery',
      goal: 'g',
      spaceId: 'space_1',
      targetPaths: [],
      forbiddenPaths: [],
      acceptanceCriteria: [],
      verification: { commands: [] },
      approvalRequired: [],
      artifactRequired: [],
    } as RuntimeTaskInput['task'],
    bundle: {
      bundleId: 'b1',
      taskId: 'task_1',
      agentId: 'agent_1',
      runtime: 'recoder_code',
      sharedGoal: 'g',
      acceptanceCriteria: [],
      verificationCommands: [],
      forbiddenActions: [],
      approvalGateIds: [],
      memoryRefIds: [],
      sourceRefs: [],
      compilerVersion: '1',
      compiledAt: new Date().toISOString(),
      renderedPrompt: overrides?.prompt ?? 'Follow the project rules.',
    } as RuntimeTaskInput['bundle'],
    policy: {
      requireSignedEnvelope: false,
      enforceWorkLocks: false,
      allowNetwork: false,
      allowShell: overrides?.allowShell ?? false,
      approvalMode: 'manual',
    },
  };
}

function makeContext(overrides: Partial<DriverContext> = {}): DriverContext {
  const controller = new AbortController();
  const input = fakeTaskInput();
  const cwd = mkdtempSync(join(tmpdir(), 'recoder-inproc-'));
  return {
    runId: asRunId('test'),
    adapterId: 'in-process',
    runtimeId: 'rt_1',
    surface: 'recoder_code',
    input,
    policy: input.policy,
    cwd,
    env: { PATH: process.env['PATH'] ?? '' },
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

test('the descriptor declares the recoder_code surface and in_process mode', () => {
  const driver = new InProcessDriver();
  assert.equal(driver.descriptor.kind, 'recoder_code');
  assert.ok(driver.descriptor.surfaces.includes('recoder_code'));
  assert.deepEqual([...driver.descriptor.modes], ['in_process']);
  assert.equal(driver.descriptor.inProcess, true);
});

test('probe reports unavailable truthfully when no model factory is configured', async () => {
  const driver = new InProcessDriver();
  const probe = await driver.probe({ surface: 'recoder_code' });
  assert.equal(probe.available, false);
  assert.ok(probe.unavailableReason);
  assert.equal(probe.health.status, 'offline');
});

test('probe reports healthy when a model factory is configured', async () => {
  const driver = createInProcessDriver({ modelFactory: () => makeMockModel([textTurn('hi')]) });
  const probe = await driver.probe({ surface: 'recoder_code' });
  assert.equal(probe.available, true);
  assert.equal(probe.health.status, 'healthy');
});

test('no model factory yields exactly one failed done with runtime_unavailable — never fake success', async () => {
  const driver = new InProcessDriver();
  const frames = await collect(driver.run(makeContext()));
  const terminals = frames.filter(isTerminalFrame);
  assert.equal(terminals.length, 1, 'exactly one terminal frame');
  const done = terminals[0]!;
  assert.equal(done.ok, false);
  assert.equal(done.code, 'runtime_unavailable');
});

test('a text-only run maps deltas to text frames and ends with a single completed done', async () => {
  const driver = createInProcessDriver({
    modelFactory: () => makeMockModel([textTurn('hello world')]),
  });
  const frames = await collect(driver.run(makeContext()));

  const terminals = frames.filter(isTerminalFrame);
  assert.equal(terminals.length, 1);
  const done = terminals[0]!;
  assert.equal(done.kind, 'done');
  assert.equal(done.ok, true);
  assert.equal(done.stopReason, 'end_turn');
  assert.equal(done.finalText, 'hello world');

  const text = frames.filter((f) => f.kind === 'text').map((f) => (f as { text: string }).text).join('');
  assert.equal(text, 'hello world');

  const usage = frames.filter((f) => f.kind === 'usage');
  assert.equal(usage.length, 1);
});

test('a tool-call turn produces tool_call + tool_result frames, then completes', async () => {
  // First turn calls the `read` tool; second turn produces final text.
  const toolTurn: MockTurn = [
    { type: 'stream-start', warnings: [] },
    { type: 'tool-call', toolCallId: 'tc1', toolName: 'read', input: JSON.stringify({ filePath: 'note.txt' }) },
    { type: 'finish', finishReason: 'tool-calls', usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 } },
  ];
  const ctx = makeContext();
  // Seed a file the read tool can return.
  writeFileSync(join(ctx.cwd, 'note.txt'), 'file body\nsecond line\n', 'utf-8');

  const driver = createInProcessDriver({
    modelFactory: () => makeMockModel([toolTurn, textTurn('done reading')]),
  });
  const frames = await collect(driver.run(ctx));

  const toolCall = frames.find((f) => f.kind === 'tool_call') as
    | { kind: 'tool_call'; toolCall: { toolName: string; modes: string[]; paths?: string[] } }
    | undefined;
  assert.ok(toolCall, 'a tool_call frame is emitted');
  assert.equal(toolCall.toolCall.toolName, 'read');
  assert.deepEqual(toolCall.toolCall.modes, ['read']);
  assert.deepEqual(toolCall.toolCall.paths, ['note.txt']);

  const toolResult = frames.find((f) => f.kind === 'tool_result') as
    | { kind: 'tool_result'; toolResult: { ok: boolean; output?: unknown } }
    | undefined;
  assert.ok(toolResult, 'a tool_result frame is emitted');
  assert.equal(toolResult.toolResult.ok, true);

  const terminals = frames.filter(isTerminalFrame);
  assert.equal(terminals.length, 1);
  assert.equal(terminals[0]!.ok, true);
});

test('an already-aborted signal yields a single cancelled terminal without running the model', async () => {
  const controller = new AbortController();
  controller.abort();
  let modelBuilt = false;
  const driver = createInProcessDriver({
    modelFactory: () => {
      modelBuilt = true;
      return makeMockModel([textTurn('should not run')]);
    },
  });
  const frames = await collect(driver.run(makeContext({ signal: controller.signal })));
  const terminals = frames.filter(isTerminalFrame);
  assert.equal(terminals.length, 1);
  assert.equal(terminals[0]!.ok, false);
  assert.equal(terminals[0]!.code, 'cancelled');
  assert.equal(modelBuilt, false, 'the model is not constructed once aborted');
});

test('reasoning deltas map to thinking frames', async () => {
  const reasoningTurn: MockTurn = [
    { type: 'stream-start', warnings: [] },
    { type: 'reasoning-start', id: 'r' },
    { type: 'reasoning-delta', id: 'r', delta: 'let me think' },
    { type: 'reasoning-end', id: 'r' },
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: 'answer' },
    { type: 'text-end', id: 't' },
    { type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
  ];
  const driver = createInProcessDriver({ modelFactory: () => makeMockModel([reasoningTurn]) });
  const frames = await collect(driver.run(makeContext()));
  const thinking = frames.filter((f) => f.kind === 'thinking').map((f) => (f as { text: string }).text).join('');
  assert.equal(thinking, 'let me think');
});
