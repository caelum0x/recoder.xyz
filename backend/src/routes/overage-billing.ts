/**
 * Overage Billing API Routes
 * Manages billing when users exceed their rate limits
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticate, requireAdmin } from '../middleware/auth';
import { overageBillingService } from '../services/overage-billing';
import { logger } from '../utils/logger';
import { APIResponse } from '../types';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * GET /api/overage/billing
 * Get user's overage billing history
 */
router.get('/billing', [
  query('month').optional().matches(/^\d{4}-\d{2}$/).withMessage('Month must be in YYYY-MM format')
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
    const { month } = req.query;

    const billings = await overageBillingService.getOverageBilling(
      userId,
      month as string
    );

    res.json({
      success: true,
      data: {
        billings,
        total: billings.length,
        month: month || new Date().toISOString().slice(0, 7)
      }
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to get overage billing', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get overage billing'
    } as APIResponse);
  }
});

/**
 * POST /api/overage/waive/:billingId
 * Waive an overage billing (admin only)
 */
router.post('/waive/:billingId', [
  requireAdmin,
  param('billingId').isString().notEmpty().withMessage('Billing ID is required'),
  body('reason').isString().isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10-500 characters')
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

    const { billingId } = req.params;
    const { reason } = req.body;

    const success = await overageBillingService.waiveOverageBilling(billingId, reason);

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Overage billing not found'
      } as APIResponse);
      return;
    }

    res.json({
      success: true,
      message: 'Overage billing waived successfully',
      data: {
        billingId,
        reason,
        waivedBy: req.user!.id,
        waivedAt: new Date()
      }
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to waive overage billing', {
      error: error instanceof Error ? error.message : 'Unknown error',
      billingId: req.params.billingId,
      adminId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to waive overage billing'
    } as APIResponse);
  }
});

/**
 * GET /api/overage/statistics
 * Get overage billing statistics (admin only)
 */
router.get('/statistics', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const statistics = await overageBillingService.getOverageStatistics();

    res.json({
      success: true,
      data: statistics
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to get overage statistics', {
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get overage statistics'
    } as APIResponse);
  }
});

/**
 * PUT /api/overage/config
 * Update overage billing configuration (admin only)
 */
router.put('/config', [
  requireAdmin,
  body('enableAutoBilling').optional().isBoolean().withMessage('enableAutoBilling must be boolean'),
  body('overageRate').optional().isFloat({ min: 0, max: 1 }).withMessage('overageRate must be between 0 and 1'),
  body('notificationThreshold').optional().isFloat({ min: 0, max: 1 }).withMessage('notificationThreshold must be between 0 and 1'),
  body('maxOveragePerMonth').optional().isFloat({ min: 0 }).withMessage('maxOveragePerMonth must be positive'),
  body('graceRequests').optional().isInt({ min: 0 }).withMessage('graceRequests must be non-negative integer')
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

    const config = req.body;
    overageBillingService.updateConfig(config);

    res.json({
      success: true,
      message: 'Overage billing configuration updated',
      data: config
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to update overage config', {
      error: error instanceof Error ? error.message : 'Unknown error',
      config: req.body,
      adminId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to update overage configuration'
    } as APIResponse);
  }
});

/**
 * GET /api/overage/health
 * Health check for overage billing service
 */
router.get('/health', (req: Request, res: Response): void => {
  const health = overageBillingService.healthCheck();
  
  res.json({
    success: true,
    data: health,
    message: 'Overage billing service health check'
  } as APIResponse);
});

/**
 * GET /api/overage/plans-info
 * Get overage billing plans information
 */
router.get('/plans-info', (req: Request, res: Response): void => {
  const plansInfo = [
    {
      planType: 'free',
      baseLimit: 100,
      overageRate: 0.005,
      graceRequests: 5,
      maxOverage: 5.00,
      description: 'Free plan with minimal overage allowance'
    },
    {
      planType: '$10/week',
      baseLimit: 500,
      overageRate: 0.003,
      graceRequests: 50,
      maxOverage: 25.00,
      description: 'Weekly plan with moderate overage rates'
    },
    {
      planType: '$20/month',
      baseLimit: 2000,
      overageRate: 0.002,
      graceRequests: 100,
      maxOverage: 50.00,
      description: 'Monthly plan with competitive overage rates'
    },
    {
      planType: '$100/month',
      baseLimit: 10000,
      overageRate: 0.001,
      graceRequests: 500,
      maxOverage: 200.00,
      description: 'Pro plan with low overage rates'
    },
    {
      planType: '$200/month',
      baseLimit: 50000,
      overageRate: 0.0005,
      graceRequests: 1000,
      maxOverage: 500.00,
      description: 'Premium plan with minimal overage rates'
    },
    {
      planType: 'enterprise',
      baseLimit: 'unlimited',
      overageRate: 0.0001,
      graceRequests: 10000,
      maxOverage: 10000.00,
      description: 'Enterprise plan with extensive overage allowance'
    }
  ];

  res.json({
    success: true,
    data: {
      plans: plansInfo,
      features: {
        automaticBilling: 'Overage charges are automatically billed to your payment method',
        graceRequests: 'Free requests allowed over your plan limit before billing starts',
        monthlyCapo: 'Maximum overage amount per month to prevent surprise charges',
        notifications: 'Proactive notifications when approaching and exceeding limits',
        flexibleWaiving: 'Admin ability to waive charges for special circumstances'
      }
    },
    message: 'Overage billing plans information'
  } as APIResponse);
});

export default router;
// CommonJS compatibility
module.exports = router;