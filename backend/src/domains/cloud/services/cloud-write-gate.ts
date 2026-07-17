/**
 * `cloud-write-gate` — the WRITE wrapper every cloud mutation edge passes
 * (mirrors `conductor/audit/conductor-audit.ts`):
 *
 *   1. {@link guardCloudWrite} runs the governance gate's `decide` BEFORE the
 *      mutation. A `deny` / `needs_approval` / synthetic-deny verdict blocks
 *      the write with a truthful 403; a gate that THROWS fails CLOSED with a
 *      503 (`AUTHZ_SERVICE_ERROR`) — an erroring gate NEVER lets a write pass.
 *   2. {@link recordCloudAudit} seals the outcome into the SAME durable Merkle
 *      chain AFTER the write (best-effort: a sealing failure never rolls back
 *      a mutation that already happened; it surfaces in governance health).
 *
 * DEGRADE POSTURE (documented, matches identity's org-write gate): the gate is
 * an OPTIONAL capability token the composition root injects. When it is absent
 * the write proceeds auth-only with a warn log — the module must not brick
 * before the serial bootstrap wiring lands — and nothing is audited (there is
 * no chain to seal into). When it is PRESENT, policy is authoritative.
 */
import { createError, ErrorCode, type AppError } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { Principal } from '../../identity/types.js';
import type {
  AuditEntryInput,
  CloudGovernanceGatePort,
  GateDecisionContext,
  GateVerdict,
  GovernanceAction,
} from '../ports/governance-gate.port.js';

/** The outcome of a guarded cloud write: proceed, or the exact error to send. */
export type GuardedCloudWrite =
  | { readonly allowed: true; readonly verdict?: GateVerdict }
  | { readonly allowed: false; readonly error: AppError };

/**
 * Run the governance gate for a proposed cloud write. Never throws: a blocking
 * verdict (or an erroring gate — fail-closed) comes back as `allowed: false`
 * with the exact {@link AppError} the route should send.
 */
export async function guardCloudWrite(
  gate: CloudGovernanceGatePort | undefined,
  action: GovernanceAction,
  principal: Principal,
  ctx: GateDecisionContext,
  logger: Logger,
): Promise<GuardedCloudWrite> {
  if (!gate) {
    // Degrade-open (documented above): no gate injected yet ⇒ auth-only write.
    logger.warn({ action, actor: principal.userId }, 'cloud write proceeding without a governance gate (not injected)');
    return { allowed: true };
  }
  try {
    const verdict = await gate.decide(action, principal, ctx);
    if (verdict.effect === 'allow') return { allowed: true, verdict };
    return {
      allowed: false,
      error: createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, `Governance ${verdict.effect}: ${verdict.reason}`, {
        details: {
          effect: verdict.effect,
          tier: verdict.tier,
          degraded: verdict.degraded,
          ...(verdict.approvalId ? { approvalId: verdict.approvalId } : {}),
        },
      }),
    };
  } catch (cause) {
    // FAIL-CLOSED: the frozen contract says `decide` never throws a policy
    // outcome, so a throw is an infrastructure fault — refuse the write.
    logger.error({ err: cause, action, actor: principal.userId }, 'governance gate errored — failing closed');
    return {
      allowed: false,
      error: createError(ErrorCode.AUTHZ_SERVICE_ERROR, 'Governance gate unavailable — refusing the write (fail-closed).'),
    };
  }
}

/**
 * Seal a completed cloud write into the durable audit chain AFTER the mutation.
 * Best-effort: a sealing failure is logged (governance health carries it) and
 * never unwinds the already-successful write. No-op without a gate/verdict —
 * there is no chain to seal into on the degrade-open path.
 */
export async function recordCloudAudit(
  gate: CloudGovernanceGatePort | undefined,
  action: GovernanceAction,
  principal: Principal,
  verdict: GateVerdict | undefined,
  payload: Readonly<Record<string, unknown>>,
  logger: Logger,
): Promise<void> {
  if (!gate || !verdict) return;
  const entry: AuditEntryInput = {
    actorId: principal.userId,
    action,
    resource: 'cloud',
    effect: verdict.effect,
    riskTier: verdict.tier,
    degraded: verdict.degraded,
    // Sanitized outcome metadata only — never secret values / signed URLs.
    payload,
  };
  try {
    await gate.recordAudit(entry);
  } catch (cause) {
    logger.warn({ err: cause, action }, 'cloud audit seal failed (best-effort; write already durable)');
  }
}
