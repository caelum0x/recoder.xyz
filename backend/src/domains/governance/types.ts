/**
 * Governance domain types — the data shapes not owned by `packages/*`.
 *
 * These are the CROSS-DOMAIN vocabulary every stateful domain speaks when it
 * asks the gate for permission. They are deliberately independent of
 * `@recoder/governance` internals so a consumer imports the gate port + these
 * types WITHOUT taking a dependency on the kernel package (the adapters bridge
 * to the package). Keep them byte-compatible with the Rust kernel's risk/effect
 * vocabulary (`recoder-governance-types`) — Rust is the wire authority; this is
 * the control-plane view.
 */

/**
 * The totally-ordered risk classification. Mirrors the Rust kernel + package
 * `RiskTier`. A higher tier subsumes the approval/enforcement requirements of a
 * lower one. Compare through {@link riskTierRank}, never by string sort.
 */
export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

/** The three verdict effects. `deny` is a hard block; `needs_approval` is gated. */
export type GovernanceEffect = 'allow' | 'deny' | 'needs_approval';

/**
 * The action space the gate reasons about. A dotted `resource.verb` string
 * (e.g. `pr.create`, `branch.push`, `file.write`, `secret.rotate`, `tool.call`).
 * Kept as a branded string (not an enum) so domains declare their own actions
 * without editing this file — the kernel classifies unknown actions deny-biased.
 */
export type GovernanceAction = string;

/** Which rung of the degrade ladder produced a verdict (drives truthful health). */
export type KernelEngine = 'napi' | 'daemon' | 'ts' | 'synthetic';

/** Numeric rank for the four tiers (deny-biased max). */
const RISK_TIER_RANK: Readonly<Record<RiskTier, number>> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** Rank of a tier (0..3). */
export function riskTierRank(tier: RiskTier): number {
  return RISK_TIER_RANK[tier];
}

/** The more severe of two tiers (deny-biased toward higher risk). */
export function maxRiskTier(a: RiskTier, b: RiskTier): RiskTier {
  return RISK_TIER_RANK[a] >= RISK_TIER_RANK[b] ? a : b;
}

/**
 * The concrete subject of an action. Mirrors the package `GovernanceTarget` so
 * the adapter passes it straight through to the kernel.
 */
export interface GateTarget {
  readonly path?: string;
  readonly command?: string;
  readonly toolName?: string;
  readonly environment?: string;
}

/** A held or requested path work-lock glob, threaded into the decide context. */
export interface WorkLockGlob {
  readonly pathGlob: string;
  readonly mode?: 'exclusive' | 'shared';
}

/**
 * Extra context influencing tier classification + enforcement. All optional and
 * defensively defaulted by the adapter (deny-biased on absence).
 */
export interface GateDecisionContext {
  /** The task this decision belongs to (audit + approval correlation). */
  readonly taskId?: string;
  /** The run this decision belongs to. */
  readonly runId?: string;
  /** The action's concrete target. */
  readonly target: GateTarget;
  /** Work locks the actor holds (or the paths the action would touch). */
  readonly workLocks?: readonly WorkLockGlob[];
  /** Workspace root for file-write boundary containment. */
  readonly workspaceRoot?: string;
  /** Whether the surrounding run is in an explicitly autonomous (approved) mode. */
  readonly autonomous?: boolean;
  /** Free-form bash input being checked (read-only heuristics). */
  readonly bashInput?: string;
  /** Subagent nesting depth (tool-access depth filter). */
  readonly subagentDepth?: number;
  /** Arbitrary metadata captured into the audit detail (sanitized, no secrets). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * The frozen WRITE-seam output. Every domain that guards a write consumes
 * exactly this shape. Immutable; `effect` is the source of truth for whether the
 * caller may proceed. `degraded === true` whenever the verdict did NOT come from
 * the in-proc napi path (truthful, never a faked non-degraded allow).
 */
export interface GateVerdict {
  readonly verdictId: string;
  readonly requestId: string;
  readonly effect: GovernanceEffect;
  readonly tier: RiskTier;
  readonly reason: string;
  /** True whenever the verdict used any path other than the in-proc napi kernel. */
  readonly degraded: boolean;
  /** Which ladder rung answered (napi/daemon/ts/synthetic). */
  readonly engine: KernelEngine;
  /** The durable Merkle audit tip that sealed this decision, when audit is on. */
  readonly auditHash?: string;
  /** The approval gate/record id when `effect === 'needs_approval'`. */
  readonly approvalId?: string;
  readonly createdAt: string;
}

/**
 * The lower-level request the kernel port consumes. The gate service builds this
 * from `(action, principal, ctx)`; the kernel adapters translate it to the
 * package/Rust wire shape.
 */
export interface KernelRequest {
  readonly requestId?: string;
  /** Canonical actor id (a `Principal.userId` or a service agent id). */
  readonly actorId: string;
  readonly taskId?: string;
  readonly action: GovernanceAction;
  readonly target: GateTarget;
  readonly workLocks?: readonly WorkLockGlob[];
  readonly context?: GateDecisionContext;
  readonly now?: string;
}

/** The kernel's raw verdict (before the gate seals the durable audit entry). */
export interface KernelVerdict {
  readonly effect: GovernanceEffect;
  readonly tier: RiskTier;
  readonly reason: string;
  readonly degraded: boolean;
  readonly engine: KernelEngine;
  /** The kernel's own (in-memory) Merkle tip for this decision, when present. */
  readonly auditHash?: string;
  readonly approvalGateId?: string;
}

/** Outcome of a single tool-invocation enforcement check. */
export interface ToolEnforcement {
  readonly outcome: 'allowed' | 'denied';
  readonly reason: string;
  readonly degraded: boolean;
  readonly engine: KernelEngine;
}

/** A routing hint (planner surface). Unroutable when the action is denied. */
export interface RoutingHint {
  readonly routable: boolean;
  readonly tier: RiskTier;
  readonly reason: string;
  readonly target?: string;
}

/** Truthful per-engine kernel status (aggregated into governance health). */
export interface KernelStatus {
  readonly engine: KernelEngine;
  readonly status: 'up' | 'down' | 'degraded' | 'unknown';
  readonly degraded: boolean;
  readonly reason?: string;
}

// --- Audit chain -------------------------------------------------------------

/** The fixed genesis tip the first audit entry chains from (64 hex zeros). */
export const AUDIT_GENESIS_HASH = '0'.repeat(64);

/**
 * The unsealed fields of an audit entry the gate records. NEVER carries secret
 * values; `payload` holds request + verdict metadata only.
 */
export interface AuditEntryInput {
  readonly actorId: string;
  readonly action: string;
  readonly resource: string;
  readonly effect: GovernanceEffect;
  readonly riskTier: RiskTier;
  readonly degraded: boolean;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** A persisted audit chain row (read model). */
export interface AuditRecord {
  readonly id: string;
  readonly seq: number;
  readonly prevHash: string;
  readonly entryHash: string;
  readonly actorId: string;
  readonly action: string;
  readonly resource: string;
  readonly effect: GovernanceEffect;
  readonly riskTier: RiskTier;
  readonly degraded: boolean;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

/** Result of re-walking the durable audit chain. */
export interface AuditVerification {
  readonly ok: boolean;
  /** The seq the chain first broke at (hash mismatch / gap), when `ok === false`. */
  readonly brokenAtSeq?: number;
  /** The durable tip hash after the walk. */
  readonly tipHash?: string;
  /** Number of entries walked. */
  readonly entries: number;
  /** When the kernel's own tip was compared, whether it matched the DB tip. */
  readonly kernelTipMatches?: boolean;
}

// --- Approvals / work locks / secrets ---------------------------------------

/** Status of a control-plane approval record. */
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

/** A control-plane approval record (backs `needs_approval` verdicts). */
export interface ApprovalRecord {
  readonly id: string;
  readonly taskId?: string | null;
  readonly runId?: string | null;
  readonly action: string;
  readonly riskTier: RiskTier;
  readonly status: ApprovalStatus;
  readonly requestedBy: string;
  readonly decidedBy?: string | null;
  readonly reason?: string | null;
  readonly expiresAt?: string | null;
  readonly decidedAt?: string | null;
  readonly createdAt: string;
}

/** A held path/work lock (conflict prevention before writes). */
export interface WorkLock {
  readonly id: string;
  readonly resourcePath: string;
  readonly holderAgentId: string;
  readonly taskId?: string | null;
  readonly mode: 'exclusive' | 'shared';
  readonly acquiredAt: string;
  readonly expiresAt: string;
  readonly releasedAt?: string | null;
}

/** A logical secret reference (metadata only — never the plaintext). */
export interface SecretRef {
  readonly id: string;
  readonly ref: string;
  readonly ownerUserId: string;
  readonly keyVersion: number;
  readonly rotatedAt?: string | null;
  readonly createdAt: string;
}
