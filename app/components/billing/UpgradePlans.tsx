'use client';

import { Check } from 'lucide-react';
import { BillingShell } from './BillingShell';

/**
 * Owner decision 2026-10-27: Recoder's hosted paid tiers (Pro/Team/Enterprise)
 * are retired — the product is completely free. This used to be the
 * self-serve upgrade/downgrade screen (plan grid + Dodo/Paddle checkout +
 * in-place plan-change flow). All of that is gone: there is nothing left to
 * buy, and `lib/entitlements.ts` already grants every signed-in user the top
 * tier's features regardless of what this page shows. Kept as a real page
 * (not a redirect) so anyone who still has `/billing/upgrade` bookmarked or
 * linked gets a truthful "it's all free now" message instead of a dead page
 * or a stale pricing grid. See git history (pre-2026-10-27) for the removed
 * checkout/plan-switch logic.
 */
const FREE_FEATURES = [
  'Unlimited parallel agents',
  'Full team collaboration, no member cap',
  'Shared team memory',
  'Unlimited evidence/audit retention',
  'Bring your own API key — no platform metering',
];

export function UpgradePlans() {
  return (
    <BillingShell
      title="Recoder is free"
      description="All paid tiers have been retired. Every feature below is already unlocked on your account — there is nothing to buy."
      backLink="/billing"
      backText="Back to Billing"
    >
      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-6">
        <ul className="space-y-3">
          {FREE_FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm text-gray-300">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </BillingShell>
  );
}
