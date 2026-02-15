/**
 * AI Usage Analytics API
 * AI usage analytics from llmAnalytics
 */

import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { llmAnalytics } from '~/lib/.server/llm/analytics';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AnalyticsAI');

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const env = (context as any)?.cloudflare?.env || process.env as unknown as Env;
    const url = new URL(request.url);

    // Admin auth check
    const userId = url.searchParams.get('userId') || request.headers.get('x-user-id');
    const adminIds = ((env as any).ADMIN_USER_IDS || '').split(',').map((id: string) => id.trim()).filter(Boolean);
    if (adminIds.length > 0 && (!userId || !adminIds.includes(userId))) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    const costAnalytics = llmAnalytics.getCostAnalytics();
    const optimizationStats = llmAnalytics.getOptimizationStats();

    return json({
      totalRequests: costAnalytics.totalRequests,
      totalTokensSaved: costAnalytics.totalTokensSaved,
      totalCostSaved: costAnalytics.totalCostSaved,
      averageSavingsPercentage: costAnalytics.averageSavingsPercentage,
      strategyEffectiveness: costAnalytics.strategyEffectiveness,
      optimization: {
        templateBasedSavings: optimizationStats.templateBasedSavings,
        modelRoutedSavings: optimizationStats.modelRoutedSavings,
        freeModelUsage: optimizationStats.freeModelUsage,
        averageCost: optimizationStats.averageCost,
        templateUsageCount: optimizationStats.templateUsageCount,
        templateUsagePercent: optimizationStats.templateUsagePercent,
        topTemplates: optimizationStats.topTemplates,
      },
    });
  } catch (error) {
    logger.error('AI analytics error:', error);
    return json({ error: 'Failed to fetch AI analytics' }, { status: 500 });
  }
}
