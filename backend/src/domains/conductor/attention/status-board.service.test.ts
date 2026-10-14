/**
 * `StatusBoardService` — proves the LIVE native status board is truthful (LOOM-ROADMAP.md
 * build-now #5). Drives the service with a FAKE `session.snapshot` (loadPanes) + a FAKE
 * workspace store (no real Loom, no DB):
 *
 *  - each native Loom status maps into the CORRECT attention column
 *    (blocked→awaiting_approval, idle→agent_idle_prompt, done→review_ready, working→working);
 *  - an `unknown`-status pane lands in the `unknown` column and is NOT miscounted as
 *    ready/settled;
 *  - a pane whose Recoder record is missing is DROPPED (never guessed into a column);
 *  - a pane not owned by the caller (owner scope) is DROPPED;
 *  - the taskGroup narrow drops out-of-group panes and carries the group onto in-group cells;
 *  - every column total equals the real length of its column (never fabricated);
 *  - a `session.snapshot` fault ⇒ `degraded:true` + a reason with EMPTY columns (no fake board);
 *  - a per-pane record LOOKUP fault drops only that pane (never degrades the whole board);
 *  - `nativeStatus` is carried as the RAW Loom status STRING per cell.
 */
import { describe, it, expect } from 'vitest';
import type { AgentStatus } from '@recoder/agent-runtimes/loom-client';
import type { Workspace } from '@recoder/agent-os';
import {
  StatusBoardService,
  STATUS_BOARD_COLUMNS,
  type StatusBoardPane,
} from './status-board.service.js';

/** A minimal durable workspace record — only the fields the board reads. */
function workspace(over: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws1',
    runtimeId: 'claude',
    createdBy: 'user-1',
    metadata: {},
    ...over,
  } as unknown as Workspace;
}

function pane(
  workspaceId: string,
  nativeStatus: AgentStatus,
  paneId = `p_${workspaceId}`
): StatusBoardPane {
  return { paneId, workspaceId, nativeStatus };
}

/** Build a service over a fixed pane list + an in-memory workspace store. */
function serviceOf(
  panes: readonly StatusBoardPane[],
  store: Record<string, Workspace | null>,
  onLoad?: () => void
) {
  return new StatusBoardService({
    loadPanes: async () => {
      onLoad?.();
      return panes;
    },
    getWorkspace: async id => store[id] ?? null,
  });
}

describe('StatusBoardService — column mapping', () => {
  it('buckets each native Loom status into the correct attention column', async () => {
    const panes = [
      pane('ws_block', 'blocked'),
      pane('ws_idle', 'idle'),
      pane('ws_done', 'done'),
      pane('ws_work', 'working'),
    ];
    const store: Record<string, Workspace> = {
      ws_block: workspace({ workspaceId: 'ws_block', createdBy: 'user-1' }),
      ws_idle: workspace({ workspaceId: 'ws_idle', createdBy: 'user-1' }),
      ws_done: workspace({ workspaceId: 'ws_done', createdBy: 'user-1' }),
      ws_work: workspace({ workspaceId: 'ws_work', createdBy: 'user-1' }),
    };
    const snap = await serviceOf(panes, store).snapshot({ owner: 'user-1' });

    expect(snap.degraded).toBe(false);
    expect(snap.columns.awaiting_approval.map(c => c.workspaceId)).toEqual(['ws_block']);
    expect(snap.columns.agent_idle_prompt.map(c => c.workspaceId)).toEqual(['ws_idle']);
    expect(snap.columns.review_ready.map(c => c.workspaceId)).toEqual(['ws_done']);
    expect(snap.columns.working.map(c => c.workspaceId)).toEqual(['ws_work']);
    expect(snap.columns.unknown).toEqual([]);
    expect(snap.total).toBe(4);
  });

  it('carries the RAW Loom status STRING (not a boolean) + agent kind on each cell', async () => {
    const store = {
      ws_work: workspace({ workspaceId: 'ws_work', runtimeId: 'codex' }),
    };
    const snap = await serviceOf([pane('ws_work', 'working')], store).snapshot({
      owner: 'user-1',
    });
    const cell = snap.columns.working[0];
    expect(cell.nativeStatus).toBe('working');
    expect(typeof cell.nativeStatus).toBe('string');
    expect(cell.agentKind).toBe('codex');
  });

  it('exposes every attention state as a (possibly empty) column, shape-stable', async () => {
    const snap = await serviceOf([], {}).snapshot({ owner: 'user-1' });
    for (const state of STATUS_BOARD_COLUMNS) {
      expect(snap.columns[state]).toEqual([]);
      expect(snap.totals[state]).toBe(0);
    }
    expect(snap.total).toBe(0);
    expect(snap.degraded).toBe(false);
  });
});

describe('StatusBoardService — truthful unknown handling', () => {
  it('places an unknown-status pane in the unknown column, NOT ready/settled', async () => {
    const panes = [pane('ws_unknown', 'unknown'), pane('ws_done', 'done')];
    const store = {
      ws_unknown: workspace({ workspaceId: 'ws_unknown' }),
      ws_done: workspace({ workspaceId: 'ws_done' }),
    };
    const snap = await serviceOf(panes, store).snapshot({ owner: 'user-1' });

    expect(snap.columns.unknown.map(c => c.workspaceId)).toEqual(['ws_unknown']);
    // The unknown pane is NOT folded into any settle column.
    expect(snap.columns.review_ready.map(c => c.workspaceId)).toEqual(['ws_done']);
    expect(snap.columns.agent_idle_prompt).toEqual([]);
    // Truthful counts: the unknown pane counts only toward the unknown column + total.
    expect(snap.totals.unknown).toBe(1);
    expect(snap.totals.review_ready).toBe(1);
    expect(snap.total).toBe(2);
  });
});

describe('StatusBoardService — attribution + scoping (drops, never guesses)', () => {
  it('drops a pane whose Recoder record is missing (never guessed into a column)', async () => {
    const panes = [pane('ws_known', 'working'), pane('ws_ghost', 'blocked')];
    const store = { ws_known: workspace({ workspaceId: 'ws_known' }) };
    const snap = await serviceOf(panes, store).snapshot({ owner: 'user-1' });

    expect(snap.columns.working.map(c => c.workspaceId)).toEqual(['ws_known']);
    // The unattributable pane appears in NO column.
    expect(snap.columns.awaiting_approval).toEqual([]);
    expect(snap.total).toBe(1);
  });

  it('drops a pane not owned by the caller (owner scope)', async () => {
    const panes = [pane('ws_mine', 'blocked'), pane('ws_theirs', 'blocked')];
    const store = {
      ws_mine: workspace({ workspaceId: 'ws_mine', createdBy: 'user-1' }),
      ws_theirs: workspace({ workspaceId: 'ws_theirs', createdBy: 'user-2' }),
    };
    const snap = await serviceOf(panes, store).snapshot({ owner: 'user-1' });

    expect(snap.columns.awaiting_approval.map(c => c.workspaceId)).toEqual(['ws_mine']);
    expect(snap.total).toBe(1);
  });

  it('an admin/unscoped read (no owner) sees panes across subjects', async () => {
    const panes = [pane('ws_mine', 'blocked'), pane('ws_theirs', 'done')];
    const store = {
      ws_mine: workspace({ workspaceId: 'ws_mine', createdBy: 'user-1' }),
      ws_theirs: workspace({ workspaceId: 'ws_theirs', createdBy: 'user-2' }),
    };
    const snap = await serviceOf(panes, store).snapshot({});
    expect(snap.total).toBe(2);
    expect(snap.columns.awaiting_approval.map(c => c.workspaceId)).toEqual(['ws_mine']);
    expect(snap.columns.review_ready.map(c => c.workspaceId)).toEqual(['ws_theirs']);
  });

  it('narrows by task group and carries the group onto in-group cells only', async () => {
    const panes = [
      pane('ws_g1', 'working'),
      pane('ws_g2', 'working'),
      pane('ws_none', 'working'),
    ];
    const store = {
      ws_g1: workspace({ workspaceId: 'ws_g1', metadata: { taskGroup: 'g1' } }),
      ws_g2: workspace({ workspaceId: 'ws_g2', metadata: { taskGroup: 'g2' } }),
      ws_none: workspace({ workspaceId: 'ws_none', metadata: {} }),
    };
    const snap = await serviceOf(panes, store).snapshot({
      owner: 'user-1',
      taskGroup: 'g1',
    });

    expect(snap.columns.working.map(c => c.workspaceId)).toEqual(['ws_g1']);
    expect(snap.columns.working[0].taskGroup).toBe('g1');
    expect(snap.total).toBe(1);
  });

  it('omits taskGroup on an ungrouped pane (present only when the pane has a group)', async () => {
    const store = {
      ws_solo: workspace({ workspaceId: 'ws_solo', metadata: {} }),
    };
    const snap = await serviceOf([pane('ws_solo', 'working')], store).snapshot({
      owner: 'user-1',
    });
    expect('taskGroup' in snap.columns.working[0]).toBe(false);
  });
});

describe('StatusBoardService — truthful degrade', () => {
  it('degrades (never a fake empty board) when session.snapshot faults', async () => {
    const service = new StatusBoardService({
      loadPanes: async () => {
        throw new Error('socket boom');
      },
      getWorkspace: async () => workspace(),
    });
    const snap = await service.snapshot({ owner: 'user-1' });

    expect(snap.degraded).toBe(true);
    expect(snap.reason).toMatch(/session\.snapshot unavailable/i);
    expect(snap.reason).toMatch(/socket boom/i);
    // EVERY column is empty + zero — no fabricated board.
    for (const state of STATUS_BOARD_COLUMNS) {
      expect(snap.columns[state]).toEqual([]);
      expect(snap.totals[state]).toBe(0);
    }
    expect(snap.total).toBe(0);
  });

  it('a per-pane record lookup fault drops only that pane (board stays live)', async () => {
    const panes = [pane('ws_ok', 'working'), pane('ws_boom', 'blocked')];
    const service = new StatusBoardService({
      loadPanes: async () => panes,
      getWorkspace: async id => {
        if (id === 'ws_boom') throw new Error('db hiccup');
        return workspace({ workspaceId: id });
      },
    });
    const snap = await service.snapshot({ owner: 'user-1' });

    expect(snap.degraded).toBe(false);
    expect(snap.columns.working.map(c => c.workspaceId)).toEqual(['ws_ok']);
    expect(snap.columns.awaiting_approval).toEqual([]);
    expect(snap.total).toBe(1);
  });
});
