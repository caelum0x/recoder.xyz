/**
 * Unified Payment API Routes
 * Handles payments across all Recoder frontends
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticate, requireEmailVerification } from '../middleware/auth';
import { unifiedPaymentService } from '../services/unified-payment-service';
import { logger } from '../utils/logger';
import { APIResponse } from '../types';

const router = Router();

// Apply authentication to all payment routes
router.use(authenticate);
router.use(requireEmailVerification);

/**
 * POST /api/payments/create
 * Create a new payment/subscription
 */
router.post('/create', [
  body('planId').isString().notEmpty().withMessage('Plan ID is required'),
  body('planName').isString().notEmpty().withMessage('Plan name is required'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('currency').isString().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('paymentType').isIn(['subscription', 'one_time', 'usage']).withMessage('Invalid payment type'),
  body('successUrl').optional().isURL().withMessage('Success URL must be valid'),
  body('cancelUrl').optional().isURL().withMessage('Cancel URL must be valid'),
  body('frontend').optional().isIn(['web', 'chat', 'mobile', 'desktop', 'cli']).withMessage('Invalid frontend'),
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
      planId,
      planName,
      amount,
      currency,
      paymentType,
      successUrl,
      cancelUrl,
      frontend = 'web',
      metadata = {}
    } = req.body;

    const result = await unifiedPaymentService.createPayment({
      userId,
      planId,
      planName,
      amount,
      currency,
      paymentType,
      successUrl,
      cancelUrl,
      frontend,
      metadata
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
        code: result.code
      } as APIResponse);
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        paymentId: result.paymentId,
        checkoutUrl: result.checkoutUrl
      }
    } as APIResponse);

  } catch (error) {
    logger.error('Payment creation error', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    
    res.status(500).json({
      success: false,
      error: 'Internal payment service error'
    } as APIResponse);
  }
});

/**
 * GET /api/payments/subscription
 * Get user's current subscription info
 */
router.get('/subscription', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const subscription = await unifiedPaymentService.getSubscriptionInfo(userId);

    res.json({
      success: true,
      data: subscription
    } as APIResponse);

  } catch (error) {
    logger.error('Subscription info error', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve subscription information'
    } as APIResponse);
  }
});

/**
 * POST /api/payments/subscription/cancel
 * Cancel user's subscription
 */
router.post('/subscription/cancel', [
  body('cancelImmediately').optional().isBoolean().withMessage('cancelImmediately must be boolean')
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
    const { cancelImmediately = false } = req.body;

    const result = await unifiedPaymentService.cancelSubscription(userId, cancelImmediately);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
        code: result.code
      } as APIResponse);
      return;
    }

    res.json({
      success: true,
      data: {
        subscriptionId: result.subscriptionId,
        cancelImmediately
      }
    } as APIResponse);

  } catch (error) {
    logger.error('Subscription cancellation error', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to cancel subscription'
    } as APIResponse);
  }
});

/**
 * GET /api/payments/usage
 * Get user's usage information and costs
 */
router.get('/usage', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const usage = await unifiedPaymentService.getUsageInfo(userId);

    res.json({
      success: true,
      data: usage
    } as APIResponse);

  } catch (error) {
    logger.error('Usage info error', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve usage information'
    } as APIResponse);
  }
});

/**
 * POST /api/payments/usage/record
 * Record usage for billing purposes
 */
router.post('/usage/record', [
  body('type').isString().notEmpty().withMessage('Usage type is required'),
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
    const { type, metadata = {} } = req.body;

    await unifiedPaymentService.recordUsage(userId, type, metadata);

    res.json({
      success: true,
      message: 'Usage recorded successfully'
    } as APIResponse);

  } catch (error) {
    logger.error('Usage recording error', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to record usage'
    } as APIResponse);
  }
});

/**
 * GET /api/payments/plans
 * Get available payment plans
 */
router.get('/plans', async (req: Request, res: Response): Promise<void> => {
  try {
    const plans = [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'USD',
        interval: 'month',
        features: [
          '100 AI requests per month',
          '10 requests per day',
          'Basic templates',
          'Community support'
        ],
        limits: {
          monthlyRequests: 100,
          dailyRequests: 10,
          projects: 3,
          storage: '1GB'
        }
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 19.99,
        currency: 'USD',
        interval: 'month',
        features: [
          '2,000 AI requests per month',
          '200 requests per day',
          'Advanced templates',
          'Premium AI models',
          'Priority support',
          'Custom integrations'
        ],
        limits: {
          monthlyRequests: 2000,
          dailyRequests: 200,
          projects: 25,
          storage: '10GB'
        }
      },
      {
        id: 'premium',
        name: 'Premium',
        price: 49.99,
        currency: 'USD',
        interval: 'month',
        features: [
          '10,000 AI requests per month',
          '1,000 requests per day',
          'All templates and features',
          'Multiple AI providers',
          'Advanced analytics',
          'Team collaboration',
          '24/7 priority support'
        ],
        limits: {
          monthlyRequests: 10000,
          dailyRequests: 1000,
          projects: 100,
          storage: '100GB'
        }
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 199.99,
        currency: 'USD',
        interval: 'month',
        features: [
          '50,000 AI requests per month',
          '5,000 requests per day',
          'Custom AI models',
          'Enterprise integrations',
          'Advanced security',
          'Dedicated support',
          'Custom contracts'
        ],
        limits: {
          monthlyRequests: 50000,
          dailyRequests: 5000,
          projects: 'unlimited',
          storage: '1TB'
        }
      }
    ];

    res.json({
      success: true,
      data: plans
    } as APIResponse);

  } catch (error) {
    logger.error('Plans retrieval error', { 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve plans'
    } as APIResponse);
  }
});

/**
 * GET /api/payments/health
 * Payment service health check
 */
router.get('/health', (req: Request, res: Response): void => {
  res.json({
    success: true,
    message: 'Unified payment service is healthy',
    timestamp: new Date().toISOString(),
    features: {
      subscriptionManagement: true,
      usageTracking: true,
      multiplePaymentTypes: true,
      multiFrontendSupport: true,
      realTimeUsageMonitoring: true
    }
  } as APIResponse);
});

export default router;
// CommonJS compatibility
module.exports = router;
