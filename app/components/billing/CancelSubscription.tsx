'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useBillingData, planDisplayName, formatDate, isPaidPlan } from './useBillingData';
import { BillingShell, BillingLoadingBlock, BillingErrorBlock } from './BillingShell';

const CANCEL_REASONS = [
  'Too expensive',
  'Not using it enough',
  'Missing features I need',
  'Switching to another tool',
  'Just exploring / temporary',
  'Other',
] as const;

export function CancelSubscription() {
  const router = useRouter();
  const { data, loading, error, reload } = useBillingData();
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    if (!reason) {
      setActionError('Please select a reason so we can improve.');
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      const response = await fetch('/api/billing/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, feedback: feedback.trim() || undefined, cancelImmediate: false }),
      });
      const json = (await response.json().catch(() => null)) as
        | { success?: boolean; message?: string; error?: string }
        | null;

      if (!response.ok || !json?.success) {
        setActionError(json?.error || 'Could not cancel your subscription. Please try again or contact support.');
        return;
      }
      setDone(json.message || 'Your subscription has been cancelled.');
      await reload();
    } catch {
      setActionError('Could not cancel your subscription. Please check your connection and try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <BillingShell
      title="Cancel subscription"
      description="Let us know why you're leaving. You'll keep access until the end of your current period."
      backLink="/billing/subscription"
      backText="Back to Subscription"
    >
      {loading ? (
        <BillingLoadingBlock />
      ) : error ? (
        <BillingErrorBlock message={error} onRetry={reload} />
      ) : done ? (
        <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-400" />
          <h2 className="mt-4 text-xl font-semibold">Subscription cancelled</h2>
          <p className="mt-2 text-sm text-green-100/90">{done}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/billing"
              className="inline-flex items-center rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-neutral-200"
            >
              Back to Billing
            </Link>
          </div>
        </div>
      ) : data && !isPaidPlan(data.subscription.plan) ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <h2 className="text-xl font-semibold">No paid subscription to cancel</h2>
          <p className="mt-2 text-gray-400">You are on the Free plan — there is nothing to cancel.</p>
          <Link
            href="/billing"
            className="mt-6 inline-flex items-center rounded-lg border border-white/15 px-5 py-2.5 text-sm font-medium hover:border-white/40"
          >
            Back to Billing
          </Link>
        </div>
      ) : data && data.subscription.cancelAtPeriodEnd ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-8 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-300" />
          <h2 className="mt-4 text-xl font-semibold">Already scheduled to cancel</h2>
          <p className="mt-2 text-sm text-amber-100/90">
            Your subscription will end on {formatDate(data.subscription.currentPeriodEnd)}. You can
            resume it from the subscription page.
          </p>
          <Link
            href="/billing/subscription"
            className="mt-6 inline-flex items-center rounded-lg border border-white/15 px-5 py-2.5 text-sm font-medium hover:border-white/40"
          >
            Manage subscription
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {data ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-gray-300">
              You're cancelling <span className="font-semibold">{planDisplayName(data.subscription.plan)}</span>.
              Access continues until {formatDate(data.subscription.currentPeriodEnd)}.
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <label className="block text-sm font-medium">Why are you cancelling?</label>
            <div className="mt-3 space-y-2">
              {CANCEL_REASONS.map((option) => (
                <label
                  key={option}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                    reason === option ? 'border-white/40 bg-white/5' : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="cancel-reason"
                    value={option}
                    checked={reason === option}
                    onChange={() => setReason(option)}
                    className="accent-white"
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>

            <label htmlFor="cancel-feedback" className="mt-6 block text-sm font-medium">
              Anything else? <span className="text-gray-500">(optional)</span>
            </label>
            <textarea
              id="cancel-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value.slice(0, 1000))}
              rows={3}
              maxLength={1000}
              placeholder="Tell us how we could have kept you…"
              className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm outline-none focus:border-white/30"
            />

            {actionError ? <p className="mt-4 text-sm text-red-300">{actionError}</p> : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                disabled={pending}
                onClick={submit}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-500/90 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pending ? 'Cancelling…' : 'Cancel subscription'}
              </button>
              <button
                disabled={pending}
                onClick={() => router.push('/billing/subscription')}
                className="inline-flex items-center justify-center rounded-lg border border-white/15 px-5 py-2.5 text-sm font-medium hover:border-white/40 disabled:opacity-60"
              >
                Keep my subscription
              </button>
            </div>
          </div>
        </div>
      )}
    </BillingShell>
  );
}
