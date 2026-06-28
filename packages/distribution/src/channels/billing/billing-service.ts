import type {
  BillingPort,
  CheckoutIntent,
  CheckoutResult,
  MeterEvent,
} from '../../ports/billing-port';
import type { SecretPort } from '../../ports/secret-port';
import type { Entitlement, Subject } from '../../domain/entitlement';
import type { Quota, UsageKind } from '../../domain/quota';
import type { LicenseKeyActivation } from '../../domain/license-key';
import type { Feature, Plan } from '../../domain/subscription-plan';
import type { ChannelHealth } from '../../domain/health-state';
import { createEntitlementResolver, type EntitlementResolver } from './entitlement-resolver';
import { createEntitlementCache, type EntitlementCache } from './entitlement-cache';
import { createQuotaService } from './quota-service';
import { createQuotaEnforcer, type QuotaDecision } from './quota-enforcer';
import { createLicenseKeyService } from './license-key-service';
import { checkBillingHealth } from './health/billing-health';

/**
 * The billing facade. A typed control-plane view over the billing port (→ the
 * fused Polar Merchant-of-Record engine). Every read is fail-safe: deny on
 * miss, deny on error, truthful health.
 */
export interface BillingService {
  startCheckout(intent: CheckoutIntent): Promise<CheckoutResult>;
  resolveEntitlements(subject: Subject): Promise<Entitlement[]>;
  hasFeature(subject: Subject, feature: Feature, plan: Plan): Promise<boolean>;
  checkQuota(subject: Subject, kind: UsageKind, cost?: number): Promise<QuotaDecision>;
  emitUsage(event: MeterEvent): Promise<void>;
  validateLicenseKey(key: string): Promise<LicenseKeyActivation>;
  health(): Promise<ChannelHealth>;
}

export interface BillingServiceDeps {
  readonly billing: BillingPort;
  readonly secrets: SecretPort;
  readonly resolver?: EntitlementResolver;
  readonly cache?: EntitlementCache;
}

export function createBillingService(deps: BillingServiceDeps): BillingService {
  const resolver = deps.resolver ?? createEntitlementResolver(deps.billing);
  const cache = deps.cache ?? createEntitlementCache({});
  const quotaEnforcer = createQuotaEnforcer(createQuotaService(deps.billing));
  const licenseKeys = createLicenseKeyService(deps.billing);

  return {
    startCheckout: (intent) => deps.billing.startCheckout(intent),
    resolveEntitlements: (subject) => cache.get(subject, (s) => resolver.resolve(s)),
    hasFeature: (subject, feature, plan) => resolver.hasFeature(subject, feature, plan),
    checkQuota: (subject, kind, cost) => quotaEnforcer.enforce(subject, kind, cost),
    emitUsage: (event) => deps.billing.emitUsage(event),
    validateLicenseKey: (key) => licenseKeys.validate(key),
    health: () => checkBillingHealth(deps.secrets, deps.billing),
  };
}
