/**
 * Subscription Management Routes
 * Handles subscription CRUD, plan changes, billing history
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/subscriptions/current
 * Get current subscription details
 */
router.get('/current', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const subscription = await prisma.subscription.findFirst({
      where: { userId },
      include: {
        paymentMethod: {
          select: {
            id: true,
            type: true,
            brand: true,
            last4: true,
            expMonth: true,
            expYear: true,
            isDefault: true
          }
        },
        invoices: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            createdAt: true,
            paidAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });

    if (!subscription) {
      return res.json({
        hasSubscription: false,
        plan: 'free'
      });
    }

    res.json({
      hasSubscription: true,
      subscription
    });

  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

/**
 * GET /api/subscriptions/plans
 * List available subscription plans
 */
router.get('/plans', async (req: Request, res: Response) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { active: true },
      include: {
        features: {
          orderBy: { sortOrder: 'asc' }
        },
        limits: true
      },
      orderBy: { sortOrder: 'asc' }
    });

    res.json({ plans });

  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

/**
 * POST /api/subscriptions/change-plan
 * Change subscription plan (upgrade/downgrade)
 */
router.post('/change-plan', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'planId is required' });
    }

    // Get plan details
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId }
    });

    if (!plan || !plan.active) {
      return res.status(404).json({ error: 'Plan not found or inactive' });
    }

    // Get current subscription
    const currentSub = await prisma.subscription.findFirst({
      where: { userId }
    });

    if (!currentSub) {
      // Create new subscription
      const subscription = await prisma.subscription.create({
        data: {
          userId,
          planId: plan.id,
          planName: plan.name,
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          amount: Number(plan.price),
          currency: plan.currency,
          interval: plan.interval
        }
      });

      // Update user
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionPlan: plan.id,
          subscriptionStatus: 'active'
        }
      });

      return res.json({
        success: true,
        subscription,
        message: 'Subscription created successfully'
      });
    }

    // Update existing subscription
    const updatedSub = await prisma.subscription.update({
      where: { id: currentSub.id },
      data: {
        planId: plan.id,
        planName: plan.name,
        amount: Number(plan.price),
        currency: plan.currency,
        interval: plan.interval
      }
    });

    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionPlan: plan.id
      }
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'subscription_changed',
        resource: 'subscription',
        resourceId: updatedSub.id,
        metadata: {
          oldPlan: currentSub.planId,
          newPlan: plan.id
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      subscription: updatedSub,
      message: 'Subscription updated successfully'
    });

  } catch (error) {
    console.error('Error changing plan:', error);
    res.status(500).json({ error: 'Failed to change plan' });
  }
});

/**
 * POST /api/subscriptions/cancel
 * Cancel subscription
 */
router.post('/cancel', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { reason, cancelImmediately = false } = req.body;

    const subscription = await prisma.subscription.findFirst({
      where: { userId }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    const updateData: any = {
      cancelAtPeriodEnd: true,
      cancellationReason: reason
    };

    if (cancelImmediately) {
      updateData.status = 'cancelled';
      updateData.cancelledAt = new Date();
      updateData.currentPeriodEnd = new Date();
    } else {
      updateData.cancelAt = subscription.currentPeriodEnd;
    }

    const cancelled = await prisma.subscription.update({
      where: { id: subscription.id },
      data: updateData
    });

    // Update user if cancelled immediately
    if (cancelImmediately) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionPlan: 'free',
          subscriptionStatus: 'cancelled'
        }
      });
    }

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'subscription_cancelled',
        resource: 'subscription',
        resourceId: subscription.id,
        metadata: {
          reason,
          cancelImmediately,
          cancelAt: cancelImmediately ? new Date() : subscription.currentPeriodEnd
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      subscription: cancelled,
      message: cancelImmediately
        ? 'Subscription cancelled immediately'
        : `Subscription will be cancelled at ${subscription.currentPeriodEnd.toISOString()}`
    });

  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * POST /api/subscriptions/reactivate
 * Reactivate a cancelled subscription
 */
router.post('/reactivate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        cancelAtPeriodEnd: true
      }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No cancellation to revert' });
    }

    const reactivated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: false,
        cancelAt: null,
        cancellationReason: null
      }
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'subscription_reactivated',
        resource: 'subscription',
        resourceId: subscription.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      subscription: reactivated,
      message: 'Subscription reactivated successfully'
    });

  } catch (error) {
    console.error('Error reactivating subscription:', error);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
});

/**
 * GET /api/subscriptions/invoices
 * Get billing history
 */
router.get('/invoices', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limitNum,
        skip
      }),
      prisma.invoice.count({ where: { userId } })
    ]);

    res.json({
      invoices,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

/**
 * GET /api/subscriptions/invoices/:id
 * Get specific invoice
 */
router.get('/invoices/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ invoice });

  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

/**
 * GET /api/subscriptions/payment-methods
 * List payment methods
 */
router.get('/payment-methods', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const paymentMethods = await prisma.paymentMethod.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        provider: true,
        brand: true,
        last4: true,
        expMonth: true,
        expYear: true,
        holderName: true,
        isDefault: true,
        createdAt: true
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    res.json({ paymentMethods });

  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

/**
 * POST /api/subscriptions/payment-methods/:id/set-default
 * Set default payment method
 */
router.post('/payment-methods/:id/set-default', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    // Verify ownership
    const paymentMethod = await prisma.paymentMethod.findFirst({
      where: { id, userId }
    });

    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    // Unset all default
    await prisma.paymentMethod.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false }
    });

    // Set new default
    await prisma.paymentMethod.update({
      where: { id },
      data: { isDefault: true }
    });

    res.json({ success: true, message: 'Default payment method updated' });

  } catch (error) {
    console.error('Error setting default payment method:', error);
    res.status(500).json({ error: 'Failed to set default payment method' });
  }
});

/**
 * DELETE /api/subscriptions/payment-methods/:id
 * Delete payment method
 */
router.delete('/payment-methods/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    // Verify ownership
    const paymentMethod = await prisma.paymentMethod.findFirst({
      where: { id, userId }
    });

    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    // Check if it's the default and there are others
    if (paymentMethod.isDefault) {
      const otherMethods = await prisma.paymentMethod.count({
        where: {
          userId,
          id: { not: id }
        }
      });

      if (otherMethods > 0) {
        return res.status(400).json({
          error: 'Cannot delete default payment method. Please set another as default first.'
        });
      }
    }

    await prisma.paymentMethod.delete({ where: { id } });

    res.json({ success: true, message: 'Payment method deleted' });

  } catch (error) {
    console.error('Error deleting payment method:', error);
    res.status(500).json({ error: 'Failed to delete payment method' });
  }
});

/**
 * GET /api/subscriptions/usage-limits
 * Get usage limits based on current plan
 */
router.get('/usage-limits', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionPlan: true,
        subscription: {
          select: {
            planId: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get plan limits
    const planLimits = await prisma.subscriptionPlanLimits.findFirst({
      where: { planId: user.subscription?.planId || user.subscriptionPlan }
    });

    // Get current usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [dailyUsage, monthlyUsage] = await Promise.all([
      prisma.usageRecord.count({
        where: {
          userId,
          timestamp: { gte: today }
        }
      }),
      prisma.usageRecord.count({
        where: {
          userId,
          timestamp: { gte: monthStart }
        }
      })
    ]);

    res.json({
      limits: planLimits,
      usage: {
        daily: dailyUsage,
        monthly: monthlyUsage
      },
      remaining: {
        daily: planLimits ? Math.max(0, planLimits.dailyRequests - dailyUsage) : 0,
        monthly: planLimits ? Math.max(0, planLimits.monthlyRequests - monthlyUsage) : 0
      }
    });

  } catch (error) {
    console.error('Error fetching usage limits:', error);
    res.status(500).json({ error: 'Failed to fetch usage limits' });
  }
});

module.exports = router;
