import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import type { TaskSpec } from '@recoder/agent-os';
import { computeImpact, dependentsOf } from './impact';
import { computeFileImpact } from './file-impact';
import { createRepoIndexer } from './repo-indexer';
import { discoverRepositoryPackages } from './repository-packages';
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
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: '@acme/provider' }), 'utf8');

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

test('scanRepo reports bounded index coverage instead of silently truncating', async () => {
  const result = await scanRepo(fixtureRoot, { maxFiles: 3 });
  assert.equal(result.files.length, 3);
  assert.equal(result.maxFiles, 3);
  assert.equal(result.truncated, true);

  const graph = await createRepoIndexer().indexDependencyGraph(fixtureRoot);
  assert.deepEqual(graph.index, { indexedFiles: 5, maxFiles: 50_000, truncated: false });
});

test('repository boundaries exclude nested checkouts, generated app copies, and vendored dependencies', async () => {
  const ignoredSources = [
    ['.scratch', 'upstream', 'index.ts'],
    ['app', 'make', 'packed', 'index.ts'],
  ];
  for (const parts of ignoredSources) {
    const file = path.join(fixtureRoot, ...parts);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, 'export const polluted = true;\n', 'utf8');
  }
  const nestedRepo = path.join(fixtureRoot, 'checkouts', 'sibling');
  await fs.mkdir(path.join(nestedRepo, '.git'), { recursive: true });
  await fs.writeFile(path.join(nestedRepo, 'index.ts'), 'export const sibling = true;\n', 'utf8');

  const result = await scanRepo(fixtureRoot);
  assert.ok(result.files.every((file) =>
    !file.startsWith('.scratch/') &&
    !file.includes('/make/') &&
    !file.startsWith('checkouts/sibling/')));
});

test('package discovery follows declared pnpm workspaces and ignores fixture manifests', async () => {
  await fs.writeFile(
    path.join(fixtureRoot, 'pnpm-workspace.yaml'),
    ['packages:', "  - 'packages/*'", "  - '!packages/ignored'", ''].join('\n'),
    'utf8',
  );
  for (const [root, name] of [
    ['packages/core', '@acme/core'],
    ['packages/ignored', '@acme/ignored'],
    ['docs', '@acme/docs'],
    ['test/fixtures/provider', '@acme/fixture'],
  ] as const) {
    const directory = path.join(fixtureRoot, root);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name }), 'utf8');
    await fs.writeFile(path.join(directory, 'index.ts'), 'export const value = true;\n', 'utf8');
  }

  const scan = await scanRepo(fixtureRoot);
  const packages = await discoverRepositoryPackages(fixtureRoot, scan.files);
  assert.deepEqual(packages.filter((item) => item.ecosystem === 'npm').map((item) => item.name), [
    '@acme/provider',
    '@acme/core',
  ]);
});

test('repo index resolves workspace package roots and exported subpaths onto source files', async () => {
  await fs.writeFile(
    path.join(fixtureRoot, 'pnpm-workspace.yaml'),
    ['packages:', "  - 'packages/*'", ''].join('\n'),
    'utf8',
  );
  const coreRoot = path.join(fixtureRoot, 'packages', 'core');
  const consumerRoot = path.join(fixtureRoot, 'packages', 'consumer');
  await fs.mkdir(path.join(coreRoot, 'src', 'domain'), { recursive: true });
  await fs.mkdir(path.join(consumerRoot, 'src'), { recursive: true });
  await fs.writeFile(path.join(coreRoot, 'package.json'), JSON.stringify({
    name: '@acme/core',
    exports: {
      '.': { import: './dist/index.mjs', types: './dist/index.d.ts' },
      './domain': { import: './dist/domain/index.mjs', types: './dist/domain/index.d.ts' },
      './adapter': { import: './dist/adapter.mjs', types: './dist/adapter.d.ts' },
    },
  }), 'utf8');
  await fs.writeFile(path.join(consumerRoot, 'package.json'), JSON.stringify({ name: '@acme/consumer' }), 'utf8');
  await fs.writeFile(path.join(coreRoot, 'src', 'index.ts'), 'export const core = true;\n', 'utf8');
  await fs.writeFile(path.join(coreRoot, 'src', 'domain', 'index.ts'), 'export const domain = true;\n', 'utf8');
  await fs.mkdir(path.join(coreRoot, 'src', 'internal', 'adapter'), { recursive: true });
  await fs.writeFile(path.join(coreRoot, 'src', 'internal', 'adapter', 'index.ts'), 'export const adapter = true;\n', 'utf8');
  await fs.writeFile(
    path.join(consumerRoot, 'src', 'run.ts'),
    [
      "import { core } from '@acme/core';",
      "import { domain } from '@acme/core/domain';",
      "import { adapter } from '@acme/core/adapter';",
      "import { hidden } from '@acme/embedded';",
      'export { core, domain, adapter, hidden };',
    ].join('\n'),
    'utf8',
  );
  const embeddedRoot = path.join(fixtureRoot, 'embedded');
  await fs.mkdir(path.join(embeddedRoot, 'src'), { recursive: true });
  await fs.writeFile(path.join(embeddedRoot, 'package.json'), JSON.stringify({
    name: '@acme/embedded',
    main: './dist/index.js',
  }), 'utf8');
  await fs.writeFile(path.join(embeddedRoot, 'src', 'index.ts'), 'export const hidden = true;\n', 'utf8');

  const graph = await createRepoIndexer().indexDependencyGraph(fixtureRoot);
  const pairs = graph.edges.map((edge) => `${edge.from} -> ${edge.to}`);
  assert.ok(pairs.includes('packages/consumer/src/run.ts -> packages/core/src/index.ts'));
  assert.ok(pairs.includes('packages/consumer/src/run.ts -> packages/core/src/domain/index.ts'));
  assert.ok(pairs.includes('packages/consumer/src/run.ts -> packages/core/src/internal/adapter/index.ts'));
  assert.ok(pairs.includes('packages/consumer/src/run.ts -> embedded/src/index.ts'));
  assert.ok(!graph.externalImports?.some((edge) => edge.specifier.startsWith('@acme/core')));
  assert.ok(!graph.externalImports?.some((edge) => edge.specifier === '@acme/embedded'));
  assert.ok(!graph.packages?.some((item) => item.name === '@acme/embedded'));
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

test('scanRepo retains external imports and repo index discovers published packages', async () => {
  const scan = await scanRepo(fixtureRoot);
  assert.deepEqual(scan.externalImports, [{
    from: 'src/b.ts',
    specifier: 'react',
    ecosystem: 'npm',
  }]);
  const graph = await createRepoIndexer().indexDependencyGraph(fixtureRoot);
  assert.deepEqual(graph.packages, [{
    ecosystem: 'npm',
    name: '@acme/provider',
    root: '',
    importNames: ['@acme/provider'],
  }]);
  assert.deepEqual(graph.externalImports, scan.externalImports);
});

test('scanRepo resolves JSONC tsconfig paths, baseUrl imports, and inherited monorepo aliases', async () => {
  await fs.writeFile(
    path.join(fixtureRoot, 'tsconfig.base.json'),
    [
      '{',
      '  // aliases inherited by package projects',
      '  "compilerOptions": {',
      '    "baseUrl": ".",',
      '    "paths": { "@core/*": ["src/*"], },',
      '  },',
      '}',
    ].join('\n'),
    'utf8',
  );
  await fs.writeFile(
    path.join(fixtureRoot, 'tsconfig.json'),
    JSON.stringify({
      extends: './tsconfig.base.json',
      compilerOptions: {
        baseUrl: 'src',
        paths: { '@/*': ['*'] },
      },
    }),
    'utf8',
  );
  await fs.writeFile(
    path.join(fixtureRoot, 'src', 'alias.ts'),
    [
      "import { util } from '@/util';",
      "import { b } from 'b';",
      'export const alias = () => util(b());',
    ].join('\n'),
    'utf8',
  );

  const packageDir = path.join(fixtureRoot, 'packages', 'worker');
  await fs.mkdir(packageDir, { recursive: true });
  await fs.writeFile(
    path.join(packageDir, 'tsconfig.json'),
    JSON.stringify({ extends: '../../tsconfig.base.json' }),
    'utf8',
  );
  await fs.writeFile(
    path.join(packageDir, 'index.ts'),
    "import { util } from '@core/util';\nexport const worker = util;\n",
    'utf8',
  );

  const result = await scanRepo(fixtureRoot);
  const pairs = result.edges.map((edge) => `${edge.from} -> ${edge.to}`).sort();
  assert.ok(pairs.includes('src/alias.ts -> src/util.ts'), 'paths alias must resolve');
  assert.ok(pairs.includes('src/alias.ts -> src/b.ts'), 'baseUrl import must resolve');
  assert.ok(
    pairs.includes('packages/worker/index.ts -> src/util.ts'),
    'an extended root alias must retain the parent config resolution base',
  );
});

test('scanRepo builds Python module, Go package, and Rust module edges', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recodergit-languages-'));
  try {
    await fs.mkdir(path.join(root, 'python', 'src', 'shop'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'python', 'src', 'shop', 'billing.py'),
      'def charge():\n    return 1\n',
    );
    await fs.writeFile(
      path.join(root, 'python', 'src', 'shop', 'pay.py'),
      'from shop.billing import charge\ndef compute():\n    return charge()\n',
    );
    await fs.writeFile(
      path.join(root, 'python', 'src', 'shop', 'jobs.py'),
      'from .pay import compute\ndef settle():\n    return compute()\n',
    );

    await fs.mkdir(path.join(root, 'go', 'cmd'), { recursive: true });
    await fs.mkdir(path.join(root, 'go', 'internal', 'pay'), { recursive: true });
    await fs.mkdir(path.join(root, 'go', 'internal', 'billing'), { recursive: true });
    await fs.writeFile(path.join(root, 'go', 'go.mod'), 'module example.com/shop\n');
    await fs.writeFile(
      path.join(root, 'go', 'cmd', 'main.go'),
      'package main\nimport "example.com/shop/internal/pay"\nfunc main() { pay.Compute() }\n',
    );
    await fs.writeFile(
      path.join(root, 'go', 'internal', 'pay', 'pay.go'),
      'package pay\nimport "example.com/shop/internal/billing"\nfunc Compute() int { return billing.Charge() }\n',
    );
    await fs.writeFile(
      path.join(root, 'go', 'internal', 'billing', 'billing.go'),
      'package billing\nfunc Charge() int { return 1 }\n',
    );

    await fs.mkdir(path.join(root, 'rust', 'src', 'pay'), { recursive: true });
    await fs.writeFile(path.join(root, 'rust', 'Cargo.toml'), '[package]\nname = "shop"\nversion = "0.1.0"\n');
    await fs.writeFile(path.join(root, 'rust', 'src', 'lib.rs'), 'pub mod billing;\npub mod pay;\n');
    await fs.writeFile(path.join(root, 'rust', 'src', 'billing.rs'), 'pub fn charge() -> i32 { 1 }\n');
    await fs.writeFile(
      path.join(root, 'rust', 'src', 'pay.rs'),
      'use crate::billing::charge;\npub mod receipt;\npub fn compute() -> i32 { charge() }\n',
    );
    await fs.writeFile(
      path.join(root, 'rust', 'src', 'pay', 'receipt.rs'),
      'use super::compute;\npub fn print() -> i32 { compute() }\n',
    );

    const result = await scanRepo(root);
    const pairs = result.edges.map((edge) => `${edge.from} -> ${edge.to}`).sort();
    for (const expected of [
      'python/src/shop/pay.py -> python/src/shop/billing.py',
      'python/src/shop/jobs.py -> python/src/shop/pay.py',
      'go/cmd/main.go -> go/internal/pay/pay.go',
      'go/internal/pay/pay.go -> go/internal/billing/billing.go',
      'rust/src/lib.rs -> rust/src/billing.rs',
      'rust/src/lib.rs -> rust/src/pay.rs',
      'rust/src/pay.rs -> rust/src/billing.rs',
      'rust/src/pay.rs -> rust/src/pay/receipt.rs',
      'rust/src/pay/receipt.rs -> rust/src/pay.rs',
    ]) {
      assert.ok(pairs.includes(expected), `missing language edge: ${expected}\n${pairs.join('\n')}`);
    }
    const calls = result.symbolCalls.map((call) =>
      `${call.from}#${call.caller} -> ${call.to}#${call.callee}`);
    for (const expected of [
      'python/src/shop/pay.py#compute -> python/src/shop/billing.py#charge',
      'python/src/shop/jobs.py#settle -> python/src/shop/pay.py#compute',
      'go/cmd/main.go#main -> go/internal/pay/pay.go#Compute',
      'go/internal/pay/pay.go#Compute -> go/internal/billing/billing.go#Charge',
      'rust/src/pay.rs#compute -> rust/src/billing.rs#charge',
      'rust/src/pay/receipt.rs#print -> rust/src/pay.rs#compute',
    ]) {
      assert.ok(calls.includes(expected), `missing language symbol call: ${expected}\n${calls.join('\n')}`);
    }

    const graph = await createRepoIndexer().indexDependencyGraph(root);
    const pythonImpact = computeFileImpact({
      graph,
      targetPath: 'python/src/shop/billing.py',
      direction: 'upstream',
      maxDepth: 2,
      includeTests: true,
    });
    assert.deepEqual(pythonImpact?.byDepth[1]?.map((item) => item.filePath), ['python/src/shop/pay.py']);
    assert.deepEqual(pythonImpact?.byDepth[2]?.map((item) => item.filePath), ['python/src/shop/jobs.py']);

    const goImpact = computeFileImpact({
      graph,
      targetPath: 'go/internal/billing/billing.go',
      direction: 'upstream',
      maxDepth: 2,
      includeTests: true,
    });
    assert.deepEqual(goImpact?.byDepth[1]?.map((item) => item.filePath), ['go/internal/pay/pay.go']);
    assert.deepEqual(goImpact?.byDepth[2]?.map((item) => item.filePath), ['go/cmd/main.go']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('scanRepo follows configured Python roots, Go local replacements, and Rust path modules', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recodergit-language-config-'));
  try {
    await fs.mkdir(path.join(root, 'python', 'tests'), { recursive: true });
    await fs.mkdir(path.join(root, 'python', 'lib', 'shop'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'python', 'pyproject.toml'),
      '[tool.setuptools]\npackage-dir = {"" = "lib"}\n',
    );
    await fs.writeFile(
      path.join(root, 'python', 'tests', 'test_pay.py'),
      'from shop.billing import charge\ndef test_charge():\n    assert charge() == 1\n',
    );
    await fs.writeFile(path.join(root, 'python', 'lib', 'shop', 'billing.py'), 'def charge():\n    return 1\n');

    await fs.mkdir(path.join(root, 'python-pyright', 'checks'), { recursive: true });
    await fs.mkdir(path.join(root, 'python-pyright', 'source', 'accounts'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'python-pyright', 'pyrightconfig.json'),
      '{\n  // JSONC is accepted by Pyright\n  "extraPaths": ["source"],\n}\n',
    );
    await fs.writeFile(
      path.join(root, 'python-pyright', 'checks', 'check_user.py'),
      'from accounts.user import User\n',
    );
    await fs.writeFile(path.join(root, 'python-pyright', 'source', 'accounts', 'user.py'), 'class User:\n    pass\n');

    await fs.mkdir(path.join(root, 'python-cfg', 'tests'), { recursive: true });
    await fs.mkdir(path.join(root, 'python-cfg', 'vendor', 'ledger'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'python-cfg', 'setup.cfg'),
      '[options]\npackage_dir =\n    =vendor\n',
    );
    await fs.writeFile(
      path.join(root, 'python-cfg', 'tests', 'check_item.py'),
      'from ledger.item import Item\n',
    );
    await fs.writeFile(path.join(root, 'python-cfg', 'vendor', 'ledger', 'item.py'), 'class Item:\n    pass\n');

    await fs.mkdir(path.join(root, 'go', 'services', 'api'), { recursive: true });
    await fs.mkdir(path.join(root, 'go', 'shared', 'contracts', 'billing'), { recursive: true });
    await fs.mkdir(path.join(root, 'go', 'shared', 'private', 'rates'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'go', 'go.work'),
      'go 1.22\nuse (\n  ./services/api\n)\nreplace (\n  example.com/contracts => ./shared/contracts\n)\n',
    );
    await fs.writeFile(
      path.join(root, 'go', 'services', 'api', 'go.mod'),
      'module example.com/api\nreplace (\n  example.com/private => ../../shared/private\n)\n',
    );
    await fs.writeFile(
      path.join(root, 'go', 'services', 'api', 'main.go'),
      'package main\nimport (\n  "example.com/contracts/billing"\n  "example.com/private/rates"\n)\nfunc main() { billing.Charge(); rates.Tax() }\n',
    );
    await fs.writeFile(
      path.join(root, 'go', 'shared', 'contracts', 'billing', 'billing.go'),
      'package billing\nfunc Charge() int { return 1 }\n',
    );
    await fs.writeFile(
      path.join(root, 'go', 'shared', 'private', 'rates', 'rates.go'),
      'package rates\nfunc Tax() int { return 1 }\n',
    );

    await fs.mkdir(path.join(root, 'rust', 'src', 'generated'), { recursive: true });
    await fs.writeFile(path.join(root, 'rust', 'Cargo.toml'), '[package]\nname = "configured"\nversion = "0.1.0"\n');
    await fs.writeFile(
      path.join(root, 'rust', 'src', 'lib.rs'),
      '#[path = "generated/billing_impl.rs"]\npub mod billing;\n',
    );
    await fs.writeFile(
      path.join(root, 'rust', 'src', 'generated', 'billing_impl.rs'),
      'pub fn charge() -> i32 { 1 }\n',
    );

    const result = await scanRepo(root);
    const pairs = result.edges.map((edge) => `${edge.from} -> ${edge.to}`).sort();
    for (const expected of [
      'python/tests/test_pay.py -> python/lib/shop/billing.py',
      'python-pyright/checks/check_user.py -> python-pyright/source/accounts/user.py',
      'python-cfg/tests/check_item.py -> python-cfg/vendor/ledger/item.py',
      'go/services/api/main.go -> go/shared/contracts/billing/billing.go',
      'go/services/api/main.go -> go/shared/private/rates/rates.go',
      'rust/src/lib.rs -> rust/src/generated/billing_impl.rs',
    ]) {
      assert.ok(pairs.includes(expected), `missing configured language edge: ${expected}\n${pairs.join('\n')}`);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
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

test('buildOwnershipMap prefers a real CODEOWNERS file on disk over path heuristics', async () => {
  // Write a CODEOWNERS file into the fixture and confirm it overrides the fallback.
  await fs.writeFile(
    path.join(fixtureRoot, 'CODEOWNERS'),
    ['# owners', '/src/ @platform-team', 'src/util.ts @leaf-owner'].join('\n'),
    'utf8',
  );
  const map = await buildOwnershipMap(fixtureRoot, ['src/a.ts', 'src/util.ts']);
  assert.deepEqual(map.entries, [
    { pathGlob: 'src/', owners: ['@platform-team'], source: 'codeowners' },
    { pathGlob: 'src/util.ts', owners: ['@leaf-owner'], source: 'codeowners' },
  ]);
  assert.ok(
    map.entries.every((e) => e.source === 'codeowners'),
    'CODEOWNERS must win — no package-heuristic entries when a CODEOWNERS file exists',
  );
});

test('edge weight aggregates multiple distinct specifiers to the same target', async () => {
  // f.ts imports util via two DIFFERENT specifiers (./util and ./util.ts) — both
  // resolve to the same file, so the pair's weight must be 2 (real fan-in counting),
  // while a-> b (single specifier) stays weight 1.
  await fs.writeFile(
    path.join(fixtureRoot, 'src', 'f.ts'),
    ["import { util } from './util';", "import { util as u2 } from './util.ts';", 'export const f = () => util(u2);'].join(
      '\n',
    ),
    'utf8',
  );
  const indexer = createRepoIndexer();
  const graph = await indexer.indexDependencyGraph(fixtureRoot);

  const fToUtil = graph.edges.find((e) => e.from === 'src/f.ts' && e.to === 'src/util.ts');
  assert.ok(fToUtil, 'expected an f.ts -> util.ts edge');
  assert.equal(fToUtil.weight, 2, 'two distinct specifiers to the same target must aggregate to weight 2');

  const aToB = graph.edges.find((e) => e.from === 'src/a.ts' && e.to === 'src/b.ts');
  assert.ok(aToB);
  assert.equal(aToB.weight, 1, 'a single specifier stays weight 1');
});

test('impact reachability is transitive across a deeper chain (e -> a -> {b,c} -> util)', async () => {
  // Add e.ts that imports a.ts, extending the chain. A change to the leaf util.ts
  // must reach e.ts transitively through a.ts even though e never imports util directly.
  await fs.writeFile(
    path.join(fixtureRoot, 'src', 'e.ts'),
    ["import { a } from './a';", 'export const e = () => a();'].join('\n'),
    'utf8',
  );
  const indexer = createRepoIndexer();
  const graph = await indexer.indexDependencyGraph(fixtureRoot);

  const impact = computeImpact({ graph, changedPaths: ['src/util.ts'] });
  assert.deepEqual(impact.impactedFiles, ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/e.ts']);

  // Depth-bounded reachability stops the walk: at depth 1 only direct importers of util.
  const shallow = computeImpact({ graph, changedPaths: ['src/util.ts'], maxDepth: 1 });
  assert.deepEqual(shallow.impactedFiles, ['src/b.ts', 'src/c.ts']);
});

test('file impact exposes bounded upstream and downstream depth without claiming symbol calls', async () => {
  const graph = await createRepoIndexer().indexDependencyGraph(fixtureRoot);
  const upstream = computeFileImpact({
    graph,
    targetPath: 'src/util.ts',
    direction: 'upstream',
    maxDepth: 3,
    includeTests: true,
  });
  assert.ok(upstream);
  assert.equal(upstream.scope, 'file-import-graph');
  assert.equal(upstream.engine, 'permissive-mit');
  assert.deepEqual(upstream.byDepth[1]?.map((item) => item.filePath), ['src/b.ts', 'src/c.ts']);
  assert.deepEqual(upstream.byDepth[2]?.map((item) => item.filePath), ['src/a.ts']);
  assert.ok(upstream.byDepth[1]?.every((item) => item.relationType === 'IMPORTED_BY'));

  const downstream = computeFileImpact({
    graph,
    targetPath: 'src/a.ts',
    direction: 'downstream',
    maxDepth: 3,
    includeTests: true,
  });
  assert.ok(downstream);
  assert.deepEqual(downstream.byDepth[1]?.map((item) => item.filePath), ['src/b.ts', 'src/c.ts']);
  assert.deepEqual(downstream.byDepth[2]?.map((item) => item.filePath), ['src/util.ts']);
  assert.ok(downstream.byDepth[1]?.every((item) => item.relationType === 'IMPORTS'));
});

test('repo index and impact expose bounded git co-change evidence', async () => {
  const graph = await createRepoIndexer({
    history: {
      reader: async () => [
        ['src/util.ts', 'src/d.ts'],
        ['src/util.ts', 'src/d.ts'],
        ['src/util.ts', 'src/a.ts'],
      ],
    },
  }).indexDependencyGraph(fixtureRoot);
  assert.deepEqual(graph.coChanges, [{
    left: 'src/d.ts',
    right: 'src/util.ts',
    commits: 2,
    confidence: 0.6667,
  }]);

  const impact = computeFileImpact({
    graph,
    targetPath: 'src/util.ts',
    direction: 'upstream',
    maxDepth: 3,
    includeTests: true,
  });
  assert.ok(impact);
  assert.deepEqual(impact.coChanges, [{
    filePath: 'src/d.ts',
    name: 'd.ts',
    relationType: 'CO_CHANGED_WITH',
    commits: 2,
    confidence: 0.6667,
    processes: [],
  }]);
  assert.equal(impact.summary.co_changed, 1);
});

test('file impact includes tests only when requested and reports page truncation', async () => {
  await fs.writeFile(
    path.join(fixtureRoot, 'src', 'util.test.ts'),
    ["import { util } from './util';", 'export const result = util();'].join('\n'),
    'utf8',
  );
  const graph = await createRepoIndexer().indexDependencyGraph(fixtureRoot);
  const withoutTests = computeFileImpact({
    graph,
    targetPath: 'src/util.ts',
    direction: 'upstream',
    maxDepth: 1,
    includeTests: false,
  });
  assert.ok(withoutTests);
  assert.ok(!withoutTests.byDepth[1]?.some((item) => item.filePath === 'src/util.test.ts'));

  const withTests = computeFileImpact({
    graph,
    targetPath: 'src/util.ts',
    direction: 'upstream',
    maxDepth: 1,
    includeTests: true,
    limit: 1,
  });
  assert.ok(withTests);
  assert.equal(withTests.byDepthCounts[1], 3);
  assert.equal(withTests.byDepth[1]?.length, 1);
  assert.deepEqual(withTests.pagination, { limit: 1, offset: 0, truncated: true });
});

test('symbol impact follows definition-backed calls and carries exact process membership', async () => {
  await fs.writeFile(
    path.join(fixtureRoot, 'src', 'server.ts'),
    [
      "import { a } from './a';",
      'const app = { get: (..._args: unknown[]) => undefined, listen: (_port: number) => undefined };',
      'export function handleRequest() { return a(); }',
      "app.get('/calculate', handleRequest);",
      'app.listen(3000);',
    ].join('\n'),
    'utf8',
  );
  const graph = await createRepoIndexer().indexDependencyGraph(fixtureRoot);
  const upstream = computeFileImpact({
    graph,
    targetPath: 'src/util.ts',
    symbol: 'util',
    direction: 'upstream',
    maxDepth: 4,
    includeTests: true,
  });

  assert.equal(upstream?.scope, 'symbol-call-graph');
  assert.deepEqual(upstream?.byDepth[1]?.map((item) => `${item.filePath}#${item.name}`), [
    'src/b.ts#b',
    'src/c.ts#c',
  ]);
  assert.deepEqual(upstream?.byDepth[2]?.map((item) => `${item.filePath}#${item.name}`), ['src/a.ts#a']);
  assert.deepEqual(upstream?.byDepth[3]?.map((item) => `${item.filePath}#${item.name}`), [
    'src/server.ts#handleRequest',
  ]);
  assert.ok(upstream?.byDepth[1]?.every((item) => item.relationType === 'CALLED_BY'));
  assert.deepEqual(upstream?.affected_processes.map((process) => process.label), [
    'GET /calculate',
    'Server src/server.ts',
  ]);
});
