/**
 * Cost Monitoring Dashboard for Recoder.xyz
 * 
 * Real-time usage tracking with cost optimization insights
 * Target: $12-13 per user costs on $20 plans (65% margin)
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface UsageMetrics {
  totalCost: number;
  dailyCost: number;
  weeklyCost: number;
  monthlyCost: number;
  requestCount: number;
  tokenUsage: number;
  currentMargin: number;
  projectedMargin: number;
  costByModel: { [model: string]: number };
  costByDay: { date: string; cost: number }[];
  recommendations: OptimizationRecommendation[];
}

interface OptimizationRecommendation {
  type: 'model_switch' | 'context_caching' | 'batch_processing' | 'tier_upgrade';
  description: string;
  potentialSavings: number;
  implementationEffort: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
}

export default function CostMonitoringDashboard() {
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'24h' | '7d' | '30d'>('7d');

  useEffect(() => {
    loadUsageMetrics();
    const interval = setInterval(loadUsageMetrics, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [selectedTimeframe]);

  const loadUsageMetrics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/usage/metrics?timeframe=${selectedTimeframe}`);
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error('Failed to load usage metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-500">Unable to load usage metrics</p>
      </div>
    );
  }

  const costTrendData = {
    labels: metrics.costByDay.map(d => new Date(d.date).toLocaleDateString()),
    datasets: [
      {
        label: 'Daily Cost ($)',
        data: metrics.costByDay.map(d => d.cost),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.1,
      },
    ],
  };

  const modelCostData = {
    labels: Object.keys(metrics.costByModel),
    datasets: [
      {
        data: Object.values(metrics.costByModel),
        backgroundColor: [
          '#3B82F6', // Blue
          '#10B981', // Green
          '#F59E0B', // Yellow
          '#EF4444', // Red
          '#8B5CF6', // Purple
        ],
      },
    ],
  };

  const marginData = {
    labels: ['Current Month', 'Projected (Optimized)'],
    datasets: [
      {
        label: 'Profit Margin (%)',
        data: [metrics.currentMargin * 100, metrics.projectedMargin * 100],
        backgroundColor: [
          metrics.currentMargin >= 0.65 ? '#10B981' : '#EF4444',
          '#10B981',
        ],
      },
    ],
  };

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
  const formatPercent = (percent: number) => `${(percent * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Cost Monitoring Dashboard</h1>
        <div className="flex space-x-2">
          {(['24h', '7d', '30d'] as const).map((timeframe) => (
            <button
              key={timeframe}
              onClick={() => setSelectedTimeframe(timeframe)}
              className={`px-3 py-1 rounded-md text-sm font-medium ${
                selectedTimeframe === timeframe
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {timeframe}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                <span className="text-blue-600 font-semibold">$</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Monthly Cost
                </dt>
                <dd className="text-lg font-medium text-gray-900">
                  {formatCurrency(metrics.monthlyCost)}
                </dd>
              </dl>
            </div>
          </div>
          <div className="mt-2">
            <div className="text-sm text-gray-500">
              Target: $13.00 (65% margin)
            </div>
            <div className={`text-sm font-medium ${
              metrics.monthlyCost <= 13 ? 'text-green-600' : 'text-red-600'
            }`}>
              {metrics.monthlyCost <= 13 ? '✓ On target' : '⚠ Over budget'}
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                <span className="text-green-600 font-semibold">%</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Profit Margin
                </dt>
                <dd className="text-lg font-medium text-gray-900">
                  {formatPercent(metrics.currentMargin)}
                </dd>
              </dl>
            </div>
          </div>
          <div className="mt-2">
            <div className="text-sm text-gray-500">
              Target: 65%
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-purple-100 rounded-md flex items-center justify-center">
                <span className="text-purple-600 font-semibold">#</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Requests
                </dt>
                <dd className="text-lg font-medium text-gray-900">
                  {metrics.requestCount.toLocaleString()}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-yellow-100 rounded-md flex items-center justify-center">
                <span className="text-yellow-600 font-semibold">T</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Tokens Used
                </dt>
                <dd className="text-lg font-medium text-gray-900">
                  {(metrics.tokenUsage / 1000).toFixed(1)}K
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Trend Chart */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Cost Trend</h3>
          <div className="h-64">
            <Line
              data={costTrendData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false,
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      callback: (value) => `$${value}`,
                    },
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Model Cost Distribution */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Cost by Model</h3>
          <div className="h-64">
            <Doughnut
              data={modelCostData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Margin Comparison */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Margin Analysis</h3>
          <div className="h-64">
            <Bar
              data={marginData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false,
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                      callback: (value) => `${value}%`,
                    },
                  },
                },
              }}
            />
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Target: 65%</span>
              <span className={`font-medium ${
                metrics.currentMargin >= 0.65 ? 'text-green-600' : 'text-red-600'
              }`}>
                {metrics.currentMargin >= 0.65 ? 'Meeting target' : 'Below target'}
              </span>
            </div>
          </div>
        </div>

        {/* Optimization Recommendations */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Cost Optimization Recommendations
          </h3>
          <div className="space-y-3">
            {metrics.recommendations.map((rec, index) => (
              <div key={index} className="border-l-4 border-blue-500 pl-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {rec.description}
                    </p>
                    <div className="mt-1 flex items-center space-x-4 text-xs text-gray-500">
                      <span>Effort: {rec.implementationEffort}</span>
                      <span>Risk: {rec.riskLevel}</span>
                    </div>
                  </div>
                  <div className="ml-4 text-right">
                    <div className="text-sm font-medium text-green-600">
                      Save {formatCurrency(rec.potentialSavings)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alert Banner */}
      {metrics.currentMargin < 0.65 && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-red-400">⚠</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Margin Alert: Below Target
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  Current margin ({formatPercent(metrics.currentMargin)}) is below the 65% target. 
                  Implementing the recommendations above could improve margin to {formatPercent(metrics.projectedMargin)}.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {metrics.currentMargin >= 0.65 && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-green-400">✓</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">
                Margin Target Met
              </h3>
              <div className="mt-2 text-sm text-green-700">
                <p>
                  Great! Your current margin ({formatPercent(metrics.currentMargin)}) meets the 65% target. 
                  Continue monitoring for any changes in usage patterns.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}