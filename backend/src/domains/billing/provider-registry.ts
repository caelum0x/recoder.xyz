/**
 * `createProviderRegistry` — selects the ONE active Merchant-of-Record adapter
 * from `BILLING_PROVIDER` and holds the (degrade-safe) adapters for all four.
 *
 * Every adapter is constructed with its own injected credential slice, so an
 * unconfigured provider is still a valid, fail-safe {@link BillingProviderPort}
 * (checkout throws `SERVICE_UNAVAILABLE`, reads `null`, webhook `false`, health
 * `down`). The registry never instantiates a raw card processor — the four
 * MoR providers are the entire universe (`types.ts` `BILLING_PROVIDERS`).
 *
 * The active provider drives the billing module's `ComponentHealth`: when it is
 * unconfigured the module is `degraded` (free tier + static entitlements still
 * serve; paid grants deny) — never a faked `up`.
 */
import type { BillingConfig, ProviderCredential } from './config.js';
import type { BillingProviderPort } from './ports/billing-provider.port.js';
import type { PlanCatalog } from './services/plan-catalog.service.js';
import type { BillingProviderName } from './types.js';
import { BILLING_PROVIDERS } from './types.js';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import { createPolarAdapter } from './adapters/polar.adapter.js';
import { createCreemAdapter } from './adapters/creem.adapter.js';
import { createPaddleAdapter } from './adapters/paddle.adapter.js';
import { createDodoAdapter } from './adapters/dodo.adapter.js';
import { providerToComponentHealth, type ProviderAdapterDeps } from './adapters/shared.js';

const COMPONENT_NAME = 'billing.provider';

/** Per-provider adapter factory table — the closed set of MoR providers. */
const ADAPTER_FACTORIES: Record<
  BillingProviderName,
  (deps: ProviderAdapterDeps) => BillingProviderPort
> = {
  polar: createPolarAdapter,
  creem: createCreemAdapter,
  paddle: createPaddleAdapter,
  dodo: createDodoAdapter,
};

export interface ProviderRegistry {
  /** The active provider name (from `BILLING_PROVIDER`). */
  readonly activeName: BillingProviderName;
  /** The active adapter — the one the checkout/webhook/reconcile paths use. */
  active(): BillingProviderPort;
  /** A specific adapter by name (webhook routing verifies against the sender). */
  get(name: BillingProviderName): BillingProviderPort;
  /** All four adapters (for a fan-out health probe / admin surface). */
  all(): readonly BillingProviderPort[];
  /** Module health, driven by the ACTIVE provider's truthful readiness. */
  health(): Promise<ComponentHealth>;
}

export interface ProviderRegistryDeps {
  readonly config: BillingConfig;
  readonly catalog: PlanCatalog;
  readonly logger?: Logger;
}

function credentialFor(config: BillingConfig, name: BillingProviderName): ProviderCredential {
  return config[name];
}

export function createProviderRegistry(deps: ProviderRegistryDeps): ProviderRegistry {
  const { config, catalog, logger } = deps;

  // Build a degrade-safe adapter per provider from its own credential slice.
  const adapters = new Map<BillingProviderName, BillingProviderPort>();
  for (const name of BILLING_PROVIDERS) {
    adapters.set(
      name,
      ADAPTER_FACTORIES[name]({
        credential: credentialFor(config, name),
        catalog,
        ...(logger ? { logger } : {}),
      }),
    );
  }

  const activeName = config.provider;

  function get(name: BillingProviderName): BillingProviderPort {
    const adapter = adapters.get(name);
    if (!adapter) {
      // Unreachable for the closed enum, but fail loud rather than silently wrong.
      throw new Error(`no billing adapter registered for provider '${name}'`);
    }
    return adapter;
  }

  return {
    activeName,
    active: () => get(activeName),
    get,
    all: () => [...adapters.values()],

    async health(): Promise<ComponentHealth> {
      const providerHealth = await get(activeName).health();
      return providerToComponentHealth(providerHealth, COMPONENT_NAME);
    },
  };
}
