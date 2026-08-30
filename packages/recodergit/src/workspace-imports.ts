import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ExternalImportEdge } from './dependency-graph';
import { resolveSourceCandidate, type ParsedEdge } from './repo-scan';
import type { RepositoryPackage } from './repository-packages';

export type WorkspaceImportResolution = {
  edges: ParsedEdge[];
  externalImports: ExternalImportEdge[];
};

type NpmManifest = {
  exports?: unknown;
  source?: unknown;
  module?: unknown;
  main?: unknown;
  types?: unknown;
  typings?: unknown;
};

function normalizeTarget(value: string): string | null {
  const normalized = value.trim().replace(/^\.\//, '').split(/[?#]/, 1)[0];
  if (!normalized || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return null;
  return normalized;
}

function conditionalTargets(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(conditionalTargets);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const preferred = ['source', 'development', 'import', 'default', 'require', 'types', 'browser', 'node'];
  const found: string[] = [];
  for (const condition of preferred) {
    if (condition in record) found.push(...conditionalTargets(record[condition]));
  }
  for (const [condition, target] of Object.entries(record)) {
    if (!preferred.includes(condition) && !condition.startsWith('.')) found.push(...conditionalTargets(target));
  }
  return found;
}

function exportTargets(exportsValue: unknown, subpath: string): string[] {
  const key = subpath ? `./${subpath}` : '.';
  if (typeof exportsValue === 'string' || Array.isArray(exportsValue)) {
    return key === '.' ? conditionalTargets(exportsValue) : [];
  }
  if (!exportsValue || typeof exportsValue !== 'object') return [];
  const record = exportsValue as Record<string, unknown>;
  if (key in record) return conditionalTargets(record[key]);
  for (const [pattern, target] of Object.entries(record)) {
    const star = pattern.indexOf('*');
    if (star < 0 || !pattern.startsWith('./')) continue;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;
    const replacement = key.slice(prefix.length, key.length - suffix.length);
    return conditionalTargets(target).map((item) => item.replace(/\*/g, replacement));
  }
  return key === '.' && !Object.keys(record).some((item) => item.startsWith('.'))
    ? conditionalTargets(record)
    : [];
}

function sourceCandidates(root: string, subpath: string, manifest: NpmManifest): string[] {
  const targets = [
    ...exportTargets(manifest.exports, subpath),
    ...(subpath
      ? []
      : [manifest.source, manifest.module, manifest.main, manifest.types, manifest.typings]
        .filter((item): item is string => typeof item === 'string')),
  ];
  const relative = new Set<string>();
  for (const targetValue of targets) {
    const target = normalizeTarget(targetValue);
    if (!target || target === 'package.json') continue;
    relative.add(target);
    const withoutExtension = target.replace(/\.(?:d\.)?[cm]?[jt]sx?$/, '');
    relative.add(withoutExtension);
    const generated = withoutExtension.match(/^(?:dist|build|out|lib)\/(.+)$/)?.[1];
    if (generated) relative.add(`src/${generated}`);
  }
  if (subpath) {
    relative.add(subpath);
    relative.add(`src/${subpath}`);
  } else {
    relative.add('src/index');
    relative.add('index');
    relative.add('src/main');
    relative.add('main');
  }
  return [...relative].map((candidate) => root ? path.posix.join(root, candidate) : candidate);
}

function uniqueNestedSourceEntry(root: string, subpath: string, files: ReadonlySet<string>): string | null {
  if (!subpath) return null;
  const prefix = root ? `${root}/src/` : 'src/';
  const normalized = subpath.replace(/\.(?:d\.)?[cm]?[jt]sx?$/, '');
  const matches = [...files].filter((file) => {
    if (!file.startsWith(prefix) || file.endsWith('.d.ts')) return false;
    const relative = file.slice(prefix.length).replace(/\.[cm]?[jt]sx?$/, '');
    return relative === normalized ||
      relative.endsWith(`/${normalized}`) ||
      relative === `${normalized}/index` ||
      relative.endsWith(`/${normalized}/index`);
  });
  return matches.length === 1 ? matches[0] ?? null : null;
}

async function readNpmManifest(repoRoot: string, root: string): Promise<NpmManifest | null> {
  try {
    const source = await fs.readFile(path.join(repoRoot, root, 'package.json'), 'utf8');
    const parsed: unknown = JSON.parse(source);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as NpmManifest : null;
  } catch {
    return null;
  }
}

function matchingPackage(
  specifier: string,
  packages: readonly RepositoryPackage[],
): { item: RepositoryPackage; importName: string; subpath: string } | null {
  let match: { item: RepositoryPackage; importName: string; subpath: string } | null = null;
  for (const item of packages) {
    if (item.ecosystem !== 'npm') continue;
    for (const importName of item.importNames) {
      if (specifier !== importName && !specifier.startsWith(`${importName}/`)) continue;
      if (!match || importName.length > match.importName.length) {
        match = {
          item,
          importName,
          subpath: specifier === importName ? '' : specifier.slice(importName.length + 1),
        };
      }
    }
  }
  return match;
}

/** Resolve bare npm imports onto source entries of packages declared by the same repository. */
export async function resolveWorkspacePackageImports(input: {
  repoRoot: string;
  files: readonly string[];
  packages: readonly RepositoryPackage[];
  externalImports: readonly ExternalImportEdge[];
}): Promise<WorkspaceImportResolution> {
  const fileSet = new Set(input.files);
  const manifests = new Map<string, Promise<NpmManifest | null>>();
  const edges: ParsedEdge[] = [];
  const externalImports: ExternalImportEdge[] = [];

  for (const edge of input.externalImports) {
    if (edge.ecosystem !== 'npm') {
      externalImports.push(edge);
      continue;
    }
    const matched = matchingPackage(edge.specifier, input.packages);
    if (!matched) {
      externalImports.push(edge);
      continue;
    }
    let manifest = manifests.get(matched.item.root);
    if (!manifest) {
      manifest = readNpmManifest(input.repoRoot, matched.item.root);
      manifests.set(matched.item.root, manifest);
    }
    const metadata = await manifest;
    const target = metadata
      ? sourceCandidates(matched.item.root, matched.subpath, metadata)
        .map((candidate) => resolveSourceCandidate(candidate, fileSet))
        .find((candidate): candidate is string => candidate !== null) ??
          uniqueNestedSourceEntry(matched.item.root, matched.subpath, fileSet)
      : null;
    if (!target || target === edge.from) {
      externalImports.push(edge);
      continue;
    }
    edges.push({ from: edge.from, to: target, specifier: edge.specifier });
  }

  return { edges, externalImports };
}
