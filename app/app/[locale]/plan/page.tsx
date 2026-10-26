'use client';

import Link from 'next/link';
import { Check, ArrowRight, Globe, Code2, Bot, Workflow, Sparkles, Database, Server } from 'lucide-react';
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

// Owner decision 2026-10-27: Recoder's hosted paid tiers (Pro/Team/Enterprise)
// are retired — the product is completely free. There is now exactly one
// plan. See git history (pre-2026-10-27) for the removed Pro/Team/Enterprise
// tiers + Dodo/Paddle checkout logic that used to live on this page.
const plan = {
  name: 'Free',
  price: '$0',
  period: 'forever',
  description: 'Bring your own API key — every feature included',
  features: [
    'Unlimited parallel agents',
    '40+ AI models via BYOK',
    'Desktop app + parallel agents',
    'All platform services',
    'Full team collaboration, no member cap',
    'Shared team memory and unlimited evidence retention',
  ],
  cta: 'Start Free',
  ctaLink: '/auth/signup',
};

export default function PlanPage() {
  const publicServices = RECODER_SERVICES.filter(s => !s.internal);

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
        <div className="container mx-auto max-w-md">
          <h2 className="text-3xl font-bold mb-4 text-center">Pricing</h2>
          <p className="text-gray-400 text-center mb-12">Recoder is free. Bring your own API key.</p>
          <div className="relative p-6 rounded-xl border border-white/30 bg-white/5">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="text-xs text-gray-500">{plan.description}</p>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-bold">{plan.price}</span>
              <span className="text-gray-500 text-sm"> {plan.period}</span>
            </div>
            <ul className="space-y-3 mb-6">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start space-x-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-gray-300">{feature}</span>
                </li>
              ))}
            </ul>
            <Link
              href={plan.ctaLink}
              className="block text-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors bg-white text-black hover:bg-neutral-200"
            >
              {plan.cta}
            </Link>
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
