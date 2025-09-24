'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, TrendingUp, Zap, DollarSign, Clock, BarChart3 } from 'lucide-react';
import { usePaymentStore, UsageStats, formatTokenCount, formatCurrency, calculateUsagePercentage } from '@/lib/payment-service';
import { cn } from '@/lib/utils';

interface UsageDashboardProps {
  className?: string;
}

export default function UsageDashboard({ className }: UsageDashboardProps) {
  const { usageStats, isLoading, error, fetchUsageStats } = usePaymentStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchUsageStats();
  }, [fetchUsageStats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchUsageStats();
    setRefreshing(false);
  };

  if (isLoading && !usageStats) {
    return (
      <div className={cn('space-y-4', className)}>
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-2 bg-gray-200 rounded w-full"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className={cn('border-red-200', className)}>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-red-600 mb-4">Failed to load usage data</p>
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!usageStats) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center text-gray-500">
            <BarChart3 className="h-8 w-8 mx-auto mb-2" />
            <p>No usage data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const tokenUsagePercentage = calculateUsagePercentage(
    usageStats.usage.tokens, 
    usageStats.limits.tokens
  );
  
  const requestUsagePercentage = calculateUsagePercentage(
    usageStats.usage.requests, 
    usageStats.limits.requests
  );
  
  const costPercentage = calculateUsagePercentage(
    usageStats.cost.monthly, 
    usageStats.cost.limit
  );

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600 bg-red-50';
    if (percentage >= 75) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Warnings */}
      {(usageStats.warnings.high_usage || usageStats.warnings.high_cost || usageStats.warnings.approaching_limit) && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800 mb-1">Usage Warnings</p>
                <ul className="text-sm text-yellow-700 space-y-1">
                  {usageStats.warnings.approaching_limit && (
                    <li>• You're approaching your plan limits</li>
                  )}
                  {usageStats.warnings.high_usage && (
                    <li>• High usage detected this month</li>
                  )}
                  {usageStats.warnings.high_cost && (
                    <li>• Costs are higher than usual</li>
                  )}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Plan */}
      {usageStats.subscription && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Current Plan</CardTitle>
              <Badge 
                variant="outline"
                className={cn(
                  'capitalize',
                  usageStats.subscription.status === 'active' 
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-gray-50 text-gray-700'
                )}
              >
                {usageStats.subscription.status}
              </Badge>
            </div>
            <CardDescription>{usageStats.subscription.plan}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Token Usage */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">AI Token Usage</CardTitle>
            </div>
            <Badge className={getUsageColor(tokenUsagePercentage)}>
              {tokenUsagePercentage.toFixed(1)}%
            </Badge>
          </div>
          <CardDescription>
            {formatTokenCount(usageStats.usage.tokens)} of {formatTokenCount(usageStats.limits.tokens)} tokens used
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress 
            value={tokenUsagePercentage} 
            className="h-2"
            // className={getProgressColor(tokenUsagePercentage)}
          />
          <div className="flex justify-between text-sm text-gray-600 mt-2">
            <span>Models: {usageStats.usage.models_used.join(', ')}</span>
            <span>{usageStats.limits.tokens - usageStats.usage.tokens} remaining</span>
          </div>
        </CardContent>
      </Card>

      {/* Request Usage */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <CardTitle className="text-lg">API Requests</CardTitle>
            </div>
            <Badge className={getUsageColor(requestUsagePercentage)}>
              {requestUsagePercentage.toFixed(1)}%
            </Badge>
          </div>
          <CardDescription>
            {usageStats.usage.requests.toLocaleString()} of {usageStats.limits.requests.toLocaleString()} requests used
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress 
            value={requestUsagePercentage} 
            className="h-2"
          />
          <div className="flex justify-between text-sm text-gray-600 mt-2">
            <span>This month</span>
            <span>{(usageStats.limits.requests - usageStats.usage.requests).toLocaleString()} remaining</span>
          </div>
        </CardContent>
      </Card>

      {/* Cost Tracking */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-purple-600" />
              <CardTitle className="text-lg">Monthly Costs</CardTitle>
            </div>
            <Badge className={getUsageColor(costPercentage)}>
              {formatCurrency(usageStats.cost.monthly / 100)}
            </Badge>
          </div>
          <CardDescription>
            {formatCurrency(usageStats.cost.monthly / 100)} of {formatCurrency(usageStats.cost.limit / 100)} budget used
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress 
            value={costPercentage} 
            className="h-2"
          />
          <div className="flex justify-between text-sm text-gray-600 mt-2">
            <span>AI Provider Costs</span>
            <span>{formatCurrency((usageStats.cost.limit - usageStats.cost.monthly) / 100)} remaining</span>
          </div>
        </CardContent>
      </Card>

      {/* Refresh Button */}
      <div className="flex justify-center pt-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={refreshing}
          className="gap-2"
        >
          <Clock className="h-4 w-4" />
          {refreshing ? 'Refreshing...' : 'Refresh Usage'}
        </Button>
      </div>
    </div>
  );
}