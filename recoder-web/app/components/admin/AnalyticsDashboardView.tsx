/**
 * Analytics Dashboard View
 * Renders overview cards, usage charts, top projects, heatmap using nanostores from analytics-client
 */

import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import {
  analyticsTimeRange,
  analyticsLoading,
  analyticsError,
  analyticsOverview,
  analyticsUsage,
  analyticsAI,
  analyticsTopProjects,
  analyticsHeatmap,
  fetchAnalyticsDashboard,
} from '~/lib/services/analytics/analytics-client';
import type { TimeRange, OverviewCard } from '~/lib/services/analytics/types';

function OverviewCardView({ card }: { card: OverviewCard }) {
  const trendColor = card.trend === 'up' ? 'text-green-400' : card.trend === 'down' ? 'text-red-400' : 'text-recoder-elements-textTertiary';
  const trendIcon = card.trend === 'up' ? 'i-ph:trend-up' : card.trend === 'down' ? 'i-ph:trend-down' : 'i-ph:minus';

  return (
    <div className="bg-recoder-elements-background-depth-2 rounded-lg p-4 border border-recoder-elements-borderColor">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-recoder-elements-textSecondary">{card.title}</span>
        <div className={`${trendIcon} ${trendColor}`} />
      </div>
      <div className="text-2xl font-bold text-recoder-elements-textPrimary">{card.formattedValue}</div>
      {card.changePercent > 0 && (
        <div className={`text-xs mt-1 ${trendColor}`}>
          {card.trend === 'up' ? '+' : card.trend === 'down' ? '-' : ''}{card.changePercent}% vs previous period
        </div>
      )}
    </div>
  );
}

function TimeRangeSelector() {
  const range = useStore(analyticsTimeRange);
  const ranges: { value: TimeRange; label: string }[] = [
    { value: '24h', label: '24h' },
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: '90d', label: '90d' },
  ];

  return (
    <div className="flex gap-1 bg-recoder-elements-background-depth-3 rounded-lg p-1">
      {ranges.map(r => (
        <button
          key={r.value}
          onClick={() => fetchAnalyticsDashboard(r.value)}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            range === r.value
              ? 'bg-recoder-elements-button-primary-background text-recoder-elements-button-primary-text'
              : 'text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function AnalyticsDashboardView() {
  const loading = useStore(analyticsLoading);
  const error = useStore(analyticsError);
  const overview = useStore(analyticsOverview);
  const usage = useStore(analyticsUsage);
  const ai = useStore(analyticsAI);
  const topProjects = useStore(analyticsTopProjects);
  const heatmap = useStore(analyticsHeatmap);

  useEffect(() => {
    fetchAnalyticsDashboard();
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-recoder-elements-textPrimary">Usage Analytics</h2>
        <TimeRangeSelector />
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && !overview && (
        <div className="flex items-center justify-center h-48 text-recoder-elements-textTertiary">
          Loading analytics...
        </div>
      )}

      {/* Overview Cards */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <OverviewCardView card={overview.totalProjects} />
          <OverviewCardView card={overview.aiRequests} />
          <OverviewCardView card={overview.tokensUsed} />
          <OverviewCardView card={overview.computeTime} />
        </div>
      )}

      {/* AI Usage Details */}
      {ai && (
        <div className="bg-recoder-elements-background-depth-2 rounded-lg p-4 border border-recoder-elements-borderColor">
          <h3 className="text-lg font-medium text-recoder-elements-textPrimary mb-4">AI Usage</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-recoder-elements-textSecondary">Total Requests</div>
              <div className="text-xl font-semibold text-recoder-elements-textPrimary">{ai.totalRequests.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-sm text-recoder-elements-textSecondary">Estimated Cost</div>
              <div className="text-xl font-semibold text-recoder-elements-textPrimary">${ai.estimatedCost.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm text-recoder-elements-textSecondary">Cache Savings</div>
              <div className="text-xl font-semibold text-green-400">${ai.savingsFromCache.toFixed(4)}</div>
            </div>
            <div>
              <div className="text-sm text-recoder-elements-textSecondary">Success Rate</div>
              <div className="text-xl font-semibold text-recoder-elements-textPrimary">{ai.successRate.toFixed(1)}%</div>
            </div>
          </div>
          {ai.requestsByModel.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-recoder-elements-textSecondary mb-2">Requests by Model</h4>
              <div className="space-y-2">
                {ai.requestsByModel.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-recoder-elements-textPrimary">{m.model}</span>
                    <span className="text-recoder-elements-textSecondary">{m.requests} requests (${m.cost.toFixed(4)})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top Projects */}
      {topProjects.length > 0 && (
        <div className="bg-recoder-elements-background-depth-2 rounded-lg p-4 border border-recoder-elements-borderColor">
          <h3 className="text-lg font-medium text-recoder-elements-textPrimary mb-4">Top Projects</h3>
          <div className="space-y-3">
            {topProjects.map((project, i) => (
              <div key={project.projectId} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-recoder-elements-textTertiary w-6">#{i + 1}</span>
                  <span className="text-sm font-medium text-recoder-elements-textPrimary">{project.projectName}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-recoder-elements-textSecondary">
                  <span>{project.aiRequests} AI requests</span>
                  <span>{project.filesChanged} files changed</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Heatmap */}
      {heatmap && heatmap.totalContributions > 0 && (
        <div className="bg-recoder-elements-background-depth-2 rounded-lg p-4 border border-recoder-elements-borderColor">
          <h3 className="text-lg font-medium text-recoder-elements-textPrimary mb-2">Activity</h3>
          <div className="flex items-center gap-4 text-sm text-recoder-elements-textSecondary mb-3">
            <span>{heatmap.totalContributions} contributions</span>
            {heatmap.currentStreak > 0 && <span>{heatmap.currentStreak} day streak</span>}
            {heatmap.longestStreak > 0 && <span>Longest: {heatmap.longestStreak} days</span>}
          </div>
          <div className="flex flex-wrap gap-[2px]">
            {heatmap.data.slice(-90).map((day, i) => {
              const colors = ['bg-recoder-elements-background-depth-3', 'bg-green-900', 'bg-green-700', 'bg-green-500', 'bg-green-400'];
              return (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-sm ${colors[day.level]}`}
                  title={`${day.date}: ${day.count} contributions`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Usage Summary */}
      {usage && (
        <div className="bg-recoder-elements-background-depth-2 rounded-lg p-4 border border-recoder-elements-borderColor">
          <h3 className="text-lg font-medium text-recoder-elements-textPrimary mb-4">Usage Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-recoder-elements-textSecondary">Active Projects</div>
              <div className="text-lg font-semibold text-recoder-elements-textPrimary">{usage.activeProjects}</div>
            </div>
            <div>
              <div className="text-recoder-elements-textSecondary">Deployments</div>
              <div className="text-lg font-semibold text-recoder-elements-textPrimary">{usage.totalDeployments}</div>
            </div>
            <div>
              <div className="text-recoder-elements-textSecondary">Files Changed</div>
              <div className="text-lg font-semibold text-recoder-elements-textPrimary">{usage.totalFilesChanged.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-recoder-elements-textSecondary">Compute Minutes</div>
              <div className="text-lg font-semibold text-recoder-elements-textPrimary">{usage.totalComputeMinutes}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
