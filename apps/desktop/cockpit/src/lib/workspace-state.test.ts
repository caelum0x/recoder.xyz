/**
 * Unit tests for workspace-state.ts — pure presentation/gating helpers and the
 * lock-conflict deriver. Real inputs only; no mocks needed.
 */
import { describe, expect, it } from 'vitest';
import type { Workspace, WorkspaceState } from '../types';
import {
  BOARD_COLUMNS,
  canArchive,
  canMerge,
  canOpenPr,
  canViewDiff,
  isLive,
  lockConflict,
  stateLabel,
  statePill,
  stateTone,
} from './workspace-state';

const ALL_STATES: WorkspaceState[] = [
  'created',
  'setting_up',
  'ready',
  'running',
  'awaiting_approval',
  'awaiting_review',
  'changes_requested',
  'merging',
  'merged',
  'failed',
  'cancelled',
  'archived',
];

describe('stateTone', () => {
  it('maps each known state to its tone', () => {
    expect(stateTone('running')).toBe('active');
    expect(stateTone('merged')).toBe('good');
    expect(stateTone('failed')).toBe('bad');
    expect(stateTone('awaiting_review')).toBe('warn');
    expect(stateTone('setting_up')).toBe('progress');
    expect(stateTone('created')).toBe('neutral');
  });

  it('returns a tone for every defined state', () => {
    for (const state of ALL_STATES) {
      expect(typeof stateTone(state)).toBe('string');
      expect(stateTone(state).length).toBeGreaterThan(0);
    }
  });

  it('falls back to neutral for an unknown state', () => {
    expect(stateTone('totally_unknown' as WorkspaceState)).toBe('neutral');
  });
});

describe('stateLabel', () => {
  it('replaces underscores with spaces', () => {
    expect(stateLabel('awaiting_review')).toBe('awaiting review');
    expect(stateLabel('changes_requested')).toBe('changes requested');
    expect(stateLabel('running')).toBe('running');
  });
});

describe('statePill', () => {
  it('maps lifecycle states to the Conductor desktop copy', () => {
    expect(statePill('running')).toBe('Running');
    expect(statePill('awaiting_review')).toBe('Ready to review');
    expect(statePill('merged')).toBe('Merged');
    expect(statePill('failed')).toBe('Failed');
    expect(statePill('ready')).toBe('Ready');
  });

  it('renders "Merge conflicts" when a write-lock collision is detected', () => {
    expect(statePill('failed', true)).toBe('Merge conflicts');
    // The collision flag overrides whatever the raw state would say.
    expect(statePill('running', true)).toBe('Merge conflicts');
  });

  it('returns a non-empty pill for every defined state', () => {
    for (const state of ALL_STATES) {
      expect(statePill(state).length).toBeGreaterThan(0);
    }
  });
});

describe('action gating', () => {
  it('canViewDiff only once work exists (running onward)', () => {
    expect(canViewDiff('running')).toBe(true);
    expect(canViewDiff('awaiting_review')).toBe(true);
    expect(canViewDiff('merging')).toBe(true);
    expect(canViewDiff('created')).toBe(false);
    expect(canViewDiff('ready')).toBe(false);
    expect(canViewDiff('merged')).toBe(false);
  });

  it('canOpenPr while there is a live worktree to push', () => {
    expect(canOpenPr('running')).toBe(true);
    expect(canOpenPr('awaiting_review')).toBe(true);
    expect(canOpenPr('changes_requested')).toBe(true);
    expect(canOpenPr('merging')).toBe(false);
    expect(canOpenPr('created')).toBe(false);
  });

  it('canMerge only in awaiting_review', () => {
    expect(canMerge('awaiting_review')).toBe(true);
    for (const state of ALL_STATES.filter((s) => s !== 'awaiting_review')) {
      expect(canMerge(state)).toBe(false);
    }
  });

  it('canArchive from any state except archived', () => {
    expect(canArchive('archived')).toBe(false);
    for (const state of ALL_STATES.filter((s) => s !== 'archived')) {
      expect(canArchive(state)).toBe(true);
    }
  });

  it('isLive is false only for terminal states', () => {
    const terminal: WorkspaceState[] = ['merged', 'failed', 'cancelled', 'archived'];
    for (const state of terminal) expect(isLive(state)).toBe(false);
    for (const state of ALL_STATES.filter((s) => !terminal.includes(s))) {
      expect(isLive(state)).toBe(true);
    }
  });
});

describe('BOARD_COLUMNS', () => {
  it('covers every workspace state exactly once across all columns', () => {
    const covered = BOARD_COLUMNS.flatMap((c) => c.states);
    expect(covered.slice().sort()).toEqual(ALL_STATES.slice().sort());
    // No state appears in two columns.
    expect(new Set(covered).size).toBe(covered.length);
  });
});

type LockMeta = Pick<Workspace, 'state' | 'metadata'>;

describe('lockConflict', () => {
  it('returns null when the workspace is not failed', () => {
    const ws: LockMeta = {
      state: 'running',
      metadata: { error: 'write-lock conflict: src/** held by workspace w-other' },
    };
    expect(lockConflict(ws)).toBeNull();
  });

  it('returns null for a failed workspace with no metadata', () => {
    expect(lockConflict({ state: 'failed', metadata: undefined })).toBeNull();
  });

  it('returns null for a failed workspace whose error is unrelated', () => {
    const ws: LockMeta = {
      state: 'failed',
      metadata: { error: 'git clone failed: repository not found' },
    };
    expect(lockConflict(ws)).toBeNull();
  });

  it('derives a conflict from the canonical error message prefix', () => {
    const ws: LockMeta = {
      state: 'failed',
      metadata: { error: 'write-lock conflict: src/** held by workspace w-other' },
    };
    const result = lockConflict(ws);
    expect(result).not.toBeNull();
    expect(result?.message).toBe('write-lock conflict: src/** held by workspace w-other');
    expect(result?.conflicts).toEqual([]);
  });

  it('is case-insensitive on the message prefix', () => {
    const ws: LockMeta = {
      state: 'failed',
      metadata: { error: 'Write-Lock Conflict: overlapping scope' },
    };
    expect(lockConflict(ws)).not.toBeNull();
  });

  it('derives a conflict from the structured lockConflicts array, mapping fields', () => {
    const ws: LockMeta = {
      state: 'failed',
      metadata: {
        error: 'write-lock conflict: blocked',
        lockConflicts: [
          { lockId: 'lock-1', ownerAgentId: 'w-owner', taskId: 't-9', pathGlob: 'src/**' },
        ],
      },
    };
    const result = lockConflict(ws);
    expect(result?.conflicts).toEqual([
      { lockId: 'lock-1', ownerAgentId: 'w-owner', taskId: 't-9', pathGlob: 'src/**' },
    ]);
  });

  it('derives a conflict from the structured array even without the message prefix', () => {
    const ws: LockMeta = {
      state: 'failed',
      metadata: {
        lockConflicts: [{ lockId: 'lock-2', pathGlob: 'lib/**' }],
      },
    };
    const result = lockConflict(ws);
    expect(result).not.toBeNull();
    // Falls back to a synthesized message when the raw error is absent.
    expect(result?.message).toContain('write-lock conflict');
    expect(result?.conflicts).toEqual([
      { lockId: 'lock-2', ownerAgentId: undefined, taskId: undefined, pathGlob: 'lib/**' },
    ]);
  });

  it('drops non-string fields in lockConflicts entries to undefined', () => {
    const ws: LockMeta = {
      state: 'failed',
      metadata: {
        error: 'write-lock conflict: mixed',
        lockConflicts: [{ lockId: 42, ownerAgentId: null, taskId: 't-1', pathGlob: undefined }],
      },
    };
    const result = lockConflict(ws);
    expect(result?.conflicts).toEqual([
      { lockId: undefined, ownerAgentId: undefined, taskId: 't-1', pathGlob: undefined },
    ]);
  });

  it('ignores a non-array lockConflicts value', () => {
    const ws: LockMeta = {
      state: 'failed',
      metadata: { error: 'write-lock conflict: x', lockConflicts: 'not-an-array' },
    };
    const result = lockConflict(ws);
    expect(result?.conflicts).toEqual([]);
  });
});
