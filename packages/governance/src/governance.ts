import type {
  Approval,
  PolicyDecision,
  PolicyEnginePort,
  PolicyEvaluationRequest,
} from '@recoder/agent-os';

import { type GovernanceConfig, type GovernanceConfigInput, loadGovernanceConfig } from './governance-config';
import { GovernancePolicyEngine } from './policy/policy-port';
import { RoutingService, DEFAULT_ROUTING_CATALOG, type RoutingCatalog } from './routing/router';
import { classifyTier } from './routing/tier-classifier';
import { estimateComplexity } from './routing/complexity-estimator';
import { FallbackEnforcer, type EnforcementContext } from './enforcement/enforcer';
import { resolveModeWithOverride } from './enforcement/permission-modes';
import { InMemoryAuditStore } from './audit/audit-store';
import { type IntegrityResult } from './audit/merkle-verifier';
import { ApprovalGateway, type ApprovalDecisionResult } from './approval/approval-gateway';
import { RiskTierApprovalPolicy, DEFAULT_RISK_TIER_POLICY, type RiskTierPolicy } from './approval/risk-tier-policy';
import { AutoApprover } from './approval/auto-approver';

import type { GovernanceRequest } from './domain/governance-request';
import type { GovernanceVerdict } from './domain/governance-verdict';
import type { RiskTier } from './domain/risk-tier';
import type { EnforcementResult } from './domain/enforcement-result';
import type { AuditInput, AuditOutcome } from './domain/audit-entry';

/**
 * Governance — the control-plane facade. It implements the agent-os
 * `PolicyEnginePort` and adds the full fused `decide()` pipeline that the
 * blueprint specifies:
 *
 *   policy chain (fused agent-policy + work-lock + forbidden-path)
 *     -> tier classification (complexity + risk)
 *     -> permission enforcement (deny-biased fallback enforcer)
 *     -> audit.record (SHA-256 Merkle chain)
 *     -> GovernanceVerdict
 *
 * The Rust daemon is DEFERRED on this build, so every risky decision uses the
 * pure-TS fallback path. The facade marks each verdict `degraded: true` to make
 * that visible, and it NEVER produces a silent allow on an error path.
 */
export class Governance implements PolicyEnginePort {
  private constructor(
    private readonly config: GovernanceConfig,
    private readonly policyEngine: GovernancePolicyEngine,
    private readonly routing: RoutingService,
    private readonly enforcer: FallbackEnforcer,
    private readonly audit: InMemoryAuditStore,
    private readonly approvals: ApprovalGateway,
    private readonly tierPolicy: RiskTierApprovalPolicy,
    private readonly autoApprover: AutoApprover,
  ) {}

  /** Build a Governance instance from a (validated) config. */
  static async create(input: GovernanceConfigInput = {}): Promise<Governance> {
    const config = loadGovernanceConfig(input);

    const policyEngine = new GovernancePolicyEngine({
      forbiddenPath: { extraGlobs: config.forbiddenPathGlobs },
    });

    const catalog = mergeRoutingCatalog(config);
    const routing = new RoutingService(catalog);
    const enforcer = new FallbackEnforcer();
    const audit = new InMemoryAuditStore();
    const approvals = new ApprovalGateway();
    const tierPolicy = new RiskTierApprovalPolicy(mergeTierPolicy(config));
    const autoApprover = new AutoApprover({
      enabled: config.autoApprove.enabled,
      ceiling: config.autoApprove.ceiling,
    });

    return new Governance(config, policyEngine, routing, enforcer, audit, approvals, tierPolicy, autoApprover);
  }

  // ---- agent-os PolicyEnginePort -------------------------------------------

  /** Evaluate via the fused policy chain (agent-os port surface). */
  evaluate(input: PolicyEvaluationRequest): PolicyDecision {
    return this.policyEngine.evaluate(input);
  }

  // ---- the fused verdict ----------------------------------------------------

  /**
   * The full fused decision pipeline. Always records an audit entry (when audit
   * is enabled) so the trail reflects every decision, allow or deny.
   */
  async decide(req: GovernanceRequest): Promise<GovernanceVerdict> {
    const now = req.now ?? new Date().toISOString();

    // 1. Policy chain (fused).
    const policy = this.policyEngine.evaluate(toEvaluationRequest(req));

    // 2. Tier classification.
    const complexity = estimateComplexity(req).total;
    const tier = classifyTier({
      action: req.action,
      effect: policy.effect,
      complexity,
      environment: req.target.environment,
    });

    // 3. Routing (unroutable on deny).
    const routing = this.routing.route(req, policy.effect);

    // 4. Enforcement — only run when the policy did not already hard-deny.
    let enforcement: EnforcementResult | undefined;
    let effect = policy.effect;
    let reason = policy.reason;

    if (policy.effect !== 'deny') {
      enforcement = this.runEnforcement(req);
      if (enforcement.outcome === 'denied') {
        // Enforcement overrides an allow/needs_approval into a hard deny.
        effect = 'deny';
        reason = enforcement.reason;
      }
    }

    // 5. Approval-tier gating: a needs_approval effect OR a tier above the
    //    approval floor requires a gate (unless the auto-approver clears it).
    let approvalGateId: string | undefined;
    if (effect === 'needs_approval' || (effect === 'allow' && this.tierPolicy.requiresApproval(tier))) {
      const autonomous = req.context?.autonomous ?? false;
      if (this.autoApprover.canAutoApprove(tier, autonomous)) {
        effect = 'allow';
        reason = `Auto-approved at tier '${tier}' (autonomous, within ceiling).`;
      } else {
        effect = 'needs_approval';
        if (reason === policy.reason && policy.effect === 'allow') {
          reason = `Tier '${tier}' requires human approval.`;
        }
      }
    }

    // 6. Audit record (the trail reflects the final effect).
    const auditHash = this.recordVerdictAudit(req, effect, tier, reason, now);

    const verdict: GovernanceVerdict = {
      verdictId: `gov_verdict_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      requestId: req.requestId,
      effect,
      tier,
      reason,
      policy,
      routing,
      enforcement,
      auditHash,
      degraded: true, // Rust daemon deferred — every verdict uses the TS fallback.
      approvalGateId,
      createdAt: now,
    };
    return verdict;
  }

  /** Routing-only convenience (brain/planner hint). */
  async route(req: GovernanceRequest) {
    const policy = this.policyEngine.evaluate(toEvaluationRequest(req));
    return this.routing.route(req, policy.effect);
  }

  /** Enforce a single tool invocation directly (runtime adapter seam). */
  enforceTool(toolName: string, input: string, ctx: EnforcementContext, kind?: 'bash' | 'file_write' | 'generic') {
    return this.enforcer.enforceTool(toolName, input, ctx, kind);
  }

  // ---- approvals ------------------------------------------------------------

  /** Open an approval gate and return the awaited decision promise. */
  requestApproval(input: {
    taskId: string;
    runId?: string;
    reason: string;
    requestedBy: string;
    tier: RiskTier;
    requiredAt?: Approval['requiredAt'];
    target?: Approval['target'];
    metadata?: Record<string, unknown>;
  }): { approval: Approval; awaited: Promise<ApprovalDecisionResult> } {
    const timeoutMs = this.tierPolicy.timeoutMs(input.tier);
    return this.approvals.request({ ...input, timeoutMs });
  }

  /** Resolve a pending approval with a human decision. */
  resolveApproval(
    approvalId: string,
    decision: 'approved' | 'rejected',
    decidedBy: string,
    reason?: string,
  ): ApprovalDecisionResult {
    const result = this.approvals.resolve(approvalId, decision, decidedBy, reason);
    this.recordAudit({
      timestamp: new Date().toISOString(),
      actor: decidedBy,
      action: 'approval.resolved',
      detail: `Approval ${approvalId} ${decision}`,
      outcome: decision === 'approved' ? 'allow' : 'deny',
    });
    return result;
  }

  // ---- audit ----------------------------------------------------------------

  /** Record an audit entry; returns the new Merkle tip hash. */
  recordAudit(input: AuditInput): string {
    if (!this.config.auditEnabled) {
      return this.audit.tipHash();
    }
    const entry = this.audit.record(input);
    return entry.hash;
  }

  /** Verify the audit chain integrity. */
  verifyAudit(): { ok: boolean; brokenAtSeq?: number; tipHash?: string } {
    const result: IntegrityResult = this.audit.verify();
    if (result.ok) {
      return { ok: true, tipHash: result.tipHash };
    }
    return { ok: false, brokenAtSeq: result.brokenAtSeq };
  }

  /** Read-only view of the audit chain (defensive copy). */
  auditEntries() {
    return this.audit.all();
  }

  /** Current config (read-only). */
  getConfig(): GovernanceConfig {
    return this.config;
  }

  /** Truthful health: degraded because the Rust daemon is deferred. */
  health(): { status: 'degraded'; daemon: 'unavailable'; fallback: 'pure-ts-deny-biased'; auditOk: boolean } {
    return {
      status: 'degraded',
      daemon: 'unavailable',
      fallback: 'pure-ts-deny-biased',
      auditOk: this.verifyAudit().ok,
    };
  }

  // ---- internals ------------------------------------------------------------

  private runEnforcement(req: GovernanceRequest): EnforcementResult {
    const ctx: EnforcementContext = {
      actor: req.actor,
      workspaceRoot: req.context?.workspaceRoot,
    };
    if (req.action === 'command.run' && (req.target.command || req.context?.bashInput)) {
      return this.enforcer.enforceTool(
        req.target.toolName ?? 'bash',
        req.target.command ?? req.context?.bashInput ?? '',
        ctx,
        'bash',
      );
    }
    if (req.action === 'file.write' && req.target.path) {
      return this.enforcer.enforceTool(req.target.toolName ?? 'file_write', req.target.path, ctx, 'file_write');
    }
    if (req.action === 'tool.call' && req.target.toolName) {
      return this.enforcer.enforceTool(req.target.toolName, '', ctx, 'generic');
    }
    // Reads and other actions need no enforcement gate.
    return { outcome: 'allowed', degraded: true };
  }

  private recordVerdictAudit(
    req: GovernanceRequest,
    effect: GovernanceVerdict['effect'],
    tier: RiskTier,
    reason: string,
    now: string,
  ): string | undefined {
    if (!this.config.auditEnabled) return undefined;
    const outcome: AuditOutcome = effect === 'allow' ? 'allow' : effect === 'deny' ? 'deny' : 'needs_approval';
    const entry = this.audit.record({
      timestamp: now,
      actor: req.actor.agentId,
      action: 'decision.made',
      detail: `${req.action} tier=${tier} -> ${effect}: ${reason}`,
      outcome,
      runId: req.task?.taskId,
    });
    return entry.hash;
  }
}

// ---- helpers ----------------------------------------------------------------

function toEvaluationRequest(req: GovernanceRequest): PolicyEvaluationRequest {
  return {
    actor: req.actor,
    task: req.task,
    action: req.action,
    target: { ...req.target },
    workLocks: req.workLocks ? [...req.workLocks] : undefined,
    now: req.now,
  };
}

function mergeRoutingCatalog(config: GovernanceConfig): RoutingCatalog {
  return {
    low: config.routing.low ?? DEFAULT_ROUTING_CATALOG.low,
    medium: config.routing.medium ?? DEFAULT_ROUTING_CATALOG.medium,
    high: config.routing.high ?? DEFAULT_ROUTING_CATALOG.high,
    critical: config.routing.critical ?? DEFAULT_ROUTING_CATALOG.critical,
  };
}

function mergeTierPolicy(config: GovernanceConfig): RiskTierPolicy {
  return {
    low: DEFAULT_RISK_TIER_POLICY.low,
    medium: DEFAULT_RISK_TIER_POLICY.medium,
    high: { requiresApproval: true, timeoutMs: config.approvalTimeouts.high },
    critical: { requiresApproval: true, timeoutMs: config.approvalTimeouts.critical },
  };
}

export { resolveModeWithOverride };
