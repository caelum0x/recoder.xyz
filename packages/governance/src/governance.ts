import type {
  Approval,
  PolicyDecision,
  PolicyEnginePort,
  PolicyEvaluationRequest,
} from '@recoder/agent-os';

import {
  type GovernanceConfig,
  type GovernanceConfigInput,
  loadGovernanceConfig,
  resolveDaemonSocketPath,
} from './governance-config';
import { GovernanceDaemonClient } from './ipc/daemon-client';
import {
  parseDaemonDecideResult,
  parseDaemonEnforceResult,
  parseDaemonAuditHash,
} from './ipc/daemon-verdict';
import { DaemonUnavailableError } from './errors';
import { allowed, denied } from './domain/enforcement-result';
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
    /**
     * The Rust governance daemon client, present only when a socket is
     * configured (GOVERNANCE_SOCKET env or config.daemonSocketPath). When
     * present, decide/enforceTool/recordAudit try it first and fall back to the
     * pure-TS deny-biased path on DaemonUnavailable. When absent, the TS path is
     * the only path (default — no behavior change).
     */
    private readonly daemon?: GovernanceDaemonClient,
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

    // Daemon delegation is OPT-IN: only when a socket path is resolved. Default
    // (no socket) keeps the pure-TS path as the sole path — no behavior change.
    const socketPath = resolveDaemonSocketPath(config);
    const daemon = socketPath ? new GovernanceDaemonClient({ socketPath }) : undefined;

    return new Governance(
      config,
      policyEngine,
      routing,
      enforcer,
      audit,
      approvals,
      tierPolicy,
      autoApprover,
      daemon,
    );
  }

  // ---- agent-os PolicyEnginePort -------------------------------------------

  /** Evaluate via the fused policy chain (agent-os port surface). */
  evaluate(input: PolicyEvaluationRequest): PolicyDecision {
    return this.policyEngine.evaluate(input);
  }

  // ---- the fused verdict ----------------------------------------------------

  /**
   * The full fused decision pipeline. When a daemon is configured it is asked
   * FIRST; on `DaemonUnavailable` (no socket, transport/validation failure, or a
   * daemon-reported error) it falls back to the pure-TS deny-biased path. The
   * fallback NEVER fabricates an allow — it re-runs the conservative TS pipeline.
   */
  async decide(req: GovernanceRequest): Promise<GovernanceVerdict> {
    if (this.daemon) {
      try {
        return await this.decideViaDaemon(req);
      } catch (err) {
        if (!(err instanceof DaemonUnavailableError)) throw err;
        // Fall through to the pure-TS deny-biased path (fail closed).
      }
    }
    return this.decideViaTs(req);
  }

  /**
   * Delegate the decision to the Rust daemon. The daemon's effect/tier/reason
   * are authoritative; routing is derived locally from that effect (a denied
   * action is structurally unroutable). The daemon reply is validated hostilely:
   * any malformed field throws DaemonUnavailableError -> the facade falls back.
   */
  private async decideViaDaemon(req: GovernanceRequest): Promise<GovernanceVerdict> {
    const now = req.now ?? new Date().toISOString();
    const raw = await this.daemon!.decide(toDaemonDecideParams(req));
    const d = parseDaemonDecideResult(raw);

    // The local policy decision is still computed for the verdict envelope so
    // downstream consumers keep a structured policy view; the daemon's effect is
    // authoritative and overrides it.
    const policy = this.policyEngine.evaluate(toEvaluationRequest(req));
    const routing = this.routing.route(req, d.effect);

    const verdict: GovernanceVerdict = {
      verdictId: `gov_verdict_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      requestId: req.requestId,
      effect: d.effect,
      tier: d.tier,
      reason: d.reason,
      policy,
      routing,
      auditHash: d.auditHash,
      degraded: false, // authoritative daemon decision
      approvalGateId: d.approvalGateId,
      createdAt: now,
    };
    return verdict;
  }

  /**
   * The pure-TS deny-biased pipeline. Always records an audit entry (when audit
   * is enabled) so the trail reflects every decision, allow or deny.
   */
  private async decideViaTs(req: GovernanceRequest): Promise<GovernanceVerdict> {
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

  /**
   * Enforce a single tool invocation directly (runtime adapter seam). When a
   * daemon is configured it is asked FIRST; on DaemonUnavailable it falls back
   * to the pure-TS deny-biased enforcer. The fallback never fabricates an allow.
   */
  async enforceTool(
    toolName: string,
    input: string,
    ctx: EnforcementContext,
    kind: 'bash' | 'file_write' | 'generic' = 'generic',
  ): Promise<EnforcementResult> {
    if (this.daemon) {
      try {
        const raw = await this.daemon.enforceTool(toDaemonEnforceParams(toolName, input, ctx, kind));
        const d = parseDaemonEnforceResult(raw);
        if (d.outcome === 'allowed') {
          return allowed(false);
        }
        return denied({
          tool: d.tool,
          activeMode: resolveModeWithOverride(ctx.actor, ctx.modeOverride),
          requiredMode: 'workspace_write',
          reason: d.reason,
          degraded: false,
        });
      } catch (err) {
        if (!(err instanceof DaemonUnavailableError)) throw err;
        // Fall through to the pure-TS deny-biased enforcer (fail closed).
      }
    }
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

  /**
   * Record an audit entry into the local Merkle chain; returns the new tip hash.
   * This is the synchronous pure-TS path (the fallback for `recordAuditViaDaemon`
   * and the path used internally when no daemon is configured).
   */
  recordAudit(input: AuditInput): string {
    if (!this.config.auditEnabled) {
      return this.audit.tipHash();
    }
    const entry = this.audit.record(input);
    return entry.hash;
  }

  /**
   * Daemon-first audit record. When a daemon is configured it is asked FIRST and
   * its returned tip hash is authoritative; on DaemonUnavailable it falls back to
   * the local synchronous Merkle chain (`recordAudit`). The fallback always
   * records — an audit write is never silently dropped on daemon failure.
   */
  async recordAuditViaDaemon(input: AuditInput): Promise<string> {
    if (this.daemon) {
      try {
        const raw = await this.daemon.recordAudit(toDaemonAuditParams(input));
        return parseDaemonAuditHash(raw);
      } catch (err) {
        if (!(err instanceof DaemonUnavailableError)) throw err;
        // Fall through to the local Merkle chain (fail closed: still record).
      }
    }
    return this.recordAudit(input);
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

  /**
   * Truthful synchronous health: reports the local pure-TS fallback view. When
   * no daemon is configured this is the whole story (degraded). When a daemon IS
   * configured, use `healthViaDaemon()` for a live probe; this sync view stays
   * conservative ('degraded'/'unavailable') until that probe succeeds, never
   * claiming the daemon is up without evidence.
   */
  health(): { status: 'degraded'; daemon: 'unavailable'; fallback: 'pure-ts-deny-biased'; auditOk: boolean } {
    return {
      status: 'degraded',
      daemon: 'unavailable',
      fallback: 'pure-ts-deny-biased',
      auditOk: this.verifyAudit().ok,
    };
  }

  /**
   * Live daemon health probe. Returns the daemon's reported status when it
   * answers; on DaemonUnavailable returns the conservative degraded view. Never
   * claims 'up' without a real round-trip — fail closed to 'degraded'.
   */
  async healthViaDaemon(): Promise<{
    status: 'ok' | 'degraded';
    daemon: 'available' | 'unavailable';
    fallback: 'pure-ts-deny-biased';
    auditOk: boolean;
  }> {
    const auditOk = this.verifyAudit().ok;
    if (!this.daemon) {
      return { status: 'degraded', daemon: 'unavailable', fallback: 'pure-ts-deny-biased', auditOk };
    }
    try {
      await this.daemon.health();
      return { status: 'ok', daemon: 'available', fallback: 'pure-ts-deny-biased', auditOk };
    } catch (err) {
      if (!(err instanceof DaemonUnavailableError)) throw err;
      return { status: 'degraded', daemon: 'unavailable', fallback: 'pure-ts-deny-biased', auditOk };
    }
  }

  /** Whether a daemon client is wired (a socket was resolved at create time). */
  hasDaemon(): boolean {
    return this.daemon !== undefined;
  }

  /** Close the daemon connection (if any). Idempotent; safe when no daemon. */
  close(): void {
    this.daemon?.close();
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

/**
 * The agent-os `PolicyAction` -> the daemon's native snake_case
 * `GovernanceAction` (recoder-governance-kernel/src/request.rs). The daemon
 * deserializes `action` against THAT enum, so the dotted agent-os action names
 * (`file.read`) must be projected to the kernel's wire strings (`file_read`) or
 * the daemon rejects the payload as `bad_request` and the facade fails closed to
 * its TS fallback. Keeping this map exhaustive is what makes daemon delegation
 * actually fire instead of silently degrading.
 */
const DAEMON_ACTION: Readonly<Record<string, string>> = {
  'file.read': 'file_read',
  'file.write': 'file_write',
  'command.run': 'command',
  'tool.call': 'tool_use',
  'memory.write': 'memory_write',
  'artifact.publish': 'deploy',
  'deploy.preview': 'deploy',
  'branch.push': 'push',
  'pr.create': 'push',
};

/** Project the structured target onto the daemon's single `target` string. */
function daemonTarget(target: GovernanceRequest['target']): string {
  return target.path ?? target.command ?? target.toolName ?? target.environment ?? '';
}

/**
 * Serialize a GovernanceRequest into the daemon's NATIVE `decide` params — the
 * flat `GovernanceRequest` the Rust kernel deserializes (string actor/task,
 * snake_case action, string target, snake_case context). This is NOT the
 * agent-os request shape: sending that verbatim makes the daemon reject the
 * payload, so the facade would always fall back to TS. Projecting here is what
 * lets the owned Rust kernel actually decide.
 */
function toDaemonDecideParams(req: GovernanceRequest): Record<string, unknown> {
  const workLockPaths = (req.workLocks ?? [])
    .map((lock) => lock.pathGlob)
    .filter((glob): glob is string => typeof glob === 'string' && glob.length > 0);

  return {
    actor: req.actor.agentId,
    // The daemon rejects an empty task; fall back to the request id so a
    // task-less decision still validates.
    task: req.task?.taskId ?? req.requestId,
    action: DAEMON_ACTION[req.action] ?? 'tool_use',
    target: daemonTarget(req.target),
    context: {
      tool_name: req.target.toolName ?? '',
      tool_input: req.target.command ?? req.context?.bashInput ?? '',
      depth: req.context?.subagentDepth ?? 0,
      work_lock_paths: workLockPaths,
      enforce_work_lock: workLockPaths.length > 0,
      messages: [],
    },
  };
}

/** Serialize an enforceTool call into the daemon's `enforceTool` params. */
function toDaemonEnforceParams(
  toolName: string,
  input: string,
  ctx: EnforcementContext,
  kind: 'bash' | 'file_write' | 'generic',
): Record<string, unknown> {
  return {
    toolName,
    input,
    kind,
    actor: ctx.actor,
    workspaceRoot: ctx.workspaceRoot,
    modeOverride: ctx.modeOverride,
  };
}

/** Serialize an AuditInput into the daemon's `recordAudit` params. */
function toDaemonAuditParams(input: AuditInput): Record<string, unknown> {
  return {
    timestamp: input.timestamp,
    actor: input.actor,
    action: input.action,
    detail: input.detail,
    outcome: input.outcome,
    runId: input.runId,
    metadata: input.metadata,
  };
}

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
