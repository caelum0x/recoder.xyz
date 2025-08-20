/**
 * Billing Dashboard Component
 * Main billing interface for CLI and web users
 * Handles subscription management, usage tracking, and upgrade flows
 */
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, CreditCard, TrendingUp, Zap, Shield, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

interface SubscriptionTier {
  name: string;
  price: number;
  requests_per_month: number;
  models: string[];
  support_level: string;
  features: string[];
  recommended?: boolean;
}

interface BillingData {
  subscription: {
    name: string;
    status: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
  };
  usage: {
    current_period_usage: number;
    limit: number;
    period_start: string;
    period_end: string;
    daily_average: number;
  };
  cost_analysis: {
    current_plan_cost: number;
    api_cost_equivalent: number;
    monthly_savings: number;
    savings_percentage: number;
  };
  platforms: {
    cli: { active: boolean; last_seen: string; version?: string };
    web: { active: boolean; last_seen: string };
    router: { active: boolean; last_seen: string; version?: string };
    extension: { active: boolean; last_seen: string };
  };
}

interface BillingDashboardProps {
  userId: string;
  source?: string; // 'cli', 'web', 'router', 'extension'
}

const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  free: {
    name: 'Free',
    price: 0,
    requests_per_month: 500,
    models: ['GPT-3.5-turbo', 'Claude Haiku', 'Gemini Flash'],
    support_level: 'Community',
    features: ['Basic code generation', 'Community support', 'Public templates']
  },
  pro: {
    name: 'Pro',
    price: 2000, // $20.00
    requests_per_month: 5000,
    models: ['All models', 'GPT-4o', 'Claude Sonnet', 'Gemini Pro'],
    support_level: 'Priority',
    features: ['Advanced AI models', 'Priority support', 'Private templates', 'Cost optimization'],
    recommended: true
  },
  team: {
    name: 'Team',
    price: 5000, // $50.00
    requests_per_month: 15000,
    models: ['All models', 'Priority access', 'Beta features'],
    support_level: 'Dedicated',
    features: ['Team collaboration', 'Advanced analytics', 'Custom models', 'SSO integration']
  },
  enterprise: {
    name: 'Enterprise',
    price: 20000, // $200.00
    requests_per_month: -1, // unlimited
    models: ['All models', 'Custom fine-tuning', 'On-premise deployment'],
    support_level: 'White-glove',
    features: ['Unlimited usage', 'Custom deployment', '24/7 support', 'SLA guarantees']
  }
};

export default function BillingDashboard({ userId, source = 'web' }: BillingDashboardProps) {
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Check for CLI upgrade context
  const reason = searchParams.get('reason');
  const recommendedPlan = searchParams.get('recommended');
  const currentUsage = searchParams.get('usage');
  const quotaLimit = searchParams.get('limit');

  useEffect(() => {
    fetchBillingData();
  }, [userId]);

  const fetchBillingData = async () => {
    try {
      const response = await fetch(`/api/billing/user/${userId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setBillingData(data);
      } else {
        setError('Failed to load billing data');
      }
    } catch (err) {
      setError('Network error loading billing data');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (targetPlan: string) => {
    setUpgrading(targetPlan);
    
    try {
      const response = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          userId,
          plan: targetPlan,
          source: source,
          return_url: `${window.location.origin}/billing?upgraded=true`,
          cancel_url: window.location.href
        })
      });

      if (response.ok) {
        const { checkout_url } = await response.json();
        window.location.href = checkout_url;
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (err) {
      setError('Failed to start upgrade process');
      setUpgrading(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You\'ll lose access to premium features at the end of your billing period.')) {
      return;
    }

    try {
      const response = await fetch('/api/billing/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        await fetchBillingData(); // Refresh data
      } else {
        throw new Error('Failed to cancel subscription');
      }
    } catch (err) {
      setError('Failed to cancel subscription');
    }
  };

  const getUsagePercentage = () => {
    if (!billingData?.usage) return 0;
    const { current_period_usage, limit } = billingData.usage;
    if (limit === -1) return 0; // Unlimited
    return Math.min((current_period_usage / limit) * 100, 100);
  };

  const getUsageColor = () => {
    const percentage = getUsagePercentage();
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-6">
          <div className="text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Billing Data</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={() => fetchBillingData()}>Try Again</Button>
          </div>
        </Card>
      </div>
    );
  }

  const currentTier = SUBSCRIPTION_TIERS[billingData?.subscription.name || 'free'];
  const usagePercentage = getUsagePercentage();

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header with CLI context */}
      {source === 'cli' && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center">
            <Zap className="h-5 w-5 text-blue-600 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-blue-800">
                Connected from Recoder CLI
              </h3>
              <p className="text-sm text-blue-600">
                {reason === 'quota_exceeded' && 'Your monthly quota has been exceeded. Upgrade to continue using the CLI.'}
                {reason === 'feature_limited' && 'This feature requires a paid plan. Upgrade to unlock premium capabilities.'}
                {reason === 'manual_upgrade' && 'Manage your subscription and unlock more powerful features.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Billing & Usage</h1>
        <p className="text-gray-600">Manage your subscription and monitor your AI usage across all platforms</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="usage">Usage & Analytics</TabsTrigger>
          <TabsTrigger value="plans">Plans & Pricing</TabsTrigger>
          <TabsTrigger value="platforms">Connected Platforms</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Current Plan Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center">
                    <CreditCard className="h-5 w-5 mr-2" />
                    Current Plan
                  </CardTitle>
                </div>
                <Badge variant={billingData?.subscription.status === 'active' ? 'default' : 'secondary'}>
                  {billingData?.subscription.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-1">
                    {currentTier.name} Plan
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {currentTier.price === 0 ? 'Free' : `$${currentTier.price / 100}/month`}
                  </p>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span>Requests per month</span>
                      <span className="font-medium">
                        {currentTier.requests_per_month === -1 ? 'Unlimited' : currentTier.requests_per_month.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>AI Models</span>
                      <span className="font-medium">
                        {currentTier.models[0]} {currentTier.models.length > 1 ? `+ ${currentTier.models.length - 1} more` : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Support Level</span>
                      <span className="font-medium">{currentTier.support_level}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-lg font-semibold mb-3">Usage This Period</h4>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Requests used</span>
                        <span className={getUsageColor()}>
                          {billingData?.usage.current_period_usage.toLocaleString()} / {
                            billingData?.usage.limit === -1 ? '∞' : billingData?.usage.limit.toLocaleString()
                          }
                        </span>
                      </div>
                      {billingData?.usage.limit !== -1 && (
                        <Progress value={usagePercentage} className="h-2" />
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div>
                        <p className="text-sm text-gray-600">Daily Average</p>
                        <p className="text-lg font-medium">{billingData?.usage.daily_average.toFixed(1)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Days Remaining</p>
                        <p className="text-lg font-medium">
                          {Math.ceil((new Date(billingData?.usage.period_end || '').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 mt-6 pt-6 border-t">
                {currentTier.name !== 'Enterprise' && (
                  <Button 
                    onClick={() => handleUpgrade(currentTier.name === 'Free' ? 'pro' : 'team')}
                    disabled={upgrading !== null}
                    className="flex items-center"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    {upgrading ? 'Processing...' : 'Upgrade Plan'}
                  </Button>
                )}
                
                {billingData?.subscription.name !== 'free' && (
                  <Button 
                    variant="outline" 
                    onClick={handleCancelSubscription}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Cancel Subscription
                  </Button>
                )}
                
                <Button variant="outline">
                  Download Invoice
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Cost Analysis Card */}
          {billingData?.cost_analysis && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Cost Analysis & Savings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Your Plan Cost</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ${billingData.cost_analysis.current_plan_cost.toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-500">per month</p>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Equivalent API Cost</p>
                    <p className="text-2xl font-bold text-red-600">
                      ${billingData.cost_analysis.api_cost_equivalent.toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-500">without optimization</p>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-1">Monthly Savings</p>
                    <p className="text-2xl font-bold text-green-600">
                      ${billingData.cost_analysis.monthly_savings.toFixed(2)}
                    </p>
                    <p className="text-sm text-green-600">
                      ({billingData.cost_analysis.savings_percentage.toFixed(1)}% saved)
                    </p>
                  </div>
                </div>
                
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center">
                    <Shield className="h-5 w-5 text-green-600 mr-2" />
                    <div>
                      <p className="text-sm font-medium text-green-800">
                        Smart Cost Optimization Active
                      </p>
                      <p className="text-sm text-green-600">
                        Our AI routing saves you an average of {billingData.cost_analysis.savings_percentage.toFixed(0)}% on API costs through intelligent model selection
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          {usagePercentage >= 80 && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
                  <div>
                    <h3 className="text-sm font-medium text-yellow-800 mb-1">
                      Approaching Usage Limit
                    </h3>
                    <p className="text-sm text-yellow-700 mb-3">
                      You've used {usagePercentage.toFixed(1)}% of your monthly quota. Consider upgrading to avoid service interruption.
                    </p>
                    <Button 
                      size="sm"
                      onClick={() => handleUpgrade(recommendedPlan || 'pro')}
                      className="bg-yellow-600 hover:bg-yellow-700"
                    >
                      Upgrade Now
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="usage">
          {/* Usage analytics content would go here */}
          <div className="text-center py-12">
            <TrendingUp className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Usage Analytics</h3>
            <p className="text-gray-600">Detailed usage analytics coming soon</p>
          </div>
        </TabsContent>

        <TabsContent value="plans">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Object.entries(SUBSCRIPTION_TIERS).map(([key, tier]) => (
              <Card key={key} className={`relative ${tier.recommended ? 'border-blue-500 shadow-lg' : ''}`}>
                {tier.recommended && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-blue-500">Recommended</Badge>
                  </div>
                )}
                
                <CardHeader className="text-center">
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  <div className="text-3xl font-bold">
                    {tier.price === 0 ? 'Free' : `$${tier.price / 100}`}
                    {tier.price > 0 && <span className="text-base font-normal text-gray-600">/month</span>}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <p className="text-lg font-semibold">
                      {tier.requests_per_month === -1 ? 'Unlimited' : tier.requests_per_month.toLocaleString()} requests
                    </p>
                    <p className="text-sm text-gray-600">per month</p>
                  </div>
                  
                  <ul className="space-y-2 text-sm">
                    {tier.features.map((feature, index) => (
                      <li key={index} className="flex items-start">
                        <div className="w-1 h-1 rounded-full bg-green-500 mt-2 mr-2 flex-shrink-0"></div>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  
                  <div className="pt-4">
                    {billingData?.subscription.name === key ? (
                      <Button disabled className="w-full">
                        Current Plan
                      </Button>
                    ) : (
                      <Button 
                        onClick={() => handleUpgrade(key)}
                        disabled={upgrading !== null}
                        className="w-full"
                        variant={tier.recommended ? 'default' : 'outline'}
                      >
                        {upgrading === key ? 'Processing...' : 
                         tier.price === 0 ? 'Downgrade' : 'Upgrade'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="platforms">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Connected Platforms
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {billingData?.platforms && Object.entries(billingData.platforms).map(([platform, data]) => (
                  <div key={platform} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full mr-3 ${data.active ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                      <div>
                        <h4 className="font-medium capitalize">{platform}</h4>
                        <p className="text-sm text-gray-600">
                          {data.active ? 'Active' : 'Inactive'}
                          {data.version && ` • v${data.version}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">
                        Last seen: {new Date(data.last_seen).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}