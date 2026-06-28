/**
 * The distribution module — the single composition root that wires concrete
 * ports into the `@recoder/distribution` services and exposes them to routes.
 *
 * Injected ports (real, never stubbed):
 *  - auth      → recoder.xyz (`/api/auth/verify-token`) is the source of truth.
 *  - billing   → the real Polar (Merchant-of-Record) adapter, fail-safe when
 *                `POLAR_ACCESS_TOKEN` is absent (deny + unhealthy).
 *  - events    → a durable, auditable RunEvent sink.
 *  - secret    → env-backed.
 *
 * Polar is the MoR; the `BillingPort` stays provider-agnostic so a future
 * Dodo/Creem/Paddle adapter is a one-file swap here.
 */
import {
  createEnvSecretPort,
  createPolarBillingAdapter,
  createPlanCatalog,
  createBillingService,
  createEntitlementResolver,
  createInMemoryDeviceGrantStore,
  createBillingWebhookHandler,
  createDeviceRegistryService,
  createSeatService,
  buildDeviceFlowConfig,
  type BillingPort,
  type BillingService,
  type SecretPort,
  type AuthPort,
  type EntitlementPort,
  type EntitlementResolver,
  type DeviceFlowConfig,
  type DeviceGrantStore,
  type BillingWebhookHandler,
  type DeviceRegistryService,
  type SeatService,
  type Subject,
  type UsageKind,
  type Plan,
} from '@recoder/distribution';
import { loadDistributionRuntimeConfig, type DistributionRuntimeConfig } from './config.js';
import { createRecoderAuthPort, createIdentityCache, type IdentityCache } from './recoder-auth-port.js';
import { createDistributionEventBus, type DistributionEventBus } from './event-bus-port.js';
import {
  createPersistentDeviceStore,
  createPersistentOrgStore,
  createPersistentSeatStore,
  createPersistentWebhookDedupeStore,
} from './stores.js';
import { resolveUserTier } from '../billing/subscription-tier.js';
import { createLogger } from './log.js';

const logger = createLogger('distribution-module');

/** The audit task id distribution RunEvents are attributed to. */
const DISTRIBUTION_TASK_ID = 'distribution-billing';

export interface DistributionModule {
  readonly config: DistributionRuntimeConfig;
  readonly secrets: SecretPort;
  readonly auth: AuthPort;
  readonly billingPort: BillingPort;
  readonly billing: BillingService;
  readonly entitlements: EntitlementPort;
  readonly resolver: EntitlementResolver;
  readonly events: DistributionEventBus;
  readonly deviceFlow: { config: DeviceFlowConfig; grants: DeviceGrantStore };
  readonly webhookHandler: BillingWebhookHandler;
  readonly devices: DeviceRegistryService;
  readonly seats: SeatService;
  readonly identity: IdentityCache;
  /** The HMAC signing key for CLI tokens; undefined when not configured. */
  readonly signingKey: string | undefined;
}

export interface BuildDistributionModuleOptions {
  /** Override env (tests). */
  readonly env?: Record<string, string | undefined>;
  /** Override the billing port (tests inject a fake Polar). */
  readonly billingPort?: BillingPort;
  /** Override the auth port (tests inject a deterministic recoder.xyz). */
  readonly auth?: AuthPort;
  /** Override the plan resolver (defaults to live subscription state). */
  readonly resolvePlanForUser?: (userId: string) => Plan | Promise<Plan>;
}

/**
 * Map docker-backend's live subscription tier (`resolveUserTier`, fed by the
 * existing Polar webhook state) to the distribution `Plan`. This keeps plan
 * resolution on the real, already-maintained subscription source.
 */
function livePlanResolver(userId: string): Plan {
  const tier = resolveUserTier(userId);
  // SubscriptionTier values are exactly 'free' | 'pro' | 'enterprise'.
  return tier as Plan;
}

/**
 * Build an `EntitlementPort` over a `BillingPort`. Deny-on-miss is preserved:
 * the billing port already fails safe (empty grants / zero-headroom quota).
 */
function entitlementPortFrom(billing: BillingPort): EntitlementPort {
  return {
    async resolve(subject: Subject) {
      const grants = await billing.resolveEntitlements(subject);
      return grants.filter((g) => g.granted);
    },
    quota(subject: Subject, kind: UsageKind) {
      return billing.getQuota(subject, kind);
    },
  };
}

let singleton: DistributionModule | null = null;

export function buildDistributionModule(
  opts: BuildDistributionModuleOptions = {},
): DistributionModule {
  const env = opts.env ?? process.env;
  const config = loadDistributionRuntimeConfig(env);
  const secrets = createEnvSecretPort(env);
  const planCatalog = createPlanCatalog(config.planCatalog);

  const billingPort: BillingPort =
    opts.billingPort ??
    createPolarBillingAdapter({
      secrets,
      planCatalog,
      apiBase: config.base.polarApiBase,
    });

  const billing = createBillingService({ billing: billingPort, secrets });
  const resolver = createEntitlementResolver(billingPort);
  const entitlements = entitlementPortFrom(billingPort);
  const events = createDistributionEventBus();
  const identity = createIdentityCache();
  const signingKey = secrets.get('CLI_TOKEN_SIGNING_KEY');

  const auth: AuthPort =
    opts.auth ??
    createRecoderAuthPort(
      {
        appApiBase: config.appApiBase,
        internalServiceKey: config.internalServiceKey,
        entitlements,
        resolvePlanForUser: opts.resolvePlanForUser ?? livePlanResolver,
        signingKey,
      },
      identity,
    );

  const deviceFlowConfig = buildDeviceFlowConfig({
    recoderBaseUrl: config.base.recoderBaseUrl,
    clientId: config.base.cliClientId,
    grantTtlSeconds: config.base.deviceGrantTtlSeconds,
    pollIntervalSeconds: config.base.devicePollIntervalSeconds,
    accessTokenTtlSeconds: config.base.cliTokenTtlSeconds,
  });

  const webhookHandler = createBillingWebhookHandler({
    secrets,
    events,
    dedupe: createPersistentWebhookDedupeStore(),
    taskId: DISTRIBUTION_TASK_ID,
  });

  const devices = createDeviceRegistryService({ devices: createPersistentDeviceStore() });
  const seats = createSeatService({
    orgs: createPersistentOrgStore(),
    seats: createPersistentSeatStore(),
    billing: billingPort,
  });

  if (!signingKey) {
    logger.warn('CLI_TOKEN_SIGNING_KEY not set — CLI token issue/verify will fail safe (deny)');
  }
  if (!secrets.has('POLAR_ACCESS_TOKEN')) {
    logger.warn('POLAR_ACCESS_TOKEN not set — billing reports unhealthy and denies (fail safe)');
  }

  return {
    config,
    secrets,
    auth,
    billingPort,
    billing,
    entitlements,
    resolver,
    events,
    deviceFlow: { config: deviceFlowConfig, grants: createInMemoryDeviceGrantStore() },
    webhookHandler,
    devices,
    seats,
    identity,
    signingKey,
  };
}

/** Lazily build and cache the process-wide distribution module. */
export function getDistributionModule(): DistributionModule {
  if (!singleton) {
    singleton = buildDistributionModule();
  }
  return singleton;
}

/** Reset the singleton (tests only). */
export function resetDistributionModule(): void {
  singleton = null;
}
