'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertTriangle, 
  CreditCard, 
  Zap, 
  TrendingUp,
  DollarSign,
  Clock,
  Crown,
  CheckCircle
} from 'lucide-react';
import { usePaymentStore, formatTokenCount, formatCurrency, calculateUsagePercentage } from '@/lib/payment-service';

interface OverageData {
  hasOverage: boolean;
  overageAmount: number;
  overage: {
    tokens: number;
    cost: number;
    requests: number;
  };
  projectedBill: number;
  daysUntilBilling: number;
  recommendations: Array<{
    type: 'upgrade' | 'optimize' | 'alert';
    title: string;
    description: string;
    action?: string;
    planId?: string;
  }>;
}

export default function OverageBilling() {
  const [overageData, setOverageData] = useState<OverageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpgrading, setIsUpgrading] = useState<string | null>(null);
  
  const { 
    usageStats, 
    subscriptions, 
    plans, 
    fetchUsageStats, 
    createPaymentLink,
    refreshData 
  } = usePaymentStore();

  useEffect(() => {
    loadOverageData();
  }, [usageStats]);

  const loadOverageData = async () => {
    try {
      setIsLoading(true);
      
      if (!usageStats) {
        await fetchUsageStats();
        return;
      }

      const currentPlan = subscriptions[0]?.plan_name || 'Free';
      const tokensUsed = usageStats.usage.tokens;
      const tokensLimit = usageStats.limits.tokens;
      const costUsed = usageStats.cost.monthly;
      const costLimit = usageStats.cost.limit;

      // Calculate overage
      const tokenOverage = Math.max(0, tokensUsed - tokensLimit);
      const costOverage = Math.max(0, costUsed - costLimit);
      
      // Overage billing rates (per token/dollar over limit)
      const overageRates = {
        tokens: 0.00002, // $0.00002 per token overage
        cost: 1.5 // 1.5x markup on cost overage
      };

      const overageAmount = (tokenOverage * overageRates.tokens) + (costOverage * overageRates.cost);
      const hasOverage = overageAmount > 0;

      // Project end-of-month bill
      const remainingDays = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate();
      const dailyUsage = tokensUsed / (30 - remainingDays || 1);
      const projectedMonthlyTokens = tokensUsed + (dailyUsage * remainingDays);
      const projectedOverage = Math.max(0, projectedMonthlyTokens - tokensLimit);
      const projectedBill = (subscriptions[0]?.amount || 0) + (projectedOverage * overageRates.tokens);

      // Generate recommendations
      const recommendations = [];
      
      if (projectedOverage > tokensLimit * 0.5) {
        recommendations.push({
          type: 'upgrade' as const,
          title: 'Upgrade Recommended',
          description: `You're projected to exceed your limit by ${formatTokenCount(projectedOverage)}. Upgrading could save you money.`,
          action: 'Upgrade Plan',
          planId: getRecommendedPlan(currentPlan)
        });
      }

      if (usageStats.usage.tokens > tokensLimit * 0.9) {
        recommendations.push({
          type: 'alert' as const,
          title: 'Approaching Limit',
          description: 'You\'ve used 90% of your monthly tokens. Consider optimizing usage or upgrading.',
          action: 'View Usage Details'
        });
      }

      if (hasOverage) {
        recommendations.push({
          type: 'alert' as const,
          title: 'Overage Charges Apply',
          description: `You have ${formatCurrency(overageAmount)} in overage charges this month.`,
          action: 'Pay Now'
        });
      }

      setOverageData({
        hasOverage,
        overageAmount,
        overage: {
          tokens: tokenOverage,
          cost: costOverage,
          requests: Math.max(0, usageStats.usage.requests - usageStats.limits.requests)
        },
        projectedBill,
        daysUntilBilling: remainingDays,
        recommendations
      });
    } catch (error) {
      console.error('Failed to load overage data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getRecommendedPlan = (currentPlan: string): string => {
    const planHierarchy = ['free', 'pro', 'enterprise'];
    const currentIndex = planHierarchy.indexOf(currentPlan.toLowerCase());
    return planHierarchy[Math.min(currentIndex + 1, planHierarchy.length - 1)] || 'pro';
  };

  const handleUpgrade = async (planId: string) => {
    try {
      setIsUpgrading(planId);
      const paymentLink = await createPaymentLink(planId);
      window.open(paymentLink.payment_link, '_blank', 'width=600,height=800,scrollbars=yes');
      
      setTimeout(() => {
        refreshData();
      }, 2000);
    } catch (error) {
      console.error('Upgrade failed:', error);
    } finally {
      setIsUpgrading(null);
    }
  };

  const handlePayOverage = async () => {
    if (!overageData?.overageAmount) return;
    
    try {
      // Create one-time payment for overage
      const response = await fetch('/api/billing/overage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: overageData.overageAmount,
          description: 'Overage charges for exceeding plan limits'
        })
      });
      
      const result = await response.json();
      if (result.success) {
        window.open(result.data.payment_link, '_blank', 'width=600,height=800,scrollbars=yes');
      }
    } catch (error) {
      console.error('Overage payment failed:', error);
    }
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!overageData) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Unable to load billing information. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  const currentPlan = subscriptions[0]?.plan_name || 'Free';
  const tokensUsed = usageStats?.usage.tokens || 0;
  const tokensLimit = usageStats?.limits.tokens || 10000;
  const tokensPercentage = calculateUsagePercentage(tokensUsed, tokensLimit);

  return (
    <div className="space-y-6">
      {/* Overage Alert */}
      {overageData.hasOverage && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <div className="flex items-center justify-between">
              <span>
                You have <strong>{formatCurrency(overageData.overageAmount)}</strong> in overage charges this month.
              </span>
              <Button 
                size="sm" 
                variant="destructive"
                onClick={handlePayOverage}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Pay Now
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Projected Bill Warning */}
      {overageData.projectedBill > (subscriptions[0]?.amount || 0) * 1.5 && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <TrendingUp className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <div className="flex items-center justify-between">
              <span>
                Your projected bill is <strong>{formatCurrency(overageData.projectedBill)}</strong> 
                — {((overageData.projectedBill / (subscriptions[0]?.amount || 1) - 1) * 100).toFixed(0)}% higher than your plan.
              </span>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => handleUpgrade(getRecommendedPlan(currentPlan))}
              >
                <Crown className="h-4 w-4 mr-2" />
                Upgrade to Save
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">
            <DollarSign className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="overage">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Overage Details
          </TabsTrigger>
          <TabsTrigger value="recommendations">
            <CheckCircle className="h-4 w-4 mr-2" />
            Recommendations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Current Bill
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency((subscriptions[0]?.amount || 0) + overageData.overageAmount)}
                </div>
                <p className="text-sm text-gray-600">
                  Plan: {formatCurrency(subscriptions[0]?.amount || 0)}
                  {overageData.overageAmount > 0 && (
                    <span className="text-red-600">
                      {' '}+ {formatCurrency(overageData.overageAmount)} overage
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Projected Bill
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(overageData.projectedBill)}
                </div>
                <p className="text-sm text-gray-600">
                  End of billing cycle
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Billing Cycle
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {overageData.daysUntilBilling}
                </div>
                <p className="text-sm text-gray-600">
                  days remaining
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Usage Progress */}
          <Card>
            <CardHeader>
              <CardTitle>Usage This Month</CardTitle>
              <CardDescription>
                {formatTokenCount(tokensUsed)} of {formatTokenCount(tokensLimit)} tokens used
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={tokensPercentage} className="mb-2" />
              <div className="flex justify-between text-sm text-gray-600">
                <span>{tokensPercentage.toFixed(1)}% used</span>
                <span>
                  {tokensPercentage > 100 ? (
                    <Badge variant="destructive">Over Limit</Badge>
                  ) : tokensPercentage > 90 ? (
                    <Badge variant="secondary">High Usage</Badge>
                  ) : (
                    <Badge variant="outline">Normal</Badge>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overage" className="space-y-4">
          {overageData.hasOverage ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Token Overage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {formatTokenCount(overageData.overage.tokens)}
                  </div>
                  <p className="text-sm text-gray-600">
                    {formatCurrency(overageData.overage.tokens * 0.00002)} charge
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Cost Overage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(overageData.overage.cost)}
                  </div>
                  <p className="text-sm text-gray-600">
                    50% markup applied
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Total Overage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(overageData.overageAmount)}
                  </div>
                  <Button 
                    size="sm" 
                    variant="destructive" 
                    className="mt-2"
                    onClick={handlePayOverage}
                  >
                    Pay Overage
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Overage Charges</h3>
                <p className="text-gray-600">
                  You're within your plan limits. Keep up the great usage management!
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          {overageData.recommendations.length > 0 ? (
            <div className="space-y-4">
              {overageData.recommendations.map((rec, index) => (
                <Card key={index} className={`border-l-4 ${
                  rec.type === 'upgrade' ? 'border-l-blue-500' :
                  rec.type === 'alert' ? 'border-l-yellow-500' :
                  'border-l-green-500'
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium mb-1">{rec.title}</h4>
                        <p className="text-sm text-gray-600">{rec.description}</p>
                      </div>
                      {rec.action && (
                        <Button 
                          size="sm"
                          variant={rec.type === 'upgrade' ? 'default' : 'outline'}
                          onClick={() => rec.planId ? handleUpgrade(rec.planId) : undefined}
                          disabled={isUpgrading === rec.planId}
                        >
                          {isUpgrading === rec.planId ? 'Processing...' : rec.action}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">All Good!</h3>
                <p className="text-gray-600">
                  No recommendations at this time. You're managing your usage well.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}