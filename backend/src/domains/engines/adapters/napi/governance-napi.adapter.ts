/**
 * `GovernanceNapiAdapter` — a THIN re-expose of the Phase-3 governance kernel
 * (`GovernanceKernelPort`) through the frozen `EngineClientPort`. It does NOT
 * load a `.node` or duplicate the kernel ladder: the governance domain already
 * assembles the napi→daemon→ts ladder (`createKernelLadder`) with its fail-closed
 * synthetic-deny floor. This adapter wraps the injected, assembled kernel so the
 * engines seam can hand capability domains a uniform `EngineClientPort` for the
 * governance engine alongside openfang + tensorzero.
 *
 * `transport` is the DECLARED napi transport (the governance engine is native
 * first). `health()` reports the TRUTHFUL rung the ladder answers on: `up` only
 * when the napi rung is live and non-degraded; `degraded` when the ladder fell to
 * the daemon/ts rung (napi addon absent); `down` when the kernel itself is down.
 * Deny-bias is preserved — the wrapped kernel already deny-biases on fault.
 */
import type { Logger } from '../../../../shared/logger.js';
import type { GovernanceKernelPort } from '../../../governance/ports/kernel.port.js';
import type {
  GateTarget,
  GovernanceEffect,
  KernelEngine,
  KernelRequest,
  KernelVerdict,
  RoutingHint,
} from '../../../governance/types.js';
// PURE risk-tier vocabulary from the leaf policy package (category-5 legal: a
// package, not another domain) — the ONLY value edge this re-expose needs, now
// off the governance domain per the owner mandate.
import { riskTierRank, type RiskTier } from '@recoder/agent-policy';
import { EngineClientBase, type EngineCall } from '../../ports/engine-client.port.js';
import { type EngineHealth, type InvokeResult, fail, ok } from '../../types.js';
import { msg, str, type NapiArgs } from './napi-util.js';

/** One ordered contributing factor in a decision explanation (the "why"). */
export interface ExplanationFactor {
  /** Machine slug of the factor (`effect` | `risk_tier` | `confidence` | `routing` | `approval` | `audit`). */
  readonly factor: string;
  /** Human-readable statement of how this factor shaped the verdict. */
  readonly detail: string;
}

/**
 * The composed "why allow/deny" answer — a richer view than the raw
 * {@link KernelVerdict}. Folds the decision verdict + the routing hint into an
 * ordered factor list, a one-line summary, and concrete next steps, WITHOUT any
 * new native export (composed over the existing `decide()` + `route()` port ops).
 */
export interface GovernanceDecisionExplanation {
  readonly effect: GovernanceEffect;
  readonly tier: RiskTier;
  /** `effect === 'allow'`. */
  readonly allowed: boolean;
  /** `effect === 'needs_approval'`. */
  readonly requiresApproval: boolean;
  /** One-line human "why" (ALLOW/DENY/NEEDS APPROVAL + tier + reason). */
  readonly summary: string;
  /** Ordered contributing factors — the explanation body. */
  readonly factors: readonly ExplanationFactor[];
  /** The planner routing view for the same request (unroutable when denied). */
  readonly routing: { readonly routable: boolean; readonly tier: RiskTier; readonly target: string | null };
  /** True whenever the verdict used any path other than the in-proc napi kernel. */
  readonly degraded: boolean;
  readonly engine: KernelEngine;
  /** `authoritative` on the native rung; `degraded` (deny-biased) otherwise. */
  readonly confidence: 'authoritative' | 'degraded';
  /** The Merkle audit tip that sealed the decision (when audit is on). */
  readonly auditHash: string | null;
  /** The approval gate id when `effect === 'needs_approval'`. */
  readonly approvalId: string | null;
  /** Concrete, deny-biased next steps for the caller. */
  readonly nextSteps: readonly string[];
}

/** Render a {@link GateTarget} to a short, secret-free descriptor for the explanation. */
function describeTarget(target: GateTarget | undefined): string {
  if (!target) return '(unspecified)';
  return target.path ?? target.command ?? target.toolName ?? target.environment ?? '(unspecified)';
}

/**
 * Compose a rich decision explanation from the kernel verdict + routing hint.
 * Pure + deterministic (exported so the tool binder and unit tests share it) —
 * no I/O, no kernel access, deny-biased in its next-steps.
 */
export function buildDecisionExplanation(
  req: KernelRequest,
  verdict: KernelVerdict,
  routing: RoutingHint,
): GovernanceDecisionExplanation {
  const allowed = verdict.effect === 'allow';
  const requiresApproval = verdict.effect === 'needs_approval';

  const factors: ExplanationFactor[] = [
    {
      factor: 'effect',
      detail: `Kernel returned '${verdict.effect}' for action '${req.action}' on target '${describeTarget(req.target)}': ${verdict.reason}`,
    },
    {
      factor: 'risk_tier',
      detail: `Classified risk tier '${verdict.tier}' (rank ${riskTierRank(verdict.tier)}/3); higher tiers subsume lower approval/enforcement requirements.`,
    },
    {
      factor: 'confidence',
      detail: verdict.degraded
        ? `Verdict produced on the '${verdict.engine}' rung (native kernel absent) — degraded and deny-biased.`
        : `Verdict produced on the in-proc native '${verdict.engine}' kernel — authoritative.`,
    },
    {
      factor: 'routing',
      detail: routing.routable
        ? `Action is routable (tier '${routing.tier}'${routing.target ? `, suggested target '${routing.target}'` : ''}): ${routing.reason}`
        : `Action is not routable: ${routing.reason}`,
    },
  ];

  if (requiresApproval) {
    factors.push({
      factor: 'approval',
      detail: verdict.approvalGateId
        ? `Requires human approval — approval gate '${verdict.approvalGateId}'.`
        : 'Requires human approval before proceeding.',
    });
  }
  if (verdict.auditHash) {
    factors.push({ factor: 'audit', detail: `Sealed into the Merkle audit chain at tip '${verdict.auditHash}'.` });
  }

  const summary = allowed
    ? `ALLOW: '${req.action}' permitted at '${verdict.tier}' risk — ${verdict.reason}`
    : requiresApproval
      ? `NEEDS APPROVAL: '${req.action}' is a '${verdict.tier}'-risk action requiring human sign-off — ${verdict.reason}`
      : `DENY: '${req.action}' blocked at '${verdict.tier}' risk — ${verdict.reason}`;

  const nextSteps = allowed
    ? ['Proceed with the action.']
    : requiresApproval
      ? ['Request an approval record for this action.', 'Wait for a human/policy decision before proceeding.']
      : ['Do not proceed.', 'If this looks wrong, adjust the target/policy and re-check — never bypass the gate.'];

  return {
    effect: verdict.effect,
    tier: verdict.tier,
    allowed,
    requiresApproval,
    summary,
    factors,
    routing: { routable: routing.routable, tier: routing.tier, target: routing.target ?? null },
    degraded: verdict.degraded,
    engine: verdict.engine,
    confidence: verdict.degraded ? 'degraded' : 'authoritative',
    auditHash: verdict.auditHash ?? null,
    approvalId: verdict.approvalGateId ?? null,
    nextSteps,
  };
}

/** Build a degrade-safe `KernelRequest` from loose (untrusted) MCP/invoke input. */
function toKernelRequest(args: NapiArgs): KernelRequest {
  return {
    actorId: typeof args.actorId === 'string' ? args.actorId : 'anonymous',
    action: (typeof args.action === 'string' ? args.action : 'tool.call') as KernelRequest['action'],
    target:
      args.target && typeof args.target === 'object'
        ? (args.target as KernelRequest['target'])
        : ({} as KernelRequest['target']),
    ...(typeof args.taskId === 'string' ? { taskId: args.taskId } : {}),
    ...(typeof args.requestId === 'string' ? { requestId: args.requestId } : {}),
  };
}

export class GovernanceNapiAdapter extends EngineClientBase<NapiArgs, unknown> {
  constructor(
    private readonly kernel: GovernanceKernelPort,
    private readonly log: Logger,
  ) {
    super('governance', 'napi');
  }

  // start/stop inherit the base no-ops: the kernel ladder's lifecycle is owned by
  // the governance module, not by this re-expose.

  async invoke(call: EngineCall<NapiArgs>): Promise<InvokeResult<unknown>> {
    const op = call.op;
    const input = (call.input ?? {}) as NapiArgs;
    try {
      switch (op) {
        case 'decide':
          return ok(await this.kernel.decide(toKernelRequest(input)));
        case 'enforceTool': {
          const toolName = str(input, 'toolName');
          if (!toolName) return fail('enforceTool requires toolName', 'BAD_INPUT');
          const toolInput =
            typeof input.input === 'string' ? input.input : JSON.stringify(input.input ?? {});
          const req = input.request && typeof input.request === 'object'
            ? toKernelRequest(input.request as NapiArgs)
            : undefined;
          return ok(await this.kernel.enforceTool(toolName, toolInput, req));
        }
        case 'route':
          return ok(await this.kernel.route(toKernelRequest(input)));
        case 'explain':
          return ok(await this.explainDecision(toKernelRequest(input)));
        case 'auditTip':
          return ok({ tipHash: await this.kernel.auditTip() });
        case 'verifyAudit':
          return ok(await this.kernel.verifyAudit());
        case 'status':
          return ok(this.kernel.status());
        default:
          return fail(`unknown governance op "${op}"`, 'UNKNOWN_OP');
      }
    } catch (err) {
      // Deny-biased by construction: a kernel that throws is a failure, never a
      // fabricated allow. Callers treat {ok:false} as "not allowed".
      return fail(`governance ${op} threw: ${msg(err)}`, 'KERNEL_THREW');
    }
  }

  /**
   * The `explain` capability: run a real governance decision and fold it with the
   * routing hint into a rich "why allow/deny" explanation. Composed over the
   * EXISTING `decide()` + `route()` port ops (no new native export). Deny-biased:
   * a throwing `decide()` propagates to `invoke`'s `KERNEL_THREW` fail (never a
   * fabricated allow); a routing fault degrades ONLY the routing view, keeping the
   * decision explanation truthful.
   */
  private async explainDecision(req: KernelRequest): Promise<GovernanceDecisionExplanation> {
    const verdict = await this.kernel.decide(req);
    let routing: RoutingHint;
    try {
      routing = await this.kernel.route(req);
    } catch (err) {
      // A routing fault must not lose the (already-computed) decision explanation.
      routing = { routable: false, tier: verdict.tier, reason: `routing unavailable: ${msg(err)}` };
    }
    return buildDecisionExplanation(req, verdict, routing);
  }

  async health(): Promise<EngineHealth> {
    const status = this.kernel.status();
    const checkedAt = new Date().toISOString();
    const base = { engineId: 'governance' as const, transport: 'napi' as const, checkedAt };

    if (status.status === 'down') {
      return { ...base, status: 'down', reason: status.reason ?? 'governance kernel down' };
    }
    // `up` only when the native rung answers and the verdict path is not degraded.
    if (status.status === 'up' && status.engine === 'napi' && !status.degraded) {
      return { ...base, status: 'up', version: `kernel:${status.engine}` };
    }
    // Ladder fell to daemon/ts (napi addon absent) or reports degraded — truthful.
    return {
      ...base,
      status: 'degraded',
      reason: status.reason ?? `governance kernel answering on '${status.engine}' rung (napi addon absent)`,
      version: `kernel:${status.engine}`,
    };
  }
}

/** Factory for the governance kernel engine client (thin re-expose). */
export function createGovernanceKernelClient(
  kernel: GovernanceKernelPort,
  log: Logger,
): GovernanceNapiAdapter {
  return new GovernanceNapiAdapter(kernel, log);
}
