/**
 * Conductor ENTITLEMENT GATE — the enforced seam between a workspace launch's
 * requested substrate and the user's real plan/entitlement.
 *
 * The conductor proposes a substrate (the create form, or @recoder/pal's planner
 * via `applyPalDefaults`). A remote substrate (`daytona`) is a PAID capacity:
 * it must only be honored when the launching user's plan actually grants the
 * `remote_substrate` capability. This module is the single place that turns a
 * verified `userId` into the authoritative plan (via the already-wired
 * `@recoder/distribution` module → recoder.xyz/Polar subscription state) and runs
 * distribution's `decideCapability('remote_substrate', plan)` to decide whether
 * the requested substrate is allowed.
 *
 * HARD CONTRACT (degrade-safe, fail-safe, behavior-preserving):
 *   - NEVER throws. Any resolver/billing/identity failure resolves to the FREE
 *     floor, which denies remote → the launch falls back to local `tmux_worktree`
 *     (the secure default). A launch is NEVER blocked by this gate.
 *   - NEVER fakes an entitlement. Billing unconfigured (no `POLAR_ACCESS_TOKEN`)
 *     ⇒ free tier ⇒ remote denied ⇒ local tmux. Plan inflation never happens here.
 *   - Only `daytona` (remote) is gated. A non-remote requested substrate
 *     (`tmux_worktree`, `in_process`, or unset) passes through UNCHANGED — the gate
 *     never upgrades a local request to remote and never alters the existing
 *     free/desktop-BYOK path.
 *   - SOLO / no-userId desktop: when there is no resolvable `userId` (embedded
 *     single-user desktop, solo mode, or an internal call), the gate does not have
 *     a subject to bill — it leaves the requested substrate UNCHANGED rather than
 *     downgrading the one local operator. Solo desktop on local tmux is unaffected;
 *     a solo user that explicitly pinned `daytona` keeps their pinned choice (the
 *     remote provider itself still fails safe if its keys are absent).
 *
 * The decision (and its truthful reason) is returned so the caller can ANNOTATE
 * the workspace record — the cockpit shows WHY a remote request fell back to local,
 * per the frontend rule "show evidence, never faked success".
 */
import {
  decideCapability,
  type CapabilityDecision,
  type Plan,
  type Subject,
} from '@recoder/distribution';
import type { WorkspaceSubstrate } from '@recoder/agent-os';
import { getDistributionModule } from '../distribution/module.js';
import { isSoloMode } from './solo-mode.js';
import { createLogger } from '../logger';

const logger = createLogger('conductor:entitlement-gate');

/** The capability that governs whether a remote execution substrate is allowed. */
const REMOTE_SUBSTRATE_CAPABILITY = 'remote_substrate' as const;

/** The remote substrate value that requires the paid `remote_substrate` capability. */
const REMOTE_SUBSTRATE: WorkspaceSubstrate = 'daytona';

/** The secure local default a denied remote request degrades to. */
const LOCAL_SUBSTRATE: WorkspaceSubstrate = 'tmux_worktree';

/** The fail-safe plan used whenever the real plan cannot be resolved. */
const FAIL_SAFE_PLAN: Plan = 'free';

export interface SubstrateEntitlementInput {
  /**
   * The verified launching user (from `authenticateRequest` → `req.userId`).
   * Absent for embedded single-user desktop / solo / internal calls — those keep
   * the requested substrate unchanged (see contract).
   */
  readonly userId?: string;
  /** The substrate the conductor proposes (caller-pinned or pal-defaulted). */
  readonly requestedSubstrate?: WorkspaceSubstrate;
}

export interface SubstrateEntitlementResult {
  /** The substrate to actually launch on (possibly downgraded to local tmux). */
  readonly substrate: WorkspaceSubstrate;
  /** The plan the decision was made against (fail-safe `free` on any failure). */
  readonly plan: Plan;
  /** True when the gate downgraded a remote request to the local default. */
  readonly downgraded: boolean;
  /** The underlying capability decision when a remote request was evaluated. */
  readonly decision?: CapabilityDecision;
  /** A truthful, human-readable reason a remote request was/ wasn't honored. */
  readonly reason?: string;
}

/**
 * Resolve the authoritative plan for a user without ever throwing. Wired to the
 * already-composed distribution module (`auth.getUserProfile` → `livePlanResolver`
 * → `resolveUserTier`, i.e. recoder.xyz/Polar subscription state). Any failure —
 * unresolved user, resolver error, billing unconfigured — returns the free floor.
 */
async function resolvePlanSafe(userId: string): Promise<Plan> {
  try {
    const mod = getDistributionModule();
    const profile = await mod.auth.getUserProfile(userId);
    return profile?.plan ?? FAIL_SAFE_PLAN;
  } catch (err) {
    logger.warn(
      { userId, err },
      'plan resolution failed; falling back to free tier (remote substrate will be denied)'
    );
    return FAIL_SAFE_PLAN;
  }
}

/**
 * Decide the EFFECTIVE substrate for a workspace launch, enforcing the
 * `remote_substrate` entitlement. See the module contract — degrade-safe,
 * fail-safe, behavior-preserving, never throws, never blocks a launch.
 *
 * Returns the requested substrate unchanged for any non-remote request, for
 * solo / no-userId desktop, and on any resolution failure (the secure default for
 * a remote request on an unresolved/free subject is local tmux).
 */
export async function decideSubstrateEntitlement(
  input: SubstrateEntitlementInput
): Promise<SubstrateEntitlementResult> {
  const requested = input.requestedSubstrate;

  // Only a REMOTE request is gated. A local/unset request is never altered — the
  // gate never upgrades to remote and never touches the free/desktop-BYOK path.
  if (requested !== REMOTE_SUBSTRATE) {
    return {
      substrate: requested ?? LOCAL_SUBSTRATE,
      plan: FAIL_SAFE_PLAN,
      downgraded: false,
    };
  }

  // No billable subject (embedded single-user desktop, solo mode, internal call):
  // keep the user's explicit remote choice rather than downgrading the one local
  // operator. The remote provider itself still fails safe if its keys are absent.
  if (!input.userId || isSoloMode()) {
    return {
      substrate: REMOTE_SUBSTRATE,
      plan: FAIL_SAFE_PLAN,
      downgraded: false,
      reason: input.userId
        ? 'solo mode: remote substrate honored for the single local operator'
        : 'no verified user on the request; remote substrate honored for the local operator',
    };
  }

  try {
    const mod = getDistributionModule();
    const plan = await resolvePlanSafe(input.userId);
    const subject: Subject = { subjectId: input.userId, kind: 'user' };
    const decision = await decideCapability(
      { resolver: mod.resolver, secrets: mod.secrets },
      subject,
      REMOTE_SUBSTRATE_CAPABILITY,
      plan
    );

    if (decision.allowed) {
      return { substrate: REMOTE_SUBSTRATE, plan, downgraded: false, decision };
    }

    // Denied → degrade to the secure local default with a truthful reason.
    const reason =
      decision.message ??
      `plan '${plan}' does not grant remote substrate; using local '${LOCAL_SUBSTRATE}'`;
    logger.info(
      { userId: input.userId, plan, reason: decision.reason },
      'remote substrate denied by entitlement; downgrading to local tmux'
    );
    return {
      substrate: LOCAL_SUBSTRATE,
      plan,
      downgraded: true,
      decision,
      reason,
    };
  } catch (err) {
    // Fail safe: any unexpected failure denies the paid remote capacity.
    logger.warn(
      { userId: input.userId, err },
      'entitlement gate failed; failing safe to local tmux (remote denied)'
    );
    return {
      substrate: LOCAL_SUBSTRATE,
      plan: FAIL_SAFE_PLAN,
      downgraded: true,
      reason:
        'entitlement resolution failed; remote substrate denied (fail safe), using local tmux',
    };
  }
}
