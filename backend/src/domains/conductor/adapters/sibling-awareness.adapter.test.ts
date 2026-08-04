/**
 * Sibling-awareness seam (recoder-i499) — on a TERMINAL RunEvent the decorator
 * steers a terse paths+stats note into every still-RUNNING taskGroup sibling
 * (never file contents), appends a delivered-evidence event on each receiver,
 * and NEVER lets a delivery fault touch the terminal-event path.
 */
import { describe, it, expect, vi } from 'vitest';
import type { RunEvent, Workspace } from '@recoder/agent-os';
import type {
  CompareView,
  SiblingCompareEntry,
} from '../services/compare.service.js';
import {
  MIDRUN_CHECK_INTERVAL_MS,
  MIDRUN_NOTE_INTERVAL_MS,
  SIBLING_CONTEXT_DELIVERED,
  composeSiblingNote,
  composeSiblingProgressNote,
  createSiblingAwarenessSink,
  crossedMilestone,
  progressSnapshotOf,
  siblingAwarenessEnabled,
  stampSiblingAwareness,
} from './sibling-awareness.adapter.js';
import { makeLogger } from '../__fixtures__/harness.js';

function ws(over: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws_a',
    spaceId: 'space_1',
    projectId: 'project_1',
    taskId: 'task_a',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'recoder/ws_a',
    baseRef: 'HEAD',
    state: 'completed',
    createdBy: 'user_alice',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { taskGroup: 'grp_1' },
    ...over,
  } as Workspace;
}

function sibling(over: Partial<SiblingCompareEntry> = {}): SiblingCompareEntry {
  return {
    workspaceId: 'ws_b',
    agent: 'codex',
    runtimeId: 'codex',
    branch: 'recoder/ws_b',
    state: 'running',
    sessionName: 'recoder-ws-b',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

function view(siblings: readonly SiblingCompareEntry[]): CompareView {
  return { taskGroup: 'grp_1', count: siblings.length, siblings, contested: [] };
}

function terminal(type: 'completed' | 'failed', workspaceId = 'ws_a'): RunEvent {
  return {
    eventId: `evt_${type}_${workspaceId}`,
    type,
    taskId: 'task_a',
    runId: `run_${workspaceId}`,
    createdAt: new Date().toISOString(),
    data: { workspaceId },
  };
}

/** Drain the fire-and-forget fan-out (all fakes resolve in microtasks). */
const flush = () => new Promise(r => setTimeout(r, 0));

interface HarnessOptions {
  readonly workspaces?: Record<string, Workspace>;
  readonly compare?: CompareView | null;
  readonly steer?: (input: {
    workspaceId: string;
    keys: string;
    submit: boolean;
  }) => Promise<{ ok: boolean; reason?: string }>;
  readonly siblings?: (id: string) => Promise<CompareView | null>;
  /** Injectable clock (mid-run throttle/rate windows key off `Date.parse(now())`). */
  readonly now?: () => string;
}

function makeSink(options: HarnessOptions = {}) {
  const appended: RunEvent[] = [];
  const inner = {
    append: vi.fn(async (event: RunEvent) => {
      appended.push(event);
    }),
  };
  const steered: { workspaceId: string; keys: string; submit: boolean }[] = [];
  const steer =
    options.steer ??
    (async (input: { workspaceId: string; keys: string; submit: boolean }) => {
      steered.push(input);
      return { ok: true };
    });
  const workspaces = options.workspaces ?? {
    ws_a: ws(),
    ws_b: ws({
      workspaceId: 'ws_b',
      taskId: 'task_b',
      runId: 'run_ws_b',
      runtimeId: 'codex',
      state: 'running',
    }),
  };
  const sink = createSiblingAwarenessSink({
    inner,
    getWorkspace: async id => workspaces[id] ?? null,
    siblings:
      options.siblings ??
      (async () => (options.compare !== undefined ? options.compare : null)),
    steer: input => {
      // record even when a custom steer is injected (throwing fakes record first)
      return steer(input);
    },
    logger: makeLogger(),
    now: options.now ?? (() => '2026-08-04T00:00:00.000Z'),
    id: () => 'sibctx_fixed',
  });
  return { sink, inner, appended, steered };
}

describe('composeSiblingNote', () => {
  it('composes the bounded 4-line paths+stats note (no file contents)', () => {
    const note = composeSiblingNote({
      agent: 'claude_code',
      branch: 'recoder/ws_a',
      outcome: 'completed',
      changedFiles: ['src/a.ts', 'src/b.ts'],
      diffStat: { files: 2, additions: 120, deletions: 40 },
    });
    const lines = note.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(
      '[Recoder] Parallel sibling update: claude_code on branch recoder/ws_a finished (completed).'
    );
    expect(lines[1]).toBe('Files it changed: src/a.ts, src/b.ts');
    expect(lines[2]).toBe('Diff: +120/-40 across 2 file(s).');
    expect(lines[3]).toContain('avoid duplicating');
  });

  it('caps the file list at 12 with a truthful "+N more"', () => {
    const files = Array.from({ length: 15 }, (_, i) => `src/f${i}.ts`);
    const note = composeSiblingNote({
      agent: 'codex',
      branch: 'b',
      outcome: 'failed',
      changedFiles: files,
    });
    expect(note).toContain('src/f11.ts');
    expect(note).not.toContain('src/f12.ts');
    expect(note).toContain('(+3 more)');
  });

  it('states unavailable/empty change data truthfully (never fabricated)', () => {
    const unreadable = composeSiblingNote({ agent: 'a', branch: 'b', outcome: 'completed' });
    expect(unreadable).toContain('Files it changed: unavailable (diff not readable).');
    expect(unreadable).toContain('Diff: unavailable.');
    const empty = composeSiblingNote({
      agent: 'a',
      branch: 'b',
      outcome: 'completed',
      changedFiles: [],
    });
    expect(empty).toContain('Files it changed: none reported by git.');
  });

  it('flattens control characters so hostile paths/branches cannot add lines', () => {
    const note = composeSiblingNote({
      agent: 'a\ngent',
      branch: 'br\r\nanch',
      outcome: 'completed',
      changedFiles: ['evil\npath.ts'],
      diffStat: { files: 1, additions: 1, deletions: 0 },
    });
    expect(note.split('\n')).toHaveLength(4);
    expect(note).toContain('evil path.ts');
  });
});

describe('stampSiblingAwareness', () => {
  it('defaults TRUE for a taskGroup launch', () => {
    expect(stampSiblingAwareness({ taskGroup: 'grp' }, undefined)).toEqual({
      taskGroup: 'grp',
      siblingAwareness: true,
    });
  });

  it('an explicit false overrides the taskGroup default', () => {
    expect(stampSiblingAwareness({ taskGroup: 'grp' }, false)).toEqual({
      taskGroup: 'grp',
      siblingAwareness: false,
    });
  });

  it('leaves an ungrouped launch byte-identical (no flag invented)', () => {
    expect(stampSiblingAwareness(undefined, undefined)).toBeUndefined();
    const metadata = { other: 'x' };
    expect(stampSiblingAwareness(metadata, undefined)).toBe(metadata);
  });

  it('stamps an explicit flag on an ungrouped launch and keeps an existing boolean', () => {
    expect(stampSiblingAwareness(undefined, true)).toEqual({ siblingAwareness: true });
    const preset = { taskGroup: 'grp', siblingAwareness: false };
    expect(stampSiblingAwareness(preset, undefined)).toBe(preset);
  });
});

describe('siblingAwarenessEnabled', () => {
  it('only an explicit false/"false" opts out (absent ⇒ participates)', () => {
    expect(siblingAwarenessEnabled(ws())).toBe(true);
    expect(siblingAwarenessEnabled(ws({ metadata: {} }))).toBe(true);
    expect(siblingAwarenessEnabled(ws({ metadata: { siblingAwareness: false } }))).toBe(false);
    expect(siblingAwarenessEnabled(ws({ metadata: { siblingAwareness: 'false' } }))).toBe(false);
  });
});

describe('createSiblingAwarenessSink', () => {
  it('NEVER delivers across owners — a colliding caller-supplied taskGroup must not bridge tenants', async () => {
    const { sink, steered, appended } = makeSink({
      workspaces: {
        ws_a: ws(),
        // Same taskGroup string, DIFFERENT owner: the attacker scenario.
        ws_b: ws({
          workspaceId: 'ws_b',
          taskId: 'task_b',
          runtimeId: 'codex',
          state: 'running',
          createdBy: 'user_mallory',
        }),
      },
      compare: view([
        sibling({ workspaceId: 'ws_a', state: 'completed', changedFiles: ['src/secret.ts'] }),
        sibling(),
      ]),
    });

    await sink.append(terminal('completed'));
    await flush();

    expect(steered).toHaveLength(0);
    // Only the terminal event itself — no cross-owner evidence append.
    expect(appended.filter((e) => e.type === 'log')).toHaveLength(0);
  });

  it('steers the note into a running sibling and appends the delivered evidence', async () => {
    const { sink, appended, steered } = makeSink({
      compare: view([
        sibling({ workspaceId: 'ws_a', agent: 'claude_code', branch: 'recoder/ws_a', state: 'completed', changedFiles: ['src/a.ts'], diffStat: { files: 1, additions: 5, deletions: 2 } }),
        sibling(),
      ]),
    });

    await sink.append(terminal('completed'));
    await flush();

    expect(steered).toHaveLength(1);
    expect(steered[0]!.workspaceId).toBe('ws_b');
    expect(steered[0]!.submit).toBe(true);
    expect(steered[0]!.keys).toContain('[Recoder] Parallel sibling update: claude_code');
    expect(steered[0]!.keys).toContain('src/a.ts');
    expect(steered[0]!.keys).toContain('+5/-2');

    // Terminal event first, then the evidence event on the RECEIVER.
    expect(appended).toHaveLength(2);
    expect(appended[0]!.type).toBe('completed');
    const evidence = appended[1]!;
    expect(evidence.type).toBe('log');
    expect(evidence.taskId).toBe('task_b');
    expect(evidence.runId).toBe('run_ws_b');
    expect(evidence.data).toMatchObject({
      kind: SIBLING_CONTEXT_DELIVERED,
      workspaceId: 'ws_b',
      fromWorkspaceId: 'ws_a',
      agent: 'claude_code',
    });
  });

  it('fires on failed outcomes too and says so in the note', async () => {
    const { sink, steered } = makeSink({
      compare: view([sibling({ workspaceId: 'ws_a', state: 'failed' }), sibling()]),
    });
    await sink.append(terminal('failed'));
    await flush();
    expect(steered).toHaveLength(1);
    expect(steered[0]!.keys).toContain('finished (failed).');
  });

  it('skips non-running siblings and running ones without a session handle', async () => {
    const { sink, steered, appended } = makeSink({
      compare: view([
        sibling({ workspaceId: 'ws_a', state: 'completed' }),
        sibling({ workspaceId: 'ws_c', state: 'awaiting_review' }),
        sibling({ workspaceId: 'ws_d', state: 'running', sessionName: undefined as never }),
      ]),
    });
    await sink.append(terminal('completed'));
    await flush();
    expect(steered).toHaveLength(0);
    expect(appended).toHaveLength(1); // only the terminal event — no fabricated evidence
  });

  it('swallows a throwing steer and still delivers to the other siblings', async () => {
    const delivered: string[] = [];
    const { sink, appended } = makeSink({
      workspaces: {
        ws_a: ws(),
        ws_b: ws({ workspaceId: 'ws_b', taskId: 'task_b', state: 'running' }),
        ws_c: ws({ workspaceId: 'ws_c', taskId: 'task_c', state: 'running' }),
      },
      compare: view([
        sibling({ workspaceId: 'ws_a', state: 'completed' }),
        sibling({ workspaceId: 'ws_b' }),
        sibling({ workspaceId: 'ws_c', sessionName: 'recoder-ws-c' }),
      ]),
      steer: async input => {
        if (input.workspaceId === 'ws_b') throw new Error('tmux exploded');
        delivered.push(input.workspaceId);
        return { ok: true };
      },
    });

    // The terminal append itself NEVER rejects.
    await expect(sink.append(terminal('completed'))).resolves.toBeUndefined();
    await flush();

    expect(delivered).toEqual(['ws_c']);
    // Evidence only for the sibling that actually received the note.
    const evidence = appended.filter(e => e.data?.kind === SIBLING_CONTEXT_DELIVERED);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.data?.workspaceId).toBe('ws_c');
  });

  it('a truthful steer refusal (ok:false) appends no delivered evidence', async () => {
    const { sink, appended } = makeSink({
      compare: view([sibling({ workspaceId: 'ws_a', state: 'completed' }), sibling()]),
      steer: async () => ({ ok: false, reason: 'workspace is merged, not running' }),
    });
    await sink.append(terminal('completed'));
    await flush();
    expect(appended.filter(e => e.data?.kind === SIBLING_CONTEXT_DELIVERED)).toHaveLength(0);
  });

  it('skips a receiver that opted out (metadata.siblingAwareness === false)', async () => {
    const { sink, steered } = makeSink({
      workspaces: {
        ws_a: ws(),
        ws_b: ws({
          workspaceId: 'ws_b',
          state: 'running',
          metadata: { taskGroup: 'grp_1', siblingAwareness: false },
        }),
      },
      compare: view([sibling({ workspaceId: 'ws_a', state: 'completed' }), sibling()]),
    });
    await sink.append(terminal('completed'));
    await flush();
    expect(steered).toHaveLength(0);
  });

  it('a finisher that opted out broadcasts nothing at all', async () => {
    const siblings = vi.fn(async () => view([sibling()]));
    const { sink, steered } = makeSink({
      workspaces: {
        ws_a: ws({ metadata: { taskGroup: 'grp_1', siblingAwareness: false } }),
        ws_b: ws({ workspaceId: 'ws_b', state: 'running' }),
      },
      siblings,
    });
    await sink.append(terminal('completed'));
    await flush();
    expect(steered).toHaveLength(0);
    expect(siblings).not.toHaveBeenCalled();
  });

  it('an ungrouped/singleton workspace is a truthful no-op', async () => {
    const { sink, steered } = makeSink({
      compare: {
        taskGroup: null,
        count: 1,
        siblings: [sibling({ workspaceId: 'ws_a', state: 'completed' })],
        contested: [],
      },
    });
    await sink.append(terminal('completed'));
    await flush();
    expect(steered).toHaveLength(0);
  });

  it('a non-terminal event from a NON-RUNNING workspace passes through (no sibling read, no steer)', async () => {
    const siblings = vi.fn(async () => null);
    const { sink, inner, steered } = makeSink({ siblings }); // ws_a is 'completed'
    await sink.append({ ...terminal('completed'), type: 'log' });
    await flush();
    expect(inner.append).toHaveBeenCalledTimes(1);
    expect(steered).toHaveLength(0);
    expect(siblings).not.toHaveBeenCalled();
  });

  it('a faulting sibling read never rejects the terminal append', async () => {
    const { sink, inner } = makeSink({
      siblings: async () => {
        throw new Error('compare exploded');
      },
    });
    await expect(sink.append(terminal('completed'))).resolves.toBeUndefined();
    await flush();
    expect(inner.append).toHaveBeenCalledTimes(1);
  });
});

describe('crossedMilestone / progressSnapshotOf', () => {
  it('the FIRST nonzero diff is a milestone; a zero diff never is', () => {
    expect(crossedMilestone(undefined, { files: 1, lines: 2 })).toBe('first_diff');
    expect(crossedMilestone(undefined, { files: 0, lines: 0 })).toBeNull();
    expect(crossedMilestone({ files: 1, lines: 2 }, { files: 0, lines: 0 })).toBeNull();
  });

  it('+5 files or +200 lines SINCE THE LAST BROADCAST re-crosses; less does not', () => {
    const prev = { files: 2, lines: 50 };
    expect(crossedMilestone(prev, { files: 7, lines: 60 })).toBe('files_step');
    expect(crossedMilestone(prev, { files: 3, lines: 250 })).toBe('lines_step');
    expect(crossedMilestone(prev, { files: 6, lines: 249 })).toBeNull();
    // regression (checkpoint restore) is not a milestone
    expect(crossedMilestone(prev, { files: 1, lines: 10 })).toBeNull();
  });

  it('an unreadable diff observes NOTHING (null, never a fabricated 0/0)', () => {
    expect(progressSnapshotOf({})).toBeNull();
    expect(progressSnapshotOf({ changedFiles: ['a.ts'] })).toEqual({ files: 1, lines: 0 });
    expect(
      progressSnapshotOf({ diffStat: { files: 2, additions: 30, deletions: 10 } }),
    ).toEqual({ files: 2, lines: 40 });
  });
});

describe('composeSiblingProgressNote', () => {
  it('composes the one-line coordinate note (top paths + stats, no contents)', () => {
    const note = composeSiblingProgressNote({
      agent: 'claude_code',
      changedFiles: ['src/a.ts', 'src/b.ts'],
      diffStat: { files: 2, additions: 30, deletions: 5 },
    });
    expect(note).toBe(
      '[Recoder] Sibling progress: claude_code is editing src/a.ts, src/b.ts, +30/-5 so far. Coordinate: avoid these files or build on them.',
    );
    expect(note.split('\n')).toHaveLength(1);
  });

  it('caps the paths at 6 with a truthful "+N more" and states unreadable paths', () => {
    const files = Array.from({ length: 9 }, (_, i) => `src/f${i}.ts`);
    const note = composeSiblingProgressNote({ agent: 'codex', changedFiles: files });
    expect(note).toContain('src/f5.ts');
    expect(note).not.toContain('src/f6.ts');
    expect(note).toContain('(+3 more)');
    const unreadable = composeSiblingProgressNote({
      agent: 'codex',
      diffStat: { files: 3, additions: 10, deletions: 2 },
    });
    expect(unreadable).toContain('3 file(s) (paths not readable)');
  });
});

describe('mid-run milestone broadcasts (v2)', () => {
  const T0 = Date.parse('2026-08-04T00:00:00.000Z');

  /**
   * A running ws_a (sender) + running ws_b (receiver) pair with a mutable
   * compare source and a controllable clock — every scenario is a sequence of
   * setSource / tick / emit steps.
   */
  function midRun(
    opts: {
      source?: Partial<SiblingCompareEntry>;
      others?: readonly SiblingCompareEntry[];
      workspaces?: Record<string, Workspace>;
      steer?: HarnessOptions['steer'];
    } = {},
  ) {
    let ms = T0;
    let source = sibling({
      workspaceId: 'ws_a',
      agent: 'claude_code',
      runtimeId: 'claude_code',
      branch: 'recoder/ws_a',
      state: 'running',
      sessionName: 'recoder-ws-a',
      ...opts.source,
    });
    const others = opts.others ?? [sibling()];
    const siblingsCalls = vi.fn(async () => view([source, ...others]));
    const base = makeSink({
      workspaces: opts.workspaces ?? {
        ws_a: ws({ state: 'running' }),
        ws_b: ws({
          workspaceId: 'ws_b',
          taskId: 'task_b',
          runId: 'run_ws_b',
          runtimeId: 'codex',
          state: 'running',
        }),
      },
      siblings: siblingsCalls,
      ...(opts.steer ? { steer: opts.steer } : {}),
      now: () => new Date(ms).toISOString(),
    });
    return {
      ...base,
      siblingsCalls,
      setSource(over: Partial<SiblingCompareEntry>): void {
        source = { ...source, ...over };
      },
      tick(advanceMs: number): void {
        ms += advanceMs;
      },
      async emit(data: Record<string, unknown> = { workspaceId: 'ws_a' }): Promise<void> {
        await base.sink.append({
          eventId: `evt_${ms}_${Math.random()}`,
          type: 'log',
          taskId: 'task_a',
          runId: 'run_ws_a',
          createdAt: new Date(ms).toISOString(),
          data,
        });
        await flush();
      },
      progressNotes(): readonly string[] {
        return base.steered.filter(s => s.keys.includes('Sibling progress')).map(s => s.keys);
      },
      milestones(kind: string): readonly RunEvent[] {
        return base.appended.filter(e => e.data?.milestone === kind);
      },
    };
  }

  it('broadcasts the FIRST nonzero diff with the milestone marker on the evidence', async () => {
    const h = midRun({
      source: { changedFiles: ['src/a.ts'], diffStat: { files: 1, additions: 3, deletions: 1 } },
    });
    await h.emit();
    expect(h.steered).toHaveLength(1);
    expect(h.steered[0]!.workspaceId).toBe('ws_b');
    expect(h.steered[0]!.submit).toBe(true);
    expect(h.steered[0]!.keys).toBe(
      '[Recoder] Sibling progress: claude_code is editing src/a.ts, +3/-1 so far. Coordinate: avoid these files or build on them.',
    );
    const evidence = h.appended.filter(e => e.data?.kind === SIBLING_CONTEXT_DELIVERED);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.type).toBe('log');
    expect(evidence[0]!.taskId).toBe('task_b');
    expect(evidence[0]!.data).toMatchObject({
      milestone: 'first_diff',
      workspaceId: 'ws_b',
      fromWorkspaceId: 'ws_a',
      agent: 'claude_code',
    });
  });

  it('a zero diff is not a milestone (nothing steered)', async () => {
    const h = midRun({
      source: { changedFiles: [], diffStat: { files: 0, additions: 0, deletions: 0 } },
    });
    await h.emit();
    expect(h.steered).toHaveLength(0);
  });

  it('re-broadcasts on +5 files since the last broadcast — not on +3', async () => {
    const h = midRun({
      source: { changedFiles: ['a.ts'], diffStat: { files: 1, additions: 1, deletions: 0 } },
    });
    await h.emit(); // first_diff
    expect(h.progressNotes()).toHaveLength(1);
    h.setSource({
      changedFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
      diffStat: { files: 4, additions: 10, deletions: 0 },
    });
    h.tick(MIDRUN_NOTE_INTERVAL_MS + 1);
    await h.emit(); // +3 files — below the step
    expect(h.progressNotes()).toHaveLength(1);
    h.setSource({
      changedFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'],
      diffStat: { files: 6, additions: 12, deletions: 0 },
    });
    h.tick(MIDRUN_NOTE_INTERVAL_MS + 1);
    await h.emit(); // +5 files since the LAST BROADCAST (1 → 6)
    expect(h.progressNotes()).toHaveLength(2);
    expect(h.milestones('files_step')).toHaveLength(1);
  });

  it('re-broadcasts on +200 changed lines', async () => {
    const h = midRun({
      source: { changedFiles: ['a.ts'], diffStat: { files: 1, additions: 10, deletions: 0 } },
    });
    await h.emit();
    h.setSource({
      changedFiles: ['a.ts', 'b.ts'],
      diffStat: { files: 2, additions: 180, deletions: 40 }, // lines 220 vs 10 broadcast
    });
    h.tick(MIDRUN_NOTE_INTERVAL_MS + 1);
    await h.emit();
    expect(h.progressNotes()).toHaveLength(2);
    expect(h.milestones('lines_step')).toHaveLength(1);
  });

  it('rate-caps a receiver to one mid-run note per 3-minute window', async () => {
    const h = midRun({
      source: { changedFiles: ['a.ts'], diffStat: { files: 1, additions: 1, deletions: 0 } },
    });
    await h.emit();
    expect(h.progressNotes()).toHaveLength(1);
    // a REAL +5-files milestone inside the receiver's window ⇒ capped
    h.setSource({
      changedFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'],
      diffStat: { files: 6, additions: 20, deletions: 0 },
    });
    h.tick(MIDRUN_CHECK_INTERVAL_MS + 1);
    await h.emit();
    expect(h.progressNotes()).toHaveLength(1);
    // the NEXT milestone after the window delivers again
    h.setSource({
      changedFiles: Array.from({ length: 11 }, (_, i) => `f${i}.ts`),
      diffStat: { files: 11, additions: 40, deletions: 0 },
    });
    h.tick(MIDRUN_NOTE_INTERVAL_MS + 1);
    await h.emit();
    expect(h.progressNotes()).toHaveLength(2);
  });

  it('dedupes an identical path set to the same receiver (lines grew, files did not)', async () => {
    const h = midRun({
      source: {
        changedFiles: ['a.ts', 'b.ts'],
        diffStat: { files: 2, additions: 10, deletions: 0 },
      },
    });
    await h.emit();
    expect(h.progressNotes()).toHaveLength(1);
    // +300 lines in the SAME two files: the milestone crosses but the receiver
    // already coordinated on this exact path set — deduped.
    h.setSource({ diffStat: { files: 2, additions: 310, deletions: 0 } });
    h.tick(MIDRUN_NOTE_INTERVAL_MS + 1);
    await h.emit();
    expect(h.progressNotes()).toHaveLength(1);
  });

  it('evicts progress state on the sender terminal — a continue re-fires first_diff', async () => {
    const h = midRun({
      source: { changedFiles: ['a.ts'], diffStat: { files: 1, additions: 1, deletions: 0 } },
    });
    await h.emit();
    expect(h.milestones('first_diff')).toHaveLength(1);
    await h.sink.append(terminal('completed'));
    await flush();
    // continue: running again with the SAME 1-file diff — without eviction this
    // is below every step; with eviction it is a fresh first nonzero diff.
    h.tick(MIDRUN_NOTE_INTERVAL_MS + 1);
    await h.emit();
    expect(h.milestones('first_diff')).toHaveLength(2);
  });

  it('a flag-off sender broadcasts nothing mid-run (sibling read never taken)', async () => {
    const h = midRun({
      workspaces: {
        ws_a: ws({ state: 'running', metadata: { taskGroup: 'grp_1', siblingAwareness: false } }),
        ws_b: ws({ workspaceId: 'ws_b', state: 'running' }),
      },
      source: { changedFiles: ['a.ts'], diffStat: { files: 1, additions: 1, deletions: 0 } },
    });
    await h.emit();
    expect(h.steered).toHaveLength(0);
    expect(h.siblingsCalls).not.toHaveBeenCalled();
  });

  it('skips a flag-off receiver mid-run', async () => {
    const h = midRun({
      workspaces: {
        ws_a: ws({ state: 'running' }),
        ws_b: ws({
          workspaceId: 'ws_b',
          state: 'running',
          metadata: { taskGroup: 'grp_1', siblingAwareness: false },
        }),
      },
      source: { changedFiles: ['a.ts'], diffStat: { files: 1, additions: 1, deletions: 0 } },
    });
    await h.emit();
    expect(h.steered).toHaveLength(0);
  });

  it('swallows a throwing mid-run steer and still delivers to the other sibling', async () => {
    const delivered: string[] = [];
    const h = midRun({
      workspaces: {
        ws_a: ws({ state: 'running' }),
        ws_b: ws({ workspaceId: 'ws_b', taskId: 'task_b', state: 'running' }),
        ws_c: ws({ workspaceId: 'ws_c', taskId: 'task_c', state: 'running' }),
      },
      others: [sibling(), sibling({ workspaceId: 'ws_c', sessionName: 'recoder-ws-c' })],
      source: { changedFiles: ['a.ts'], diffStat: { files: 1, additions: 1, deletions: 0 } },
      steer: async input => {
        if (input.workspaceId === 'ws_b') throw new Error('tmux exploded');
        delivered.push(input.workspaceId);
        return { ok: true };
      },
    });
    await h.emit(); // the append itself never rejects (probe is fire-and-forget)
    expect(delivered).toEqual(['ws_c']);
    const evidence = h.appended.filter(e => e.data?.kind === SIBLING_CONTEXT_DELIVERED);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.data?.workspaceId).toBe('ws_c');
  });

  it('throttles the sibling read: consecutive events inside 30s read once', async () => {
    const h = midRun({
      source: { changedFiles: ['a.ts'], diffStat: { files: 1, additions: 1, deletions: 0 } },
    });
    await h.emit();
    h.tick(1000);
    await h.emit();
    expect(h.siblingsCalls).toHaveBeenCalledTimes(1);
    expect(h.progressNotes()).toHaveLength(1);
  });

  it('resolves the sender from the deterministic runId when data carries no workspaceId', async () => {
    const h = midRun({
      source: { changedFiles: ['a.ts'], diffStat: { files: 1, additions: 1, deletions: 0 } },
    });
    await h.emit({ source: 'tmux' }); // substrate pane-delta shape — no workspaceId
    expect(h.progressNotes()).toHaveLength(1);
  });
});
