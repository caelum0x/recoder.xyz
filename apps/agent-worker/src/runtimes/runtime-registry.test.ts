import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { RunEvent, TaskSpec, InstructionBundle } from '@recoder/agent-os';
import type { RuntimeTaskInput } from '@recoder/agent-runtimes';
import {
  createRuntime,
  type RuntimeDriver,
  type DriverFrame,
} from '@recoder/runtime';

import {
  buildRuntimeRegistry,
  resolveRuntimeAdapters,
  RUNTIME_SURFACES,
} from './runtime-registry';
import { runTaskWorkflow } from '../workflows/run-task-workflow';

/**
 * A minimal, real `RuntimeDriver` that the engine drives end-to-end. It is NOT a stub of
 * the adapter contract — it implements the actual driver SPI and yields real frames, so
 * the engine produces real RunEvents. This is what proves `@recoder/runtime`'s engine path
 * is exercised by product code (the empty `@recoder/agent-runtimes` shell would instead emit
 * a `failed` event with `code: 'runtime_unavailable'`).
 */
function fakeClaudeCodeDriver(): RuntimeDriver {
  return {
    descriptor: {
      id: 'fake-claude-code',
      kind: 'claude_code',
      surfaces: ['claude_code'],
      modes: ['in_process'],
      capabilities: [],
      inProcess: true,
      label: 'Fake Claude Code (test driver)',
    },
    async probe() {
      return {
        available: true,
        health: { status: 'healthy', checkedAt: new Date().toISOString() },
      };
    },
    async *run(): AsyncIterable<DriverFrame> {
      yield { kind: 'text', text: 'working on it' };
      yield { kind: 'done', ok: true, stopReason: 'end_turn', finalText: 'all done' };
    },
  };
}

function makeTaskInput(): RuntimeTaskInput {
  const now = new Date().toISOString();
  const task: TaskSpec = {
    taskId: 'task_rt_wire_1',
    title: 'Wire runtime',
    intent: 'feature_delivery',
    goal: 'Prove the runtime engine is exercised',
    spaceId: 'space_test',
    targetPaths: [],
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verification: { commands: [] },
    approvalRequired: [],
    artifactRequired: [],
  };
  const bundle: InstructionBundle = {
    bundleId: 'bundle_rt_wire_1',
    taskId: task.taskId,
    agentId: 'agent_test',
    runtime: 'claude_code',
    sharedGoal: task.goal,
    acceptanceCriteria: [],
    verificationCommands: [],
    forbiddenActions: [],
    approvalGateIds: [],
    memoryRefIds: [],
    sourceRefs: [],
    compilerVersion: 'test',
    compiledAt: now,
    renderedPrompt: 'do the thing',
  };
  return {
    task,
    bundle,
    policy: {
      requireSignedEnvelope: false,
      enforceWorkLocks: false,
      allowNetwork: false,
      allowShell: false,
      approvalMode: 'auto',
    },
  };
}

test('buildRuntimeRegistry registers a resolvable @recoder/runtime adapter (not runtime_unavailable shell)', async () => {
  const runtime = createRuntime({ drivers: [fakeClaudeCodeDriver()] });

  // The worker map is keyed by surface and typed as RuntimeAdapterPort.
  const registry = await buildRuntimeRegistry({ runtime, surfaces: ['claude_code'] });
  const port = registry['claude_code'];
  assert.ok(port, 'claude_code surface must resolve to a real runtime adapter');
  assert.equal(typeof port.sendTask, 'function');
  assert.equal(typeof port.health, 'function');

  // The richer AgentRuntimeAdapter (with `kind`) is available via resolveRuntimeAdapters.
  const [registered] = await resolveRuntimeAdapters({ runtime, surfaces: ['claude_code'] });
  assert.ok(registered);
  assert.equal(registered.adapter.kind, 'claude_code');

  const health = await port.health();
  assert.equal(health.status, 'healthy');
});

test('the registered adapter runs through the real engine and emits a completed event', async () => {
  const runtime = createRuntime({ drivers: [fakeClaudeCodeDriver()] });
  const [registered] = await resolveRuntimeAdapters({ runtime, surfaces: ['claude_code'] });
  assert.ok(registered);

  // runTaskWorkflow is the product code path in agent-worker that drives an adapter.
  const events: RunEvent[] = await runTaskWorkflow(registered.adapter, makeTaskInput());

  assert.ok(events.length > 0, 'engine must emit events');
  const completed = events.find((e) => e.type === 'completed');
  assert.ok(completed, 'real engine must reach a completed terminal event');

  // Prove it is NOT the empty shell: no runtime_unavailable failure was emitted.
  const unavailable = events.find(
    (e) =>
      e.type === 'failed' &&
      (e.data as Record<string, unknown> | undefined)?.['code'] === 'runtime_unavailable',
  );
  assert.equal(unavailable, undefined, 'must not fall back to the runtime_unavailable shell');
});

test('resolveRuntimeAdapters skips a surface whose driver is offline (additive availability gate)', async () => {
  const offlineDriver: RuntimeDriver = {
    descriptor: {
      id: 'fake-offline-codex',
      kind: 'codex',
      surfaces: ['codex'],
      modes: ['in_process'],
      capabilities: [],
      inProcess: true,
      label: 'Offline Codex (test)',
    },
    async probe() {
      return {
        available: false,
        unavailableReason: 'codex CLI not installed',
        health: { status: 'offline', checkedAt: new Date().toISOString() },
      };
    },
    async *run(): AsyncIterable<DriverFrame> {
      yield { kind: 'done', ok: false, stopReason: 'error', code: 'runtime_unavailable' };
    },
  };

  const runtime = createRuntime({ drivers: [offlineDriver] });
  const resolved = await resolveRuntimeAdapters({ runtime, surfaces: ['codex'], requireHealthy: true });
  assert.equal(resolved.length, 0, 'offline surfaces must not be registered when requireHealthy');

  const forced = await resolveRuntimeAdapters({ runtime, surfaces: ['codex'], requireHealthy: false });
  assert.equal(forced.length, 1, 'requireHealthy:false still resolves the real adapter');
});

test('the default createRuntime() (built-in drivers) exposes all expected surfaces', async () => {
  // No injected drivers: uses the real built-in driver set. We assert the adapters are
  // constructible/resolvable from product code; health is not asserted (no CLIs in CI).
  const resolved = await resolveRuntimeAdapters({ requireHealthy: false });
  const surfaces = new Set(resolved.map((r) => r.surface));
  for (const surface of RUNTIME_SURFACES) {
    assert.ok(surfaces.has(surface), `built-in runtime must serve surface ${surface}`);
  }
});
