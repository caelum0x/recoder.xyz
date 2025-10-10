/**
 * User Settings Routes
 * Handles user profile, API keys, and preferences
 */

import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { userService } from '../services/user-service';
import { usageTrackingService } from '../services/usage-tracking-service';
import { logger } from '../utils/logger';
import { validateApiKeyFormat, maskApiKey } from '../utils/encryption';

const router = Router();

/**
 * @route GET /api/user/profile
 * @desc Get current user profile
 * @access Private
 */
router.get('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await userService.getUserById(userId);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          subscriptionPlan: user.subscriptionPlan,
          subscriptionStatus: user.subscriptionStatus,
          emailVerified: user.emailVerified,
          hasOwnApiKey: user.hasOwnApiKey,
          onboardingStep: user.onboardingStep,
          preferredModels: user.preferredModels,
          routerEnabled: user.routerEnabled,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt
        },
        quota: user.quotas[0] || null
      }
    });
  } catch (error) {
    logger.error('Failed to get user profile', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get profile'
    });
  }
});

/**
 * @route PUT /api/user/profile
 * @desc Update user profile
 * @access Private
 */
router.put('/profile',
  authenticate,
  [
    body('name').optional().trim().isLength({ min: 1, max: 100 }),
    body('avatar').optional().isURL(),
    body('preferredModels').optional().isArray(),
    body('onboardingStep').optional().isString()
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const userId = req.user!.id;
      const { name, avatar, preferredModels, onboardingStep } = req.body;

      const updatedUser = await userService.updateUser(userId, {
        name,
        avatar,
        preferredModels,
        onboardingStep
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: { user: updatedUser }
      });
    } catch (error) {
      logger.error('Failed to update user profile', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to update profile'
      });
    }
  }
);

/**
 * @route POST /api/user/api-key
 * @desc Add or update OpenRouter API key
 * @access Private
 */
router.post('/api-key',
  authenticate,
  [
    body('apiKey').isString().trim().notEmpty().withMessage('API key is required')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const userId = req.user!.id;
      const { apiKey } = req.body;

      // Validate API key format
      if (!validateApiKeyFormat(apiKey)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid API key format',
          message: 'Please provide a valid OpenRouter API key (starts with sk-or-)'
        });
      }

      // Validate API key with OpenRouter
      const isValid = await userService.validateOpenRouterKey(apiKey);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid API key',
          message: 'The provided API key is not valid. Please check and try again.'
        });
      }

      // Store encrypted API key
      const updatedUser = await userService.updateUser(userId, {
        openRouterApiKey: apiKey,
        onboardingStep: 'completed'
      });

      logger.info('User API key added', { 
        userId, 
        keyPreview: maskApiKey(apiKey) 
      });

      res.json({
        success: true,
        message: 'API key added successfully',
        data: {
          user: {
            id: updatedUser.id,
            hasOwnApiKey: updatedUser.hasOwnApiKey,
            onboardingStep: updatedUser.onboardingStep
          }
        }
      });
    } catch (error) {
      logger.error('Failed to add API key', { error, userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to add API key'
      });
    }
  }
);

/**
 * @route DELETE /api/user/api-key
 * @desc Delete user's OpenRouter API key
 * @access Private
 */
router.delete('/api-key', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await userService.deleteUserApiKey(userId);

    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete API key', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to delete API key'
    });
  }
});

/**
 * @route GET /api/user/api-key/status
 * @desc Check if user has API key configured
 * @access Private
 */
router.get('/api-key/status', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await userService.getUserById(userId);

    res.json({
      success: true,
      data: {
        hasApiKey: user.hasOwnApiKey,
        onboardingComplete: user.onboardingStep === 'completed',
        requiresApiKey: user.subscriptionPlan === 'free'
      }
    });
  } catch (error) {
    logger.error('Failed to get API key status', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get API key status'
    });
  }
});

/**
 * @route GET /api/user/usage/stats
 * @desc Get usage statistics
 * @access Private
 */
router.get('/usage/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const days = parseInt(req.query.days as string) || 30;

    const stats = await usageTrackingService.getUsageStats(userId, days);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get usage stats', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get usage statistics'
    });
  }
});

/**
 * @route GET /api/user/usage/recent
 * @desc Get recent usage records
 * @access Private
 */
router.get('/usage/recent', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const records = await usageTrackingService.getRecentUsage(userId, limit);

    res.json({
      success: true,
      data: { records }
    });
  } catch (error) {
    logger.error('Failed to get recent usage', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get recent usage'
    });
  }
});

/**
 * @route GET /api/user/quota
 * @desc Check current quota status
 * @access Private
 */
router.get('/quota', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const [quotaCheck, warnings] = await Promise.all([
      usageTrackingService.checkQuota(userId),
      usageTrackingService.checkQuotaWarnings(userId)
    ]);

    res.json({
      success: true,
      data: {
        allowed: quotaCheck.allowed,
        reason: quotaCheck.reason,
        remaining: quotaCheck.remaining,
        limits: quotaCheck.limits,
        warnings: warnings
      }
    });
  } catch (error) {
    logger.error('Failed to check quota', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to check quota'
    });
  }
});

/**
 * @route GET /api/user/onboarding/status
 * @desc Get onboarding status
 * @access Private
 */
router.get('/onboarding/status', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const isComplete = await userService.isOnboardingComplete(userId);
    const user = await userService.getUserById(userId);

    res.json({
      success: true,
      data: {
        complete: isComplete,
        currentStep: user.onboardingStep,
        requiresApiKey: user.subscriptionPlan === 'free' && !user.hasOwnApiKey,
        nextStep: !isComplete ? (user.hasOwnApiKey ? 'explore' : 'add_api_key') : null
      }
    });
  } catch (error) {
    logger.error('Failed to get onboarding status', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get onboarding status'
    });
  }
});

export default router;
