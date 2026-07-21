/**
 * `GovernanceBackedKernel` — the shared `GovernanceKernelPort` wrapper around a
 * `@recoder/governance` `Governance` instance, stamped with the ladder rung that
 * owns it (`napi` | `daemon` | `ts`).
 *
 * All three ladder rungs (`napi-kernel`, `daemon-kernel`, `ts-kernel`) wrap the
 * SAME facade — the difference is only how the `Governance` was constructed
 * (native addon present / daemon socket resolved / neither) and thus which
 * internal path answers. In the assembled ladder higher rungs are tried first,
 * so the `engine` label is truthful: a rung is only reached when the rungs above
 * it are absent. The `degraded` flag comes straight from the verdict (never
 * faked non-degraded).
 */
import type { Governance } from '@recoder/governance';
import type { GovernanceKernelPort, ReloadPoliciesResult } from '../ports/kernel.port.js';
import {
  AUDIT_GENESIS_HASH,
  type AuditVerification,
  type KernelEngine,
  type KernelRequest,
  type KernelStatus,
  type KernelVerdict,
  type RoutingHint,
  type ToolEnforcement,
} from '../types.js';
import { toGovernanceRequest, toKernelVerdict } from './governance-request.mapper.js';

export class GovernanceBackedKernel implements GovernanceKernelPort {
  constructor(
    private readonly gov: Governance,
    private readonly engine: KernelEngine,
    private readonly statusReason?: string,
    /**
     * Live policy hot-swap, injected by the constructing rung. Only the napi rung
     * wires one (driving the addon handle); daemon/ts leave it undefined so
     * {@link reloadPolicies} reports a truthful `{ reloaded:false }` (static rung).
     */
    private readonly reloadFn?: (configJson: string) => Promise<ReloadPoliciesResult>,
  ) {}

  async decide(req: KernelRequest): Promise<KernelVerdict> {
    const verdict = await this.gov.decide(toGovernanceRequest(req));
    return toKernelVerdict(verdict, this.engine);
  }

  async enforceTool(toolName: string, input: string, req?: KernelRequest): Promise<ToolEnforcement> {
    const actor = toGovernanceRequest(req ?? { actorId: 'anonymous', action: 'tool.call', target: {} }).actor;
    const result = await this.gov.enforceTool(toolName, input, { actor, workspaceRoot: req?.context?.workspaceRoot });
    if (result.outcome === 'allowed') {
      return { outcome: 'allowed', reason: 'allowed', degraded: result.degraded ?? true, engine: this.engine };
    }
    return { outcome: 'denied', reason: result.reason, degraded: result.degraded ?? true, engine: this.engine };
  }

  async route(req: KernelRequest): Promise<RoutingHint> {
    const routing = await this.gov.route(toGovernanceRequest(req));
    return { routable: routing.routable !== false, tier: routing.tier, reason: routing.reason ?? '', target: routing.runtime };
  }

  async reloadPolicies(configJson: string): Promise<ReloadPoliciesResult> {
    // Only the rung that injected a reload hook (napi, via the addon handle) can
    // hot-swap the live bundle; daemon/ts are static and report so truthfully.
    if (!this.reloadFn) {
      return { reloaded: false, reason: `policy is static in the ${this.engine} rung` };
    }
    return this.reloadFn(configJson);
  }

  async auditTip(): Promise<string> {
    return this.gov.verifyAudit().tipHash ?? AUDIT_GENESIS_HASH;
  }

  async verifyAudit(): Promise<AuditVerification> {
    const result = this.gov.verifyAudit();
    return { ok: result.ok, brokenAtSeq: result.brokenAtSeq, tipHash: result.tipHash, entries: this.gov.auditEntries().length };
  }

  status(): KernelStatus {
    return { engine: this.engine, status: 'up', degraded: this.engine !== 'napi', reason: this.statusReason };
  }

  /** Close the underlying facade (daemon connection). Idempotent. */
  close(): void {
    this.gov.close();
  }
}
