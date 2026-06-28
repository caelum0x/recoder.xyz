/**
 * observe/delta tests (design §11) — the prefix-diff + cap promoted from the
 * backend run-tailer. Pure: previous + current strings in, the trimmed/capped
 * new-suffix out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDelta, MAX_DELTA_CHARS } from '../../src/observe/index.js';

test('extending the previous capture yields only the new suffix, trimmed', () => {
  const r = computeDelta('hello', 'hello world\n', MAX_DELTA_CHARS);
  assert.equal(r.delta, 'world');
  assert.equal(r.truncated, false);
});

test('a changed prefix yields the whole current capture (trimmed)', () => {
  const r = computeDelta('aaa', 'totally different\n', MAX_DELTA_CHARS);
  assert.equal(r.delta, 'totally different');
  assert.equal(r.truncated, false);
});

test('a whitespace-only delta is reported as empty (nothing to emit)', () => {
  const r = computeDelta('done', 'done\n   \n', MAX_DELTA_CHARS);
  assert.equal(r.delta, '');
  assert.equal(r.truncated, false);
});

test('identical capture yields an empty delta', () => {
  const r = computeDelta('same', 'same', MAX_DELTA_CHARS);
  assert.equal(r.delta, '');
});

test('a delta longer than the cap is truncated to the LAST maxChars', () => {
  const previous = '';
  const current = 'X'.repeat(20) + 'TAIL';
  const r = computeDelta(previous, current, 4);
  assert.equal(r.truncated, true);
  assert.equal(r.delta.length, 4);
  assert.equal(r.delta, 'TAIL', 'keeps the most recent output');
});

test('default cap is 8000 characters', () => {
  assert.equal(MAX_DELTA_CHARS, 8000);
  const current = 'Y'.repeat(MAX_DELTA_CHARS + 100);
  const r = computeDelta('', current);
  assert.equal(r.truncated, true);
  assert.equal(r.delta.length, MAX_DELTA_CHARS);
});
