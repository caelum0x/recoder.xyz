'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CreditCard, Settings, BarChart3, AlertCircle, Calendar, DollarSign } from 'lucide-react';
import { usePaymentStore, formatCurrency } from '@/lib/payment-service';
import SubscriptionCard from './SubscriptionCard';
import UsageDashboard from './UsageDashboard';
import { cn } from '@/lib/utils';

interface SubscriptionManagerProps {
  className?: string;
  defaultTab?: 'overview' | 'plans' | 'usage' | 'billing';
}

export default function SubscriptionManager({ 
  className, 
  defaultTab = 'overview' 
}: SubscriptionManagerProps) {
  const { 
    plans, 
    subscriptions, 
    usageStats,
    isLoading, 
    error, 
    fetchPlans, 
    fetchSubscriptions, 
    createPaymentLink,
    refreshData 
  } = usePaymentStore();
  
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleSubscribe = async (planId: string) => {
    try {
      setSubscribing(planId);
      const paymentLink = await createPaymentLink(planId);
      
      // Open payment link in new window
      window.open(paymentLink.payment_link, '_blank', 'width=600,height=800,scrollbars=yes');
    } catch (error) {
      console.error('Subscription failed:', error);
    } finally {
      setSubscribing(null);
    }
  };

  const currentSubscription = subscriptions.find(sub => sub.status === 'active');
  const hasActiveSubscription = !!currentSubscription;

  if (isLoading && !plans.length) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('w-full max-w-6xl mx-auto', className)}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 bg-gray-100">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Plans
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-2">
            <Settings className="h-4 w-4" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Billing
          </TabsTrigger>
        </TabsList>

        {/* Error Display */}
        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-600">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Current Subscription Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Subscription Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {hasActiveSubscription ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{currentSubscription.plan_name}</span>
                      <Badge className="bg-green-100 text-green-800">Active</Badge>
                    </div>
                    <div className="text-sm text-gray-600">
                      <div className="flex justify-between">
                        <span>Amount:</span>
                        <span className="font-medium">{formatCurrency(currentSubscription.amount / 100)}/month</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Next billing:</span>
                        <span>{currentSubscription.next_billing_date ? new Date(currentSubscription.next_billing_date).toLocaleDateString() : 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="text-gray-500 mb-4">No active subscription</div>
                    <Button onClick={() => setActiveTab('plans')}>
                      Choose a Plan
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Usage Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Usage Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                {usageStats ? (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span>Tokens used:</span>
                      <span className="font-medium">
                        {usageStats.usage.tokens.toLocaleString()} / {usageStats.limits.tokens.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Requests made:</span>
                      <span className="font-medium">
                        {usageStats.usage.requests.toLocaleString()} / {usageStats.limits.requests.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Monthly cost:</span>
                      <span className="font-medium">{formatCurrency(usageStats.cost.monthly / 100)}</span>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setActiveTab('usage')}
                      className="w-full"
                    >
                      View Details
                    </Button>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-6">
                    No usage data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Plans Tab */}
        <TabsContent value="plans" className="space-y-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">Choose Your Recoder Plan</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Get access to cutting-edge AI development tools with multi-provider support, 
              real-time collaboration, and production-ready code generation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan, index) => (
              <SubscriptionCard
                key={plan.id}
                plan={plan}
                isCurrentPlan={currentSubscription?.plan_id === plan.id}
                isPopular={plan.id === 'recoder-monthly'}
                onSubscribe={handleSubscribe}
                className={subscribing === plan.id ? 'opacity-75' : ''}
              />
            ))}
          </div>

          {plans.length === 0 && !isLoading && (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-gray-500">No plans available at this time.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2">Usage Analytics</h2>
            <p className="text-gray-600">
              Monitor your AI usage, costs, and performance across all Recoder platforms.
            </p>
          </div>
          
          <UsageDashboard />
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="space-y-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2">Billing History</h2>
            <p className="text-gray-600">
              View your subscription details and payment history.
            </p>
          </div>

          {/* Subscription History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Subscription History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {subscriptions.length > 0 ? (
                <div className="space-y-4">
                  {subscriptions.map((subscription) => (
                    <div key={subscription.id} className="flex items-center justify-between py-3 border-b last:border-b-0">
                      <div>
                        <div className="font-medium">{subscription.plan_name}</div>
                        <div className="text-sm text-gray-500">
                          Created: {new Date(subscription.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatCurrency(subscription.amount / 100)}</div>
                        <Badge 
                          variant="outline"
                          className={cn(
                            subscription.status === 'active' 
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-gray-50 text-gray-700'
                          )}
                        >
                          {subscription.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No billing history available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}