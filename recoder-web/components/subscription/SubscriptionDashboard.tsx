// Subscription Management Dashboard
// Displays current subscription status and usage

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  CreditCard, 
  Calendar, 
  TrendingUp, 
  Zap, 
  Crown, 
  AlertCircle, 
  CheckCircle,
  Settings,
  Download
} from 'lucide-react';
import { useRouter } from 'next/router';
import { toast } from 'sonner';

interface Subscription {
  id: string;
  planId: string;
  planName: string;
  status: string;
  amount: number;
  currency: string;
  nextBillingDate: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

interface Usage {
  tokensUsed: number;
  requestsMade: number;
  periodStart: string;
  periodEnd: string;
  pricing: {
    basePrice: number;
    overage: number;
    total: number;
  };
}

const SubscriptionDashboard: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    try {
      const response = await fetch('/api/subscriptions');
      const data = await response.json();
      
      if (data.success) {
        setSubscriptions(data.subscriptions);
        
        // Fetch usage for active subscription
        const activeSubscription = data.subscriptions.find((sub: Subscription) => sub.status === 'active');
        if (activeSubscription) {
          await fetchUsage(activeSubscription.id);
        }
      } else {
        toast.error('Failed to load subscriptions');
      }
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      toast.error('Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsage = async (subscriptionId: string) => {
    try {
      const response = await fetch(`/api/subscriptions/${subscriptionId}/usage`);
      const data = await response.json();
      
      if (data.success) {
        setUsage(data.usage);
      }
    } catch (error) {
      console.error('Error fetching usage:', error);
    }
  };

  const handleCancelSubscription = async (subscriptionId: string) => {
    if (!confirm('Are you sure you want to cancel your subscription? You can continue using the service until the end of your current billing period.')) {
      return;
    }

    setActionLoading('cancel');
    
    try {
      const response = await fetch(`/api/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelAtPeriodEnd: true })
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('Subscription cancelled successfully');
        fetchSubscriptions();
      } else {
        toast.error(data.error || 'Failed to cancel subscription');
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      toast.error('Failed to cancel subscription');
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangePlan = (subscriptionId: string) => {
    router.push(`/subscription/change-plan?subscription=${subscriptionId}`);
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      active: <Badge className="bg-green-100 text-green-800">Active</Badge>,
      pending: <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>,
      cancelled: <Badge className="bg-red-100 text-red-800">Cancelled</Badge>,
      cancelled_at_period_end: <Badge className="bg-orange-100 text-orange-800">Cancelling</Badge>,
      expired: <Badge className="bg-gray-100 text-gray-800">Expired</Badge>,
      failed: <Badge className="bg-red-100 text-red-800">Failed</Badge>
    };
    
    return badges[status as keyof typeof badges] || <Badge variant="secondary">{status}</Badge>;
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'weekly':
        return <Zap className="h-5 w-5 text-blue-500" />;
      case 'monthly':
        return <CreditCard className="h-5 w-5 text-purple-500" />;
      case 'enterprise':
        return <Crown className="h-5 w-5 text-yellow-500" />;
      default:
        return <CreditCard className="h-5 w-5 text-gray-500" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount / 100);
  };

  const getUsageLimits = (planId: string) => {
    const limits = {
      weekly: { tokens: 500000, requests: 5000 },
      monthly: { tokens: 2500000, requests: 25000 },
      enterprise: { tokens: 20000000, requests: 200000 }
    };
    
    return limits[planId as keyof typeof limits] || limits.monthly;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const activeSubscription = subscriptions.find(sub => sub.status === 'active' || sub.status === 'cancelled_at_period_end');

  return (
    <div className="space-y-6">
      {/* Current Subscription */}
      {activeSubscription ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {getPlanIcon(activeSubscription.planId)}
                <div>
                  <CardTitle>{activeSubscription.planName}</CardTitle>
                  <CardDescription>
                    {formatCurrency(activeSubscription.amount)} per {activeSubscription.planId === 'weekly' ? 'week' : 'month'}
                  </CardDescription>
                </div>
              </div>
              {getStatusBadge(activeSubscription.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center space-x-3">
                <Calendar className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">Next Billing</p>
                  <p className="text-sm text-gray-600">
                    {formatDate(activeSubscription.nextBillingDate)}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium">Status</p>
                  <p className="text-sm text-gray-600">
                    {activeSubscription.status === 'cancelled_at_period_end' 
                      ? 'Active until next billing' 
                      : 'Active'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">Since</p>
                  <p className="text-sm text-gray-600">
                    {formatDate(activeSubscription.createdAt)}
                  </p>
                </div>
              </div>
            </div>

            {activeSubscription.status === 'cancelled_at_period_end' && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="h-5 w-5 text-orange-500" />
                  <p className="text-sm font-medium text-orange-800">
                    Subscription Cancelled
                  </p>
                </div>
                <p className="text-sm text-orange-700 mt-1">
                  Your subscription will end on {formatDate(activeSubscription.nextBillingDate)}. 
                  You can continue using all features until then.
                </p>
              </div>
            )}

            <div className="flex space-x-3">
              {activeSubscription.status !== 'cancelled_at_period_end' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleChangePlan(activeSubscription.id)}
                    className="flex items-center space-x-2"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Change Plan</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => handleCancelSubscription(activeSubscription.id)}
                    disabled={actionLoading === 'cancel'}
                    className="flex items-center space-x-2"
                  >
                    {actionLoading === 'cancel' ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                        <span>Cancelling...</span>
                      </>
                    ) : (
                      <span>Cancel Subscription</span>
                    )}
                  </Button>
                </>
              )}
              
              <Button
                variant="outline"
                onClick={() => router.push('/subscription/billing')}
                className="flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>Billing History</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold">No Active Subscription</h3>
                <p className="text-gray-600">
                  You're currently on the free plan. Upgrade to unlock more features.
                </p>
              </div>
              <Button onClick={() => router.push('/pricing')}>
                View Pricing Plans
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage Statistics */}
      {usage && activeSubscription && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Current Usage</span>
            </CardTitle>
            <CardDescription>
              Usage for current billing period ({formatDate(usage.periodStart)} - {formatDate(usage.periodEnd)})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Tokens Usage */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">AI Tokens Used</span>
                  <span className="text-sm text-gray-600">
                    {usage.tokensUsed.toLocaleString()} / {getUsageLimits(activeSubscription.planId).tokens.toLocaleString()}
                  </span>
                </div>
                <Progress 
                  value={(usage.tokensUsed / getUsageLimits(activeSubscription.planId).tokens) * 100} 
                  className="h-2"
                />
              </div>

              {/* Requests Usage */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">API Requests</span>
                  <span className="text-sm text-gray-600">
                    {usage.requestsMade.toLocaleString()} / {getUsageLimits(activeSubscription.planId).requests.toLocaleString()}
                  </span>
                </div>
                <Progress 
                  value={(usage.requestsMade / getUsageLimits(activeSubscription.planId).requests) * 100} 
                  className="h-2"
                />
              </div>
            </div>

            {/* Overage Charges */}
            {usage.pricing.overage > 0 && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                  <p className="text-sm font-medium text-yellow-800">
                    Usage Overage
                  </p>
                </div>
                <p className="text-sm text-yellow-700 mt-1">
                  You have exceeded your plan limits. Additional charges: {formatCurrency(usage.pricing.overage)}
                </p>
                <div className="mt-2 text-xs text-yellow-600">
                  Base Plan: {formatCurrency(usage.pricing.basePrice)} + Overage: {formatCurrency(usage.pricing.overage)} = Total: {formatCurrency(usage.pricing.total)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Subscription History */}
      {subscriptions.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Subscription History</CardTitle>
            <CardDescription>
              Your previous subscriptions and payments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {subscriptions.map((subscription) => (
                <div key={subscription.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    {getPlanIcon(subscription.planId)}
                    <div>
                      <p className="font-medium">{subscription.planName}</p>
                      <p className="text-sm text-gray-600">
                        Started {formatDate(subscription.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(subscription.status)}
                    <p className="text-sm text-gray-600 mt-1">
                      {formatCurrency(subscription.amount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SubscriptionDashboard;