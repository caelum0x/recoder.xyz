/**
 * Herd classification — every conductor workspace maps to exactly one herd
 * status: needs_you (blocked on the operator), working, done, or failed.
 * The mapping is total over WorkspaceState so a new state can never silently
 * disappear from the herd view.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorkspaceState } from '@recoder/agent-os';
import { herdStatus, HERD_STATUS_ORDER } from '../src/classify.js';

const CASES: Record<WorkspaceState, string> = {
  created: 'working',
  setting_up: 'working',
  ready: 'working',
  running: 'working',
  merging: 'working',
  awaiting_approval: 'needs_you',
  awaiting_review: 'needs_you',
  changes_requested: 'needs_you',
  merged: 'done',
  cancelled: 'done',
  archived: 'done',
  failed: 'failed',
};

test('every workspace state maps to its herd status (total mapping)', () => {
  for (const [state, expected] of Object.entries(CASES)) {
    assert.equal(herdStatus(state as WorkspaceState), expected, `state ${state}`);
  }
});

test('status order puts needs_you first (operator attention on top)', () => {
  assert.deepEqual(HERD_STATUS_ORDER, ['needs_you', 'working', 'failed', 'done']);
});
