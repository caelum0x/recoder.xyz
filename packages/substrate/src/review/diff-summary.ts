/**
 * Diff-summary parsing — promoted verbatim from the duplicated `changedFiles`
 * logic in docker-backend/src/conductor/substrate-tmux.ts and
 * substrate-daytona.ts. Pure: counts the changed files a `git diff --stat`
 * reports (one line per file, each containing a `|` separator) plus the
 * untracked files (which a `--stat` against the base does not include).
 */

/**
 * Count changed files from a `git diff --stat` body plus the already-parsed
 * untracked list. `--stat` emits one `name | N +/-` line per tracked change and
 * a trailing summary line (no `|`); untracked files are counted separately.
 */
export function countChangedFiles(stat: string, untracked: readonly string[]): number {
  const trackedChanged = stat
    .trim()
    .split('\n')
    .filter((line) => line.includes('|')).length;
  return trackedChanged + untracked.length;
}
