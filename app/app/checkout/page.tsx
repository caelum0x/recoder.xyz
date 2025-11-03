'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, ArrowLeft, Loader2 } from 'lucide-react';

interface PlanDetails {
  id: string;
  name: string;
  price: number;
  period: string;
  features: string[];
}

const planConfigs: Record<string, PlanDetails> = {
  weekly: {
    id: 'weekly',
    name: 'Weekly',
    price: 10,
    period: 'week',
    features: [
      '10 sessions per day',
      '30k tokens/session',
      'All AI models',
      'Priority support',
      'Team collaboration (3 members)',
    ],
  },
  monthly: {
    id: 'monthly',
    name: 'Monthly',
    price: 20,
    period: 'month',
    features: [
      '15 sessions per day',
      '50k tokens/session',
      'All AI models',
      'Priority support',
      'Team collaboration (5 members)',
      'API access',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 100,
    period: 'month',
    features: [
      '20 sessions per day',
      '100k tokens/session',
      'All AI models + Beta access',
      'Priority support + Slack',
      'Team collaboration (10 members)',
      'API access',
      'Custom AI models',
      'Dedicated account manager',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 500,
    period: 'month',
    features: [
      'Unlimited sessions',
      'Unlimited tokens',
      'All AI models + Beta access',
      '24/7 dedicated support',
      'Unlimited team members',
      'API access',
      'Custom AI models',
      'On-premise deployment',
      'SLA guarantees',
    ],
  },
};

function CheckoutContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planId = searchParams.get('plan') || 'monthly';
  const plan = planConfigs[planId];

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/auth/signin?callbackUrl=/checkout?plan=${planId}`);
    }
  }, [status, router, planId]);

  const handleSubscribe = async (paymentMethod: 'paddle' | 'dodo') => {
    setLoading(true);
    setError(null);

    try {
      // Import backend API client
      const { backendApi } = await import('@/lib/backend-api');

      // Create subscription with backend API
      const subscription = await backendApi.createSubscription({
        planId,
        billingAddress: {
          country: 'US',
          state: 'California',
          city: 'San Francisco',
          street: '123 Main St',
          zipcode: '94102',
        },
        returnUrl: `${window.location.origin}/billing/subscription?success=true`,
      });

      // Redirect to payment link
      if (subscription.paymentLink) {
        window.location.href = subscription.paymentLink;
      } else {
        throw new Error('No payment link received');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create subscription');
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="max-w-md p-8 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
          <h2 className="text-2xl font-bold mb-2">Plan Not Found</h2>
          <p className="text-gray-400 mb-6">The selected plan does not exist.</p>
          <button 
            onClick={() => router.push('/pricing')}
            className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all"
          >
            View All Plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <button
          onClick={() => router.push('/pricing')}
          className="mb-6 flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Pricing</span>
        </button>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Plan Summary */}
          <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
            <h2 className="text-xl font-bold mb-2">Plan Summary</h2>
            <p className="text-gray-400 mb-6">Review your selected plan</p>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-2xl font-bold">{plan.name} Plan</h3>
                <p className="text-3xl font-bold mt-2 text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-purple-600">
                  ${plan.price}
                  <span className="text-lg text-gray-400">
                    /{plan.period}
                  </span>
                </p>
              </div>

              <div className="pt-4 border-t border-white/10">
                <h4 className="font-semibold mb-3">What's included:</h4>
                <ul className="space-y-2">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {session?.user && (
                <div className="pt-4 border-t border-white/10">
                  <p className="text-sm text-gray-400">
                    Signed in as: <strong className="text-white">{session.user.email}</strong>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Payment Method */}
          <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
            <h2 className="text-xl font-bold mb-2">Complete Payment</h2>
            <p className="text-gray-400 mb-6">Choose your payment method</p>
            
            <div className="space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={() => handleSubscribe('paddle')}
                  disabled={loading}
                  className="w-full p-4 rounded-xl border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                        💳
                      </div>
                      <div className="text-left">
                        <div className="font-semibold">Paddle</div>
                        <div className="text-xs text-gray-400">
                          Credit Card, PayPal, Apple Pay
                        </div>
                      </div>
                    </div>
                    {loading && <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />}
                  </div>
                </button>

                <button
                  onClick={() => handleSubscribe('dodo')}
                  disabled={loading}
                  className="w-full p-4 rounded-xl border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                        🦤
                      </div>
                      <div className="text-left">
                        <div className="font-semibold">DODO Payments</div>
                        <div className="text-xs text-gray-400">
                          Crypto & traditional payments
                        </div>
                      </div>
                    </div>
                    {loading && <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />}
                  </div>
                </button>
              </div>

              <div className="pt-4 text-xs text-gray-400 space-y-2">
                <p>
                  By subscribing, you agree to our{' '}
                  <a href="/terms" className="underline text-orange-500 hover:text-orange-400">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href="/privacy" className="underline text-orange-500 hover:text-orange-400">
                    Privacy Policy
                  </a>
                  .
                </p>
                <p>Your subscription will auto-renew unless cancelled.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}
