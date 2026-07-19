/**
 * Governance domain — public factory + the ONE public interface.
 *
 * `createGovernanceModule(deps)` (ASYNC — it probes/assembles the kernel ladder)
 * builds the composer that hosts THE write seam (`GovernanceGate.decide`), the
 * tamper-evident Merkle audit chain, the envelope-encrypted secrets store, path
 * work-locks, and the control-plane approval gate.
 *
 * The seam surface (`gate()`, `secrets()`, `workLocks()`, `approvals()`) is what
 * every stateful domain (agent-os, conductor, billing, memory, cloud, interop)
 * compiles against. Degrade-safe throughout: without a DB the durable repos
 * no-op truthfully and the kernel ladder deny-biases on the pure-TS floor;
 * without a vault master key secrets refuse rather than store plaintext.
 */
import type { Router } from 'express';
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { GovernanceGate } from './ports/gate.port.js';
import type { SecretsPort } from './ports/secrets.port.js';
import type { GovernanceKernelPort } from './ports/kernel.port.js';
import type { WorkLockService } from './services/work-lock.service.js';
import type { ApprovalService } from './services/approval.service.js';
import type { AuditChainService } from './services/audit-chain.service.js';
import type { ReloadPoliciesResult } from './ports/approval-store.port.js';
import type { GovernanceConfigOverrides } from './config.js';

/** Dependencies injected by bootstrap (after persistence + identity are built). */
export interface GovernanceModuleDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** The persistence executor the durable audit/approval/lock/secret repos bind to. */
  readonly executor: QueryExecutor;
  /** The composed identity auth middleware the approvals/secrets edges guard with. */
  readonly middleware: AuthMiddleware;
  /** Not-yet-in-AppConfig governance values (vault key, daemon socket, napi toggle). */
  readonly overrides?: GovernanceConfigOverrides;
  /**
   * The raw `recoder-governance-napi` `NapiGovernanceKernel` handle, when the
   * native addon is loaded for this arch/platform. Injected by bootstrap; used to
   * back the gate's `needs_approval` clearance + policy hot-swap with the kernel's
   * OWN `ApprovalManager` store. Absent → the gate degrades truthfully to the
   * durable Postgres approval repository (no behavior change).
   */
  readonly napiApprovalHandle?: unknown;
}

/** The public surface every other domain consumes. */
export interface GovernanceModule {
  readonly name: 'governance';
  /** THE write seam: `decide → risk → audit` for every governed mutation. */
  gate(): GovernanceGate;
  /** The envelope-encrypted secret store (get/set/rotate/delete/list). */
  secrets(): SecretsPort;
  /** Path/work-lock acquire/release/check (conflict prevention before writes). */
  workLocks(): WorkLockService;
  /** The control-plane approval-gate lifecycle (clears `needs_approval`). */
  approvals(): ApprovalService;
  /** The durable Merkle audit chain writer/verifier. */
  audit(): AuditChainService;
  /** The assembled kernel ladder (truthful `status()` reports which rung answers). */
  kernel(): GovernanceKernelPort;
  /**
   * Hot-swap the kernel's live policy bundle — the agent-os policy-update hook
   * calls this after a forbidden/secret-path or approval-policy edit so it takes
   * effect for subsequent `decide()`/`enforceTool` without a restart. Fail-closed
   * inside the kernel; degrade-truthful (`reloaded:false`) when the napi kernel is
   * absent (policy is static in that build).
   */
  reloadPolicies(configJson: string): Promise<ReloadPoliciesResult>;
  /** The `/api/agent-os` router: approvals + locks + secrets edges. */
  routes(): Router;
  /** Read-only MCP introspection tools (kernel status / audit verify / locks). */
  mcp(): readonly McpToolRegistration[];
  /** Truthful component health. */
  health(): Promise<ComponentHealth>;
  /** Boot hook (idempotent). */
  start(): Promise<void>;
  /** Shutdown hook (idempotent, degrade-safe). */
  stop(): Promise<void>;
}

// Value imports last so the type-only imports above form no runtime cycle.
import { GovernanceComposer } from './governance-module.js';
import { sliceGovernanceConfig } from './config.js';
import { createKernelLadder } from './adapters/kernel-ladder.adapter.js';

/**
 * Build the governance module. ASYNC because the kernel ladder is probed at
 * assembly (napi addon load → daemon socket → pure-TS floor). Never throws for a
 * missing native/daemon path — the ladder degrades to the deny-biased TS rung.
 */
export async function createGovernanceModule(deps: GovernanceModuleDeps): Promise<GovernanceModule> {
  const cfg = sliceGovernanceConfig(deps.config, deps.overrides ?? {});
  const kernel = await createKernelLadder(cfg);
  return new GovernanceComposer(deps, cfg, kernel);
}
