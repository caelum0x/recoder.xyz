import { test } from 'node:test';
import assert from 'node:assert/strict';

import { globsContend, globsOverlap, locksContend } from '../../../src/locks/glob-overlap';
import { makeLock } from './_fixtures';

test('identical globs overlap', () => {
  assert.ok(globsOverlap('src/**', 'src/**'));
});

test('a parent root contains a child glob', () => {
  assert.ok(globsOverlap('src/**', 'src/app/**'));
  assert.ok(globsOverlap('src/app/**', 'src/**'));
});

test('the catch-all overlaps everything', () => {
  assert.ok(globsOverlap('**/*', 'anything/at/all'));
});

test('disjoint roots do not overlap', () => {
  assert.equal(globsOverlap('src/**', 'docs/**'), false);
});

test('globsContend respects shared/exclusive kinds', () => {
  assert.equal(globsContend('src/**', 'shared', 'src/**', 'shared'), false);
  assert.ok(globsContend('src/**', 'shared', 'src/**', 'exclusive'));
  assert.ok(globsContend('src/**', 'exclusive', 'src/**', 'exclusive'));
  assert.equal(globsContend('src/**', 'exclusive', 'docs/**', 'exclusive'), false);
});

test('locksContend: two shared overlapping locks do not contend', () => {
  const a = makeLock({ pathGlob: 'src/**', kind: 'shared' });
  const b = makeLock({ pathGlob: 'src/**', kind: 'shared' });
  assert.equal(locksContend(a, b), false);
});

test('locksContend: exclusive + overlapping contends', () => {
  const a = makeLock({ pathGlob: 'src/**', kind: 'exclusive' });
  const b = makeLock({ pathGlob: 'src/app/**', kind: 'shared' });
  assert.ok(locksContend(a, b));
});
