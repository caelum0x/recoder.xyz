/**
 * DODO Pay Webhook Handler
 * Processes DODO Pay webhook events for crypto payments
 */

import { Router, Request, Response } from 'express';
import { dodoService } from '../../services/dodo-service';
import { subscriptionService } from '../../services/subscription-service';
import { logger } from '../../utils/logger';
import { prisma } from '../../database/prisma';

const router = Router();

/**
 * @route POST /api/webhooks/dodo
 * @desc Handle DODO Pay webhook events
 * @access Public (verified by signature)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Get raw body for signature verification
    const signature = req.headers['dodo-signature'] as string;
    const rawBody = JSON.stringify(req.body);

    // Verify webhook signature
    const isValid = dodoService.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      logger.warn('Invalid DODO webhook signature', {
        signature,
        ip: req.ip
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse event
    const event = dodoService.parseWebhookEvent(req.body);
    
    logger.info('DODO webhook received', {
      event: event.event,
      orderId: event.order_id,
      status: event.status
    });

    // Handle different event types
    switch (event.event) {
      case 'order.completed':
        await handleOrderCompleted(event);
        break;

      case 'order.expired':
        await handleOrderExpired(event);
        break;

      case 'order.refunded':
        await handleOrderRefunded(event);
        break;

      case 'subscription.created':
        await handleSubscriptionCreated(event);
        break;

      case 'subscription.renewed':
        await handleSubscriptionRenewed(event);
        break;

      case 'subscription.cancelled':
        await handleSubscriptionCancelled(event);
        break;

      case 'subscription.expired':
        await handleSubscriptionExpired(event);
        break;

      default:
        logger.info('Unhandled DODO event type', {
          event: event.event
        });
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('DODO webhook processing failed', {
      error,
      body: req.body
    });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle order.completed event (one-time payment)
 */
async function handleOrderCompleted(event: any) {
  try {
    const { userId, planId, email } = event.metadata || {};
    
    if (!userId || !planId) {
      throw new Error('Missing userId or planId in metadata');
    }

    // Create subscription for monthly/yearly plan
    const now = new Date();
    const plan = subscriptionService.getPlan(planId);
    const periodEnd = plan?.interval === 'year' 
      ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await subscriptionService.createSubscription({
      userId,
      planId,
      paymentProvider: 'dodo',
      externalSubscriptionId: event.order_id,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd
    });

    // Create invoice record
    await prisma.invoice.create({
      data: {
        userId,
        amount: event.amount,
        currency: event.currency,
        status: 'paid',
        description: `DODO Pay - ${planId}`,
        paidAt: new Date(event.completed_at)
      }
    });

    logger.info('DODO order completed', {
      userId,
      planId,
      orderId: event.order_id,
      amount: event.amount,
      transactionHash: event.transaction_hash
    });
  } catch (error) {
    logger.error('Failed to handle order.completed', { error, event });
    throw error;
  }
}

/**
 * Handle order.expired event
 */
async function handleOrderExpired(event: any) {
  try {
    logger.info('DODO order expired', {
      orderId: event.order_id,
      metadata: event.metadata
    });
    
    // Could send notification to user here
  } catch (error) {
    logger.error('Failed to handle order.expired', { error, event });
    throw error;
  }
}

/**
 * Handle order.refunded event
 */
async function handleOrderRefunded(event: any) {
  try {
    const { userId } = event.metadata || {};
    
    if (userId) {
      // Find and cancel subscription
      const subscription = await prisma.subscription.findFirst({
        where: { userId, status: 'active' },
        orderBy: { createdAt: 'desc' }
      });

      if (subscription) {
        await subscriptionService.cancelSubscription(userId, false);
      }

      // Update invoice
      await prisma.invoice.updateMany({
        where: { userId, status: 'paid' },
        data: { status: 'refunded', voidedAt: new Date() }
      });

      logger.info('DODO order refunded', {
        userId,
        orderId: event.order_id
      });
    }
  } catch (error) {
    logger.error('Failed to handle order.refunded', { error, event });
    throw error;
  }
}

/**
 * Handle subscription.created event (recurring payment)
 */
async function handleSubscriptionCreated(event: any) {
  try {
    const { userId, planId } = event.metadata || {};
    
    if (!userId || !planId) {
      throw new Error('Missing userId or planId in metadata');
    }

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await subscriptionService.createSubscription({
      userId,
      planId,
      paymentProvider: 'dodo',
      externalSubscriptionId: event.order_id,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd
    });

    logger.info('DODO subscription created', {
      userId,
      planId,
      subscriptionId: event.order_id
    });
  } catch (error) {
    logger.error('Failed to handle subscription.created', { error, event });
    throw error;
  }
}

/**
 * Handle subscription.renewed event
 */
async function handleSubscriptionRenewed(event: any) {
  try {
    // Find subscription and update period
    const { userId } = event.metadata || {};
    
    if (userId) {
      const subscription = await prisma.subscription.findFirst({
        where: { userId, status: 'active' },
        orderBy: { createdAt: 'desc' }
      });

      if (subscription) {
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd
          }
        });

        // Create invoice
        await prisma.invoice.create({
          data: {
            userId,
            subscriptionId: subscription.id,
            amount: event.amount,
            currency: event.currency,
            status: 'paid',
            description: 'Subscription renewal',
            paidAt: new Date(event.completed_at)
          }
        });

        logger.info('DODO subscription renewed', {
          userId,
          subscriptionId: event.order_id
        });
      }
    }
  } catch (error) {
    logger.error('Failed to handle subscription.renewed', { error, event });
    throw error;
  }
}

/**
 * Handle subscription.cancelled event
 */
async function handleSubscriptionCancelled(event: any) {
  try {
    const { userId } = event.metadata || {};
    
    if (userId) {
      await subscriptionService.cancelSubscription(userId, false);
      
      logger.info('DODO subscription cancelled', {
        userId,
        subscriptionId: event.order_id
      });
    }
  } catch (error) {
    logger.error('Failed to handle subscription.cancelled', { error, event });
    throw error;
  }
}

/**
 * Handle subscription.expired event
 */
async function handleSubscriptionExpired(event: any) {
  try {
    const { userId } = event.metadata || {};
    
    if (userId) {
      const subscription = await prisma.subscription.findFirst({
        where: { userId, status: { in: ['active', 'past_due'] } },
        orderBy: { createdAt: 'desc' }
      });

      if (subscription) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'expired' }
        });

        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionPlan: 'free',
            subscriptionStatus: 'expired'
          }
        });

        // Reset quota to free tier
        const freePlan = subscriptionService.getPlan('free');
        if (freePlan) {
          await prisma.userQuota.updateMany({
            where: { userId },
            data: {
              requestsLimit: freePlan.limits.requests,
              tokensLimit: BigInt(freePlan.limits.tokens)
            }
          });
        }

        logger.info('DODO subscription expired', {
          userId,
          subscriptionId: event.order_id
        });
      }
    }
  } catch (error) {
    logger.error('Failed to handle subscription.expired', { error, event });
    throw error;
  }
}

export default router;
