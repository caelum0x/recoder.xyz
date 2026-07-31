/**
 * P1 #8 — the conductor run/event read-model must be DURABLE, not in-memory-only.
 *
 * Before this fix `upsertRun`/`appendEvent` wrote to a per-instance in-process Map
 * and `listRuns`/`listEvents` read it back, so run history + RunEvents returned `[]`
 * after any backend restart even though the adapter's doc claimed "durable". These
 * tests pin the contract:
 *  - a NEW repository instance over the SAME durable store (a restart) returns the
 *    runs/events written by a prior instance (proves durability),
 *  - `isDurable()` is TRUTHFUL (true over a live durable store, false DB-less),
 *  - the DB-less fallback still serves without a crash (desktop no-DB path).
 */
import { describe, it, expect } from 'vitest';
import type { RunEvent, TaskRun, TaskSpec } from '@recoder/agent-os';
import { createWorkspaceRepository } from './adapters/workspace-repository.adapter.js';
import type { CanonicalRunStore } from './ports/workspace-repository.port.js';
import { makeExecutor } from './__fixtures__/harness.js';

/**
 * A shared durable canonical store standing in for the agent-os state-of-record
 * (a real DB shared across restarts). Two repository instances built over the SAME
 * instance model a backend restart: the second must see the first's writes.
 */
function makeSharedCanonicalStore(): CanonicalRunStore {
  const runs = new Map<string, TaskRun>();
  const events: RunEvent[] = [];
  const tasks = new Map<string, TaskSpec>();
  return {
    upsertRun(run) {
      runs.set(run.runId, run);
      return run;
    },
    listRuns() {
      return [...runs.values()];
    },
    appendEvent(event) {
      events.push(event);
      return event;
    },
    listEvents() {
      return [...events];
    },
    listTasks() {
      return [...tasks.values()];
    },
  };
}

function makeRun(overrides: Partial<TaskRun> = {}): TaskRun {
  return {
    runId: 'run_1',
    taskId: 'task_1',
    spaceId: 'space_1',
    state: 'running',
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeEvent(overrides: Partial<RunEvent> = {}): RunEvent {
  return {
    eventId: 'evt_1',
    type: 'log',
    taskId: 'task_1',
    runId: 'run_1',
    createdAt: new Date().toISOString(),
    message: 'hello',
    ...overrides,
  };
}

describe('conductor run/event read-model durability (P1 #8)', () => {
  it('survives a restart: a NEW repository over the same durable store returns prior runs + events', async () => {
    const store = makeSharedCanonicalStore();

    // First process: persist a run + an event through the conductor repository.
    const before = createWorkspaceRepository({
      executor: makeExecutor(true),
      canonicalStore: store,
    });
    await before.upsertRun(makeRun());
    await before.appendEvent(makeEvent());

    // Restart: a brand-new repository instance over the SAME durable store. Its
    // in-process maps are empty, so anything it returns came from the durable store.
    const after = createWorkspaceRepository({
      executor: makeExecutor(true),
      canonicalStore: store,
    });

    const runs = await after.listRuns();
    const events = await after.listEvents();
    expect(runs.map((r) => r.runId)).toContain('run_1');
    expect(events.map((e) => e.eventId)).toContain('evt_1');
  });

  it('reports isDurable() truthfully — true over a live durable store', () => {
    const repository = createWorkspaceRepository({
      executor: makeExecutor(true),
      canonicalStore: makeSharedCanonicalStore(),
    });
    expect(repository.isDurable()).toBe(true);
  });

  it('DB-less desktop path: isDurable() is false and reads/writes never crash', async () => {
    // No canonicalStore, executor unavailable — the bounded in-process fallback.
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
    expect(repository.isDurable()).toBe(false);

    await repository.upsertRun(makeRun());
    await repository.appendEvent(makeEvent());
    // In-process fallback still serves within the process (no throw, no fake).
    expect((await repository.listRuns()).map((r) => r.runId)).toContain('run_1');
    expect((await repository.listEvents()).map((e) => e.eventId)).toContain('evt_1');

    // A NEW instance (restart) has an empty fallback — truthfully NOT durable.
    const after = createWorkspaceRepository({ executor: makeExecutor(false) });
    expect(await after.listRuns()).toHaveLength(0);
    expect(await after.listEvents()).toHaveLength(0);
  });

  it('degrade-safe: a durable store is bound but the executor is unavailable — falls back, isDurable() false, no crash', async () => {
    // Simulates the pool being momentarily down: we must NOT delegate to a store
    // whose queries would reject; fall back to the in-process path truthfully.
    const repository = createWorkspaceRepository({
      executor: makeExecutor(false),
      canonicalStore: makeSharedCanonicalStore(),
    });
    expect(repository.isDurable()).toBe(false);
    await repository.upsertRun(makeRun());
    expect((await repository.listRuns()).map((r) => r.runId)).toContain('run_1');
  });
});
