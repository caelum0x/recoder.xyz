'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ArrowRight, Loader2 } from 'lucide-react';
import { PageLoader } from '@/components/ui/LoadingSpinner';

const plans = [
  {
    id: 'weekly',
    name: 'Weekly Pass',
    price: 7,
    interval: 'week',
    features: [
      '50 sessions per day',
      'Access to all AI models',
      'Priority support',
      'No API key needed',
      'Cancel anytime'
    ]
  },
  {
    id: 'monthly',
    name: 'Monthly Pro',
    price: 20,
    interval: 'month',
    popular: true,
    features: [
      '200 sessions per day',
      'Access to all AI models',
      'Priority support',
      'Advanced analytics',
      'Team collaboration (5 seats)',
      'API access',
      'Custom integrations'
    ]
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99,
    interval: 'month',
    features: [
      'Unlimited sessions',
      'Dedicated AI infrastructure',
      '24/7 premium support',
      'Custom model fine-tuning',
      'Unlimited team seats',
      'SLA guarantee',
      'On-premise deployment option',
      'Dedicated account manager'
    ]
  }
];

export default function UpgradePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentPlan, setCurrentPlan] = useState('free');
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [prorationAmount, setProrationAmount] = useState<number>(0);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      loadCurrentPlan();
    }
  }, [status, router]);

  const loadCurrentPlan = async () => {
    try {
      const response = await fetch('/api/billing/subscription');
      const data = await response.json();
      if (data.success) {
        setCurrentPlan(data.subscription?.plan || 'free');
      }
    } catch (error) {
      console.error('Error loading plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateProration = async (newPlanId: string) => {
    try {
      const response = await fetch('/api/billing/proration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPlan: newPlanId })
      });
      const data = await response.json();
      if (data.success) {
        setProrationAmount(data.amount);
      }
    } catch (error) {
      console.error('Error calculating proration:', error);
    }
  };

  const handleUpgrade = async (planId: string) => {
    setUpgrading(planId);
    try {
      const response = await fetch('/api/billing/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId })
      });

      const data = await response.json();

      if (data.success) {
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
        } else {
          router.push('/billing?upgraded=true');
        }
      } else {
        alert(data.error || 'Upgrade failed');
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      alert('An error occurred while upgrading');
    } finally {
      setUpgrading(null);
    }
  };

  if (loading || status === 'loading') {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <Link href="/billing" className="text-gray-400 hover:text-white mb-4 inline-block">
            ← Back to Billing
          </Link>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-500 to-purple-600 bg-clip-text text-transparent mb-4">
            Upgrade Your Plan
          </h1>
          <p className="text-gray-400">
            Choose a plan that fits your needs. You can change or cancel anytime.
          </p>
        </div>

        <div className="mb-8 bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-sm text-gray-300">
            Current Plan: <span className="font-semibold text-white capitalize">{currentPlan}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => {
            const isCurrentPlan = plan.id === currentPlan;
            const canUpgrade = ['free', 'weekly'].includes(currentPlan) && 
                               !isCurrentPlan &&
                               plan.id !== 'weekly';

            return (
              <div
                key={plan.id}
                className={`relative bg-gray-800 border-2 rounded-2xl p-6 ${
                  plan.popular 
                    ? 'border-orange-500' 
                    : isCurrentPlan 
                    ? 'border-green-500' 
                    : 'border-gray-700'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-gradient-to-r from-orange-500 to-purple-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                      Most Popular
                    </span>
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-green-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                      Current Plan
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline">
                    <span className="text-4xl font-bold">${plan.price}</span>
                    <span className="text-gray-400 ml-2">/{plan.interval}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <Check className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-300 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isCurrentPlan || upgrading === plan.id || !canUpgrade}
                  className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center transition-all ${
                    isCurrentPlan
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : !canUpgrade
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : plan.popular
                      ? 'bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  {upgrading === plan.id ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : isCurrentPlan ? (
                    'Current Plan'
                  ) : !canUpgrade ? (
                    'Contact Sales'
                  ) : (
                    <>
                      Upgrade Now
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </button>

                {plan.id === 'enterprise' && (
                  <p className="text-center text-gray-400 text-xs mt-3">
                    Contact us for custom pricing and features
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-12 bg-gray-800 border border-gray-700 rounded-2xl p-6">
          <h3 className="text-xl font-bold mb-4">Frequently Asked Questions</h3>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Can I cancel anytime?</h4>
              <p className="text-gray-400 text-sm">
                Yes, you can cancel your subscription at any time. You'll continue to have access until the end of your billing period.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">What happens when I upgrade?</h4>
              <p className="text-gray-400 text-sm">
                You'll be charged a prorated amount for the remaining time in your current billing period, and your new plan will take effect immediately.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Do you offer refunds?</h4>
              <p className="text-gray-400 text-sm">
                Yes, we offer a 7-day money-back guarantee. Contact support if you're not satisfied with your plan.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
