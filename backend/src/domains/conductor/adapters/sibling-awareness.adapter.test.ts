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
  SIBLING_CONTEXT_DELIVERED,
  composeSiblingNote,
  createSiblingAwarenessSink,
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
    now: () => '2026-08-04T00:00:00.000Z',
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

  it('non-terminal events pass through untouched (no reads, no steers)', async () => {
    const siblings = vi.fn(async () => null);
    const { sink, inner, steered } = makeSink({ siblings });
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
