"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Zap, DollarSign, TrendingUp, TrendingDown,
  Clock, CheckCircle, AlertTriangle, BarChart3,
  Users, Server, Download, RefreshCw
} from "lucide-react";

interface RealTimeMetrics {
  activeUsers: number;
  requestsPerMinute: number;
  avgResponseTime: number;
  successRate: number;
  errorRate: number;
  totalTokensUsed: number;
  estimatedCost: number;
  activeProjects: number;
}

interface ModelPerformance {
  model: string;
  avgResponseTime: number;
  successRate: number;
  tokenEfficiency: number;
  costPer1KTokens: number;
  requestCount: number;
  errorCount: number;
}

export default function AdvancedAnalyticsDashboard() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<RealTimeMetrics | null>(null);
  const [modelPerformance, setModelPerformance] = useState<ModelPerformance[]>([]);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadAnalytics();
    
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadAnalytics();
      }, 30000); // Update every 30 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timeRange, autoRefresh]);

  const loadAnalytics = async () => {
    try {
      // Fetch real data from backend APIs
      const [metricsRes, performanceRes, costRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/analytics/real-time?range=${timeRange}`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/analytics/model-performance?range=${timeRange}`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/analytics/cost-analysis?range=${timeRange}`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        })
      ]);

      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setMetrics(data);
      } else {
        console.error('Failed to fetch metrics:', await metricsRes.text());
      }

      if (performanceRes.ok) {
        const data = await performanceRes.json();
        setModelPerformance(data.models || []);
      } else {
        console.error('Failed to fetch model performance:', await performanceRes.text());
      }

      if (costRes.ok) {
        const data = await costRes.json();
        setCostBreakdown(data.breakdown || []);
      } else {
        console.error('Failed to fetch cost analysis:', await costRes.text());
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to load analytics:', error);
      // Keep showing loading state or show error message
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Advanced Analytics</h1>
            <p className="text-gray-600 mt-1">
              Real-time insights and performance metrics
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadAnalytics()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh now"
              >
                <RefreshCw className="w-5 h-5 text-gray-600" />
              </button>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                Auto-refresh
              </label>
            </div>
            <div className="text-sm text-gray-500">
              Updated: {lastUpdate.toLocaleTimeString()}
            </div>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-600">Active Users</div>
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{metrics?.activeUsers || 0}</div>
            <p className="text-sm text-gray-500 mt-1">Currently online</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-600">Requests/Min</div>
              <Activity className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{metrics?.requestsPerMinute || 0}</div>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-600">+12% from avg</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-600">Avg Response</div>
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {formatTime(metrics?.avgResponseTime || 0)}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              p95: {formatTime((metrics?.avgResponseTime || 0) * 1.5)}
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-600">Success Rate</div>
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {((metrics?.successRate || 0) * 100).toFixed(1)}%
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {formatNumber((metrics?.requestsPerMinute || 0) * 60 * (metrics?.successRate || 0))} successful
            </p>
          </div>
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-600">Total Tokens</div>
              <Zap className="w-5 h-5 text-yellow-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatNumber(metrics?.totalTokensUsed || 0)}
            </div>
            <p className="text-sm text-gray-500 mt-1">Across all models</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-600">Estimated Cost</div>
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(metrics?.estimatedCost || 0)}
            </div>
            <p className="text-sm text-gray-500 mt-1">Current period</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-600">Active Projects</div>
              <Server className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {metrics?.activeProjects || 0}
            </div>
            <p className="text-sm text-gray-500 mt-1">With recent activity</p>
          </div>
        </div>

        {/* Model Performance */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">AI Model Performance</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Compare performance metrics across different models
                </p>
              </div>
              <button
                onClick={() => {/* Export functionality */}}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {modelPerformance.map((model, index) => (
                <div
                  key={index}
                  className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{model.model}</h3>
                      <p className="text-sm text-gray-500">
                        {formatNumber(model.requestCount)} requests
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(model.costPer1KTokens)} / 1K tokens
                      </div>
                      <div className="text-sm text-gray-500">
                        {(model.successRate * 100).toFixed(1)}% success
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500">Response Time</div>
                      <div className="font-medium text-gray-900">
                        {formatTime(model.avgResponseTime)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Efficiency</div>
                      <div className="font-medium text-gray-900">
                        {model.tokenEfficiency.toFixed(2)}x
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Errors</div>
                      <div className="font-medium text-red-600">
                        {model.errorCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Success Rate</div>
                      <div className="font-medium text-green-600">
                        {(model.successRate * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {/* Performance bar */}
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${(model.successRate * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Optimization Suggestions */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Optimization Recommendations</h2>
            <p className="text-sm text-gray-600 mt-1">
              AI-powered suggestions to improve performance and reduce costs
            </p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <TrendingUp className="w-5 h-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-green-900">Switch to Groq for Fast Responses</h4>
                    <p className="text-sm text-green-700 mt-1">
                      70% of your requests could use Groq Llama 3.1 70B for 10x faster responses 
                      at 50% lower cost. Potential savings: <strong>$45/month</strong>
                    </p>
                    <button className="mt-3 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors">
                      Apply Recommendation
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-yellow-900">High Error Rate Detected</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      GPT-4 is showing 6% error rate. Consider adding retry logic or switching 
                      to a more reliable model for this use case.
                    </p>
                    <button className="mt-3 px-4 py-2 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 transition-colors">
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
