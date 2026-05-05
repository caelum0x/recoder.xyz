'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ArrowRight, Globe, Code2, Bot, Workflow, Sparkles, Database, Server, X } from 'lucide-react';
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
    description: 'BYOK proof-of-loop workspace',
    features: [
      '6 runs per day',
      'BYOK provider support',
      'Runtime + preview lane',
      'All core platform surfaces',
      'Community support',
    ],
    cta: 'Start Free',
    ctaLink: '/auth/signup',
    highlight: false,
  },
  {
    name: 'Weekly',
    price: '$10',
    period: '/week',
    description: 'Short shipping cycles with BYOK',
    features: [
      '10 runs per day',
      'Bring your own provider keys',
      'Shared task + artifact workflow',
      'All core platform surfaces',
      'Email support',
    ],
    cta: 'Subscribe Weekly',
    ctaLink: '/billing/upgrade',
    highlight: false,
  },
  {
    name: 'Monthly',
    price: '$20',
    period: '/month',
    description: 'Team control plane with BYOK',
    features: [
      '15 runs per day',
      'Bring your own provider keys',
      'Shared approvals and handoff',
      'Advanced analytics',
      'Priority support',
    ],
    cta: 'Subscribe Monthly',
    ctaLink: '/billing/upgrade',
    highlight: true,
  },
  {
    name: 'Pro',
    price: '$100',
    period: '/month',
    description: 'For active agent teams',
    features: [
      '20 runs per day',
      'Bring your own provider keys',
      'Team collaboration',
      'Custom integrations',
      'Dedicated support',
    ],
    cta: 'Go Pro',
    ctaLink: '/billing/upgrade',
    highlight: false,
  },
];

export default function PlanPage() {
  const [showBetaModal, setShowBetaModal] = useState(false);
  const publicServices = RECODER_SERVICES.filter(s => !s.internal);

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader fixed={false} />

      {/* Hero */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-5xl text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            One control plane,
            <span className="bg-gradient-to-r from-orange-500 to-purple-600 bg-clip-text text-transparent">
              shared across every lane
            </span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-4">
            Pricing should reflect workflow control for external coding agents, not bundled model access.
          </p>
        </div>
      </section>

      {/* Ecosystem Services */}
      <section className="pb-16 px-6">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-2xl font-bold mb-8 text-center">Control-Plane Surfaces</h2>
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
                  className="flex items-center space-x-3 p-4 bg-zinc-900 border border-white/10 rounded-lg hover:border-orange-500/50 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-gray-400 group-hover:text-orange-400 transition-colors" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{service.label}</div>
                    <div className="text-xs text-gray-500 truncate">{service.description}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-orange-400 transition-colors shrink-0 ml-auto" />
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
          <p className="text-gray-400 text-center mb-12">Start with BYOK and scale into more workflow control as execution volume grows.</p>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative p-6 rounded-xl border ${
                  plan.highlight
                    ? 'border-orange-500/50 bg-orange-500/5'
                    : 'border-white/10 bg-zinc-900'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-orange-500 rounded-full text-xs font-medium">
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
                    onClick={() => setShowBetaModal(true)}
                    className={`w-full text-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      plan.highlight
                        ? 'bg-gradient-to-r from-orange-500 to-purple-600 hover:opacity-90'
                        : 'bg-zinc-800 hover:bg-zinc-700'
                    }`}
                  >
                    {plan.cta}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6 border-t border-white/10">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold mb-4">Start building today</h2>
          <p className="text-gray-400 mb-8">100% free with BYOK. No credit card required.</p>
          <Link
            href="/auth/signup"
            className="inline-flex items-center space-x-2 px-8 py-3 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            <span>Get Started Free</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Beta Modal */}
      {showBetaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-gray-900 to-black border border-orange-500/30 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-6 border-b border-white/10">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">Coming Soon</h2>
                </div>
                <button onClick={() => setShowBetaModal(false)} className="text-gray-400 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white">You Already Have Everything!</h3>
              <p className="text-gray-300">
                During beta, the platform is available with BYOK (Bring Your Own Key). Paid plans are for workflow control, coordination, and governance rather than platform-provided tokens.
              </p>
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                <div className="flex items-start space-x-3">
                  <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-gray-300">
                    You get full access to every service — Agents, Web IDE, PM, Agency, and CLI — completely free during beta.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-white/10 bg-white/5 flex flex-col sm:flex-row gap-3">
              <Link
                href="/auth/signup"
                className="flex-1 text-center px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:opacity-90 rounded-lg font-medium transition-all"
              >
                Get Started Free
              </Link>
              <Link
                href="/dashboard"
                className="flex-1 text-center px-6 py-3 border border-white/20 hover:border-white/40 rounded-lg font-medium transition-all"
              >
                I'm Already Signed Up
              </Link>
            </div>
          </div>
        </div>
      )}
      <SiteFooter />
    </div>
  );
}
