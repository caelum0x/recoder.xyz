import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getWebContainerHealth } from '~/lib/webcontainer';
import { performanceMetrics } from '~/lib/.server/llm/performance-metrics';
import { chatRateLimiter, apiRateLimiter } from '~/lib/.server/middleware/rate-limiter';

/**
 * Health Check Endpoint
 * Returns system health status for monitoring
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const detailed = url.searchParams.get('detailed') === 'true';

  // Basic health check
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime?.() || 0,
  };

  // Detailed health check
  if (detailed) {
    const webcontainerHealth = getWebContainerHealth();
    const perfStats = performanceMetrics.getStats();
    const costStats = performanceMetrics.getCostStats();
    const rateLimitStats = {
      chat: chatRateLimiter.getStats(),
      api: apiRateLimiter.getStats(),
    };

    return json({
      ...health,
      components: {
        webcontainer: {
          status: webcontainerHealth.healthy ? 'healthy' : 'unhealthy',
          loaded: webcontainerHealth.loaded,
          bootAttempts: webcontainerHealth.bootAttempts,
          lastBootTime: webcontainerHealth.lastBootTime,
        },
        performance: {
          status: perfStats.avgDuration < 3000 ? 'healthy' : 'degraded',
          avgDuration: perfStats.avgDuration,
          successRate: perfStats.successRate,
          totalRequests: perfStats.count,
        },
        costs: {
          totalEstimatedCost: costStats.totalEstimatedCost,
          totalTokensSaved: costStats.totalTokensSaved,
          totalRequests: costStats.totalRequests,
        },
        rateLimits: rateLimitStats,
      },
      metrics: {
        performance: perfStats,
        costs: costStats,
      },
    });
  }

  return json(health);
}

/**
 * Deep health check with dependency verification
 */
export async function action({ request }: LoaderFunctionArgs) {
  const checks = {
    timestamp: new Date().toISOString(),
    overall: 'healthy' as 'healthy' | 'unhealthy' | 'degraded',
    checks: {} as Record<string, { status: string; message?: string; duration?: number }>,
  };

  // Check WebContainer
  try {
    const start = Date.now();
    const wcHealth = getWebContainerHealth();
    checks.checks.webcontainer = {
      status: wcHealth.healthy && wcHealth.loaded ? 'pass' : 'fail',
      message: `Boot attempts: ${wcHealth.bootAttempts}, Last boot: ${wcHealth.lastBootTime}ms`,
      duration: Date.now() - start,
    };

    if (!wcHealth.healthy) {
      checks.overall = 'unhealthy';
    }
  } catch (error) {
    checks.checks.webcontainer = {
      status: 'fail',
      message: 'Health check failed',
    };
    checks.overall = 'unhealthy';
  }

  // Check metrics system
  try {
    const start = Date.now();
    const stats = performanceMetrics.getStats();
    checks.checks.metrics = {
      status: 'pass',
      message: `Tracking ${stats.count} operations`,
      duration: Date.now() - start,
    };
  } catch (error) {
    checks.checks.metrics = {
      status: 'fail',
      message: 'Metrics check failed',
    };
    checks.overall = 'degraded';
  }

  // Check rate limiters
  try {
    const start = Date.now();
    const chatStats = chatRateLimiter.getStats();
    const apiStats = apiRateLimiter.getStats();
    checks.checks.rateLimiters = {
      status: 'pass',
      message: `Chat: ${chatStats.totalEntries} entries, API: ${apiStats.totalEntries} entries`,
      duration: Date.now() - start,
    };
  } catch (error) {
    checks.checks.rateLimiters = {
      status: 'fail',
      message: 'Rate limiter check failed',
    };
    checks.overall = 'degraded';
  }

  // Check environment variables
  try {
    const start = Date.now();
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY;

    checks.checks.environment = {
      status: hasAnthropicKey || hasOpenRouterKey ? 'pass' : 'warn',
      message: `Anthropic: ${hasAnthropicKey}, OpenRouter: ${hasOpenRouterKey}`,
      duration: Date.now() - start,
    };

    if (!hasAnthropicKey && !hasOpenRouterKey) {
      checks.overall = 'degraded';
    }
  } catch (error) {
    checks.checks.environment = {
      status: 'fail',
      message: 'Environment check failed',
    };
  }

  const statusCode = checks.overall === 'healthy' ? 200 : checks.overall === 'degraded' ? 207 : 503;

  return json(checks, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
