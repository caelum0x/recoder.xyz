/**
 * `createOpenfangRuntimeSubstrate` — execution PATH (b): a NATIVE agent runtime
 * over the in-process openfang engine's `runAgent` loop, driven by the embedded
 * TensorZero inference gateway.
 *
 * This is the `in_process` ConductorSubstrate the `WorkspaceEngine` drives when a
 * workspace's runtime is openfang (the substrate the registry today reports "not
 * wired", substrate-registry.adapter.ts:77). Unlike the CLI path there is no bin
 * on PATH and no tmux pane: openfang is a native `.node` addon fused into THIS
 * process (engines/openfang-native.ts), so a "launch" is a direct method call.
 *
 * Inference routing (path b): the openfang kernel's model calls route through the
 * embedded TensorZero gateway WITHIN THE SAME shared `.node` — BYOK + metering
 * happen inside the kernel's gateway, so this adapter injects NO base-URL env (an
 * in-process gateway needs no loopback URL). That routing lives in
 * backend/engines (out of scope); this adapter only drives the agent loop and
 * feeds honest run state to the SAME run-tailer the CLI path uses.
 *
 * Shape mapping onto the substrate contract:
 *  - `launch(input)` — provisions the isolated git worktree (like the tmux path),
 *    then runs ONE openfang agent turn via the injected `runOpenfang`
 *    (engines' `launchOpenfangRun`) pointed at that worktree. NB: the napi call is
 *    SYNCHRONOUS + BLOCKING (Rust `block_on`) — it holds the event loop for the
 *    full turn; we await it and record the honest transcript + exit code. To keep
 *    ONE RunEvent flow for both paths we hand `launchOpenfangRun` a BUFFER sink
 *    (its events are captured for `capture()`, not double-emitted) and let the
 *    run-tailer be the single RunEvent source via capture/alive/exitCode.
 *  - `input.command` carries the (already-enriched) agent PROMPT for the turn.
 *    For the CLI path the engine resolves a shell line into `command`; for the
 *    in-process path the integrator sets `command` to the enriched prompt (which
 *    also bypasses the CLI-only `resolveRuntimeCommand`). Empty ⇒ truthful refusal.
 *  - `capture()` → the buffered transcript; `alive()` → false once the turn ran;
 *    `exitCode()` → 0 on success, 1 on a truthful engine failure.
 *
 * Degrade-safe + truthful: engine absent/boot-failed ⇒ `available:false` with a
 * reason and `launch()` refuses (throws → the engine records a `failed` workspace,
 * never a fabricated session); a runtime fault becomes exitCode 1 with the error
 * text as the transcript, never a faked success.
 */
import path from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import {
  execFileSafe,
  buildSubstrateDiff,
  type ExecOptions,
  type ExecResult,
  type LoggerPort,
  type SubstrateDiff,
} from '@recoder/substrate';
import type {
  ConductorSubstrate,
  SubstrateAvailability,
  SubstrateCapabilities,
  SubstrateHandle,
  SubstrateLaunchInput,
} from '../ports/substrate-registry.port.js';
import type { ConductorConfig } from '../config.js';
import {
  launchOpenfangRun as defaultLaunchOpenfangRun,
  getOpenfangEngine as defaultGetOpenfangEngine,
  type OpenfangLaunchInput,
  type OpenfangLaunchDeps,
  type OpenfangLaunchResult,
} from '../../engines/index.js';

/** The injectable child-process seam (default: the package's `execFileSafe`). */
export type ExecFn = (
  bin: string,
  args: readonly string[],
  options?: ExecOptions,
) => Promise<ExecResult>;

/** The engines `launchOpenfangRun` shape (injected so the adapter stays testable). */
export type OpenfangRunFn = (
  input: OpenfangLaunchInput,
  deps?: OpenfangLaunchDeps,
) => Promise<OpenfangLaunchResult>;

/** in_process worktrees are namespaced under this prefix (mirrors the tmux path). */
const SESSION_PREFIX = 'recoder-';

/** A no-op logger so the substrate works even when none is injected. */
const NOOP_LOGGER: LoggerPort = {
  info() {},
  warn() {},
  error() {},
};

/** Recorded outcome of one completed in-process turn (drives capture/alive/exitCode). */
interface TurnResult {
  readonly transcript: string;
  readonly exitCode: number;
  readonly repoPath: string;
  readonly worktreePath: string;
}

export interface CreateOpenfangRuntimeSubstrateDeps {
  /** Injected conductor config slice (`worktreeRoot`) for isolation provisioning. */
  readonly config: Pick<ConductorConfig, 'worktreeRoot'>;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: LoggerPort;
  /** Child-process seam for git worktree ops; defaults to `execFileSafe`. */
  readonly exec?: ExecFn;
  /**
   * The engines `launchOpenfangRun` (path b driver). Defaults to the engines
   * barrel export; injectable for tests. This is the LIVE reach into the engine
   * domain — a fully degrade-safe function (engine absent ⇒ `{available:false}`).
   */
  readonly runOpenfang?: OpenfangRunFn;
  /**
   * Truthful engine-presence probe for `available()`. Defaults to the engines
   * barrel `getOpenfangEngine` (boots + caches the kernel lazily). Injectable for
   * tests; never throws.
   */
  readonly probeEngine?: () => boolean;
  /** Clock — defaults to `() => new Date()`. */
  readonly now?: () => Date;
}

/** Deterministic worktree dir name for a workspace id (restart-survivable). */
function worktreeNameFor(id: string): string {
  return `${SESSION_PREFIX}${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/**
 * Build the `in_process` (native openfang) ConductorSubstrate. Register it via
 * `createSubstrateRegistry({ substrates: [createOpenfangRuntimeSubstrate(deps)] })`
 * so `Workspace.substrate === 'in_process'` launches route here.
 */
export function createOpenfangRuntimeSubstrate(
  deps: CreateOpenfangRuntimeSubstrateDeps,
): ConductorSubstrate {
  const logger = deps.logger ?? NOOP_LOGGER;
  const exec: ExecFn = deps.exec ?? execFileSafe;
  const runOpenfang: OpenfangRunFn = deps.runOpenfang ?? defaultLaunchOpenfangRun;
  const now = deps.now ?? ((): Date => new Date());
  const probeEngine =
    deps.probeEngine ?? ((): boolean => defaultGetOpenfangEngine() !== undefined);
  const worktreeRoot = deps.config.worktreeRoot;

  // Substrate-owned live state: completed-turn results by handle ref, and the
  // source repo per ref for teardown. Empty after a restart ⇒ capture/exit report
  // "gone" truthfully and teardown falls back to a direct dir remove.
  const results = new Map<string, TurnResult>();
  const repoByRef = new Map<string, string>();

  /** Truthful engine readiness (never throws; a boot failure ⇒ unavailable). */
  async function availability(): Promise<SubstrateAvailability> {
    let present = false;
    try {
      present = probeEngine();
    } catch (err) {
      logger.warn('openfang engine probe threw — reporting unavailable', {
        err: message(err),
      });
      present = false;
    }
    if (present) return { available: true };
    return {
      available: false,
      reason:
        'openfang native engine unavailable — addon not built or kernel boot failed ' +
        '(build: cd backend/engines/rust/openfang && cargo build -p openfang-napi --release)',
    };
  }

  return {
    id: 'in_process',

    capabilities(): SubstrateCapabilities {
      return {
        // In-process on the local host — not a remote sandbox.
        remote: false,
        // No PTY: the agent turn is a direct native call, not a terminal pane.
        supportsPty: false,
        supportsInteractiveKeys: false,
        // Output is read via capture() (buffered transcript) — polling model.
        capturesByPolling: true,
        supportsDiff: true,
        supportsIsolationRemoval: true,
      };
    },

    available(): Promise<SubstrateAvailability> {
      return availability();
    },

    async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
      const avail = await availability();
      if (!avail.available) {
        // Truthful refusal — never a fabricated turn (design §8 fail-safe).
        throw new Error(`in_process (openfang) unavailable (${avail.reason})`);
      }

      // For the in-process path `command` IS the enriched agent prompt.
      const prompt = (input.command ?? '').trim();
      if (!prompt) {
        throw new Error(
          'in_process (openfang) launch requires a prompt in input.command ' +
            '(the integrator sets it to the enriched prompt; empty ⇒ refuse, never fake)',
        );
      }

      const name = worktreeNameFor(input.workspaceId);
      const worktreePath = path.join(worktreeRoot, name);

      // Isolated worktree on its own branch — the openfang agent's file tools
      // operate inside it, exactly like the CLI path's tmux worktree.
      await exec('git', [
        '-C',
        input.repoPath,
        'worktree',
        'add',
        '-B',
        input.branch || `recoder/${input.workspaceId}`,
        worktreePath,
        input.baseRef || 'HEAD',
      ]);
      repoByRef.set(input.workspaceId, input.repoPath);

      // Buffer sink: capture the turn's `log` transcript for capture() WITHOUT
      // double-emitting RunEvents — the run-tailer is the single event source.
      const transcriptParts: string[] = [];
      const bufferSink: NonNullable<OpenfangLaunchDeps['sink']> = {
        append(event): void {
          if (event.type === 'log' && typeof event.message === 'string') {
            transcriptParts.push(event.message);
          }
        },
      };

      const runId = `run_${input.workspaceId}`;
      const taskId = input.env?.RECODER_TASK_ID ?? '';

      // ONE agent turn. SYNCHRONOUS + BLOCKING (see header). launchOpenfangRun is
      // itself fully degrade-safe and NEVER throws.
      const outcome = await runOpenfang(
        {
          workspaceId: input.workspaceId,
          taskId,
          runId,
          prompt,
          worktreePath,
        },
        { sink: bufferSink, now },
      );

      if (outcome.available === false) {
        // Raced from available:true to a boot failure — refuse truthfully so the
        // engine records a `failed` workspace (never a fabricated session).
        throw new Error(`in_process (openfang) unavailable (${outcome.reason})`);
      }

      const exitCode = outcome.ok ? 0 : 1;
      const transcript = outcome.ok
        ? outcome.response || transcriptParts.join('\n')
        : `openfang run failed: ${outcome.error}`;
      results.set(input.workspaceId, {
        transcript,
        exitCode,
        repoPath: input.repoPath,
        worktreePath,
      });

      logger.info('in_process (openfang) turn completed', {
        workspaceId: input.workspaceId,
        ok: outcome.ok,
        exitCode,
        worktreePath,
      });

      // ref = workspaceId (drives capture/exit/teardown); no session name (no pane).
      return { ref: input.workspaceId, worktreePath };
    },

    async capture(handle: SubstrateHandle): Promise<string | null> {
      const result = results.get(handle.ref);
      if (!result) return null; // handle gone / never recorded
      // Trailing newline so the tailer's prefix-delta emits the full transcript once.
      return result.transcript ? `${result.transcript}\n` : '';
    },

    async alive(): Promise<boolean> {
      // The turn ran to completion synchronously inside launch(); nothing is live.
      return false;
    },

    async exitCode(handle: SubstrateHandle): Promise<number | null | undefined> {
      const result = results.get(handle.ref);
      if (!result) return null; // gone (already torn down / post-restart)
      return result.exitCode;
    },

    async diff(handle: SubstrateHandle, baseRef: string): Promise<SubstrateDiff> {
      const cwd = handle.worktreePath ?? results.get(handle.ref)?.worktreePath;
      if (!cwd) throw new Error('in_process (openfang) diff requires a worktree path');
      const base = baseRef || 'HEAD';
      const [stat, patch, status] = await Promise.all([
        exec('git', ['-C', cwd, '--no-pager', 'diff', '--stat', base]),
        exec('git', ['-C', cwd, '--no-pager', 'diff', base]),
        exec('git', ['-C', cwd, 'status', '--porcelain']),
      ]);
      return buildSubstrateDiff({
        stat: stat.stdout,
        patch: patch.stdout,
        status: status.stdout,
      });
    },

    async teardown(
      handle: SubstrateHandle,
      options?: { removeIsolation?: boolean },
    ): Promise<void> {
      if (options?.removeIsolation !== false) {
        const repo = repoByRef.get(handle.ref) ?? results.get(handle.ref)?.repoPath;
        const wtPath =
          handle.worktreePath ??
          results.get(handle.ref)?.worktreePath ??
          path.join(worktreeRoot, worktreeNameFor(handle.ref));
        if (repo) {
          try {
            await exec('git', ['-C', repo, 'worktree', 'remove', '--force', wtPath]);
          } catch (err) {
            logger.warn('in_process worktree remove failed (best effort)', {
              ref: handle.ref,
              err: message(err),
            });
          }
        } else if (existsSync(wtPath)) {
          try {
            rmSync(wtPath, { recursive: true, force: true });
          } catch {
            /* best effort */
          }
        }
      }
      results.delete(handle.ref);
      repoByRef.delete(handle.ref);
      logger.info('in_process (openfang) workspace torn down', { ref: handle.ref });
    },
  };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
