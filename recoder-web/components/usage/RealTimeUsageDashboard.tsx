'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Activity, 
  AlertTriangle, 
  DollarSign, 
  Zap, 
  Clock, 
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UsageStats {
  planId: string;
  monthlyUsage: {
    tokens: number;
    tokensLimit: number;
    tokensPercentage: number;
    cost: number;
    costLimit: number;
    costPercentage: number;
  };
  dailyUsage: {
    tokens: number;
    tokensLimit: number;
    cost: number;
    costLimit: number;
  };
  concurrency: {
    active: number;
    limit: number;
  };
  quotaStatus: 'OK' | 'MODERATE' | 'WARNING' | 'CRITICAL' | 'EXCEEDED';
  warnings: string[];
}

interface RealTimeUsageDashboardProps {
  className?: string;
}

export default function RealTimeUsageDashboard({ className }: RealTimeUsageDashboardProps) {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/usage/stats');
      const result = await response.json();
      
      if (result.success) {
        setStats(result.data);
        setLastUpdated(new Date());
        setError(null);
      } else {
        setError(result.error || 'Failed to fetch usage stats');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Set up real-time updates every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OK': return 'text-green-600 bg-green-50';
      case 'MODERATE': return 'text-blue-600 bg-blue-50';
      case 'WARNING': return 'text-yellow-600 bg-yellow-50';
      case 'CRITICAL': return 'text-orange-600 bg-orange-50';
      case 'EXCEEDED': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'OK': return <CheckCircle2 className="h-4 w-4" />;
      case 'MODERATE': return <Activity className="h-4 w-4" />;
      case 'WARNING': return <AlertTriangle className="h-4 w-4" />;
      case 'CRITICAL': return <AlertCircle className="h-4 w-4" />;
      case 'EXCEEDED': return <AlertCircle className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4].map((i) => (
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

  if (error) {
    return (
      <div className={cn('space-y-4', className)}>
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-600">
            {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={cn('space-y-4', className)}>
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-gray-500">No usage data available</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getStatusIcon(stats.quotaStatus)}
            Usage Status
            <Badge className={getStatusColor(stats.quotaStatus)}>
              {stats.quotaStatus}
            </Badge>
          </CardTitle>
          <CardDescription>
            Real-time monitoring of your AI usage and costs
            {lastUpdated && (
              <span className="ml-2 text-xs text-gray-500">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.warnings.length > 0 && (
            <div className="space-y-2 mb-4">
              {stats.warnings.map((warning, index) => (
                <Alert key={index} className="border-yellow-200 bg-yellow-50">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800">
                    {warning}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Monthly Token Usage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Tokens</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatTokens(stats.monthlyUsage.tokens)}
            </div>
            <div className="text-xs text-muted-foreground mb-2">
              of {formatTokens(stats.monthlyUsage.tokensLimit)} ({stats.monthlyUsage.tokensPercentage.toFixed(1)}%)
            </div>
            <Progress 
              value={stats.monthlyUsage.tokensPercentage} 
              className="h-2"
            />
          </CardContent>
        </Card>

        {/* Monthly Cost */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats.monthlyUsage.cost)}
            </div>
            <div className="text-xs text-muted-foreground mb-2">
              of {formatCurrency(stats.monthlyUsage.costLimit)} ({stats.monthlyUsage.costPercentage.toFixed(1)}%)
            </div>
            <Progress 
              value={stats.monthlyUsage.costPercentage} 
              className="h-2"
            />
          </CardContent>
        </Card>

        {/* Daily Usage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Usage</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatTokens(stats.dailyUsage.tokens)}
            </div>
            <div className="text-xs text-muted-foreground mb-2">
              of {formatTokens(stats.dailyUsage.tokensLimit)} limit
            </div>
            <div className="text-xs text-muted-foreground">
              Cost: {formatCurrency(stats.dailyUsage.cost)}
            </div>
          </CardContent>
        </Card>

        {/* Concurrent Requests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Requests</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.concurrency.active}
            </div>
            <div className="text-xs text-muted-foreground mb-2">
              of {stats.concurrency.limit} max concurrent
            </div>
            <Progress 
              value={(stats.concurrency.active / stats.concurrency.limit) * 100} 
              className="h-2"
            />
          </CardContent>
        </Card>
      </div>

      {/* Plan Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Current Plan: {stats.planId.charAt(0).toUpperCase() + stats.planId.slice(1)}
          </CardTitle>
          <CardDescription>
            Your usage limits and allowances
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium">Monthly Limits</h4>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Tokens:</span>
                  <span>{formatTokens(stats.monthlyUsage.tokensLimit)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cost:</span>
                  <span>{formatCurrency(stats.monthlyUsage.costLimit)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Concurrency:</span>
                  <span>{stats.concurrency.limit} requests</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Current Usage</h4>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Tokens Used:</span>
                  <span>{formatTokens(stats.monthlyUsage.tokens)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cost Incurred:</span>
                  <span>{formatCurrency(stats.monthlyUsage.cost)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Remaining:</span>
                  <span>{formatCurrency(stats.monthlyUsage.costLimit - stats.monthlyUsage.cost)}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}