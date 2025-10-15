/**
 * Billing Routes
 * Handles subscription management, checkout, and billing operations
 * Using lazy imports to avoid startup hangs
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

// Lazy import helper
function getSubscriptionService() {
  const { subscriptionService } = require('../services/subscription-service');
  return subscriptionService;
}

function getPaddleService() {
  const { paddleService } = require('../services/paddle-service');
  return paddleService;
}

function getDodoService() {
  const { dodoService } = require('../services/dodo-service');
  return dodoService;
}

/**
 * @route GET /api/billing/plans
 * @desc Get all available subscription plans
 * @access Public
 */
router.get('/plans', (req, res) => {
  try {
    const subscriptionService = getSubscriptionService();
    const plans = subscriptionService.getPlans();

    res.json({
      success: true,
      data: { plans }
    });
  } catch (error) {
    logger.error('Failed to get plans', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get plans'
    });
  }
});

/**
 * @route GET /api/billing/subscription
 * @desc Get current user's subscription
 * @access Private
 */
router.get('/subscription', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const subscriptionService = getSubscriptionService();
    const subscription = await subscriptionService.getUserSubscription(userId);
    
    res.json({
      success: true,
      data: { subscription }
    });
  } catch (error) {
    logger.error('Failed to get subscription', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription'
    });
  }
});

/**
 * @route POST /api/billing/checkout/paddle
 * @desc Create Paddle checkout session for credit card payment
 * @access Private
 */
router.post('/checkout/paddle', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({
        success: false,
        error: 'Plan ID is required'
      });
    }

    // Verify plan exists
    const subscriptionService = getSubscriptionService();
    const plan = subscriptionService.getPlan(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found'
      });
    }

    // Create checkout session
    const paddleService = getPaddleService();
    const checkout = await paddleService.createCheckout({
      userId,
      planId,
      email: req.user!.email,
      successUrl: `${process.env.NEXT_PUBLIC_WEB_URL}/checkout/success?provider=paddle`,
      cancelUrl: `${process.env.NEXT_PUBLIC_WEB_URL}/pricing`
    });

    logger.info('Paddle checkout created', {
      userId,
      planId,
      checkoutId: checkout.checkoutId
    });

    res.json({
      success: true,
      data: {
        checkoutUrl: checkout.url,
        checkoutId: checkout.checkoutId
      }
    });
  } catch (error) {
    logger.error('Failed to create Paddle checkout', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to create checkout session'
    });
  }
});

/**
 * @route POST /api/billing/checkout/dodo
 * @desc Create DODO Pay order for crypto payment
 * @access Private
 */
router.post('/checkout/dodo', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { planId, paymentType = 'one-time' } = req.body;

    if (!planId) {
      return res.status(400).json({
        success: false,
        error: 'Plan ID is required'
      });
    }

    // Verify plan exists
    const subscriptionService = getSubscriptionService();
    const plan = subscriptionService.getPlan(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found'
      });
    }

    let order;
    const dodoService = getDodoService();

    if (paymentType === 'subscription') {
      // Create recurring subscription
      order = await dodoService.createSubscription({
        userId,
        planId,
        email: req.user!.email,
        amount: plan.price,
        currency: plan.currency,
        successUrl: `${process.env.NEXT_PUBLIC_WEB_URL}/checkout/success?provider=dodo`,
        cancelUrl: `${process.env.NEXT_PUBLIC_WEB_URL}/pricing`
      });
    } else {
      // Create one-time order
      order = await dodoService.createOrder({
        userId,
        planId,
        email: req.user!.email,
        amount: plan.price,
        currency: plan.currency,
        successUrl: `${process.env.NEXT_PUBLIC_WEB_URL}/checkout/success?provider=dodo`,
        cancelUrl: `${process.env.NEXT_PUBLIC_WEB_URL}/pricing`
      });
    }

    logger.info('DODO order created', {
      userId,
      planId,
      orderId: order.orderId || order.subscriptionId
    });

    res.json({
      success: true,
      data: {
        checkoutUrl: order.url,
        orderId: order.orderId || order.subscriptionId
      }
    });
  } catch (error) {
    logger.error('Failed to create DODO order', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to create crypto payment order'
    });
  }
});

/**
 * @route POST /api/billing/subscription/cancel
 * @desc Cancel user's subscription
 * @access Private
 */
router.post('/subscription/cancel', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { cancelAtPeriodEnd = true } = req.body;

    const subscriptionService = getSubscriptionService();
    await subscriptionService.cancelSubscription(userId, cancelAtPeriodEnd);
    
    logger.info('Subscription cancelled', {
      userId,
      cancelAtPeriodEnd
    });

    res.json({
      success: true,
      message: cancelAtPeriodEnd 
        ? 'Subscription will be cancelled at the end of the billing period'
        : 'Subscription cancelled immediately'
    });
  } catch (error) {
    logger.error('Failed to cancel subscription', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to cancel subscription'
    });
  }
});

/**
 * @route POST /api/billing/subscription/reactivate
 * @desc Reactivate cancelled subscription
 * @access Private
 */
router.post('/subscription/reactivate', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;

    const subscriptionService = getSubscriptionService();
    await subscriptionService.reactivateSubscription(userId);
    
    logger.info('Subscription reactivated', { userId });

    res.json({
      success: true,
      message: 'Subscription reactivated successfully'
    });
  } catch (error) {
    logger.error('Failed to reactivate subscription', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to reactivate subscription'
    });
  }
});

/**
 * @route POST /api/billing/subscription/upgrade
 * @desc Upgrade subscription to higher plan
 * @access Private
 */
router.post('/subscription/upgrade', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { newPlanId } = req.body;

    if (!newPlanId) {
      return res.status(400).json({
        success: false,
        error: 'New plan ID is required'
      });
    }

    // Check if can upgrade
    const subscriptionService = getSubscriptionService();
    const canUpgrade = await subscriptionService.canUpgradeToPlan(userId, newPlanId);
    if (!canUpgrade) {
      return res.status(400).json({
        success: false,
        error: 'Cannot upgrade to this plan'
      });
    }

    await subscriptionService.updateSubscription(userId, newPlanId);
    
    logger.info('Subscription upgraded', {
      userId,
      newPlanId
    });

    res.json({
      success: true,
      message: 'Subscription upgraded successfully'
    });
  } catch (error) {
    logger.error('Failed to upgrade subscription', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to upgrade subscription'
    });
  }
});

/**
 * @route GET /api/billing/invoices
 * @desc Get user's invoices
 * @access Private
 */
router.get('/invoices', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { prisma } = require('../database/prisma');

    const invoices = await prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json({
      success: true,
      data: { invoices }
    });
  } catch (error) {
    logger.error('Failed to get invoices', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get invoices'
    });
  }
});

/**
 * @route GET /api/billing/supported-cryptos
 * @desc Get supported cryptocurrencies for DODO Pay
 * @access Public
 */
router.get('/supported-cryptos', async (req, res) => {
  try {
    const dodoService = getDodoService();
    const currencies = await dodoService.getSupportedCurrencies();
    
    res.json({
      success: true,
      data: { currencies }
    });
  } catch (error) {
    logger.error('Failed to get supported cryptocurrencies', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get supported cryptocurrencies'
    });
  }
});

module.exports = router;
