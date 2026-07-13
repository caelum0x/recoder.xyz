/**
 * Tests for openfang-runtime — the in-process conductor runtime driver.
 *
 * NO Rust build required: the engine and the RunEvent sink are injected via the
 * deps seam, so every path (happy, reuse-by-name, spawn failure, run failure,
 * napi throw, sink failure, truthful unavailable) is driven in isolation.
 */
import { describe, it, expect, vi } from 'vitest';
import type { RunEvent } from '@recoder/agent-os';

import {
  launchOpenfangRun,
  type OpenfangLaunchInput,
  type OpenfangRunEventSink,
} from './openfang-runtime.js';
import type { OpenfangEngineInstance } from './openfang-native.js';
import { IN_PROCESS_RUNTIME_SPECS, isInProcessRuntimeId } from './runtime-commands.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INPUT: OpenfangLaunchInput = {
  workspaceId: 'ws1',
  taskId: 'task1',
  runId: 'run_ws1',
  prompt: 'Refactor the parser',
  worktreePath: '/tmp/worktrees/ws1',
};

/** Collecting sink — records every appended RunEvent in order. */
function makeSink(): { sink: OpenfangRunEventSink; events: RunEvent[] } {
  const events: RunEvent[] = [];
  return {
    sink: {
      append: (event: RunEvent) => {
        events.push(event);
      },
    },
    events,
  };
}

/**
 * Stub engine implementing only the methods the driver touches; the cast is the
 * same pattern openfang-native.test.ts uses (the real surface has 45 methods).
 */
function makeEngine(overrides: Partial<OpenfangEngineInstance> = {}): OpenfangEngineInstance {
  return {
    listAgents: () => JSON.stringify({ ok: true, agents: [] }),
    spawnAgent: (_manifestJson: string) => JSON.stringify({ ok: true, agent_id: 'agent-1' }),
    runAgent: (agentId: string, _message: string) =>
      JSON.stringify({
        ok: true,
        agent_id: agentId,
        response: 'Parser refactored.',
        iterations: 2,
        input_tokens: 10,
        output_tokens: 20,
      }),
    ...overrides,
  } as OpenfangEngineInstance;
}

// ---------------------------------------------------------------------------
// Truthful unavailability (degrade-safe, no fake success)
// ---------------------------------------------------------------------------

describe('openfang-runtime: engine unavailable', () => {
  it('returns { available: false, reason } and emits NO events when the engine is absent', async () => {
    const { sink, events } = makeSink();
    const result = await launchOpenfangRun(INPUT, { engine: () => undefined, sink });

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toMatch(/openfang native engine unavailable/);
      expect(result.reason).toMatch(/cargo build -p openfang-napi/);
    }
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Happy path: spawn + run + started/log/completed
// ---------------------------------------------------------------------------

describe('openfang-runtime: happy path', () => {
  it('spawns from a minimal manifest, runs the turn, and emits started + log + completed', async () => {
    const spawnAgent = vi.fn((_m: string) => JSON.stringify({ ok: true, agent_id: 'agent-1' }));
    const runAgent = vi.fn((agentId: string, _msg: string) =>
      JSON.stringify({
        ok: true,
        agent_id: agentId,
        response: 'Parser refactored.',
        iterations: 2,
        input_tokens: 10,
        output_tokens: 20,
      }),
    );
    const engine = makeEngine({ spawnAgent, runAgent });
    const { sink, events } = makeSink();

    const result = await launchOpenfangRun(INPUT, { engine: () => engine, sink });

    // --- spawn: manifest built from the input, workspace = the worktree
    expect(spawnAgent).toHaveBeenCalledTimes(1);
    const manifest = JSON.parse(spawnAgent.mock.calls[0][0]);
    expect(manifest.name).toBe('recoder-ws1');
    expect(manifest.workspace).toBe('/tmp/worktrees/ws1');
    expect(manifest.metadata).toMatchObject({
      recoder_workspace_id: 'ws1',
      recoder_task_id: 'task1',
      recoder_run_id: 'run_ws1',
    });

    // --- run: the prompt goes to the spawned agent
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(runAgent).toHaveBeenCalledWith('agent-1', 'Refactor the parser');

    // --- result: truthful success with the engine's real turn metrics
    expect(result).toEqual({
      available: true,
      ok: true,
      agentId: 'agent-1',
      response: 'Parser refactored.',
      iterations: 2,
      inputTokens: 10,
      outputTokens: 20,
    });

    // --- events: started, log(response), completed — in order, on the run
    expect(events.map((e) => e.type)).toEqual(['started', 'log', 'completed']);
    for (const event of events) {
      expect(event.taskId).toBe('task1');
      expect(event.runId).toBe('run_ws1');
      expect(event.agentId).toBe('openfang');
      expect(event.eventId).toMatch(new RegExp(`^event_run_ws1_${event.type}_\\d+$`));
      expect(event.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(event.data).toMatchObject({ engine: 'openfang', native: true, workspaceId: 'ws1' });
    }
    expect(events[1].message).toBe('Parser refactored.');
    expect(events[2].data).toMatchObject({
      openfangAgentId: 'agent-1',
      iterations: 2,
      inputTokens: 10,
      outputTokens: 20,
      exitCode: 0,
    });
  });

  it('reuses an existing agent by name instead of spawning a duplicate', async () => {
    const spawnAgent = vi.fn();
    const engine = makeEngine({
      listAgents: () =>
        JSON.stringify({ ok: true, agents: [{ id: 'agent-9', name: 'my-agent', state: 'idle' }] }),
      spawnAgent,
    });
    const { sink, events } = makeSink();

    const result = await launchOpenfangRun(
      { ...INPUT, agentName: 'My Agent!' }, // sanitizes to "my-agent"
      { engine: () => engine, sink },
    );

    expect(spawnAgent).not.toHaveBeenCalled();
    expect(result).toMatchObject({ available: true, ok: true, agentId: 'agent-9' });
    expect(events.map((e) => e.type)).toEqual(['started', 'log', 'completed']);
  });
});

// ---------------------------------------------------------------------------
// Honest failures (value-level {ok:false} AND thrown napi errors)
// ---------------------------------------------------------------------------

describe('openfang-runtime: honest failures', () => {
  it('emits started + failed and returns ok:false when spawnAgent rejects the manifest', async () => {
    const engine = makeEngine({
      spawnAgent: () => JSON.stringify({ ok: false, error: 'duplicate name' }),
    });
    const { sink, events } = makeSink();

    const result = await launchOpenfangRun(INPUT, { engine: () => engine, sink });

    expect(result).toEqual({ available: true, ok: false, error: 'duplicate name' });
    expect(events.map((e) => e.type)).toEqual(['started', 'failed']);
    expect(events[1].message).toContain('spawnAgent failed: duplicate name');
  });

  it('emits started + failed when runAgent returns a value-level error', async () => {
    const engine = makeEngine({
      runAgent: () => JSON.stringify({ ok: false, error: 'no model configured' }),
    });
    const { sink, events } = makeSink();

    const result = await launchOpenfangRun(INPUT, { engine: () => engine, sink });

    expect(result).toEqual({ available: true, ok: false, error: 'no model configured' });
    expect(events.map((e) => e.type)).toEqual(['started', 'failed']);
    expect(events[1].message).toContain('runAgent failed: no model configured');
  });

  it('folds a THROWN napi error into a failed event instead of throwing', async () => {
    const engine = makeEngine({
      runAgent: () => {
        throw new Error('napi boundary exploded');
      },
    });
    const { sink, events } = makeSink();

    const result = await launchOpenfangRun(INPUT, { engine: () => engine, sink });

    expect(result).toEqual({ available: true, ok: false, error: 'napi boundary exploded' });
    expect(events.map((e) => e.type)).toEqual(['started', 'failed']);
    expect(events[1].message).toContain('openfang engine threw: napi boundary exploded');
  });

  it('treats invalid engine JSON as a truthful error, not a crash or fake success', async () => {
    const engine = makeEngine({ runAgent: () => 'not-json{{' });
    const { sink, events } = makeSink();

    const result = await launchOpenfangRun(INPUT, { engine: () => engine, sink });

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('invalid JSON');
    }
    expect(events.map((e) => e.type)).toEqual(['started', 'failed']);
  });

  it('survives a failing sink — the turn still completes truthfully', async () => {
    const engine = makeEngine();
    const sink: OpenfangRunEventSink = {
      append: () => Promise.reject(new Error('repository down')),
    };

    const result = await launchOpenfangRun(INPUT, { engine: () => engine, sink });

    expect(result).toMatchObject({ available: true, ok: true, agentId: 'agent-1' });
  });

  it('degrades a broken listAgents to a fresh spawn (reuse lookup is best-effort)', async () => {
    const spawnAgent = vi.fn((_m: string) => JSON.stringify({ ok: true, agent_id: 'agent-2' }));
    const engine = makeEngine({
      listAgents: () => {
        throw new Error('kernel busy');
      },
      spawnAgent,
    });
    const { sink } = makeSink();

    const result = await launchOpenfangRun(INPUT, { engine: () => engine, sink });

    expect(spawnAgent).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ available: true, ok: true, agentId: 'agent-2' });
  });
});

// ---------------------------------------------------------------------------
// Registration in runtime-commands (in-process spec, not the CLI union)
// ---------------------------------------------------------------------------

describe('runtime-commands: IN_PROCESS_RUNTIME_SPECS registration', () => {
  it('registers openfang as an in-process runtime pointing at launchOpenfangRun', () => {
    expect(IN_PROCESS_RUNTIME_SPECS.openfang.kind).toBe('in_process');
    expect(IN_PROCESS_RUNTIME_SPECS.openfang.launch).toBe(launchOpenfangRun);
  });

  it('isInProcessRuntimeId accepts openfang and rejects the CLI runtimes', () => {
    expect(isInProcessRuntimeId('openfang')).toBe(true);
    expect(isInProcessRuntimeId('claude_code')).toBe(false);
    expect(isInProcessRuntimeId('codex')).toBe(false);
    expect(isInProcessRuntimeId('')).toBe(false);
  });
});
