import { DaemonUnavailableError } from '../errors';
import { isRiskTier, type RiskTier } from '../domain/risk-tier';

/**
 * daemon-verdict — hostile validators for the daemon's reply payloads.
 *
 * The daemon is the authority on the decision, but its bytes are still
 * untrusted: a malformed payload must NOT be coerced into an allow. Each
 * validator throws `DaemonUnavailableError` on any shape violation so the facade
 * falls back to the pure-TS deny-biased path (fail closed), exactly as a missing
 * daemon would.
 */

export type GovernanceEffect = 'allow' | 'deny' | 'needs_approval';

const EFFECTS: ReadonlySet<string> = new Set(['allow', 'deny', 'needs_approval']);

function isEffect(value: unknown): value is GovernanceEffect {
  return typeof value === 'string' && EFFECTS.has(value);
}

/** The authoritative subset of a verdict the daemon returns for `decide`. */
export type DaemonDecideResult = {
  readonly effect: GovernanceEffect;
  readonly tier: RiskTier;
  readonly reason: string;
  readonly auditHash?: string;
  readonly approvalGateId?: string;
};

/**
 * Validate the `decide` reply. Throws DaemonUnavailableError on violation.
 *
 * The field names mirror the daemon's native `GovernanceVerdict` serialization
 * (`recoder-governance-kernel/src/verdict.rs`): `effect`, `tier`, `reason`, and
 * the snake_case `audit_hash`. The daemon does not surface an approval-gate id
 * on a `decide` verdict, so none is read here.
 */
export function parseDaemonDecideResult(value: unknown): DaemonDecideResult {
  const v = asObject(value, 'decide');
  if (!isEffect(v.effect)) {
    throw new DaemonUnavailableError("daemon 'decide' returned an invalid effect");
  }
  if (!isRiskTier(v.tier)) {
    throw new DaemonUnavailableError("daemon 'decide' returned an invalid tier");
  }
  if (typeof v.reason !== 'string') {
    throw new DaemonUnavailableError("daemon 'decide' returned a non-string reason");
  }
  // The daemon emits the chain tip as snake_case `audit_hash`.
  const auditHash = optionalString(v.audit_hash, 'decide.audit_hash');
  return {
    effect: v.effect,
    tier: v.tier,
    reason: v.reason,
    ...(auditHash !== undefined ? { auditHash } : {}),
  };
}

/** The daemon's `enforceTool` reply: allowed, or denied with a reason. */
export type DaemonEnforceResult =
  | { readonly outcome: 'allowed' }
  | { readonly outcome: 'denied'; readonly tool: string; readonly reason: string };

/**
 * Validate the daemon's `enforce_tool` reply. The daemon serializes the kernel's
 * `EnforcementResult` (`recoder-governance-permission/src/enforcer.rs`) with
 * `#[serde(tag = "outcome")]`, so the wire `outcome` is the PascalCase variant
 * name (`"Allowed"` / `"Denied"`) and the denied fields are snake_case. This
 * normalizes to the lowercase outcome the facade consumes.
 */
export function parseDaemonEnforceResult(value: unknown): DaemonEnforceResult {
  const v = asObject(value, 'enforceTool');
  if (v.outcome === 'Allowed') {
    return { outcome: 'allowed' };
  }
  if (v.outcome === 'Denied') {
    if (typeof v.tool !== 'string' || typeof v.reason !== 'string') {
      throw new DaemonUnavailableError("daemon 'enforceTool' denied reply is malformed");
    }
    return { outcome: 'denied', tool: v.tool, reason: v.reason };
  }
  throw new DaemonUnavailableError("daemon 'enforceTool' returned an invalid outcome");
}

/**
 * The daemon's `record_audit` reply: the new Merkle tip hash. The daemon returns
 * `{ "tip_hash": <hex> }` (see the RecordAudit arm in `dispatch.rs`).
 */
export function parseDaemonAuditHash(value: unknown): string {
  const v = asObject(value, 'recordAudit');
  if (typeof v.tip_hash !== 'string' || v.tip_hash.length === 0) {
    throw new DaemonUnavailableError("daemon 'recordAudit' returned an invalid tip_hash");
  }
  return v.tip_hash;
}

// ---- helpers ----------------------------------------------------------------

function asObject(value: unknown, method: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new DaemonUnavailableError(`daemon '${method}' returned a non-object result`);
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new DaemonUnavailableError(`daemon returned a non-string ${field}`);
  }
  return value;
}
