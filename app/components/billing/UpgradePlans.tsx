'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { PLANS, type PlanId } from '@/lib/pricing-config';
import { useBillingData, planDisplayName, isPaidPlan } from './useBillingData';
import { BillingShell, BillingLoadingBlock, BillingErrorBlock } from './BillingShell';

// Purchasable plans offered for self-serve upgrade/downgrade. Matches the
// real, live product catalog shown on the public pricing page (Free / Pro /
// Team / Enterprise — see site/app/pricing/page.tsx and
// infra/connect/scripts/create-dodo-products.ts). 'weekly'/'monthly' are
// legacy tiers from before the Dodo cutover with no real Dodo product behind
// them (create-checkout/route.ts falls back to placeholder ids) and are not
// offered anywhere on the marketing site — removed here so this screen never
// shows a tier a visitor can't actually buy. Enterprise is a contact-sales
// flow (the panel below); pro-annual is offered at checkout only (env product
// ids use a per-plan-id name that cannot carry a hyphen).
const OFFERED_PLANS: PlanId[] = ['pro', 'team'];

// Creem removed from the client try-order (owner directive 2026-10-16: Creem
// is retired for new checkout sessions; the server also fails it closed — see
// app/api/billing/create-checkout/route.ts). Dodo is the Merchant of Record;
// Paddle remains a configured fallback.
const CHECKOUT_PROVIDERS = ['dodo', 'paddle'] as const;

// Same inbox the /contact page already publishes as the team's primary
// channel — reused here, not invented, so support replies land in one place.
const CONTACT_EMAIL = 'contact@recoder.xyz';

/**
 * Thrown by `startCheckout` only when every configured provider refused the
 * request (verified live 2026-10-16: Dodo returns 503 unconfigured, Paddle
 * has no vendor credentials set, and Creem now fails closed by policy — so
 * this is not hypothetical, it is the current production state). Kept as a
 * distinct type so the UI can offer a manual, human fallback instead of a
 * dead-end error for a visitor who was ready to pay.
 */
class CheckoutUnavailableError extends Error {}

function checkoutFallbackMailto(planId: PlanId): string {
  const plan = PLANS[planId];
  const subject = `Upgrade to ${plan.name} ($${plan.price}/${plan.period})`;
  const body =
    `Hi, I tried to upgrade to the ${plan.name} plan on recoder.xyz but ` +
    'automatic checkout was unavailable. Please help me complete this upgrade.';
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function UpgradePlans() {
  const { data, loading, error, reload } = useBillingData();
  const searchParams = useSearchParams();
  // Guards the auto-checkout effect below to a single attempt per page load
  // — without this, a re-render after a failed checkout (actionError set)
  // would re-fire the same request in a loop.
  const autoCheckoutAttempted = useRef(false);
  const [selected, setSelected] = useState<PlanId | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<PlanId | null>(null);
  // Set only when every checkout provider refused the request — offers a
  // manual mailto path instead of leaving an interested payer with a dead end.
  const [contactFallbackPlan, setContactFallbackPlan] = useState<PlanId | null>(null);

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
    throw new CheckoutUnavailableError(
      'Checkout is not available right now. Please try again later or contact support.'
    );
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
    setContactFallbackPlan(null);
    try {
      if (hasActivePaidPlan) {
        await changePlan(planId);
      } else {
        await startCheckout(planId);
      }
      setConfirmPlan(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      if (err instanceof CheckoutUnavailableError) {
        setContactFallbackPlan(planId);
      }
    } finally {
      setPending(false);
    }
  };

  const onPlanAction = (planId: PlanId) => {
    setActionError(null);
    setContactFallbackPlan(null);
    if (hasActivePaidPlan) {
      // In-place change is a real billing action → confirm first.
      setConfirmPlan(planId);
    } else {
      void handleConfirm(planId);
    }
  };

  // Funnel continuation: a visitor who clicked "Get Pro"/"Get Team" on the
  // public pricing page signs up via /auth/signup?plan=<id>, which forwards
  // that intent as the post-OAuth redirect to /billing/upgrade?plan=<id>
  // (see app/[locale]/auth/signup/page.tsx). Without this, the forwarded
  // plan was a dead end — the user landed here and had to notice and click
  // the plan again themselves. Auto-start checkout once, for a real
  // purchasable plan, only for a free user who isn't already on it.
  useEffect(() => {
    if (autoCheckoutAttempted.current) return;
    if (loading || error || !data) return;
    const planParam = searchParams.get('plan');
    if (!planParam || !OFFERED_PLANS.includes(planParam as PlanId)) return;
    if (hasActivePaidPlan || planParam === currentPlan) return;
    autoCheckoutAttempted.current = true;
    setSelected(planParam as PlanId);
    onPlanAction(planParam as PlanId);
    // onPlanAction/currentPlan/hasActivePaidPlan are recreated every render;
    // the ref guard above (not this dep list) is what prevents re-firing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading, error, data]);

  const contactFallback = contactFallbackPlan ? (
    <p className="mt-1 text-sm text-gray-400">
      We can still set this up by hand —{' '}
      <a href={checkoutFallbackMailto(contactFallbackPlan)} className="text-white underline underline-offset-4">
        email {CONTACT_EMAIL}
      </a>{' '}
      and we&apos;ll get you on {PLANS[contactFallbackPlan].name} directly.
    </p>
  ) : null;

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
          {contactFallback}
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
            {contactFallback}
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
                  setContactFallbackPlan(null);
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
