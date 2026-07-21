/**
 * MergeabilityService — a read-only pre-merge preflight for a workspace branch,
 * probed git-native through the same exec seam the conductor already trusts
 * (mirroring {@link PrStatusService}). For a workspace it runs, inside the
 * worktree:
 *
 *   - `git merge-tree --write-tree --name-only <base> <branch>` — a real,
 *     side-effect-free trial merge (writes to the object db only, touches no
 *     ref/worktree) whose exit code tells us clean (0) vs conflicting (1), and
 *     whose stdout on a conflict lists the conflicted paths;
 *   - `git rev-list --left-right --count <base>...<branch>` — the base-divergence
 *     counts (how far behind/ahead the branch is).
 *
 * It projects the answer into a truthful {@link MergeabilityView}. Degrade-truthful
 * throughout — it NEVER throws and NEVER fabricates a clean pass:
 *
 *  - no worktree / no branch ⇒ `available:false, verdict:'unknown'` with a
 *    truthful reason (before any exec);
 *  - no `git` on PATH ⇒ `available:false` with `reason:'git CLI not found'`;
 *  - a git too old for `merge-tree --write-tree/--name-only` ⇒ `available:false,
 *    verdict:'unknown'` (NEVER 'clean' — we could not judge, so we say so);
 *  - a real conflict ⇒ `available:true, verdict:'conflicting'` with the paths;
 *  - any other merge-tree fault ⇒ `available:false, verdict:'unknown'` + reason.
 *
 * Divergence is an INDEPENDENT probe: a rev-list fault degrades ahead/behind to
 * 0 without disturbing the conflict verdict. Probes are bounded so a hung git can
 * never stall the read edge.
 */
import { execFileSafe, which, ExecError } from '@recoder/substrate';
import type { ExecOptions, ExecResult } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';

/** `merge-tree` + `rev-list` are local — allow them the same bound as a PR probe. */
const MERGE_PREFLIGHT_TIMEOUT_MS = 6_000;
const MERGE_PREFLIGHT_MAX_BUFFER = 4 * 1024 * 1024;

/** The `GET /workspaces/:id/mergeability` payload. */
export interface MergeabilityView {
  /** Whether git could judge mergeability at all (false ⇒ no git / no worktree / git error / git too old). */
  readonly available: boolean;
  /** `'clean'` (trial merge succeeds), `'conflicting'` (real conflicts), or `'unknown'` (could not judge). */
  readonly verdict: 'clean' | 'conflicting' | 'unknown';
  /** Conflicted paths (populated only for `'conflicting'`; else empty). */
  readonly conflicts: readonly string[];
  /** Commits the branch is AHEAD of base (0 when unknown/degraded). */
  readonly ahead: number;
  /** Commits the branch is BEHIND base (0 when unknown/degraded). */
  readonly behind: number;
  /** The base ref the branch was compared against (mirrors the publish base rule). */
  readonly base: string;
  /** The workspace branch under preflight (`''` when the workspace has none). */
  readonly branch: string;
  /** Truthful reason when unavailable (never a fabricated success). */
  readonly reason?: string;
}

/** The exec surface the service probes with — injectable for tests. */
export interface MergeabilityExec {
  execFile: (
    bin: string,
    args: readonly string[],
    options: ExecOptions
  ) => Promise<ExecResult>;
  which: (bin: string) => Promise<string | undefined>;
}

export interface MergeabilityServiceDeps {
  readonly logger: Logger;
  /** Test seam; defaults to the real substrate exec helpers. */
  readonly exec?: MergeabilityExec;
}

const defaultExec: MergeabilityExec = {
  execFile: (bin, args, options) => execFileSafe(bin, args, options),
  which,
};

/**
 * Parse `git merge-tree --write-tree --name-only` conflict output into the bare
 * conflicted paths. Line 0 is the resulting tree-oid (dropped); the conflicted
 * files follow, one per line, until the FIRST blank line — that blank delimits
 * the file section from git's informational-messages block, which is excluded.
 * Trimmed, empties dropped, deduped. Robust to a trailing newline.
 */
export function parseMergeTreeConflicts(stdout: string): readonly string[] {
  const lines = stdout.split('\n');
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    // The blank line delimits the conflicted-files section from git's info block.
    if (line === '') break;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/**
 * Parse `git rev-list --left-right --count <base>...<branch>` output into the
 * divergence counts. Output is `<left>\t<right>` where left = commits only on
 * base (behind) and right = commits only on branch (ahead). Each is
 * finite-guarded, degrading to 0 on anything unparseable — never a guess.
 */
export function parseDivergence(stdout: string): { behind: number; ahead: number } {
  const [left, right] = stdout.trim().split(/\s+/);
  const behind = Number(left);
  const ahead = Number(right);
  return {
    behind: Number.isFinite(behind) ? behind : 0,
    ahead: Number.isFinite(ahead) ? ahead : 0,
  };
}

/**
 * Does a `merge-tree` failure mean "this git is too old for the preflight flags"
 * (vs. a real conflict or an unrelated fault)? A real conflict is exit code 1
 * with the tree written to stdout and an EMPTY stderr, so it can never match
 * here. We match only an unsupported-option / usage error naming `--write-tree`
 * or `--name-only`, or an explicit "merge-tree not supported".
 */
export function isOldGitMergeTree(err: ExecError): boolean {
  const text = `${err.message}\n${err.stderr}`.toLowerCase();
  const unsupportedOption =
    (text.includes('unknown option') || text.includes('usage')) &&
    (text.includes('write-tree') || text.includes('name-only'));
  const notSupported = text.includes('merge-tree') && text.includes('not supported');
  return unsupportedOption || notSupported;
}

export class MergeabilityService {
  private readonly log: Logger;
  private readonly exec: MergeabilityExec;

  constructor(deps: MergeabilityServiceDeps) {
    this.log = deps.logger;
    this.exec = deps.exec ?? defaultExec;
  }

  /** Resolve the workspace's merge preflight. Never throws. */
  async probe(workspace: Workspace): Promise<MergeabilityView> {
    const branch = workspace.branch;
    // Mirror the publish base rule (workspace-publish.ops.ts): baseRef unless it
    // is unset or the detached `HEAD`, in which case fall back to `main`.
    const base =
      workspace.baseRef && workspace.baseRef !== 'HEAD' ? workspace.baseRef : 'main';

    if (!workspace.worktreePath) {
      return {
        available: false,
        verdict: 'unknown',
        conflicts: [],
        ahead: 0,
        behind: 0,
        base,
        branch: branch ?? '',
        reason: 'workspace has no worktree',
      };
    }
    if (!branch) {
      return {
        available: false,
        verdict: 'unknown',
        conflicts: [],
        ahead: 0,
        behind: 0,
        base,
        branch: '',
        reason: 'workspace has no branch',
      };
    }

    const worktreePath = workspace.worktreePath;
    const options: ExecOptions = {
      timeoutMs: MERGE_PREFLIGHT_TIMEOUT_MS,
      maxBuffer: MERGE_PREFLIGHT_MAX_BUFFER,
    };

    let gitBin: string | undefined;
    try {
      gitBin = await this.exec.which('git');
    } catch {
      gitBin = undefined;
    }
    if (!gitBin) {
      return {
        available: false,
        verdict: 'unknown',
        conflicts: [],
        ahead: 0,
        behind: 0,
        base,
        branch,
        reason: 'git CLI not found',
      };
    }

    // --- mergeability: a side-effect-free trial merge -------------------------
    let available = false;
    let verdict: MergeabilityView['verdict'] = 'unknown';
    let conflicts: readonly string[] = [];
    let reason: string | undefined;
    try {
      await this.exec.execFile(
        gitBin,
        ['-C', worktreePath, 'merge-tree', '--write-tree', '--name-only', base, branch],
        options,
      );
      available = true;
      verdict = 'clean';
    } catch (err) {
      if (err instanceof ExecError) {
        if (isOldGitMergeTree(err)) {
          // We could not judge — say so. NEVER a fabricated 'clean'.
          reason = 'git too old for merge preflight';
        } else if (err.code === 1) {
          // Exit 1 with the tree on stdout is git's truthful "conflicts".
          available = true;
          verdict = 'conflicting';
          conflicts = parseMergeTreeConflicts(err.stdout);
        } else {
          reason = err.stderr.trim() || err.message;
          this.log.warn(
            { err, workspaceId: workspace.workspaceId },
            'conductor mergeability probe failed — reporting unavailable',
          );
        }
      } else {
        reason = err instanceof Error ? err.message : 'merge preflight failed';
      }
    }

    // --- divergence: an INDEPENDENT probe, zeroed only on its own failure ------
    let behind = 0;
    let ahead = 0;
    try {
      const { stdout } = await this.exec.execFile(
        gitBin,
        ['-C', worktreePath, 'rev-list', '--left-right', '--count', `${base}...${branch}`],
        options,
      );
      const divergence = parseDivergence(stdout);
      behind = divergence.behind;
      ahead = divergence.ahead;
    } catch {
      behind = 0;
      ahead = 0;
    }

    return {
      available,
      verdict,
      conflicts,
      ahead,
      behind,
      base,
      branch,
      ...(reason ? { reason } : {}),
    };
  }
}
