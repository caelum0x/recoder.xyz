'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { PLANS, type PlanId } from '@/lib/pricing-config';

const PAID_PLAN_ORDER: PlanId[] = ['weekly', 'monthly', 'pro', 'enterprise'];

export default function UpgradePage() {
  const params = useSearchParams();
  const initialPlan = (params.get('plan') as PlanId | null) || 'monthly';
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(PAID_PLAN_ORDER.includes(initialPlan) ? initialPlan : 'monthly');
  const [paymentMethod, setPaymentMethod] = useState<'dodo' | 'paddle'>('dodo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => PLANS[selectedPlan], [selectedPlan]);

  const startCheckout = async () => {
    if (selectedPlan === 'enterprise') {
      window.location.href = 'mailto:enterprise@recoder.xyz?subject=Recoder%20Enterprise';
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: selectedPlan,
          paymentMethod,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.error || 'Failed to create checkout session');
      }
      window.location.href = payload.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create checkout session');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl mb-10">
          <p className="text-sm uppercase tracking-[0.2em] text-orange-400 mb-3">Upgrade to paid control</p>
          <h1 className="text-4xl font-bold mb-4">Pay for workflow control, not model resale</h1>
          <p className="text-lg text-gray-400">
            Recoder pricing is for Spaces, approvals, retention, preview deploys, and connected-agent capacity.
            Keep your model spend on your own provider keys.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="grid gap-5 md:grid-cols-2">
            {PAID_PLAN_ORDER.map((planId) => {
              const plan = PLANS[planId];
              const active = selectedPlan === planId;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`rounded-2xl border p-6 text-left transition-all ${active ? 'border-orange-500 bg-orange-500/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">{plan.name}</h2>
                      <p className="text-sm text-gray-400 mt-2">{plan.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold">{plan.price === 0 ? 'Custom' : `$${plan.price}`}</div>
                      <div className="text-sm text-gray-400">/{plan.period}</div>
                    </div>
                  </div>
                  <ul className="mt-6 space-y-3 text-sm text-gray-300">
                    <li className="flex items-start gap-2"><Check className="h-4 w-4 text-green-400 mt-0.5" />{plan.limits.workspaces >= 999 ? 'Unlimited' : plan.limits.workspaces} workspaces</li>
                    <li className="flex items-start gap-2"><Check className="h-4 w-4 text-green-400 mt-0.5" />{plan.limits.connectedAgents >= 999 ? 'Unlimited' : plan.limits.connectedAgents} connected agents</li>
                    <li className="flex items-start gap-2"><Check className="h-4 w-4 text-green-400 mt-0.5" />{plan.limits.previewDeploysPerMonth >= 999 ? 'Unlimited' : plan.limits.previewDeploysPerMonth} preview deploys/month</li>
                    <li className="flex items-start gap-2"><Check className="h-4 w-4 text-green-400 mt-0.5" />{plan.limits.artifactRetentionDays} days artifact retention</li>
                  </ul>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 h-fit">
            <p className="text-sm uppercase tracking-[0.2em] text-orange-400 mb-3">Checkout</p>
            <h2 className="text-2xl font-semibold">{selected.name}</h2>
            <p className="text-sm text-gray-400 mt-2">{selected.description}</p>

            <div className="mt-6 space-y-3 text-sm text-gray-300">
              <div className="flex justify-between"><span>Workspaces</span><span>{selected.limits.workspaces >= 999 ? 'Unlimited' : selected.limits.workspaces}</span></div>
              <div className="flex justify-between"><span>Connected agents</span><span>{selected.limits.connectedAgents >= 999 ? 'Unlimited' : selected.limits.connectedAgents}</span></div>
              <div className="flex justify-between"><span>Approval workflows</span><span className="capitalize">{selected.limits.approvalWorkflows}</span></div>
              <div className="flex justify-between"><span>Governance</span><span className="capitalize">{selected.limits.governance}</span></div>
            </div>

            <div className="mt-6">
              <label className="block text-sm text-gray-400 mb-2">Payment provider</label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setPaymentMethod('dodo')} className={`rounded-lg border px-4 py-3 text-sm ${paymentMethod === 'dodo' ? 'border-orange-500 bg-orange-500/10' : 'border-white/10'}`}>Dodo</button>
                <button type="button" onClick={() => setPaymentMethod('paddle')} className={`rounded-lg border px-4 py-3 text-sm ${paymentMethod === 'paddle' ? 'border-orange-500 bg-orange-500/10' : 'border-white/10'}`}>Paddle</button>
              </div>
            </div>

            {error && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

            <button
              type="button"
              onClick={startCheckout}
              disabled={loading}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 font-medium text-black hover:bg-orange-400 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start checkout'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>

            <Link href="/pricing" className="mt-4 inline-flex text-sm text-gray-400 hover:text-white">
              Compare all plans
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
