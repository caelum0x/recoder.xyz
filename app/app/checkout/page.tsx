'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
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

export default function CheckoutPage() {
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
      // Create checkout session
      const response = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: planId,
          paymentMethod,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to payment provider
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Plan Not Found</CardTitle>
            <CardDescription>The selected plan does not exist.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/pricing')}>
              View All Plans
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <Button
          variant="ghost"
          onClick={() => router.push('/pricing')}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Pricing
        </Button>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Plan Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Plan Summary</CardTitle>
              <CardDescription>Review your selected plan</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="text-2xl font-bold">{plan.name} Plan</h3>
                  <p className="text-3xl font-bold mt-2">
                    ${plan.price}
                    <span className="text-lg text-muted-foreground">
                      /{plan.period}
                    </span>
                  </p>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-semibold mb-3">What's included:</h4>
                  <ul className="space-y-2">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {session?.user && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Signed in as: <strong>{session.user.email}</strong>
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Payment Method */}
          <Card>
            <CardHeader>
              <CardTitle>Complete Payment</CardTitle>
              <CardDescription>Choose your payment method</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <Button
                  onClick={() => handleSubscribe('paddle')}
                  disabled={loading}
                  className="w-full h-auto py-4 flex flex-col items-start"
                  variant="outline"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        💳
                      </div>
                      <div className="text-left">
                        <div className="font-semibold">Paddle</div>
                        <div className="text-xs text-muted-foreground">
                          Credit Card, PayPal, Apple Pay
                        </div>
                      </div>
                    </div>
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  </div>
                </Button>

                <Button
                  onClick={() => handleSubscribe('dodo')}
                  disabled={loading}
                  className="w-full h-auto py-4 flex flex-col items-start"
                  variant="outline"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        🦤
                      </div>
                      <div className="text-left">
                        <div className="font-semibold">DODO Payments</div>
                        <div className="text-xs text-muted-foreground">
                          Crypto & traditional payments
                        </div>
                      </div>
                    </div>
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  </div>
                </Button>
              </div>

              <div className="pt-4 text-xs text-muted-foreground space-y-2">
                <p>
                  By subscribing, you agree to our{' '}
                  <a href="/terms" className="underline">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href="/privacy" className="underline">
                    Privacy Policy
                  </a>
                  .
                </p>
                <p>Your subscription will auto-renew unless cancelled.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
