/**
 * Paddle Webhook Handler
 * Processes Paddle webhook events for subscription management
 */

import { Router, Request, Response } from 'express';
import { paddleService } from '../../services/paddle-service';
import { subscriptionService } from '../../services/subscription-service';
import { logger } from '../../utils/logger';
import { prisma } from '../../database/prisma';

const router = Router();

/**
 * @route POST /api/webhooks/paddle
 * @desc Handle Paddle webhook events
 * @access Public (verified by signature)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Get raw body for signature verification
    const signature = req.headers['paddle-signature'] as string;
    const rawBody = JSON.stringify(req.body);

    // Verify webhook signature
    const isValid = paddleService.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      logger.warn('Invalid Paddle webhook signature', {
        signature,
        ip: req.ip
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse event
    const event = paddleService.parseWebhookEvent(req.body);
    
    logger.info('Paddle webhook received', {
      eventType: event.event_type,
      subscriptionId: event.subscription_id
    });

    // Handle different event types
    switch (event.event_type) {
      case 'subscription.created':
        await handleSubscriptionCreated(event);
        break;

      case 'subscription.updated':
        await handleSubscriptionUpdated(event);
        break;

      case 'subscription.cancelled':
        await handleSubscriptionCancelled(event);
        break;

      case 'subscription.paused':
        await handleSubscriptionPaused(event);
        break;

      case 'subscription.resumed':
        await handleSubscriptionResumed(event);
        break;

      case 'subscription.past_due':
        await handleSubscriptionPastDue(event);
        break;

      case 'transaction.completed':
        await handleTransactionCompleted(event);
        break;

      case 'transaction.failed':
        await handleTransactionFailed(event);
        break;

      default:
        logger.info('Unhandled Paddle event type', {
          eventType: event.event_type
        });
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Paddle webhook processing failed', {
      error,
      body: req.body
    });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle subscription.created event
 */
async function handleSubscriptionCreated(event: any) {
  try {
    const { userId, planId } = event.custom_data || {};
    
    if (!userId || !planId) {
      throw new Error('Missing userId or planId in custom_data');
    }

    // Create subscription in database
    await subscriptionService.createSubscription({
      userId,
      planId,
      paymentProvider: 'paddle',
      externalSubscriptionId: event.subscription_id,
      status: 'active',
      currentPeriodStart: new Date(event.current_billing_period.starts_at),
      currentPeriodEnd: new Date(event.current_billing_period.ends_at)
    });

    logger.info('Paddle subscription created in database', {
      userId,
      planId,
      subscriptionId: event.subscription_id
    });
  } catch (error) {
    logger.error('Failed to handle subscription.created', { error, event });
    throw error;
  }
}

/**
 * Handle subscription.updated event
 */
async function handleSubscriptionUpdated(event: any) {
  try {
    // Find subscription in database
    const subscription = await prisma.subscription.findFirst({
      where: {
        // External subscription ID would be stored if we had that field
        status: { in: ['active', 'past_due'] }
      }
    });

    if (subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: event.status,
          currentPeriodStart: event.current_billing_period?.starts_at 
            ? new Date(event.current_billing_period.starts_at) 
            : undefined,
          currentPeriodEnd: event.current_billing_period?.ends_at 
            ? new Date(event.current_billing_period.ends_at) 
            : undefined
        }
      });

      logger.info('Paddle subscription updated', {
        subscriptionId: event.subscription_id,
        status: event.status
      });
    }
  } catch (error) {
    logger.error('Failed to handle subscription.updated', { error, event });
    throw error;
  }
}

/**
 * Handle subscription.cancelled event
 */
async function handleSubscriptionCancelled(event: any) {
  try {
    // Find and cancel subscription
    const subscription = await prisma.subscription.findFirst({
      where: { status: 'active' }
    });

    if (subscription) {
      await subscriptionService.cancelSubscription(subscription.userId, false);
      
      logger.info('Paddle subscription cancelled', {
        subscriptionId: event.subscription_id,
        userId: subscription.userId
      });
    }
  } catch (error) {
    logger.error('Failed to handle subscription.cancelled', { error, event });
    throw error;
  }
}

/**
 * Handle subscription.paused event
 */
async function handleSubscriptionPaused(event: any) {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: { status: 'active' }
    });

    if (subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'paused' }
      });

      logger.info('Paddle subscription paused', {
        subscriptionId: event.subscription_id
      });
    }
  } catch (error) {
    logger.error('Failed to handle subscription.paused', { error, event });
    throw error;
  }
}

/**
 * Handle subscription.resumed event
 */
async function handleSubscriptionResumed(event: any) {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: { status: 'paused' }
    });

    if (subscription) {
      await subscriptionService.reactivateSubscription(subscription.userId);
      
      logger.info('Paddle subscription resumed', {
        subscriptionId: event.subscription_id
      });
    }
  } catch (error) {
    logger.error('Failed to handle subscription.resumed', { error, event });
    throw error;
  }
}

/**
 * Handle subscription.past_due event
 */
async function handleSubscriptionPastDue(event: any) {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: { status: 'active' }
    });

    if (subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'past_due' }
      });

      await prisma.user.update({
        where: { id: subscription.userId },
        data: { subscriptionStatus: 'past_due' }
      });

      logger.warn('Paddle subscription past due', {
        subscriptionId: event.subscription_id,
        userId: subscription.userId
      });
    }
  } catch (error) {
    logger.error('Failed to handle subscription.past_due', { error, event });
    throw error;
  }
}

/**
 * Handle transaction.completed event
 */
async function handleTransactionCompleted(event: any) {
  try {
    // Create invoice record
    const { userId } = event.custom_data || {};
    
    if (userId) {
      await prisma.invoice.create({
        data: {
          userId,
          amount: event.amount || 0,
          currency: event.currency || 'USD',
          status: 'paid',
          paidAt: new Date()
        }
      });

      logger.info('Paddle transaction completed', {
        userId,
        amount: event.amount
      });
    }
  } catch (error) {
    logger.error('Failed to handle transaction.completed', { error, event });
    throw error;
  }
}

/**
 * Handle transaction.failed event
 */
async function handleTransactionFailed(event: any) {
  try {
    const { userId } = event.custom_data || {};
    
    if (userId) {
      logger.warn('Paddle transaction failed', {
        userId,
        subscriptionId: event.subscription_id
      });

      // Could send notification to user here
    }
  } catch (error) {
    logger.error('Failed to handle transaction.failed', { error, event });
    throw error;
  }
}

export default router;
