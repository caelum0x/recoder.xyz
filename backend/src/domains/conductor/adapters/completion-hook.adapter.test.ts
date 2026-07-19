/**
 * Completion-hook seam (hooks h + i) — on a TERMINAL RunEvent the run flow
 * harvests an evidence-backed memory candidate (brain) and closes/notes the bd
 * issue (code-intel), while the durable+live append always runs first and a
 * capability fault never rethrows into the terminal-event path.
 */
import { describe, it, expect, vi } from 'vitest';
import type { RunEvent, Workspace } from '@recoder/agent-os';
import { createCompletionHookSink } from './completion-hook.adapter.js';
import { makeLogger } from '../__fixtures__/harness.js';

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

  it('meters one agent_run on a terminal event (idempotent by the workspace anchor)', async () => {
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
        idempotencyKey: 'agent_run:ws_1',
      })
    );
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
        idempotencyKey: 'agent_run:ws_1',
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
        idempotencyKey: 'token:ws_1',
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
