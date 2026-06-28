/**
 * Untracked-file parsing — promoted verbatim from the duplicated logic in
 * docker-backend/src/conductor/substrate-tmux.ts and substrate-daytona.ts
 * (`git status --porcelain` → `??` lines). Pure: a string in, a list out.
 *
 * `git status --porcelain` prefixes untracked entries with `?? ` (two status
 * columns + a space). We take those lines, strip the 3-char prefix, trim, and
 * drop empties. This is the single source both substrates' diff() now share.
 */

/** Parse the untracked file paths from `git status --porcelain` output. */
export function parseUntracked(porcelainStatus: string): string[] {
  return porcelainStatus
    .split('\n')
    .filter((line) => line.startsWith('??'))
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}
