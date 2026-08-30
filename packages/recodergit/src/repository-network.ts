import path from 'node:path';
import type { DependencyGraph, ExternalImportEdge } from './dependency-graph';
import type { PackageEcosystem, RepositoryPackage } from './repository-packages';

export type RepositoryRegistration = {
  repoId: string;
  repoRoot: string;
  revision: string;
  indexedAt: string;
  packages: RepositoryPackage[];
  externalImports: ExternalImportEdge[];
  /** True when the durable consumer inventory hit its explicit storage bound. */
  externalImportsTruncated?: boolean;
};

/** Two imports per maximum indexed file keeps ordinary large monorepos exact. */
export const MAX_REGISTERED_EXTERNAL_IMPORTS = 100_000;

export type CrossRepositoryConsumer = {
  repoId: string;
  filePath: string;
  ecosystem: PackageEcosystem;
  packageName: string;
  importSpecifier: string;
  relationType: 'CONSUMED_BY';
  confidence: 1;
};

export type RepositoryConsumerImpact = {
  consumers: CrossRepositoryConsumer[];
  total: number;
  consumerRepositories: number;
  partial: boolean;
};

function containsPath(root: string, filePath: string): boolean {
  return !root || filePath === root || filePath.startsWith(`${root}/`);
}

function matchesImport(
  ecosystem: PackageEcosystem,
  specifier: string,
  importName: string,
): boolean {
  if (ecosystem === 'npm' || ecosystem === 'go') {
    return specifier === importName || specifier.startsWith(`${importName}/`);
  }
  if (ecosystem === 'python') {
    const normalizedSpecifier = specifier.replace(/-/g, '_');
    const normalizedName = importName.replace(/-/g, '_');
    return normalizedSpecifier === normalizedName || normalizedSpecifier.startsWith(`${normalizedName}.`);
  }
  const normalizedSpecifier = specifier.replace(/-/g, '_');
  const normalizedName = importName.replace(/-/g, '_');
  return normalizedSpecifier === normalizedName || normalizedSpecifier.startsWith(`${normalizedName}::`);
}

/** Create the bounded durable record used by the installed repository registry. */
export function repositoryRegistrationFromGraph(
  repoId: string,
  revision: string,
  graph: DependencyGraph,
): RepositoryRegistration {
  if (!repoId.trim() || !revision.trim()) throw new Error('repository registration requires repoId and revision');
  const externalImports = graph.externalImports ?? [];
  return {
    repoId: repoId.trim(),
    repoRoot: graph.repoRoot,
    revision: revision.trim(),
    indexedAt: graph.indexedAt,
    packages: [...(graph.packages ?? [])].slice(0, 1_000),
    externalImports: [...externalImports].slice(0, MAX_REGISTERED_EXTERNAL_IMPORTS),
    externalImportsTruncated: externalImports.length > MAX_REGISTERED_EXTERNAL_IMPORTS,
  };
}

/**
 * Find exact consumer files whose unresolved external import matches a package
 * published by the provider repository and containing the changed provider file.
 */
export function findRepositoryConsumerImpact(
  provider: RepositoryRegistration,
  registrations: readonly RepositoryRegistration[],
  targetPathInput: string,
  limit = 100,
): RepositoryConsumerImpact {
  const targetPath = path.posix.normalize(targetPathInput.replace(/\\/g, '/').replace(/^\.\//, ''));
  if (!targetPath || targetPath === '..' || targetPath.startsWith('../') || path.posix.isAbsolute(targetPath)) {
    return { consumers: [], total: 0, consumerRepositories: 0, partial: false };
  }
  const providerPackages = provider.packages
    .filter((item) => containsPath(item.root, targetPath))
    .sort((a, b) => b.root.length - a.root.length || a.name.localeCompare(b.name));
  if (providerPackages.length === 0) {
    return { consumers: [], total: 0, consumerRepositories: 0, partial: false };
  }

  const found = new Map<string, CrossRepositoryConsumer>();
  for (const consumer of registrations) {
    if (consumer.repoId === provider.repoId) continue;
    for (const external of consumer.externalImports) {
      for (const provided of providerPackages) {
        if (external.ecosystem !== provided.ecosystem) continue;
        if (!provided.importNames.some((name) => matchesImport(provided.ecosystem, external.specifier, name))) continue;
        const key = `${consumer.repoId}\0${external.from}\0${provided.ecosystem}\0${provided.name}`;
        found.set(key, {
          repoId: consumer.repoId,
          filePath: external.from,
          ecosystem: provided.ecosystem,
          packageName: provided.name,
          importSpecifier: external.specifier,
          relationType: 'CONSUMED_BY',
          confidence: 1,
        });
      }
    }
  }
  const all = [...found.values()]
    .sort((a, b) => a.repoId.localeCompare(b.repoId) || a.filePath.localeCompare(b.filePath) || a.packageName.localeCompare(b.packageName));
  const bounded = all.slice(0, Math.max(1, Math.floor(limit)));
  return {
    consumers: bounded,
    total: all.length,
    consumerRepositories: new Set(all.map((item) => item.repoId)).size,
    partial: bounded.length < all.length || registrations.some((item) => item.externalImportsTruncated === true),
  };
}

/** Compatibility helper for callers that only need the bounded rows. */
export function findRepositoryConsumers(
  provider: RepositoryRegistration,
  registrations: readonly RepositoryRegistration[],
  targetPathInput: string,
  limit = 100,
): CrossRepositoryConsumer[] {
  return findRepositoryConsumerImpact(provider, registrations, targetPathInput, limit).consumers;
}
