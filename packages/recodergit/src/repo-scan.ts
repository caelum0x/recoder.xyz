import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import { createLanguageImportResolver, NON_JS_SOURCE_EXTENSIONS } from './language-imports';
import {
  extractSymbolEvidence,
  type SymbolEvidence,
  type SymbolEvidenceSource,
} from './symbol-evidence';
import type { ExternalImportEdge } from './dependency-graph';

/**
 * Real, dependency-free repo scanning for the RecoderGit indexer.
 *
 * This module walks a repository on disk and extracts internal static dependency
 * edges for TypeScript/JavaScript, Python, Go, and Rust. Language-native resolvers
 * map imports, packages, and modules onto real repo files. The output feeds
 * {@link DependencyGraph} and the reachability impact analysis.
 */

/** TypeScript and JavaScript extensions handled by the module-specifier resolver. */
export const JS_TS_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'] as const;
export const SOURCE_EXTENSIONS = [...JS_TS_SOURCE_EXTENSIONS, ...NON_JS_SOURCE_EXTENSIONS] as const;

/** Directory names we never descend into while walking. */
export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.claude',
  '.codex',
  '.scratch',
  '.uv-cache',
  'dist',
  'build',
  'make',
  'out',
  '.next',
  '.nx',
  '.turbo',
  'coverage',
  '.cache',
  '.vercel',
  '.output',
  'target',
  '.venv',
  'venv',
]);

/** Default cap sized for large product monorepos while still bounding the walk. */
const DEFAULT_MAX_FILES = 50000;

export type ScanOptions = {
  /** Maximum number of source files to index. Defaults to {@link DEFAULT_MAX_FILES}. */
  maxFiles?: number;
  /** Extra directory names to skip while walking. */
  ignoreDirectories?: readonly string[];
};

/** A single import/require/export-from edge between two repo-relative files. */
export type ParsedEdge = {
  /** Repo-relative path of the importing file (always populated). */
  from: string;
  /** Repo-relative path of the resolved imported file, or null if unresolved/external. */
  to: string | null;
  /** Raw module specifier as written in source. */
  specifier: string;
};

export type ScanResult = SymbolEvidence & {
  /** Repo-relative paths of every indexed source file (POSIX separators). */
  files: string[];
  /** Resolved internal edges (both endpoints are indexed source files). */
  edges: ParsedEdge[];
  externalImports: ExternalImportEdge[];
  /** Whether the repository exceeded the bounded source-file walk. */
  truncated: boolean;
  /** Effective source-file ceiling for this scan. */
  maxFiles: number;
};

type PathRule = {
  pattern: string;
  targets: string[];
};

type ResolverConfig = {
  /** Repo-relative base used for non-relative imports when `baseUrl` is set. */
  baseRoot?: string;
  /** Already repo-rooted target templates inherited from `paths`. */
  paths: PathRule[];
};

function isSourceFile(name: string): boolean {
  const lower = name.toLowerCase();
  return SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Normalize an absolute path to a POSIX-style repo-relative path. */
function toRepoRelative(repoRoot: string, absolutePath: string): string {
  const relative = path.relative(repoRoot, absolutePath);
  return relative.split(path.sep).join('/');
}

/**
 * Recursively collect every source file under {@link repoRoot}.
 * Symlinked directories are not followed to avoid cycles.
 */
export async function walkSourceFiles(repoRoot: string, options: ScanOptions = {}): Promise<string[]> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const ignored = new Set([...IGNORED_DIRECTORIES, ...(options.ignoreDirectories ?? [])]);
  const collected: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (collected.length >= maxFiles) {
      return;
    }
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      // Unreadable directory (permissions, race) — skip rather than fail the scan.
      return;
    }
    if (path.resolve(dir) !== path.resolve(repoRoot) && entries.some((entry) => entry.name === '.git')) {
      // A nested checkout or submodule is a separate repository. Its package
      // identities and imports must be registered by indexing that repository,
      // not attributed to the parent checkout.
      return;
    }
    for (const entry of entries) {
      if (collected.length >= maxFiles) {
        return;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignored.has(entry.name) || entry.name.startsWith('.git')) {
          continue;
        }
        await walk(full);
      } else if (entry.isFile() && isSourceFile(entry.name)) {
        collected.push(full);
      }
    }
  }

  await walk(repoRoot);
  return collected.sort();
}

/**
 * Strip block and line comments and string literals from source so import
 * detection does not match commented-out or string-embedded code. This is a
 * conservative pass: it preserves overall character offsets are not needed,
 * only that import/require statements survive intact.
 */
function stripNoise(source: string): string {
  let out = '';
  let i = 0;
  const len = source.length;
  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];
    // Line comment
    if (ch === '/' && next === '/') {
      while (i < len && source[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // String / template literals — collapse to empty quotes, keeping the quote
    // chars so import-specifier regexes still see a quoted (empty) string only
    // for non-import strings. Import statements are matched before this is a
    // problem because we keep the delimiters and the captured specifier.
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      out += quote;
      i++;
      while (i < len && source[i] !== quote) {
        if (source[i] === '\\') {
          out += source[i] + (source[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += source[i];
        i++;
      }
      out += quote;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Module specifier patterns. Each captures the specifier in group 1.
 * Covers: static `import ... from 'x'`, side-effect `import 'x'`,
 * `export ... from 'x'`, dynamic `import('x')`, and CommonJS `require('x')`.
 */
const SPECIFIER_PATTERNS: RegExp[] = [
  /\bimport\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bexport\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** Extract every module specifier referenced by a source string. */
export function extractSpecifiers(source: string): string[] {
  const cleaned = stripNoise(source);
  const found = new Set<string>();
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(cleaned)) !== null) {
      const specifier = match[1];
      if (specifier) {
        found.add(specifier);
      }
    }
  }
  return [...found];
}

/**
 * Resolve a relative module specifier from an importing file to an actual
 * repo-relative source file, trying common extension and index-file variants.
 * Returns null for bare/external specifiers (e.g. `react`, `node:fs`) or when
 * no file is found in the indexed set.
 */
export function resolveRelativeSpecifier(
  fromRelative: string,
  specifier: string,
  fileSet: Set<string>,
): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }
  const fromDir = path.posix.dirname(fromRelative);
  const base = path.posix.normalize(path.posix.join(fromDir, specifier));
  // Reject paths that escape the repo root.
  if (base.startsWith('..')) {
    return null;
  }

  return resolveSourceCandidate(base, fileSet);
}

/** Resolve one repo-relative candidate with common extension and index variants. */
export function resolveSourceCandidate(baseInput: string, fileSet: Set<string>): string | null {
  const base = path.posix.normalize(baseInput).replace(/^\.\//, '');
  if (!base || base === '..' || base.startsWith('../') || path.posix.isAbsolute(base)) {
    return null;
  }
  const candidates: string[] = [];
  // Direct file (already has extension or resolves as-is).
  candidates.push(base);
  for (const ext of JS_TS_SOURCE_EXTENSIONS) {
    candidates.push(`${base}${ext}`);
  }
  // Index files when the specifier points at a directory.
  for (const ext of JS_TS_SOURCE_EXTENSIONS) {
    candidates.push(path.posix.join(base, `index${ext}`));
  }

  for (const candidate of candidates) {
    if (fileSet.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Resolve a tsconfig/jsconfig `paths` or `baseUrl` import against indexed files. */
function resolveConfiguredSpecifier(
  specifier: string,
  config: ResolverConfig | undefined,
  fileSet: Set<string>,
): string | null {
  if (!config || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
    return null;
  }

  for (const rule of config.paths) {
    const wildcard = rule.pattern.indexOf('*');
    let capture = '';
    if (wildcard === -1) {
      if (specifier !== rule.pattern) continue;
    } else {
      const prefix = rule.pattern.slice(0, wildcard);
      const suffix = rule.pattern.slice(wildcard + 1);
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
      capture = specifier.slice(prefix.length, specifier.length - suffix.length);
    }
    for (const target of rule.targets) {
      const candidate = wildcard === -1 ? target : target.replace('*', capture);
      const resolved = resolveSourceCandidate(candidate, fileSet);
      if (resolved) return resolved;
    }
  }

  return config.baseRoot
    ? resolveSourceCandidate(path.posix.join(config.baseRoot, specifier), fileSet)
    : null;
}

/** JSONC reader supporting comments and trailing commas without bundling TypeScript. */
function parseJsonc(source: string): Record<string, unknown> | null {
  let clean = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i] ?? '';
    const next = source[i + 1] ?? '';
    if (inString) {
      clean += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      clean += char;
      continue;
    }
    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      clean += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }
    clean += char;
  }
  clean = clean.replace(/,\s*([}\]])/g, '$1');
  try {
    const value: unknown = JSON.parse(clean.replace(/^\uFEFF/, ''));
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function repoPath(repoRoot: string, absolutePath: string): string | null {
  const relative = toRepoRelative(repoRoot, absolutePath);
  if (relative === '..' || relative.startsWith('../') || path.posix.isAbsolute(relative)) return null;
  return relative === '.' ? '' : relative;
}

function resolveExtendsPath(configPath: string, value: unknown): string | null {
  if (typeof value !== 'string' || (!value.startsWith('.') && !path.isAbsolute(value))) return null;
  const raw = path.resolve(path.dirname(configPath), value);
  return raw.toLowerCase().endsWith('.json') ? raw : `${raw}.json`;
}

/** Load all nearest tsconfig/jsconfig resolvers relevant to the indexed files. */
async function loadResolverConfigs(
  repoRoot: string,
  absoluteFiles: readonly string[],
): Promise<Map<string, ResolverConfig>> {
  const candidates = new Set<string>();
  const root = path.resolve(repoRoot);
  for (const absoluteFile of absoluteFiles) {
    let dir = path.dirname(absoluteFile);
    while (dir === root || dir.startsWith(`${root}${path.sep}`)) {
      candidates.add(path.join(dir, 'tsconfig.json'));
      candidates.add(path.join(dir, 'jsconfig.json'));
      if (dir === root) break;
      dir = path.dirname(dir);
    }
  }

  const cache = new Map<string, Promise<ResolverConfig | null>>();
  const load = (configPath: string): Promise<ResolverConfig | null> => {
    const absolute = path.resolve(configPath);
    const existing = cache.get(absolute);
    if (existing) return existing;
    const pending = (async (): Promise<ResolverConfig | null> => {
      let source: string;
      try {
        source = await fs.readFile(absolute, 'utf8');
      } catch {
        return null;
      }
      const config = parseJsonc(source);
      if (!config) return null;
      const parentPath = resolveExtendsPath(absolute, config['extends']);
      const parent = parentPath && parentPath !== absolute ? await load(parentPath) : null;
      const options = objectValue(config['compilerOptions']);
      const configDir = repoPath(root, path.dirname(absolute));
      if (configDir === null) return null;

      const baseUrl = typeof options?.['baseUrl'] === 'string' ? options['baseUrl'].trim() : null;
      const baseRoot = baseUrl !== null
        ? path.posix.normalize(path.posix.join(configDir, baseUrl)).replace(/^\.\//, '')
        : parent?.baseRoot;
      const rawPaths = objectValue(options?.['paths']);
      const paths = rawPaths
        ? Object.entries(rawPaths).flatMap(([pattern, value]): PathRule[] => {
            if (!Array.isArray(value)) return [];
            const targets = value.flatMap((target): string[] => {
              if (typeof target !== 'string' || !target.trim()) return [];
              const rooted = path.posix.normalize(path.posix.join(baseRoot ?? configDir, target));
              return rooted === '..' || rooted.startsWith('../') ? [] : [rooted];
            });
            return pattern && targets.length > 0 ? [{ pattern, targets }] : [];
          })
        : parent?.paths ?? [];
      return {
        ...(baseRoot !== undefined ? { baseRoot } : {}),
        paths: [...paths].sort((a, b) => Number(a.pattern.includes('*')) - Number(b.pattern.includes('*'))),
      };
    })();
    cache.set(absolute, pending);
    return pending;
  };

  const byDirectory = new Map<string, ResolverConfig>();
  const ordered = [...candidates].sort((a, b) => {
    const directoryOrder = path.dirname(a).localeCompare(path.dirname(b));
    if (directoryOrder !== 0) return directoryOrder;
    const aTs = path.basename(a) === 'tsconfig.json' ? 0 : 1;
    const bTs = path.basename(b) === 'tsconfig.json' ? 0 : 1;
    return aTs - bTs;
  });
  for (const configPath of ordered) {
    const config = await load(configPath);
    if (!config) continue;
    const directory = repoPath(root, path.dirname(configPath));
    if (directory !== null && !byDirectory.has(directory)) byDirectory.set(directory, config);
  }
  return byDirectory;
}

function nearestResolver(fromRelative: string, configs: Map<string, ResolverConfig>): ResolverConfig | undefined {
  let directory = path.posix.dirname(fromRelative);
  while (true) {
    const key = directory === '.' ? '' : directory;
    const config = configs.get(key);
    if (config) return config;
    if (!key) return undefined;
    const parent = path.posix.dirname(key);
    directory = parent === '.' ? '' : parent;
  }
}

/**
 * Scan a repository and parse internal TypeScript/JavaScript imports, Python
 * modules, Go packages, and Rust modules. The scanner keeps only targets that
 * resolve to indexed repository files.
 */
export async function scanRepo(repoRoot: string, options: ScanOptions = {}): Promise<ScanResult> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const discoveredFiles = await walkSourceFiles(repoRoot, { ...options, maxFiles: maxFiles + 1 });
  const truncated = discoveredFiles.length > maxFiles;
  const absoluteFiles = truncated ? discoveredFiles.slice(0, maxFiles) : discoveredFiles;
  const relativeFiles = absoluteFiles.map((abs) => toRepoRelative(repoRoot, abs));
  const fileSet = new Set(relativeFiles);
  const jsTsFiles = absoluteFiles.filter((absoluteFile) =>
    (JS_TS_SOURCE_EXTENSIONS as readonly string[]).includes(path.extname(absoluteFile).toLowerCase()));
  const resolverConfigs = await loadResolverConfigs(repoRoot, jsTsFiles);
  const languageResolver = await createLanguageImportResolver(repoRoot, relativeFiles);
  const edges: ParsedEdge[] = [];
  const sourceFiles: SymbolEvidenceSource[] = [];
  const externalImports: ExternalImportEdge[] = [];

  for (let idx = 0; idx < absoluteFiles.length; idx++) {
    const absolute = absoluteFiles[idx];
    const fromRelative = relativeFiles[idx];
    if (!absolute || !fromRelative) {
      continue;
    }
    let source: string;
    try {
      source = await fs.readFile(absolute, 'utf8');
    } catch {
      continue;
    }
    sourceFiles.push({ filePath: fromRelative, source });
    const extension = path.posix.extname(fromRelative).toLowerCase();
    if ((JS_TS_SOURCE_EXTENSIONS as readonly string[]).includes(extension)) {
      const specifiers = extractSpecifiers(source);
      for (const specifier of specifiers) {
        const resolved = resolveRelativeSpecifier(fromRelative, specifier, fileSet) ??
          resolveConfiguredSpecifier(specifier, nearestResolver(fromRelative, resolverConfigs), fileSet);
        if (resolved && resolved !== fromRelative) {
          edges.push({ from: fromRelative, to: resolved, specifier });
        } else if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:')) {
          externalImports.push({ from: fromRelative, specifier, ecosystem: 'npm' });
        }
      }
    } else {
      const resolvedEdges = languageResolver.resolve(fromRelative, source);
      for (const edge of resolvedEdges) {
        edges.push({ from: fromRelative, to: edge.to, specifier: edge.specifier });
      }
      const resolvedSpecifiers = new Set(resolvedEdges.map((edge) => edge.specifier));
      const ecosystem = extension === '.py' ? 'python' : extension === '.go' ? 'go' : 'cargo';
      for (const specifier of languageResolver.specifiers(fromRelative, source)) {
        if (!resolvedSpecifiers.has(specifier)) externalImports.push({ from: fromRelative, specifier, ecosystem });
      }
    }
  }

  return {
    files: relativeFiles,
    edges,
    externalImports: [...new Map(externalImports.map((edge) => [
      `${edge.from}\0${edge.ecosystem}\0${edge.specifier}`, edge,
    ])).values()].sort((a, b) =>
      a.from.localeCompare(b.from) || a.ecosystem.localeCompare(b.ecosystem) || a.specifier.localeCompare(b.specifier)),
    truncated,
    maxFiles,
    ...extractSymbolEvidence(sourceFiles, edges),
  };
}
