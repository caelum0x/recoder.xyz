/**
 * Usage Dashboard Page
 * Detailed analytics and usage statistics
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft,
  Terminal,
  Download,
  TrendingUp,
  TrendingDown,
  Zap,
  DollarSign,
  Activity,
  BarChart3,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

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
  };
  projections?: {
    projectedMonthlyCost: number;
    projectedAnnualCost: number;
    costTrend: string;
    recommendations: string[];
  };
}

export default function UsageDashboardPage() {
  const [timeRange, setTimeRange] = useState('7d');
  const [selectedModel, setSelectedModel] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [costBreakdown, setCostBreakdown] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    loadUsageData();
  }, [timeRange, selectedModel]);

  const loadUsageData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch analytics data
      const [analytics, breakdown, history] = await Promise.all([
        apiClient.getUsageAnalytics(timeRange, selectedModel),
        apiClient.getCostBreakdown(timeRange === '24h' ? 'day' : timeRange === '7d' ? 'week' : 'month'),
        apiClient.getUsageHistory({ limit: 10, offset: 0 })
      ]);

      setUsageData(analytics);
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

  const handleExport = async () => {
    try {
      await apiClient.exportUsageData('csv', timeRange);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
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

  if (loading) {
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
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center space-x-2 group text-white hover:text-orange-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Dashboard</span>
          </Link>
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-6 py-24">
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
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export Data</span>
            </button>
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
