import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lockCoversPath, lockMatchesPath, sameScope } from '../../../src/locks/path-match';
import { makeLock } from './_fixtures';

test('lockCoversPath matches a path under the glob', () => {
  const lock = makeLock({ pathGlob: 'src/**' });
  assert.ok(lockCoversPath(lock, 'src/app/page.tsx'));
  assert.equal(lockCoversPath(lock, 'docs/readme.md'), false);
});

test('a single-star glob does not span directory separators', () => {
  const lock = makeLock({ pathGlob: 'src/*.ts' });
  assert.ok(lockMatchesPath(lock, 'src/index.ts'));
  assert.equal(lockMatchesPath(lock, 'src/app/index.ts'), false);
});

test('sameScope treats undefined repo as empty string', () => {
  const lock = makeLock({ spaceId: 's', repo: undefined });
  assert.ok(sameScope(lock, { spaceId: 's' }));
  assert.ok(sameScope(lock, { spaceId: 's', repo: '' }));
  assert.equal(sameScope(lock, { spaceId: 's', repo: 'r' }), false);
  assert.equal(sameScope(lock, { spaceId: 'other' }), false);
});
