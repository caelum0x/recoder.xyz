import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';

/**
 * Real, dependency-free repo scanning for the RecoderGit indexer.
 *
 * This module walks a repository on disk, finds TS/JS source files, and extracts
 * the static import/require/export-from edges between them. It resolves relative
 * specifiers against the filesystem so the resulting graph references real files,
 * not bare module specifiers. The output feeds {@link DependencyGraph} and the
 * reachability impact analysis.
 */

/** File extensions we treat as TS/JS source. */
export const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** Directory names we never descend into while walking. */
export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.turbo',
  'coverage',
  '.cache',
  '.vercel',
  '.output',
]);

/** Default cap on the number of files scanned, guarding against pathological repos. */
const DEFAULT_MAX_FILES = 20000;

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

export type ScanResult = {
  /** Repo-relative paths of every indexed source file (POSIX separators). */
  files: string[];
  /** Resolved internal edges (both endpoints are indexed source files). */
  edges: ParsedEdge[];
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

  const candidates: string[] = [];
  // Direct file (already has extension or resolves as-is).
  candidates.push(base);
  for (const ext of SOURCE_EXTENSIONS) {
    candidates.push(`${base}${ext}`);
  }
  // Index files when the specifier points at a directory.
  for (const ext of SOURCE_EXTENSIONS) {
    candidates.push(path.posix.join(base, `index${ext}`));
  }

  for (const candidate of candidates) {
    if (fileSet.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Scan a repository: walk its source files and parse every internal
 * import/require/export-from edge. Edges whose target resolves to an indexed
 * source file are kept; external/bare specifiers are dropped.
 */
export async function scanRepo(repoRoot: string, options: ScanOptions = {}): Promise<ScanResult> {
  const absoluteFiles = await walkSourceFiles(repoRoot, options);
  const relativeFiles = absoluteFiles.map((abs) => toRepoRelative(repoRoot, abs));
  const fileSet = new Set(relativeFiles);
  const edges: ParsedEdge[] = [];

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
    const specifiers = extractSpecifiers(source);
    for (const specifier of specifiers) {
      const resolved = resolveRelativeSpecifier(fromRelative, specifier, fileSet);
      if (resolved && resolved !== fromRelative) {
        edges.push({ from: fromRelative, to: resolved, specifier });
      }
    }
  }

  return { files: relativeFiles, edges };
}
