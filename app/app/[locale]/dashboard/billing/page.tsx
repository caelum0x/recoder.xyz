'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Workflow, Layers3, Bot, Clock3 } from 'lucide-react';

interface BillingDashboardData {
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    amount: number;
    currency: string;
    entitlements?: {
      workspaces: number;
      connectedAgents: number;
      artifactRetentionDays: number;
      previewDeploysPerMonth: number;
      approvalWorkflows: string;
      governance: string;
    };
  };
  usage: {
    requests: number;
    tokens: number;
    cost: number;
    controlPlane: {
      projectsThisMonth: number;
      deploymentsThisMonth: number;
      projectsActive: number;
    };
  };
}

export default function BillingPage() {
  const [data, setData] = useState<BillingDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/billing/dashboard')
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || 'Failed to load billing dashboard');
        }
        setData(payload.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load billing dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-black text-white p-8">Loading billing…</div>;
  }

  if (error || !data) {
    return <div className="min-h-screen bg-black text-red-300 p-8">{error || 'No billing data available'}</div>;
  }

  const entitlements = data.subscription.entitlements;

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10">
          <p className="text-sm uppercase tracking-[0.2em] text-orange-400 mb-3">Billing and entitlements</p>
          <h1 className="text-4xl font-bold mb-4">Your paid value is workflow control</h1>
          <p className="text-lg text-gray-400 max-w-3xl">
            Plans scale with workspaces, connected agents, approvals, retention, and preview deploy capacity.
            BYOK model spend stays on your own provider accounts.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Current plan</p>
                <h2 className="text-3xl font-semibold capitalize">{data.subscription.plan}</h2>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold">${data.subscription.amount}</div>
                <div className="text-sm text-gray-400">/{data.subscription.amount === 0 ? 'free' : 'billing cycle'}</div>
              </div>
            </div>

            {entitlements && (
              <div className="mt-8 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 p-4"><Layers3 className="h-5 w-5 text-orange-400 mb-2" /><div className="text-sm text-gray-400">Workspaces</div><div className="text-2xl font-semibold">{entitlements.workspaces >= 999 ? 'Unlimited' : entitlements.workspaces}</div></div>
                <div className="rounded-xl border border-white/10 p-4"><Bot className="h-5 w-5 text-orange-400 mb-2" /><div className="text-sm text-gray-400">Connected agents</div><div className="text-2xl font-semibold">{entitlements.connectedAgents >= 999 ? 'Unlimited' : entitlements.connectedAgents}</div></div>
                <div className="rounded-xl border border-white/10 p-4"><Workflow className="h-5 w-5 text-orange-400 mb-2" /><div className="text-sm text-gray-400">Approval workflows</div><div className="text-2xl font-semibold capitalize">{entitlements.approvalWorkflows}</div></div>
                <div className="rounded-xl border border-white/10 p-4"><Clock3 className="h-5 w-5 text-orange-400 mb-2" /><div className="text-sm text-gray-400">Artifact retention</div><div className="text-2xl font-semibold">{entitlements.artifactRetentionDays} days</div></div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-sm text-gray-400 mb-4">Current month</p>
            <div className="space-y-4">
              <div className="flex justify-between"><span className="text-gray-400">Active projects</span><span>{data.usage.controlPlane.projectsActive}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Projects created</span><span>{data.usage.controlPlane.projectsThisMonth}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Preview or production deploys</span><span>{data.usage.controlPlane.deploymentsThisMonth}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Observed provider spend</span><span>${Number(data.usage.cost || 0).toFixed(2)}</span></div>
            </div>

            <div className="mt-8 rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-orange-400 mt-0.5" />
                <div>
                  <p className="font-medium">Upgrade when the workflow repeats</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Move up when you need more Spaces, more connected agents, shared approvals, longer retention, and higher preview capacity.
                  </p>
                </div>
              </div>
              <Link href="/billing/upgrade?plan=monthly&source=dashboard-billing" className="mt-4 inline-flex items-center gap-2 text-orange-300 hover:text-white">
                Upgrade plan
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
