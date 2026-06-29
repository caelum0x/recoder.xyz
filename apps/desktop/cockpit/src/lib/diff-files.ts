/**
 * Parse the per-file change list out of a real WorkspaceDiff for the Conductor
 * right-pane file list (path + "+N" + a status icon).
 *
 * The backend's WorkspaceDiff carries the raw `git diff --stat` body (`stat`)
 * and the list of `untracked` files. We parse ONLY what the backend really
 * sent — never invent a file or a line count. A `git diff --stat` body looks
 * like:
 *
 *   src/App.tsx              |  12 +++++++-----
 *   src/components/Foo.tsx   |   4 ++--
 *    3 files changed, 16 insertions(+), 5 deletions(-)
 *
 * Source of truth: docker-backend conductor diff route → WorkspaceDiff.
 */
import type { WorkspaceDiff } from '../types';

export type DiffFileStatus = 'modified' | 'added';

export interface DiffFile {
  /** Repo-relative file path exactly as git reported it. */
  path: string;
  /** Changed-line count from the --stat column, or null when git showed "-". */
  changes: number | null;
  /** Untracked files are "added"; everything in the stat body is "modified". */
  status: DiffFileStatus;
}

/** Match a `git diff --stat` per-file row: `<path> | <N> <+/-bars>`. */
const STAT_ROW = /^\s*(.+?)\s+\|\s+(\d+|Bin|-)\s/;

/**
 * Build the per-file change list. Returns an empty array (never null) when the
 * diff is absent or carries no recognizable file rows, so callers can render a
 * truthful empty state without special-casing null.
 */
export function diffFileList(diff: WorkspaceDiff | null | undefined): DiffFile[] {
  if (!diff) return [];
  const files: DiffFile[] = [];

  const stat = typeof diff.stat === 'string' ? diff.stat : '';
  for (const line of stat.split('\n')) {
    // Skip the trailing "N files changed, …" summary line.
    if (/files? changed/.test(line)) continue;
    const m = STAT_ROW.exec(line);
    if (!m) continue;
    const path = m[1].trim();
    if (!path) continue;
    const rawCount = m[2];
    const changes = /^\d+$/.test(rawCount) ? Number(rawCount) : null;
    files.push({ path, changes, status: 'modified' });
  }

  const untracked = Array.isArray(diff.untracked) ? diff.untracked : [];
  for (const path of untracked) {
    if (typeof path !== 'string' || !path.trim()) continue;
    files.push({ path: path.trim(), changes: null, status: 'added' });
  }

  return files;
}
