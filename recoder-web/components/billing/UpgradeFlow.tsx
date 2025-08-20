/**
 * Upgrade Flow Component
 * Handles the upgrade process with contextual information from CLI
 * Provides plan comparison, pricing, and DODO Pay integration
 */
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Zap, Shield, Users, TrendingUp, Clock, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface UpgradeFlowProps {
  userId: string;
  currentPlan: string;
  recommendedPlan: string;
  source: string;
  context: {
    title: string;
    description: string;
    urgency: 'low' | 'medium' | 'high';
    primaryCTA: string;
  };
  returnTo?: string;
  focus?: 'quota' | 'features' | 'ai_models';
}

interface PlanDetails {
  name: string;
  price: number;
  requests_per_month: number;
  models: string[];
  features: string[];
  savings_per_month?: number;
  api_cost_equivalent?: number;
  color: string;
  icon: React.ReactNode;
}

const PLAN_DETAILS: Record<string, PlanDetails> = {
  pro: {
    name: 'Pro',
    price: 2000, // $20.00
    requests_per_month: 5000,
    models: ['GPT-4o', 'Claude Sonnet', 'Gemini Pro', 'All models'],
    features: [
      '5,000 requests per month',
      'All premium AI models',
      'Priority support',
      'Advanced code reviews',
      'Cost optimization',
      'Private templates'
    ],
    savings_per_month: 98, // $98 saved vs individual API
    api_cost_equivalent: 118,
    color: 'blue',
    icon: <Zap className="h-6 w-6" />
  },
  team: {
    name: 'Team',
    price: 5000, // $50.00
    requests_per_month: 15000,
    models: ['All models', 'Priority access', 'Beta features'],
    features: [
      '15,000 requests per month',
      'Team collaboration',
      'Advanced analytics',
      'Custom models',
      'SSO integration',
      'Dedicated support'
    ],
    savings_per_month: 235, // $235 saved vs individual API
    api_cost_equivalent: 285,
    color: 'purple',
    icon: <Users className="h-6 w-6" />
  },
  enterprise: {
    name: 'Enterprise',
    price: 20000, // $200.00
    requests_per_month: -1, // unlimited
    models: ['All models', 'Custom fine-tuning', 'On-premise'],
    features: [
      'Unlimited requests',
      'Custom deployment',
      '24/7 white-glove support',
      'SLA guarantees',
      'Custom integrations',
      'Dedicated account manager'
    ],
    savings_per_month: 800, // $800+ saved vs individual API
    api_cost_equivalent: 1000,
    color: 'gold',
    icon: <Shield className="h-6 w-6" />
  }
};

export default function UpgradeFlow({ 
  userId, 
  currentPlan, 
  recommendedPlan, 
  source, 
  context, 
  returnTo,
  focus 
}: UpgradeFlowProps) {
  const [selectedPlan, setSelectedPlan] = useState(recommendedPlan);
  const [loading, setLoading] = useState(false);
  const [currentUsage, setCurrentUsage] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    fetchCurrentUsage();
  }, [userId]);

  const fetchCurrentUsage = async () => {
    try {
      const response = await fetch(`/api/billing/user/${userId}/usage`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentUsage(data);
      }
    } catch (error) {
      console.error('Failed to fetch usage data:', error);
    }
  };

  const handleUpgrade = async (planId: string) => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          userId,
          plan: planId,
          source: source,
          return_url: `${window.location.origin}/billing?upgraded=true&return_to=${returnTo || 'web'}`,
          cancel_url: window.location.href,
          metadata: {
            upgrade_context: context.title,
            cli_source: source === 'cli',
            original_plan: currentPlan
          }
        })
      });

      if (response.ok) {
        const { checkout_url } = await response.json();
        // Redirect to Stripe Checkout
        window.location.href = checkout_url;
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (error) {
      console.error('Upgrade failed:', error);
      setLoading(false);
      // Show error message
    }
  };

  const getUsageProjection = (planRequests: number) => {
    if (!currentUsage || planRequests === -1) return null;
    
    const currentUsagePercent = (currentUsage.current_period_usage / currentUsage.limit) * 100;
    const projectedUsagePercent = (currentUsage.current_period_usage / planRequests) * 100;
    
    return {
      current: currentUsagePercent,
      projected: Math.min(projectedUsagePercent, 100)
    };
  };

  const planOrder = ['pro', 'team', 'enterprise'];
  const availablePlans = planOrder.filter(plan => plan !== currentPlan.toLowerCase());

  return (
    <div className="space-y-8">
      {/* Current Usage Overview */}
      {currentUsage && source === 'cli' && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-orange-900">Current Usage</h3>
                <p className="text-orange-700">
                  {currentUsage.current_period_usage.toLocaleString()} / {currentUsage.limit.toLocaleString()} requests used this month
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-orange-900">
                  {Math.round((currentUsage.current_period_usage / currentUsage.limit) * 100)}%
                </div>
                <div className="text-sm text-orange-700">of quota used</div>
              </div>
            </div>
            <Progress 
              value={(currentUsage.current_period_usage / currentUsage.limit) * 100} 
              className="h-2"
            />
          </CardContent>
        </Card>
      )}

      {/* Plan Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {availablePlans.map((planId) => {
          const plan = PLAN_DETAILS[planId];
          const isRecommended = planId === recommendedPlan;
          const isSelected = planId === selectedPlan;
          const usageProjection = getUsageProjection(plan.requests_per_month);

          return (
            <Card 
              key={planId}
              className={`relative cursor-pointer transition-all duration-200 ${
                isRecommended ? 'border-blue-500 shadow-lg ring-2 ring-blue-200' : 
                isSelected ? 'border-gray-400 shadow-md' : 
                'border-gray-200 hover:border-gray-300 hover:shadow-md'
              }`}
              onClick={() => setSelectedPlan(planId)}
            >
              {isRecommended && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-blue-500 text-white px-3 py-1">
                    <Star className="w-3 h-3 mr-1" />
                    Recommended
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pb-4">
                <div className="flex items-center justify-center mb-3">
                  <div className={`p-3 rounded-lg bg-${plan.color}-100`}>
                    {plan.icon}
                  </div>
                </div>
                
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                
                <div className="space-y-2">
                  <div className="text-4xl font-bold">
                    ${plan.price / 100}
                    <span className="text-lg font-normal text-gray-600">/month</span>
                  </div>
                  
                  {plan.savings_per_month && (
                    <div className="text-sm text-green-600 font-medium">
                      Save ${plan.savings_per_month}/month vs direct API usage
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Request Quota */}
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-xl font-bold text-gray-900">
                    {plan.requests_per_month === -1 ? 'Unlimited' : plan.requests_per_month.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600">requests per month</div>
                  
                  {usageProjection && plan.requests_per_month > 0 && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 mb-1">
                        Your usage would be {usageProjection.projected.toFixed(1)}%
                      </div>
                      <Progress value={usageProjection.projected} className="h-1" />
                    </div>
                  )}
                </div>

                {/* Features List */}
                <ul className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start text-sm">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Cost Analysis */}
                {plan.api_cost_equivalent && (
                  <div className="pt-4 border-t border-gray-200">
                    <div className="text-xs text-gray-600 mb-2">Cost Analysis</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-gray-500">Direct API Cost</div>
                        <div className="font-semibold text-red-600">${plan.api_cost_equivalent}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Recoder Plan</div>
                        <div className="font-semibold text-green-600">${plan.price / 100}</div>
                      </div>
                    </div>
                  </div>
                )}

                <Button 
                  onClick={() => handleUpgrade(planId)}
                  disabled={loading}
                  className={`w-full mt-4 ${
                    isRecommended ? 'bg-blue-600 hover:bg-blue-700' : ''
                  }`}
                  size="lg"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      {context.primaryCTA} - ${plan.price / 100}/mo
                    </>
                  )}
                </Button>

                {isRecommended && (
                  <div className="text-center">
                    <div className="text-xs text-blue-600 font-medium">
                      Perfect for your current usage pattern
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Value Proposition */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div>
              <TrendingUp className="mx-auto h-8 w-8 text-blue-600 mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">Smart Cost Optimization</h3>
              <p className="text-sm text-gray-600">
                Our AI routing saves you 50-78% on API costs through intelligent model selection
              </p>
            </div>
            <div>
              <Clock className="mx-auto h-8 w-8 text-purple-600 mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">Instant Activation</h3>
              <p className="text-sm text-gray-600">
                Upgrade takes effect immediately across CLI, web, and router platforms
              </p>
            </div>
            <div>
              <Shield className="mx-auto h-8 w-8 text-green-600 mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">No Lock-in</h3>
              <p className="text-sm text-gray-600">
                Cancel anytime, downgrade, or upgrade as your needs change
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CLI Return Instructions */}
      {source === 'cli' && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <CheckCircle className="h-5 w-5 text-green-600 mt-1" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800 mb-1">
                  After Upgrade Completion
                </h3>
                <div className="text-sm text-green-700 space-y-1">
                  <p>• Your CLI session will automatically detect the upgrade</p>
                  <p>• New quota and features will be available immediately</p>
                  <p>• You can return to your terminal and continue working</p>
                  <p>• Run <code className="bg-green-100 px-1 rounded">recoder auth status</code> to verify your new plan</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}