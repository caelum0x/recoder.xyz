'use client';

import Link from 'next/link';
import { CreditCard, ArrowUpRight, Settings } from 'lucide-react';
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

export function BillingOverview() {
  const { data, loading, error, reload } = useBillingData();

  return (
    <BillingShell
      title="Billing & Subscription"
      description="Manage your Recoder plan, usage, and payment details."
    >
      {loading ? (
        <BillingLoadingBlock />
      ) : error ? (
        <BillingErrorBlock message={error} onRetry={reload} />
      ) : data ? (
        <div className="space-y-6">
          {/* Current plan */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-gray-400">Current plan</p>
                <div className="mt-1 flex items-center gap-3">
                  <h2 className="text-2xl font-bold">{planDisplayName(data.subscription.plan)}</h2>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusLabel(data.subscription).className}`}
                  >
                    {statusLabel(data.subscription).text}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-400">
                  {data.subscription.amount > 0
                    ? `${formatMoney(data.subscription.amount, data.subscription.currency)} per period`
                    : 'Free plan — bring your own API key'}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/billing/subscription"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium hover:border-white/40 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Manage subscription
                </Link>
                <Link
                  href="/billing/upgrade"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-neutral-200 transition-colors"
                >
                  {isPaidPlan(data.subscription.plan) ? 'Change plan' : 'Upgrade'}
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  {data.subscription.cancelAtPeriodEnd ? 'Access until' : 'Renews on'}
                </p>
                <p className="mt-1 text-sm font-medium">{formatDate(data.subscription.currentPeriodEnd)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Next payment</p>
                <p className="mt-1 text-sm font-medium">
                  {data.nextPayment && !data.subscription.cancelAtPeriodEnd
                    ? `${formatMoney(data.nextPayment.amount, data.subscription.currency)} on ${formatDate(data.nextPayment.date)}`
                    : '—'}
                </p>
              </div>
            </div>

            {data.subscription.cancelAtPeriodEnd ? (
              <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
                <p className="text-sm text-amber-100">
                  Your subscription is scheduled to cancel on {formatDate(data.subscription.currentPeriodEnd)}.
                  You can resume it any time before then.
                </p>
                <div className="mt-3">
                  <ReactivateButton onReactivated={reload} />
                </div>
              </div>
            ) : null}
          </section>

          {/* Usage */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold">This month</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Requests</p>
                <p className="mt-1 text-xl font-semibold">{data.usage.requests.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Tokens</p>
                <p className="mt-1 text-xl font-semibold">{data.usage.tokens.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Cost</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatMoney(data.usage.cost, data.subscription.currency)}
                </p>
              </div>
            </div>
          </section>

          {/* Payment method */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Payment method</h3>
              <Link
                href="/billing/payment-methods"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Manage
              </Link>
            </div>
            <div className="mt-4 flex items-center gap-3 text-sm">
              <CreditCard className="w-5 h-5 text-gray-400" />
              {data.paymentMethod && data.paymentMethod.last4 ? (
                <span>
                  {data.paymentMethod.type} ending in {data.paymentMethod.last4} · expires{' '}
                  {data.paymentMethod.expiry}
                </span>
              ) : (
                <span className="text-gray-400">No payment method on file.</span>
              )}
            </div>
          </section>
        </div>
      ) : (
        <BillingErrorBlock message="No billing data available." onRetry={reload} />
      )}
    </BillingShell>
  );
}
