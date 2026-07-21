/**
 * `GovernanceKernelPort` — the engine seam over the Rust governance kernel.
 *
 * FROZEN CONTRACT — Phase 3 seam. The gate service compiles against this while
 * the kernel-ladder adapter (napi -> daemon -> ts-fallback) is composed behind
 * it. Each rung implements THIS interface; the ladder composes them with a
 * fail-closed synthetic-deny floor.
 *
 * Every method is deny-biased on fault: an adapter that cannot answer returns a
 * `deny` verdict / `denied` enforcement (or the ladder falls to the next rung),
 * never a fabricated allow.
 */
import type {
  KernelRequest,
  KernelVerdict,
  ToolEnforcement,
  RoutingHint,
  KernelStatus,
  AuditVerification,
} from '../types.js';

/**
 * The result of a live policy hot-swap (`reloadPolicies`). Relocated here from the
 * retired `approval-store.port.ts` so it outlives that deleted file: the reload
 * verb is now a first-class KERNEL capability, not an approval-store concern.
 */
export interface ReloadPoliciesResult {
  /** True only when the active rung accepted and swapped the live policy bundle. */
  readonly reloaded: boolean;
  /** Truthful reason when the rung is static or the config was rejected. */
  readonly reason?: string;
}

export interface GovernanceKernelPort {
  /** The fused decision pipeline (policy -> tier -> enforce -> verdict). */
  decide(req: KernelRequest): Promise<KernelVerdict>;

  /** Enforce a single tool invocation (deny-biased on fault). */
  enforceTool(toolName: string, input: string, req?: KernelRequest): Promise<ToolEnforcement>;

  /** Routing-only hint for a request. Unroutable on deny. */
  route(req: KernelRequest): Promise<RoutingHint>;

  /**
   * Hot-swap the live policy bundle from a JSON `GovernanceKernelConfig`. Only the
   * in-proc napi rung can actually swap; daemon/ts rungs are static and return
   * `{ reloaded:false }` truthfully. Fail-closed inside the kernel: a rejected
   * config leaves the OLD policy live.
   */
  reloadPolicies(configJson: string): Promise<ReloadPoliciesResult>;

  /** The kernel's own current (in-memory) Merkle audit tip hash. */
  auditTip(): Promise<string>;

  /** Verify the kernel's own audit chain integrity. */
  verifyAudit(): Promise<AuditVerification>;

  /** Truthful engine status (which rung, up/down/degraded) — no fake `up`. */
  status(): KernelStatus;
}
