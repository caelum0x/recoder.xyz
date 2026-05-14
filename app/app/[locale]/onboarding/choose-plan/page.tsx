import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { PLANS, type PlanId } from '@/lib/pricing-config';

const PLAN_ORDER: PlanId[] = ['free', 'weekly', 'monthly', 'pro', 'enterprise'];

export default function ChoosePlanPage() {
  return (
    <div className="min-h-screen bg-black text-white px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl mb-10">
          <p className="text-sm uppercase tracking-[0.2em] text-orange-400 mb-3">Choose your starting lane</p>
          <h1 className="text-4xl font-bold mb-4">Pick the plan that matches your first workflow</h1>
          <p className="text-lg text-gray-400">
            Start free if you are proving one Space. Upgrade when you need more workspaces, connected agents,
            approvals, retention, and preview deploy capacity.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
          {PLAN_ORDER.map((planId) => {
            const plan = PLANS[planId];
            const href = plan.id === 'free'
              ? '/onboarding/setup-api-key?plan=free'
              : plan.id === 'enterprise'
                ? 'mailto:enterprise@recoder.xyz?subject=Recoder%20Enterprise'
                : `/billing/upgrade?plan=${plan.id}&source=onboarding`;

            return (
              <div key={plan.id} className={`rounded-2xl border p-6 ${plan.id === 'monthly' ? 'border-orange-500/40 bg-orange-500/5' : 'border-white/10 bg-white/[0.03]'}`}>
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                <p className="text-sm text-gray-400 mt-2 min-h-[40px]">{plan.description}</p>
                <div className="mt-5 mb-6">
                  <span className="text-3xl font-bold">{plan.price === 0 ? '$0' : `$${plan.price}`}</span>
                  <span className="text-sm text-gray-400 ml-2">/{plan.period}</span>
                </div>
                <ul className="space-y-3 text-sm text-gray-300 mb-6">
                  <li className="flex items-start gap-2"><Check className="h-4 w-4 text-green-400 mt-0.5" />{plan.limits.workspaces} workspace{plan.limits.workspaces === 1 ? '' : 's'}</li>
                  <li className="flex items-start gap-2"><Check className="h-4 w-4 text-green-400 mt-0.5" />{plan.limits.connectedAgents} connected agent{plan.limits.connectedAgents === 1 ? '' : 's'}</li>
                  <li className="flex items-start gap-2"><Check className="h-4 w-4 text-green-400 mt-0.5" />{plan.limits.previewDeploysPerMonth} preview deploys/month</li>
                  <li className="flex items-start gap-2"><Check className="h-4 w-4 text-green-400 mt-0.5" />{plan.limits.artifactRetentionDays} days of history</li>
                </ul>
                <Link href={href} className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium ${plan.id === 'monthly' ? 'bg-orange-500 text-black hover:bg-orange-400' : 'bg-white text-black hover:bg-gray-200'} transition-colors`}>
                  {plan.id === 'free' ? 'Start free' : plan.id === 'enterprise' ? 'Contact sales' : 'Continue to upgrade'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
