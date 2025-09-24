'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Activity, 
  DollarSign, 
  TrendingUp, 
  Users, 
  Clock,
  Zap,
  AlertTriangle,
  Crown,
  RefreshCw
} from 'lucide-react';
import { usePaymentStore, formatTokenCount, formatCurrency, calculateUsagePercentage } from '@/lib/payment-service';
import { useUpgradePrompt } from '@/components/usage/UpgradePrompt';

interface AnalyticsData {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  activeUsers: number;
  avgResponseTime: number;
  topModels: Array<{ model: string; usage: number; cost: number }>;
  dailyUsage: Array<{ date: string; tokens: number; cost: number }>;
  costTrends: Array<{ period: string; amount: number; change: number }>;
}

export default function UsageDashboard() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  
  const { usageStats, fetchUsageStats, subscriptions, refreshData } = usePaymentStore();
  const { upgradePrompt, showUpgradePrompt, hideUpgradePrompt, UpgradePromptComponent } = useUpgradePrompt();

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  const loadAnalyticsData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch usage stats and subscriptions
      await refreshData();

      // Mock analytics data - in production this would come from backend
      const mockData: AnalyticsData = {
        totalRequests: usageStats?.usage.requests || 156,
        totalTokens: usageStats?.usage.tokens || 45230,
        totalCost: usageStats?.cost.monthly || 23.45,
        activeUsers: 12,
        avgResponseTime: 1.2,
        topModels: [
          { model: 'claude-3-sonnet', usage: 15420, cost: 12.34 },
          { model: 'gpt-4-turbo', usage: 8930, cost: 8.90 },
          { model: 'gemini-pro', usage: 5600, cost: 2.21 }
        ],
        dailyUsage: [
          { date: '2024-01-01', tokens: 4500, cost: 2.1 },
          { date: '2024-01-02', tokens: 6200, cost: 3.8 },
          { date: '2024-01-03', tokens: 5800, cost: 3.2 },
          { date: '2024-01-04', tokens: 7100, cost: 4.5 },
          { date: '2024-01-05', tokens: 6900, cost: 4.1 },
          { date: '2024-01-06', tokens: 8200, cost: 5.6 },
          { date: '2024-01-07', tokens: 6500, cost: 4.2 }
        ],
        costTrends: [
          { period: 'This Week', amount: 28.50, change: 12.5 },
          { period: 'Last Week', amount: 25.30, change: -5.2 },
          { period: 'This Month', amount: 85.60, change: 18.7 }
        ]
      };

      setAnalyticsData(mockData);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = () => {
    const currentPlan = subscriptions[0]?.plan_name || 'Free';
    const tokensUsed = usageStats?.usage.tokens || 0;
    const tokensLimit = usageStats?.limits.tokens || 10000;
    const tokensPercentage = calculateUsagePercentage(tokensUsed, tokensLimit);

    showUpgradePrompt('tokens', currentPlan, {
      used: tokensUsed,
      limit: tokensLimit,
      percentage: tokensPercentage
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Usage Analytics</h1>
            <p className="text-gray-600">Monitor your AI usage and costs</p>
          </div>
          <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-8 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800">
          {error}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadAnalyticsData}
            className="ml-2"
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const currentPlan = subscriptions[0]?.plan_name || 'Free';
  const tokensUsed = usageStats?.usage.tokens || 0;
  const tokensLimit = usageStats?.limits.tokens || 10000;
  const costUsed = usageStats?.cost.monthly || 0;
  const costLimit = usageStats?.cost.limit || 50;

  const tokensPercentage = calculateUsagePercentage(tokensUsed, tokensLimit);
  const costPercentage = calculateUsagePercentage(costUsed, costLimit);

  return (
    <div className="space-y-6">
      <UpgradePromptComponent />
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Usage Analytics</h1>
          <p className="text-gray-600">
            Monitor your AI usage and costs • Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-3 py-1">
            <Crown className="h-3 w-3 mr-1" />
            {currentPlan} Plan
          </Badge>
          <Button onClick={loadAnalyticsData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Warnings */}
      {(tokensPercentage > 80 || costPercentage > 80) && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            You're approaching your {tokensPercentage > 80 ? 'token' : 'cost'} limits. 
            <Button variant="link" onClick={handleUpgrade} className="ml-1 p-0 h-auto text-yellow-800 underline">
              Consider upgrading your plan
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Tokens</p>
                <p className="text-2xl font-bold">{formatTokenCount(tokensUsed)}</p>
                <p className="text-xs text-gray-500">of {formatTokenCount(tokensLimit)}</p>
              </div>
              <div className="h-12 w-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <Zap className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <Progress value={tokensPercentage} className="mt-3" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Monthly Cost</p>
                <p className="text-2xl font-bold">{formatCurrency(costUsed)}</p>
                <p className="text-xs text-gray-500">of {formatCurrency(costLimit)}</p>
              </div>
              <div className="h-12 w-12 bg-green-50 rounded-lg flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <Progress value={costPercentage} className="mt-3" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Requests</p>
                <p className="text-2xl font-bold">{analyticsData?.totalRequests.toLocaleString()}</p>
                <p className="text-xs text-gray-500">this month</p>
              </div>
              <div className="h-12 w-12 bg-purple-50 rounded-lg flex items-center justify-center">
                <Activity className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Response</p>
                <p className="text-2xl font-bold">{analyticsData?.avgResponseTime}s</p>
                <p className="text-xs text-gray-500">response time</p>
              </div>
              <div className="h-12 w-12 bg-orange-50 rounded-lg flex items-center justify-center">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <Tabs defaultValue="models" className="space-y-4">
        <TabsList>
          <TabsTrigger value="models">Model Usage</TabsTrigger>
          <TabsTrigger value="trends">Cost Trends</TabsTrigger>
          <TabsTrigger value="daily">Daily Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top AI Models</CardTitle>
              <CardDescription>Most used models this month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analyticsData?.topModels.map((model, index) => (
                  <div key={model.model} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 bg-gray-100 rounded-lg flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{model.model}</p>
                        <p className="text-sm text-gray-500">{formatTokenCount(model.usage)} tokens</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(model.cost)}</p>
                      <p className="text-sm text-gray-500">cost</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cost Trends</CardTitle>
              <CardDescription>Track spending patterns over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analyticsData?.costTrends.map((trend) => (
                  <div key={trend.period} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{trend.period}</p>
                      <p className="text-sm text-gray-500">{formatCurrency(trend.amount)}</p>
                    </div>
                    <div className={`flex items-center gap-1 ${trend.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      <TrendingUp className={`h-4 w-4 ${trend.change < 0 ? 'rotate-180' : ''}`} />
                      <span className="text-sm font-medium">{Math.abs(trend.change)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Usage</CardTitle>
              <CardDescription>Token usage and cost breakdown by day</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analyticsData?.dailyUsage.map((day) => (
                  <div key={day.date} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{new Date(day.date).toLocaleDateString()}</p>
                      <p className="text-sm text-gray-500">{formatTokenCount(day.tokens)} tokens</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(day.cost)}</p>
                      <p className="text-sm text-gray-500">cost</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button onClick={handleUpgrade}>
          <Crown className="h-4 w-4 mr-2" />
          Upgrade Plan
        </Button>
        <Button variant="outline" onClick={() => window.location.href = '/subscription'}>
          Manage Subscription
        </Button>
        <Button variant="outline" onClick={() => window.location.href = '/billing'}>
          View Billing
        </Button>
      </div>
    </div>
  );
}