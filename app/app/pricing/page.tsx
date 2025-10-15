'use client';

import Link from 'next/link';
import { Terminal, Check, Zap, Crown, Building, Sparkles } from 'lucide-react';

export default function PricingPage() {
  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      period: 'forever',
      description: 'Try Recoder with your own API key',
      icon: Terminal,
      badge: null,
      popular: false,
      features: [
        '6 sessions per day',
        '10k tokens/session (premium models)',
        'Unlimited free models',
        'Bring your own OpenRouter key',
        'CLI + Web access',
        'Community support'
      ],
      cta: 'Start Free',
      href: '/auth/signup?plan=free',
      color: 'gray'
    },
    {
      id: 'weekly',
      name: 'Weekly',
      price: 10,
      period: 'week',
      description: 'Perfect for short-term projects',
      icon: Zap,
      badge: null,
      popular: false,
      features: [
        '10 sessions per day',
        '30k tokens/session (premium models)',
        'Unlimited free models',
        'No API key needed',
        'All AI models (Claude, GPT-4, Gemini)',
        'Priority support',
        'Team collaboration (3 members)',
        'Advanced features'
      ],
      cta: 'Start Weekly',
      href: '/checkout?plan=weekly',
      color: 'orange'
    },
    {
      id: 'monthly',
      name: 'Monthly',
      price: 20,
      period: 'month',
      description: 'Best for individual developers',
      icon: Sparkles,
      badge: 'MOST POPULAR',
      popular: true,
      features: [
        '15 sessions per day',
        '50k tokens/session (premium models)',
        'Unlimited free models',
        'No API key needed',
        'All AI models (Claude, GPT-4, Gemini)',
        'Priority support',
        'Team collaboration (5 members)',
        'Advanced features',
        'API access'
      ],
      cta: 'Start Monthly',
      href: '/checkout?plan=monthly',
      color: 'orange'
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 100,
      period: 'month',
      description: 'For power users and teams',
      icon: Crown,
      badge: '5X USAGE',
      popular: false,
      features: [
        '20 sessions per day',
        '100k tokens/session (premium models)',
        'Unlimited free models',
        'No API key needed',
        'All AI models + Beta access',
        'Priority support + Slack',
        'Team collaboration (10 members)',
        'Advanced features',
        'API access',
        'Custom AI models',
        'Dedicated account manager'
      ],
      cta: 'Start Pro',
      href: '/checkout?plan=pro',
      color: 'purple'
    }
  ];

  const enterprise = {
    name: 'Enterprise',
    description: 'Custom solutions for large teams',
    icon: Building,
    features: [
      'Unlimited everything',
      'Custom AI models',
      'On-premise deployment',
      'SLA guarantees',
      'Security audit',
      'Dedicated support',
      'Custom integrations',
      'Training & onboarding'
    ],
    cta: 'Contact Sales',
    href: 'mailto:sales@recoder.xyz'
  };

  const faqs = [
    {
      question: 'Can I switch plans anytime?',
      answer: 'Yes! Upgrade or downgrade your plan anytime. Changes take effect immediately with pro-rated billing.'
    },
    {
      question: 'What are "sessions"?',
      answer: 'A session is a continuous work period. Each day you get a set number of sessions based on your plan.'
    },
    {
      question: 'What happens after I hit my limits?',
      answer: 'Daily session limits reset every 24 hours. Premium models have token limits per session, but free models are always unlimited.'
    },
    {
      question: 'Do you offer refunds?',
      answer: 'Yes, we offer a 7-day money-back guarantee on all paid plans. No questions asked.'
    },
    {
      question: 'Which models are considered "premium"?',
      answer: 'Claude Sonnet, GPT-4, and Gemini Pro have token limits. All other models from OpenRouter are unlimited.'
    }
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
          
          <nav className="flex items-center space-x-8">
            <Link href="/docs" className="text-sm text-gray-400 hover:text-white transition-colors">
              Docs
            </Link>
            <Link href="/pricing" className="text-sm text-white">
              Pricing
            </Link>
            <Link 
              href="/auth/signin" 
              className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full border border-orange-500/20 bg-orange-500/5">
              <Sparkles className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-orange-500">Simple, Transparent Pricing</span>
            </div>
            
            <h1 className="text-6xl md:text-8xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                Pay As You Grow
              </span>
            </h1>
            
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Start free, scale when you're ready. No hidden fees, cancel anytime.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {plans.map((plan) => {
              const Icon = plan.icon;
              const isPopular = plan.popular;
              
              return (
                <div
                  key={plan.id}
                  className={`relative p-8 rounded-2xl border ${
                    isPopular 
                      ? 'border-orange-500 bg-gradient-to-b from-orange-500/10 to-transparent' 
                      : 'border-white/10 bg-black/50'
                  } hover:border-${plan.color}-500/50 transition-all`}
                >
                  {plan.badge && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <div className="px-4 py-1 bg-orange-500 text-black text-xs font-bold rounded-full">
                        {plan.badge}
                      </div>
                    </div>
                  )}

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Icon className={`w-10 h-10 text-${plan.color}-500`} />
                      <h3 className="text-2xl font-bold">{plan.name}</h3>
                      <p className="text-gray-400 text-sm">{plan.description}</p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-baseline space-x-2">
                        <span className="text-5xl font-bold">${plan.price}</span>
                        <span className="text-gray-400">/{plan.period}</span>
                      </div>
                    </div>

                    <Link
                      href={plan.href}
                      className={`block w-full px-6 py-3 text-center rounded-lg font-medium transition-all ${
                        isPopular
                          ? 'bg-orange-500 hover:bg-orange-600 text-white'
                          : 'border border-white/10 hover:border-white/20 text-white'
                      }`}
                    >
                      {plan.cta}
                    </Link>

                    <div className="space-y-3 pt-6 border-t border-white/10">
                      {plan.features.map((feature, index) => (
                        <div key={index} className="flex items-start space-x-3">
                          <Check className={`w-5 h-5 text-${plan.color}-500 flex-shrink-0 mt-0.5`} />
                          <span className="text-sm text-gray-300">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Enterprise */}
          <div className="mt-8 p-8 rounded-2xl border border-white/10 bg-gradient-to-r from-purple-500/5 to-orange-500/5">
            <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
              <div className="flex items-start space-x-4">
                <Building className="w-12 h-12 text-purple-500 flex-shrink-0" />
                <div className="space-y-2">
                  <h3 className="text-3xl font-bold">{enterprise.name}</h3>
                  <p className="text-gray-400">{enterprise.description}</p>
                  <div className="grid grid-cols-2 gap-2 pt-4">
                    {enterprise.features.map((feature, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <Check className="w-4 h-4 text-purple-500" />
                        <span className="text-sm text-gray-300">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <Link
                href={enterprise.href}
                className="px-8 py-4 bg-gradient-to-r from-purple-500 to-orange-500 hover:from-purple-600 hover:to-orange-600 rounded-lg font-medium transition-all whitespace-nowrap"
              >
                {enterprise.cta}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-20 px-6 border-t border-white/10">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-4xl font-bold text-center mb-4">All Plans Include</h2>
          <p className="text-gray-400 text-center mb-16">Core features available in every plan</p>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <Terminal className="w-6 h-6 text-orange-500" />
              </div>
              <h3 className="text-xl font-bold">CLI + Web Access</h3>
              <p className="text-gray-400">Use from terminal or browser, your choice</p>
            </div>
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Zap className="w-6 h-6 text-purple-500" />
              </div>
              <h3 className="text-xl font-bold">Real-Time Generation</h3>
              <p className="text-gray-400">Production code in seconds, not hours</p>
            </div>
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <Check className="w-6 h-6 text-orange-500" />
              </div>
              <h3 className="text-xl font-bold">No Lock-In</h3>
              <p className="text-gray-400">Cancel anytime, export your code always</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-4xl font-bold text-center mb-16">Frequently Asked Questions</h2>
          
          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="p-6 rounded-2xl border border-white/10 bg-black/50 hover:border-white/20 transition-all"
              >
                <h3 className="text-xl font-bold mb-3">{faq.question}</h3>
                <p className="text-gray-400">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6">
        <div className="container mx-auto max-w-4xl text-center space-y-8">
          <h2 className="text-5xl font-bold">
            Start building for free
          </h2>
          <p className="text-xl text-gray-400">
            No credit card required. Upgrade when you're ready to scale.
          </p>
          <div className="flex items-center justify-center space-x-4">
            <Link
              href="/auth/signup"
              className="px-8 py-4 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all"
            >
              Start Free Trial
            </Link>
            <Link
              href="/docs"
              className="px-8 py-4 border border-white/10 hover:border-white/20 rounded-lg font-medium transition-colors"
            >
              View Documentation
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg"></div>
              <span className="font-bold">recoder</span>
            </div>
            
            <div className="flex items-center space-x-8 text-sm text-gray-500">
              <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
              <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
              <Link href="mailto:support@recoder.xyz" className="hover:text-white transition-colors">Support</Link>
            </div>
            
            <div className="text-sm text-gray-500">
              © 2024 Recoder.xyz
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
