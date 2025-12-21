/**
 * Optimization Analytics Dashboard
 * Real-time visualization of cost savings and system performance
 */

import { useEffect, useState } from 'react';

interface OptimizationStats {
  templateBasedSavings: number;
  modelRoutedSavings: number;
  freeModelUsage: number;
  averageCost: number;
  templateUsageCount: number;
  templateUsagePercent: number;
  topTemplates: Array<{ template: string; uses: number; avgSavings: number }>;
}

interface UsageMetrics {
  totalRequests: number;
  totalCost: number;
  totalSavings: number;
  avgSavingsPercent: number;
  requestsByStrategy: {
    templateBased: number;
    modelRouted: number;
    standard: number;
  };
  costByModel: Record<string, { requests: number; cost: number }>;
}

export function OptimizationDashboard() {
  const [stats, setStats] = useState<OptimizationStats | null>(null);
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [timeRange]);

  const fetchAnalytics = async () => {
    try {
      const response = await fetch(`/api/analytics?range=${timeRange}`);
      const data = await response.json();
      setStats(data.stats);
      setMetrics(data.metrics);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading analytics...</div>
      </div>
    );
  }

  if (!stats || !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">No data available</div>
      </div>
    );
  }

  const savingsPercent = metrics.avgSavingsPercent || 0;
  const baselineCost = metrics.totalCost / (1 - savingsPercent / 100);
  const monthlySavings = metrics.totalSavings * 30; // Estimate monthly

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Cost Optimization Dashboard</h1>
        <p className="text-gray-600 mt-2">Real-time analytics and savings metrics</p>
      </div>

      {/* Time Range Selector */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setTimeRange('24h')}
          className={`px-4 py-2 rounded-lg font-medium ${
            timeRange === '24h'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          Last 24 Hours
        </button>
        <button
          onClick={() => setTimeRange('7d')}
          className={`px-4 py-2 rounded-lg font-medium ${
            timeRange === '7d'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          Last 7 Days
        </button>
        <button
          onClick={() => setTimeRange('30d')}
          className={`px-4 py-2 rounded-lg font-medium ${
            timeRange === '30d'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          Last 30 Days
        </button>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* Total Savings */}
        <MetricCard
          title="Total Savings"
          value={`$${metrics.totalSavings.toFixed(2)}`}
          subtitle={`${savingsPercent.toFixed(1)}% reduction`}
          trend="up"
          color="green"
        />

        {/* Total Requests */}
        <MetricCard
          title="Total Requests"
          value={metrics.totalRequests.toLocaleString()}
          subtitle={`$${stats.averageCost.toFixed(4)} avg cost`}
          color="blue"
        />

        {/* Free Model Usage */}
        <MetricCard
          title="Free Model Usage"
          value={`${stats.freeModelUsage.toFixed(1)}%`}
          subtitle={`${Math.round((stats.freeModelUsage / 100) * metrics.totalRequests)} requests`}
          trend="up"
          color="purple"
        />

        {/* Monthly Projection */}
        <MetricCard
          title="Monthly Savings"
          value={`$${monthlySavings.toFixed(2)}`}
          subtitle="Projected from current usage"
          trend="up"
          color="emerald"
        />
      </div>

      {/* Strategy Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Requests by Strategy */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Requests by Strategy</h2>
          <div className="space-y-4">
            <StrategyBar
              label="Template-Based"
              count={metrics.requestsByStrategy.templateBased}
              total={metrics.totalRequests}
              color="bg-green-500"
              savings={stats.templateBasedSavings}
            />
            <StrategyBar
              label="Model-Routed"
              count={metrics.requestsByStrategy.modelRouted}
              total={metrics.totalRequests}
              color="bg-blue-500"
              savings={stats.modelRoutedSavings}
            />
            <StrategyBar
              label="Standard"
              count={metrics.requestsByStrategy.standard}
              total={metrics.totalRequests}
              color="bg-gray-500"
              savings={0}
            />
          </div>
        </div>

        {/* Cost Comparison */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Cost Comparison</h2>
          <div className="space-y-4">
            <CostBar
              label="Baseline Cost"
              amount={baselineCost}
              color="bg-red-500"
              isBaseline
            />
            <CostBar
              label="Optimized Cost"
              amount={metrics.totalCost}
              color="bg-green-500"
            />
            <div className="mt-4 p-4 bg-green-50 rounded-lg">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  ${metrics.totalSavings.toFixed(2)}
                </div>
                <div className="text-sm text-green-700">Total Saved</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Templates */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Top Templates Used</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Template</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Uses</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Avg Savings</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {stats.topTemplates.slice(0, 10).map((template, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center">
                      <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold mr-3">
                        {index + 1}
                      </span>
                      {template.template}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">{template.uses}</td>
                  <td className="py-3 px-4 text-right text-green-600 font-semibold">
                    {template.avgSavings.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600">
                    {((template.uses / stats.templateUsageCount) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost by Model */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Cost by Model</h2>
        <div className="space-y-3">
          {Object.entries(metrics.costByModel)
            .sort(([, a], [, b]) => b.cost - a.cost)
            .slice(0, 10)
            .map(([model, data]) => (
              <div key={model} className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{model}</div>
                  <div className="text-xs text-gray-500">{data.requests} requests</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    ${data.cost.toFixed(4)}
                  </div>
                  <div className="text-xs text-gray-500">
                    ${(data.cost / data.requests).toFixed(4)}/req
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// Metric Card Component
function MetricCard({
  title,
  value,
  subtitle,
  trend,
  color = 'blue',
}: {
  title: string;
  value: string;
  subtitle: string;
  trend?: 'up' | 'down';
  color?: string;
}) {
  const colorClasses = {
    green: 'from-green-500 to-green-600',
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    emerald: 'from-emerald-500 to-emerald-600',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color as keyof typeof colorClasses]} rounded-lg shadow-md p-6 text-white`}>
      <div className="text-sm font-medium opacity-90 mb-2">{title}</div>
      <div className="text-3xl font-bold mb-1">{value}</div>
      <div className="text-sm opacity-80 flex items-center">
        {trend === 'up' && <span className="mr-1">↑</span>}
        {trend === 'down' && <span className="mr-1">↓</span>}
        {subtitle}
      </div>
    </div>
  );
}

// Strategy Bar Component
function StrategyBar({
  label,
  count,
  total,
  color,
  savings,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  savings: number;
}) {
  const percent = total > 0 ? (count / total) * 100 : 0;

  return (
    <div>
      <div className="flex justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-600">
          {count} ({percent.toFixed(1)}%)
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
        <div className={`${color} h-full rounded-full`} style={{ width: `${percent}%` }} />
      </div>
      {savings > 0 && (
        <div className="text-xs text-green-600 mt-1">Avg savings: {savings.toFixed(1)}%</div>
      )}
    </div>
  );
}

// Cost Bar Component
function CostBar({
  label,
  amount,
  color,
  isBaseline = false,
}: {
  label: string;
  amount: number;
  color: string;
  isBaseline?: boolean;
}) {
  return (
    <div>
      <div className="flex justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm font-semibold text-gray-900">${amount.toFixed(2)}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
        <div
          className={`${color} h-full rounded-full ${isBaseline ? 'opacity-50' : ''}`}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}
