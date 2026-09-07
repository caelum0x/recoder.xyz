'use client';

import Link from 'next/link';
import { ArrowUpRight, XCircle } from 'lucide-react';
import {
  useBillingData,
  planDisplayName,
  formatMoney,
  formatDate,
  statusLabel,
  isPaidPlan,
} from './useBillingData';
import { BillingShell, BillingLoadingBlock, BillingErrorBlock } from './BillingShell';
import { ReactivateButton } from './ReactivateButton';

export function SubscriptionManager() {
  const { data, loading, error, reload } = useBillingData();

  return (
    <BillingShell
      title="Subscription"
      description="Review and manage your active subscription."
      backLink="/billing"
      backText="Back to Billing"
    >
      {loading ? (
        <BillingLoadingBlock />
      ) : error ? (
        <BillingErrorBlock message={error} onRetry={reload} />
      ) : data ? (
        !isPaidPlan(data.subscription.plan) ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <h2 className="text-xl font-semibold">You are on the Free plan</h2>
            <p className="mt-2 text-gray-400">
              Recoder is free with your own API key. Upgrade for platform-provided keys, higher
              limits, and team features.
            </p>
            <Link
              href="/billing/upgrade"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-neutral-200 transition-colors"
            >
              View plans
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold">{planDisplayName(data.subscription.plan)}</h2>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusLabel(data.subscription).className}`}
                  >
                    {statusLabel(data.subscription).text}
                  </span>
                </div>
                <p className="text-sm text-gray-400">
                  {formatMoney(data.subscription.amount, data.subscription.currency)} per period
                </p>
              </div>

              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                  <dt className="text-xs uppercase tracking-wide text-gray-500">
                    {data.subscription.cancelAtPeriodEnd ? 'Access until' : 'Current period ends'}
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    {formatDate(data.subscription.currentPeriodEnd)}
                  </dd>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                  <dt className="text-xs uppercase tracking-wide text-gray-500">Status</dt>
                  <dd className="mt-1 text-sm font-medium">{statusLabel(data.subscription).text}</dd>
                </div>
              </dl>
            </section>

            {data.subscription.cancelAtPeriodEnd ? (
              <section className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-6">
                <h3 className="text-base font-semibold text-amber-100">Cancellation scheduled</h3>
                <p className="mt-1 text-sm text-amber-100/90">
                  Your plan will end on {formatDate(data.subscription.currentPeriodEnd)}. Resume any
                  time before then to keep your subscription.
                </p>
                <div className="mt-4">
                  <ReactivateButton onReactivated={reload} />
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-base font-semibold">Manage plan</h3>
                <p className="mt-1 text-sm text-gray-400">
                  Upgrade or downgrade in place — billing is prorated by your provider. Cancelling
                  keeps access until the end of the current period.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/billing/upgrade"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-neutral-200 transition-colors"
                  >
                    Change plan
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/billing/cancel"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-gray-200 hover:border-red-500/40 hover:text-red-300 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    Cancel subscription
                  </Link>
                </div>
              </section>
            )}
          </div>
        )
      ) : (
        <BillingErrorBlock message="No billing data available." onRetry={reload} />
      )}
    </BillingShell>
  );
}
