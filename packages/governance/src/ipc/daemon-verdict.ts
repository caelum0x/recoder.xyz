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

/** Validate the `decide` reply. Throws DaemonUnavailableError on violation. */
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
  const auditHash = optionalString(v.auditHash, "decide.auditHash");
  const approvalGateId = optionalString(v.approvalGateId, 'decide.approvalGateId');
  return {
    effect: v.effect,
    tier: v.tier,
    reason: v.reason,
    ...(auditHash !== undefined ? { auditHash } : {}),
    ...(approvalGateId !== undefined ? { approvalGateId } : {}),
  };
}

/** The daemon's `enforceTool` reply: allowed, or denied with a reason. */
export type DaemonEnforceResult =
  | { readonly outcome: 'allowed' }
  | { readonly outcome: 'denied'; readonly tool: string; readonly reason: string };

export function parseDaemonEnforceResult(value: unknown): DaemonEnforceResult {
  const v = asObject(value, 'enforceTool');
  if (v.outcome === 'allowed') {
    return { outcome: 'allowed' };
  }
  if (v.outcome === 'denied') {
    if (typeof v.tool !== 'string' || typeof v.reason !== 'string') {
      throw new DaemonUnavailableError("daemon 'enforceTool' denied reply is malformed");
    }
    return { outcome: 'denied', tool: v.tool, reason: v.reason };
  }
  throw new DaemonUnavailableError("daemon 'enforceTool' returned an invalid outcome");
}

/** The daemon's `recordAudit` reply: the new Merkle tip hash. */
export function parseDaemonAuditHash(value: unknown): string {
  const v = asObject(value, 'recordAudit');
  if (typeof v.hash !== 'string' || v.hash.length === 0) {
    throw new DaemonUnavailableError("daemon 'recordAudit' returned an invalid hash");
  }
  return v.hash;
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
