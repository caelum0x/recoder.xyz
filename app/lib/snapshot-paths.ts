/**
 * Pure, dependency-free helpers for project-snapshot file/directory bookkeeping.
 *
 * These functions intentionally avoid any database, Prisma, or I/O imports so
 * they can be reasoned about and unit-tested in isolation. The DB-bound
 * snapshot module ({@link ./project-snapshots}) composes them.
 */

/**
 * Coerce an untrusted JSONB `files` value into a `Record<string, string>`,
 * dropping any entry whose value is not a string. Non-object / array inputs
 * collapse to an empty record.
 */
export function coerceFiles(files: unknown): Record<string, string> {
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(files as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

/**
 * Coerce an untrusted JSONB `directories` value into a sorted, de-duplicated
 * list of non-empty strings.
 */
export function coerceDirectories(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
      ),
    ),
  ).sort();
}

/**
 * Return every ancestor directory prefix of a file path, ordered shallow→deep.
 *
 * `src/components/Button.tsx` -> `['src', 'src/components']`.
 *
 * Leading/trailing slashes are tolerated and empty segments are ignored, so a
 * path never yields a blank ('') directory entry. A top-level file
 * (`index.ts`) yields no ancestors.
 */
export function ancestorDirectories(path: string): string[] {
  if (typeof path !== 'string') {
    return [];
  }

  const segments = path.split('/').filter((segment) => segment.length > 0);
  // The final segment is the file itself; only the segments before it are
  // directories.
  const dirSegments = segments.slice(0, -1);

  const ancestors: string[] = [];
  let current = '';
  for (const segment of dirSegments) {
    current = current ? `${current}/${segment}` : segment;
    ancestors.push(current);
  }

  return ancestors;
}

/**
 * Whether `path` is `prefix` itself or lives underneath it (`prefix/...`).
 * Used to drop files/directories when a whole subtree is removed.
 */
export function isUnderPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Rewrite a single path when a subtree is renamed from `from` to `to`.
 *
 * Returns the rewritten path when `path` is `from` or under `from/`, otherwise
 * returns the original path unchanged.
 */
export function renamePath(path: string, from: string, to: string): string {
  if (path === from || path.startsWith(`${from}/`)) {
    return `${to}${path.slice(from.length)}`;
  }
  return path;
}

export type SnapshotFileDelta = {
  files?: Record<string, string>;
  removePaths?: string[];
  removePathPrefixes?: string[];
  addDirectories?: string[];
  removeDirectories?: string[];
  renamePaths?: Array<{ from: string; to: string }>;
};

export type MergedSnapshotState = {
  files: Record<string, string>;
  directories: string[];
};

/**
 * Apply a snapshot delta to an existing `(files, directories)` state, purely.
 *
 * The merge order matters and mirrors the original inline implementation:
 *   1. upsert files (registering every ancestor directory of each new path),
 *   2. remove explicit paths,
 *   3. remove whole prefixes (files + their directories),
 *   4. apply renames (files + directories),
 *   5. add explicit directories,
 *   6. remove explicit directories.
 *
 * The returned `directories` list is sorted and de-duplicated.
 */
export function mergeSnapshotState(
  existing: { files?: Record<string, string>; directories?: string[] } | null | undefined,
  delta: SnapshotFileDelta,
): MergedSnapshotState {
  const mergedFiles: Record<string, string> = { ...(existing?.files || {}) };
  const mergedDirectories = new Set<string>(existing?.directories || []);

  // 1) Upsert files, registering ALL ancestor directories (not just the
  // immediate parent) so a nested file never leaves intermediate directories
  // missing from the tree.
  if (delta.files) {
    for (const [path, content] of Object.entries(delta.files)) {
      if (typeof content === 'string') {
        mergedFiles[path] = content;
        for (const ancestor of ancestorDirectories(path)) {
          mergedDirectories.add(ancestor);
        }
      }
    }
  }

  // 2) Remove explicit paths.
  for (const path of delta.removePaths || []) {
    delete mergedFiles[path];
  }

  // 3) Remove whole prefixes (matching files and their directories).
  for (const prefix of delta.removePathPrefixes || []) {
    for (const path of Object.keys(mergedFiles)) {
      if (isUnderPrefix(path, prefix)) {
        delete mergedFiles[path];
      }
    }
    for (const dir of Array.from(mergedDirectories)) {
      if (isUnderPrefix(dir, prefix)) {
        mergedDirectories.delete(dir);
      }
    }
  }

  // 4) Apply renames to both files and directories.
  for (const rename of delta.renamePaths || []) {
    const nextFiles: Record<string, string> = {};
    for (const [path, content] of Object.entries(mergedFiles)) {
      nextFiles[renamePath(path, rename.from, rename.to)] = content;
    }
    for (const path of Object.keys(mergedFiles)) {
      delete mergedFiles[path];
    }
    Object.assign(mergedFiles, nextFiles);

    const nextDirectories = new Set<string>();
    for (const dir of mergedDirectories) {
      nextDirectories.add(renamePath(dir, rename.from, rename.to));
    }
    mergedDirectories.clear();
    nextDirectories.forEach((dir) => mergedDirectories.add(dir));
  }

  // 5) Add explicit directories.
  for (const dir of delta.addDirectories || []) {
    if (dir) mergedDirectories.add(dir);
  }

  // 6) Remove explicit directories.
  for (const dir of delta.removeDirectories || []) {
    mergedDirectories.delete(dir);
  }

  return {
    files: mergedFiles,
    directories: Array.from(mergedDirectories).sort(),
  };
}
