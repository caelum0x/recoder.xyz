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

export interface GovernanceKernelPort {
  /** The fused decision pipeline (policy -> tier -> enforce -> verdict). */
  decide(req: KernelRequest): Promise<KernelVerdict>;

  /** Enforce a single tool invocation (deny-biased on fault). */
  enforceTool(toolName: string, input: string, req?: KernelRequest): Promise<ToolEnforcement>;

  /** Routing-only hint for a request. Unroutable on deny. */
  route(req: KernelRequest): Promise<RoutingHint>;

  /** The kernel's own current (in-memory) Merkle audit tip hash. */
  auditTip(): Promise<string>;

  /** Verify the kernel's own audit chain integrity. */
  verifyAudit(): Promise<AuditVerification>;

  /** Truthful engine status (which rung, up/down/degraded) — no fake `up`. */
  status(): KernelStatus;
}
