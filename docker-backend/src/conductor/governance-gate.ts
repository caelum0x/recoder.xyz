/**
 * Conductor governance gate — backs the delivery approval path with the real
 * @recoder/governance subsystem.
 *
 * The conductor's delivery gate (delivery-approval.ts) already enforces the
 * production rule: a PR/merge is a customer-visible delivery and requires a
 * control-plane Approval record. This module makes that gate *risk-aware* by
 * routing every delivery through `Governance.decide()` BEFORE the approval-record
 * check. Governance runs the real fused pipeline — the tier-classifier, the
 * approval risk-tier policy, the deny-biased policy chain (composing
 * @recoder/agent-policy), and the SHA-256 Merkle audit chain — and returns a
 * verdict the conductor enforces:
 *
 *   - `deny`           -> hard block (never deliver). The conductor surfaces 409 /
 *                         awaiting_approval; the human cannot override with a stale
 *                         Approval record because governance vetoed the action.
 *   - `needs_approval` -> the action is risky; it proceeds ONLY if the conductor's
 *                         control-plane Approval record exists (the human sign-off
 *                         that satisfies the gate). This is the existing
 *                         awaiting_approval/409 contract, now backed by a real risk
 *                         verdict + Merkle audit entry.
 *   - `allow`          -> governance cleared it (e.g. autonomous mode within the
 *                         configured tier ceiling); the conductor may proceed.
 *
 * The subsystem is ADDITIVE: governance decides risk and records the audit trail;
 * the conductor enforces what the verdict returns. The proven launch path and the
 * mounted routes are untouched.
 *
 * Rust kernel seam: when the OWNED governance daemon binary
 * (crates/recoder-governance) is present — or an externally-managed daemon has
 * published `GOVERNANCE_SOCKET` — the gate builds its `Governance` with that
 * `daemonSocketPath`, so every delivery `decide()` goes through the real Rust
 * kernel over the UDS. When the binary is absent the gate degrades to the pure-TS
 * deny-biased path (verdict.degraded === true). The daemon is never BUILT here; we
 * only spawn/connect a prebuilt binary (see governance-daemon.ts).
 *
 * Degrade-safe: whether the daemon is up or not, the fallback is real governance —
 * it never produces a silent allow. If building the governance instance itself
 * fails, `decideDelivery` fails CLOSED (returns a synthetic deny verdict) so the
 * conductor still blocks rather than auto-delivers.
 */
import type { AgentProfile, Workspace } from '@recoder/agent-os';
import {
  Governance,
  createGovernanceRequest,
  unroutable,
  verdictBlocks,
  type GovernanceVerdict,
} from '@recoder/governance';
import { createLogger } from '../logger';
import type { DeliveryAction } from './delivery-approval.js';
import { ensureGovernanceDaemon } from './governance-daemon.js';

const logger = createLogger('conductor:governance-gate');

/**
 * Map a conductor DeliveryAction to the governance action whose intrinsic risk
 * tier the policy chain reasons about:
 *   - a PR opens by pushing the branch and creating the PR -> `pr.create`
 *   - a merge lands the branch (a push to the protected base) -> `branch.push`
 * Both classify to the `high` base tier, so both require a risk verdict.
 */
const ACTION_MAP: Record<DeliveryAction, 'pr.create' | 'branch.push'> = {
  pr: 'pr.create',
  merge: 'branch.push',
};

let governanceSingleton: Promise<Governance> | undefined;

/**
 * Lazily build (once) the conductor's Governance instance. Audit is enabled so
 * every delivery decision is sealed into the Merkle chain. Auto-approve is OFF by
 * default: a delivery only clears the needs_approval gate via a real control-plane
 * Approval record (or an explicit autonomous context), never silently.
 *
 * Rust kernel seam: ensure the owned governance daemon (crates/recoder-governance)
 * is up FIRST. When its prebuilt binary is present, `ensureGovernanceDaemon()`
 * spawns it and returns the UDS path, which we hand to `Governance.create` as
 * `daemonSocketPath` so `decide()` delegates to the real Rust kernel (per-call
 * degrade-safe to the pure-TS path on any daemon fault). When no binary exists the
 * daemon resolve is `undefined` and we build the daemon-less (pure-TS) Governance —
 * identical to the prior behavior. The daemon is never built here.
 */
function getGovernance(): Promise<Governance> {
  if (!governanceSingleton) {
    governanceSingleton = (async () => {
      let daemonSocketPath: string | undefined;
      try {
        const daemon = await ensureGovernanceDaemon();
        daemonSocketPath = daemon?.socketPath;
      } catch (err) {
        // A daemon-spawn problem must never block governance construction — we
        // simply build the pure-TS instance and degrade truthfully.
        logger.warn({ err }, 'governance daemon ensure failed — building pure-TS governance');
        daemonSocketPath = undefined;
      }
      return Governance.create({ auditEnabled: true, daemonSocketPath });
    })();
  }
  return governanceSingleton;
}

/** Reset the singleton (test seam only). */
export function __resetGovernanceForTest(): void {
  governanceSingleton = undefined;
}

/**
 * A delivery actor profile whose permissions reflect that the conductor itself
 * does NOT hold standing git-write / PR-creation rights — those require approval.
 * This is what makes the upstream @recoder/agent-policy `evaluateApprovalRequired`
 * rule fire (`branch.push`/`pr.create` without standing permission -> needs_approval),
 * which the tier-classifier then fuses to the `high` risk tier.
 *
 * When the operator has explicitly granted the delivery (an approved control-plane
 * Approval exists, or the workspace is marked safe automation), the caller passes
 * `autonomous: true` in the request context so the governance auto-approver may
 * clear the gate — governance stays the decider, the approval record is the input.
 */
function buildDeliveryActor(workspace: Workspace): AgentProfile {
  const now = new Date().toISOString();
  return {
    agentId: `conductor:${workspace.runtimeId}`,
    displayName: 'Recoder Conductor (delivery)',
    vendorSurface: 'recoder_code',
    connectorId: 'conductor',
    runtimeKind: 'local',
    capabilities: [{ capabilityId: 'deployment', kind: 'deployment', label: 'Delivery' }],
    tools: [],
    supportedTaskIntents: [],
    permissions: {
      defaultFileEffect: 'deny',
      pathRules: [],
      toolRules: [],
      allowNetwork: true,
      allowShell: true,
      // No standing delivery rights — delivery must be governed/approved.
      allowGitWrite: false,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: true,
    },
    approvalPolicy: { mode: 'policy', requiredRules: [], allowAutoApprovalForLowRisk: false },
    memoryScope: 'repo',
    cwdPolicy: { mode: 'workspace_root', allowedRoots: workspace.worktreePath ? [workspace.worktreePath] : [] },
    health: { status: 'healthy', checkedAt: now },
    lastSeenAt: now,
  };
}

export interface DeliveryGovernanceDecision {
  /** The full governance verdict (effect, tier, policy, routing, audit hash). */
  readonly verdict: GovernanceVerdict;
  /** Convenience: whether the verdict blocks (deny OR needs_approval). */
  readonly blocks: boolean;
  /** Convenience: a hard deny that NO approval record may override. */
  readonly hardDeny: boolean;
  /** The Merkle audit tip hash that sealed this decision, when audit is on. */
  readonly auditHash?: string;
  /** Truthful: the verdict used the degraded pure-TS fallback (daemon deferred). */
  readonly degraded: boolean;
}

/**
 * Route a delivery action through @recoder/governance and return its verdict.
 *
 * `approvedByControlPlane` is true when the conductor already holds an approved
 * control-plane Approval (or the workspace is explicitly safe automation). That
 * human sign-off is passed to governance as `autonomous` context so the governance
 * auto-approver may legitimately clear the needs_approval gate — governance remains
 * the decider, the approval record is the evidence it consumes.
 *
 * Never throws. If governance cannot be constructed/queried, fails CLOSED with a
 * synthetic deny verdict so the conductor blocks rather than auto-delivers.
 */
export async function decideDelivery(
  workspace: Workspace,
  action: DeliveryAction,
  approvedByControlPlane: boolean,
): Promise<DeliveryGovernanceDecision> {
  try {
    const governance = await getGovernance();
    const request = createGovernanceRequest({
      actor: buildDeliveryActor(workspace),
      action: ACTION_MAP[action],
      target: {
        toolName: action === 'pr' ? 'gh:pr-create' : 'git:push',
        environment: 'production',
      },
      context: {
        // An approved control-plane Approval (or safe-automation bypass) is the
        // human sign-off that lets the governance auto-approver clear the gate.
        autonomous: approvedByControlPlane,
        metadata: {
          workspaceId: workspace.workspaceId,
          taskId: workspace.taskId,
          branch: workspace.branch,
          deliveryAction: action,
        },
      },
    });

    const verdict = await governance.decide(request);
    const hardDeny = verdict.effect === 'deny';
    logger.info(
      {
        workspaceId: workspace.workspaceId,
        action,
        effect: verdict.effect,
        tier: verdict.tier,
        approvedByControlPlane,
        auditHash: verdict.auditHash,
        degraded: verdict.degraded,
      },
      'governance delivery verdict',
    );
    return {
      verdict,
      blocks: verdictBlocks(verdict),
      hardDeny,
      auditHash: verdict.auditHash,
      degraded: verdict.degraded,
    };
  } catch (err) {
    // Fail closed: a governance failure must NEVER auto-deliver. Return a
    // synthetic deny verdict so the conductor blocks and surfaces the error.
    logger.error(
      { workspaceId: workspace.workspaceId, action, err },
      'governance delivery decision failed — failing closed (synthetic deny)',
    );
    const now = new Date().toISOString();
    const reason = 'Governance decision unavailable — failing closed (deny).';
    const verdict: GovernanceVerdict = {
      verdictId: `gov_verdict_failclosed_${Date.now()}`,
      requestId: `gov_req_failclosed_${Date.now()}`,
      effect: 'deny',
      tier: 'critical',
      reason,
      policy: {
        decisionId: `pd_failclosed_${Date.now()}`,
        effect: 'deny',
        action: ACTION_MAP[action],
        actorAgentId: `conductor:${workspace.runtimeId}`,
        taskId: workspace.taskId,
        reason,
        createdAt: now,
      },
      routing: unroutable('critical', 'Denied — not routable.'),
      degraded: true,
      createdAt: now,
    };
    return { verdict, blocks: true, hardDeny: true, degraded: true };
  }
}

/**
 * Verify the governance Merkle audit chain. Used by tests and a health probe to
 * prove every delivery decision was recorded tamper-evidently. Returns
 * `{ ok: false }` if governance is unavailable (truthful, not a fake green).
 */
export async function verifyGovernanceAudit(): Promise<{ ok: boolean; tipHash?: string; entries: number }> {
  try {
    const governance = await getGovernance();
    const result = governance.verifyAudit();
    return { ok: result.ok, tipHash: result.tipHash, entries: governance.auditEntries().length };
  } catch (err) {
    logger.warn({ err }, 'governance audit verification unavailable');
    return { ok: false, entries: 0 };
  }
}

/** Expose the singleton governance audit entries (read-only) for inspection. */
export async function governanceAuditEntries(): Promise<readonly unknown[]> {
  try {
    const governance = await getGovernance();
    return governance.auditEntries();
  } catch {
    return [];
  }
}
