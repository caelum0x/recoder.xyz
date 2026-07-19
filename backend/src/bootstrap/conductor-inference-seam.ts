/**
 * Conductor → inference composition-root seam — the small, PURE piece of wiring
 * that turns the conductor CLI substrate into a METERED inference caller (mirrors
 * {@link ./billing-seams.ts} / {@link ./interop-wire-seams.ts}).
 *
 * PROBLEM IT CLOSES: the `tmux_worktree` CLI substrate (Claude Code / Codex /
 * Cursor / opencode launched headless in an isolated worktree) is the BULK of real
 * agent LLM spend, yet it bypassed the TensorZero gateway entirely — no usage
 * ledger, no entitlement token-quota, no delivery-outcome audit. This seam builds
 * the substrate-level {@link ResolveInferenceEnv} hook the CLI adapter already
 * accepts, so every launched CLI is pointed at THIS backend's OpenAI-compatible
 * gateway edge (`napi → loopback → BYOK`) with a Recoder-minted `sk_` credential.
 * The gateway then meters tokens, enforces the entitlement quota, and records the
 * delivery outcome — the gateway becomes the UNIVERSAL inference spine for agent
 * runs, not just backend calls.
 *
 * DEGRADE-TRUTHFUL (the seam NEVER blocks a launch and NEVER fakes metering):
 *  - the gateway health probe reports `available:false` (no bound tier)  ⇒ `{}`
 *    (the CLI runs on its own BYOK keys, honestly UNMETERED — never blocked);
 *  - the `sk_` mint is unavailable (no DB / key store down)              ⇒ `{}`;
 *  - the probe or mint THROWS                                            ⇒ `{}`.
 * The returned env is merged UNDER the caller's env by the adapter, so any explicit
 * per-workspace override still wins.
 *
 * SCOPE (truthful partial fusion): the resolver is keyed only by the launch
 * context the substrate sees (workspaceId/repoPath/branch/env) — it does NOT hold
 * the run's principal or runtimeId, so it injects the OpenAI-compatible variables
 * (`OPENAI_BASE_URL` + `OPENAI_API_KEY`) and metering attributes to the minted
 * conductor service key. It intentionally does NOT set `ANTHROPIC_BASE_URL` (an
 * Anthropic-wire client pointed at an OpenAI-wire surface would break); runtimeId-
 * and principal-aware provider selection is the composer-level `InferenceAccessPort`
 * responsibility (hook e), which composes over — never fights — this base env.
 */
import type { InferenceHealth } from '../domains/inference/types.js';
import type {
  CliInferenceContext,
  ResolveInferenceEnv,
} from '../domains/conductor/adapters/cli-runtime.adapter.js';

/** Minimal logger surface (a subset of the shared logger; a no-op fits too). */
export interface SeamLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}

const NOOP_LOGGER: SeamLogger = { info() {}, warn() {} };

export interface CliInferenceEnvSeamDeps {
  /** The inference gateway — probed each launch to decide metered vs BYOK. */
  readonly gateway: { health(): Promise<InferenceHealth> };
  /**
   * The OpenAI-compatible base URL of THIS backend's gateway edge, e.g.
   * `http://127.0.0.1:3001/api/gateway/gateway/v1`. Loopback only (never a public
   * host): the CLI runs on the same box as the backend.
   */
  readonly baseUrl: string;
  /**
   * Mint (or resolve) the Recoder `sk_` credential the CLI presents to the gateway
   * (`Authorization: Bearer sk_…` → an `apikey` principal → metered subject).
   * Returns `null` when unmintable (no DB / key store down) ⇒ truthful skip. MUST
   * NOT throw across the seam (the caller treats a throw as a skip anyway).
   */
  readonly mintGatewayKey: () => Promise<string | null>;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: SeamLogger;
}

/**
 * Build the CLI substrate's {@link ResolveInferenceEnv} hook. The minted key is
 * memoized across launches (one conductor gateway credential per boot); the health
 * probe runs per launch so a gateway that comes up (or goes down) is reflected
 * truthfully without a restart.
 */
export function createCliInferenceEnvResolver(
  deps: CliInferenceEnvSeamDeps,
): ResolveInferenceEnv {
  const logger = deps.logger ?? NOOP_LOGGER;
  // Memoize the mint attempt: `undefined` = not yet attempted, `null` = attempted
  // and unavailable, string = the live key. A prior `null` is retried on the next
  // launch so a key store that recovers is picked up.
  let cachedKey: string | null | undefined;

  const resolveKey = async (): Promise<string | null> => {
    if (typeof cachedKey === 'string') return cachedKey;
    try {
      const key = await deps.mintGatewayKey();
      cachedKey = key && key.length > 0 ? key : null;
    } catch (err) {
      cachedKey = null;
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'cli-inference seam: gateway key mint failed — CLI runs unmetered (BYOK)',
      );
    }
    return cachedKey;
  };

  return async (ctx: CliInferenceContext): Promise<Record<string, string>> => {
    // 1. Is any inference tier bound + reachable? Down ⇒ truthful skip (BYOK).
    let health: InferenceHealth;
    try {
      health = await deps.gateway.health();
    } catch (err) {
      logger.warn(
        { workspaceId: ctx.workspaceId, err: err instanceof Error ? err.message : String(err) },
        'cli-inference seam: gateway health probe failed — CLI runs unmetered (BYOK)',
      );
      return {};
    }
    if (!health.available) {
      logger.info(
        { workspaceId: ctx.workspaceId, tier: health.tier },
        'cli-inference seam: no inference tier available — CLI runs unmetered (BYOK)',
      );
      return {};
    }

    // 2. A gateway is up — mint/resolve the credential the CLI authenticates with.
    const key = await resolveKey();
    if (!key) return {};

    // 3. Point the CLI's OpenAI-compatible client at the loopback gateway. The
    //    gateway resolves BYOK/platform keys server-side and meters the run.
    return {
      OPENAI_BASE_URL: deps.baseUrl,
      OPENAI_API_KEY: key,
      // A stable marker the launched agent/harness can read to confirm it is
      // gateway-routed + metered (never leaks the key material).
      RECODER_INFERENCE_GATEWAY: deps.baseUrl,
    };
  };
}
