import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ancestorDirectories,
  coerceDirectories,
  coerceFiles,
  isUnderPrefix,
  mergeSnapshotState,
  renamePath,
} from './snapshot-paths.ts';

test('coerceFiles keeps only string values', () => {
  assert.deepEqual(
    coerceFiles({ 'a.ts': 'x', 'b.ts': 1, 'c.ts': null, 'd.ts': 'y' }),
    { 'a.ts': 'x', 'd.ts': 'y' },
  );
});

test('coerceFiles collapses non-objects and arrays to {}', () => {
  assert.deepEqual(coerceFiles(null), {});
  assert.deepEqual(coerceFiles(undefined), {});
  assert.deepEqual(coerceFiles('nope'), {});
  assert.deepEqual(coerceFiles(['a', 'b']), {});
});

test('coerceDirectories de-dupes, drops blanks, and sorts', () => {
  assert.deepEqual(
    coerceDirectories(['src', 'src', '  ', '', 'lib', 3, null]),
    ['lib', 'src'],
  );
  assert.deepEqual(coerceDirectories('not-an-array'), []);
});

test('ancestorDirectories returns shallow→deep prefixes, no blanks', () => {
  assert.deepEqual(ancestorDirectories('src/components/Button.tsx'), [
    'src',
    'src/components',
  ]);
  assert.deepEqual(ancestorDirectories('index.ts'), []);
  // Leading/trailing slashes must never yield an empty ('') directory.
  assert.deepEqual(ancestorDirectories('/src/a.ts'), ['src']);
  assert.deepEqual(ancestorDirectories('a//b/c.ts'), ['a', 'a/b']);
});

test('isUnderPrefix matches the prefix itself and its subtree only', () => {
  assert.equal(isUnderPrefix('src', 'src'), true);
  assert.equal(isUnderPrefix('src/a.ts', 'src'), true);
  // Must not match a sibling that merely shares the prefix string.
  assert.equal(isUnderPrefix('srcother/a.ts', 'src'), false);
});

test('renamePath rewrites subtree and leaves others untouched', () => {
  assert.equal(renamePath('src/a.ts', 'src', 'lib'), 'lib/a.ts');
  assert.equal(renamePath('src', 'src', 'lib'), 'lib');
  assert.equal(renamePath('other/a.ts', 'src', 'lib'), 'other/a.ts');
  assert.equal(renamePath('srcother/a.ts', 'src', 'lib'), 'srcother/a.ts');
});

test('mergeSnapshotState registers ALL ancestor directories of nested files (regression)', () => {
  const result = mergeSnapshotState(null, {
    files: { 'src/components/ui/Button.tsx': 'export {}' },
  });
  assert.deepEqual(result.files, { 'src/components/ui/Button.tsx': 'export {}' });
  // Previously only the immediate parent (src/components/ui) was registered,
  // leaving src and src/components missing from the tree.
  assert.deepEqual(result.directories, ['src', 'src/components', 'src/components/ui']);
});

test('mergeSnapshotState upserts over existing files and merges directories', () => {
  const result = mergeSnapshotState(
    { files: { 'a.ts': 'old' }, directories: ['existing'] },
    { files: { 'a.ts': 'new', 'pkg/b.ts': 'b' } },
  );
  assert.equal(result.files['a.ts'], 'new');
  assert.equal(result.files['pkg/b.ts'], 'b');
  assert.deepEqual(result.directories, ['existing', 'pkg']);
});

test('mergeSnapshotState removePaths drops a single file but keeps directories', () => {
  const result = mergeSnapshotState(
    { files: { 'src/a.ts': 'a', 'src/b.ts': 'b' }, directories: ['src'] },
    { removePaths: ['src/a.ts'] },
  );
  assert.deepEqual(Object.keys(result.files), ['src/b.ts']);
  assert.deepEqual(result.directories, ['src']);
});

test('mergeSnapshotState removePathPrefixes drops files and directories in subtree', () => {
  const result = mergeSnapshotState(
    {
      files: { 'src/a.ts': 'a', 'src/nested/b.ts': 'b', 'keep.ts': 'k' },
      directories: ['src', 'src/nested', 'other'],
    },
    { removePathPrefixes: ['src'] },
  );
  assert.deepEqual(Object.keys(result.files).sort(), ['keep.ts']);
  assert.deepEqual(result.directories, ['other']);
});

test('mergeSnapshotState renamePaths rewrites files and directories', () => {
  const result = mergeSnapshotState(
    {
      files: { 'src/a.ts': 'a', 'src/nested/b.ts': 'b' },
      directories: ['src', 'src/nested'],
    },
    { renamePaths: [{ from: 'src', to: 'app' }] },
  );
  assert.deepEqual(Object.keys(result.files).sort(), ['app/a.ts', 'app/nested/b.ts']);
  assert.deepEqual(result.directories, ['app', 'app/nested']);
});

test('mergeSnapshotState applies addDirectories and removeDirectories last', () => {
  const result = mergeSnapshotState(
    { files: {}, directories: ['keep'] },
    { addDirectories: ['added', ''], removeDirectories: ['keep'] },
  );
  // Empty-string directory entries are ignored; explicit removal wins.
  assert.deepEqual(result.directories, ['added']);
});

test('mergeSnapshotState is immutable: does not mutate the existing state', () => {
  const existing = { files: { 'a.ts': 'a' }, directories: ['src'] };
  const result = mergeSnapshotState(existing, { files: { 'b.ts': 'b' } });
  assert.deepEqual(existing.files, { 'a.ts': 'a' }, 'existing.files must be untouched');
  assert.deepEqual(existing.directories, ['src'], 'existing.directories must be untouched');
  assert.notEqual(result.files, existing.files);
});
