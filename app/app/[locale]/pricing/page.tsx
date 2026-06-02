'use client';

import Link from 'next/link';
import { Check, ArrowRight, Zap, Shield, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useEffect } from 'react';
import { PLANS, type Plan, type PlanId } from '@/lib/pricing-config';
import { trackEvent, AnalyticsEvents } from '@/lib/analytics';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

const PLAN_ORDER: PlanId[] = ['free', 'weekly', 'monthly', 'pro', 'enterprise'];

function PriceDisplay({ plan }: { plan: Plan }) {
  if (plan.id === 'enterprise') {
    return (
      <div className="mt-4 mb-6">
        <span className="text-4xl font-bold">Custom</span>
        <span className="text-gray-400 ml-2 text-sm">pricing</span>
      </div>
    );
  }

  if (plan.price === 0) {
    return (
      <div className="mt-4 mb-6">
        <span className="text-4xl font-bold">$0</span>
        <span className="text-gray-400 ml-2 text-sm">forever</span>
      </div>
    );
  }

  return (
    <div className="mt-4 mb-6">
      <span className="text-4xl font-bold">${plan.price}</span>
      <span className="text-gray-400 ml-2 text-sm">/{plan.period}</span>
    </div>
  );
}

function CTAButton({ plan }: { plan: Plan }) {
  if (plan.id === 'free') {
    return (
      <Link
        href="/auth/signup"
        className="block w-full text-center px-6 py-3 rounded-lg border border-white/20 hover:border-white/40 text-white font-semibold transition-all hover:bg-white/5"
      >
        Get Started Free
      </Link>
    );
  }

  if (plan.id === 'enterprise') {
    return (
      <Link
        href="mailto:enterprise@recoder.xyz"
        className="block w-full text-center px-6 py-3 rounded-lg border border-white/20 hover:border-white/40 text-white font-semibold transition-all hover:bg-white/5"
      >
        Contact Sales
      </Link>
    );
  }

  const isHighlighted = plan.id === 'monthly';

  return (
    <Link
      href={`/auth/signup?plan=${plan.id}`}
      className={`block w-full text-center px-6 py-3 rounded-lg font-semibold transition-all ${
        isHighlighted
          ? 'bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 text-white'
          : 'bg-white text-black hover:bg-gray-200'
      }`}
    >
      Subscribe
      <ArrowRight className="inline-block w-4 h-4 ml-2" />
    </Link>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const isHighlighted = plan.id === 'monthly';

  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 transition-all ${
        isHighlighted
          ? 'border-orange-500/50 bg-gradient-to-b from-orange-500/10 to-purple-500/5 shadow-lg shadow-orange-500/10 scale-[1.02] lg:scale-105'
          : 'border-white/10 bg-white/[0.02] hover:border-white/20'
      }`}
    >
      {/* Recommended badge */}
      {isHighlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-4 py-1 text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-orange-500 to-purple-600 text-white rounded-full">
            Most Popular
          </span>
        </div>
      )}

      {/* Plan header */}
      <div>
        <h3 className="text-xl font-bold">{plan.name}</h3>
        <p className="text-sm text-gray-400 mt-1">{plan.description}</p>
      </div>

      {/* Price */}
      <PriceDisplay plan={plan} />

      {/* CTA */}
      <CTAButton plan={plan} />

      {/* Divider */}
      <div className="border-t border-white/10 my-6" />

      {/* Features list */}
      <ul className="space-y-3 flex-1">
        {plan.features.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
            <span className="text-gray-300">{feature}</span>
          </li>
        ))}
      </ul>

      {/* Limits summary */}
      <div className="mt-6 pt-4 border-t border-white/10">
        <p className="text-xs text-gray-500">
          {plan.id === 'enterprise' ? (
            'Custom capacity, governance, and retention'
          ) : (
            <>
              {plan.limits.workspaces} workspace{plan.limits.workspaces === 1 ? '' : 's'} &middot;{' '}
              {plan.limits.connectedAgents === 1 ? '1 connected agent' : `${plan.limits.connectedAgents} connected agents`} &middot;{' '}
              {plan.limits.previewDeploysPerMonth} preview deploys/month &middot;{' '}
              {plan.limits.artifactRetentionDays} days history
            </>
          )}
        </p>
      </div>
    </div>
  );
}

const FAQ_ITEMS = [
  {
    question: 'What does "Bring Your Own Key" (BYOK) mean?',
    answer:
      'BYOK means you connect your own provider keys and keep model spend with OpenRouter, Anthropic, OpenAI, Google, or your preferred vendor. Recoder charges for workflow control, not token resale.',
  },
  {
    question: 'What am I paying Recoder for?',
    answer:
      'You are paying for the control plane: shared runtime lanes, task and artifact state, approvals, retention, and connected-agent workflow capacity. The goal is to avoid competing on subsidized tokens.',
  },
  {
    question: 'How do capacity limits work?',
    answer:
      'Plans scale by the amount of repeated work a workspace can run and by how many connected builders or agents can use the shared control plane. Higher tiers are for more execution volume and stricter controls.',
  },
  {
    question: 'Does Recoder resell premium model access?',
    answer:
      'No. The product is being positioned so better models make Recoder more valuable through workflow control, not more expensive because we are subsidizing tokens.',
  },
  {
    question: 'Can I switch plans at any time?',
    answer:
      'Yes. You can upgrade or downgrade as your team moves from first validation into repeated production usage.',
  },
  {
    question: 'What is the recommended path?',
    answer:
      'Start on BYOK, prove one external-agent workflow end to end, and only then expand into more seats, approvals, retention, and governance.',
  },
  {
    question: 'Can enterprise support custom routing or governance?',
    answer:
      'Yes. Enterprise is where audit requirements, custom routing, retention, deployment controls, and SLA-driven governance belong.',
  },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-white/10">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="font-medium text-gray-200 pr-4">{question}</span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
        )}
      </button>
      {open && (
        <p className="pb-5 text-sm text-gray-400 leading-relaxed">{answer}</p>
      )}
    </div>
  );
}

export default function PricingPage() {
  useEffect(() => {
    trackEvent(AnalyticsEvents.PRICING_PAGE_VIEWED, {
      source: typeof document !== 'undefined' ? document.referrer : undefined,
    });
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader fixed={false} />

      {/* Hero */}
      <section className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-full mb-8">
            <Zap className="w-4 h-4 text-orange-400" />
            <span className="text-sm text-orange-300">BYOK workflow pricing</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Pay for{' '}
            <span className="bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500 bg-clip-text text-transparent">
              control, not tokens
            </span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Bring your own provider keys and pay Recoder for workspace control, execution visibility,
            approvals, and connected-agent capacity.
          </p>
        </div>
      </section>

      {/* Pricing Grid */}
      <section className="pb-20 px-6">
        <div className="container mx-auto max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {PLAN_ORDER.map((planId) => (
              <PlanCard key={planId} plan={PLANS[planId]} />
            ))}
          </div>
        </div>
      </section>

      {/* All plans include */}
      <section className="pb-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-6 h-6 text-orange-400" />
              <h2 className="text-2xl font-bold">All plans include</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                'Task room + artifact timeline',
                'Runtime + preview workflow',
                'BYOK provider support',
                'Project management layer',
                'Git-aware execution surfaces',
                'Sandboxed execution',
                'Human approval points',
                'Multi-surface agent workflows',
                'Unlimited projects',
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-2 text-sm text-gray-300">
                  <Check className="w-4 h-4 text-green-400 shrink-0" />
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="pb-24 px-6">
        <div className="container mx-auto max-w-3xl">
          <div className="text-center mb-12">
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-full mb-6">
              <HelpCircle className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-purple-300">FAQ</span>
            </div>
            <h2 className="text-3xl font-bold">Frequently asked questions</h2>
          </div>
          <div className="divide-y divide-white/10 border-t border-white/10">
            {FAQ_ITEMS.map((item) => (
              <FAQItem key={item.question} question={item.question} answer={item.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="pb-24 px-6">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to build with AI?</h2>
          <p className="text-gray-400 mb-8">
            Get started for free with your own API key, or subscribe for the full experience.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/signup"
              className="px-8 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 text-white rounded-lg font-semibold transition-all"
            >
              Get Started Free
            </Link>
            <Link
              href="mailto:enterprise@recoder.xyz"
              className="px-8 py-3 border border-white/20 hover:border-white/40 text-white rounded-lg font-semibold transition-all hover:bg-white/5"
            >
              Talk to Sales
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
