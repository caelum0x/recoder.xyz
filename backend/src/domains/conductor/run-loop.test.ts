/**
 * Run loop — the tail seam, with the load-bearing invariant: NEVER a fabricated
 * exit code.
 *
 * Proves: while an agent run is alive the substrate reports `exitCode()` as
 * `undefined` (unknown), never `0`; a truthful code surfaces only once the run
 * finishes. The persisted tail cursor preserves "unknown" as absence (not a
 * fabricated 0). The run-tailer attaches idempotently and emits ONE truthful
 * lifecycle marker (a `log` event) — it never manufactures agent output.
 */
import { describe, it, expect } from 'vitest';
import type { RunEvent } from '@recoder/agent-os';
import { createWorkspaceRepository } from './adapters/workspace-repository.adapter.js';
import { createRunTailer } from './adapters/run-tailer.adapter.js';
import type { RunEventSinkPort } from './ports/index.js';
import { FakeSubstrate, makeExecutor, makeLogger } from './__fixtures__/harness.js';

describe('run loop — exit code is never fabricated', () => {
  it('reports exitCode undefined while the run is alive, then the true code on finish', async () => {
    const substrate = new FakeSubstrate({ id: 'tmux_worktree' });
    const handle = await substrate.launch({
      workspaceId: 'ws_1',
      command: 'claude -p "x"',
      repoPath: '/tmp/repo',
      branch: 'b',
      baseRef: 'HEAD',
    });

    // ALIVE → unknown (undefined), never a fabricated 0.
    expect(await substrate.exitCode(handle)).toBeUndefined();
    expect(await substrate.alive(handle)).toBe(true);

    substrate.finish(handle.ref, 2);

    // FINISHED → the real non-zero code, truthfully.
    expect(await substrate.exitCode(handle)).toBe(2);
    expect(await substrate.alive(handle)).toBe(false);
  });

  it('persists an unknown exit code as ABSENCE (never a fabricated 0)', async () => {
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });

    await repository.persistTailCursor({ workspaceId: 'ws_1', runId: 'run_1', lastOffset: 10 });
    const unknown = await repository.getTailCursor('ws_1');
    expect(unknown?.exitCode).toBeUndefined();
    expect(unknown?.finished).toBe(false);

    await repository.persistTailCursor({
      workspaceId: 'ws_1',
      runId: 'run_1',
      lastOffset: 40,
      exitCode: 0,
      finished: true,
    });
    const finished = await repository.getTailCursor('ws_1');
    expect(finished?.exitCode).toBe(0);
    expect(finished?.finished).toBe(true);
  });
});

describe('run-tailer attach', () => {
  function capturingSink(): { sink: RunEventSinkPort; events: RunEvent[] } {
    const events: RunEvent[] = [];
    return { events, sink: { async append(event) { events.push(event); } } };
  }

  it('emits ONE truthful lifecycle marker and de-dupes repeat attaches', async () => {
    const { sink, events } = capturingSink();
    const tailer = createRunTailer({ sink, logger: makeLogger() });

    tailer.start({
      workspaceId: 'ws_1',
      taskId: 'task_1',
      runId: 'run_1',
      substrate: 'tmux_worktree',
      sessionName: 'sess_1',
    });
    tailer.start({
      workspaceId: 'ws_1',
      taskId: 'task_1',
      runId: 'run_1',
      substrate: 'tmux_worktree',
      sessionName: 'sess_1',
    });
    await Promise.resolve();

    expect(tailer.isTailing('ws_1')).toBe(true);
    expect(events).toHaveLength(1);
    const marker = events[0]!;
    // A truthful lifecycle log — not fabricated agent output, and no fabricated exit code.
    expect(marker.type).toBe('log');
    expect(marker.data?.workspaceId).toBe('ws_1');
    expect(marker.data).not.toHaveProperty('exitCode');
  });

  it('reports isTailing false for a workspace it never attached', () => {
    const { sink } = capturingSink();
    const tailer = createRunTailer({ sink, logger: makeLogger() });
    expect(tailer.isTailing('ws_missing')).toBe(false);
  });
});
