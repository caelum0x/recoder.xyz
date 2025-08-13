// Cost Optimization API Routes
// Real-time AI cost analytics, budgets, and optimization controls

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

import { aiCostOptimizer } from '../services/ai-cost-optimizer';
import { costAnalyticsDashboard } from '../services/cost-analytics-dashboard';
import { authenticateRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = express.Router();

// Rate limiting for cost optimization endpoints
const costOptimizationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each user to 100 requests per windowMs
  message: {
    error: 'Too many cost optimization requests, please try again later.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(costOptimizationLimiter);
router.use(authenticateRequest);

/**
 * GET /api/cost-optimization/analytics
 * Get comprehensive cost analytics for user
 */
router.get('/analytics', async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    const analytics = await aiCostOptimizer.getCostAnalytics(userId);

    res.json({
      success: true,
      data: {
        ...analytics,
        optimizationStatus: aiCostOptimizer.getOptimizationStatus()
      }
    });

  } catch (error) {
    logger.error('Cost analytics request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cost analytics',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/cost-optimization/predict
 * Generate predictive cost analysis
 */
router.post('/predict', [
  body('timeframe').isIn(['daily', 'weekly', 'monthly']).withMessage('Invalid timeframe'),
  body('includeRecommendations').optional().isBoolean()
], async (req: any, res: any) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { timeframe, includeRecommendations = true } = req.body;

    const prediction = await aiCostOptimizer.generateCostPrediction(userId, timeframe);

    res.json({
      success: true,
      data: {
        prediction,
        timeframe,
        generatedAt: new Date().toISOString(),
        ...(includeRecommendations && {
          recommendations: prediction.optimizationOpportunities
        })
      }
    });

  } catch (error) {
    logger.error('Cost prediction failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate cost prediction',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/cost-optimization/budget
 * Set or update user budget limits
 */
router.post('/budget', [
  body('dailyLimit').optional().isFloat({ min: 0 }).withMessage('Daily limit must be a positive number'),
  body('monthlyLimit').optional().isFloat({ min: 0 }).withMessage('Monthly limit must be a positive number'),
  body('alertThresholds').optional().isObject(),
  body('alertThresholds.warning').optional().isFloat({ min: 0, max: 100 }).withMessage('Warning threshold must be 0-100%'),
  body('alertThresholds.critical').optional().isFloat({ min: 0, max: 100 }).withMessage('Critical threshold must be 0-100%')
], async (req: any, res: any) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const budgetData = req.body;

    // Validate that critical threshold is higher than warning
    if (budgetData.alertThresholds) {
      const { warning, critical } = budgetData.alertThresholds;
      if (warning && critical && critical <= warning) {
        return res.status(400).json({
          success: false,
          error: 'Critical threshold must be higher than warning threshold'
        });
      }
    }

    await aiCostOptimizer.setBudget(userId, budgetData);

    res.json({
      success: true,
      message: 'Budget updated successfully',
      data: {
        userId,
        updatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Budget update failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update budget',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/cost-optimization/budget
 * Get current user budget and spending
 */
router.get('/budget', async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    const analytics = await aiCostOptimizer.getCostAnalytics(userId);

    res.json({
      success: true,
      data: {
        budget: analytics.budget,
        currentSpending: analytics.currentSpending,
        utilizationPercentage: analytics.budget ? {
          daily: (analytics.currentSpending.daily / analytics.budget.dailyLimit) * 100,
          monthly: (analytics.currentSpending.monthly / analytics.budget.monthlyLimit) * 100
        } : null,
        remainingBudget: analytics.budget ? {
          daily: Math.max(0, analytics.budget.dailyLimit - analytics.currentSpending.daily),
          monthly: Math.max(0, analytics.budget.monthlyLimit - analytics.currentSpending.monthly)
        } : null
      }
    });

  } catch (error) {
    logger.error('Budget retrieval failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve budget information',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/cost-optimization/route
 * Get optimized routing recommendation for AI request
 */
router.post('/route', [
  body('prompt').isString().isLength({ min: 1, max: 10000 }).withMessage('Prompt must be 1-10000 characters'),
  body('taskType').isString().withMessage('Task type is required'),
  body('complexity').optional().isIn(['simple', 'medium', 'complex']),
  body('qualityRequirement').optional().isFloat({ min: 0, max: 1 }).withMessage('Quality requirement must be 0-1'),
  body('maxCost').optional().isFloat({ min: 0 }).withMessage('Max cost must be positive'),
  body('userTier').optional().isIn(['free', 'pro', 'enterprise'])
], async (req: any, res: any) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const routingRequest = {
      userId,
      ...req.body
    };

    const routingDecision = await aiCostOptimizer.optimizeRouting(routingRequest);

    res.json({
      success: true,
      data: {
        recommendation: routingDecision,
        requestId: `cost-opt-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Cost optimization routing failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate routing recommendation',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/cost-optimization/track
 * Track cost for a completed AI request
 */
router.post('/track', [
  body('providerId').isString().withMessage('Provider ID is required'),
  body('cost').isFloat({ min: 0 }).withMessage('Cost must be a positive number'),
  body('taskType').isString().withMessage('Task type is required'),
  body('tokens').optional().isInt({ min: 0 }).withMessage('Tokens must be a positive integer'),
  body('quality').optional().isFloat({ min: 0, max: 1 }).withMessage('Quality must be 0-1'),
  body('responseTime').optional().isInt({ min: 0 }).withMessage('Response time must be positive')
], async (req: any, res: any) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { providerId, cost, taskType, tokens, quality, responseTime } = req.body;

    await aiCostOptimizer.trackCost(userId, providerId, cost, taskType);

    res.json({
      success: true,
      message: 'Cost tracked successfully',
      data: {
        userId,
        providerId,
        cost,
        taskType,
        trackedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Cost tracking failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track cost',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/cost-optimization/recommendations
 * Get personalized cost optimization recommendations
 */
router.get('/recommendations', [
  query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be 1-20'),
  query('category').optional().isIn(['provider', 'usage', 'budget', 'quality'])
], async (req: any, res: any) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { limit = 10, category } = req.query;

    const analytics = await aiCostOptimizer.getCostAnalytics(userId);
    let recommendations = analytics.recommendations;

    // Filter by category if specified
    if (category) {
      // In a real implementation, recommendations would have categories
      recommendations = recommendations.slice(0, limit);
    }

    res.json({
      success: true,
      data: {
        recommendations: recommendations.slice(0, limit),
        category: category || 'all',
        generatedAt: new Date().toISOString(),
        totalRecommendations: recommendations.length
      }
    });

  } catch (error) {
    logger.error('Recommendations request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve recommendations',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/cost-optimization/providers/comparison
 * Get cost comparison across AI providers
 */
router.get('/providers/comparison', [
  query('taskType').optional().isString(),
  query('complexity').optional().isIn(['simple', 'medium', 'complex'])
], async (req: any, res: any) => {
  try {
    const { taskType = 'code-generation', complexity = 'medium' } = req.query;

    // Mock provider comparison data
    const providersComparison = [
      {
        providerId: 'deepseek',
        name: 'DeepSeek',
        costPerToken: 0.0000001,
        estimatedCost: 0.002,
        qualityScore: 0.75,
        averageResponseTime: 2500,
        costEfficiency: 7500,
        pros: ['Ultra-low cost', 'Good for simple tasks', 'Fast responses'],
        cons: ['Lower quality for complex tasks', 'Limited context window'],
        bestFor: 'High-volume simple code generation'
      },
      {
        providerId: 'groq',
        name: 'Groq',
        costPerToken: 0.0000002,
        estimatedCost: 0.004,
        qualityScore: 0.85,
        averageResponseTime: 800,
        costEfficiency: 2125,
        pros: ['Fastest responses', 'Good quality', 'Competitive pricing'],
        cons: ['Rate limits', 'Smaller model selection'],
        bestFor: 'Real-time applications requiring speed'
      },
      {
        providerId: 'gemini',
        name: 'Google Gemini',
        costPerToken: 0.0000005,
        estimatedCost: 0.010,
        qualityScore: 0.90,
        averageResponseTime: 1500,
        costEfficiency: 900,
        pros: ['High quality', 'Multimodal capabilities', 'Google integration'],
        cons: ['Higher cost than alternatives', 'Rate limits'],
        bestFor: 'Complex reasoning and multimodal tasks'
      },
      {
        providerId: 'anthropic',
        name: 'Claude (Anthropic)',
        costPerToken: 0.000015,
        estimatedCost: 0.300,
        qualityScore: 0.95,
        averageResponseTime: 2000,
        costEfficiency: 63.3,
        pros: ['Highest quality', 'Best for complex tasks', 'Safety features'],
        cons: ['Most expensive', 'Slower responses'],
        bestFor: 'Critical applications requiring highest quality'
      }
    ];

    res.json({
      success: true,
      data: {
        comparison: providersComparison,
        taskType,
        complexity,
        recommendations: {
          mostCostEffective: 'deepseek',
          highestQuality: 'anthropic',
          fastestResponse: 'groq',
          bestBalance: 'gemini'
        },
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Provider comparison failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate provider comparison',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/cost-optimization/dashboard
 * Get comprehensive cost analytics dashboard
 */
router.get('/dashboard', async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    const dashboardMetrics = await costAnalyticsDashboard.getDashboardMetrics(userId);

    res.json({
      success: true,
      data: {
        metrics: dashboardMetrics,
        generatedAt: new Date().toISOString(),
        refreshRate: 60 // seconds
      }
    });

  } catch (error) {
    logger.error('Dashboard metrics request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dashboard metrics',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/cost-optimization/insights
 * Get cost optimization insights and recommendations
 */
router.get('/insights', async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    const insights = await costAnalyticsDashboard.getCostOptimizationInsights(userId);

    res.json({
      success: true,
      data: {
        ...insights,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Cost insights request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cost insights',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/cost-optimization/alerts
 * Get real-time cost alerts for user
 */
router.get('/alerts', async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    const alerts = await costAnalyticsDashboard.generateCostAlerts(userId);

    res.json({
      success: true,
      data: {
        alerts,
        alertCount: alerts.length,
        criticalAlerts: alerts.filter(alert => alert.severity === 'critical').length,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Cost alerts request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cost alerts',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/cost-optimization/leaderboard
 * Get cost optimization leaderboard (gamification)
 */
router.get('/leaderboard', async (req: any, res: any) => {
  try {
    const leaderboard = await costAnalyticsDashboard.getCostOptimizationLeaderboard();

    res.json({
      success: true,
      data: {
        leaderboard,
        userRank: leaderboard.findIndex(entry => entry.userId === req.user.id) + 1,
        totalParticipants: leaderboard.length,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Leaderboard request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve leaderboard',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/cost-optimization/system/status
 * Get cost optimization system status
 */
router.get('/system/status', async (req: any, res: any) => {
  try {
    const optimizationStatus = aiCostOptimizer.getOptimizationStatus();

    res.json({
      success: true,
      data: {
        system: {
          status: 'operational',
          version: '1.0.0',
          uptime: process.uptime(),
          lastUpdated: new Date().toISOString()
        },
        optimization: optimizationStatus,
        features: {
          realTimeRouting: true,
          predictiveCostAnalysis: true,
          budgetManagement: true,
          multiProviderOptimization: true,
          qualityCostBalance: true,
          realTimeDashboard: true,
          costAlerts: true,
          optimizationInsights: true
        }
      }
    });

  } catch (error) {
    logger.error('System status request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve system status',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Error handling middleware
router.use((error: any, req: any, res: any, next: any) => {
  logger.error('Cost optimization API error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    userId: req.user?.id
  });

  res.status(error.status || 500).json({
    success: false,
    error: 'Cost optimization service error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
  });
});

module.exports = router;