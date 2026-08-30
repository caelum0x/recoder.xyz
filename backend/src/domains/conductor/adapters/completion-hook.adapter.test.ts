/**
 * Completion-hook seam (hooks h + i) — on a TERMINAL RunEvent the run flow
 * harvests an evidence-backed memory candidate (brain) and closes/notes the bd
 * issue (code-intel), while the durable+live append always runs first and a
 * capability fault never rethrows into the terminal-event path.
 */
import { describe, it, expect, vi } from 'vitest';
import type { RunEvent, Workspace } from '@recoder/agent-os';
import type { MetricLabels, MetricsPort } from '../../observability/ports/metrics.port.js';
import { createCompletionHookSink } from './completion-hook.adapter.js';
import { makeLogger } from '../__fixtures__/harness.js';

/** A recorded counter increment (metric name + label set + delta). */
interface CounterInc {
  readonly name: string;
  readonly labels?: MetricLabels;
  readonly value?: number;
}

/** A FAKE frozen MetricsPort that records counter increments. */
function fakeMetrics(): { incs: CounterInc[]; port: MetricsPort } {
  const incs: CounterInc[] = [];
  const port: MetricsPort = {
    counter: spec => ({
      inc: (labels?: MetricLabels, value?: number) =>
        void incs.push({
          name: spec.name,
          ...(labels ? { labels } : {}),
          ...(value !== undefined ? { value } : {}),
        }),
    }),
    gauge: () => ({ set: () => {}, inc: () => {}, dec: () => {} }),
    histogram: () => ({ observe: () => {} }),
    startTimer: () => ({ stop: () => 0 }),
  };
  return { incs, port };
}

function ws(over: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws_1',
    spaceId: 'space_1',
    projectId: 'project_1',
    taskId: 'task_1',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'recoder/ws_1',
    baseRef: 'HEAD',
    state: 'running',
    createdBy: 'user_alice',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {},
    ...over,
  } as Workspace;
}

function event(type: RunEvent['type'], over: Partial<RunEvent> = {}): RunEvent {
  return {
    eventId: `evt_${type}`,
    type,
    taskId: 'task_1',
    runId: 'run_ws_1',
    createdAt: new Date().toISOString(),
    data: { workspaceId: 'ws_1' },
    ...over,
  };
}

const flush = () => new Promise(r => setTimeout(r, 0));

describe('conductor completion hook', () => {
  it('returns the inner sink unchanged when neither capability is wired', () => {
    const inner = { append: vi.fn(async () => {}) };
    const sink = createCompletionHookSink({
      inner,
      getWorkspace: async () => null,
      logger: makeLogger(),
    });
    expect(sink).toBe(inner);
  });

  it('harvests memory + closes the bd issue on a completed event (evidence anchored to the workspace)', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const harvestOnCompletion = vi.fn(async () => ({
      harvested: true as const,
    }));
    const completeWork = vi.fn(async () => {});
    const reindexRepo = vi.fn(async () => {});
    const sink = createCompletionHookSink({
      inner,
      brain: { enrichPrompt: vi.fn(), harvestOnCompletion },
      codeIntel: {
        indexRepo: vi.fn(async () => {}),
        reindexRepo,
        trackWork: vi.fn(async () => {}),
        completeWork,
      },
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('completed'));
    await flush();

    // Durable+live append always ran first.
    expect(inner.append).toHaveBeenCalledTimes(1);
    // Harvest fired with the workspace's tenant + task/artifact evidence.
    expect(harvestOnCompletion).toHaveBeenCalledTimes(1);
    const harvestArg = harvestOnCompletion.mock.calls[0]![0];
    expect(harvestArg.userId).toBe('user_alice');
    expect(harvestArg.taskId).toBe('task_1');
    expect(harvestArg.outcome).toBe('completed');
    // bd issue closed on success.
    expect(completeWork).toHaveBeenCalledWith('task_1', 'completed');
    // (k) code-graph reindex fired for the workspace repo (deterministic repoId
    // derived from projectId), so the graph reflects the code this run committed.
    expect(reindexRepo).toHaveBeenCalledTimes(1);
    expect(reindexRepo).toHaveBeenCalledWith('project_1');
  });

  it('reindexes the code-graph on a failed run too (committed code may exist even on failure)', async () => {
    const reindexRepo = vi.fn(async () => {});
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      codeIntel: {
        indexRepo: vi.fn(async () => {}),
        reindexRepo,
        trackWork: vi.fn(async () => {}),
        completeWork: vi.fn(async () => {}),
      },
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('failed'));
    await flush();

    expect(reindexRepo).toHaveBeenCalledWith('project_1');
  });

  it('reindexes with the canonical repo id persisted at launch', async () => {
    const reindexRepo = vi.fn(async () => {});
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      codeIntel: {
        indexRepo: vi.fn(async () => {}),
        reindexRepo,
        trackWork: vi.fn(async () => {}),
        completeWork: vi.fn(async () => {}),
      },
      getWorkspace: async () => ws({
        projectId: 'widget',
        metadata: { repoId: 'acme__widget', repoAliases: ['widget'] },
      }),
      logger: makeLogger(),
    });

    await sink.append(event('completed'));
    await flush();

    expect(reindexRepo).toHaveBeenCalledWith('acme__widget');
  });

  it('reindex derives the repoId from worktreePath when projectId is empty', async () => {
    const reindexRepo = vi.fn(async () => {});
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      codeIntel: {
        indexRepo: vi.fn(async () => {}),
        reindexRepo,
        trackWork: vi.fn(async () => {}),
        completeWork: vi.fn(async () => {}),
      },
      getWorkspace: async () =>
        ws({ projectId: '', worktreePath: '/tmp/Repos/Acme-App' }),
      logger: makeLogger(),
    });

    await sink.append(event('completed'));
    await flush();

    // Same normalization conductor-module applies: lowercase + non [a-z0-9_-] → __.
    expect(reindexRepo).toHaveBeenCalledWith('__tmp__repos__acme-app');
  });

  it('does NOT reindex when the owning workspace is unresolvable (no repo anchor)', async () => {
    const reindexRepo = vi.fn(async () => {});
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      codeIntel: {
        indexRepo: vi.fn(async () => {}),
        reindexRepo,
        trackWork: vi.fn(async () => {}),
        completeWork: vi.fn(async () => {}),
      },
      getWorkspace: async () => null,
      logger: makeLogger(),
    });

    await sink.append(event('completed'));
    await flush();

    expect(reindexRepo).not.toHaveBeenCalled();
  });

  it('degrade-safe: a reindex throw never rejects append (terminal event unaffected)', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const sink = createCompletionHookSink({
      inner,
      codeIntel: {
        indexRepo: vi.fn(async () => {}),
        reindexRepo: vi.fn(async () => {
          throw new Error('code-graph down');
        }),
        trackWork: vi.fn(async () => {}),
        completeWork: vi.fn(async () => {}),
      },
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await expect(sink.append(event('completed'))).resolves.toBeUndefined();
    await flush();
    expect(inner.append).toHaveBeenCalledTimes(1);
  });

  it('fires the hooks on a failed event too (issue kept open by the adapter)', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const harvestOnCompletion = vi.fn(async () => ({
      harvested: true as const,
    }));
    const completeWork = vi.fn(async () => {});
    const sink = createCompletionHookSink({
      inner,
      brain: { enrichPrompt: vi.fn(), harvestOnCompletion },
      codeIntel: {
        indexRepo: vi.fn(async () => {}),
        reindexRepo: vi.fn(async () => {}),
        trackWork: vi.fn(async () => {}),
        completeWork,
      },
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('failed'));
    await flush();

    expect(harvestOnCompletion.mock.calls[0]![0].outcome).toBe('failed');
    expect(completeWork).toHaveBeenCalledWith('task_1', 'failed');
  });

  it('does NOT fire on non-terminal events (log/started)', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const harvestOnCompletion = vi.fn(async () => ({
      harvested: true as const,
    }));
    const sink = createCompletionHookSink({
      inner,
      brain: { enrichPrompt: vi.fn(), harvestOnCompletion },
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('log', { eventId: 'evt_log' }));
    await sink.append(event('started', { eventId: 'evt_started' }));
    await flush();

    expect(inner.append).toHaveBeenCalledTimes(2);
    expect(harvestOnCompletion).not.toHaveBeenCalled();
  });

  it('meters one agent_run on a terminal event (idempotent by the per-emission event anchor)', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const record = vi.fn(async () => ({ inserted: true as const }));
    const sink = createCompletionHookSink({
      inner,
      getMeter: () => ({ record }),
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('completed'));
    await flush();

    expect(inner.append).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'user_alice',
        kind: 'agent_run',
        quantity: 1,
        runId: 'run_ws_1',
        idempotencyKey: 'agent_run:evt_completed',
      })
    );
  });

  it('meters EACH distinct terminal turn of a continued workspace (per-emission key, not per-workspace)', async () => {
    const record = vi.fn(async () => ({ inserted: true as const }));
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      getMeter: () => ({ record }),
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    // Two turns of the SAME workspace/run (runId is deterministic `run_ws_1`,
    // reused across continues; workspaceId identical) but DISTINCT emitted
    // terminal events. Anchoring on workspaceId/runId would collapse both onto one
    // idempotency key and the meter's ON CONFLICT would drop turn 2.
    await sink.append(event('completed', { eventId: 'evt_turn1' }));
    await sink.append(event('completed', { eventId: 'evt_turn2' }));
    await flush();

    const agentRunKeys = record.mock.calls
      .map((c) => c[0])
      .filter((a) => a.kind === 'agent_run')
      .map((a) => a.idempotencyKey);
    // Two distinct turns ⇒ two distinct keys ⇒ both metered (a 10-message
    // workspace bills 10 agent_runs, not 1).
    expect(agentRunKeys).toEqual(['agent_run:evt_turn1', 'agent_run:evt_turn2']);
    expect(new Set(agentRunKeys).size).toBe(2);
  });

  it('meters REAL token usage when the terminal event carries inputTokens/outputTokens (native openfang path)', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const record = vi.fn(async () => ({ inserted: true as const }));
    const sink = createCompletionHookSink({
      inner,
      getMeter: () => ({ record }),
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    // The token-carrying terminal event the openfang substrate forwards.
    await sink.append(
      event('completed', {
        data: {
          workspaceId: 'ws_1',
          engine: 'openfang',
          inputTokens: 1200,
          outputTokens: 340,
          iterations: 3,
        },
      })
    );
    await flush();

    // agent_run stays (the pre-dispatch quota gate reads it) …
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'agent_run',
        quantity: 1,
        idempotencyKey: 'agent_run:evt_completed',
      })
    );
    // … and the REAL token usage is metered on top (1200 + 340 = 1540).
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'user_alice',
        kind: 'token',
        quantity: 1540,
        engine: 'openfang',
        runId: 'run_ws_1',
        idempotencyKey: 'token:evt_completed',
      })
    );
    expect(record).toHaveBeenCalledTimes(2);
  });

  it('does NOT meter a token line when the terminal event carries no usage (flat agent_run only)', async () => {
    const record = vi.fn(async () => ({ inserted: true as const }));
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      getMeter: () => ({ record }),
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('completed')); // no inputTokens/outputTokens
    await flush();

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'agent_run' })
    );
    expect(record).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'token' })
    );
  });

  it('meters a failed run too (a launched run consumed one agent_run)', async () => {
    const record = vi.fn(async () => ({ inserted: true as const }));
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      getMeter: () => ({ record }),
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('failed'));
    await flush();

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'agent_run', subjectId: 'user_alice' })
    );
  });

  it('does NOT meter when the subject is unresolvable (no createdBy) — a truthful skip', async () => {
    const record = vi.fn(async () => ({ inserted: true as const }));
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      getMeter: () => ({ record }),
      getWorkspace: async () => null, // no owning workspace ⇒ no userId
      logger: makeLogger(),
    });

    await sink.append(event('completed'));
    await flush();

    expect(record).not.toHaveBeenCalled();
  });

  it('does NOT meter on non-terminal events', async () => {
    const record = vi.fn(async () => ({ inserted: true as const }));
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      getMeter: () => ({ record }),
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('log', { eventId: 'evt_log' }));
    await flush();

    expect(record).not.toHaveBeenCalled();
  });

  it('degrade-safe: a meter that is not yet wired (getMeter returns undefined) is a no-op', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const sink = createCompletionHookSink({
      inner,
      getMeter: () => undefined, // bootstrap has not injected the billing meter yet
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await expect(sink.append(event('completed'))).resolves.toBeUndefined();
    await flush();
    expect(inner.append).toHaveBeenCalledTimes(1);
  });

  it('degrade-safe: a meter throw never rejects append (terminal event unaffected)', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const sink = createCompletionHookSink({
      inner,
      getMeter: () => ({
        record: vi.fn(async () => {
          throw new Error('billing down');
        }),
      }),
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await expect(sink.append(event('completed'))).resolves.toBeUndefined();
    await flush();
    expect(inner.append).toHaveBeenCalledTimes(1);
  });

  it('publishes a workspace.completed kernel event on a terminal event (workspaceId + taskId + outcome)', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const publish = vi.fn(async () => [] as { agentId: string; message: string }[]);
    const sink = createCompletionHookSink({
      inner,
      agentEvent: { publish },
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('completed'));
    await flush();

    // Durable+live append always ran first, and the event was published once.
    expect(inner.append).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'workspace.completed',
        workspaceId: 'ws_1',
        taskId: 'task_1',
        outcome: 'completed',
      })
    );
  });

  it('publishes with outcome:failed on a failed event', async () => {
    const publish = vi.fn(async () => [] as { agentId: string; message: string }[]);
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      agentEvent: { publish },
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('failed'));
    await flush();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'workspace.completed', outcome: 'failed' })
    );
  });

  it('wraps the inner sink when ONLY the event port is wired (short-circuit includes agentEvent)', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const publish = vi.fn(async () => [] as { agentId: string; message: string }[]);
    const sink = createCompletionHookSink({
      inner,
      agentEvent: { publish },
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    // Not the identity sink — the decorator wraps so the publish hook can fire.
    expect(sink).not.toBe(inner);
    await sink.append(event('completed'));
    await flush();
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('does NOT publish a kernel event on non-terminal events', async () => {
    const publish = vi.fn(async () => [] as { agentId: string; message: string }[]);
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      agentEvent: { publish },
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('log', { eventId: 'evt_log' }));
    await sink.append(event('started', { eventId: 'evt_started' }));
    await flush();

    expect(publish).not.toHaveBeenCalled();
  });

  it('degrade-safe: a kernel event publish throw never rejects append (terminal event unaffected)', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const sink = createCompletionHookSink({
      inner,
      agentEvent: {
        publish: vi.fn(async () => {
          throw new Error('kernel bus down');
        }),
      },
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await expect(sink.append(event('completed'))).resolves.toBeUndefined();
    await flush();
    expect(inner.append).toHaveBeenCalledTimes(1);
  });

  it('reverse-pushes a run signal on a failed terminal event (outcome:failed, workspace anchor)', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const forwardRunSignal = vi.fn(async () => ({ forwarded: true, degraded: false }));
    const sink = createCompletionHookSink({
      inner,
      getRunSignalPush: () => ({ forwardRunSignal }),
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('failed'));
    await flush();

    // Durable+live append always ran first, and exactly one push fired.
    expect(inner.append).toHaveBeenCalledTimes(1);
    expect(forwardRunSignal).toHaveBeenCalledTimes(1);
    expect(forwardRunSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failed',
        title: 'project_1',
        runId: 'run_ws_1',
        workspaceId: 'ws_1',
        taskId: 'task_1',
      })
    );
  });

  it('reverse-pushes on a completed event too (far-side truthful skip is the port’s job, not the hook’s)', async () => {
    const forwardRunSignal = vi.fn(async () => ({
      forwarded: false,
      degraded: false,
      reason: 'completed run is not stuck work',
    }));
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      getRunSignalPush: () => ({ forwardRunSignal }),
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('completed'));
    await flush();

    expect(forwardRunSignal).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'completed' })
    );
  });

  it('carries the PR url + reason from the terminal event data when present', async () => {
    const forwardRunSignal = vi.fn(async () => ({ forwarded: true, degraded: false }));
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      getRunSignalPush: () => ({ forwardRunSignal }),
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(
      event('failed', {
        data: {
          workspaceId: 'ws_1',
          prUrl: 'https://github.com/acme/app/pull/7',
          reason: 'tests red',
        },
      })
    );
    await flush();

    expect(forwardRunSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://github.com/acme/app/pull/7',
        reason: 'tests red',
      })
    );
  });

  it('does NOT reverse-push on non-terminal events', async () => {
    const forwardRunSignal = vi.fn(async () => ({ forwarded: false, degraded: false }));
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      getRunSignalPush: () => ({ forwardRunSignal }),
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('log', { eventId: 'evt_log' }));
    await sink.append(event('started', { eventId: 'evt_started' }));
    await flush();

    expect(forwardRunSignal).not.toHaveBeenCalled();
  });

  it('is the identity sink when ONLY an unwired push thunk is present (returns undefined ⇒ no wrap, no push)', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const sink = createCompletionHookSink({
      inner,
      // The port is not yet injected by bootstrap ⇒ the thunk returns undefined.
      getRunSignalPush: () => undefined,
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    // The decorator still wraps (the thunk itself is a wired capability), but a
    // terminal event pushes nothing and never throws.
    await expect(sink.append(event('failed'))).resolves.toBeUndefined();
    await flush();
    expect(inner.append).toHaveBeenCalledTimes(1);
  });

  it('degrade-safe: a reverse-push throw never rejects append (terminal event unaffected)', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const sink = createCompletionHookSink({
      inner,
      getRunSignalPush: () => ({
        forwardRunSignal: vi.fn(async () => {
          throw new Error('ops-recorder down');
        }),
      }),
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await expect(sink.append(event('failed'))).resolves.toBeUndefined();
    await flush();
    expect(inner.append).toHaveBeenCalledTimes(1);
  });

  it('records conductor_runs_total{outcome,engine} on a terminal event (engine from the workspace runtime)', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const { incs, port } = fakeMetrics();
    const sink = createCompletionHookSink({
      inner,
      getMetrics: () => port,
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('completed'));
    await flush();

    expect(inner.append).toHaveBeenCalledTimes(1);
    const runs = incs.filter(entry => entry.name === 'conductor_runs_total');
    expect(runs).toHaveLength(1);
    // No engine on the event ⇒ the workspace runtimeId labels the series.
    expect(runs[0]?.labels).toEqual({ outcome: 'completed', engine: 'claude_code' });
    // No usage on the event ⇒ no token series (never a fabricated 0).
    expect(incs.some(entry => entry.name === 'conductor_run_tokens_total')).toBe(false);
  });

  it('records a failed run + REAL token usage by direction when the event carries usage', async () => {
    const { incs, port } = fakeMetrics();
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      getMetrics: () => port,
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(
      event('failed', {
        data: {
          workspaceId: 'ws_1',
          engine: 'openfang',
          inputTokens: 1200,
          outputTokens: 340,
        },
      })
    );
    await flush();

    expect(incs).toContainEqual({
      name: 'conductor_runs_total',
      labels: { outcome: 'failed', engine: 'openfang' },
    });
    expect(incs).toContainEqual({
      name: 'conductor_run_tokens_total',
      labels: { engine: 'openfang', direction: 'input' },
      value: 1200,
    });
    expect(incs).toContainEqual({
      name: 'conductor_run_tokens_total',
      labels: { engine: 'openfang', direction: 'output' },
      value: 340,
    });
  });

  it('does NOT record run metrics on non-terminal events', async () => {
    const { incs, port } = fakeMetrics();
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      getMetrics: () => port,
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('log', { eventId: 'evt_log' }));
    await sink.append(event('started', { eventId: 'evt_started' }));
    await flush();

    expect(incs).toHaveLength(0);
  });

  it('labels engine "unknown" when neither the event nor a workspace carries an engine', async () => {
    const { incs, port } = fakeMetrics();
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      getMetrics: () => port,
      getWorkspace: async () => null,
      logger: makeLogger(),
    });

    await sink.append(event('completed'));
    await flush();

    expect(incs).toContainEqual({
      name: 'conductor_runs_total',
      labels: { outcome: 'completed', engine: 'unknown' },
    });
  });

  it('degrade-safe: an unwired metrics thunk (returns undefined) is a truthful no-op', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const sink = createCompletionHookSink({
      inner,
      getMetrics: () => undefined, // bootstrap has not injected observability yet
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await expect(sink.append(event('completed'))).resolves.toBeUndefined();
    await flush();
    expect(inner.append).toHaveBeenCalledTimes(1);
  });

  it('degrade-safe: a metrics-registry throw never rejects append and never starves the other hooks', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const record = vi.fn(async () => ({ inserted: true as const }));
    const sink = createCompletionHookSink({
      inner,
      getMetrics: () => ({
        counter: () => {
          throw new Error('registry exploded');
        },
        gauge: () => ({ set: () => {}, inc: () => {}, dec: () => {} }),
        histogram: () => ({ observe: () => {} }),
        startTimer: () => ({ stop: () => 0 }),
      }),
      getMeter: () => ({ record }),
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await expect(sink.append(event('completed'))).resolves.toBeUndefined();
    await flush();
    expect(inner.append).toHaveBeenCalledTimes(1);
    // The metering hook after the faulting metrics block still ran.
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('degrade-safe: a harvest throw never rejects append (terminal event unaffected)', async () => {
    const inner = { append: vi.fn(async () => {}) };
    const sink = createCompletionHookSink({
      inner,
      brain: {
        enrichPrompt: vi.fn(),
        harvestOnCompletion: vi.fn(async () => {
          throw new Error('memory down');
        }),
      },
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await expect(sink.append(event('completed'))).resolves.toBeUndefined();
    await flush();
    expect(inner.append).toHaveBeenCalledTimes(1);
  });
});
