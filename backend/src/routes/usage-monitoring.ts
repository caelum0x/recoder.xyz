/**
 * Real-time Usage Monitoring API Routes
 * Provides endpoints for tracking and monitoring AI usage and costs
 */

import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { realTimeUsageTracker } from '../services/real-time-usage-tracker';
import { logger } from '../utils/logger';
import { APIResponse } from '../types';

const router = Router();

// Auth middleware - extract user from request
router.use((req: any, res: any, next: any) => {
  try {
    // Get user from authentication token or headers
    const authHeader = req.headers.authorization;
    const userIdHeader = req.headers['x-user-id'];
    
    if (authHeader?.startsWith('Bearer ')) {
      // In production, decode JWT token here
      req.user = {
        id: userIdHeader || 'authenticated-user',
        email: 'user@recoder.xyz',
        name: 'User',
        emailVerified: true
      };
    } else if (userIdHeader) {
      // Allow direct user ID for internal API calls
      req.user = {
        id: userIdHeader,
        email: `${userIdHeader}@recoder.xyz`,
        name: 'API User',
        emailVerified: true
      };
    } else {
      // Anonymous user for unauthenticated requests
      req.user = {
        id: 'anonymous-' + Date.now(),
        email: 'anonymous@recoder.xyz',
        name: 'Anonymous User',
        emailVerified: false
      };
    }
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    req.user = {
      id: 'fallback-user',
      email: 'fallback@recoder.xyz',
      name: 'Fallback User',
      emailVerified: false
    };
    next();
  }
});

/**
 * POST /track
 * Track AI usage in real-time
 */
router.post('/track', [
  body('provider').isString().notEmpty().withMessage('Provider is required'),
  body('model').isString().notEmpty().withMessage('Model is required'),
  body('inputTokens').isInt({ min: 0 }).withMessage('Input tokens must be a positive integer'),
  body('outputTokens').isInt({ min: 0 }).withMessage('Output tokens must be a positive integer'),
  body('feature').isString().notEmpty().withMessage('Feature is required'),
  body('platform').isString().notEmpty().withMessage('Platform is required'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object')
], async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      } as APIResponse);
      return;
    }

    const userId = req.user!.id;
    const {
      provider,
      model,
      inputTokens,
      outputTokens,
      feature,
      platform,
      metadata = {}
    } = req.body;

    logger.info('Tracking AI usage', { 
      userId, 
      provider, 
      model, 
      inputTokens, 
      outputTokens 
    });

    const result = await realTimeUsageTracker.trackUsage({
      userId,
      provider,
      model,
      inputTokens,
      outputTokens,
      feature,
      platform,
      metadata
    });

    if (!result.allowed) {
      res.status(429).json({
        success: false,
        error: result.warnings[0] || 'Usage limit exceeded',
        code: 'USAGE_LIMIT_EXCEEDED',
        data: {
          quotaStatus: result.quotaStatus,
          remainingTokens: result.remainingTokens,
          remainingCost: result.remainingCost,
          warnings: result.warnings
        }
      } as APIResponse);
      return;
    }

    res.json({
      success: true,
      data: {
        cost: result.cost,
        remainingTokens: result.remainingTokens,
        remainingCost: result.remainingCost,
        quotaStatus: result.quotaStatus,
        warnings: result.warnings
      }
    } as APIResponse);

  } catch (error) {
    logger.error('Usage tracking failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id 
    });

    // Check for specific limit errors
    if (error instanceof Error && error.message.includes('EMERGENCY STOP')) {
      res.status(503).json({
        success: false,
        error: 'Service temporarily unavailable due to cost limits',
        code: 'EMERGENCY_STOP'
      } as APIResponse);
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Usage tracking failed'
    } as APIResponse);
  }
});

/**
 * GET /stats
 * Get real-time usage statistics for the current user
 */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    
    logger.info('Fetching real-time usage stats', { userId });

    const stats = await realTimeUsageTracker.getRealTimeStats(userId);

    res.json({
      success: true,
      data: stats
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to fetch usage stats', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage statistics'
    } as APIResponse);
  }
});

/**
 * POST /release
 * Release a concurrent request slot (called when AI request completes)
 */
router.post('/release', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    
    realTimeUsageTracker.releaseRequest(userId);
    
    logger.info('Released concurrent request slot', { userId });

    res.json({
      success: true,
      message: 'Request slot released'
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to release request slot', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to release request slot'
    } as APIResponse);
  }
});

/**
 * GET /limits
 * Get current usage limits for the user's plan
 */
router.get('/limits', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    
    const stats = await realTimeUsageTracker.getRealTimeStats(userId);
    
    res.json({
      success: true,
      data: {
        planId: stats.planId,
        limits: {
          monthlyTokens: stats.monthlyUsage.tokensLimit,
          monthlyCost: stats.monthlyUsage.costLimit,
          dailyTokens: stats.dailyUsage.tokensLimit,
          dailyCost: stats.dailyUsage.costLimit,
          maxConcurrency: stats.concurrency.limit
        },
        current: {
          monthlyTokens: stats.monthlyUsage.tokens,
          monthlyCost: stats.monthlyUsage.cost,
          dailyTokens: stats.dailyUsage.tokens,
          dailyCost: stats.dailyUsage.cost,
          activeConcurrency: stats.concurrency.active
        },
        percentages: {
          monthlyTokens: stats.monthlyUsage.tokensPercentage,
          monthlyCost: stats.monthlyUsage.costPercentage
        },
        status: stats.quotaStatus
      }
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to fetch usage limits', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage limits'
    } as APIResponse);
  }
});

/**
 * GET /history
 * Get usage history with optional date filtering
 */
router.get('/history', [
  query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO8601'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid ISO8601'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
], async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      } as APIResponse);
      return;
    }

    const userId = req.user!.id;
    const {
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = req.query;

    logger.info('Fetching usage history', { userId, startDate, endDate, limit, offset });

    // Build date filter
    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate as string);
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate as string);
    }

    // For now, return mock data - in production this would query the database
    const mockHistory = Array.from({ length: Math.min(Number(limit), 20) }, (_, i) => ({
      id: `usage-${i + Number(offset)}`,
      timestamp: new Date(Date.now() - i * 3600000).toISOString(), // Every hour
      provider: ['anthropic', 'openai', 'google'][i % 3],
      model: ['claude-3-sonnet', 'gpt-4', 'gemini-1.5-pro'][i % 3],
      inputTokens: Math.floor(Math.random() * 1000) + 100,
      outputTokens: Math.floor(Math.random() * 500) + 50,
      estimatedCost: Math.random() * 0.05,
      feature: ['code_generation', 'chat', 'analysis'][i % 3],
      platform: 'web'
    }));

    res.json({
      success: true,
      data: {
        history: mockHistory,
        pagination: {
          total: 1000,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + Number(limit) < 1000
        }
      }
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to fetch usage history', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage history'
    } as APIResponse);
  }
});

/**
 * GET /cost-breakdown
 * Get detailed cost breakdown by provider and model
 */
router.get('/cost-breakdown', [
  query('period').optional().isIn(['day', 'week', 'month']).withMessage('Period must be day, week, or month')
], async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const period = req.query.period || 'month';

    logger.info('Fetching cost breakdown', { userId, period });

    // Mock cost breakdown data
    const breakdown = {
      period,
      totalCost: Math.random() * 50,
      breakdown: {
        byProvider: {
          anthropic: { cost: Math.random() * 20, percentage: 40 },
          openai: { cost: Math.random() * 15, percentage: 30 },
          google: { cost: Math.random() * 10, percentage: 20 },
          groq: { cost: Math.random() * 5, percentage: 10 }
        },
        byModel: {
          'claude-3-sonnet': { cost: Math.random() * 15, requests: 150 },
          'gpt-4': { cost: Math.random() * 12, requests: 80 },
          'gemini-1.5-pro': { cost: Math.random() * 8, requests: 120 },
          'claude-3-haiku': { cost: Math.random() * 5, requests: 200 }
        },
        byFeature: {
          code_generation: { cost: Math.random() * 20, percentage: 45 },
          chat: { cost: Math.random() * 15, percentage: 35 },
          analysis: { cost: Math.random() * 10, percentage: 20 }
        }
      },
      trends: {
        daily: Array.from({ length: 30 }, (_, i) => ({
          date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          cost: Math.random() * 2
        })).reverse()
      }
    };

    res.json({
      success: true,
      data: breakdown
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to fetch cost breakdown', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch cost breakdown'
    } as APIResponse);
  }
});

/**
 * GET /analytics
 * Get comprehensive usage analytics with trends and projections
 */
router.get('/analytics', [
  query('detailed').optional().isBoolean().withMessage('Detailed must be boolean'),
  query('includeProjections').optional().isBoolean().withMessage('Include projections must be boolean')
], async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { detailed = false, includeProjections = false } = req.query;

    logger.info('Fetching usage analytics', { userId, detailed, includeProjections });

    const stats = await realTimeUsageTracker.getRealTimeStats(userId);
    
    // Base analytics
    const analytics = {
      overview: {
        totalRequests: Math.floor(Math.random() * 1000) + 100,
        totalTokens: Math.floor(Math.random() * 100000) + 10000,
        totalCost: Math.random() * 100 + 10,
        averageCostPerRequest: Math.random() * 0.1 + 0.01,
        currentPlan: stats.planId,
        quotaStatus: stats.quotaStatus
      },
      currentMonth: {
        requests: stats.monthlyUsage.tokens / 100, // Approximate requests
        tokens: stats.monthlyUsage.tokens,
        cost: stats.monthlyUsage.cost,
        utilizationPercentage: stats.monthlyUsage.costPercentage
      },
      costSavings: {
        totalSaved: Math.random() * 50 + 10,
        cachingContribution: Math.random() * 20 + 5,
        smartRoutingContribution: Math.random() * 15 + 3,
        batchProcessingContribution: Math.random() * 10 + 2,
        componentReuseContribution: Math.random() * 5 + 1
      }
    };

    if (detailed === 'true') {
      analytics['detailed'] = {
        hourlyPattern: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          requests: Math.floor(Math.random() * 20),
          cost: Math.random() * 2
        })),
        weeklyTrend: Array.from({ length: 7 }, (_, day) => ({
          day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day],
          requests: Math.floor(Math.random() * 100) + 10,
          cost: Math.random() * 10 + 1
        })),
        topModels: [
          { model: 'claude-3-sonnet', usage: 45, cost: 15.2, efficiency: 0.85 },
          { model: 'gpt-4', usage: 25, cost: 12.8, efficiency: 0.78 },
          { model: 'gemini-1.5-pro', usage: 20, cost: 8.5, efficiency: 0.92 },
          { model: 'claude-3-haiku', usage: 10, cost: 3.1, efficiency: 0.95 }
        ],
        featureUsage: {
          'code-generation': { requests: 45, cost: 18.5, percentage: 45 },
          'chat': { requests: 35, cost: 12.3, percentage: 35 },
          'analysis': { requests: 20, cost: 6.2, percentage: 20 }
        }
      };
    }

    if (includeProjections === 'true') {
      const currentDayOfMonth = new Date().getDate();
      const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
      const projectedMonthlyCost = (stats.monthlyUsage.cost / currentDayOfMonth) * daysInMonth;
      
      analytics['projections'] = {
        projectedMonthlyCost,
        projectedAnnualCost: projectedMonthlyCost * 12,
        costTrend: projectedMonthlyCost > stats.monthlyUsage.costLimit * 0.8 ? 'increasing' : 'stable',
        recommendations: [
          'Enable prompt caching to reduce costs by up to 90%',
          'Consider batch processing for high-volume requests',
          'Use component library for common patterns'
        ],
        planRecommendation: projectedMonthlyCost > stats.monthlyUsage.costLimit ? {
          currentPlan: stats.planId,
          recommendedPlan: 'enterprise',
          reason: 'Projected usage exceeds current plan limits'
        } : null
      };
    }

    res.json({
      success: true,
      data: analytics
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to fetch usage analytics', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage analytics'
    } as APIResponse);
  }
});

/**
 * POST /alerts/configure
 * Configure usage alerts for the user
 */
router.post('/alerts/configure', [
  body('costThreshold').optional().isFloat({ min: 0 }).withMessage('Cost threshold must be positive'),
  body('usageThreshold').optional().isFloat({ min: 0, max: 100 }).withMessage('Usage threshold must be between 0-100'),
  body('enableRealTimeAlerts').optional().isBoolean().withMessage('Enable real-time alerts must be boolean'),
  body('alertChannels').optional().isArray().withMessage('Alert channels must be an array')
], async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      } as APIResponse);
      return;
    }

    const userId = req.user!.id;
    const {
      costThreshold,
      usageThreshold,
      enableRealTimeAlerts = true,
      alertChannels = ['dashboard']
    } = req.body;

    logger.info('Configuring usage alerts', { userId, costThreshold, usageThreshold });

    // Store configuration (in production this would be in database)
    const alertConfig = {
      userId,
      costThreshold,
      usageThreshold,
      enableRealTimeAlerts,
      alertChannels,
      updatedAt: new Date()
    };

    res.json({
      success: true,
      data: {
        configuration: alertConfig
      },
      message: 'Alert configuration updated successfully'
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to configure alerts', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to configure alerts'
    } as APIResponse);
  }
});

/**
 * GET /export
 * Export usage data in various formats
 */
router.get('/export', [
  query('format').optional().isIn(['json', 'csv']).withMessage('Format must be json or csv'),
  query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO8601'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid ISO8601')
], async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      } as APIResponse);
      return;
    }

    const userId = req.user!.id;
    const { format = 'json', startDate, endDate } = req.query;

    logger.info('Exporting usage data', { userId, format, startDate, endDate });

    // Generate sample export data
    const exportData = Array.from({ length: 100 }, (_, i) => ({
      timestamp: new Date(Date.now() - i * 3600000).toISOString(),
      provider: ['openrouter', 'anthropic', 'openai'][i % 3],
      model: ['claude-3-sonnet', 'gpt-4', 'gemini-1.5-pro'][i % 3],
      feature: ['chat', 'code-generation', 'analysis'][i % 3],
      platform: 'web',
      inputTokens: Math.floor(Math.random() * 1000) + 100,
      outputTokens: Math.floor(Math.random() * 500) + 50,
      cost: Math.random() * 0.1 + 0.01
    }));

    if (format === 'csv') {
      const csvHeader = 'Timestamp,Provider,Model,Feature,Platform,Input Tokens,Output Tokens,Cost\n';
      const csvRows = exportData.map(row => 
        `${row.timestamp},${row.provider},${row.model},${row.feature},${row.platform},${row.inputTokens},${row.outputTokens},${row.cost.toFixed(6)}`
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=usage-export.csv');
      res.send(csvHeader + csvRows);
    } else {
      res.json({
        success: true,
        data: {
          exportDate: new Date().toISOString(),
          period: { 
            start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            end: endDate || new Date().toISOString()
          },
          totalRecords: exportData.length,
          records: exportData
        }
      } as APIResponse);
    }

  } catch (error) {
    logger.error('Failed to export usage data', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to export usage data'
    } as APIResponse);
  }
});

export default router;

// CommonJS compatibility
module.exports = router;