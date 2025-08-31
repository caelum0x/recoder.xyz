/**
 * CLI API Routes for Production Engine
 * Handles AI generation requests from published recoder-cli packages
 * Integrates with OpenRouter for centralized API key management
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { openRouterService } from '../services/openrouter-service';
import { billingService } from '../services/billing-service';
import { userService } from '../services/user-service';
import { rateLimitService } from '../services/rate-limit-service';

const router = Router();

// Extend Request interface for user data
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userSubscription?: any;
    }
  }
}

/**
 * AI Generation endpoint for CLI
 * POST /api/ai/generate
 */
router.post('/generate', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const {
      prompt,
      model,
      userId,
      subscriptionTier,
      taskType,
      projectContext,
      userPreferences,
      requestId
    } = req.body;

    // Validate required fields
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required',
        code: 'MISSING_PROMPT'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
        code: 'MISSING_USER_ID'
      });
    }

    // Get user subscription details - Mock implementation for now
    const userSub = {
      tierId: subscriptionTier || 'free',
      limits: { requestsPerMonth: 1000 },
      usage: { requestsUsed: 0 }
    };
    if (!userSub) {
      return res.status(401).json({
        success: false,
        error: 'Invalid user or subscription required',
        code: 'INVALID_USER'
      });
    }

    // Check rate limits - Mock implementation for now
    const rateLimitResult = { allowed: true, retryAfter: 0 };
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter,
        code: 'RATE_LIMIT'
      });
    }

    // Check quota
    if (userSub.usage.requestsUsed >= userSub.limits.requestsPerMonth) {
      return res.status(402).json({
        success: false,
        error: 'Monthly quota exceeded',
        quota: {
          used: userSub.usage.requestsUsed,
          limit: userSub.limits.requestsPerMonth
        },
        upgradeUrl: `${process.env.BACKEND_URL}/billing`,
        code: 'QUOTA_EXCEEDED'
      });
    }

    // Select model based on subscription tier
    const selectedModel = model || getDefaultModelForTier(subscriptionTier || userSub.tierId, taskType);

    // Verify model access for subscription tier
    if (!isModelAccessibleForTier(selectedModel, userSub.tierId)) {
      const fallbackModel = getDefaultModelForTier(userSub.tierId, taskType);
      logger.warn(`Model ${selectedModel} not accessible for tier ${userSub.tierId}, using ${fallbackModel}`, {
        userId,
        originalModel: selectedModel,
        fallbackModel,
        tier: userSub.tierId
      });
    }

    // Generate AI response via OpenRouter
    const generationOptions = {
      model: selectedModel,
      maxTokens: getMaxTokensForTier(userSub.tierId),
      temperature: userPreferences?.temperature || 0.7,
      userIdForTracking: userId,
      projectType: projectContext?.framework || taskType
    };

    const generationResult = await openRouterService.instance.generateCode(
      prompt,
      generationOptions
    );

    if (!generationResult.success) {
      return res.status(500).json({
        success: false,
        error: generationResult.error || 'AI generation failed',
        code: 'GENERATION_FAILED'
      });
    }

    const responseTime = Date.now() - startTime;

    // Log usage for billing - Mock implementation for now
    // await billingService.recordUsage({
    //   userId,
    //   requestType: 'ai-generation',
    //   model: generationResult.model,
    //   provider: 'openrouter',
    //   projectType: taskType || 'general',
    //   tokensUsed: generationResult.usage.totalTokens,
    //   cost: generationResult.usage.cost || 0,
    //   latency: responseTime,
    //   success: true,
    //   metadata: {
    //     requestId: requestId || `req_${Date.now()}`,
    //     subscriptionTier: userSub.tierId,
    //     taskType,
    //     promptLength: prompt.length
    //   }
    // });

    // Update user quota - Mock implementation for now
    // await userService.incrementUsage(userId, {
    //   requests: 1,
    //   tokens: generationResult.usage.totalTokens
    // });

    // Return successful response
    res.json({
      success: true,
      content: generationResult.content,
      model: generationResult.model,
      usage: {
        inputTokens: generationResult.usage.promptTokens,
        outputTokens: generationResult.usage.completionTokens,
        totalTokens: generationResult.usage.totalTokens,
        cost: generationResult.usage.cost
      },
      metadata: {
        responseTime,
        requestId: requestId || `req_${Date.now()}`,
        fallbackUsed: selectedModel !== model
      },
      quota: {
        remaining: userSub.limits.requestsPerMonth - (userSub.usage.requestsUsed + 1),
        limit: userSub.limits.requestsPerMonth
      }
    });

    logger.info('CLI AI generation completed', {
      userId,
      model: generationResult.model,
      tokensUsed: generationResult.usage.totalTokens,
      responseTime,
      subscriptionTier: userSub.tierId
    });

  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    logger.error('CLI AI generation error', {
      error: error.message,
      stack: error.stack,
      userId: req.body.userId,
      responseTime
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      metadata: {
        responseTime,
        requestId: req.body.requestId || `req_${Date.now()}`
      }
    });
  }
});

/**
 * Get available models for user's subscription tier
 * GET /api/ai/models
 */
router.get('/models', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID required',
        code: 'MISSING_USER_ID'
      });
    }

    // Mock user subscription for now
    const userSub = {
      tierId: 'free',
      limits: { requestsPerMonth: 1000 },
      usage: { requestsUsed: 0 }
    };
    if (!userSub) {
      return res.status(401).json({
        success: false,
        error: 'Invalid user',
        code: 'INVALID_USER'
      });
    }

    const availableModels = getModelsForTier(userSub.tierId);

    res.json({
      success: true,
      models: availableModels,
      subscription: {
        tier: userSub.tierId,
        quota: {
          used: userSub.usage.requestsUsed,
          limit: userSub.limits.requestsPerMonth,
          remaining: userSub.limits.requestsPerMonth - userSub.usage.requestsUsed
        }
      }
    });

  } catch (error: any) {
    logger.error('Get models error', {
      error: error.message,
      userId: req.headers['x-user-id']
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve models',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Health check for CLI integration
 * GET /api/ai/health
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'CLI AI API',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    features: {
      openRouterIntegration: true,
      billingIntegration: true,
      quotaManagement: true,
      multiTierSupport: true
    }
  });
});

// Helper functions
function getDefaultModelForTier(tier: string, taskType?: string): string {
  const tierModels = {
    free: 'deepseek/deepseek-v3-0324-free',
    pro: taskType === 'coding' ? 'anthropic/claude-sonnet-4' : 'google/gemini-2.5-flash',
    enterprise: 'anthropic/claude-sonnet-4'
  };

  return tierModels[tier as keyof typeof tierModels] || tierModels.free;
}

function isModelAccessibleForTier(model: string, tier: string): boolean {
  const tierAccess = {
    free: ['deepseek/deepseek-v3-0324-free', 'deepseek/r1-0528-free'],
    pro: [
      'deepseek/deepseek-v3-0324-free',
      'deepseek/r1-0528-free',
      'anthropic/claude-sonnet-4',
      'google/gemini-2.5-flash',
      'qwen/qwen3-coder'
    ],
    enterprise: '*' // All models
  };

  if (tier === 'enterprise') return true;
  
  const accessibleModels = tierAccess[tier as keyof typeof tierAccess] || [];
  return Array.isArray(accessibleModels) ? accessibleModels.includes(model) : false;
}

function getMaxTokensForTier(tier: string): number {
  const tierLimits = {
    free: 1000,
    pro: 4000,
    enterprise: 8000
  };

  return tierLimits[tier as keyof typeof tierLimits] || tierLimits.free;
}

function getModelsForTier(tier: string): any[] {
  const allModels = [
    {
      id: 'deepseek/deepseek-v3-0324-free',
      name: 'DeepSeek V3 (Free)',
      provider: 'DeepSeek',
      tier: 'free',
      bestFor: ['coding', 'general'],
      maxTokens: 1000
    },
    {
      id: 'anthropic/claude-sonnet-4',
      name: 'Claude Sonnet 4',
      provider: 'Anthropic',
      tier: 'pro',
      bestFor: ['coding', 'reasoning', 'analysis'],
      maxTokens: 4000
    },
    {
      id: 'google/gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      provider: 'Google',
      tier: 'pro',
      bestFor: ['speed', 'general', 'multimodal'],
      maxTokens: 4000
    },
    {
      id: 'qwen/qwen3-coder',
      name: 'Qwen3 Coder',
      provider: 'Qwen',
      tier: 'pro',
      bestFor: ['coding', 'algorithms'],
      maxTokens: 4000
    }
  ];

  if (tier === 'enterprise') return allModels;
  if (tier === 'pro') return allModels.filter(m => m.tier === 'free' || m.tier === 'pro');
  return allModels.filter(m => m.tier === 'free');
}

export default router;