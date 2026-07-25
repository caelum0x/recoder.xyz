/**
 * `BillingComposer` — the composer that fuses the billing domain into one module.
 * It:
 *  - slices the billing config (BILLING_PROVIDER + per-provider keys/webhook
 *    secrets/product map) from `AppConfig` + the bootstrap-injected overrides,
 *  - builds the durable {@link MeteringRepository} over the Phase-1 persistence
 *    `QueryExecutor`,
 *  - builds the plan catalog, the four MoR provider adapters + the active-provider
 *    registry, and the distribution grant adapter (reused algebra — the core),
 *  - composes the WORKING {@link EntitlementGate}, the quota service, the metering
 *    ledger + flush loop, and the signature-gated webhook reconcile service,
 *  - exposes `gate()` (the cross-domain seam every other domain gates on) plus
 *    `metering()`/`quota()`/`provider()`,
 *  - mounts the `/api/billing` router (plan/checkout/portal/cancel + the raw-body
 *    webhook ingress) and the read-only MCP introspection tools,
 *  - reports truthful, degrade-safe health.
 *
 * No `process.env` reads (config is injected); no top-level singletons. Every
 * stateful path degrades safely: without a DB the repo no-ops truthfully and the
 * gate keeps deny-biasing; without a provider key the adapters report `down` and
 * paid grants deny while the free tier + static entitlements still serve.
 */
import { Router } from 'express';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { BillingProviderPort } from './ports/billing-provider.port.js';
import type { EntitlementGate } from './ports/entitlement.port.js';
import type { MeteringRepository } from './ports/metering-repo.port.js';
import type { BillingWriteGate } from './ports/governance-gate.port.js';
import type { BillingConfig } from './config.js';
import { createBillingRepository } from './persistence/billing.repository.js';
import { createPlanCatalog, type PlanCatalog } from './services/plan-catalog.service.js';
import { createDistributionBillingAdapter } from './adapters/distribution-billing.adapter.js';
import { createEntitlementService } from './services/entitlement.service.js';
import { createMeteringService, type MeteringService } from './services/metering.service.js';
import { createQuotaService, type QuotaService } from './services/quota.service.js';
import { createWebhookService, type WebhookService } from './services/webhook.service.js';
import { createInvoiceService, type InvoiceService } from './invoice.service.js';
import { createProviderRegistry, type ProviderRegistry } from './provider-registry.js';
import { buildBillingRouter } from './routes/billing.routes.js';
import { buildBillingWebhooksRouter } from './routes/billing-webhooks.routes.js';
import { buildInternalBillingRouter } from './routes/internal-billing.routes.js';
import { buildBillingMcpTools } from './mcp/billing-engine.js';
import { buildBillingHealth } from './health.js';
import type { BillingModule, BillingModuleDeps } from './index.js';

export class BillingComposer implements BillingModule {
  readonly name = 'billing' as const;

  private readonly log: Logger;
  private readonly cfg: BillingConfig;
  private readonly executor: QueryExecutor;
  private readonly middleware: AuthMiddleware;

  private readonly repo: MeteringRepository;
  private readonly catalog: PlanCatalog;
  private readonly registry: ProviderRegistry;
  private readonly entitlement: EntitlementGate;
  private readonly meteringService: MeteringService;
  private readonly quotaService: QuotaService;
  private readonly webhookService: WebhookService;
  private readonly invoiceService: InvoiceService;
  /** The governance write gate for billing mutations. Injected at bootstrap. */
  private writeGate?: BillingWriteGate;
  private started = false;

  constructor(deps: BillingModuleDeps, cfg: BillingConfig) {
    this.log = deps.logger;
    this.cfg = cfg;
    this.executor = deps.executor;
    this.middleware = deps.middleware;

    // Durable projections + usage ledger over the single persistence executor.
    this.repo = createBillingRepository(this.executor);

    // Static plan matrix + product map + the four MoR adapters (active by config).
    this.catalog = createPlanCatalog(cfg);
    this.registry = createProviderRegistry({
      config: cfg,
      catalog: this.catalog,
      logger: this.log,
    });

    // Distribution grant algebra (reused — the core). Absent port ⇒ deny-on-miss.
    const distribution = createDistributionBillingAdapter(
      deps.billingPort ? { billing: deps.billingPort } : {},
    );

    // THE cross-domain gate: effective plan + static matrix + durable quota.
    this.entitlement = createEntitlementService({
      repo: this.repo,
      catalog: this.catalog,
      distribution,
      logger: this.log,
      soloMode: cfg.soloMode,
      ...(deps.resolveAuthPlan ? { resolveAuthPlan: deps.resolveAuthPlan } : {}),
      ...(deps.resolveByok ? { resolveByok: deps.resolveByok } : {}),
    });

    // Usage ledger + provider flush loop (degrade-safe without a DB/provider).
    this.meteringService = createMeteringService({
      repo: this.repo,
      provider: this.registry.active(),
      flushIntervalMs: cfg.meterFlushIntervalMs,
      logger: this.log,
    });

    // Focused headroom engine (fail-safe deny path first) that also enforces
    // consumption through the ledger. Reuses the gate's effective-plan resolver.
    this.quotaService = createQuotaService({
      repo: this.repo,
      catalog: this.catalog,
      resolvePlan: (subject) => this.entitlement.resolvePlan(subject),
      metering: this.meteringService,
      logger: this.log,
      ...(deps.resolveByok ? { resolveByok: deps.resolveByok } : {}),
    });

    // Durable invoice/receipt projection over the SAME metering repo. The
    // webhook reconcile is the only writer; reads serve the billing UI.
    this.invoiceService = createInvoiceService({ repo: this.repo, logger: this.log });

    // Signature-gated, idempotent webhook reconcile (the ONLY projection writer)
    // — reconciles both the subscription snapshot AND the invoice receipt.
    this.webhookService = createWebhookService({
      repo: this.repo,
      catalog: this.catalog,
      registry: this.registry,
      invoices: this.invoiceService,
      logger: this.log,
    });

    if (deps.gate) this.writeGate = deps.gate;
  }

  gate(): EntitlementGate {
    return this.entitlement;
  }

  /**
   * Inject the governance gate that billing MUTATIONS (checkout/cancel) pass
   * through for policy + durable audit. Until set (or passed as `deps.gate`),
   * those mutations proceed UNGATED (degrade-safe — still authenticated + own
   * subject only). Never fabricates an audit record the gate did not make.
   */
  setGovernanceGate(gate: BillingWriteGate): void {
    this.writeGate = gate;
  }

  metering(): MeteringService {
    return this.meteringService;
  }

  quota(): QuotaService {
    return this.quotaService;
  }

  /** The ACTIVE Merchant-of-Record provider (chosen by `BILLING_PROVIDER`). */
  provider(): BillingProviderPort {
    return this.registry.active();
  }

  /** The `/api/billing` router: plan/checkout/portal/cancel + raw-body webhooks. */
  routes(): Router {
    const router = Router();
    router.use(
      buildBillingRouter({
        gate: this.entitlement,
        registry: this.registry,
        catalog: this.catalog,
        repo: this.repo,
        invoices: this.invoiceService,
        mw: this.middleware,
        logger: this.log,
        getGate: () => this.writeGate,
      }),
    );
    router.use(
      buildBillingWebhooksRouter({
        webhooks: this.webhookService,
        logger: this.log,
      }),
    );
    return router;
  }

  /** The `/internal/billing/*` router: `POST /meter` (INTERNAL_SERVICE_KEY-gated). */
  internalRoutes(): Router {
    return buildInternalBillingRouter({
      metering: this.meteringService,
      middleware: this.middleware,
    });
  }

  mcp(): readonly McpToolRegistration[] {
    return buildBillingMcpTools(this);
  }

  async health(): Promise<ComponentHealth> {
    return buildBillingHealth({
      repo: this.repo,
      gate: this.entitlement,
      metering: this.meteringService,
      provider: this.registry.active(),
    });
  }

  /** Boot: start the metering flush loop + log the truthful provider posture. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.meteringService.startFlushLoop();
    this.log.info(
      {
        provider: this.cfg.provider,
        providerConfigured: this.cfg[this.cfg.provider].present,
        webhookSecretConfigured: this.cfg[this.cfg.provider].webhookSecretPresent,
        meterFlushIntervalMs: this.cfg.meterFlushIntervalMs,
      },
      'billing module started',
    );
  }

  /** Shutdown: stop the flush loop. Idempotent, degrade-safe. */
  async stop(): Promise<void> {
    this.meteringService.stop();
    this.started = false;
  }
}
