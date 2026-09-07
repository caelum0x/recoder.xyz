'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ArrowRight, Globe, Code2, Bot, Workflow, Sparkles, Database, Server, Loader2 } from 'lucide-react';
import { RECODER_SERVICES, getServiceUrlClient } from '@/lib/config/platforms';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

const serviceIcons: Record<string, React.ElementType> = {
  app: Globe,
  agents: Bot,
  web: Code2,
  api: Server,
  pm: Database,
  studio: Sparkles,
  agency: Workflow,
};

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Bring your own API key',
    features: [
      '6 sessions per day',
      '40+ AI models via BYOK',
      'Desktop app + parallel agents',
      'All platform services',
      'Community support',
    ],
    cta: 'Start Free',
    ctaLink: '/auth/signup',
    highlight: false,
  },
  {
    name: 'Weekly',
    planId: 'weekly',
    price: '$10',
    period: '/week',
    description: 'We provide API keys',
    features: [
      '10 sessions per day',
      'Platform-provided API keys',
      'Priority model access',
      'All platform services',
      'Email support',
    ],
    cta: 'Subscribe Weekly',
    ctaLink: '/billing/upgrade',
    highlight: false,
  },
  {
    name: 'Monthly',
    planId: 'monthly',
    price: '$20',
    period: '/month',
    description: 'Best value for individuals',
    features: [
      '15 sessions per day',
      'Platform-provided API keys',
      'Priority model access',
      'Advanced analytics',
      'Priority support',
    ],
    cta: 'Subscribe Monthly',
    ctaLink: '/billing/upgrade',
    highlight: true,
  },
  {
    name: 'Pro',
    planId: 'pro',
    price: '$100',
    period: '/month',
    description: 'For power users and teams',
    features: [
      '20 sessions per day',
      'Premium model access',
      'Team collaboration',
      'Custom integrations',
      'Dedicated support',
    ],
    cta: 'Go Pro',
    ctaLink: '/billing/upgrade',
    highlight: false,
  },
];

// Creem is the Merchant of Record; the others remain configured fallbacks. This
// mirrors the onboarding checkout flow (POST /api/billing/create-checkout).
const CHECKOUT_PROVIDERS = ['creem', 'paddle', 'dodo'] as const;

export default function PlanPage() {
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const publicServices = RECODER_SERVICES.filter(s => !s.internal);

  const startCheckout = async (planId: string) => {
    setCheckoutError(null);
    setPendingPlan(planId);
    try {
      for (const paymentMethod of CHECKOUT_PROVIDERS) {
        const response = await fetch('/api/billing/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: planId, paymentMethod }),
        });

        // Not signed in → send them to sign in, then back to plans.
        if (response.status === 401) {
          window.location.assign(`/auth/signin?next=${encodeURIComponent('/plan')}`);
          return;
        }

        // Provider not configured/available → try the next fallback.
        if (!response.ok) continue;

        const data = (await response.json().catch(() => null)) as
          | { success?: boolean; checkoutUrl?: string }
          | null;
        if (data?.success && data.checkoutUrl) {
          window.location.assign(data.checkoutUrl);
          return;
        }
      }
      setCheckoutError(
        'Checkout is not available right now. Please try again shortly or contact support.',
      );
    } catch {
      setCheckoutError('Something went wrong starting checkout. Please try again.');
    } finally {
      setPendingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader fixed={false} />

      {/* Hero */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-5xl text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            One Platform,{' '}
            <span className="text-white">
              5 Products
            </span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-4">
            The complete AI development ecosystem. Every plan includes access to all platform services.
          </p>
        </div>
      </section>

      {/* Ecosystem Services */}
      <section className="pb-16 px-6">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-2xl font-bold mb-8 text-center">Ecosystem Services</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {publicServices.map((service) => {
              const Icon = serviceIcons[service.id] || Globe;
              const url = getServiceUrlClient(service.id);
              return (
                <a
                  key={service.id}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-3 p-4 bg-zinc-900 border border-white/10 rounded-lg hover:border-neutral-600 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{service.label}</div>
                    <div className="text-xs text-gray-500 truncate">{service.description}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors shrink-0 ml-auto" />
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 px-6 border-t border-white/10">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold mb-4 text-center">Plans & Pricing</h2>
          <p className="text-gray-400 text-center mb-12">Start free with BYOK. Upgrade anytime.</p>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative p-6 rounded-xl border ${
                  plan.highlight
                    ? 'border-white/30 bg-white/5'
                    : 'border-white/10 bg-zinc-900'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-white text-black rounded-full text-xs font-medium">
                    Best Value
                  </div>
                )}
                <div className="mb-4">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="text-xs text-gray-500">{plan.description}</p>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-gray-500 text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start space-x-2 text-sm">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span className="text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>
                {plan.name === 'Free' ? (
                  <Link
                    href={plan.ctaLink}
                    className="block text-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors bg-zinc-800 hover:bg-zinc-700"
                  >
                    {plan.cta}
                  </Link>
                ) : (
                  <button
                    onClick={() => plan.planId && startCheckout(plan.planId)}
                    disabled={pendingPlan !== null}
                    className={`w-full inline-flex items-center justify-center gap-2 text-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 ${
                      plan.highlight
                        ? 'bg-white text-black hover:bg-neutral-200'
                        : 'bg-zinc-800 hover:bg-zinc-700'
                    }`}
                  >
                    {pendingPlan === plan.planId ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Starting checkout…
                      </>
                    ) : (
                      plan.cta
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
          {checkoutError ? (
            <p className="mt-6 text-center text-sm text-amber-300">{checkoutError}</p>
          ) : null}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6 border-t border-white/10">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold mb-4">Start building today</h2>
          <p className="text-gray-400 mb-8">100% free with BYOK. No credit card required.</p>
          <Link
            href="/auth/signup"
            className="inline-flex items-center space-x-2 px-8 py-3 bg-white text-black rounded-lg font-medium hover:bg-neutral-200 transition-colors"
          >
            <span>Get Started Free</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
