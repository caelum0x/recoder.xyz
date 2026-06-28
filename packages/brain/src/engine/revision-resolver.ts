import { execFile } from "node:child_process";
import type { Revision } from "../domain/revision";
import type { ClockPort } from "../ports/clock.port";
import { systemClock } from "../ports/clock.port";

/**
 * Resolve the {@link Revision} a context is assembled against — the git HEAD sha
 * and whether the working tree is dirty. This is what makes a new commit
 * invalidate stale repo intelligence: the head sha is folded into the cache key,
 * so a fresh commit yields a fresh key.
 *
 * The git IO is injectable (`runGit`) so the resolver is deterministic in tests
 * (no real repo needed). The real default shells `git rev-parse HEAD` +
 * `git status --porcelain` with a short timeout.
 *
 * Fail-safe (brain's law): a repo with no git, an unreachable git binary, or a
 * thrown command NEVER throws here. It degrades to a stable sentinel head
 * ("no-head") marked dirty, so the cache still keys consistently for that repo
 * within a process and a real head — once available — naturally supersedes it.
 */

/** Runs a git subcommand in a repo and resolves its stdout (the test fakes this). */
export type GitRunner = (
  repoRoot: string,
  args: readonly string[],
) => Promise<string>;

export interface ResolveRevisionOptions {
  /** Override the git runner (defaults to a short-timeout execFile of `git`). */
  readonly runGit?: GitRunner;
  /** Clock for the resolvedAt stamp (defaults to the system clock). */
  readonly clock?: ClockPort;
}

/** The head used when git cannot be read — stable within a repo, marked dirty. */
export const NO_HEAD_SENTINEL = "no-head";

const GIT_TIMEOUT_MS = 4000;

/** Default git runner: spawn `git`, collect stdout, short timeout. */
function defaultRunGit(
  repoRoot: string,
  args: readonly string[],
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(
      "git",
      ["-C", repoRoot, ...args],
      { timeout: GIT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/**
 * Resolve the current revision of `repoRoot`. Pure given an injected `runGit`
 * and `clock`. Never throws: any git failure degrades to the dirty sentinel.
 */
export async function resolveRevision(
  repoRoot: string,
  options: ResolveRevisionOptions = {},
): Promise<Revision> {
  const runGit = options.runGit ?? defaultRunGit;
  const clock = options.clock ?? systemClock;
  const resolvedAt = clock.nowIso();

  let head: string;
  try {
    head = (await runGit(repoRoot, ["rev-parse", "HEAD"])).trim();
    if (!head) {
      return { head: NO_HEAD_SENTINEL, dirty: true, resolvedAt };
    }
  } catch {
    // No git / no HEAD / unreachable — degrade to a stable dirty sentinel.
    return { head: NO_HEAD_SENTINEL, dirty: true, resolvedAt };
  }

  let dirty = false;
  try {
    const status = (await runGit(repoRoot, ["status", "--porcelain"])).trim();
    dirty = status.length > 0;
  } catch {
    // Couldn't read the working-tree state — be conservative and treat as dirty
    // so we never reuse a context across an unobserved edit.
    dirty = true;
  }

  return { head, dirty, resolvedAt };
}
