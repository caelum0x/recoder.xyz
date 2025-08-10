'use client';

import { useState, useEffect } from 'react';
import { useAuth } from "@/lib/auth/auth-context";
import { Check, Star, Zap, Shield, Sparkles } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: string;
  features: any;
  popular?: boolean;
  recommended?: boolean;
}

export default function DodoPayPricing() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const response = await fetch('/api/subscription/plans');
      const data = await response.json();
      if (data.success) {
        setPlans(data.plans);
      }
    } catch (error) {
      console.error('Failed to load plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    if (!user) {
      // Redirect to login
      window.location.href = '/login?callbackUrl=/pricing';
      return;
    }

    if (planId === 'free') {
      // Free plan - redirect to dashboard
      window.location.href = '/dashboard';
      return;
    }

    if (planId === 'enterprise-weekly') {
      // Enterprise plan - redirect to contact sales
      window.location.href = 'mailto:sales@recoder.xyz?subject=Enterprise Plan Inquiry&body=I am interested in the Enterprise weekly plan ($10/week). Please contact me to discuss custom requirements.';
      return;
    }

    setCreating(planId);

    try {
      // For demo, using mock billing data
      const billingData = {
        street: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        zipcode: '94102',
        country: 'US'
      };

      const response = await fetch('/api/subscription/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId,
          billing: billingData,
          customer: {
            phoneNumber: '' // Optional
          }
        }),
      });

      const data = await response.json();

      if (data.success && data.paymentLink) {
        // Redirect to Dodo Pay checkout
        window.location.href = data.paymentLink;
      } else {
        throw new Error(data.error || 'Failed to create subscription');
      }
    } catch (error) {
      console.error('Subscription error:', error);
      alert('Failed to create subscription. Please try again.');
    } finally {
      setCreating(null);
    }
  };

  const getPlanIcon = (planName: string) => {
    switch (planName) {
      case 'FREE':
        return <Sparkles className="w-6 h-6 text-gray-600" />;
      case 'PREMIUM':
        return <Zap className="w-6 h-6 text-blue-600" />;
      case 'EXTRA PREMIUM':
        return <Shield className="w-6 h-6 text-purple-600" />;
      case 'ENTERPRISE':
        return <Shield className="w-6 h-6 text-green-600" />;
      default:
        return null;
    }
  };

  const formatFeatureValue = (value: number | string) => {
    if (value === 'unlimited') return 'Unlimited';
    if (typeof value === 'number' && value >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toString();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="py-16 bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Choose Your AI Development Plan
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Start free, scale with confidence. Get real, production-ready code with multi-AI intelligence.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl shadow-lg border-2 p-8 ${
                plan.popular
                  ? 'border-blue-500 bg-white ring-2 ring-blue-500 ring-opacity-20'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="inline-flex items-center px-4 py-1 rounded-full text-sm font-medium bg-blue-600 text-white">
                    <Star className="w-4 h-4 mr-1" />
                    Most Popular
                  </span>
                </div>
              )}

              {/* Plan Header */}
              <div className="text-center mb-8">
                <div className="flex items-center justify-center mb-4">
                  {getPlanIcon(plan.name)}
                  <h3 className="text-2xl font-bold text-gray-900 ml-2">
                    {plan.name}
                  </h3>
                </div>
                
                <div className="mb-4">
                  <span className="text-5xl font-bold text-gray-900">
                    {plan.price === 0 ? 'Free' : `$${plan.price}`}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-gray-600 ml-2">/{plan.interval}</span>
                  )}
                </div>

                <p className="text-gray-600">
                  {plan.name === 'FREE' && 'Try all AI models for free'}
                  {plan.name === 'PREMIUM' && 'Full access to Claude + open source models'}
                  {plan.name === 'EXTRA PREMIUM' && 'High-volume usage with priority support'}
                  {plan.name === 'ENTERPRISE' && 'Custom solutions - contact sales'}
                </p>
              </div>

              {/* Features */}
              <div className="mb-8">
                <ul className="space-y-3">
                  <li className="flex items-center">
                    <Check className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-gray-700">
                      {formatFeatureValue(plan.features.cliRequests)} CLI requests
                    </span>
                  </li>
                  <li className="flex items-center">
                    <Check className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-gray-700">
                      {formatFeatureValue(plan.features.webProjects)} web projects
                    </span>
                  </li>
                  <li className="flex items-center">
                    <Check className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-gray-700">
                      {formatFeatureValue(plan.features.chatMessages)} chat messages/day
                    </span>
                  </li>
                  <li className="flex items-center">
                    <Check className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-gray-700">
                      {formatFeatureValue(plan.features.extensionSuggestions)} VS Code suggestions/day
                    </span>
                  </li>
                  <li className="flex items-center">
                    <Check className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-gray-700">
                      {plan.features.storage} storage
                    </span>
                  </li>
                  <li className="flex items-center">
                    <Check className="w-5 h-5 text-green-600 mr-3" />
                    <span className="text-gray-700">
                      {plan.features.support === 'community' && 'Community support'}
                      {plan.features.support === 'email' && 'Email support'}
                      {plan.features.support === 'priority' && 'Priority support'}
                    </span>
                  </li>
                  {plan.name !== 'FREE' && (
                    <>
                      <li className="flex items-center">
                        <Check className="w-5 h-5 text-green-600 mr-3" />
                        <span className="text-gray-700">Access to Claude Sonnet 4</span>
                      </li>
                      <li className="flex items-center">
                        <Check className="w-5 h-5 text-green-600 mr-3" />
                        <span className="text-gray-700">Open source models (Qwen, Llama, etc.)</span>
                      </li>
                      <li className="flex items-center">
                        <Check className="w-5 h-5 text-green-600 mr-3" />
                        <span className="text-gray-700">Priority processing</span>
                      </li>
                    </>
                  )}
                  {plan.name === 'EXTRA PREMIUM' && (
                    <>
                      <li className="flex items-center">
                        <Check className="w-5 h-5 text-green-600 mr-3" />
                        <span className="text-gray-700">Advanced model access</span>
                      </li>
                      <li className="flex items-center">
                        <Check className="w-5 h-5 text-green-600 mr-3" />
                        <span className="text-gray-700">Higher rate limits</span>
                      </li>
                    </>
                  )}
                  {plan.name === 'ENTERPRISE' && (
                    <>
                      <li className="flex items-center">
                        <Check className="w-5 h-5 text-green-600 mr-3" />
                        <span className="text-gray-700">Team collaboration</span>
                      </li>
                      <li className="flex items-center">
                        <Check className="w-5 h-5 text-green-600 mr-3" />
                        <span className="text-gray-700">Advanced analytics</span>
                      </li>
                      <li className="flex items-center">
                        <Check className="w-5 h-5 text-green-600 mr-3" />
                        <span className="text-gray-700">Custom integrations</span>
                      </li>
                      <li className="flex items-center">
                        <Check className="w-5 h-5 text-green-600 mr-3" />
                        <span className="text-gray-700">Dedicated support</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>

              {/* CTA Button */}
              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={creating === plan.id}
                className={`w-full py-3 px-6 rounded-lg font-medium transition-all ${
                  plan.popular
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                } ${
                  creating === plan.id ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {creating === plan.id ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Creating...
                  </div>
                ) : (
                  <>
                    {plan.id === 'free' ? 'Get Started Free' : 
                     plan.id === 'enterprise-weekly' ? 'Contact Sales' : 
                     `Subscribe to ${plan.name}`}
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-16">
          <p className="text-gray-600 mb-4">
            All paid plans include access to Claude Sonnet 4, Groq, Gemini, OpenAI, Qwen, Llama, and 20+ open source models
          </p>
          <p className="text-sm text-gray-500">
            Enterprise solutions or custom requirements?{' '}
            <a href="mailto:sales@recoder.xyz" className="text-blue-600 hover:text-blue-700">
              Contact our sales team
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}