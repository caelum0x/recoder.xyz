import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpenCodeDriver } from '../../../../src/drivers/opencode/opencode-driver';
import type { DriverContext } from '../../../../src/contracts/driver-context';
import type { DriverFrame } from '../../../../src/contracts/driver-frame';
import type { RuntimeTaskInput, RuntimePolicy } from '@recoder/agent-runtimes';
import { asRunId } from '../../../../src/types/run-id';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAKE_CLI = path.resolve(__dirname, '../../../fixtures/fake-opencode.mjs');

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

function makeTaskInput(policy: RuntimePolicy): RuntimeTaskInput {
  return {
    policy,
    task: {
      taskId: 'task_1',
      title: 'demo',
      intent: 'feature_delivery',
      goal: 'do the thing',
      spaceId: 'space_1',
      targetPaths: ['src/'],
      forbiddenPaths: [],
      acceptanceCriteria: [],
      verification: { commands: [] },
      approvalRequired: [],
      artifactRequired: [],
    },
    bundle: {
      bundleId: 'bundle_1',
      agentId: 'agent_1',
      taskId: 'task_1',
      renderedPrompt: 'Please update src/index.ts',
      sourceRefs: [],
    } as unknown as RuntimeTaskInput['bundle'],
  };
}

function makeContext(
  policy: RuntimePolicy,
  env: Record<string, string>,
  signal: AbortSignal,
): DriverContext {
  return {
    runId: asRunId('run_test_1'),
    adapterId: 'opencode',
    runtimeId: 'opencode',
    surface: 'opencode',
    input: makeTaskInput(policy),
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

test('replays a fixture opencode run into frames + a terminal done(ok)', async () => {
  const driver = createOpenCodeDriver({ cliPathOverride: FAKE_CLI });
  const policy = makePolicy();
  const ctx = makeContext(policy, { ...process.env as Record<string, string> }, new AbortController().signal);

  const frames = await collect(driver.run(ctx));

  // Exactly one terminal done frame, and it is a success.
  const terminals = frames.filter((f) => f.kind === 'done');
  assert.equal(terminals.length, 1);
  const done = terminals[0] as { ok: boolean; stopReason: string; usage?: unknown };
  assert.equal(done.ok, true);
  assert.equal(done.stopReason, 'end_turn');
  assert.ok(done.usage, 'usage folded onto terminal done');

  // Non-terminal frames mirror the fixture content.
  const kinds = frames.filter((f) => f.kind !== 'done').map((f) => f.kind);
  assert.deepEqual(kinds, [
    'thinking',
    'tool_call',
    'tool_result',
    'tool_call',
    'tool_result',
    'tool_call',
    'tool_result',
    'text',
    'usage',
  ]);
});

test('fail-safe: missing CLI yields done(ok:false, cli_not_found) — never fakes completion', async () => {
  const driver = createOpenCodeDriver({
    cliPathOverride: path.resolve(__dirname, 'does-not-exist-opencode'),
  });
  const policy = makePolicy();
  // Empty PATH + repo-engine preference disabled so NO opencode is discovered
  // (the repo-built ts/* opencode engine would otherwise be preferred).
  const ctx = makeContext(
    policy,
    { PATH: '', RECODER_DISABLE_REPO_ENGINE: '1' },
    new AbortController().signal,
  );

  const frames = await collect(driver.run(ctx));
  assert.equal(frames.length, 1);
  const done = frames[0] as { kind: string; ok: boolean; code: string };
  assert.equal(done.kind, 'done');
  assert.equal(done.ok, false);
  assert.equal(done.code, 'cli_not_found');
});

test('non-zero exit yields a failing terminal done', async () => {
  const driver = createOpenCodeDriver({ cliPathOverride: FAKE_CLI });
  const policy = makePolicy();
  const ctx = makeContext(
    policy,
    { ...(process.env as Record<string, string>), FAKE_OPENCODE_EXIT: '1' },
    new AbortController().signal,
  );

  const frames = await collect(driver.run(ctx));
  const done = frames.find((f) => f.kind === 'done') as { ok: boolean } | undefined;
  assert.ok(done);
  assert.equal(done?.ok, false);
});

test('manual approval mode gates write/execute tool calls before they proceed', async () => {
  const driver = createOpenCodeDriver({ cliPathOverride: FAKE_CLI });
  const policy = makePolicy({ approvalMode: 'manual' });
  const ctx = makeContext(policy, { ...(process.env as Record<string, string>) }, new AbortController().signal);

  const frames = await collect(driver.run(ctx));
  const approvals = frames.filter((f) => f.kind === 'approval');
  // edit (write) + bash (execute) are gated; read is not.
  assert.equal(approvals.length, 2);
});
