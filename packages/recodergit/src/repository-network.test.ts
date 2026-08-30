import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findRepositoryConsumerImpact,
  findRepositoryConsumers,
  MAX_REGISTERED_EXTERNAL_IMPORTS,
  repositoryRegistrationFromGraph,
  type RepositoryRegistration,
} from './repository-network';
import { buildDependencyGraph } from './dependency-graph';

const provider: RepositoryRegistration = {
  repoId: 'acme__payments',
  repoRoot: '/repos/payments',
  revision: 'provider-sha',
  indexedAt: '2026-08-30T12:00:00.000Z',
  packages: [{
    ecosystem: 'npm',
    name: '@acme/payments',
    root: 'packages/core',
    importNames: ['@acme/payments'],
  }],
  externalImports: [],
};

test('repository network returns exact external consumer files for the changed package', () => {
  const consumer: RepositoryRegistration = {
    repoId: 'acme__checkout',
    repoRoot: '/repos/checkout',
    revision: 'consumer-sha',
    indexedAt: '2026-08-30T12:01:00.000Z',
    packages: [],
    externalImports: [
      { from: 'src/checkout.ts', ecosystem: 'npm', specifier: '@acme/payments/charge' },
      { from: 'src/view.ts', ecosystem: 'npm', specifier: 'react' },
    ],
  };
  assert.deepEqual(findRepositoryConsumers(provider, [provider, consumer], 'packages/core/src/charge.ts'), [{
    repoId: 'acme__checkout',
    filePath: 'src/checkout.ts',
    ecosystem: 'npm',
    packageName: '@acme/payments',
    importSpecifier: '@acme/payments/charge',
    relationType: 'CONSUMED_BY',
    confidence: 1,
  }]);
  assert.deepEqual(findRepositoryConsumers(provider, [provider, consumer], 'docs/README.ts'), []);
});

test('repository consumer impact keeps exact totals when returned rows are bounded', () => {
  const consumer: RepositoryRegistration = {
    repoId: 'acme__checkout',
    repoRoot: '/repos/checkout',
    revision: 'consumer-sha',
    indexedAt: '2026-08-30T12:01:00.000Z',
    packages: [],
    externalImports: Array.from({ length: 5 }, (_, index) => ({
      from: `src/consumer-${index}.ts`,
      ecosystem: 'npm' as const,
      specifier: '@acme/payments',
    })),
  };
  assert.deepEqual(findRepositoryConsumerImpact(provider, [provider, consumer], 'packages/core/src/charge.ts', 2), {
    consumers: findRepositoryConsumers(provider, [provider, consumer], 'packages/core/src/charge.ts', 2),
    total: 5,
    consumerRepositories: 1,
    partial: true,
  });
});

test('durable registration retains consumer imports beyond the former 20k cutoff', () => {
  const externalImports = Array.from({ length: 20_001 }, (_, index) => ({
    from: `engines/generated-${String(index).padStart(5, '0')}.ts`,
    ecosystem: 'npm' as const,
    specifier: `dependency-${index}`,
  }));
  externalImports.push({ from: 'src/live-consumer.ts', ecosystem: 'npm', specifier: '@acme/payments' });
  const graph = buildDependencyGraph('/repos/consumer', ['src/live-consumer.ts'], [], undefined, {
    externalImports,
  });
  const registration = repositoryRegistrationFromGraph('acme__checkout', 'sha', graph);

  assert.equal(MAX_REGISTERED_EXTERNAL_IMPORTS, 100_000);
  assert.equal(registration.externalImports.length, 20_002);
  assert.equal(registration.externalImportsTruncated, false);
  assert.ok(registration.externalImports.some((edge) => edge.from === 'src/live-consumer.ts'));
});
