/**
 * Real-Time Analytics API Routes
 * Provides live metrics and performance data from database
 */

import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateUser } from '../middleware/auth';
import { Logger } from '../utils/logger';

const router = express.Router();
const prisma = new PrismaClient();

// Helper to get date range
const getDateRange = (range: string) => {
  const endDate = new Date();
  const startDate = new Date();

  switch (range) {
    case '1h':
      startDate.setHours(startDate.getHours() - 1);
      break;
    case '24h':
      startDate.setHours(startDate.getHours() - 24);
      break;
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    default:
      startDate.setHours(startDate.getHours() - 24);
  }

  return { startDate, endDate };
};

/**
 * GET /api/analytics/real-time
 * Get real-time metrics from database
 */
router.get('/real-time', authenticateUser, async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '24h';
    const { startDate, endDate } = getDateRange(range);
    const userId = req.user?.id;

    // Get active users count (users with activity in last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeUsers = await prisma.usageRecord.groupBy({
      by: ['userId'],
      where: {
        timestamp: {
          gte: fiveMinutesAgo
        }
      },
      _count: true
    });

    // Get usage statistics for the time range
    const usageStats = await prisma.usageRecord.aggregate({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      _sum: {
        tokensUsed: true,
        cost: true
      },
      _avg: {
        responseTime: true
      },
      _count: true
    });

    // Calculate success rate
    const successfulRequests = await prisma.usageRecord.count({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate
        },
        status: 'success'
      }
    });

    const totalRequests = usageStats._count;
    const successRate = totalRequests > 0 ? successfulRequests / totalRequests : 0;

    // Calculate requests per minute
    const timeRangeMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
    const requestsPerMinute = totalRequests / timeRangeMinutes;

    // Get active projects count
    const activeProjects = await prisma.usageRecord.groupBy({
      by: ['sessionId'],
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate
        },
        sessionId: {
          not: null
        }
      }
    });

    res.json({
      activeUsers: activeUsers.length,
      requestsPerMinute: Math.round(requestsPerMinute),
      avgResponseTime: usageStats._avg.responseTime || 0,
      successRate: successRate,
      errorRate: 1 - successRate,
      totalTokensUsed: usageStats._sum.tokensUsed || 0,
      estimatedCost: usageStats._sum.cost || 0,
      activeProjects: activeProjects.length,
      timeRange: range,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    Logger.error('Failed to fetch real-time metrics:', error);
    res.status(500).json({
      error: 'Failed to fetch metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/model-performance
 * Get performance metrics by AI model
 */
router.get('/model-performance', authenticateUser, async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '24h';
    const { startDate, endDate } = getDateRange(range);

    // Get model statistics grouped by model
    const modelStats = await prisma.usageRecord.groupBy({
      by: ['model'],
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate
        },
        model: {
          not: null
        }
      },
      _avg: {
        responseTime: true,
        tokensUsed: true,
        cost: true
      },
      _sum: {
        tokensUsed: true,
        cost: true
      },
      _count: true
    });

    // Get success/error counts per model
    const modelPerformance = await Promise.all(
      modelStats.map(async (stat) => {
        const successCount = await prisma.usageRecord.count({
          where: {
            model: stat.model,
            timestamp: {
              gte: startDate,
              lte: endDate
            },
            status: 'success'
          }
        });

        const errorCount = stat._count - successCount;
        const successRate = stat._count > 0 ? successCount / stat._count : 0;

        // Calculate token efficiency (tokens per request)
        const tokenEfficiency = stat._avg.tokensUsed || 0;
        
        // Calculate cost per 1K tokens
        const totalTokens = stat._sum.tokensUsed || 1;
        const totalCost = stat._sum.cost || 0;
        const costPer1KTokens = (totalCost / totalTokens) * 1000;

        return {
          model: stat.model || 'Unknown',
          avgResponseTime: stat._avg.responseTime || 0,
          successRate: successRate,
          tokenEfficiency: tokenEfficiency / 1000, // Convert to K tokens
          costPer1KTokens: costPer1KTokens,
          requestCount: stat._count,
          errorCount: errorCount,
          totalCost: totalCost,
          totalTokens: totalTokens
        };
      })
    );

    res.json({
      models: modelPerformance.sort((a, b) => b.requestCount - a.requestCount),
      timeRange: range,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    Logger.error('Failed to fetch model performance:', error);
    res.status(500).json({
      error: 'Failed to fetch model performance',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/cost-analysis
 * Get cost breakdown by model and time
 */
router.get('/cost-analysis', authenticateUser, async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '24h';
    const { startDate, endDate } = getDateRange(range);

    // Get cost breakdown by model
    const costByModel = await prisma.usageRecord.groupBy({
      by: ['model'],
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate
        },
        model: {
          not: null
        }
      },
      _sum: {
        cost: true
      },
      _count: true
    });

    const totalCost = costByModel.reduce((sum, item) => sum + (item._sum.cost || 0), 0);

    const breakdown = costByModel.map(item => ({
      model: item.model || 'Unknown',
      totalCost: item._sum.cost || 0,
      requestCount: item._count,
      percentage: totalCost > 0 ? ((item._sum.cost || 0) / totalCost) * 100 : 0
    })).sort((a, b) => b.totalCost - a.totalCost);

    // Get daily cost trend
    const costTrend = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('day', timestamp) as date,
        SUM(cost) as total_cost,
        COUNT(*) as request_count
      FROM "UsageRecord"
      WHERE timestamp >= ${startDate} AND timestamp <= ${endDate}
      GROUP BY DATE_TRUNC('day', timestamp)
      ORDER BY date
    `;

    res.json({
      breakdown,
      totalCost,
      costTrend,
      timeRange: range,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    Logger.error('Failed to fetch cost analysis:', error);
    res.status(500).json({
      error: 'Failed to fetch cost analysis',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/optimization
 * Get AI-powered optimization recommendations
 */
router.get('/optimization', authenticateUser, async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '7d';
    const { startDate, endDate } = getDateRange(range);
    const userId = req.user?.id;

    const recommendations = [];

    // Check for high-cost model usage
    const expensiveModelUsage = await prisma.usageRecord.groupBy({
      by: ['model'],
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate
        },
        isPriceyModel: true
      },
      _sum: {
        cost: true
      },
      _count: true
    });

    if (expensiveModelUsage.length > 0) {
      const totalExpensiveCost = expensiveModelUsage.reduce((sum, item) => sum + (item._sum.cost || 0), 0);
      
      recommendations.push({
        type: 'cost_optimization',
        severity: 'medium',
        title: 'Consider Using Faster, Cheaper Models',
        description: `${expensiveModelUsage[0]._count} requests using premium models. Switching to Groq or Gemini Flash could save ~50% cost for similar quality.`,
        potentialSavings: totalExpensiveCost * 0.5,
        action: 'switch_model',
        actionData: {
          from: expensiveModelUsage[0].model,
          to: 'groq-llama-3.1-70b'
        }
      });
    }

    // Check for high error rates
    const errorStats = await prisma.usageRecord.groupBy({
      by: ['model'],
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate
        },
        status: {
          not: 'success'
        }
      },
      _count: true
    });

    for (const errorStat of errorStats) {
      const totalForModel = await prisma.usageRecord.count({
        where: {
          model: errorStat.model,
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        }
      });

      const errorRate = errorStat._count / totalForModel;
      
      if (errorRate > 0.05) { // More than 5% errors
        recommendations.push({
          type: 'reliability',
          severity: 'high',
          title: 'High Error Rate Detected',
          description: `${errorStat.model} showing ${(errorRate * 100).toFixed(1)}% error rate. Consider adding retry logic or switching models.`,
          errorRate: errorRate,
          action: 'add_retry',
          actionData: {
            model: errorStat.model,
            suggestedRetries: 3
          }
        });
      }
    }

    // Check for caching opportunities
    const duplicatePrompts = await prisma.$queryRaw`
      SELECT prompt, COUNT(*) as count
      FROM "UsageRecord"
      WHERE timestamp >= ${startDate} 
        AND timestamp <= ${endDate}
        AND prompt IS NOT NULL
      GROUP BY prompt
      HAVING COUNT(*) > 3
      ORDER BY count DESC
      LIMIT 10
    `;

    if (Array.isArray(duplicatePrompts) && duplicatePrompts.length > 0) {
      const cachableRequests = (duplicatePrompts as any[]).reduce((sum, item) => sum + item.count, 0);
      
      recommendations.push({
        type: 'caching',
        severity: 'medium',
        title: 'Enable Response Caching',
        description: `${cachableRequests} requests have similar patterns. Enable caching to reduce API calls and costs.`,
        potentialSavings: cachableRequests * 0.01, // Estimated savings
        action: 'enable_caching',
        actionData: {
          cachableRequests
        }
      });
    }

    res.json({
      recommendations,
      analysisDate: new Date().toISOString(),
      timeRange: range
    });

  } catch (error: any) {
    Logger.error('Failed to generate optimization recommendations:', error);
    res.status(500).json({
      error: 'Failed to generate recommendations',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/usage-timeline
 * Get hourly/daily usage timeline
 */
router.get('/usage-timeline', authenticateUser, async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '24h';
    const { startDate, endDate } = getDateRange(range);

    const grouping = range === '1h' || range === '24h' ? 'hour' : 'day';

    const timeline = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC(${grouping}, timestamp) as period,
        COUNT(*) as requests,
        SUM(tokens_used) as tokens,
        SUM(cost) as cost,
        AVG(response_time) as avg_response_time
      FROM "UsageRecord"
      WHERE timestamp >= ${startDate} AND timestamp <= ${endDate}
      GROUP BY DATE_TRUNC(${grouping}, timestamp)
      ORDER BY period
    `;

    res.json({
      timeline,
      grouping,
      timeRange: range,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    Logger.error('Failed to fetch usage timeline:', error);
    res.status(500).json({
      error: 'Failed to fetch timeline',
      message: error.message
    });
  }
});

export default router;
