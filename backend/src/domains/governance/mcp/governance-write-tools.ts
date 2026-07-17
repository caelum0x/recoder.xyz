/**
 * Governance WRITE MCP tools — the governed-mutation surface the module
 * advertises, exposed as MCP tools behind SELF-GATING.
 *
 * The read-only introspection tools live in `governance-engine.ts`; these are the
 * mutating counterparts the GAP audit calls for (`decide` / `request_approval` /
 * `approval decide` / `acquire_lock` / `release_lock` / `secret set`).
 *
 * SELF-GATING (the core posture): the MCP host authorizes the CALL at its boundary
 * (`authorize→risk→policy→audit`), but a governed mutation must ALSO pass the
 * module's own write seam. So every mutating tool first runs
 * `gate().decide(action, principal, ctx)`; ONLY an `allow` verdict proceeds to the
 * mutation. A `deny` / `needs_approval` / synthetic-deny verdict is returned as a
 * `{ ok: false, gated: true, verdict }` refusal WITHOUT touching state — the tool
 * never fakes a mutation the gate blocked. `governance_decide` is the seam itself,
 * so it returns the verdict directly (no second mutation).
 *
 * The `actorId` from the tool args is the AUDIT SUBJECT (who the runtime acts for);
 * it never widens authority — the host already gated the call, and the kernel
 * classifies the mutation's risk here. A `kind: 'internal'` service principal is
 * synthesized so the gate/audit record a stable actor. Handlers stay thin, fail
 * fast on bad input (`{ ok: false, error }`), and degrade truthfully.
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { Principal } from '../../identity/types.js';
import type { GovernanceGate } from '../ports/gate.port.js';
import type { SecretsPort } from '../ports/secrets.port.js';
import type { WorkLockService } from '../services/work-lock.service.js';
import type { ApprovalService } from '../services/approval.service.js';
import type {
  GateDecisionContext,
  GateTarget,
  GateVerdict,
  GovernanceAction,
  RiskTier,
} from '../types.js';

/**
 * The narrow governance surface the write tools bind to (a subset of
 * `GovernanceModule`). Kept minimal so the tools compose against contracts, not
 * the composer, and stay trivially fakeable in unit tests.
 */
export interface GovernanceWriteSurface {
  gate(): GovernanceGate;
  approvals(): ApprovalService;
  workLocks(): WorkLockService;
  secrets(): SecretsPort;
}

const RISK_TIERS: readonly RiskTier[] = ['low', 'medium', 'high', 'critical'];

/** A refusal produced when the self-gate did not return `allow` (no mutation ran). */
interface GatedRefusal {
  readonly ok: false;
  readonly gated: true;
  readonly verdict: GateVerdict;
}

/** A fail-fast validation error (bad tool input; no gate call, no mutation). */
interface ToolInputError {
  readonly ok: false;
  readonly error: string;
}

/**
 * Synthesize the service principal a write tool self-gates + audits under. The
 * host already authorized the call; `actorId` is the audit subject, not an
 * authority grant. `kind: 'internal'` — a runtime acting for itself.
 */
function servicePrincipal(actorId: string): Principal {
  return { userId: actorId, scopes: ['write'], kind: 'internal', isAnonymous: false, raw: null };
}

/** Coerce raw MCP args to a record without trusting the shape. */
function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** Read a required non-empty string, or `null` (caller returns a ToolInputError). */
function reqString(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Read an optional non-empty string (absent/blank → undefined). */
function optString(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** Read an optional finite positive number (absent/invalid → undefined). */
function optPositiveNumber(body: Record<string, unknown>, field: string): number | undefined {
  const value = body[field];
  if (value == null) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Build the decision context a write tool self-gates the mutation under. */
function gateContext(body: Record<string, unknown>, target: GateTarget): GateDecisionContext {
  const taskId = optString(body, 'taskId');
  const runId = optString(body, 'runId');
  return {
    target,
    autonomous: body.autonomous === true,
    ...(taskId ? { taskId } : {}),
    ...(runId ? { runId } : {}),
  };
}

/** A gate verdict that did not clear to `allow` is a truthful, non-mutating refusal. */
function isGated(verdict: GateVerdict): boolean {
  return verdict.effect !== 'allow';
}

function refusal(verdict: GateVerdict): GatedRefusal {
  return { ok: false, gated: true, verdict };
}

function inputError(error: string): ToolInputError {
  return { ok: false, error };
}

/**
 * Build the governance write tools bound to the module's write surface. Each tool
 * self-gates its mutation through `gate().decide` and refuses (no state change)
 * on any non-`allow` verdict.
 */
export function buildGovernanceWriteTools(
  surface: GovernanceWriteSurface,
): readonly McpToolRegistration[] {
  const selfGate = (
    action: GovernanceAction,
    actorId: string,
    ctx: GateDecisionContext,
  ): Promise<GateVerdict> => surface.gate().decide(action, servicePrincipal(actorId), ctx);

  return [
    {
      name: 'governance_decide',
      description:
        'Run the governance write seam (decide→risk→audit) for a proposed action and return the sealed verdict. Fails closed (synthetic deny) on any kernel fault; never a fake allow.',
      handler: async (raw: unknown) => {
        const body = asObject(raw);
        const actorId = reqString(body, 'actorId');
        const action = reqString(body, 'action');
        if (!actorId) return inputError('actorId is required');
        if (!action) return inputError('action is required');
        const target: GateTarget = {
          ...(optString(body, 'path') ? { path: optString(body, 'path')! } : {}),
          ...(optString(body, 'command') ? { command: optString(body, 'command')! } : {}),
          ...(optString(body, 'toolName') ? { toolName: optString(body, 'toolName')! } : {}),
          ...(optString(body, 'environment') ? { environment: optString(body, 'environment')! } : {}),
        };
        const verdict = await selfGate(action, actorId, gateContext(body, target));
        return { ok: verdict.effect === 'allow', verdict };
      },
    },
    {
      name: 'governance_request_approval',
      description:
        'Open a pending control-plane approval for a risky action (clears a needs_approval gate once granted). Self-gated: a blocked verdict refuses without opening a record.',
      handler: async (raw: unknown) => {
        const body = asObject(raw);
        const actorId = reqString(body, 'actorId');
        const action = reqString(body, 'action');
        const riskTier = optString(body, 'riskTier') as RiskTier | undefined;
        if (!actorId) return inputError('actorId is required');
        if (!action) return inputError('action is required');
        if (!riskTier || !RISK_TIERS.includes(riskTier)) {
          return inputError(`riskTier must be one of: ${RISK_TIERS.join(', ')}`);
        }
        const ctx = gateContext(body, { toolName: 'governance_request_approval' });
        const verdict = await selfGate('governance.approval.request', actorId, ctx);
        if (isGated(verdict)) return refusal(verdict);

        const approval = await surface.approvals().request({
          action,
          riskTier,
          requestedBy: actorId,
          taskId: optString(body, 'taskId') ?? null,
          runId: optString(body, 'runId') ?? null,
          reason: optString(body, 'reason') ?? null,
          ...(optPositiveNumber(body, 'ttlMs') != null ? { ttlMs: optPositiveNumber(body, 'ttlMs')! } : {}),
        });
        return { ok: true, verdict, approval };
      },
    },
    {
      name: 'governance_approval_decide',
      description:
        'Grant or deny a pending approval (decision: approved|denied). Self-gated: a blocked verdict refuses without deciding. Idempotent — an absent/resolved record surfaces as ok:false.',
      handler: async (raw: unknown) => {
        const body = asObject(raw);
        const actorId = reqString(body, 'actorId');
        const approvalId = reqString(body, 'approvalId');
        const decision = optString(body, 'decision');
        if (!actorId) return inputError('actorId is required');
        if (!approvalId) return inputError('approvalId is required');
        if (decision !== 'approved' && decision !== 'denied') {
          return inputError("decision must be 'approved' or 'denied'");
        }
        const ctx = gateContext(body, { toolName: 'governance_approval_decide' });
        const verdict = await selfGate('governance.approval.decide', actorId, ctx);
        if (isGated(verdict)) return refusal(verdict);

        try {
          const approval = await surface.approvals().decide(approvalId, {
            decision,
            decidedBy: actorId,
            reason: optString(body, 'reason') ?? null,
          });
          return { ok: true, verdict, approval };
        } catch (err) {
          // A NOT_FOUND (absent / already-decided) is a truthful non-mutation.
          return { ok: false, verdict, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: 'governance_acquire_lock',
      description:
        'Acquire a path/work lock (conflict prevention before writes). Self-gated. A live conflict is a truthful ok:false with the holding lock, never a faked acquire.',
      handler: async (raw: unknown) => {
        const body = asObject(raw);
        const actorId = reqString(body, 'actorId');
        const resourcePath = reqString(body, 'resourcePath');
        if (!actorId) return inputError('actorId is required');
        if (!resourcePath) return inputError('resourcePath is required');
        const mode = optString(body, 'mode') === 'shared' ? 'shared' : 'exclusive';
        const ctx = gateContext(body, { path: resourcePath });
        const verdict = await selfGate('governance.worklock.acquire', actorId, ctx);
        if (isGated(verdict)) return refusal(verdict);

        const result = await surface.workLocks().acquire({
          resourcePath,
          holderAgentId: actorId,
          taskId: optString(body, 'taskId') ?? null,
          mode,
          ...(optPositiveNumber(body, 'ttlMs') != null ? { ttlMs: optPositiveNumber(body, 'ttlMs')! } : {}),
        });
        return { ok: result.acquired, verdict, ...result };
      },
    },
    {
      name: 'governance_release_lock',
      description:
        'Release a held work lock by id. Holder-scoped: an absent/foreign/already-released lock is a truthful ok:false, never a fake release. Self-gated.',
      handler: async (raw: unknown) => {
        const body = asObject(raw);
        const actorId = reqString(body, 'actorId');
        const lockId = reqString(body, 'lockId');
        if (!actorId) return inputError('actorId is required');
        if (!lockId) return inputError('lockId is required');
        const ctx = gateContext(body, { toolName: 'governance_release_lock' });
        const verdict = await selfGate('governance.worklock.release', actorId, ctx);
        if (isGated(verdict)) return refusal(verdict);

        const released = await surface.workLocks().release(lockId, actorId);
        return { ok: released, verdict, released };
      },
    },
    {
      name: 'governance_secret_set',
      description:
        'Envelope-encrypt and store a secret for the actor (governance write). Self-gated. Fails safe (ok:false) when the vault master key is absent — never a plaintext store, never the value echoed back.',
      handler: async (raw: unknown) => {
        const body = asObject(raw);
        const actorId = reqString(body, 'actorId');
        const ref = reqString(body, 'ref');
        const value = typeof body.value === 'string' ? body.value : '';
        if (!actorId) return inputError('actorId is required');
        if (!ref) return inputError('ref is required');
        if (value.length === 0) return inputError('value is required');
        const ctx = gateContext(body, { toolName: 'governance_secret_set', path: `secret:${ref}` });
        const verdict = await selfGate('secret.set', actorId, ctx);
        if (isGated(verdict)) return refusal(verdict);

        try {
          const stored = await surface.secrets().set(actorId, ref, value);
          // Metadata only — the plaintext is encrypted at rest and never returned.
          return {
            ok: true,
            verdict,
            secret: { ref: stored.ref, keyVersion: stored.keyVersion, createdAt: stored.createdAt },
          };
        } catch (err) {
          return { ok: false, verdict, error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
  ];
}
