/**
 * Analytics Dashboard API
 * Returns AnalyticsDashboardData shape for the admin dashboard
 */

import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { llmAnalytics } from '~/lib/.server/llm/analytics';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AnalyticsDashboard');

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const env = (context as any)?.cloudflare?.env || process.env as unknown as Env;
    const url = new URL(request.url);
    const range = (url.searchParams.get('range') || '30d') as '24h' | '7d' | '30d' | '90d' | 'all';

    // Admin auth check
    const userId = url.searchParams.get('userId') || request.headers.get('x-user-id');
    const adminIds = ((env as any).ADMIN_USER_IDS || '').split(',').map((id: string) => id.trim()).filter(Boolean);
    if (adminIds.length > 0 && (!userId || !adminIds.includes(userId))) {
      return json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const costAnalytics = llmAnalytics.getCostAnalytics();
    const optimizationStats = llmAnalytics.getOptimizationStats();

    const now = new Date().toISOString();
    const data = {
      timeRange: range,
      lastUpdated: now,
      overview: {
        totalProjects: {
          title: 'Total Projects',
          value: 0,
          formattedValue: '0',
          change: 0,
          changePercent: 0,
          trend: 'stable' as const,
          icon: 'folder',
          color: 'blue',
        },
        aiRequests: {
          title: 'AI Requests',
          value: costAnalytics.totalRequests,
          formattedValue: costAnalytics.totalRequests.toLocaleString(),
          change: 0,
          changePercent: 0,
          trend: costAnalytics.totalRequests > 0 ? 'up' as const : 'stable' as const,
          icon: 'cpu',
          color: 'purple',
        },
        tokensUsed: {
          title: 'Tokens Saved',
          value: costAnalytics.totalTokensSaved,
          formattedValue: costAnalytics.totalTokensSaved >= 1000 ? `${(costAnalytics.totalTokensSaved / 1000).toFixed(1)}K` : String(costAnalytics.totalTokensSaved),
          change: 0,
          changePercent: 0,
          trend: costAnalytics.totalTokensSaved > 0 ? 'up' as const : 'stable' as const,
          icon: 'zap',
          color: 'green',
        },
        computeTime: {
          title: 'Cost Saved',
          value: costAnalytics.totalCostSaved,
          formattedValue: `$${costAnalytics.totalCostSaved.toFixed(4)}`,
          change: 0,
          changePercent: 0,
          trend: costAnalytics.totalCostSaved > 0 ? 'up' as const : 'stable' as const,
          icon: 'dollar',
          color: 'emerald',
        },
      },
      usage: {
        totalProjects: 0,
        activeProjects: 0,
        totalAIRequests: costAnalytics.totalRequests,
        totalTokensUsed: costAnalytics.totalTokensSaved,
        totalComputeMinutes: 0,
        totalDeployments: 0,
        totalFilesChanged: 0,
        totalLinesOfCode: 0,
        dailyUsage: [],
        weeklyUsage: [],
        monthlyUsage: [],
      },
      ai: {
        totalRequests: costAnalytics.totalRequests,
        totalTokensInput: 0,
        totalTokensOutput: 0,
        totalTokens: costAnalytics.totalTokensSaved,
        estimatedCost: optimizationStats.averageCost * costAnalytics.totalRequests,
        savingsFromCache: costAnalytics.totalCostSaved,
        requestsByType: { chat: costAnalytics.totalRequests, completion: 0, edit: 0, generation: 0, other: 0 },
        requestsByModel: [],
        dailyRequests: [],
        tokensOverTime: [],
        averageLatency: 0,
        successRate: 100,
        errorRate: 0,
      },
      topProjects: [],
      activityHeatmap: {
        data: [],
        totalContributions: costAnalytics.totalRequests,
        longestStreak: 0,
        currentStreak: 0,
        busiestDay: '',
        busiestDayCount: 0,
      },
      projectAnalytics: [],
    };

    // Try to enhance with database data
    try {
      const { getDatabase } = await import('~/lib/.server/db/client');
      const db = getDatabase(env);

      const projectCount = await db.execute('SELECT COUNT(*) as count FROM projects');
      if (Array.isArray(projectCount) && projectCount.length > 0) {
        const count = Number((projectCount as any[])[0].count);
        data.overview.totalProjects.value = count;
        data.overview.totalProjects.formattedValue = count.toLocaleString();
        data.usage.totalProjects = count;
      }
    } catch {
      // Database not available, continue with in-memory data
    }

    return json({ success: true, data, cached: false });
  } catch (error) {
    logger.error('Analytics dashboard error:', error);
    return json({ success: false, error: 'Failed to fetch analytics', data: null }, { status: 500 });
  }
}
