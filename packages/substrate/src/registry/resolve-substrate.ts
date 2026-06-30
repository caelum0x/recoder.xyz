/**
 * resolveSubstrate — DEGRADE-SAFE substrate resolution for the Daytona flip.
 *
 * `selectSubstrate` is the pure mapping `Workspace.substrate → impl` (it throws
 * if the id is not registered). That is correct for the local path and stays
 * behavior-preserving.
 *
 * The remote-substrate flip needs one more guarantee from the GOAL: choosing
 * `daytona` must NEVER block a launch when Daytona is unconfigured or
 * unreachable — it must fall back to the local substrate. This helper layers
 * that fallback on top of `selectSubstrate` WITHOUT changing it:
 *
 *   1. Resolve the requested substrate from the registry.
 *   2. If it is unavailable (truthful `available():{available:false}`) AND a
 *      different local fallback is registered and itself available, use the
 *      fallback and report the downgrade in `reason`.
 *   3. Otherwise honor the requested substrate (even if unavailable — the
 *      caller's own `available()` gate / launch error stays truthful; we never
 *      fabricate readiness).
 *
 * The requested substrate is only downgraded when a genuinely-ready fallback
 * exists, so a single-substrate registry behaves exactly like `selectSubstrate`.
 */
import type { WorkspaceSubstrate } from '@recoder/agent-os';
import type { ConductorSubstrate } from '../contract/index.js';
import type { SubstrateRegistry } from './registry.js';
import { selectSubstrate, type SubstrateSelectable } from './select.js';

/** The local substrate to fall back to when a remote choice is unavailable. */
const DEFAULT_FALLBACK: WorkspaceSubstrate = 'tmux_worktree';

export interface ResolveSubstrateOptions {
  /**
   * Substrate to fall back to when the requested one is unavailable.
   * Defaults to `tmux_worktree` (the local path). Pass `null` to disable
   * fallback and get strict `selectSubstrate` behavior.
   */
  fallback?: WorkspaceSubstrate | null;
}

export interface ResolvedSubstrate {
  /** The substrate the workspace should actually run on. */
  substrate: ConductorSubstrate;
  /** The substrate the caller asked for. */
  requested: WorkspaceSubstrate;
  /** True when we downgraded the requested substrate to the fallback. */
  degraded: boolean;
  /** Human-readable reason for a downgrade (undefined when not degraded). */
  reason?: string;
}

/**
 * Resolve the substrate for a workspace, degrading a remote choice to the local
 * fallback when the remote one is not ready. Never throws for an unavailable
 * requested substrate as long as it is registered; it only throws (via
 * `selectSubstrate`) when the requested id is not registered at all.
 */
export async function resolveSubstrate(
  registry: SubstrateRegistry,
  workspace: SubstrateSelectable,
  options: ResolveSubstrateOptions = {},
): Promise<ResolvedSubstrate> {
  const requested = workspace.substrate;
  const chosen = selectSubstrate(registry, workspace);

  const fallbackId = options.fallback === undefined ? DEFAULT_FALLBACK : options.fallback;

  // No fallback configured, or the request already IS the fallback → honor it.
  if (fallbackId === null || fallbackId === requested) {
    return { substrate: chosen, requested, degraded: false };
  }

  const availability = await chosen.available();
  if (availability.available) {
    return { substrate: chosen, requested, degraded: false };
  }

  // Requested substrate is not ready — try the local fallback, but only use it
  // if it is registered AND itself available (otherwise stay truthful and keep
  // the requested one so its own error surfaces).
  const fallback = registry.tryGet(fallbackId);
  if (!fallback) {
    return { substrate: chosen, requested, degraded: false };
  }
  const fallbackAvailability = await fallback.available();
  if (!fallbackAvailability.available) {
    return { substrate: chosen, requested, degraded: false };
  }

  const reason =
    `requested substrate '${requested}' unavailable` +
    (availability.reason ? ` (${availability.reason})` : '') +
    `; degraded to '${fallbackId}'`;
  return { substrate: fallback, requested, degraded: true, reason };
}
