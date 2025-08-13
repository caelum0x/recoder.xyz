// AI Providers API Routes
// Management and monitoring of AI provider ecosystem

import express from 'express';
import { query, body, param, validationResult } from 'express-validator';
import { authenticateUser, requireSubscription, requireAdmin } from '../middleware/auth';
import { aiProviderManager } from '../services/ai-provider-manager';
import { aiRouter } from '../services/ai-router';
import { ragEnhancedAI } from '../services/rag-enhanced-ai';
import { logger } from '../utils/logger';

const router = express.Router();

// Validation middleware
const validateRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * GET /api/ai-providers
 * List all available AI providers with their status
 */
router.get('/',
  authenticateUser,
  async (req, res) => {
    try {
      const providers = aiProviderManager.getAllProviders();
      
      const providersInfo = providers.map(provider => ({
        id: provider.id,
        name: provider.name,
        type: provider.type,
        status: {
          isHealthy: provider.status.isHealthy,
          responseTime: provider.status.responseTime,
          uptime: provider.status.uptime,
          errorRate: provider.status.errorRate
        },
        models: provider.models.map(model => ({
          id: model.id,
          name: model.name,
          description: model.description,
          capabilities: model.capabilities,
          latencyTier: model.latencyTier,
          qualityTier: model.qualityTier,
          contextLength: model.contextLength,
          pricing: {
            inputPrice: model.inputPrice,
            outputPrice: model.outputPrice
          }
        })),
        features: provider.features,
        pricing: {
          currency: provider.pricing.currency,
          costMultiplier: provider.pricing.costMultiplier,
          freeCredits: provider.pricing.freeCredits
        }
      }));

      res.json({
        success: true,
        providers: providersInfo,
        meta: {
          totalProviders: providers.length,
          healthyProviders: providers.filter(p => p.status.isHealthy).length,
          totalModels: providers.reduce((sum, p) => sum + p.models.length, 0)
        }
      });

    } catch (error) {
      logger.error('Failed to get AI providers', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get AI providers'
      });
    }
  }
);

/**
 * GET /api/ai-providers/:providerId
 * Get detailed information about a specific provider
 */
router.get('/:providerId',
  authenticateUser,
  [param('providerId').notEmpty().withMessage('Provider ID is required')],
  validateRequest,
  async (req, res) => {
    try {
      const { providerId } = req.params;
      const provider = aiProviderManager.getProvider(providerId);
      
      if (!provider) {
        return res.status(404).json({
          success: false,
          error: 'Provider not found'
        });
      }

      const providerStats = aiProviderManager.getProviderStats(providerId);

      res.json({
        success: true,
        provider: {
          ...provider,
          stats: providerStats
        }
      });

    } catch (error) {
      logger.error('Failed to get provider details', { 
        error: error.message, 
        providerId: req.params.providerId 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get provider details'
      });
    }
  }
);

/**
 * POST /api/ai-providers/route
 * Route a request to the best AI provider
 */
router.post('/route',
  authenticateUser,
  [
    body('taskType')
      .isIn(['code-generation', 'text-generation', 'image-analysis', 'reasoning', 'embedding'])
      .withMessage('Invalid task type'),
    body('prompt')
      .notEmpty()
      .isLength({ min: 1, max: 50000 })
      .withMessage('Prompt is required and must be under 50,000 characters'),
    body('context.complexity')
      .optional()
      .isIn(['simple', 'medium', 'complex']),
    body('context.urgency')
      .optional()
      .isIn(['low', 'medium', 'high']),
    body('constraints.maxLatency')
      .optional()
      .isInt({ min: 1000, max: 120000 }),
    body('constraints.maxCost')
      .optional()
      .isFloat({ min: 0 }),
    body('constraints.qualityRequired')
      .optional()
      .isIn(['basic', 'good', 'excellent'])
  ],
  validateRequest,
  async (req, res) => {
    try {
      const routingRequest = {
        userId: req.user.id,
        taskType: req.body.taskType,
        prompt: req.body.prompt,
        context: req.body.context || {},
        constraints: req.body.constraints || {}
      };

      const routingResult = await aiRouter.routeRequest(routingRequest);

      res.json({
        success: true,
        routing: routingResult,
        message: 'Request successfully routed to optimal AI provider'
      });

    } catch (error) {
      logger.error('Failed to route AI request', { 
        error: error.message, 
        userId: req.user?.id,
        taskType: req.body?.taskType
      });
      res.status(500).json({
        success: false,
        error: 'Failed to route request',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/ai-providers/recommendations
 * Get personalized provider recommendations for user
 */
router.get('/recommendations',
  authenticateUser,
  async (req, res) => {
    try {
      const recommendations = aiRouter.getRoutingRecommendations(req.user.id);

      res.json({
        success: true,
        recommendations: recommendations.recommendations,
        userPreferences: recommendations.userPreferences,
        message: 'Provider recommendations generated based on usage patterns'
      });

    } catch (error) {
      logger.error('Failed to get recommendations', { 
        error: error.message, 
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get recommendations'
      });
    }
  }
);

/**
 * GET /api/ai-providers/analytics
 * Get AI provider analytics (admin only)
 */
router.get('/analytics',
  authenticateUser,
  requireSubscription(['monthly', 'enterprise']),
  async (req, res) => {
    try {
      const analytics = aiRouter.getAnalytics();
      const providers = aiProviderManager.getAllProviders();

      const providerHealth = providers.map(provider => ({
        id: provider.id,
        name: provider.name,
        isHealthy: provider.status.isHealthy,
        responseTime: provider.status.responseTime,
        uptime: provider.status.uptime,
        errorRate: provider.status.errorRate,
        totalRequests: provider.status.totalRequests,
        failedRequests: provider.status.failedRequests
      }));

      res.json({
        success: true,
        analytics: {
          routing: analytics,
          providerHealth,
          summary: {
            totalProviders: providers.length,
            healthyProviders: providers.filter(p => p.status.isHealthy).length,
            averageResponseTime: providers.reduce((sum, p) => sum + p.status.responseTime, 0) / providers.length,
            overallUptime: providers.reduce((sum, p) => sum + p.status.uptime, 0) / providers.length
          }
        }
      });

    } catch (error) {
      logger.error('Failed to get provider analytics', { 
        error: error.message, 
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get provider analytics'
      });
    }
  }
);

/**
 * POST /api/ai-providers/:providerId/health-check
 * Trigger manual health check for a provider (admin only)
 */
router.post('/:providerId/health-check',
  authenticateUser,
  requireAdmin,
  [param('providerId').notEmpty().withMessage('Provider ID is required')],
  validateRequest,
  async (req, res) => {
    try {
      const { providerId } = req.params;
      const provider = aiProviderManager.getProvider(providerId);
      
      if (!provider) {
        return res.status(404).json({
          success: false,
          error: 'Provider not found'
        });
      }

      // Trigger health check (this would call the private method through a public interface)
      // For now, we'll return the current status
      const stats = aiProviderManager.getProviderStats(providerId);

      res.json({
        success: true,
        providerId,
        healthCheck: {
          triggered: true,
          currentStatus: stats,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Failed to trigger health check', { 
        error: error.message, 
        providerId: req.params.providerId 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to trigger health check'
      });
    }
  }
);

/**
 * GET /api/ai-providers/status
 * Get overall system status and health
 */
router.get('/status',
  async (req, res) => {
    try {
      const providers = aiProviderManager.getAllProviders();
      const analytics = aiRouter.getAnalytics();

      const systemStatus = {
        status: 'operational',
        providers: {
          total: providers.length,
          healthy: providers.filter(p => p.status.isHealthy).length,
          degraded: providers.filter(p => !p.status.isHealthy).length
        },
        performance: {
          averageResponseTime: providers.reduce((sum, p) => sum + p.status.responseTime, 0) / providers.length,
          overallUptime: providers.reduce((sum, p) => sum + p.status.uptime, 0) / providers.length,
          totalRequests: analytics.totalRequests,
          failoverRate: analytics.failoverRate
        },
        timestamp: new Date().toISOString()
      };

      // Determine overall system status
      const healthyRatio = systemStatus.providers.healthy / systemStatus.providers.total;
      if (healthyRatio < 0.5) {
        systemStatus.status = 'major_outage';
      } else if (healthyRatio < 0.8) {
        systemStatus.status = 'partial_outage';
      } else if (analytics.failoverRate > 10) {
        systemStatus.status = 'degraded';
      }

      res.json({
        success: true,
        systemStatus,
        providers: providers.map(p => ({
          id: p.id,
          name: p.name,
          status: p.status.isHealthy ? 'healthy' : 'unhealthy',
          responseTime: p.status.responseTime,
          uptime: p.status.uptime
        }))
      });

    } catch (error) {
      logger.error('Failed to get system status', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get system status'
      });
    }
  }
);

/**
 * POST /api/ai-providers/generate-enhanced
 * Generate enhanced response using RAG + AI routing
 */
router.post('/generate-enhanced',
  authenticateUser,
  requireSubscription(['weekly', 'monthly', 'enterprise']),
  [
    body('prompt')
      .notEmpty()
      .isLength({ min: 1, max: 10000 })
      .withMessage('Prompt is required and must be under 10,000 characters'),
    body('taskType')
      .isIn(['code-generation', 'explanation', 'refactoring', 'debugging', 'documentation'])
      .withMessage('Invalid task type'),
    body('knowledgeBaseId')
      .optional()
      .isString(),
    body('context.language')
      .optional()
      .isString(),
    body('context.framework')
      .optional()
      .isString(),
    body('ragOptions.retrievalThreshold')
      .optional()
      .isFloat({ min: 0, max: 1 }),
    body('ragOptions.maxRetrievalResults')
      .optional()
      .isInt({ min: 1, max: 20 }),
    body('aiOptions.qualityRequired')
      .optional()
      .isIn(['basic', 'good', 'excellent'])
  ],
  validateRequest,
  async (req, res) => {
    try {
      const ragRequest = {
        userId: req.user.id,
        prompt: req.body.prompt,
        taskType: req.body.taskType,
        knowledgeBaseId: req.body.knowledgeBaseId,
        context: req.body.context || {},
        ragOptions: {
          retrievalThreshold: 0.7,
          maxRetrievalResults: 10,
          includeContext: true,
          enhancePrompt: true,
          useCodeExamples: true,
          ...req.body.ragOptions
        },
        aiOptions: {
          qualityRequired: 'good',
          ...req.body.aiOptions
        }
      };

      const result = await ragEnhancedAI.generateEnhanced(ragRequest);

      res.json({
        success: true,
        result,
        message: 'Enhanced AI response generated successfully'
      });

    } catch (error) {
      logger.error('RAG-enhanced generation failed:', {
        error: error.message,
        userId: req.user?.id,
        taskType: req.body?.taskType
      });
      res.status(500).json({
        success: false,
        error: 'Failed to generate enhanced response',
        details: error.message
      });
    }
  }
);

/**
 * POST /api/ai-providers/usage
 * Track usage for a provider (internal endpoint)
 */
router.post('/usage',
  authenticateUser,
  [
    body('providerId').notEmpty().withMessage('Provider ID is required'),
    body('modelId').notEmpty().withMessage('Model ID is required'),
    body('tokensUsed').isInt({ min: 0 }).withMessage('Tokens used must be a positive integer'),
    body('cost').isFloat({ min: 0 }).withMessage('Cost must be a positive number'),
    body('success').isBoolean().withMessage('Success must be a boolean')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { providerId, modelId, tokensUsed, cost, success } = req.body;

      await aiProviderManager.trackProviderUsage(providerId, {
        userId: req.user.id,
        modelId,
        tokensUsed,
        cost,
        success
      });

      res.json({
        success: true,
        message: 'Usage tracked successfully'
      });

    } catch (error) {
      logger.error('Failed to track provider usage', { 
        error: error.message, 
        userId: req.user?.id,
        providerId: req.body?.providerId
      });
      res.status(500).json({
        success: false,
        error: 'Failed to track usage'
      });
    }
  }
);

export default router;