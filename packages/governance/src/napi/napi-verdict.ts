/**
 * napi-verdict — hostile validators for the native kernel's JSON reply.
 *
 * The NAPI kernel returns JSON strings (not objects) so we parse then validate.
 * On any shape violation we throw `NapiUnavailableError` and the facade falls
 * back to the UDS daemon or the pure-TS path (fail closed).
 */

import { isRiskTier, type RiskTier } from '../domain/risk-tier';

export class NapiUnavailableError extends Error {
  readonly name = 'NapiUnavailableError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, NapiUnavailableError.prototype);
  }
}

export type NapiEffect = 'allow' | 'deny' | 'needs_approval';

const EFFECTS: ReadonlySet<string> = new Set(['allow', 'deny', 'needs_approval']);

function isEffect(value: unknown): value is NapiEffect {
  return typeof value === 'string' && EFFECTS.has(value);
}

/** The authoritative subset the NAPI kernel returns for `decide`. */
export type NapiDecideResult = {
  readonly effect: NapiEffect;
  readonly tier: RiskTier;
  readonly reason: string;
  readonly auditHash?: string;
};

/**
 * Parse and validate the kernel's JSON `decide` result.
 * The Rust `GovernanceVerdict` serializes to:
 * `{ "effect": "allow"|"deny"|"needs_approval", "tier": "low"|..., "route": {...}, "reason": "...", "audit_hash": "..." }`
 */
export function parseNapiDecideResult(json: string): NapiDecideResult {
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    throw new NapiUnavailableError('governance-napi: decide() returned non-JSON');
  }
  if (typeof v !== 'object' || v === null) {
    throw new NapiUnavailableError('governance-napi: decide() returned a non-object');
  }
  const o = v as Record<string, unknown>;
  if (!isEffect(o.effect)) {
    throw new NapiUnavailableError(`governance-napi: decide() returned invalid effect: ${String(o.effect)}`);
  }
  if (!isRiskTier(o.tier)) {
    throw new NapiUnavailableError(`governance-napi: decide() returned invalid tier: ${String(o.tier)}`);
  }
  if (typeof o.reason !== 'string') {
    throw new NapiUnavailableError('governance-napi: decide() returned non-string reason');
  }
  const auditHash =
    typeof o.audit_hash === 'string' && o.audit_hash.length > 0 ? o.audit_hash : undefined;
  return { effect: o.effect, tier: o.tier, reason: o.reason, auditHash };
}

/** Parse the native `enforce_tool` JSON result. */
export type NapiEnforceResult =
  | { readonly outcome: 'allowed' }
  | { readonly outcome: 'denied'; readonly reason: string };

export function parseNapiEnforceResult(json: string): NapiEnforceResult {
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    throw new NapiUnavailableError('governance-napi: enforceTool() returned non-JSON');
  }
  if (typeof v !== 'object' || v === null) {
    throw new NapiUnavailableError('governance-napi: enforceTool() returned a non-object');
  }
  const o = v as Record<string, unknown>;
  // The Rust EnforcementResult uses #[serde(tag = "outcome")] — the variant is
  // PascalCase: "Allowed" | "Denied".
  if (o.outcome === 'Allowed') return { outcome: 'allowed' };
  if (o.outcome === 'Denied') {
    const reason = typeof o.reason === 'string' ? o.reason : 'denied by native kernel';
    return { outcome: 'denied', reason };
  }
  throw new NapiUnavailableError(`governance-napi: enforceTool() unknown outcome: ${String(o.outcome)}`);
}
