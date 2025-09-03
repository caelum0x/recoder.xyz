// Subscription Pricing Plans Component
// Displays DODO Payments subscription options

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Sparkles, Crown, Zap } from 'lucide-react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

interface PricingPlan {
  id: string;
  name: string;
  price: number;
  priceFormatted: string;
  billingPeriod: string;
  description: string;
  features: string[];
  popular?: boolean;
  enterprise?: boolean;
}

interface PricingPlansProps {
  onPlanSelect?: (planId: string) => void;
  showFree?: boolean;
}

const PricingPlans: React.FC<PricingPlansProps> = ({ onPlanSelect, showFree = true }) => {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/subscriptions/plans');
      const data = await response.json();
      
      if (data.success) {
        setPlans(data.plans);
      } else {
        toast.error('Failed to load pricing plans');
      }
    } catch (error) {
      console.error('Error fetching plans:', error);
      toast.error('Failed to load pricing plans');
    } finally {
      setLoading(false);
    }
  };

  const handlePlanSelect = async (planId: string) => {
    if (!session) {
      router.push('/auth/signin?callbackUrl=' + encodeURIComponent('/pricing'));
      return;
    }

    if (onPlanSelect) {
      onPlanSelect(planId);
      return;
    }

    // Redirect to subscription flow
    router.push(`/subscription/checkout?plan=${planId}`);
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'weekly':
        return <Zap className="h-6 w-6 text-blue-500" />;
      case 'monthly':
        return <Sparkles className="h-6 w-6 text-purple-500" />;
      case 'enterprise':
        return <Crown className="h-6 w-6 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getPlanColor = (planId: string) => {
    switch (planId) {
      case 'weekly':
        return 'border-blue-200 hover:border-blue-300';
      case 'monthly':
        return 'border-purple-200 hover:border-purple-300 ring-2 ring-purple-100';
      case 'enterprise':
        return 'border-yellow-200 hover:border-yellow-300';
      default:
        return 'border-gray-200 hover:border-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="h-4 bg-gray-200 rounded"></div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Free Plan */}
      {showFree && (
        <Card className="mb-6 border-green-200 hover:border-green-300">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <CheckCircle className="h-6 w-6 text-green-500" />
                <div>
                  <CardTitle className="text-xl">Free Plan</CardTitle>
                  <CardDescription>Perfect for trying out Recoder.xyz</CardDescription>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold">$0</div>
                <div className="text-sm text-gray-500">Forever</div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              <li className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>5 AI code generations per day</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Basic AI models (Groq)</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Community support</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Web platform access</span>
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => router.push('/dashboard')}
            >
              Get Started Free
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Paid Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <Card 
            key={plan.id} 
            className={`relative ${getPlanColor(plan.id)} transition-all duration-200 hover:shadow-lg`}
          >
            {plan.id === 'monthly' && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-purple-500 text-white">Most Popular</Badge>
              </div>
            )}
            
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getPlanIcon(plan.id)}
                  <div>
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                  </div>
                </div>
              </div>
              <div className="text-center pt-4">
                <div className="text-4xl font-bold">{plan.priceFormatted}</div>
                <div className="text-sm text-gray-500">per {plan.billingPeriod.toLowerCase()}</div>
              </div>
            </CardHeader>

            <CardContent>
              <ul className="space-y-3">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter>
              <Button
                className={`w-full ${
                  plan.id === 'monthly' 
                    ? 'bg-purple-600 hover:bg-purple-700' 
                    : plan.id === 'enterprise'
                    ? 'bg-yellow-600 hover:bg-yellow-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
                onClick={() => handlePlanSelect(plan.id)}
                disabled={subscribing === plan.id}
              >
                {subscribing === plan.id ? 'Processing...' : 'Choose Plan'}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Enterprise Contact */}
      <div className="mt-8 text-center">
        <Card className="border-dashed border-2 border-gray-300">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <Crown className="h-12 w-12 text-yellow-500" />
              <div>
                <h3 className="text-xl font-semibold">Need Something Custom?</h3>
                <p className="text-gray-600 mt-1">
                  Contact us for enterprise solutions, white-label options, or custom pricing.
                </p>
              </div>
              <Button 
                variant="outline"
                onClick={() => router.push('/contact')}
              >
                Contact Sales
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Features Comparison */}
      <div className="mt-12">
        <h3 className="text-2xl font-bold text-center mb-8">Feature Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 p-4 text-left">Feature</th>
                <th className="border border-gray-200 p-4 text-center">Free</th>
                <th className="border border-gray-200 p-4 text-center">Weekly</th>
                <th className="border border-gray-200 p-4 text-center">Monthly</th>
                <th className="border border-gray-200 p-4 text-center">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 p-4">AI Tokens</td>
                <td className="border border-gray-200 p-4 text-center">5k/day</td>
                <td className="border border-gray-200 p-4 text-center">500k/week</td>
                <td className="border border-gray-200 p-4 text-center">2.5M/month</td>
                <td className="border border-gray-200 p-4 text-center">20M/month</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 p-4">API Requests</td>
                <td className="border border-gray-200 p-4 text-center">100/day</td>
                <td className="border border-gray-200 p-4 text-center">5k/week</td>
                <td className="border border-gray-200 p-4 text-center">25k/month</td>
                <td className="border border-gray-200 p-4 text-center">200k/month</td>
              </tr>
              <tr>
                <td className="border border-gray-200 p-4">AI Providers</td>
                <td className="border border-gray-200 p-4 text-center">Groq</td>
                <td className="border border-gray-200 p-4 text-center">Claude, Groq, Gemini</td>
                <td className="border border-gray-200 p-4 text-center">Claude, Groq, Gemini</td>
                <td className="border border-gray-200 p-4 text-center">All Providers</td>
              </tr>
              <tr>
                <td className="border border-gray-200 p-4">Real-time Collaboration</td>
                <td className="border border-gray-200 p-4 text-center">❌</td>
                <td className="border border-gray-200 p-4 text-center">✅</td>
                <td className="border border-gray-200 p-4 text-center">✅</td>
                <td className="border border-gray-200 p-4 text-center">✅</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 p-4">Priority Support</td>
                <td className="border border-gray-200 p-4 text-center">❌</td>
                <td className="border border-gray-200 p-4 text-center">❌</td>
                <td className="border border-gray-200 p-4 text-center">✅</td>
                <td className="border border-gray-200 p-4 text-center">✅</td>
              </tr>
              <tr>
                <td className="border border-gray-200 p-4">Usage Analytics</td>
                <td className="border border-gray-200 p-4 text-center">❌</td>
                <td className="border border-gray-200 p-4 text-center">❌</td>
                <td className="border border-gray-200 p-4 text-center">✅</td>
                <td className="border border-gray-200 p-4 text-center">✅</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 p-4">White-label Solutions</td>
                <td className="border border-gray-200 p-4 text-center">❌</td>
                <td className="border border-gray-200 p-4 text-center">❌</td>
                <td className="border border-gray-200 p-4 text-center">❌</td>
                <td className="border border-gray-200 p-4 text-center">✅</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PricingPlans;