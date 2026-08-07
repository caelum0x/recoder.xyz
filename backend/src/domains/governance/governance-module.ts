/**
 * `GovernanceComposer` — the composer that fuses the moat into one module. It:
 *  - takes the assembled kernel ladder (napi→daemon→ts, fail-closed) built by the
 *    async factory in `index.ts`,
 *  - builds the durable repositories (audit / approval / work-lock / secret) over
 *    the Phase-1 persistence `QueryExecutor` injected via the container,
 *  - composes the audit chain, the WRITE gate (`decide→risk→audit`), and the
 *    secrets / work-lock / approval services,
 *  - exposes `GovernanceGate` + `SecretsPort` + `WorkLockService` + `ApprovalService`
 *    (registered under DI/capability tokens by bootstrap),
 *  - registers the approvals+locks and secrets routers (under `/api/agent-os`),
 *  - reports truthful health + the read-only MCP introspection tools.
 *
 * No `process.env` reads (config is injected); no top-level singletons. Every
 * stateful path is degrade-safe: without a DB the repos no-op truthfully and the
 * gate keeps deny-biasing; without a vault key secrets refuse rather than leak.
 */
import { Router } from 'express';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { GovernanceConfig } from './config.js';
import type { GovernanceKernelPort, ReloadPoliciesResult } from './ports/kernel.port.js';
import type { GovernanceGate } from './ports/gate.port.js';
import type { ToolExecEnforcementPort } from './ports/tool-exec-gate.port.js';
import type { ConsensusReviewPort } from './ports/consensus.port.js';
import type { SecretsPort } from './ports/secrets.port.js';
import {
  createVaultKeyring,
  keyringFromMasterKey,
  type VaultKeyring,
} from './adapters/keyring.adapter.js';
import { createAuditTipSigner } from './adapters/audit-signer.adapter.js';
import { createAuditRepository } from './repositories/audit.repository.js';
import {
  createApprovalRepository,
  createWorkLockRepository,
} from './repositories/approval-worklock.repository.js';
import { createSecretRepository } from './repositories/secret.repository.js';
import { AuditChainService } from './services/audit-chain.service.js';
import { GovernanceGateService } from './services/governance-gate.service.js';
import { createToolExecGate } from './services/tool-exec-gate.js';
import { createSecretsService, type SecretsService } from './services/secrets.service.js';
import { createWorkLockService, type WorkLockService } from './services/work-lock.service.js';
import { createApprovalService, type ApprovalService } from './services/approval.service.js';
import { buildGovernanceApprovalsRouter } from './routes/governance-approvals.routes.js';
import { buildGovernanceSecretsRouter } from './routes/governance-secrets.routes.js';
import { buildGovernanceHealth } from './health.js';
import { buildGovernanceMcpTools } from './mcp/governance-engine.js';
import type { GovernanceModule, GovernanceModuleDeps } from './index.js';

export class GovernanceComposer implements GovernanceModule {
  readonly name = 'governance' as const;

  private readonly log: Logger;
  private readonly cfg: GovernanceConfig;
  private readonly kernelPort: GovernanceKernelPort;
  private readonly executor: QueryExecutor;
  private readonly middleware: AuthMiddleware;
  private readonly keyring: VaultKeyring;
  private readonly auditChain: AuditChainService;
  private readonly gateService: GovernanceGateService;
  private readonly toolExecGatePort: ToolExecEnforcementPort;
  private readonly secretsService: SecretsService;
  private readonly workLockService: WorkLockService;
  private readonly approvalService: ApprovalService;
  private started = false;

  constructor(deps: GovernanceModuleDeps, cfg: GovernanceConfig, kernel: GovernanceKernelPort) {
    this.log = deps.logger;
    this.cfg = cfg;
    this.kernelPort = kernel;
    this.executor = deps.executor;
    this.middleware = deps.middleware;

    // Versioned master-key ring the secrets engine consumes — the envelope seam.
    // An explicit `vaultKeys` config engages real rotation (open-by-stored-version,
    // seal-active, rekey v(n)→v(n+1)); absent/empty ⇒ a v1-only ring over
    // `vaultMasterKey`, i.e. exactly today's single-key behavior. A null/invalid
    // active key yields a permanently `down` ring whose seal/rekey throw — secrets
    // fail-safe, never a plaintext fallback.
    this.keyring =
      cfg.vaultKeys && cfg.vaultKeys.length > 0
        ? createVaultKeyring({ keys: cfg.vaultKeys })
        : keyringFromMasterKey(cfg.vaultMasterKey, 1);

    // Durable repositories over the single persistence executor.
    const auditRepo = createAuditRepository(this.executor);
    const approvalRepo = createApprovalRepository(this.executor);
    const workLockRepo = createWorkLockRepository(this.executor);
    const secretRepo = createSecretRepository(this.executor);

    // The tamper-evident chain writer/verifier (cross-checks the kernel tip) plus
    // an ADDITIVE server-held ed25519 signer over the current tip hash. Absent
    // `auditSigningKey` ⇒ an unavailable signer ⇒ the tip is UNSIGNED (never forged).
    this.auditChain = new AuditChainService(
      auditRepo,
      kernel,
      this.log,
      createAuditTipSigner({ auditSigningKey: cfg.auditSigningKey }),
    );

    // THE write seam: decide → risk → audit. Fail-closed on any kernel fault. The
    // durable Postgres approval repository is the SOLE clearance store (the former
    // in-proc napi ApprovalManager was non-durable and never wired — retired).
    this.gateService = new GovernanceGateService({
      kernel,
      audit: this.auditChain,
      approvals: approvalRepo,
      soloMode: cfg.soloMode,
      logger: this.log,
    });

    // The per-tool teeth as a narrow, least-authority port (bound to the gate's
    // deny-biased + Merkle-sealing `enforceTool`). Injected at bootstrap into the
    // engines MCP host, where it gates the recoder-MCP-server tool stream at the
    // interop executor chokepoint. Boundary: it does NOT see an agent's own
    // in-worktree bash/file/secret ops (those never cross the executor).
    this.toolExecGatePort = createToolExecGate(this.gateService);

    // Secrets seal mutations into the SAME durable chain via the gate.
    this.secretsService = createSecretsService({
      repo: secretRepo,
      keyring: this.keyring,
      gate: this.gateService,
      logger: this.log,
    });

    this.workLockService = createWorkLockService({ repo: workLockRepo, logger: this.log });

    // Approvals seal lifecycle events into the durable chain (best-effort).
    this.approvalService = createApprovalService({
      repo: approvalRepo,
      logger: this.log,
      audit: this.gateService,
      soloMode: cfg.soloMode,
    });
  }

  /** Solo/desktop single-user mode — owner scoping fails OPEN (see `RuntimeConfig.soloMode`). */
  get soloMode(): boolean {
    return this.cfg.soloMode;
  }

  gate(): GovernanceGate {
    return this.gateService;
  }

  toolExecGate(): ToolExecEnforcementPort {
    return this.toolExecGatePort;
  }

  secrets(): SecretsPort {
    return this.secretsService;
  }

  workLocks(): WorkLockService {
    return this.workLockService;
  }

  approvals(): ApprovalService {
    return this.approvalService;
  }

  audit(): AuditChainService {
    return this.auditChain;
  }

  kernel(): GovernanceKernelPort {
    return this.kernelPort;
  }

  /**
   * Late-inject the adversarial multi-model CONSENSUS brain (pal). Governance is
   * composed BEFORE the engines module at bootstrap, so the pal facet is not
   * available at construction; bootstrap calls this once `engines.pal()` exists.
   * A pure passthrough to the gate's own setter — idempotent, last-writer-wins;
   * absent ⇒ the gate never runs a consensus review (kernel verdict is final).
   */
  setConsensusReview(port: ConsensusReviewPort): void {
    this.gateService.setConsensusReview(port);
  }

  /** Hot-swap the kernel's live policy bundle (agent-os policy-update hook). */
  async reloadPolicies(configJson: string): Promise<ReloadPoliciesResult> {
    const result = await this.gateService.reloadPolicies(configJson);
    this.log.info({ reloaded: result.reloaded, reason: result.reason }, 'governance policy reload');
    return result;
  }

  /** The `/api/agent-os` router: approvals + work-locks + secrets edges. */
  routes(): Router {
    const router = Router();
    router.use(
      buildGovernanceApprovalsRouter({
        approvals: this.approvalService,
        workLocks: this.workLockService,
        middleware: this.middleware,
        soloMode: this.cfg.soloMode,
      }),
    );
    router.use(
      buildGovernanceSecretsRouter({
        secrets: this.secretsService,
        mw: this.middleware,
        logger: this.log,
      }),
    );
    return router;
  }

  mcp(): readonly McpToolRegistration[] {
    return buildGovernanceMcpTools(this);
  }

  async health(): Promise<ComponentHealth> {
    return buildGovernanceHealth({
      kernel: this.kernelPort,
      executor: this.executor,
      // Report the seam the secrets engine actually consumes (the keyring).
      vault: this.keyring,
      auditEnabled: this.cfg.auditEnabled,
    });
  }

  /** Boot: log the truthful kernel/vault posture. Idempotent, never throws. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const ks = this.kernelPort.status();
    this.log.info(
      {
        kernel: ks.engine,
        kernelDegraded: ks.degraded,
        vaultAvailable: this.keyring.available,
        activeKeyVersion: this.keyring.activeVersion,
        auditEnabled: this.cfg.auditEnabled,
      },
      'governance module started',
    );
  }

  /** Shutdown: the daemon rung is process-global; the facades are GC-owned. No-op. */
  async stop(): Promise<void> {
    // Idempotent, degrade-safe: nothing owned here to drain.
  }
}
