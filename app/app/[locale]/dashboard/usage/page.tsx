/**
 * Usage Dashboard Page
 * Detailed analytics and usage statistics
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Download,
  TrendingUp,
  Zap,
  DollarSign,
  Activity,
  BarChart3,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { useSession } from '@/lib/session-provider';

interface UsageData {
  overview: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    averageCostPerRequest: number;
    currentPlan: string;
    quotaStatus: string;
  };
  currentMonth: {
    requests: number;
    tokens: number;
    cost: number;
    utilizationPercentage: number;
  };
  detailed?: {
    weeklyTrend: Array<{
      day: string;
      requests: number;
      cost: number;
    }>;
    topModels: Array<{
      model: string;
      usage: number;
      cost: number;
      efficiency: number;
    }>;
    featureUsage: {
      [key: string]: {
        requests: number;
        cost: number;
        percentage: number;
      };
    };
    platformBreakdown?: Array<{
      platform: string;
      requests: number;
      cost: number;
      percentage: number;
    }>;
  };
  projections?: {
    projectedMonthlyCost: number;
    projectedAnnualCost: number;
    costTrend: string;
    recommendations: string[];
  };
}

export default function UsageDashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [timeRange, setTimeRange] = useState('7d');
  const [selectedModel, setSelectedModel] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [costBreakdown, setCostBreakdown] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const redirectToSignIn = () => {
    const currentPath = typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/dashboard/usage';
    router.push(`/auth/signin?redirect=${encodeURIComponent(currentPath)}`);
  };

  useEffect(() => {
    if (!isPending && !session) {
      redirectToSignIn();
      return;
    }

    if (!isPending && session) {
      void loadUsageData();
    }
  }, [timeRange, selectedModel, isPending, session]);

  const loadUsageData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [analytics, breakdown, history] = await Promise.all([
        fetchUsageAnalytics(timeRange, selectedModel),
        fetchCostBreakdown(timeRange === '24h' ? 'day' : timeRange === '7d' ? 'week' : 'month'),
        fetchUsageHistory({ limit: 10, offset: 0 })
      ]);

      setUsageData(analytics as UsageData);
      setCostBreakdown(breakdown);
      setRecentActivity(history.history || []);
    } catch (err) {
      console.error('Failed to load usage data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load usage data');
    } finally {
      setLoading(false);
    }
  };

  const models = [
    { id: 'all', name: 'All Models' },
    { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet' },
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'gemini-pro', name: 'Gemini Pro' }
  ];

  const timeRanges = [
    { id: '24h', label: 'Last 24 Hours' },
    { id: '7d', label: 'Last 7 Days' },
    { id: '30d', label: 'Last 30 Days' },
    { id: '90d', label: 'Last 90 Days' }
  ];

  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    setExportError(null);
    try {
      await exportUsageData('csv', timeRange);
    } catch (err) {
      console.error('Export failed:', err);
      setExportError('Export failed. Please try again.');
      setTimeout(() => setExportError(null), 4000);
    }
  };

  // Calculate display data
  const usageStats = usageData?.overview || {
    totalRequests: 0,
    totalTokens: 0,
    totalCost: 0,
    averageCostPerRequest: 0,
    currentPlan: 'free',
    quotaStatus: 'normal'
  };

  const dailyUsage = usageData?.detailed?.weeklyTrend || [];
  const modelBreakdown = usageData?.detailed?.topModels?.map((model, index) => ({
    model: model.model,
    requests: Math.round(model.usage * usageStats.totalRequests / 100),
    tokens: Math.round(model.usage * usageStats.totalTokens / 100),
    cost: model.cost,
    percentage: model.usage
  })) || [];

  const maxRequests = dailyUsage.length > 0 
    ? Math.max(...dailyUsage.map((d: any) => d.requests)) 
    : 1;
  const maxCost = dailyUsage.length > 0 
    ? Math.max(...dailyUsage.map((d: any) => d.cost)) 
    : 1;

  // Format recent activity
  const formattedActivity = recentActivity.slice(0, 5).map((item, index) => ({
    id: index + 1,
    model: item.model || 'Unknown',
    tokens: item.inputTokens + item.outputTokens,
    cost: item.estimatedCost || 0,
    time: formatRelativeTime(item.timestamp),
    status: 'success' as const
  }));

  function formatRelativeTime(timestamp: string): string {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} mins ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} days ago`;
  }

  async function fetchUsageEndpoint(params: URLSearchParams) {
    const response = await fetch(`/api/usage/history?${params.toString()}`, {
      credentials: 'include',
    });

    if (response.status === 401) {
      throw new Error('Authentication required');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const payload = await response.json();
    return payload.data || payload;
  }

  async function fetchUsageAnalytics(range: string, model: string) {
    const endDate = new Date().toISOString();
    const startDate = new Date();

    switch (range) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }

    const params = new URLSearchParams({
      startDate: startDate.toISOString(),
      endDate,
      limit: '1000',
    });

    if (model && model !== 'all') {
      params.append('model', model);
    }

    const response = await fetchUsageEndpoint(params);
    const records = response.records || [];
    const summary = response.summary || { totalRecords: 0, totalTokens: 0, totalCost: 0 };

    return {
      overview: {
        totalRequests: summary.totalRecords,
        totalTokens: summary.totalTokens,
        totalCost: summary.totalCost,
        averageCostPerRequest: summary.totalRecords > 0 ? summary.totalCost / summary.totalRecords : 0,
        currentPlan: 'free',
        quotaStatus: 'normal',
      },
      detailed: {
        weeklyTrend: aggregateByDay(records),
        topModels: aggregateByModel(records),
        platformBreakdown: aggregateByPlatform(records),
        featureUsage: {},
      },
      projections: {
        projectedMonthlyCost: calculateProjectedCost(records, range),
        projectedAnnualCost: calculateProjectedCost(records, range) * 12,
        costTrend: 'stable',
        recommendations: generateRecommendations(records),
      },
    };
  }

  async function fetchCostBreakdown(period: 'day' | 'week' | 'month') {
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    const params = new URLSearchParams({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      limit: '1000',
    });

    const response = await fetchUsageEndpoint(params);
    return aggregateByModel(response.records || []);
  }

  async function fetchUsageHistory(params: { limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams();

    if (params.limit !== undefined) searchParams.append('limit', String(params.limit));
    if (params.offset !== undefined) searchParams.append('offset', String(params.offset));

    return fetchUsageEndpoint(searchParams);
  }

  async function exportUsageData(format: 'json' | 'csv', range: string) {
    const endDate = new Date().toISOString();
    const startDate = new Date();

    switch (range) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }

    const params = new URLSearchParams({
      format,
      startDate: startDate.toISOString(),
      endDate,
    });

    const response = await fetch(`/api/usage/export?${params.toString()}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Export failed');
    }

    const blob =
      format === 'csv'
        ? await response.blob()
        : new Blob([JSON.stringify(await response.json(), null, 2)], { type: 'application/json' });

    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `usage-export-${range}.${format}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(downloadUrl);
    document.body.removeChild(a);
  }

  function aggregateByDay(records: any[]) {
    const dayMap = new Map();

    records.forEach((record) => {
      const day = new Date(record.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      if (!dayMap.has(day)) {
        dayMap.set(day, { day, requests: 0, cost: 0 });
      }

      const dayData = dayMap.get(day);
      dayData.requests += 1;
      dayData.cost += record.cost || 0;
    });

    return Array.from(dayMap.values()).slice(-7);
  }

  function aggregateByModel(records: any[]) {
    const modelMap = new Map();
    const totalRecords = records.length;

    records.forEach((record) => {
      const model = record.model || 'unknown';

      if (!modelMap.has(model)) {
        modelMap.set(model, { model, usage: 0, cost: 0, efficiency: 0, requests: 0 });
      }

      const modelData = modelMap.get(model);
      modelData.requests += 1;
      modelData.cost += record.cost || 0;
      modelData.usage = totalRecords > 0 ? (modelData.requests / totalRecords) * 100 : 0;
    });

    return Array.from(modelMap.values())
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 5);
  }

  function aggregateByPlatform(records: any[]) {
    const platformMap = new Map();
    const totalRecords = records.length;

    records.forEach((record) => {
      const platform = record.platform || 'unknown';

      if (!platformMap.has(platform)) {
        platformMap.set(platform, { platform, requests: 0, cost: 0, tokens: 0, percentage: 0 });
      }

      const platformData = platformMap.get(platform);
      platformData.requests += 1;
      platformData.cost += record.cost || 0;
      platformData.tokens += record.tokens || 0;
      platformData.percentage = totalRecords > 0 ? (platformData.requests / totalRecords) * 100 : 0;
    });

    return Array.from(platformMap.values()).sort((a, b) => b.requests - a.requests);
  }

  function calculateProjectedCost(records: any[], range: string) {
    if (records.length === 0) return 0;
    const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
    const days = range === '24h' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 90;
    return (totalCost / days) * 30;
  }

  function generateRecommendations(records: any[]) {
    if (records.length === 0) {
      return ['Start using the platform to get personalized recommendations'];
    }

    const recommendations: string[] = [];
    const modelUsage = aggregateByModel(records);
    const platformUsage = aggregateByPlatform(records);
    const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
    const cliUsage = platformUsage.find((p) => p.platform === 'cli');
    const webUsage = platformUsage.find((p) => p.platform === 'web');

    if (cliUsage && webUsage) {
      if (cliUsage.cost > webUsage.cost * 2) {
        recommendations.push('Consider using web interface for cost-effective operations');
      } else if (webUsage.cost > cliUsage.cost * 2) {
        recommendations.push('CLI usage is more cost-effective for your workflow');
      }
    }

    if (totalCost > 10) {
      recommendations.push('Consider using more cost-effective models for simple tasks');
    }

    if (modelUsage.length > 3) {
      recommendations.push('Consolidate to fewer models to optimize costs');
    }

    recommendations.push('Monitor usage patterns to identify optimization opportunities');
    return recommendations;
  }

  if (isPending || loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading usage data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-6 py-10">
        <div className="max-w-7xl mx-auto">
          {/* Error State */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <div>
                <p className="font-medium text-red-500">Failed to load usage data</p>
                <p className="text-sm text-gray-400">{error}</p>
              </div>
            </div>
          )}

          {/* Page Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Usage Analytics</h1>
              <p className="text-gray-400">Track your API usage, costs, and performance</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Export Data</span>
              </button>
              {exportError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {exportError}
                </div>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="mb-6 flex flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white appearance-none"
              >
                {timeRanges.map((range) => (
                  <option key={range.id} value={range.id} className="bg-gray-900">
                    {range.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-gray-400" />
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white appearance-none"
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id} className="bg-gray-900">
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">Total Requests</div>
                <Activity className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold mb-1">{usageStats.totalRequests.toLocaleString()}</div>
              <div className="flex items-center space-x-1 text-xs">
                <span className="text-gray-500">Current period</span>
              </div>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">Total Tokens</div>
                <Zap className="w-4 h-4 text-yellow-500" />
              </div>
              <div className="text-2xl font-bold mb-1">{(usageStats.totalTokens / 1000).toFixed(0)}K</div>
              <div className="flex items-center space-x-1 text-xs">
                <span className="text-gray-500">Avg: {usageStats.averageCostPerRequest > 0 ? (usageStats.totalTokens / usageStats.totalRequests).toFixed(0) : '0'}/req</span>
              </div>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">Total Cost</div>
                <DollarSign className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-2xl font-bold mb-1">${usageStats.totalCost.toFixed(2)}</div>
              <div className="flex items-center space-x-1 text-xs">
                {usageData?.projections && (
                  <>
                    <TrendingUp className="w-3 h-3 text-orange-500" />
                    <span className="text-orange-500">Projected: ${usageData.projections.projectedMonthlyCost.toFixed(2)}</span>
                  </>
                )}
              </div>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">Quota Status</div>
                <Activity className={`w-4 h-4 ${
                  usageStats.quotaStatus === 'normal' ? 'text-green-500' :
                  usageStats.quotaStatus === 'warning' ? 'text-yellow-500' :
                  'text-red-500'
                }`} />
              </div>
              <div className="text-2xl font-bold mb-1 capitalize">{usageStats.quotaStatus || 'Normal'}</div>
              <div className="flex items-center space-x-1 text-xs">
                <span className="text-gray-500">Plan: {usageStats.currentPlan || 'Free'}</span>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            {/* Daily Requests Chart */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h3 className="text-lg font-bold mb-4">Daily Requests</h3>
              {dailyUsage.length > 0 ? (
                <div className="space-y-3">
                  {dailyUsage.map((day: any, index: number) => (
                    <div key={index} className="flex items-center space-x-3">
                      <div className="w-12 text-sm text-gray-400">{day.day}</div>
                      <div className="flex-1">
                        <div className="h-8 bg-white/5 rounded-lg overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-end px-3"
                            style={{ width: `${maxRequests > 0 ? (day.requests / maxRequests) * 100 : 0}%`, minWidth: day.requests > 0 ? '60px' : '0' }}
                          >
                            <span className="text-xs font-medium text-white">{day.requests}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No request data available</p>
                </div>
              )}
            </div>

            {/* Daily Cost Chart */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h3 className="text-lg font-bold mb-4">Daily Cost</h3>
              {dailyUsage.length > 0 ? (
                <div className="space-y-3">
                  {dailyUsage.map((day: any, index: number) => (
                    <div key={index} className="flex items-center space-x-3">
                      <div className="w-12 text-sm text-gray-400">{day.day}</div>
                      <div className="flex-1">
                        <div className="h-8 bg-white/5 rounded-lg overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-end px-3"
                            style={{ width: `${maxCost > 0 ? (day.cost / maxCost) * 100 : 0}%`, minWidth: day.cost > 0 ? '60px' : '0' }}
                          >
                            <span className="text-xs font-medium text-white">${day.cost.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <DollarSign className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No cost data available</p>
                </div>
              )}
            </div>
          </div>

          {/* Advanced Analytics Section */}
          {usageData?.detailed?.platformBreakdown && (
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl mb-8">
              <h3 className="text-lg font-bold mb-4">Platform Insights</h3>
              <div className="grid grid-cols-2 gap-4">
                {usageData.detailed.platformBreakdown.map((platform: any, index: number) => (
                  <div key={index} className="p-4 rounded-lg bg-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium capitalize">{platform.platform}</span>
                      <span className="text-sm text-gray-400">{platform.percentage.toFixed(1)}%</span>
                    </div>
                    <div className="text-sm text-gray-400">
                      {platform.requests} requests • ${platform.cost.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Model Breakdown */}
          {modelBreakdown.length > 0 && (
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl mb-8">
              <h3 className="text-lg font-bold mb-4">Usage by Model</h3>
              <div className="space-y-4">
                {modelBreakdown.map((model, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{model.model}</span>
                      <span className="text-gray-400">{model.percentage}%</span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-purple-600 rounded-full"
                          style={{ width: `${model.percentage}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-xs text-gray-400">
                      <div>Requests: <span className="text-white">{model.requests}</span></div>
                      <div>Tokens: <span className="text-white">{(model.tokens / 1000).toFixed(0)}K</span></div>
                      <div>Cost: <span className="text-white">${model.cost.toFixed(2)}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Activity */}
          {formattedActivity.length > 0 && (
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h3 className="text-lg font-bold mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {formattedActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center space-x-4">
                      <div className={`w-2 h-2 rounded-full ${
                        activity.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                      }`} />
                      <div>
                        <div className="font-medium">{activity.model}</div>
                        <div className="text-sm text-gray-400">{activity.time}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">{activity.tokens.toLocaleString()} tokens</div>
                      <div className="text-sm text-gray-400">${activity.cost.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations (if available) */}
          {usageData?.projections?.recommendations && usageData.projections.recommendations.length > 0 && (
            <div className="mt-8 p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5 backdrop-blur-xl">
              <h3 className="text-lg font-bold mb-4 flex items-center">
                <Activity className="w-5 h-5 mr-2 text-blue-500" />
                Cost Optimization Recommendations
              </h3>
              <ul className="space-y-2">
                {usageData.projections.recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start space-x-2 text-sm">
                    <span className="text-blue-500 mt-1">•</span>
                    <span className="text-gray-300">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
