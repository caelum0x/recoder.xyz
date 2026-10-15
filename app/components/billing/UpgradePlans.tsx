'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Loader2 } from 'lucide-react';
import { PLANS, type PlanId } from '@/lib/pricing-config';
import { useBillingData, planDisplayName, isPaidPlan } from './useBillingData';
import { BillingShell, BillingLoadingBlock, BillingErrorBlock } from './BillingShell';

// Purchasable plans offered for self-serve upgrade/downgrade. Enterprise is a
// contact-sales flow; pro-annual is offered at checkout only (env product ids
// use a per-plan-id name that cannot carry a hyphen).
const OFFERED_PLANS: PlanId[] = ['weekly', 'monthly', 'pro', 'team'];

const CHECKOUT_PROVIDERS = ['dodo', 'paddle', 'creem'] as const;

export function UpgradePlans() {
  const { data, loading, error, reload } = useBillingData();
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<PlanId | null>(null);

  const currentPlan = data?.subscription.plan ?? 'free';
  const hasActivePaidPlan = useMemo(
    () => Boolean(data && isPaidPlan(data.subscription.plan) && !data.subscription.cancelAtPeriodEnd),
    [data]
  );

  const startCheckout = async (planId: PlanId) => {
    // Free -> paid: hosted checkout. Dodo is the Merchant of Record going
    // forward; the others remain configured fallbacks for any pre-existing
    // subscription (mirrors onboarding).
    for (const paymentMethod of CHECKOUT_PROVIDERS) {
      const response = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, paymentMethod }),
      });
      if (response.status === 401) {
        window.location.assign(`/auth/signin?next=${encodeURIComponent('/billing/upgrade')}`);
        return;
      }
      if (!response.ok) continue;
      const json = (await response.json().catch(() => null)) as
        | { success?: boolean; checkoutUrl?: string }
        | null;
      if (json?.success && json.checkoutUrl) {
        window.location.assign(json.checkoutUrl);
        return;
      }
    }
    throw new Error('Checkout is not available right now. Please try again later or contact support.');
  };

  const changePlan = async (planId: PlanId) => {
    const response = await fetch('/api/billing/subscription/change-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId }),
    });
    const json = (await response.json().catch(() => null)) as
      | { success?: boolean; error?: string; requiresCheckout?: boolean }
      | null;

    if (response.status === 409 && json?.requiresCheckout) {
      await startCheckout(planId);
      return;
    }
    if (!response.ok || !json?.success) {
      throw new Error(json?.error || 'Could not change your plan. Please try again.');
    }
    await reload();
  };

  const handleConfirm = async (planId: PlanId) => {
    setPending(true);
    setActionError(null);
    try {
      if (hasActivePaidPlan) {
        await changePlan(planId);
      } else {
        await startCheckout(planId);
      }
      setConfirmPlan(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  };

  const onPlanAction = (planId: PlanId) => {
    setActionError(null);
    if (hasActivePaidPlan) {
      // In-place change is a real billing action → confirm first.
      setConfirmPlan(planId);
    } else {
      void handleConfirm(planId);
    }
  };

  return (
    <BillingShell
      title={hasActivePaidPlan ? 'Change your plan' : 'Upgrade your plan'}
      description="Free forever with your own API key. Paid plans add platform-provided keys, higher limits, and team features — billed securely through Dodo Payments."
      backLink="/billing"
      backText="Back to Billing"
    >
      {loading ? (
        <BillingLoadingBlock />
      ) : error ? (
        <BillingErrorBlock message={error} onRetry={reload} />
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-gray-400">
            Current plan: <span className="font-medium text-white">{planDisplayName(currentPlan)}</span>
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {OFFERED_PLANS.map((planId) => {
              const plan = PLANS[planId];
              const isCurrent = planId === currentPlan;
              const isBusy = pending && selected === planId;
              return (
                <div
                  key={planId}
                  className={`flex flex-col rounded-2xl border p-5 ${
                    isCurrent ? 'border-white/30 bg-white/5' : 'border-white/10 bg-zinc-900'
                  }`}
                >
                  <div className="mb-3">
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    <p className="text-xs text-gray-500">{plan.description}</p>
                  </div>
                  <div className="mb-4">
                    <span className="text-3xl font-bold">${plan.price}</span>
                    <span className="text-sm text-gray-500">/{plan.period}</span>
                  </div>
                  <ul className="mb-5 flex-1 space-y-2">
                    {plan.features.features.slice(0, 5).map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-gray-300">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    disabled={isCurrent || pending}
                    onClick={() => {
                      setSelected(planId);
                      onPlanAction(planId);
                    }}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                      isCurrent
                        ? 'cursor-default bg-zinc-800 text-gray-400'
                        : 'bg-white text-black hover:bg-neutral-200'
                    }`}
                  >
                    {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isCurrent
                      ? 'Current plan'
                      : hasActivePaidPlan
                        ? `Switch to ${plan.name}`
                        : `Choose ${plan.name}`}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-gray-400">
            Need more?{' '}
            <Link href="/enterprise" className="text-white underline underline-offset-4">
              Talk to us about Enterprise
            </Link>{' '}
            for custom limits, SSO, and on-premise deployment.
          </div>

          {actionError ? <p className="text-sm text-red-300">{actionError}</p> : null}
        </div>
      )}

      {confirmPlan ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6">
            <h2 className="text-xl font-bold">Confirm plan change</h2>
            <p className="mt-2 text-sm text-gray-400">
              Switch from {planDisplayName(currentPlan)} to {PLANS[confirmPlan].name} (${PLANS[confirmPlan].price}/
              {PLANS[confirmPlan].period})? Your provider will prorate the difference.
            </p>
            {actionError ? <p className="mt-3 text-sm text-red-300">{actionError}</p> : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                disabled={pending}
                onClick={() => handleConfirm(confirmPlan)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm change
              </button>
              <button
                disabled={pending}
                onClick={() => {
                  setConfirmPlan(null);
                  setActionError(null);
                }}
                className="inline-flex flex-1 items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium hover:border-white/40 disabled:opacity-60"
              >
                Keep current plan
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </BillingShell>
  );
}
