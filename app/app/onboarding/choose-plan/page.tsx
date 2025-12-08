/**
 * Onboarding - Choose Plan
 * Third step: Plan selection
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-provider';
import Link from 'next/link';
import { 
  Terminal,
  Check,
  ArrowRight,
  ArrowLeft,
  Zap,
  Star,
  Crown
} from 'lucide-react';

export default function ChoosePlanPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState('free');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    if (!session && !isPending) {
      router.push('/auth/signin');
    } else if (session && !isPending) {
      setLoading(false);
    }
  }, [session, isPending, router]);

  const plans = [
    {
      id: 'free',
      name: 'Free',
      icon: Zap,
      price: { monthly: 0, yearly: 0 },
      description: 'Perfect for getting started',
      features: [
        'Use your own OpenRouter API key',
        'Access to all 50+ AI models',
        'CLI, Web, and API access',
        'Basic usage analytics',
        'Community support',
      ],
      cta: 'Start Free',
      popular: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      icon: Star,
      price: { monthly: 29, yearly: 290 },
      description: 'For professional developers',
      features: [
        'Everything in Free',
        'Platform-provided API credits',
        '$100/month in AI credits included',
        'Advanced usage analytics',
        'Priority support',
        'Team collaboration (up to 5)',
        'Custom integrations',
      ],
      cta: 'Start Pro',
      popular: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      icon: Crown,
      price: { monthly: 199, yearly: 1990 },
      description: 'For teams and organizations',
      features: [
        'Everything in Pro',
        'Unlimited team members',
        '$1000/month in AI credits',
        'Dedicated support',
        'SLA guarantee',
        'Custom deployment options',
        'Advanced security features',
        'Training and onboarding',
      ],
      cta: 'Start Enterprise',
      popular: false,
    },
  ];

  const handleContinue = () => {
    // Save selected plan to session
    sessionStorage.setItem('onboarding_plan', selectedPlan);
    
    // If free plan, go to API key setup
    // If paid plan, go to checkout/payment
    if (selectedPlan === 'free') {
      router.push('/onboarding/setup-api-key');
    } else {
      // For paid plans, we'll go to setup-api-key for now
      // TODO: Implement checkout flow
      router.push('/onboarding/complete');
    }
  };

  if (loading || isPending) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Progress Bar */}
      <div className="fixed top-0 w-full h-1 bg-white/10 z-50">
        <div
          className="h-full bg-gradient-to-r from-orange-500 to-purple-600 transition-all duration-500"
          style={{ width: '60%' }}
        />
      </div>

      {/* Header */}
      <header className="fixed top-1 w-full z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
          <div className="text-sm text-gray-400">
            Step 3 of 5
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-24 mt-16">
        <div className="max-w-6xl mx-auto">
          {/* Title */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Choose your plan</h1>
            <p className="text-xl text-gray-400 mb-6">Start with free, upgrade anytime</p>
            
            {/* Billing Cycle Toggle */}
            <div className="inline-flex items-center space-x-2 p-1 rounded-lg bg-white/5 border border-white/10">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-2 rounded-md font-medium transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-gradient-to-r from-orange-500 to-purple-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-4 py-2 rounded-md font-medium transition-all ${
                  billingCycle === 'yearly'
                    ? 'bg-gradient-to-r from-orange-500 to-purple-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Yearly
                <span className="ml-2 text-xs text-green-400">Save 17%</span>
              </button>
            </div>
          </div>

          {/* Plans Grid */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {plans.map((plan) => {
              const Icon = plan.icon;
              const isSelected = selectedPlan === plan.id;
              const price = billingCycle === 'monthly' ? plan.price.monthly : plan.price.yearly;
              const perMonth = billingCycle === 'yearly' ? Math.round(price / 12) : price;

              return (
                <div
                  key={plan.id}
                  className={`relative p-6 rounded-2xl border backdrop-blur-xl transition-all cursor-pointer ${
                    isSelected
                      ? 'border-orange-500 bg-gradient-to-br from-orange-500/10 to-purple-600/10 scale-105'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  } ${plan.popular ? 'md:scale-110' : ''}`}
                  onClick={() => setSelectedPlan(plan.id)}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <div className="px-4 py-1 rounded-full bg-gradient-to-r from-orange-500 to-purple-600 text-sm font-medium">
                        Most Popular
                      </div>
                    </div>
                  )}

                  <div className="text-center mb-6">
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 ${
                      isSelected
                        ? 'bg-gradient-to-br from-orange-500 to-purple-600'
                        : 'bg-white/5'
                    }`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                    <p className="text-gray-400 text-sm mb-4">{plan.description}</p>
                    <div className="mb-2">
                      <span className="text-4xl font-bold">${perMonth}</span>
                      <span className="text-gray-400">/month</span>
                    </div>
                    {billingCycle === 'yearly' && price > 0 && (
                      <div className="text-sm text-gray-500">
                        Billed ${price}/year
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 mb-6">
                    {plan.features.map((feature, index) => (
                      <div key={index} className="flex items-start space-x-2">
                        <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-300">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`w-full py-3 rounded-xl font-medium transition-all ${
                      isSelected
                        ? 'bg-gradient-to-r from-orange-500 to-purple-600 text-white'
                        : 'bg-white/5 hover:bg-white/10 text-gray-300'
                    }`}
                  >
                    {isSelected ? (
                      <span className="flex items-center justify-center space-x-2">
                        <Check className="w-5 h-5" />
                        <span>Selected</span>
                      </span>
                    ) : (
                      plan.cta
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Additional Info */}
          <div className="text-center text-sm text-gray-400 mb-8">
            <p>All plans include access to 50+ AI models and multiple platforms.</p>
            <p>You can upgrade, downgrade, or cancel anytime.</p>
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center">
            <Link
              href="/onboarding/setup-profile"
              className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium transition-all flex items-center space-x-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Link>

            <button
              onClick={handleContinue}
              className="px-8 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl font-medium transition-all flex items-center space-x-2"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
