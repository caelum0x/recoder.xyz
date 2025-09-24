/**
 * Test Unified Payment API Routes (No Auth Required)
 * Handles payments across all Recoder frontends
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { unifiedPaymentService } from '../services/unified-payment-service';
import { logger } from '../utils/logger';
import { APIResponse } from '../types';

const router = Router();

// Real authentication middleware required
import { authenticateToken } from '../middleware/auth';
router.use(authenticateToken);

/**
 * GET /api/payments/plans
 * Get available subscription plans
 */
router.get('/plans', async (req: Request, res: Response): Promise<void> => {
  try {
    logger.info('Fetching subscription plans');
    
    const plans = await unifiedPaymentService.getSubscriptionPlans();
    
    res.json({
      success: true,
      data: plans,
      count: plans.length
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to fetch subscription plans', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch subscription plans'
    } as APIResponse);
  }
});

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

    logger.info('Creating payment', { userId, planId, amount, paymentType });

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

    res.status(201).json({
      success: true,
      data: result
    } as APIResponse);

  } catch (error) {
    logger.error('Payment creation failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id 
    });

    res.status(500).json({
      success: false,
      error: 'Payment creation failed'
    } as APIResponse);
  }
});

/**
 * GET /api/payments/subscription
 * Get user's current subscription
 */
router.get('/subscription', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    
    logger.info('Fetching user subscription', { userId });
    
    const subscription = await unifiedPaymentService.getUserSubscription(userId);
    
    res.json({
      success: true,
      data: subscription
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to fetch user subscription', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch subscription'
    } as APIResponse);
  }
});

/**
 * GET /api/payments/usage
 * Get user's usage statistics
 */
router.get('/usage', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    
    logger.info('Fetching usage statistics', { userId });
    
    const usage = await unifiedPaymentService.getUsageStats(userId);
    
    res.json({
      success: true,
      data: usage
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to fetch usage statistics', { 
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
 * POST /api/payments/usage/record
 * Record usage for billing
 */
router.post('/usage/record', [
  body('type').isString().notEmpty().withMessage('Usage type is required'),
  body('metadata').isObject().withMessage('Metadata is required')
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
    const { type, metadata } = req.body;

    logger.info('Recording usage', { userId, type, metadata });

    const result = await unifiedPaymentService.recordUsage(userId, type, metadata);

    res.json({
      success: true,
      data: result
    } as APIResponse);

  } catch (error) {
    logger.error('Usage recording failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id 
    });

    // Check for usage limit errors
    if (error instanceof Error && error.message.includes('limit')) {
      res.status(429).json({
        success: false,
        error: error.message,
        code: error.message.includes('cost') ? 'COST_LIMIT_EXCEEDED' : 'USAGE_LIMIT_EXCEEDED'
      } as APIResponse);
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Usage recording failed'
    } as APIResponse);
  }
});

export default router;