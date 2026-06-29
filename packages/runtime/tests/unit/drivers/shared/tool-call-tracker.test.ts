import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolCallTracker } from '../../../../src/drivers/shared/tool-call-tracker';
import type { NormalizedToolCall, NormalizedToolResult } from '../../../../src/types/tool-call';

/**
 * The tracker pairs tool-call frames with their results across a driver stream so
 * downstream consumers (events, policy guards) see complete call/result spans and
 * can detect calls left unresolved at the terminal state. It is immutable: every
 * observation returns a new tracker, never mutating the prior one.
 */

const call = (id: string, name = 'read'): NormalizedToolCall => ({
  toolCallId: id,
  toolName: name,
  modes: ['read'],
});

const result = (id: string, ok: boolean, name = 'read'): NormalizedToolResult => ({
  toolCallId: id,
  toolName: name,
  ok,
});

test('empty tracker has no calls', () => {
  const tracker = ToolCallTracker.empty();
  assert.deepEqual(tracker.all(), []);
  assert.deepEqual(tracker.unresolved(), []);
  assert.equal(tracker.get('nope'), undefined);
});

test('observing a call then its result pairs them under one id', () => {
  const tracker = ToolCallTracker.empty()
    .observeCall(call('c1'))
    .observeResult(result('c1', true));

  const paired = tracker.get('c1');
  assert.ok(paired);
  assert.equal(paired.call.toolCallId, 'c1');
  assert.equal(paired.result?.ok, true);
  assert.deepEqual(tracker.unresolved(), []);
});

test('immutability: each observation returns a new tracker, leaving the prior untouched', () => {
  const base = ToolCallTracker.empty();
  const afterCall = base.observeCall(call('c1'));
  const afterResult = afterCall.observeResult(result('c1', true));

  assert.notEqual(base, afterCall);
  assert.notEqual(afterCall, afterResult);
  // The pre-call tracker still sees nothing.
  assert.equal(base.get('c1'), undefined);
  // The post-call (pre-result) tracker still shows the call unresolved.
  assert.equal(afterCall.get('c1')?.result, undefined);
  assert.equal(afterCall.unresolved().length, 1);
});

test('unresolved() lists only calls without a result', () => {
  const tracker = ToolCallTracker.empty()
    .observeCall(call('c1', 'read'))
    .observeCall(call('c2', 'write'))
    .observeResult(result('c1', true, 'read'));

  const unresolved = tracker.unresolved();
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0]?.call.toolCallId, 'c2');
  assert.equal(tracker.all().length, 2);
});

test('a result with no preceding call synthesizes a call shell (no dropped results)', () => {
  const tracker = ToolCallTracker.empty().observeResult(result('orphan', false, 'bash'));
  const paired = tracker.get('orphan');
  assert.ok(paired);
  assert.equal(paired.call.toolCallId, 'orphan');
  assert.equal(paired.call.toolName, 'bash');
  assert.deepEqual(paired.call.modes, []);
  assert.equal(paired.result?.ok, false);
  // It is resolved (has a result), so it is not unresolved.
  assert.deepEqual(tracker.unresolved(), []);
});

test('a late result overwrites the unresolved entry for the same id', () => {
  const tracker = ToolCallTracker.empty()
    .observeCall(call('c1'))
    .observeResult(result('c1', false));
  assert.equal(tracker.get('c1')?.result?.ok, false);
  assert.equal(tracker.unresolved().length, 0);
});
