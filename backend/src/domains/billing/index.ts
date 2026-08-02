/**
 * Billing domain — public CORE barrel (Phase 9, billing core).
 *
 * This exports the FROZEN seams + the working entitlement stack the rest of the
 * backend wires against BEFORE any provider adapter exists:
 *
 *   - {@link EntitlementGate}  — the cross-domain gate (ports/entitlement.port).
 *   - {@link BillingProviderPort} — the ONE Merchant-of-Record seam (Polar /
 *     Creem / Paddle / Dodo; never a raw card processor).
 *   - {@link MeteringRepository} — the durable data port + its impl.
 *   - {@link createEntitlementService} — the concrete WORKING gate.
 *
 * The composer (`billing-module.ts`), provider adapters, webhook/metering
 * services, routes, and MCP engine land in later Phase-9 steps. Bootstrap wiring
 * (config overrides for provider keys, `EntitlementGate` injection into
 * conductor/inference/engines) is a SERIAL integrate step — see the build report.
 */

// Types (domain vocabulary — reuses @recoder/distribution algebra, adds `max`).
export * from './types.js';

// Config slice (BILLING_PROVIDER + POLAR_*/CREEM_*/PADDLE_*/DODO_* keys).
export {
  sliceBillingConfig,
  activeProviderCredential,
  isBillingConfigured,
  billingConfigSchema,
  type BillingConfig,
  type BillingConfigOverrides,
  type ProviderCredential,
  type ProviderCredentialOverrides,
} from './config.js';

// Ports (frozen seams).
export type { BillingProviderPort } from './ports/billing-provider.port.js';
export type { BillingWriteGate } from './ports/governance-gate.port.js';
export type {
  MeteringRepository,
  SubscriptionUpsert,
  UsageEventInput,
  CounterUpsert,
  IdempotentWrite,
} from './ports/metering-repo.port.js';
export type { EntitlementGate } from './ports/entitlement.port.js';

// Persistence (concrete MeteringRepository over QueryExecutor).
export { createBillingRepository } from './persistence/billing.repository.js';

// Services + adapters (the working entitlement stack).
export {
  createPlanCatalog,
  PLAN_CAPABILITIES,
  PLAN_QUOTAS,
  type PlanCatalog,
} from './services/plan-catalog.service.js';
export {
  createDistributionBillingAdapter,
  type DistributionBillingAdapter,
  type DistributionBillingAdapterDeps,
} from './adapters/distribution-billing.adapter.js';
export {
  createEntitlementService,
  type EntitlementServiceDeps,
} from './services/entitlement.service.js';

// Metering-quota group: the durable usage ledger + the fail-safe quota checker.
export {
  createMeteringService,
  type MeteringService,
  type MeteringServiceDeps,
  type MeterInput,
  type BatchRecordResult,
} from './services/metering.service.js';
export {
  createQuotaService,
  type QuotaService,
  type QuotaServiceDeps,
  type QuotaConsumeResult,
  type ConsumeContext,
} from './services/quota.service.js';

// MoR provider group: the four adapters (Polar / Creem / Paddle / Dodo — NO
// raw-card seam), the BILLING_PROVIDER-selected registry, and the durable
// invoice projection.
export { createPolarAdapter } from './adapters/polar.adapter.js';
export { createCreemAdapter } from './adapters/creem.adapter.js';
export { createPaddleAdapter } from './adapters/paddle.adapter.js';
export { createDodoAdapter } from './adapters/dodo.adapter.js';
export type { ProviderAdapterDeps } from './adapters/shared.js';
export {
  createProviderRegistry,
  type ProviderRegistry,
  type ProviderRegistryDeps,
} from './provider-registry.js';
export {
  createInvoiceService,
  type InvoiceService,
  type InvoiceServiceDeps,
} from './invoice.service.js';

// Webhooks group: the signature-gated, idempotent reconcile service.
export {
  createWebhookService,
  type WebhookService,
  type WebhookServiceDeps,
  type WebhookProcessResult,
  type WebhookAction,
} from './services/webhook.service.js';

// --- The composed module (factory + public surface) ---

import type { Router } from 'express';
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { BillingProviderPort as BillingProviderPortType } from './ports/billing-provider.port.js';
import type { EntitlementGate as EntitlementGateType } from './ports/entitlement.port.js';
import type { MeteringService as MeteringServiceType } from './services/metering.service.js';
import type { QuotaService as QuotaServiceType } from './services/quota.service.js';
import type { BillingWriteGate as BillingWriteGateType } from './ports/governance-gate.port.js';
// TYPE-ONLY: the frozen Phase-11 tracing seam (erased at build; late-bound value).
import type { TracerPort as TracerPortType } from '../observability/ports/tracer.port.js';
import type { BillingConfigOverrides } from './config.js';
import type { BillingSubject, PlanTier } from './types.js';

/**
 * Dependencies injected by bootstrap (after persistence + identity are built).
 * The optional cross-domain resolvers let the gate compute
 * `max(recoder.xyz auth plan, webhook-confirmed subscription)` and honor BYOK;
 * `billingPort` supplies the distribution grant source when a provider is wired.
 */
export interface BillingModuleDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** The persistence executor the durable projections + usage ledger bind to. */
  readonly executor: QueryExecutor;
  /** The composed identity auth middleware the `/api/billing` edges guard with. */
  readonly middleware: AuthMiddleware;
  /** Not-yet-in-AppConfig billing values (provider keys, webhook secrets, product map). */
  readonly overrides?: BillingConfigOverrides;
  /** Resolve a subject's recoder.xyz auth plan (the other half of `max(...)`). */
  readonly resolveAuthPlan?: (subject: BillingSubject) => Promise<PlanTier | null> | PlanTier | null;
  /** Resolve whether a subject is BYOK (skips token-metered quota). */
  readonly resolveByok?: (subject: BillingSubject) => Promise<boolean> | boolean;
  /** The distribution grant port (grant-based lifts). Absent ⇒ deny-on-miss. */
  readonly billingPort?: import('@recoder/distribution').BillingPort;
  /**
   * The governance write gate (`decide` facet) that billing MUTATIONS pass
   * through for policy + durable audit. Optional: absent ⇒ mutations proceed
   * ungated (degrade-safe) until `setGovernanceGate` is called at bootstrap.
   */
  readonly gate?: BillingWriteGateType;
}

/** The public surface every other domain consumes. */
export interface BillingModule {
  readonly name: 'billing';
  /** THE cross-domain gate: `resolvePlan`/`check`/`checkFeature`/`checkQuota`/`view`. */
  gate(): EntitlementGateType;
  /**
   * Inject the governance write gate that billing mutations (checkout/cancel)
   * pass through for policy + durable audit. Idempotent; degrade-safe until set.
   */
  setGovernanceGate(gate: BillingWriteGateType): void;
  /**
   * BE-7.3b: late-bind the observability tracer (bootstrap, AFTER observability
   * composes). Once set, every outbound provider HTTP call opens a
   * `billing.provider_call` child span + carries W3C `traceparent`. Unwired ⇒
   * the untraced call path (degrade-truthful, never a fabricated span).
   */
  setTracer(tracer: TracerPortType): void;
  /** The durable usage ledger + provider flush loop. */
  metering(): MeteringServiceType;
  /** The focused headroom engine (check + enforce-consume). */
  quota(): QuotaServiceType;
  /** The ACTIVE Merchant-of-Record provider (chosen by `BILLING_PROVIDER`). */
  provider(): BillingProviderPortType;
  /** The `/api/billing` router: plan/checkout/portal/cancel + raw-body webhooks. */
  routes(): Router;
  /** The `/internal/billing/*` router: `POST /meter` (INTERNAL_SERVICE_KEY-gated). */
  internalRoutes(): Router;
  /** Read-only MCP introspection tools (plan/usage/provider status). */
  mcp(): readonly McpToolRegistration[];
  /** Truthful component health (degrade-safe — never a faked `up`). */
  health(): Promise<ComponentHealth>;
  /** Boot hook (starts the metering flush loop). Idempotent. */
  start(): Promise<void>;
  /** Shutdown hook (stops the flush loop). Idempotent, degrade-safe. */
  stop(): Promise<void>;
}

// Value imports last so the type-only imports above form no runtime cycle.
import { BillingComposer } from './billing-module.js';
import { sliceBillingConfig } from './config.js';

/**
 * Build the billing module. Synchronous — no engine daemons, pure TS + HTTPS.
 * Never throws for a missing provider key: the adapters degrade to `down` and the
 * gate keeps serving the free tier + static entitlements (fail-safe law §37).
 */
export function createBillingModule(deps: BillingModuleDeps): BillingModule {
  const cfg = sliceBillingConfig(deps.config, deps.overrides ?? {});
  return new BillingComposer(deps, cfg);
}
