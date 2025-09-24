const express = require('express');
const { body, validationResult } = require('express-validator');
const { AIProviderStatus, UsageAnalytics } = require('../models/index');
const { logger } = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const axios = require('axios');

const router = express.Router();

// AI Provider configurations
const AI_PROVIDERS = {
  anthropic: {
    name: 'Anthropic Claude',
    healthCheck: async () => {
      const start = Date.now();
      try {
        // Mock health check - replace with actual API call
        await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100));
        return {
          status: 'healthy',
          responseTime: Date.now() - start,
          errorRate: 0
        };
      } catch (error) {
        return {
          status: 'error',
          responseTime: Date.now() - start,
          errorRate: 100,
          error: error.message
        };
      }
    }
  },
  groq: {
    name: 'Groq',
    healthCheck: async () => {
      const start = Date.now();
      try {
        // Mock health check - replace with actual API call
        await new Promise(resolve => setTimeout(resolve, Math.random() * 150 + 50));
        return {
          status: 'healthy',
          responseTime: Date.now() - start,
          errorRate: 0
        };
      } catch (error) {
        return {
          status: 'error',
          responseTime: Date.now() - start,
          errorRate: 100,
          error: error.message
        };
      }
    }
  },
  gemini: {
    name: 'Google Gemini',
    healthCheck: async () => {
      const start = Date.now();
      try {
        // Mock health check - replace with actual API call
        await new Promise(resolve => setTimeout(resolve, Math.random() * 300 + 100));
        return {
          status: 'healthy',
          responseTime: Date.now() - start,
          errorRate: 0
        };
      } catch (error) {
        return {
          status: 'error',
          responseTime: Date.now() - start,
          errorRate: 100,
          error: error.message
        };
      }
    }
  },
  ollama: {
    name: 'Ollama',
    healthCheck: async () => {
      const start = Date.now();
      try {
        // Mock health check - replace with actual API call
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
        return {
          status: 'healthy',
          responseTime: Date.now() - start,
          errorRate: 0
        };
      } catch (error) {
        return {
          status: 'error',
          responseTime: Date.now() - start,
          errorRate: 100,
          error: error.message
        };
      }
    }
  },
  openai: {
    name: 'OpenAI',
    healthCheck: async () => {
      const start = Date.now();
      try {
        // Mock health check - replace with actual API call
        await new Promise(resolve => setTimeout(resolve, Math.random() * 250 + 100));
        return {
          status: 'degraded', // OpenAI marked as degraded for coding tasks
          responseTime: Date.now() - start,
          errorRate: 15
        };
      } catch (error) {
        return {
          status: 'error',
          responseTime: Date.now() - start,
          errorRate: 100,
          error: error.message
        };
      }
    }
  }
};

/**
 * @swagger
 * /api/ai-providers/status:
 *   get:
 *     summary: Get status of all AI providers
 *     tags: [AI Providers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI providers status retrieved successfully
 */
router.get('/status', authenticate, async (req, res, next) => {
  try {
    // Get all provider statuses from database
    const providerStatuses = await prisma.aIProviderStatus.findAll({
      order: [['lastCheckAt', 'DESC']]
    });

    // Create a map for easy lookup
    const statusMap = {};
    providerStatuses.forEach(status => {
      statusMap[status.provider] = {
        id: status.id,
        provider: status.provider,
        status: status.status,
        responseTime: status.responseTime,
        errorRate: status.errorRate,
        uptime: status.uptime,
        lastCheckAt: status.lastCheckAt,
        metadata: status.metadata
      };
    });

    // Ensure all providers have a status entry
    const allProviders = Object.keys(AI_PROVIDERS);
    for (const provider of allProviders) {
      if (!statusMap[provider]) {
        statusMap[provider] = {
          provider,
          status: 'unknown',
          responseTime: null,
          errorRate: null,
          uptime: null,
          lastCheckAt: null,
          metadata: {}
        };
      }
    }

    res.json({
      success: true,
      data: Object.values(statusMap),
      message: 'AI providers status retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get AI providers status:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/ai-providers/health-check:
 *   post:
 *     summary: Perform health check on all AI providers
 *     tags: [AI Providers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Health check completed successfully
 */
router.post('/health-check', authenticate, async (req, res, next) => {
  try {
    const healthResults = {};
    const providerNames = Object.keys(AI_PROVIDERS);

    // Perform health checks in parallel
    const healthPromises = providerNames.map(async (provider) => {
      try {
        const result = await AI_PROVIDERS[provider].healthCheck();
        healthResults[provider] = result;
        
        // Update or create provider status
        const [providerStatus] = await prisma.aIProviderStatus.upsert({
          provider,
          status: result.status,
          responseTime: result.responseTime,
          errorRate: result.errorRate,
          uptime: result.status === 'healthy' ? 100 : result.status === 'degraded' ? 85 : 0,
          lastCheckAt: new Date(),
          metadata: result.error ? { error: result.error } : {}
        });

        return { provider, result };
      } catch (error) {
        logger.error(`Health check failed for ${provider}:`, error);
        healthResults[provider] = {
          status: 'error',
          responseTime: null,
          errorRate: 100,
          error: error.message
        };
        return { provider, result: healthResults[provider] };
      }
    });

    await Promise.all(healthPromises);

    // Calculate overall system health
    const healthyProviders = Object.values(healthResults).filter(r => r.status === 'healthy').length;
    const degradedProviders = Object.values(healthResults).filter(r => r.status === 'degraded').length;
    const errorProviders = Object.values(healthResults).filter(r => r.status === 'error').length;

    const overallHealth = {
      healthy: healthyProviders,
      degraded: degradedProviders,
      error: errorProviders,
      total: providerNames.length,
      score: Math.round((healthyProviders + degradedProviders * 0.5) / providerNames.length * 100)
    };

    logger.info(`AI providers health check completed. Score: ${overallHealth.score}%`);

    res.json({
      success: true,
      data: {
        providers: healthResults,
        overall: overallHealth
      },
      message: 'Health check completed successfully'
    });

  } catch (error) {
    logger.error('Health check failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/ai-providers/costs:
 *   get:
 *     summary: Get cost analytics for AI provider usage
 *     tags: [AI Providers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *         description: Time frame for cost analysis
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *         description: Specific provider to analyze
 *     responses:
 *       200:
 *         description: Cost analytics retrieved successfully
 */
router.get('/costs', authenticate, async (req, res, next) => {
  try {
    const { timeframe = 'day', provider } = req.query;
    const userId = req.user.id;

    // Calculate time range based on timeframe
    const now = new Date();
    let startTime;

    switch (timeframe) {
      case 'hour':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'week':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default: // day
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Build where conditions
    const whereConditions = {
      userId,
      timestamp: { $gte: startTime },
      cost: { $ne: null }
    };

    if (provider) {
      whereConditions.provider = provider;
    }

    // Get usage analytics data
    const analytics = await prisma.usageAnalytics.findAll({
      where: whereConditions,
      attributes: ['provider', 'cost', 'tokens', 'timestamp', 'eventType', 'platform'],
      order: [['timestamp', 'DESC']]
    });

    // Calculate cost breakdown by provider
    const costByProvider = {};
    const tokensByProvider = {};
    const callsByProvider = {};

    analytics.forEach(record => {
      const providerName = record.provider || 'unknown';
      
      if (!costByProvider[providerName]) {
        costByProvider[providerName] = 0;
        tokensByProvider[providerName] = 0;
        callsByProvider[providerName] = 0;
      }
      
      costByProvider[providerName] += parseFloat(record.cost || 0);
      tokensByProvider[providerName] += parseInt(record.tokens || 0);
      callsByProvider[providerName] += 1;
    });

    // Calculate totals
    const totalCost = Object.values(costByProvider).reduce((sum, cost) => sum + cost, 0);
    const totalTokens = Object.values(tokensByProvider).reduce((sum, tokens) => sum + tokens, 0);
    const totalCalls = Object.values(callsByProvider).reduce((sum, calls) => sum + calls, 0);

    // Calculate cost efficiency (cost per token)
    const efficiency = {};
    Object.keys(costByProvider).forEach(provider => {
      efficiency[provider] = tokensByProvider[provider] > 0 ? 
        (costByProvider[provider] / tokensByProvider[provider] * 1000) : 0; // Cost per 1000 tokens
    });

    // Top recommendations based on cost efficiency
    const recommendations = Object.keys(efficiency)
      .sort((a, b) => efficiency[a] - efficiency[b])
      .slice(0, 3)
      .map(provider => ({
        provider,
        costPer1000Tokens: efficiency[provider].toFixed(4),
        reason: `Most cost-effective for tokens (${efficiency[provider].toFixed(4)}¢ per 1K tokens)`
      }));

    res.json({
      success: true,
      data: {
        timeframe,
        period: {
          start: startTime,
          end: now
        },
        totals: {
          cost: totalCost.toFixed(4),
          tokens: totalTokens,
          calls: totalCalls
        },
        breakdown: {
          costByProvider,
          tokensByProvider,
          callsByProvider,
          efficiency
        },
        recommendations
      },
      message: 'Cost analytics retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get cost analytics:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/ai-providers/configure:
 *   post:
 *     summary: Configure AI provider settings
 *     tags: [AI Providers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [anthropic, groq, gemini, ollama, openai]
 *               priority:
 *                 type: integer
 *                 description: Provider priority (1 = highest)
 *               enabled:
 *                 type: boolean
 *                 description: Whether the provider is enabled
 *               costLimit:
 *                 type: number
 *                 description: Daily cost limit in USD
 *     responses:
 *       200:
 *         description: Provider configured successfully
 */
router.post('/configure', authenticate, [
  body('provider')
    .isIn(['anthropic', 'groq', 'gemini', 'ollama', 'openai'])
    .withMessage('Provider must be one of: anthropic, groq, gemini, ollama, openai'),
  body('priority')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Priority must be an integer between 1 and 10'),
  body('enabled')
    .optional()
    .isBoolean()
    .withMessage('Enabled must be a boolean'),
  body('costLimit')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Cost limit must be a positive number')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { provider, priority, enabled, costLimit } = req.body;
    const userId = req.user.id;

    // For now, we'll store provider configurations in the AI provider status metadata
    // In a full implementation, you might want a separate user preferences table
    let providerStatus = await prisma.aIProviderStatus.findOne({
      where: { provider }
    });

    if (!providerStatus) {
      providerStatus = await prisma.aIProviderStatus.create({
        provider,
        status: 'unknown',
        metadata: {}
      });
    }

    // Update provider configuration
    const currentMetadata = providerStatus.metadata || {};
    const userConfig = currentMetadata.userConfigs || {};
    
    userConfig[userId] = {
      ...(userConfig[userId] || {}),
      ...(priority !== undefined && { priority }),
      ...(enabled !== undefined && { enabled }),
      ...(costLimit !== undefined && { costLimit }),
      updatedAt: new Date()
    };

    currentMetadata.userConfigs = userConfig;

    await providerStatus.update({
      metadata: currentMetadata
    });

    logger.info(`AI provider ${provider} configured for user ${req.user.email}`);

    res.json({
      success: true,
      data: {
        provider,
        configuration: userConfig[userId]
      },
      message: 'Provider configured successfully'
    });

  } catch (error) {
    logger.error('Provider configuration failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/ai-providers/recommend:
 *   post:
 *     summary: Get AI provider recommendation for a specific task
 *     tags: [AI Providers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               taskType:
 *                 type: string
 *                 enum: [coding, blockchain, security, analysis, chat, generation]
 *                 description: Type of task to get provider recommendation for
 *               priority:
 *                 type: string
 *                 enum: [speed, cost, quality]
 *                 description: Optimization priority
 *     responses:
 *       200:
 *         description: Provider recommendation retrieved successfully
 */
router.post('/recommend', authenticate, [
  body('taskType')
    .isIn(['coding', 'blockchain', 'security', 'analysis', 'chat', 'generation'])
    .withMessage('Task type must be one of: coding, blockchain, security, analysis, chat, generation'),
  body('priority')
    .optional()
    .isIn(['speed', 'cost', 'quality'])
    .withMessage('Priority must be one of: speed, cost, quality')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { taskType, priority = 'quality' } = req.body;

    // Get current provider statuses
    const providerStatuses = await prisma.aIProviderStatus.findAll();
    const healthyProviders = providerStatuses.filter(p => p.status === 'healthy' || p.status === 'degraded');

    // Provider specializations based on the CLAUDE.md context
    const specializations = {
      coding: {
        primary: ['groq'], // Fast coding, React/Next.js
        secondary: ['anthropic'], // Complex logic
        avoid: ['openai'] // Poor at coding tasks per CLAUDE.md
      },
      blockchain: {
        primary: ['anthropic'], // Blockchain, security, complex reasoning
        secondary: ['groq'],
        avoid: ['openai']
      },
      security: {
        primary: ['anthropic'], // Security agent per CLAUDE.md
        secondary: ['gemini'],
        avoid: ['openai']
      },
      analysis: {
        primary: ['gemini'], // Large codebases, multimodal
        secondary: ['anthropic'],
        avoid: []
      },
      chat: {
        primary: ['groq'], // Fast responses
        secondary: ['anthropic'],
        avoid: []
      },
      generation: {
        primary: ['anthropic'], // Complex reasoning
        secondary: ['gemini'],
        avoid: []
      }
    };

    const taskSpec = specializations[taskType];
    if (!taskSpec) {
      return res.status(400).json({
        error: {
          message: 'Invalid task type',
          code: 'INVALID_TASK_TYPE'
        }
      });
    }

    // Filter providers based on health and specialization
    const availableProviders = healthyProviders
      .filter(p => !taskSpec.avoid.includes(p.provider))
      .map(p => ({
        provider: p.provider,
        status: p.status,
        responseTime: p.responseTime,
        errorRate: p.errorRate,
        isPrimary: taskSpec.primary.includes(p.provider),
        isSecondary: taskSpec.secondary.includes(p.provider)
      }));

    if (availableProviders.length === 0) {
      return res.status(503).json({
        error: {
          message: 'No healthy AI providers available',
          code: 'NO_PROVIDERS_AVAILABLE'
        }
      });
    }

    // Sort providers based on priority
    let recommendedProvider;
    
    if (priority === 'speed') {
      // Prioritize by response time
      recommendedProvider = availableProviders
        .filter(p => p.responseTime !== null)
        .sort((a, b) => {
          // Primary providers get preference
          if (a.isPrimary && !b.isPrimary) return -1;
          if (!a.isPrimary && b.isPrimary) return 1;
          return a.responseTime - b.responseTime;
        })[0];
    } else if (priority === 'cost') {
      // For cost, prefer providers with lower historical costs
      // This is simplified - in practice, you'd use actual cost data
      const costRanking = { ollama: 1, groq: 2, gemini: 3, anthropic: 4, openai: 5 };
      recommendedProvider = availableProviders
        .sort((a, b) => {
          if (a.isPrimary && !b.isPrimary) return -1;
          if (!a.isPrimary && b.isPrimary) return 1;
          return costRanking[a.provider] - costRanking[b.provider];
        })[0];
    } else { // quality
      // Prioritize primary providers, then by error rate
      recommendedProvider = availableProviders
        .sort((a, b) => {
          if (a.isPrimary && !b.isPrimary) return -1;
          if (!a.isPrimary && b.isPrimary) return 1;
          if (a.isSecondary && !b.isSecondary) return -1;
          if (!a.isSecondary && b.isSecondary) return 1;
          return a.errorRate - b.errorRate;
        })[0];
    }

    // Provide fallback options
    const fallbackProviders = availableProviders
      .filter(p => p.provider !== recommendedProvider.provider)
      .slice(0, 2);

    logger.info(`AI provider recommendation: ${recommendedProvider.provider} for ${taskType} (priority: ${priority})`);

    res.json({
      success: true,
      data: {
        taskType,
        priority,
        recommended: {
          provider: recommendedProvider.provider,
          name: AI_PROVIDERS[recommendedProvider.provider].name,
          reason: recommendedProvider.isPrimary ? 
            `Specialized for ${taskType} tasks` : 
            `Best available option for ${taskType}`,
          status: recommendedProvider.status,
          responseTime: recommendedProvider.responseTime,
          errorRate: recommendedProvider.errorRate
        },
        fallbacks: fallbackProviders.map(p => ({
          provider: p.provider,
          name: AI_PROVIDERS[p.provider].name,
          status: p.status
        }))
      },
      message: 'Provider recommendation retrieved successfully'
    });

  } catch (error) {
    logger.error('Provider recommendation failed:', error);
    next(error);
  }
});

module.exports = router;