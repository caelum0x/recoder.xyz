/**
 * RepoSetupService — per-repo setup scripts + the worktree-create hook.
 *
 * Two responsibilities, one seam:
 *  1. CONFIG (governed): `getScript` / `setScript` read + write the per-repo
 *     setup script through the {@link RepoSetupStorePort}. `setScript` is a
 *     governed write — it runs the injected governance gate (`decide` before,
 *     `recordAudit` after) exactly like every other conductor mutation, so a
 *     policy deny truthfully blocks it (never a faked success).
 *  2. RUN HOOK (fire-and-forget): `runSetup` is called by the createWorkspace
 *     flow AFTER the worktree exists. It runs the configured script inside the
 *     new worktree, captures stdout/stderr + the real exit code, and returns a
 *     truthful {@link RepoSetupRunResult}. It NEVER throws and is NON-blocking to
 *     the run: no script configured is a truthful skip; a failing script is a
 *     captured failure the review can see — neither aborts the agent launch.
 *
 * The script runs via `bash -lc <script>` in the worktree with a bounded timeout
 * and buffer. Output is captured on success AND failure (the exec seam's
 * ExecError carries stdout/stderr/code), so a broken setup is surfaced, not
 * hidden. No secrets are logged; the payload sealed on `setScript` records only
 * the repo key + script length, never the script body.
 */
import { execFileSafe, ExecError } from '@recoder/substrate';
import type { ExecOptions, ExecResult } from '@recoder/substrate';
import type { Logger } from '../../../shared/logger.js';
import type { Principal } from '../../identity/types.js';
import type { GovernanceGatePort } from '../ports/index.js';
import type {
  RepoSetupConfig,
  RepoSetupStorePort,
} from '../ports/repo-setup-store.port.js';
import { readRepoConfigFile } from './repo-config-file.js';
import type { RepoConfigFile } from './repo-config-file.js';
import type { ConductorWriteResult } from '../conductor-module.js';
import {
  conductorAuditEntry,
  guardConductorWrite,
  recordConductorAudit,
} from '../audit/conductor-audit.js';

/** The governance action name for a repo-setup-script write. */
export const REPO_SETUP_ACTION = 'workspace.repo_setup';

/** Max script size accepted (64 KiB) — a fail-fast guard, never a silent trim. */
const MAX_SCRIPT_BYTES = 64 * 1024;

/** How long a setup script may run in a worktree before it is killed. */
const SETUP_TIMEOUT_MS = 5 * 60 * 1000;

/** Bounded capture buffer for setup output (4 MiB). */
const SETUP_MAX_BUFFER = 4 * 1024 * 1024;

/** The child-process seam the service runs setup scripts through (test-injectable). */
export type RepoSetupExec = (
  bin: string,
  args: readonly string[],
  options: ExecOptions
) => Promise<ExecResult>;

/** The truthful outcome of a setup-script run on worktree create. */
export interface RepoSetupRunResult {
  /** Whether the script actually ran (false ⇒ no script configured / skipped). */
  readonly ran: boolean;
  /** Whether the run exited 0 (absent when it did not run). */
  readonly ok?: boolean;
  /** The real process exit code (null = killed by signal; absent when not run). */
  readonly exitCode?: number | null;
  /** Captured stdout (bounded); present when the script ran. */
  readonly stdout?: string;
  /** Captured stderr (bounded); present when the script ran. */
  readonly stderr?: string;
  /** Truthful reason when it did not run or failed (never a fabricated success). */
  readonly reason?: string;
}

/** What `runSetup` needs to run a repo's script in a fresh worktree. */
export interface RunSetupInput {
  readonly repoKey: string;
  readonly worktreePath: string;
  /** For log correlation only. */
  readonly workspaceId?: string;
  /**
   * The workspace's stable dev-server port, injected into the script env as
   * `RECODER_PORT` so a setup step can pre-bind/echo it. Absent ⇒ not injected
   * (the script just doesn't see the var).
   */
  readonly recoderPort?: number;
}

export interface RepoSetupServiceDeps {
  readonly store: RepoSetupStorePort;
  readonly gate: GovernanceGatePort;
  readonly logger: Logger;
  /** Test seam; defaults to the real `execFileSafe`. */
  readonly exec?: RepoSetupExec;
  /** Injectable clock (defaults to the real one) — keeps `updatedAt` testable. */
  readonly now?: () => Date;
  /**
   * Committed-config reader seam (defaults to the real `readRepoConfigFile`).
   * The committed `.recoder/settings.json` is the DURABLE setup baseline — it
   * rides git, so it survives the backend restarts that empty the default
   * in-process governed store.
   */
  readonly readConfigFile?: (worktreePath: string) => Promise<RepoConfigFile>;
}

/** Where the effective setup script came from — surfaced so UI and executor agree. */
export type RepoSetupScriptSource = 'store' | 'file' | 'none';

/** The effective setup script for a repo + where it was resolved from. */
export interface ResolvedRepoSetupScript {
  /** The script to run; '' = none configured anywhere. */
  readonly script: string;
  readonly source: RepoSetupScriptSource;
}

/**
 * Derive a stable, path-safe repo key from a projectId (preferred) or repoPath.
 * A projectId is already a clean id and passes through lowercased; a path is
 * normalized (every non `[a-z0-9_-]` run → `__`) so a folder path is a safe key.
 * Empty input yields `'unknown'` — never a throw, never a fabricated key.
 */
export function repoKeyFor(
  projectId: string | undefined,
  repoPath: string | undefined
): string {
  const raw =
    (projectId && projectId.trim()) || (repoPath && repoPath.trim()) || '';
  if (!raw) return 'unknown';
  return raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '__');
}

export class RepoSetupService {
  private readonly store: RepoSetupStorePort;
  private readonly gate: GovernanceGatePort;
  private readonly log: Logger;
  private readonly exec: RepoSetupExec;
  private readonly now: () => Date;
  private readonly readConfigFile: (worktreePath: string) => Promise<RepoConfigFile>;

  constructor(deps: RepoSetupServiceDeps) {
    this.store = deps.store;
    this.gate = deps.gate;
    this.log = deps.logger;
    this.exec = deps.exec ?? execFileSafe;
    this.now = deps.now ?? (() => new Date());
    this.readConfigFile = deps.readConfigFile ?? readRepoConfigFile;
  }

  /** Read one repo's configured setup script, or null when none is set. */
  async getScript(repoKey: string): Promise<RepoSetupConfig | null> {
    return this.store.get(repoKey);
  }

  /**
   * Persist a repo's setup script — GATED (`workspace.repo_setup`). A deny blocks
   * the write and surfaces the verdict reason; an allow persists it and seals the
   * action into the audit chain (payload carries only repoKey + length, never the
   * script body). An empty string is a legal value: it clears the repo's script.
   */
  async setScript(
    repoKey: string,
    script: string,
    principal: Principal
  ): Promise<ConductorWriteResult<RepoSetupConfig>> {
    const { allowed, verdict } = await guardConductorWrite(
      this.gate,
      REPO_SETUP_ACTION,
      principal,
      {
        target: { environment: 'conductor' },
        metadata: { repoKey, scriptLength: script.length },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    if (Buffer.byteLength(script, 'utf8') > MAX_SCRIPT_BYTES) {
      return {
        ok: false,
        verdict,
        reason: `setup script exceeds ${MAX_SCRIPT_BYTES} bytes`,
      };
    }
    try {
      const stored = await this.store.set({
        repoKey,
        script,
        updatedBy: principal.userId,
        updatedAt: this.now().toISOString(),
      });
      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(REPO_SETUP_ACTION, principal, verdict, {
          repoKey,
          scriptLength: script.length,
        })
      );
      return { ok: true, verdict, value: stored };
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'repo setup write failed';
      this.log.warn({ err, repoKey }, 'conductor repo-setup setScript failed');
      return { ok: false, verdict, reason };
    }
  }

  /**
   * The effective setup script for a repo: a non-empty GOVERNED store script wins
   * as the override, else the COMMITTED `.recoder/settings.json` scripts.setup is
   * the durable baseline (it rides git, so it survives backend restarts that
   * empty the default in-process store). A store read fault falls through to the
   * committed file instead of aborting — degrade to the durable base, never to
   * silence. `setScript('')` therefore means "fall back to the committed
   * baseline"; suppressing a committed script takes an explicit no-op like `true`.
   */
  async resolveScript(
    repoKey: string,
    worktreePath: string
  ): Promise<ResolvedRepoSetupScript> {
    let stored: RepoSetupConfig | null = null;
    try {
      stored = await this.store.get(repoKey);
    } catch (err) {
      this.log.warn(
        { err, repoKey },
        'conductor repo-setup store read faulted — falling back to committed config'
      );
    }
    const storeScript = stored?.script?.trim();
    if (storeScript) {
      return { script: storeScript, source: 'store' };
    }
    const config = await this.readConfigFile(worktreePath);
    const fileScript = config.scripts.setup.trim();
    if (fileScript) {
      return { script: fileScript, source: 'file' };
    }
    return { script: '', source: 'none' };
  }

  /**
   * Run the repo's effective setup script inside a freshly-created worktree
   * (governed store override, else the committed file — see resolveScript).
   * Fire-and-forget + NON-blocking + degrade-safe: never throws; no script is a
   * truthful skip; a non-zero exit is a captured failure (not an abort). The
   * create flow calls this AFTER the worktree exists and does not await it.
   */
  async runSetup(input: RunSetupInput): Promise<RepoSetupRunResult> {
    const resolved = await this.resolveScript(input.repoKey, input.worktreePath);
    const script = resolved.script;
    if (!script) {
      return { ran: false, reason: 'no setup script configured' };
    }

    try {
      const result = await this.exec('bash', ['-lc', script], {
        cwd: input.worktreePath,
        timeoutMs: SETUP_TIMEOUT_MS,
        maxBuffer: SETUP_MAX_BUFFER,
        // Give the setup script the workspace's stable dev port (merged onto
        // process.env by the exec seam), matching what the run script will bind.
        ...(input.recoderPort != null ? { env: { RECODER_PORT: String(input.recoderPort) } } : {}),
      });
      this.log.info(
        { workspaceId: input.workspaceId, repoKey: input.repoKey },
        'conductor repo-setup script completed'
      );
      return {
        ran: true,
        ok: result.code === 0,
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (err) {
      // A non-zero exit / timeout / missing bash all land here. Capture the
      // truthful output+code from the typed ExecError instead of hiding it.
      if (err instanceof ExecError) {
        this.log.warn(
          {
            workspaceId: input.workspaceId,
            repoKey: input.repoKey,
            code: err.code,
          },
          'conductor repo-setup script failed (non-blocking)'
        );
        return {
          ran: true,
          ok: false,
          exitCode: err.code,
          stdout: err.stdout,
          stderr: err.stderr,
          reason: err.message,
        };
      }
      const reason = err instanceof Error ? err.message : 'setup script failed';
      this.log.warn(
        { err, workspaceId: input.workspaceId, repoKey: input.repoKey },
        'conductor repo-setup script errored (non-blocking)'
      );
      return { ran: true, ok: false, reason };
    }
  }
}
