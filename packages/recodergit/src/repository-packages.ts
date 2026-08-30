import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import { IGNORED_DIRECTORIES } from './repo-scan';

export type PackageEcosystem = 'npm' | 'python' | 'go' | 'cargo';

/** One package or module a repository publishes for other repositories to import. */
export type RepositoryPackage = {
  ecosystem: PackageEcosystem;
  name: string;
  /** Repo-relative package root; an empty string means the repository root. */
  root: string;
  /** Source-level names a consumer import can begin with. */
  importNames: string[];
};

export type DiscoverRepositoryPackageOptions = {
  /** Include npm manifests outside declared root workspaces for internal source linking. */
  includeUnlistedNpm?: boolean;
};

const MANIFESTS = new Set(['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml']);
const IGNORED = new Set([
  ...IGNORED_DIRECTORIES,
  '__fixtures__',
  'fixtures',
  'example',
  'examples',
  'demo',
  'demos',
  'vendor',
]);
const MAX_MANIFESTS = 1_000;

type WorkspaceRules = {
  include: RegExp[];
  exclude: RegExp[];
};

function workspacePattern(pattern: string): RegExp | null {
  const normalized = pattern.trim().replace(/^['"]|['"]$/g, '').replace(/^\.\//, '').replace(/\/$/, '');
  if (!normalized) return null;
  let expression = '^';
  for (let index = 0; index < normalized.length; index++) {
    const character = normalized[index];
    if (character === '*') {
      if (normalized[index + 1] === '*') {
        expression += '.*';
        index++;
      } else {
        expression += '[^/]*';
      }
    } else if (character === '?') {
      expression += '[^/]';
    } else {
      expression += character?.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`${expression}$`);
}

function addWorkspacePatterns(patterns: readonly string[], include: RegExp[], exclude: RegExp[]): void {
  for (const rawPattern of patterns) {
    const normalized = rawPattern.trim().replace(/^['"]|['"]$/g, '');
    const negated = normalized.startsWith('!');
    const pattern = workspacePattern(negated ? normalized.slice(1) : normalized);
    if (pattern) (negated ? exclude : include).push(pattern);
  }
}

function pnpmWorkspacePatterns(source: string): string[] {
  const patterns: string[] = [];
  let active = false;
  for (const line of source.split(/\r?\n/)) {
    if (/^packages:\s*(?:#.*)?$/.test(line)) {
      active = true;
      continue;
    }
    if (active && /^\S/.test(line)) break;
    if (!active) continue;
    const value = line.match(/^\s*-\s+(.+?)\s*$/)?.[1]?.replace(/\s+#.*$/, '').trim();
    if (value) patterns.push(value);
  }
  return patterns;
}

async function npmWorkspaceRules(repoRoot: string): Promise<WorkspaceRules | null> {
  const include: RegExp[] = [];
  const exclude: RegExp[] = [];
  try {
    const source = await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8');
    const manifest = JSON.parse(source) as { workspaces?: string[] | { packages?: string[] } };
    const patterns = Array.isArray(manifest.workspaces)
      ? manifest.workspaces
      : manifest.workspaces?.packages;
    if (patterns) addWorkspacePatterns(patterns, include, exclude);
  } catch {
    // A pnpm workspace can exist without a valid root npm manifest.
  }
  try {
    const source = await fs.readFile(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
    addWorkspacePatterns(pnpmWorkspacePatterns(source), include, exclude);
  } catch {
    // npm, Yarn, and single-package repositories do not need this file.
  }
  return include.length > 0 ? { include, exclude } : null;
}

function isDeclaredWorkspace(root: string, rules: WorkspaceRules | null): boolean {
  if (!root || !rules) return true;
  return rules.include.some((pattern) => pattern.test(root)) &&
    !rules.exclude.some((pattern) => pattern.test(root));
}

function repoRelative(repoRoot: string, absolute: string): string | null {
  const relative = path.relative(repoRoot, absolute).split(path.sep).join('/');
  if (relative === '..' || relative.startsWith('../') || path.posix.isAbsolute(relative)) return null;
  return relative === '.' ? '' : relative;
}

async function manifestPaths(repoRoot: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(directory: string): Promise<void> {
    if (found.length >= MAX_MANIFESTS) return;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    if (path.resolve(directory) !== path.resolve(repoRoot) && entries.some((entry) => entry.name === '.git')) {
      return;
    }
    for (const entry of entries) {
      if (found.length >= MAX_MANIFESTS) return;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED.has(entry.name)) await walk(absolute);
      } else if (entry.isFile() && MANIFESTS.has(entry.name)) {
        found.push(absolute);
      }
    }
  }
  await walk(path.resolve(repoRoot));
  return found.sort();
}

function packageRoot(repoRoot: string, manifestPath: string): string | null {
  return repoRelative(path.resolve(repoRoot), path.dirname(manifestPath));
}

function pythonImportNames(
  projectName: string,
  root: string,
  sourceFiles: readonly string[],
): string[] {
  const names = new Set<string>([
    projectName.replace(/[-.]+/g, '_'),
  ]);
  for (const file of sourceFiles) {
    if (!file.endsWith('.py') || (root && !file.startsWith(`${root}/`))) continue;
    let relative = root ? file.slice(root.length + 1) : file;
    relative = relative.replace(/^(?:src|lib)\//, '');
    const first = relative.split('/')[0]?.replace(/\.py$/, '');
    if (first && first !== '__init__') names.add(first);
  }
  return [...names].filter(Boolean).sort();
}

function tomlSection(source: string, name: string): string {
  const lines = source.split(/\r?\n/);
  const header = `[${name}]`;
  const body: string[] = [];
  let active = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      if (active) break;
      active = trimmed === header;
      continue;
    }
    if (active) body.push(line);
  }
  return body.join('\n');
}

/** Discover package identities used to match external imports from indexed consumers. */
export async function discoverRepositoryPackages(
  repoRoot: string,
  sourceFiles: readonly string[],
  options: DiscoverRepositoryPackageOptions = {},
): Promise<RepositoryPackage[]> {
  const packages: RepositoryPackage[] = [];
  const workspaceRules = await npmWorkspaceRules(path.resolve(repoRoot));
  for (const manifestPath of await manifestPaths(repoRoot)) {
    const root = packageRoot(repoRoot, manifestPath);
    if (root === null) continue;
    let source: string;
    try {
      source = await fs.readFile(manifestPath, 'utf8');
    } catch {
      continue;
    }
    const basename = path.basename(manifestPath);
    if (basename === 'package.json') {
      if (!options.includeUnlistedNpm && !isDeclaredWorkspace(root, workspaceRules)) continue;
      try {
        const manifest: unknown = JSON.parse(source);
        const name = manifest && typeof manifest === 'object' && !Array.isArray(manifest)
          ? (manifest as Record<string, unknown>)['name']
          : null;
        if (typeof name === 'string' && name.trim()) {
          packages.push({ ecosystem: 'npm', name: name.trim(), root, importNames: [name.trim()] });
        }
      } catch {
        // Invalid package metadata cannot prove a published package.
      }
      continue;
    }
    if (basename === 'go.mod') {
      const name = source.match(/^\s*module\s+(\S+)\s*$/m)?.[1];
      if (name) packages.push({ ecosystem: 'go', name, root, importNames: [name] });
      continue;
    }
    if (basename === 'Cargo.toml') {
      const packageSection = tomlSection(source, 'package');
      const name = packageSection.match(/^\s*name\s*=\s*["']([^"']+)["']/m)?.[1];
      if (name) {
        packages.push({
          ecosystem: 'cargo',
          name,
          root,
          importNames: [...new Set([name, name.replace(/-/g, '_')])].sort(),
        });
      }
      continue;
    }
    const projectSection = tomlSection(source, 'project');
    const poetrySection = tomlSection(source, 'tool.poetry');
    const name = (projectSection || poetrySection).match(/^\s*name\s*=\s*["']([^"']+)["']/m)?.[1];
    if (name) {
      packages.push({
        ecosystem: 'python',
        name,
        root,
        importNames: pythonImportNames(name, root, sourceFiles),
      });
    }
  }
  return [...new Map(packages.map((item) => [`${item.ecosystem}\0${item.root}\0${item.name}`, item])).values()]
    .sort((a, b) => a.ecosystem.localeCompare(b.ecosystem) || a.root.localeCompare(b.root) || a.name.localeCompare(b.name));
}
