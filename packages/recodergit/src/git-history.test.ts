import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCoChangeEdges, parseGitHistoryLog } from './git-history';

test('git history parser keeps NUL-delimited paths grouped by commit', () => {
  const history = '\x1e\0\nsrc/a.ts\0src/b.ts\0\x1e\0\nsrc/b.ts\0src/c.ts\0';
  assert.deepEqual(parseGitHistoryLog(history), [
    ['src/a.ts', 'src/b.ts'],
    ['src/b.ts', 'src/c.ts'],
  ]);
});

test('co-change graph keeps repeated source pairs and ignores sweeping commits', () => {
  const edges = buildCoChangeEdges([
    ['src/a.ts', 'src/b.ts'],
    ['src/a.ts', 'src/b.ts'],
    ['src/a.ts', 'src/c.ts'],
    ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'],
    ['README.md', 'src/a.ts'],
  ], ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'], {
    maxFilesPerCommit: 3,
    minSharedCommits: 2,
  });

  assert.deepEqual(edges, [{
    left: 'src/a.ts',
    right: 'src/b.ts',
    commits: 2,
    confidence: 0.6667,
  }]);
});
