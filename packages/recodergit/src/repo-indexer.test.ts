import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import type { TaskSpec } from '@recoder/agent-os';
import { computeImpact, dependentsOf } from './impact';
import { createRepoIndexer } from './repo-indexer';
import { scanRepo } from './repo-scan';
import { buildOwnershipMap, parseCodeowners } from './ownership';

/**
 * Build a small but realistic fixture repo on disk:
 *
 *   src/a.ts      imports ./b and ./c
 *   src/b.ts      imports ./util (and 'react' — external, must be ignored)
 *   src/c.ts      requires ./util
 *   src/util.ts   leaf
 *   src/d.ts      imports nothing internal
 *
 * Expected internal edges:
 *   a -> b, a -> c, b -> util, c -> util
 */
async function createFixtureRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recodergit-fixture-'));
  const src = path.join(root, 'src');
  await fs.mkdir(src, { recursive: true });

  await fs.writeFile(
    path.join(src, 'a.ts'),
    [
      "import { b } from './b';",
      "import { c } from './c';",
      '// import { ignored } from "./does-not-exist";',
      'export const a = () => b() + c();',
    ].join('\n'),
    'utf8',
  );
  await fs.writeFile(
    path.join(src, 'b.ts'),
    [
      "import { useState } from 'react';",
      "import { util } from './util';",
      'export const b = () => util(useState);',
    ].join('\n'),
    'utf8',
  );
  await fs.writeFile(
    path.join(src, 'c.ts'),
    ["const { util } = require('./util');", 'export const c = () => util();'].join('\n'),
    'utf8',
  );
  await fs.writeFile(path.join(src, 'util.ts'), 'export const util = (x?: unknown) => x;\n', 'utf8');
  await fs.writeFile(path.join(src, 'd.ts'), 'export const d = 42;\n', 'utf8');

  // Ignored directories must not be scanned.
  const nm = path.join(root, 'node_modules', 'pkg');
  await fs.mkdir(nm, { recursive: true });
  await fs.writeFile(path.join(nm, 'index.ts'), "import './a';\n", 'utf8');

  return root;
}

let fixtureRoot = '';

beforeEach(async () => {
  fixtureRoot = await createFixtureRepo();
});

afterEach(async () => {
  if (fixtureRoot) {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('scanRepo finds source files and ignores node_modules', async () => {
  const result = await scanRepo(fixtureRoot);
  assert.deepEqual(result.files.sort(), [
    'src/a.ts',
    'src/b.ts',
    'src/c.ts',
    'src/d.ts',
    'src/util.ts',
  ]);
  assert.ok(
    !result.files.some((f) => f.includes('node_modules')),
    'node_modules must be excluded',
  );
});

test('scanRepo produces non-empty real internal edges (import + require + ignores externals)', async () => {
  const result = await scanRepo(fixtureRoot);
  const pairs = result.edges
    .filter((e) => e.to !== null)
    .map((e) => `${e.from} -> ${e.to}`)
    .sort();

  assert.ok(result.edges.length > 0, 'expected non-empty edges');
  assert.deepEqual(pairs, [
    'src/a.ts -> src/b.ts',
    'src/a.ts -> src/c.ts',
    'src/b.ts -> src/util.ts',
    'src/c.ts -> src/util.ts',
  ]);
  // External specifiers ('react') and commented imports must not appear.
  assert.ok(!pairs.some((p) => p.includes('react')), 'external import must be ignored');
  assert.ok(!pairs.some((p) => p.includes('does-not-exist')), 'commented import must be ignored');
});

test('indexDependencyGraph yields populated nodes and weighted edges', async () => {
  const indexer = createRepoIndexer();
  const graph = await indexer.indexDependencyGraph(fixtureRoot);

  assert.equal(graph.nodes.length, 5);
  assert.equal(graph.edges.length, 4);
  for (const edge of graph.edges) {
    assert.equal(edge.kind, 'imports');
    assert.ok((edge.weight ?? 0) >= 1, 'edge weight should be >= 1');
  }
});

test('computeImpact returns reverse-reachable dependents of a changed leaf', async () => {
  const indexer = createRepoIndexer();
  const graph = await indexer.indexDependencyGraph(fixtureRoot);

  // util.ts changed -> b, c import it directly; a imports b and c transitively.
  const impact = computeImpact({ graph, changedPaths: ['src/util.ts'] });
  assert.deepEqual(impact.seeds, ['src/util.ts']);
  assert.deepEqual(impact.impactedFiles, ['src/a.ts', 'src/b.ts', 'src/c.ts']);

  // d.ts is isolated — nothing imports it.
  assert.deepEqual(dependentsOf(graph, ['src/d.ts']), []);
});

test('contextPack assembles a non-empty pack with real graph + impact', async () => {
  const indexer = createRepoIndexer();
  const task: TaskSpec = {
    taskId: 'T-1',
    title: 'Change util',
    intent: 'feature_delivery',
    goal: 'Touch the leaf util module',
    spaceId: 'space-1',
    targetPaths: ['src/util.ts'],
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verification: { commands: [] },
    approvalRequired: [],
    artifactRequired: [],
  };

  const pack = await indexer.contextPack({ task, repoRoot: fixtureRoot });

  assert.ok(pack.dependencyGraph.nodes.length > 0, 'graph nodes must be non-empty');
  assert.ok(pack.dependencyGraph.edges.length > 0, 'graph edges must be non-empty');
  assert.ok(pack.ownershipMap.entries.length > 0, 'ownership map must be non-empty');

  const riskPaths = pack.impactReport.changedFileRisks.map((r) => r.path);
  assert.ok(riskPaths.includes('src/a.ts'), 'transitive dependent a.ts must appear in impact');
  assert.ok(riskPaths.includes('src/b.ts'), 'direct dependent b.ts must appear in impact');
});

test('parseCodeowners + buildOwnershipMap derive real ownership', async () => {
  // Path-heuristic fallback (no CODEOWNERS in fixture).
  const fallback = await buildOwnershipMap(fixtureRoot, ['src/a.ts', 'src/b.ts']);
  assert.deepEqual(fallback.entries, [{ pathGlob: 'src/**', owners: ['@team/src'], source: 'package' }]);

  // CODEOWNERS parsing.
  const entries = parseCodeowners(['# comment', '/src/ @alice @bob', 'docs/* @carol'].join('\n'));
  assert.deepEqual(entries, [
    { pathGlob: 'src/', owners: ['@alice', '@bob'], source: 'codeowners' },
    { pathGlob: 'docs/*', owners: ['@carol'], source: 'codeowners' },
  ]);
});
