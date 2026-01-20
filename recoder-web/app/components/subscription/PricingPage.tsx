/**
 * Pricing Page Component
 * Real implementation with Paddle/DodoPay integration
 */

import { useState } from 'react';

// Icon components using UnoCSS classes (Cloudflare Workers compatible)
const Check = ({ className }: { className?: string }) => <div className={`i-ph:check ${className || ''}`} />;
const Zap = ({ className }: { className?: string }) => <div className={`i-ph:lightning ${className || ''}`} />;
const Users = ({ className }: { className?: string }) => <div className={`i-ph:users ${className || ''}`} />;
const Building2 = ({ className }: { className?: string }) => <div className={`i-ph:building ${className || ''}`} />;

interface PricingPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  features: string[];
  popular?: boolean;
  icon: any;
  limit: number;
}

const plans: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    limit: 5,
    icon: Zap,
    features: [
      '5 AI generations/month',
      'Basic templates',
      'Community support',
      'Public projects only'
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 20,
    currency: 'USD',
    limit: 100,
    icon: Zap,
    popular: true,
    features: [
      '100 AI generations/month',
      'All premium templates',
      'Priority AI models',
      'Private projects',
      'Custom deployments',
      'Code export',
      'Priority support'
    ]
  },
  {
    id: 'team',
    name: 'Team',
    price: 50,
    currency: 'USD',
    limit: 500,
    icon: Users,
    features: [
      '500 AI generations/month',
      'Everything in Pro',
      'Team collaboration (5 seats)',
      'Shared workspaces',
      'Private template library',
      'SSO integration',
      'Dedicated support'
    ]
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 200,
    currency: 'USD',
    limit: 2000,
    icon: Building2,
    features: [
      '2000 AI generations/month',
      'Everything in Team',
      'Unlimited seats',
      'Custom AI model training',
      'On-premise deployment',
      'SLA guarantee',
      'White-label option',
      'Custom integrations'
    ]
  }
];

export function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handle subscription purchase
   */
  const handleSubscribe = async (planId: string) => {
    if (planId === 'free') {
      // No payment needed for free tier
      return;
    }

    setLoading(planId);
    setError(null);

    try {
      // Get user info from your auth system
      const userId = getUserId(); // Replace with your auth
      const email = getUserEmail(); // Replace with your auth

      if (!userId || !email) {
        throw new Error('Please sign in to subscribe');
      }

      // Detect user's country for provider selection
      const userCountry = await detectUserCountry();

      // Create checkout session
      const response = await fetch('/api/subscribe?action=create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({
          userId,
          email,
          planId,
          userCountry
        })
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const { checkoutUrl, provider } = (await response.json()) as { checkoutUrl: string; provider: string };

      console.log(`Redirecting to ${provider} checkout...`);

      // Redirect to checkout page
      window.location.href = checkoutUrl;
    } catch (err: unknown) {
      console.error('Subscription error:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-20 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-white mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-gray-400">
            Build production apps without breaking the bank
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="max-w-2xl mx-auto mb-8 p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
            <p className="text-red-400 text-center">{error}</p>
          </div>
        )}

        {/* Pricing cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const isPopular = plan.popular;

            return (
              <div
                key={plan.id}
                className={`relative bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border-2 transition-all hover:scale-105 ${
                  isPopular
                    ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                    : 'border-gray-700'
                }`}
              >
                {/* Popular badge */}
                {isPopular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Icon */}
                <div className="mb-4">
                  <Icon className={`w-12 h-12 ${isPopular ? 'text-blue-400' : 'text-gray-400'}`} />
                </div>

                {/* Plan name */}
                <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>

                {/* Price */}
                <div className="mb-6">
                  <span className="text-5xl font-bold text-white">
                    ${plan.price}
                  </span>
                  <span className="text-gray-400 ml-2">/month</span>
                </div>

                {/* Generations limit */}
                <div className="mb-6 p-3 bg-gray-700/50 rounded-lg">
                  <p className="text-gray-300 text-sm">
                    <span className="font-semibold text-white">{plan.limit}</span> AI generations/month
                  </p>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-300 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA button */}
                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={loading === plan.id || plan.id === 'free'}
                  className={`w-full py-3 px-6 rounded-lg font-semibold transition-all ${
                    isPopular
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
                      : plan.id === 'free'
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  } ${loading === plan.id ? 'opacity-50 cursor-wait' : ''}`}
                >
                  {loading === plan.id ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : plan.id === 'free' ? (
                    'Current Plan'
                  ) : (
                    'Get Started'
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* FAQ or additional info */}
        <div className="mt-20 text-center">
          <p className="text-gray-400 mb-4">
            All plans include access to our AI-powered code generation, templates, and deployment tools.
          </p>
          <p className="text-gray-500 text-sm">
            Payments processed securely via Paddle or DodoPay. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}

// Helper functions (replace with your auth system)
function getUserId(): string | null {
  // Replace with your authentication system
  // Example: return auth.currentUser?.uid
  return localStorage.getItem('userId');
}

function getUserEmail(): string | null {
  // Replace with your authentication system
  return localStorage.getItem('userEmail');
}

async function detectUserCountry(): Promise<string> {
  try {
    // Use a geolocation API to detect user's country
    const response = await fetch('https://ipapi.co/json/');
    const data = (await response.json()) as { country_code: string };
    return data.country_code;
  } catch {
    return 'US'; // Default to US
  }
}
