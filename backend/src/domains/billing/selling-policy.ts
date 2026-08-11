/**
 * Selling-provider policy — WHICH Merchant-of-Record providers may originate a
 * NEW checkout (the selling surface).
 *
 * Repo policy (docs/AGENTS.md, [[project_billing_mor_providers]]): Creem is the
 * SOLE active MoR provider. Polar/Paddle/Dodo remain wired as degrade-safe
 * adapters so INBOUND webhooks and cancellations of any pre-existing
 * subscription still verify and reconcile — but they are NOT enabled to sell.
 * A raw card processor (Stripe) is never in the universe at all (see
 * `types.ts` `BILLING_PROVIDERS`).
 *
 * This is a code-level policy gate, NOT an env/key change: it decides whether
 * the active provider is allowed to start a checkout. When it isn't, the selling
 * surface fails safe with a truthful error — never a fabricated checkout URL.
 */
import type { BillingProviderName } from './types.js';

/** The single canonical selling provider (never Stripe; never Polar/Paddle/Dodo). */
export const CANONICAL_SELLING_PROVIDER: BillingProviderName = 'creem';

/**
 * The closed allow-list of providers ENABLED to originate a new checkout. Creem
 * only. Widening this is a deliberate policy change, not a config toggle.
 */
export const ENABLED_SELLING_PROVIDERS: readonly BillingProviderName[] = [
  CANONICAL_SELLING_PROVIDER,
] as const;

/** True when a provider may originate a NEW checkout (the selling surface). */
export function isSellingProviderEnabled(name: BillingProviderName): boolean {
  return ENABLED_SELLING_PROVIDERS.includes(name);
}
