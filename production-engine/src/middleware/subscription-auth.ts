/**
 * Subscription Authentication Middleware
 * Validates user subscription and enforces tier-based access control
 */

import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userSubscription?: {
        plan: 'free' | 'professional' | 'business' | 'enterprise';
        status: string;
        quotas: {
          used: number;
          limit: number;
          resetDate: Date;
        };
      };
    }
  }
}

export interface SubscriptionTiers {
  free: {
    requestsPerMonth: number;
    modelsAccess: string[];
    maxTokensPerRequest: number;
  };
  professional: {
    requestsPerMonth: number;
    modelsAccess: string[];
    maxTokensPerRequest: number;
  };
  business: {
    requestsPerMonth: number;
    modelsAccess: string[];
    maxTokensPerRequest: number;
  };
  enterprise: {
    requestsPerMonth: number;
    modelsAccess: string[];
    maxTokensPerRequest: number;
  };
}

const SUBSCRIPTION_TIERS: SubscriptionTiers = {
  free: {
    requestsPerMonth: 100,
    modelsAccess: ['deepseek/deepseek-v3-0324', 'deepseek/deepseek-reasoner'],
    maxTokensPerRequest: 4000
  },
  professional: {
    requestsPerMonth: 10000,
    modelsAccess: [
      'anthropic/claude-sonnet-4', 
      'google/gemini-2.5-flash', 
      'google/gemini-2.0-flash',
      'deepseek/deepseek-v3-0324', 
      'qwen/qwen3-coder',
      'anthropic/claude-3.7-sonnet'
    ],
    maxTokensPerRequest: 8000
  },
  business: {
    requestsPerMonth: 50000,
    modelsAccess: [
      'anthropic/claude-sonnet-4', 
      'google/gemini-2.5-flash', 
      'google/gemini-2.0-flash',
      'google/gemini-2.5-pro',
      'deepseek/deepseek-v3-0324', 
      'qwen/qwen3-coder',
      'anthropic/claude-3.7-sonnet',
      'moonshot/moonshot-v1-8k'
    ],
    maxTokensPerRequest: 16000
  },
  enterprise: {
    requestsPerMonth: 500000,
    modelsAccess: [
      'anthropic/claude-sonnet-4', 
      'google/gemini-2.5-flash', 
      'google/gemini-2.0-flash',
      'google/gemini-2.5-pro',
      'deepseek/deepseek-v3-0324', 
      'qwen/qwen3-coder',
      'anthropic/claude-3.7-sonnet',
      'moonshot/moonshot-v1-8k'
    ],
    maxTokensPerRequest: 32000
  }
};

/**
 * Authenticate user and validate subscription
 */
export async function authenticateSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.headers['x-user-id'] as string;
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!userId && !apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide x-user-id or x-api-key header.',
        code: 'AUTH_REQUIRED'
      });
    }
    
    // Extract user ID from API key if needed
    let effectiveUserId = userId;
    if (!effectiveUserId && apiKey) {
      // Call backend to validate API key and get user
      try {
        const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || 'https://api.recoder.xyz';
        const response = await axios.post(`${backendUrl}/api/cli-auth/verify`, {
          api_key: apiKey
        }, {
          timeout: 10000
        });
        
        if (response.data.success) {
          effectiveUserId = response.data.data.user.id;
          req.userSubscription = {
            plan: response.data.data.user.subscription,
            status: 'active',
            quotas: {
              used: 0, // Will be fetched separately if needed
              limit: SUBSCRIPTION_TIERS[response.data.data.user.subscription]?.requestsPerMonth || 100,
              resetDate: new Date()
            }
          };
        } else {
          return res.status(401).json({
            success: false,
            error: 'Invalid API key',
            code: 'INVALID_API_KEY'
          });
        }
      } catch (error) {
        logger.error('Backend API key validation failed:', error);
        return res.status(500).json({
          success: false,
          error: 'Authentication service unavailable',
          code: 'AUTH_SERVICE_ERROR'
        });
      }
    }
    
    if (!effectiveUserId) {
      return res.status(401).json({
        success: false,
        error: 'User identification required',
        code: 'USER_ID_REQUIRED'
      });
    }
    
    // Fetch subscription if not already set
    if (!req.userSubscription) {
      try {
        const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || 'https://api.recoder.xyz';
        const response = await axios.get(`${backendUrl}/api/cli-auth/subscription/${effectiveUserId}`, {
          timeout: 5000
        });
        
        if (response.data.success) {
          req.userSubscription = response.data.data.subscription;
        } else {
          // Default to free tier if subscription not found
          req.userSubscription = {
            plan: 'free',
            status: 'active',
            quotas: {
              used: 0,
              limit: SUBSCRIPTION_TIERS.free.requestsPerMonth,
              resetDate: new Date()
            }
          };
        }
      } catch (error) {
        logger.warn('Could not fetch subscription, defaulting to free tier:', error);
        req.userSubscription = {
          plan: 'free',
          status: 'active',
          quotas: {
            used: 0,
            limit: SUBSCRIPTION_TIERS.free.requestsPerMonth,
            resetDate: new Date()
          }
        };
      }
    }
    
    req.userId = effectiveUserId;
    next();
    
  } catch (error) {
    logger.error('Subscription authentication failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'INTERNAL_AUTH_ERROR'
    });
  }
}

/**
 * Check if user can access a specific model
 */
export function validateModelAccess(req: Request, res: Response, next: NextFunction) {
  const subscription = req.userSubscription;
  if (!subscription) {
    return res.status(401).json({
      success: false,
      error: 'Subscription information required',
      code: 'SUBSCRIPTION_REQUIRED'
    });
  }
  
  const requestedModel = req.body.model;
  if (!requestedModel) {
    return next(); // No specific model requested, will use default
  }
  
  const tierConfig = SUBSCRIPTION_TIERS[subscription.plan];
  if (!tierConfig) {
    return res.status(400).json({
      success: false,
      error: 'Invalid subscription plan',
      code: 'INVALID_SUBSCRIPTION_PLAN'
    });
  }
  
  // Check if user has access to the requested model
  if (!tierConfig.modelsAccess.includes(requestedModel)) {
    return res.status(403).json({
      success: false,
      error: `Model ${requestedModel} requires ${getMinimumTierForModel(requestedModel)} subscription or higher`,
      code: 'INSUFFICIENT_SUBSCRIPTION',
      upgradeUrl: `${process.env.NEXT_PUBLIC_WEB_URL || 'https://recoder.xyz'}/pricing`
    });
  }
  
  next();
}

/**
 * Check quota usage
 */
export function validateQuota(req: Request, res: Response, next: NextFunction) {
  const subscription = req.userSubscription;
  if (!subscription) {
    return res.status(401).json({
      success: false,
      error: 'Subscription information required',
      code: 'SUBSCRIPTION_REQUIRED'
    });
  }
  
  // Check if user has exceeded their quota
  if (subscription.quotas.used >= subscription.quotas.limit) {
    return res.status(429).json({
      success: false,
      error: `Monthly quota of ${subscription.quotas.limit} requests exceeded. Resets on ${subscription.quotas.resetDate.toISOString().split('T')[0]}`,
      code: 'QUOTA_EXCEEDED',
      upgradeUrl: `${process.env.NEXT_PUBLIC_WEB_URL || 'https://recoder.xyz'}/pricing`,
      quotaInfo: {
        used: subscription.quotas.used,
        limit: subscription.quotas.limit,
        resetDate: subscription.quotas.resetDate
      }
    });
  }
  
  next();
}

/**
 * Validate token limit for request
 */
export function validateTokenLimit(req: Request, res: Response, next: NextFunction) {
  const subscription = req.userSubscription;
  if (!subscription) {
    return res.status(401).json({
      success: false,
      error: 'Subscription information required',
      code: 'SUBSCRIPTION_REQUIRED'
    });
  }
  
  const requestedTokens = req.body.maxTokens || req.body.max_tokens || 4000;
  const tierConfig = SUBSCRIPTION_TIERS[subscription.plan];
  
  if (requestedTokens > tierConfig.maxTokensPerRequest) {
    return res.status(400).json({
      success: false,
      error: `Token limit of ${tierConfig.maxTokensPerRequest} exceeded for ${subscription.plan} plan. Requested: ${requestedTokens}`,
      code: 'TOKEN_LIMIT_EXCEEDED',
      upgradeUrl: `${process.env.NEXT_PUBLIC_WEB_URL || 'https://recoder.xyz'}/pricing`
    });
  }
  
  next();
}

/**
 * Get minimum subscription tier required for a model
 */
function getMinimumTierForModel(model: string): string {
  for (const [tier, config] of Object.entries(SUBSCRIPTION_TIERS)) {
    if (config.modelsAccess.includes(model)) {
      return tier;
    }
  }
  return 'enterprise'; // Default to highest tier if model not found
}

/**
 * Get subscription tier configuration
 */
export function getSubscriptionTiers(): SubscriptionTiers {
  return SUBSCRIPTION_TIERS;
}

/**
 * Middleware stack for complete subscription validation
 */
export const subscriptionAuthStack = [
  authenticateSubscription,
  validateModelAccess,
  validateQuota,
  validateTokenLimit
];