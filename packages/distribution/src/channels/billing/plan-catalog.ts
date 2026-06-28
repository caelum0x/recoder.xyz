import type { Plan } from '../../domain/subscription-plan';

/**
 * Maps Recoder plans (free/pro/enterprise) to Polar product ids. Polar is the
 * selected Merchant of Record; a Recoder plan is a Polar product. The product
 * ids are configuration (env/host-provided), never hardcoded secrets.
 */
export interface PlanCatalogEntry {
  readonly plan: Plan;
  readonly polarProductId: string;
  readonly displayName: string;
}

export interface PlanCatalog {
  /** Resolve the Polar product for a plan, or undefined when unmapped. */
  productForPlan(plan: Plan): string | undefined;
  /** Resolve the Recoder plan for a Polar product, or undefined. */
  planForProduct(productId: string): Plan | undefined;
  entries(): readonly PlanCatalogEntry[];
}

/**
 * Build a plan catalog from host configuration. A free plan with no Polar
 * product (the common case — free is not a paid product) is allowed.
 */
export function createPlanCatalog(entries: readonly PlanCatalogEntry[]): PlanCatalog {
  const byPlan = new Map<Plan, string>();
  const byProduct = new Map<string, Plan>();
  for (const e of entries) {
    byPlan.set(e.plan, e.polarProductId);
    byProduct.set(e.polarProductId, e.plan);
  }
  return {
    productForPlan: (plan) => byPlan.get(plan),
    planForProduct: (productId) => byProduct.get(productId),
    entries: () => entries,
  };
}
