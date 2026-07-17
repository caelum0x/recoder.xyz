/**
 * Billing composition-root seams — the small, PURE pieces of the bootstrap →
 * billing wiring, extracted so they are unit-testable without a full boot:
 *
 *   - {@link createByokResolver} — the `resolveByok` seam over the SAME durable
 *     store the inference key-write route persists into (governance secrets,
 *     `inference/byok/<provider>` refs). FAIL SAFE: any fault ⇒ `false` (quota
 *     stays enforced), never a guessed BYOK.
 *   - {@link polarCatalogEntries} — projects the billing config's
 *     `planProducts.polar` map onto @recoder/distribution's plan catalog
 *     entries (only tiers the distribution `Plan` union carries).
 */
import type { Plan as DistributionPlan, PlanCatalogEntry } from '@recoder/distribution';
import type { BillingSubject } from '../domains/billing/index.js';
import { byokSecretRef } from '../domains/inference/adapters/byok-key-resolver.js';

/** The narrow secrets surface the resolver reads (governance `SecretsPort` fits). */
export interface ByokSecretLister {
  list(ownerUserId: string): Promise<readonly { readonly ref: string }[]>;
}

const BYOK_REF_PREFIX = byokSecretRef('');
const DISTRIBUTION_PLANS: readonly string[] = ['free', 'pro', 'team', 'enterprise'];

/**
 * Build the billing `resolveByok` seam: a user subject with at least one stored
 * `inference/byok/<provider>` secret is BYOK (skips token-metered quota).
 */
export function createByokResolver(
  secrets: ByokSecretLister,
): (subject: BillingSubject) => Promise<boolean> {
  return async (subject: BillingSubject): Promise<boolean> => {
    if (subject.hasOwnApiKey) return true;
    if (subject.kind !== 'user') return false;
    try {
      const refs = await secrets.list(subject.subjectId);
      return refs.some((r) => r.ref.startsWith(BYOK_REF_PREFIX));
    } catch {
      return false; // fail safe: unknown ⇒ metered
    }
  };
}

/**
 * Project the config `planProducts.polar` tier→productId map onto distribution
 * plan-catalog entries. Tiers outside the distribution `Plan` union (`max`) and
 * empty product ids are dropped — deny-on-miss stays the default.
 */
export function polarCatalogEntries(
  planProducts: Partial<Record<string, string>> | undefined,
): PlanCatalogEntry[] {
  return Object.entries(planProducts ?? {})
    .filter(([tier, productId]) => Boolean(productId) && DISTRIBUTION_PLANS.includes(tier))
    .map(([tier, productId]) => ({
      plan: tier as DistributionPlan,
      polarProductId: productId as string,
      displayName: tier,
    }));
}
