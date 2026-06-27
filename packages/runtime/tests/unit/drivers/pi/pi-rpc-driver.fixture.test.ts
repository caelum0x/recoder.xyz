import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PiRpcDriver } from '../../../../src/drivers/pi/pi-rpc-driver';
import type { DriverContext } from '../../../../src/contracts/driver-context';
import type { DriverFrame, DoneFrame } from '../../../../src/contracts/driver-frame';
import type { RuntimeTaskInput, RuntimePolicy } from '@recoder/agent-runtimes';
import { asRunId } from '../../../../src/types/run-id';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAKE_PI = path.resolve(__dirname, '../../../fixtures/fake-pi.mjs');

function makePolicy(): RuntimePolicy {
  return {
    requireSignedEnvelope: false,
    enforceWorkLocks: false,
    allowNetwork: true,
    allowShell: true,
    approvalMode: 'policy',
  };
}

function makeContext(env: Record<string, string>, signal: AbortSignal): DriverContext {
  const policy = makePolicy();
  return {
    runId: asRunId('run_pi_rpc_1'),
    adapterId: 'pi-rpc',
    runtimeId: 'pi-rpc',
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

test('rpc driver drives a fixture run via the RPC prompt command into frames + terminal done(ok)', async () => {
  const driver = new PiRpcDriver({ cliPathOverride: FAKE_PI });
  const ctx = makeContext({ ...(process.env as Record<string, string>) }, new AbortController().signal);

  const frames = await collect(driver.run(ctx));

  const terminals = frames.filter((f) => f.kind === 'done') as DoneFrame[];
  assert.equal(terminals.length, 1, 'exactly one terminal frame');
  assert.equal(terminals[0].ok, true);
  assert.equal(terminals[0].stopReason, 'end_turn');
  assert.equal(terminals[0].usage?.totalTokens, 162);

  // The driver mapped tool spans from the RPC event stream.
  assert.ok(frames.some((f) => f.kind === 'tool_call' && f.toolCall.toolName === 'write_file'));
});

test('rpc fail-safe: missing pi CLI yields runtime_unavailable', async () => {
  const driver = new PiRpcDriver({ cliPathOverride: path.resolve(__dirname, 'no-such-pi') });
  const ctx = makeContext({ PATH: '' }, new AbortController().signal);

  const frames = await collect(driver.run(ctx));
  assert.equal(frames.length, 1);
  const done = frames[0] as DoneFrame;
  assert.equal(done.ok, false);
  assert.equal(done.code, 'runtime_unavailable');
});
