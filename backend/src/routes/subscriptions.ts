// Subscription Management API Routes
// Handles DODO Payments integration for Recoder.xyz

import express, { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { getDodoPaymentsInstance, SubscriptionPlan, SUBSCRIPTION_PLANS } from '../services/dodo-payments';
import { authenticateUser } from '../middleware/auth';
import { logger } from '../utils/logger';
import { prisma } from '../database/prisma';
import { APIResponse } from '../types';
import * as crypto from 'crypto';

const router = express.Router();
const dodoPayments = getDodoPaymentsInstance();

// Validation middleware
const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
    return;
  }
  return next();
};

/**
 * GET /api/subscriptions/plans
 * Get available subscription plans
 */
router.get('/plans', (req: Request, res: Response) => {
  try {
    const plans = Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => ({
      ...plan,
      id: key,
      priceFormatted: `$${(plan.price / 100).toFixed(2)}`,
      billingPeriod: `${plan.intervalCount} ${plan.interval}${plan.intervalCount > 1 ? 's' : ''}`
    }));

    res.json({
      success: true,
      plans
    });
  } catch (error) {
    logger.error('Failed to get subscription plans', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription plans'
    });
  }
});

/**
 * POST /api/subscriptions/create
 * Create a new subscription
 */
router.post('/create',
  authenticateUser,
  [
    body('planId').isIn(Object.keys(SUBSCRIPTION_PLANS)).withMessage('Invalid plan ID'),
    body('billingAddress.country').isLength({ min: 2, max: 2 }).withMessage('Country must be 2-letter ISO code'),
    body('billingAddress.state').notEmpty().withMessage('State is required'),
    body('billingAddress.city').notEmpty().withMessage('City is required'),
    body('billingAddress.street').notEmpty().withMessage('Street address is required'),
    body('billingAddress.zipcode').notEmpty().withMessage('ZIP code is required'),
    body('returnUrl').optional().isURL().withMessage('Return URL must be valid')
  ],
  validateRequest,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { planId, billingAddress, returnUrl } = req.body;
      const user = req.user;

      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Check if user already has an active subscription
      const existingSubscription = await prisma.dodoSubscription.findFirst({
        where: {
          userId: user.id,
          status: { in: ['active', 'pending'] }
        }
      });

      if (existingSubscription) {
        res.status(400).json({
          success: false,
          error: 'User already has an active subscription'
        });
        return;
      }

      // Create subscription with DODO Payments
      const subscription = await dodoPayments.createSubscription({
        planId,
        customerName: user.name,
        customerEmail: user.email,
        billingAddress,
        returnUrl: returnUrl || `${process.env.NEXT_PUBLIC_WEB_URL}/subscription/success`,
        metadata: {
          userId: user.id.toString(),
          userEmail: user.email
        }
      });

      // Save subscription to database
      await prisma.dodoSubscription.create({
        data: {
          id: subscription.subscription_id,
          userId: user.id,
          planId,
          planName: SUBSCRIPTION_PLANS[planId]?.name || 'Unknown Plan',
          dodoSubscriptionId: subscription.subscription_id,
          status: 'pending',
          amount: subscription.recurring_pre_tax_amount,
          currency: 'USD',
          nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
        }
      });

      logger.info('Subscription created', {
        userId: user.id,
        subscriptionId: subscription.subscription_id,
        planId
      });

      res.json({
        success: true,
        subscription: {
          id: subscription.subscription_id,
          paymentLink: subscription.payment_link,
          amount: subscription.recurring_pre_tax_amount,
          planId
        }
      });
    } catch (error) {
      logger.error('Failed to create subscription', { error: error instanceof Error ? error.message : 'Unknown error', userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to create subscription'
      });
    }
  }
);

/**
 * GET /api/subscriptions
 * Get user's subscriptions
 */
router.get('/',
  authenticateUser,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Get subscriptions from database
      const subscriptions = await prisma.dodoSubscription.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' }
      });

      // Sync with DODO Payments
      const dodoSubscriptions = await dodoPayments.listSubscriptions();
      const userDodoSubs = dodoSubscriptions.filter(sub => 
        sub.customer.email === user.email
      );

      // Merge data
      const enrichedSubscriptions = subscriptions.map(sub => {
        const dodoSub = userDodoSubs.find(ds => ds.subscription_id === sub.dodoSubscriptionId);
        const plan = SUBSCRIPTION_PLANS[sub.planId];

        return {
          id: sub.id,
          planId: sub.planId,
          planName: plan?.name || 'Unknown Plan',
          status: dodoSub?.status || sub.status,
          amount: sub.amount,
          currency: sub.currency,
          nextBillingDate: dodoSub?.next_billing_date,
          cancelAtPeriodEnd: dodoSub?.cancel_at_next_billing_date || false,
          createdAt: sub.createdAt
        };
      });

      res.json({
        success: true,
        subscriptions: enrichedSubscriptions
      });
    } catch (error) {
      logger.error('Failed to get subscriptions', { error: error instanceof Error ? error.message : 'Unknown error', userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get subscriptions'
      });
    }
  }
);

/**
 * GET /api/subscriptions/:id
 * Get subscription details
 */
router.get('/:id',
  authenticateUser,
  [param('id').notEmpty().withMessage('Subscription ID is required')],
  validateRequest,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const user = req.user;

      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Check if subscription belongs to user
      const subscription = await prisma.dodoSubscription.findFirst({
        where: {
          id,
          userId: user.id
        }
      });

      if (!subscription) {
        res.status(404).json({
          success: false,
          error: 'Subscription not found'
        });
        return;
      }

      // Get latest data from DODO Payments
      const dodoSubscription = await dodoPayments.getSubscription(subscription.dodoSubscriptionId);
      const plan = SUBSCRIPTION_PLANS[subscription.planId];

      res.json({
        success: true,
        subscription: {
          id: subscription.id,
          planId: subscription.planId,
          plan: plan,
          status: dodoSubscription.status,
          amount: subscription.amount,
          currency: subscription.currency,
          nextBillingDate: dodoSubscription.next_billing_date,
          cancelAtPeriodEnd: dodoSubscription.cancel_at_next_billing_date,
          customer: dodoSubscription.customer,
          createdAt: subscription.createdAt
        }
      });
    } catch (error) {
      logger.error('Failed to get subscription details', { error: error instanceof Error ? error.message : 'Unknown error', subscriptionId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get subscription details'
      });
    }
  }
);

/**
 * POST /api/subscriptions/:id/change-plan
 * Change subscription plan
 */
router.post('/:id/change-plan',
  authenticateUser,
  [
    param('id').notEmpty().withMessage('Subscription ID is required'),
    body('newPlanId').isIn(Object.keys(SUBSCRIPTION_PLANS)).withMessage('Invalid plan ID')
  ],
  validateRequest,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { newPlanId } = req.body;
      const user = req.user;

      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Check if subscription belongs to user
      const subscription = await prisma.dodoSubscription.findFirst({
        where: {
          id,
          userId: user.id
        }
      });

      if (!subscription) {
        res.status(404).json({
          success: false,
          error: 'Subscription not found'
        });
        return;
      }

      // Update plan with DODO Payments
      const updatedSubscription = await dodoPayments.updateSubscription(
        subscription.dodoSubscriptionId,
        newPlanId
      );

      // Update in database
      await prisma.dodoSubscription.update({
        where: { id },
        data: {
          planId: newPlanId,
          amount: updatedSubscription.recurring_pre_tax_amount
        }
      });

      logger.info('Subscription plan changed', {
        userId: user.id,
        subscriptionId: id,
        oldPlan: subscription.planId,
        newPlan: newPlanId
      });

      res.json({
        success: true,
        message: 'Subscription plan updated successfully'
      });
    } catch (error) {
      logger.error('Failed to change subscription plan', { error: error instanceof Error ? error.message : 'Unknown error', subscriptionId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to change subscription plan'
      });
    }
  }
);

/**
 * POST /api/subscriptions/:id/cancel
 * Cancel subscription
 */
router.post('/:id/cancel',
  authenticateUser,
  [
    param('id').notEmpty().withMessage('Subscription ID is required'),
    body('cancelAtPeriodEnd').optional().isBoolean().withMessage('cancelAtPeriodEnd must be a boolean')
  ],
  validateRequest,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { cancelAtPeriodEnd = true } = req.body;
      const user = req.user;

      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Check if subscription belongs to user
      const subscription = await prisma.dodoSubscription.findFirst({
        where: {
          id,
          userId: user.id
        }
      });

      if (!subscription) {
        res.status(404).json({
          success: false,
          error: 'Subscription not found'
        });
        return;
      }

      // Cancel with DODO Payments
      await dodoPayments.cancelSubscription(
        subscription.dodoSubscriptionId,
        cancelAtPeriodEnd
      );

      // Update in database
      await prisma.dodoSubscription.update({
        where: { id },
        data: {
          status: cancelAtPeriodEnd ? 'cancelled_at_period_end' : 'cancelled'
        }
      });

      logger.info('Subscription cancelled', {
        userId: user.id,
        subscriptionId: id,
        cancelAtPeriodEnd
      });

      res.json({
        success: true,
        message: 'Subscription cancelled successfully'
      });
    } catch (error) {
      logger.error('Failed to cancel subscription', { error: error instanceof Error ? error.message : 'Unknown error', subscriptionId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to cancel subscription'
      });
    }
  }
);

/**
 * POST /api/subscriptions/:id/charge
 * Create on-demand charge
 */
router.post('/:id/charge',
  authenticateUser,
  [
    param('id').notEmpty().withMessage('Subscription ID is required'),
    body('amount').isInt({ min: 1 }).withMessage('Amount must be a positive integer (in cents)'),
    body('description').notEmpty().withMessage('Description is required')
  ],
  validateRequest,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { amount, description } = req.body;
      const user = req.user;

      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Check if subscription belongs to user
      const subscription = await prisma.dodoSubscription.findFirst({
        where: {
          id,
          userId: user.id,
          status: 'active'
        }
      });

      if (!subscription) {
        res.status(404).json({
          success: false,
          error: 'Active subscription not found'
        });
        return;
      }

      // Create charge with DODO Payments
      const charge = await dodoPayments.createCharge({
        subscriptionId: subscription.dodoSubscriptionId,
        amount,
        description
      });

      // Log the charge
      await prisma.dodoCharge.create({
        data: {
          id: crypto.randomUUID(),
          subscriptionId: subscription.id,
          dodoChargeId: charge.payment_id,
          amount,
          description,
          status: 'pending'
        }
      });

      logger.info('On-demand charge created', {
        userId: user.id,
        subscriptionId: id,
        amount,
        chargeId: charge.payment_id
      });

      res.json({
        success: true,
        charge: {
          id: charge.payment_id,
          amount,
          description
        }
      });
    } catch (error) {
      logger.error('Failed to create charge', { error: error instanceof Error ? error.message : 'Unknown error', subscriptionId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to create charge'
      });
    }
  }
);

/**
 * GET /api/subscriptions/:id/usage
 * Get subscription usage and calculate overage
 */
router.get('/:id/usage',
  authenticateUser,
  [param('id').notEmpty().withMessage('Subscription ID is required')],
  validateRequest,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const user = req.user;

      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Check if subscription belongs to user
      const subscription = await prisma.dodoSubscription.findFirst({
        where: {
          id,
          userId: user.id
        }
      });

      if (!subscription) {
        res.status(404).json({
          success: false,
          error: 'Subscription not found'
        });
        return;
      }

      // Get usage data from database
      const currentPeriodStart = new Date();
      currentPeriodStart.setDate(1); // Start of current month

      const usage = await prisma.usageRecord.findFirst({
        where: {
          userId: user.id,
         // createdAt: { gte: currentPeriodStart }
        }
      });

      const tokensUsed = usage?.tokens || 0;
      const requestsMade = 1; // Default since requestsMade property doesn't exist

      // Calculate pricing
      const planId = subscription.planId;
      const { DodoPaymentsService } = await import('../services/dodo-payments');
      const pricing = DodoPaymentsService.calculateUsage(planId, tokensUsed, requestsMade);

      res.json({
        success: true,
        usage: {
          tokensUsed,
          requestsMade,
          periodStart: currentPeriodStart,
          periodEnd: new Date(),
          pricing
        }
      });
    } catch (error) {
      logger.error('Failed to get usage data', { error: error instanceof Error ? error.message : 'Unknown error', subscriptionId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get usage data'
      });
    }
  }
);

export default router;