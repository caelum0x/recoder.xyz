import type { DistributionConfig } from './config/index';
import { ENV_KEYS } from './config/index';
import type { SecretPort } from './ports/secret-port';
import { createEnvSecretPort } from './ports/secret-port';
import type { AuthPort } from './ports/auth-port';
import type { ApprovalPort } from './ports/approval-port';
import type { EventBusPort } from './ports/event-bus-port';
import type { BillingPort } from './ports/billing-port';
import type { Plan } from './domain/subscription-plan';
import type { DeliveryReceipt, DeliveryRequest } from './domain/delivery';
import type { ChannelHealth } from './domain/health-state';
import {
  createDistributionEngine,
  type DistributionEngine,
} from './engine/distribution-engine';
import { createEntitlementResolver } from './channels/billing/entitlement-resolver';
import { createBillingService, type BillingService } from './channels/billing/billing-service';
import { createPolarBillingAdapter } from './channels/billing/adapters/polar-billing-adapter';
import { createPlanCatalog, type PlanCatalogEntry } from './channels/billing/plan-catalog';
import {
  buildDeviceFlowConfig,
  type DeviceFlowConfig,
} from './channels/cli-dist/device-flow/device-flow-config';
import {
  createInMemoryDeviceGrantStore,
  type DeviceGrantStore,
} from './channels/cli-dist/device-flow/device-grant-store';

export interface DistributionDeps {
  readonly config: DistributionConfig;
  readonly auth: AuthPort;
  readonly approvals: ApprovalPort;
  readonly events?: EventBusPort;
  readonly secrets?: SecretPort;
  /** A billing port to use; defaults to the real Polar adapter. */
  readonly billing?: BillingPort;
  readonly planCatalog?: readonly PlanCatalogEntry[];
}

/**
 * The Distribution facade ties the engine, billing service, and device-flow
 * config together behind one object. It defaults to the REAL Polar adapter
 * (fail-safe unhealthy when `POLAR_ACCESS_TOKEN` is absent). recoder.xyz (via
 * `auth`) remains the auth source of truth.
 */
export interface Distribution {
  readonly engine: DistributionEngine;
  readonly billing: BillingService;
  readonly deviceFlow: { config: DeviceFlowConfig; grants: DeviceGrantStore };
  deliver(req: DeliveryRequest): Promise<DeliveryReceipt>;
  health(): Promise<Record<string, ChannelHealth>>;
}

export function createDistribution(deps: DistributionDeps): Distribution {
  const secrets = deps.secrets ?? createEnvSecretPort();
  const planCatalog = createPlanCatalog(deps.planCatalog ?? []);

  const billingPort: BillingPort =
    deps.billing ??
    createPolarBillingAdapter({
      secrets,
      planCatalog,
      apiBase: deps.config.polarApiBase,
    });

  const billing = createBillingService({ billing: billingPort, secrets });
  const resolver = createEntitlementResolver(billingPort);

  /** Resolve the actor's authoritative plan via recoder.xyz, default free. */
  const resolveActorPlan = async (req: DeliveryRequest): Promise<Plan> => {
    const profile = await deps.auth.getUserProfile(req.actor.subjectId);
    return profile?.plan ?? 'free';
  };

  const engine = createDistributionEngine({
    resolver,
    approvals: deps.approvals,
    ...(deps.events ? { events: deps.events } : {}),
    resolveActorPlan,
  });

  const deviceFlowConfig = buildDeviceFlowConfig({
    recoderBaseUrl: deps.config.recoderBaseUrl,
    clientId: deps.config.cliClientId,
    grantTtlSeconds: deps.config.deviceGrantTtlSeconds,
    pollIntervalSeconds: deps.config.devicePollIntervalSeconds,
    accessTokenTtlSeconds: deps.config.cliTokenTtlSeconds,
  });

  return {
    engine,
    billing,
    deviceFlow: { config: deviceFlowConfig, grants: createInMemoryDeviceGrantStore() },
    deliver: (req) => engine.deliver(req),
    async health() {
      const channelHealth = await engine.health();
      return { ...channelHealth, billing: await billing.health() };
    },
  };
}

/** Documented signing-key accessor — fail fast when absent (never default). */
export function requireCliTokenSigningKey(secrets: SecretPort): string {
  return secrets.require(ENV_KEYS.CLI_TOKEN_SIGNING_KEY);
}
