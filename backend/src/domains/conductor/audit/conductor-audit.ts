/**
 * `conductor-audit` — the WRITE wrapper every conductor mutation passes through.
 *
 * Domain doc §3 / §7: create / advance / steer / stop / merge / pr / reconcile
 * each call {@link guardConductorWrite} BEFORE the mutation (the governance
 * gate's `decide`) and {@link recordConductorAudit} AFTER (sealing the outcome
 * into the SAME durable Merkle chain). The conductor never imports
 * `@recoder/governance`; it depends on the {@link GovernanceGatePort} the composer
 * injects.
 *
 * Security invariant (inherited, non-negotiable): `decide` NEVER throws for a
 * policy outcome — a deny is a returned verdict with `effect:'deny'`, and a kernel
 * fault fails CLOSED (synthetic deny). A denied verdict BLOCKS the write. This
 * wrapper surfaces the verdict; the caller must not proceed unless `allowed`.
 */
import type { Principal } from '../../identity/types.js';
import type {
  AuditEntryInput,
  AuditRecord,
  GateDecisionContext,
  GovernanceAction,
  GovernanceGatePort,
  GateVerdict,
} from '../ports/index.js';

/** The outcome of a guarded write: the verdict + a decoded `allowed` boolean. */
export interface GuardedWrite {
  readonly allowed: boolean;
  readonly verdict: GateVerdict;
}

/**
 * Run the governance gate for a proposed conductor write. Returns `allowed:false`
 * (never throws) for a deny / needs_approval / synthetic-deny verdict so the
 * caller can short-circuit truthfully with the verdict reason.
 */
export async function guardConductorWrite(
  gate: GovernanceGatePort,
  action: GovernanceAction,
  principal: Principal,
  ctx: GateDecisionContext,
): Promise<GuardedWrite> {
  const verdict = await gate.decide(action, principal, ctx);
  return { allowed: verdict.effect === 'allow', verdict };
}

/**
 * Seal a conductor control-plane event into the durable audit chain AFTER the
 * write. Degrade-safe: a governance-unavailable failure is swallowed (best-effort
 * sealing) so a mutation that already succeeded is never rolled back by an audit
 * write failure — the failure surfaces in governance health, not as a lost write.
 *
 * Returns the persisted {@link AuditRecord} so a caller (e.g. `mergeWorkspace`)
 * can surface the durable audit id to the client, or `null` when sealing failed
 * (truthful: the write happened but its audit entry is not durable this time).
 */
export async function recordConductorAudit(
  gate: GovernanceGatePort,
  entry: AuditEntryInput,
): Promise<AuditRecord | null> {
  try {
    return await gate.recordAudit(entry);
  } catch {
    // Best-effort: governance health reports the sealing failure truthfully.
    return null;
  }
}

/** Build a minimal `AuditEntryInput` for a conductor action (no secrets in payload). */
export function conductorAuditEntry(
  action: GovernanceAction,
  principal: Principal,
  verdict: GateVerdict,
  payload: Readonly<Record<string, unknown>> = {},
): AuditEntryInput {
  return {
    actorId: principal.userId,
    action,
    resource: 'conductor',
    effect: verdict.effect,
    riskTier: verdict.tier,
    degraded: verdict.degraded,
    payload,
  };
}
