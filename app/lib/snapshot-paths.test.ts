import { test, expect } from 'vitest';
import {
  ancestorDirectories,
  coerceDirectories,
  coerceFiles,
  isUnderPrefix,
  mergeSnapshotState,
  renamePath,
} from './snapshot-paths';

test('coerceFiles keeps only string values', () => {
  expect(coerceFiles({ 'a.ts': 'x', 'b.ts': 1, 'c.ts': null, 'd.ts': 'y' })).toEqual({
    'a.ts': 'x',
    'd.ts': 'y',
  });
});

test('coerceFiles collapses non-objects and arrays to {}', () => {
  expect(coerceFiles(null)).toEqual({});
  expect(coerceFiles(undefined)).toEqual({});
  expect(coerceFiles('nope')).toEqual({});
  expect(coerceFiles(['a', 'b'])).toEqual({});
});

test('coerceDirectories de-dupes, drops blanks, and sorts', () => {
  expect(coerceDirectories(['src', 'src', '  ', '', 'lib', 3, null])).toEqual(['lib', 'src']);
  expect(coerceDirectories('not-an-array')).toEqual([]);
});

test('ancestorDirectories returns shallow→deep prefixes, no blanks', () => {
  expect(ancestorDirectories('src/components/Button.tsx')).toEqual(['src', 'src/components']);
  expect(ancestorDirectories('index.ts')).toEqual([]);
  // Leading/trailing slashes must never yield an empty ('') directory.
  expect(ancestorDirectories('/src/a.ts')).toEqual(['src']);
  expect(ancestorDirectories('a//b/c.ts')).toEqual(['a', 'a/b']);
});

test('isUnderPrefix matches the prefix itself and its subtree only', () => {
  expect(isUnderPrefix('src', 'src')).toBe(true);
  expect(isUnderPrefix('src/a.ts', 'src')).toBe(true);
  // Must not match a sibling that merely shares the prefix string.
  expect(isUnderPrefix('srcother/a.ts', 'src')).toBe(false);
});

test('renamePath rewrites subtree and leaves others untouched', () => {
  expect(renamePath('src/a.ts', 'src', 'lib')).toBe('lib/a.ts');
  expect(renamePath('src', 'src', 'lib')).toBe('lib');
  expect(renamePath('other/a.ts', 'src', 'lib')).toBe('other/a.ts');
  expect(renamePath('srcother/a.ts', 'src', 'lib')).toBe('srcother/a.ts');
});

test('mergeSnapshotState registers ALL ancestor directories of nested files (regression)', () => {
  const result = mergeSnapshotState(null, {
    files: { 'src/components/ui/Button.tsx': 'export {}' },
  });
  expect(result.files).toEqual({ 'src/components/ui/Button.tsx': 'export {}' });
  // Previously only the immediate parent (src/components/ui) was registered,
  // leaving src and src/components missing from the tree.
  expect(result.directories).toEqual(['src', 'src/components', 'src/components/ui']);
});

test('mergeSnapshotState upserts over existing files and merges directories', () => {
  const result = mergeSnapshotState(
    { files: { 'a.ts': 'old' }, directories: ['existing'] },
    { files: { 'a.ts': 'new', 'pkg/b.ts': 'b' } },
  );
  expect(result.files['a.ts']).toBe('new');
  expect(result.files['pkg/b.ts']).toBe('b');
  expect(result.directories).toEqual(['existing', 'pkg']);
});

test('mergeSnapshotState removePaths drops a single file but keeps directories', () => {
  const result = mergeSnapshotState(
    { files: { 'src/a.ts': 'a', 'src/b.ts': 'b' }, directories: ['src'] },
    { removePaths: ['src/a.ts'] },
  );
  expect(Object.keys(result.files)).toEqual(['src/b.ts']);
  expect(result.directories).toEqual(['src']);
});

test('mergeSnapshotState removePathPrefixes drops files and directories in subtree', () => {
  const result = mergeSnapshotState(
    {
      files: { 'src/a.ts': 'a', 'src/nested/b.ts': 'b', 'keep.ts': 'k' },
      directories: ['src', 'src/nested', 'other'],
    },
    { removePathPrefixes: ['src'] },
  );
  expect(Object.keys(result.files).sort()).toEqual(['keep.ts']);
  expect(result.directories).toEqual(['other']);
});

test('mergeSnapshotState renamePaths rewrites files and directories', () => {
  const result = mergeSnapshotState(
    {
      files: { 'src/a.ts': 'a', 'src/nested/b.ts': 'b' },
      directories: ['src', 'src/nested'],
    },
    { renamePaths: [{ from: 'src', to: 'app' }] },
  );
  expect(Object.keys(result.files).sort()).toEqual(['app/a.ts', 'app/nested/b.ts']);
  expect(result.directories).toEqual(['app', 'app/nested']);
});

test('mergeSnapshotState applies addDirectories and removeDirectories last', () => {
  const result = mergeSnapshotState(
    { files: {}, directories: ['keep'] },
    { addDirectories: ['added', ''], removeDirectories: ['keep'] },
  );
  // Empty-string directory entries are ignored; explicit removal wins.
  expect(result.directories).toEqual(['added']);
});

test('mergeSnapshotState is immutable: does not mutate the existing state', () => {
  const existing = { files: { 'a.ts': 'a' }, directories: ['src'] };
  const result = mergeSnapshotState(existing, { files: { 'b.ts': 'b' } });
  expect(existing.files, 'existing.files must be untouched').toEqual({ 'a.ts': 'a' });
  expect(existing.directories, 'existing.directories must be untouched').toEqual(['src']);
  expect(result.files).not.toBe(existing.files);
});
