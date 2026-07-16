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
            'Unlimited sessions & tokens'
          ) : (
            <>
              {plan.limits.sessionsPerDay} sessions/day &middot;{' '}
              {(plan.limits.tokensPerSessionPricey / 1000).toFixed(0)}k tokens/session &middot;{' '}
              {plan.limits.teamMembers === 1 ? 'Solo' : `${plan.limits.teamMembers} team members`}
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
      'On the Free plan, you connect your own OpenRouter API key to access AI models. You pay OpenRouter directly for model usage. On paid plans, we provide the API key -- no setup needed.',
  },
  {
    question: 'Can I switch plans at any time?',
    answer:
      'Yes. You can upgrade or downgrade at any time. When upgrading, you get immediate access to the new tier. When downgrading, your current plan runs until the end of the billing period.',
  },
  {
    question: 'What happens when I hit my session or token limit?',
    answer:
      'You can still use free models (Llama, Mistral, Gemma, etc.) with unlimited tokens. Only premium models (Claude, GPT-4, Gemini Pro) count against your token limits. You can also upgrade your plan for higher limits.',
  },
  {
    question: 'Which AI models are included?',
    answer:
      'Paid plans include access to Claude 3.5 Sonnet, Claude 3 Opus, GPT-4 Turbo, GPT-4, Gemini 2.0 Flash, Gemini Pro, and more. Free models like Llama 3.1, Mistral 7B, and Gemma 2 are available on all plans with unlimited usage.',
  },
  {
    question: 'Is there a free trial for paid plans?',
    answer:
      'The Free plan itself is a great way to try Recoder. If you want to try the full experience with all models included, the Weekly plan at $10/week gives you flexible, low-commitment access.',
  },
  {
    question: 'How does team collaboration work?',
    answer:
      'Each paid plan includes a set number of team member seats. Team members share the workspace and can collaborate on projects in real time. Enterprise plans offer unlimited seats.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit and debit cards through our payment partners Paddle and DodoPayments. Enterprise customers can also pay via invoice.',
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
            <span className="text-sm text-orange-300">Simple, transparent pricing</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Choose your{' '}
            <span className="bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500 bg-clip-text text-transparent">
              plan
            </span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Start free with your own API key, or let us handle everything.
            All plans include the full Web IDE + CLI experience.
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
                'Web IDE + Terminal CLI',
                'Web-to-CLI sync',
                'Unlimited free model usage',
                'Project management',
                'Git integration',
                'Sandboxed execution',
                'Real-time collaboration',
                'Multi-model support',
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
