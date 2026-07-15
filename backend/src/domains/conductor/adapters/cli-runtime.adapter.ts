/**
 * `createCliRuntimeSubstrate` — execution PATH (a): the external coding-agent CLI
 * (Claude Code / Codex / Cursor / opencode / …, via the interop-wire runtime
 * connectors) launched headless inside an isolated tmux + git-worktree.
 *
 * This is the `tmux_worktree` ConductorSubstrate the `WorkspaceEngine` drives for
 * every CLI runtime. Mechanically it REUSES the proven `createTmuxSubstrate`
 * (worktree provisioning, remain-on-exit, capture/alive/exitCode/diff/teardown) —
 * the value it adds on top is the INFERENCE-ROUTING seam: an optional
 * `resolveInferenceEnv` hook whose env (provider base-URL → the backend
 * OpenAI-compat gateway + a Recoder-minted key) is merged UNDER the launch env so
 * every token the CLI spends is metered through the inference domain's ledger.
 *
 * The seam law is obeyed end to end:
 *  - it delegates to an injected inner `ConductorSubstrate` (default: a fresh
 *    tmux substrate over the same config), so it never re-implements tmux;
 *  - the inference resolver NEVER throws across the boundary — a resolver fault or
 *    absence degrades to launching with the caller's env unchanged (BYOK still
 *    works, metering is simply skipped + logged), never a blocked launch;
 *  - the caller's `input.env` always WINS over the resolved base, so a
 *    composer-level `InferenceAccessPort` injection (hook e) and this
 *    substrate-level resolver compose without fighting.
 *
 * runtimeId-aware provider selection (ANTHROPIC_BASE_URL vs OPENAI_BASE_URL) is
 * the composer's `InferenceAccessPort` responsibility (it holds the principal +
 * runtimeId); this seam is the LAST-MILE application point at the substrate and is
 * keyed only by the launch context the substrate actually sees.
 */
import {
  execFileSafe,
  type ExecOptions,
  type ExecResult,
  type LoggerPort,
} from '@recoder/substrate';
import type {
  ConductorSubstrate,
  SubstrateLaunchInput,
  SubstrateHandle,
} from '../ports/substrate-registry.port.js';
import type { ConductorConfig } from '../config.js';
import { createTmuxSubstrate } from './tmux-substrate.adapter.js';

/** The injectable child-process seam (default: the package's `execFileSafe`). */
export type ExecFn = (
  bin: string,
  args: readonly string[],
  options?: ExecOptions,
) => Promise<ExecResult>;

/** The launch context the substrate-level inference resolver is keyed by. */
export interface CliInferenceContext {
  readonly workspaceId: string;
  readonly repoPath: string;
  readonly branch: string;
  /** The env the caller/composer already assembled (read-only; do not mutate). */
  readonly env: Readonly<Record<string, string>>;
}

/**
 * Resolve the inference-routing env for a CLI launch (provider base-URL + minted
 * key). MUST be degrade-safe: return `{}` when no tier is bound / no key issuer —
 * the CLI then uses its own BYOK keys with no metering. NEVER throws.
 */
export type ResolveInferenceEnv = (
  ctx: CliInferenceContext,
) => Promise<Record<string, string>> | Record<string, string>;

/** A no-op logger so the substrate works even when none is injected. */
const NOOP_LOGGER: LoggerPort = {
  info() {},
  warn() {},
  error() {},
};

export interface CreateCliRuntimeSubstrateDeps {
  /** Injected conductor config slice (`tmuxBin` + `worktreeRoot`) for the inner tmux substrate. */
  readonly config: Pick<ConductorConfig, 'tmuxBin' | 'worktreeRoot'>;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: LoggerPort;
  /** Child-process seam forwarded to the inner tmux substrate; defaults to `execFileSafe`. */
  readonly exec?: ExecFn;
  /**
   * Pre-built inner substrate to delegate the real tmux/worktree mechanics to.
   * Defaults to a fresh `createTmuxSubstrate` over the same config/exec/logger.
   * Injectable so tests can supply a fake and the composer can share one instance.
   */
  readonly inner?: ConductorSubstrate;
  /**
   * OPTIONAL inference-routing env resolver (metering). Absent ⇒ launches with the
   * caller's env unchanged (no metering). Present ⇒ its env is merged UNDER
   * `input.env` (caller wins) before the inner launch.
   */
  readonly resolveInferenceEnv?: ResolveInferenceEnv;
}

/**
 * Build the CLI execution-path (`tmux_worktree`) ConductorSubstrate. Register it
 * via `createSubstrateRegistry({ substrates: [createCliRuntimeSubstrate(deps)] })`
 * in place of the bare tmux substrate to gain inference routing on the CLI path.
 */
export function createCliRuntimeSubstrate(
  deps: CreateCliRuntimeSubstrateDeps,
): ConductorSubstrate {
  const logger = deps.logger ?? NOOP_LOGGER;
  const inner =
    deps.inner ??
    createTmuxSubstrate({
      config: deps.config,
      logger,
      ...(deps.exec ? { exec: deps.exec } : {}),
    });
  const resolveInferenceEnv = deps.resolveInferenceEnv;

  /** Merge the resolved inference env UNDER the caller's env; degrade-safe. */
  async function withInferenceEnv(
    input: SubstrateLaunchInput,
  ): Promise<SubstrateLaunchInput> {
    if (!resolveInferenceEnv) return input;
    let resolved: Record<string, string> = {};
    try {
      resolved = await resolveInferenceEnv({
        workspaceId: input.workspaceId,
        repoPath: input.repoPath,
        branch: input.branch,
        env: input.env ?? {},
      });
    } catch (err) {
      // A metering-env hiccup must NEVER block a launch the gate already allowed.
      logger.warn('cli-runtime inference env resolve failed — launching without metering', {
        workspaceId: input.workspaceId,
        err: message(err),
      });
      return input;
    }
    const keys = Object.keys(resolved);
    if (keys.length === 0) {
      // Truthful skip: no bound tier / no key issuer — BYOK, no metering.
      logger.info('cli-runtime inference routing skipped (no bound tier) — CLI uses BYOK keys', {
        workspaceId: input.workspaceId,
      });
      return input;
    }
    logger.info('cli-runtime inference routing applied — CLI tokens metered via gateway', {
      workspaceId: input.workspaceId,
      injected: keys,
    });
    // Resolved is the BASE; the caller's env wins on any key collision.
    return { ...input, env: { ...resolved, ...(input.env ?? {}) } };
  }

  return {
    id: 'tmux_worktree',
    capabilities: () => inner.capabilities(),
    available: () => inner.available(),
    async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
      return inner.launch(await withInferenceEnv(input));
    },
    capture: (handle, lines) => inner.capture(handle, lines),
    alive: (handle) => inner.alive(handle),
    // `exitCode` is optional on the contract — forward it only when the inner
    // substrate can observe one (a fabricated method would break "unknown" semantics).
    ...(inner.exitCode ? { exitCode: (handle: SubstrateHandle) => inner.exitCode!(handle) } : {}),
    diff: (handle, baseRef) => inner.diff(handle, baseRef),
    teardown: (handle, options) => inner.teardown(handle, options),
  };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
