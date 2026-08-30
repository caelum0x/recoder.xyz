import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDependencyGraph } from './dependency-graph';
import {
  createDependencyGraphSnapshot,
  restoreDependencyGraphSnapshot,
} from './graph-snapshot';

test('dependency graph snapshot round-trips through compact node-index edges', () => {
  const graph = buildDependencyGraph(
    '/work/repo',
    ['src/a.ts', 'src/b.ts'],
    [
      { from: 'src/a.ts', to: 'src/b.ts' },
      { from: 'src/a.ts', to: 'src/b.ts' },
    ],
    '2026-08-30T12:00:00.000Z',
    {
      symbols: [
        { filePath: 'src/a.ts', name: 'run', kind: 'function' },
        { filePath: 'src/b.ts', name: 'work', kind: 'function' },
      ],
      symbolCalls: [{
        from: 'src/a.ts',
        to: 'src/b.ts',
        caller: 'run',
        callee: 'work',
        confidence: 1,
      }],
      processes: [{
        id: 'server:src/a.ts',
        label: 'Server src/a.ts',
        processType: 'server',
        filePath: 'src/a.ts',
      }],
      coChanges: [{
        left: 'src/a.ts',
        right: 'src/b.ts',
        commits: 4,
        confidence: 0.8,
      }],
      externalImports: [{ from: 'src/a.ts', ecosystem: 'npm', specifier: '@acme/shared' }],
      packages: [{
        ecosystem: 'npm',
        name: '@acme/provider',
        root: '',
        importNames: ['@acme/provider'],
      }],
    },
  );
  const snapshot = createDependencyGraphSnapshot(graph, 'abc123');

  assert.deepEqual(snapshot.edges, [[0, 1, 'imports', 2]]);
  assert.deepEqual(snapshot.symbolCalls, [[0, 1, 'run', 'work']]);
  assert.deepEqual(snapshot.coChanges, [[0, 1, 4, 0.8]]);
  assert.deepEqual(snapshot.externalImports, [[0, 'npm', '@acme/shared']]);
  assert.deepEqual(
    restoreDependencyGraphSnapshot(snapshot, { repoRoot: '/work/repo', revision: 'abc123' }),
    graph,
  );
});

test('dependency graph snapshot rejects a stale revision, another repo, and corrupt edges', () => {
  const graph = buildDependencyGraph('/work/repo', ['src/a.ts'], [], '2026-08-30T12:00:00.000Z');
  const snapshot = createDependencyGraphSnapshot(graph, 'abc123');

  assert.equal(
    restoreDependencyGraphSnapshot(snapshot, { repoRoot: '/work/repo', revision: 'def456' }),
    null,
  );
  assert.equal(
    restoreDependencyGraphSnapshot(snapshot, { repoRoot: '/work/other', revision: 'abc123' }),
    null,
  );
  assert.equal(
    restoreDependencyGraphSnapshot({ ...snapshot, analyzerVersion: 0 }, {
      repoRoot: '/work/repo',
      revision: 'abc123',
    }),
    null,
  );
  assert.equal(
    restoreDependencyGraphSnapshot({ ...snapshot, edges: [[0, 2, 'imports']] }, {
      repoRoot: '/work/repo',
      revision: 'abc123',
    }),
    null,
  );
});
