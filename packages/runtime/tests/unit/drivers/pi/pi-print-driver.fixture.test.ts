import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PiPrintDriver } from '../../../../src/drivers/pi/pi-print-driver';
import type { DriverContext } from '../../../../src/contracts/driver-context';
import type { DriverFrame, DoneFrame } from '../../../../src/contracts/driver-frame';
import type { RuntimeTaskInput, RuntimePolicy } from '@recoder/agent-runtimes';
import { asRunId } from '../../../../src/types/run-id';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAKE_PI = path.resolve(__dirname, '../../../fixtures/fake-pi.mjs');
const FAKE_PI_NO_DONE = path.resolve(__dirname, '../../../fixtures/fake-pi-no-done.mjs');

function makePolicy(overrides: Partial<RuntimePolicy> = {}): RuntimePolicy {
  return {
    requireSignedEnvelope: false,
    enforceWorkLocks: false,
    allowNetwork: true,
    allowShell: true,
    approvalMode: 'policy',
    ...overrides,
  };
}

function makeContext(policy: RuntimePolicy, env: Record<string, string>, signal: AbortSignal): DriverContext {
  return {
    runId: asRunId('run_pi_print_1'),
    adapterId: 'pi-print',
    runtimeId: 'pi-print',
    surface: 'recoder_code',
    input: {
      policy,
      task: {
        taskId: 't1',
        title: 'demo',
        intent: 'feature_delivery',
        goal: 'Update src/index.ts',
        spaceId: 's1',
        targetPaths: ['src/'],
        forbiddenPaths: [],
        acceptanceCriteria: [],
        verification: { commands: [] },
        approvalRequired: [],
        artifactRequired: [],
      },
      bundle: {
        bundleId: 'b1',
        agentId: 'a1',
        taskId: 't1',
        renderedPrompt: 'Update src/index.ts',
        sourceRefs: [],
      } as unknown as RuntimeTaskInput['bundle'],
    },
    policy,
    cwd: process.cwd(),
    env,
    signal,
    now: () => Date.now(),
    emit: () => {},
    log: () => {},
  };
}

async function collect(iterable: AsyncIterable<DriverFrame>): Promise<DriverFrame[]> {
  const frames: DriverFrame[] = [];
  for await (const frame of iterable) frames.push(frame);
  return frames;
}

test('replays a fixture pi run into frames + exactly one terminal done(ok)', async () => {
  const driver = new PiPrintDriver({ cliPathOverride: FAKE_PI });
  const ctx = makeContext(makePolicy(), { ...(process.env as Record<string, string>) }, new AbortController().signal);

  const frames = await collect(driver.run(ctx));

  const terminals = frames.filter((f) => f.kind === 'done');
  assert.equal(terminals.length, 1, 'exactly one terminal frame');
  const done = terminals[0] as DoneFrame;
  assert.equal(done.ok, true);
  assert.equal(done.stopReason, 'end_turn');
  assert.ok(done.usage, 'usage folded onto terminal done');
  assert.equal(done.usage?.totalTokens, 162);
  assert.equal(done.finalText, "I'll update src/index.ts. Done.");

  // tool_call/tool_result spans are present for the read + write tools.
  const toolCalls = frames.filter((f) => f.kind === 'tool_call');
  assert.equal(toolCalls.length, 2);
  const writeCall = toolCalls.find((f) => f.kind === 'tool_call' && f.toolCall.toolName === 'write_file');
  assert.ok(writeCall && writeCall.kind === 'tool_call' && writeCall.toolCall.modes.includes('write'));

  // A running state frame was surfaced from agent_start.
  assert.ok(frames.some((f) => f.kind === 'state' && f.state === 'running'));
});

test('fail-safe: missing pi CLI yields done(ok:false, runtime_unavailable) — never fakes completion', async () => {
  const driver = new PiPrintDriver({ cliPathOverride: path.resolve(__dirname, 'no-such-pi') });
  const ctx = makeContext(makePolicy(), { PATH: '' }, new AbortController().signal);

  const frames = await collect(driver.run(ctx));
  assert.equal(frames.length, 1);
  const done = frames[0] as DoneFrame;
  assert.equal(done.kind, 'done');
  assert.equal(done.ok, false);
  assert.equal(done.code, 'runtime_unavailable');
});

test('fail-safe: pi exits WITHOUT a terminal agent_end -> synthesized failing done', async () => {
  const driver = new PiPrintDriver({ cliPathOverride: FAKE_PI_NO_DONE });
  const ctx = makeContext(makePolicy(), { ...(process.env as Record<string, string>) }, new AbortController().signal);

  const frames = await collect(driver.run(ctx));
  const terminals = frames.filter((f) => f.kind === 'done') as DoneFrame[];
  assert.equal(terminals.length, 1, 'still exactly one terminal frame');
  assert.equal(terminals[0].ok, false, 'no agent_end => not marked complete');
});

test('abort signal terminates the run with an aborted/cancelled terminal', async () => {
  const driver = new PiPrintDriver({ cliPathOverride: FAKE_PI });
  const controller = new AbortController();
  controller.abort();
  const ctx = makeContext(makePolicy(), { ...(process.env as Record<string, string>) }, controller.signal);

  const frames = await collect(driver.run(ctx));
  const done = frames.find((f) => f.kind === 'done') as DoneFrame | undefined;
  assert.ok(done);
  assert.equal(done?.ok, false);
});
