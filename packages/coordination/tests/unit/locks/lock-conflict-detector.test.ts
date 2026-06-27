import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findConflicts, hasConflict } from '../../../src/locks/lock-conflict-detector';
import { makeLock } from './_fixtures';

test('no conflict across different spaces', () => {
  const active = [makeLock({ spaceId: 'space-1', pathGlob: 'src/**' })];
  const conflicts = findConflicts(active, {
    spaceId: 'space-2',
    pathGlob: 'src/**',
    ownerAgentId: 'agent-b',
    taskId: 'task-2',
  });
  assert.equal(conflicts.length, 0);
});

test('no conflict across different repos in the same space', () => {
  const active = [makeLock({ spaceId: 'space-1', repo: 'repo-a', pathGlob: 'src/**' })];
  const conflicts = findConflicts(active, {
    spaceId: 'space-1',
    repo: 'repo-b',
    pathGlob: 'src/**',
    ownerAgentId: 'agent-b',
    taskId: 'task-2',
  });
  assert.equal(conflicts.length, 0);
});

test('overlapping globs from another owner conflict', () => {
  const active = [makeLock({ lockId: 'held', pathGlob: 'src/**' })];
  const conflicts = findConflicts(active, {
    spaceId: 'space-1',
    pathGlob: 'src/app/page.tsx',
    ownerAgentId: 'agent-b',
    taskId: 'task-2',
  });
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.existing.lockId, 'held');
  assert.equal(conflicts[0]?.requestedPathGlob, 'src/app/page.tsx');
});

test('two shared locks never conflict even when globs overlap', () => {
  const active = [makeLock({ pathGlob: 'src/**', kind: 'shared', ownerAgentId: 'agent-a', taskId: 'task-1' })];
  const conflicts = findConflicts(active, {
    spaceId: 'space-1',
    pathGlob: 'src/**',
    ownerAgentId: 'agent-b',
    taskId: 'task-2',
    kind: 'shared',
  });
  assert.equal(conflicts.length, 0);
});

test('shared vs exclusive overlap conflicts and is classified exclusive', () => {
  const active = [makeLock({ pathGlob: 'src/**', kind: 'shared', ownerAgentId: 'agent-a', taskId: 'task-1' })];
  const conflicts = findConflicts(active, {
    spaceId: 'space-1',
    pathGlob: 'src/**',
    ownerAgentId: 'agent-b',
    taskId: 'task-2',
    kind: 'exclusive',
  });
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.kind, 'exclusive');
});

test('two exclusive overlapping locks are classified exclusive', () => {
  const active = [makeLock({ pathGlob: 'src/**', kind: 'exclusive' })];
  const conflicts = findConflicts(active, {
    spaceId: 'space-1',
    pathGlob: 'src/lib/**',
    ownerAgentId: 'agent-b',
    taskId: 'task-2',
    kind: 'exclusive',
  });
  assert.equal(conflicts[0]?.kind, 'exclusive');
});

test('disjoint globs do not conflict', () => {
  const active = [makeLock({ pathGlob: 'src/**' })];
  assert.equal(
    hasConflict(active, {
      spaceId: 'space-1',
      pathGlob: 'docs/**',
      ownerAgentId: 'agent-b',
      taskId: 'task-2',
    }),
    false,
  );
});
