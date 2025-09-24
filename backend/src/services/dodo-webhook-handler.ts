/**
 * DODO Payments Webhook Handler
 * Handles real-time payment and subscription events from DODO Payments
 */

import { logger } from '../utils/logger';
import { prisma } from '../database/prisma';
import { unifiedPaymentService } from './unified-payment-service';
import * as crypto from 'crypto';

export interface DodoWebhookEvent {
  id: string;
  type: string;
  created: number;
  data: {
    object: DodoPaymentObject | DodoSubscriptionObject;
  };
  request?: {
    id: string;
    idempotency_key?: string;
  };
}

export interface DodoPaymentObject {
  id: string;
  object: 'payment';
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  customer: {
    id: string;
    email: string;
    name?: string;
  };
  metadata: Record<string, any>;
  created: number;
  updated: number;
}

export interface DodoSubscriptionObject {
  id: string;
  object: 'subscription';
  customer: {
    id: string;
    email: string;
    name?: string;
  };
  plan: {
    id: string;
    name: string;
    amount: number;
    currency: string;
    interval: string;
  };
  status: 'active' | 'past_due' | 'cancelled' | 'unpaid' | 'incomplete';
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  metadata: Record<string, any>;
  created: number;
  updated: number;
}

export class DodoWebhookHandler {
  private readonly webhookSecret: string;

  constructor() {
    this.webhookSecret = process.env.DODO_WEBHOOK_SECRET || '';
    if (!this.webhookSecret) {
      logger.warn('DODO webhook secret not configured - webhook validation disabled');
    }
  }

  /**
   * Verify webhook signature for security
   */
  verifyWebhookSignature(payload: string, signature: string, timestamp: string): boolean {
    if (!this.webhookSecret) {
      logger.warn('Webhook signature verification skipped - no secret configured');
      return true; // Allow in development/testing
    }

    try {
      const elements = signature.split(',');
      const signatureHash = elements.find(element => element.startsWith('v1='));
      
      if (!signatureHash) {
        logger.error('Invalid webhook signature format');
        return false;
      }

      const expectedSignature = signatureHash.split('=')[1];
      const payloadForSigning = `${timestamp}.${payload}`;
      
      const computedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payloadForSigning, 'utf8')
        .digest('hex');

      // Use crypto.timingSafeEqual to prevent timing attacks
      const sigBuffer = Buffer.from(expectedSignature, 'hex');
      const computedBuffer = Buffer.from(computedSignature, 'hex');
      
      if (sigBuffer.length !== computedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(sigBuffer, computedBuffer);
    } catch (error) {
      logger.error('Webhook signature verification failed', { error });
      return false;
    }
  }

  /**
   * Process incoming webhook event
   */
  async processWebhookEvent(event: DodoWebhookEvent): Promise<void> {
    try {
      logger.info('Processing DODO webhook event', {
        eventId: event.id,
        eventType: event.type,
        objectType: event.data.object.object
      });

      // Check for duplicate events (idempotency) using audit log
      const existingEvent = await prisma.auditLog.findFirst({
        where: { 
          action: 'webhook_event_processed',
          resourceId: event.id 
        }
      });

      if (existingEvent) {
        logger.info('Webhook event already processed', { eventId: event.id });
        return;
      }

      // Store webhook event for audit trail
      await prisma.auditLog.create({
        data: {
          userId: 'system', // System event
          action: 'webhook_event_received',
          resource: 'dodo_webhook',
          resourceId: event.id,
          metadata: {
            provider: 'dodo',
            eventType: event.type,
            data: JSON.parse(JSON.stringify(event)),
            processed: false
          }
        }
      });

      // Route to appropriate handler
      switch (event.type) {
        case 'payment.succeeded':
          await this.handlePaymentSucceeded(event);
          break;
        case 'payment.failed':
          await this.handlePaymentFailed(event);
          break;
        case 'subscription.created':
          await this.handleSubscriptionCreated(event);
          break;
        case 'subscription.updated':
          await this.handleSubscriptionUpdated(event);
          break;
        case 'subscription.cancelled':
          await this.handleSubscriptionCancelled(event);
          break;
        case 'subscription.renewed':
          await this.handleSubscriptionRenewed(event);
          break;
        default:
          logger.warn('Unhandled webhook event type', { eventType: event.type });
      }

      // Mark event as processed
      await prisma.auditLog.create({
        data: {
          userId: 'system',
          action: 'webhook_event_processed',
          resource: 'dodo_webhook', 
          resourceId: event.id,
          metadata: {
            processedAt: new Date()
          }
        }
      });

      logger.info('Webhook event processed successfully', { eventId: event.id });

    } catch (error) {
      logger.error('Failed to process webhook event', {
        eventId: event.id,
        eventType: event.type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Mark event as failed for retry
      await prisma.auditLog.create({
        data: {
          userId: 'system',
          action: 'webhook_event_failed',
          resource: 'dodo_webhook',
          resourceId: event.id,
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error',
            retryCount: 1
          }
        }
      });

      throw error;
    }
  }

  /**
   * Handle successful payment
   */
  private async handlePaymentSucceeded(event: DodoWebhookEvent): Promise<void> {
    const payment = event.data.object as DodoPaymentObject;
    
    logger.info('Processing successful payment', {
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      customerEmail: payment.customer.email
    });

    // Find user by email from payment
    const user = await prisma.user.findUnique({
      where: { email: payment.customer.email }
    });

    if (!user) {
      logger.error('User not found for successful payment', {
        customerEmail: payment.customer.email,
        dodoPaymentId: payment.id
      });
      return;
    }

    // Create audit log for payment success
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'payment_succeeded',
        resource: 'dodo_payment',
        resourceId: payment.id,
        metadata: {
          amount: payment.amount,
          currency: payment.currency,
          paymentMethod: payment.metadata?.paymentMethod || 'unknown'
        }
      }
    });

    // Create usage record for payment
    await prisma.usageRecord.create({
      data: {
        userId: user.id,
        type: 'payment_processing',
        tokens: 0,
        cost: payment.amount / 100, // Convert cents to dollars
        metadata: {
          paymentId: payment.id,
          currency: payment.currency,
          paymentMethod: payment.metadata?.paymentMethod || 'unknown'
        }
      }
    });

    // Send notification to user
    await this.sendPaymentNotification(user.id, 'payment_succeeded', {
      amount: payment.amount,
      currency: payment.currency
    });

    logger.info('Payment processed successfully', {
      paymentId: payment.id,
      userId: user.id,
      amount: payment.amount
    });
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailed(event: DodoWebhookEvent): Promise<void> {
    const payment = event.data.object as DodoPaymentObject;
    
    logger.info('Processing failed payment', {
      paymentId: payment.id,
      customerEmail: payment.customer.email
    });

    // Find user by email from payment
    const user = await prisma.user.findUnique({
      where: { email: payment.customer.email }
    });

    if (!user) {
      logger.error('User not found for failed payment', {
        customerEmail: payment.customer.email,
        dodoPaymentId: payment.id
      });
      return;
    }

    // Create audit log for payment failure
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'payment_failed',
        resource: 'dodo_payment',
        resourceId: payment.id,
        metadata: {
          amount: payment.amount,
          currency: payment.currency,
          reason: payment.metadata?.failureReason || 'unknown'
        }
      }
    });

    // Send notification to user
    await this.sendPaymentNotification(user.id, 'payment_failed', {
      amount: payment.amount,
      currency: payment.currency
    });
  }

  /**
   * Handle subscription creation
   */
  private async handleSubscriptionCreated(event: DodoWebhookEvent): Promise<void> {
    const subscription = event.data.object as DodoSubscriptionObject;
    
    logger.info('Processing subscription creation', {
      subscriptionId: subscription.id,
      customerEmail: subscription.customer.email,
      planId: subscription.plan.id
    });

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: subscription.customer.email }
    });

    if (!user) {
      logger.error('User not found for subscription', {
        email: subscription.customer.email,
        subscriptionId: subscription.id
      });
      return;
    }

    // Create subscription record
    await prisma.dodoSubscription.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        planId: subscription.plan.id,
        planName: subscription.plan.name,
        dodoSubscriptionId: subscription.id,
        status: subscription.status,
        amount: subscription.plan.amount,
        currency: subscription.plan.currency,
        nextBillingDate: new Date(subscription.current_period_end * 1000),
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      }
    });

    // Update user's subscription field
    await prisma.user.update({
      where: { id: user.id },
      data: { subscription: subscription.plan.id }
    });

    // Send welcome notification
    await this.sendPaymentNotification(user.id, 'subscription_created', {
      planId: subscription.plan.id,
      planName: subscription.plan.name
    });
  }

  /**
   * Handle subscription updates
   */
  private async handleSubscriptionUpdated(event: DodoWebhookEvent): Promise<void> {
    const subscription = event.data.object as DodoSubscriptionObject;
    
    // Update local subscription record
    await prisma.dodoSubscription.updateMany({
      where: { dodoSubscriptionId: subscription.id },
      data: {
        status: subscription.status,
        amount: subscription.plan.amount,
        nextBillingDate: new Date(subscription.current_period_end * 1000),
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Handle subscription cancellation
   */
  private async handleSubscriptionCancelled(event: DodoWebhookEvent): Promise<void> {
    const subscription = event.data.object as DodoSubscriptionObject;
    
    // Update local subscription record
    const updatedSubscription = await prisma.dodoSubscription.updateMany({
      where: { dodoSubscriptionId: subscription.id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Find user and downgrade to free plan
    const localSubscription = await prisma.dodoSubscription.findFirst({
      where: { dodoSubscriptionId: subscription.id }
    });

    if (localSubscription) {
      await prisma.user.update({
        where: { id: localSubscription.userId },
        data: { subscription: 'free' }
      });

      // Send cancellation notification
      await this.sendPaymentNotification(localSubscription.userId, 'subscription_cancelled', {
        planId: localSubscription.planId,
        planName: localSubscription.planName
      });
    }
  }

  /**
   * Handle subscription renewal
   */
  private async handleSubscriptionRenewed(event: DodoWebhookEvent): Promise<void> {
    const subscription = event.data.object as DodoSubscriptionObject;
    
    // Update subscription with new billing period
    await prisma.dodoSubscription.updateMany({
      where: { dodoSubscriptionId: subscription.id },
      data: {
        status: 'active',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        nextBillingDate: new Date(subscription.current_period_end * 1000),
        lastPaymentAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Send renewal notification
    const localSubscription = await prisma.dodoSubscription.findFirst({
      where: { dodoSubscriptionId: subscription.id }
    });

    if (localSubscription) {
      await this.sendPaymentNotification(localSubscription.userId, 'subscription_renewed', {
        planId: localSubscription.planId,
        planName: localSubscription.planName,
        nextBillingDate: new Date(subscription.current_period_end * 1000)
      });
    }
  }

  /**
   * Create or update subscription from payment
   */
  private async createOrUpdateSubscription(payment: DodoPaymentObject): Promise<void> {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: payment.customer.email }
    });

    if (user) {
      // Create usage record for subscription
      await prisma.usageRecord.create({
        data: {
          userId: user.id,
          type: 'subscription_management',
          tokens: 0,
          cost: 0,
          metadata: {
            paymentId: payment.id,
            action: 'subscription_updated'
          }
        }
      });
    }
  }

  /**
   * Send payment notification to user
   */
  private async sendPaymentNotification(userId: string, type: string, data: any): Promise<void> {
    try {
      const notificationMessages = {
        payment_succeeded: 'Payment processed successfully',
        payment_failed: 'Payment failed - please update your payment method',
        subscription_created: `Welcome to ${data.planName}! Your subscription is now active.`,
        subscription_cancelled: `Your ${data.planName} subscription has been cancelled.`,
        subscription_renewed: `Your ${data.planName} subscription has been renewed.`
      };

      await prisma.pushNotification.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          title: type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
          body: notificationMessages[type as keyof typeof notificationMessages] || 'Payment update',
          data: JSON.parse(JSON.stringify({ type, ...data }))
        }
      });
    } catch (error) {
      logger.error('Failed to send payment notification', { error, userId, type });
    }
  }

  /**
   * Get recent webhook events for debugging
   */
  async getRecentEvents(limit: number = 50): Promise<any[]> {
    try {
      const events = await prisma.auditLog.findMany({
        where: { 
          action: { in: ['webhook_event_received', 'webhook_event_processed', 'webhook_event_failed'] },
          resource: 'dodo_webhook'
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
        select: {
          id: true,
          resourceId: true,
          action: true,
          metadata: true,
          timestamp: true
        }
      });

      return events;
    } catch (error) {
      logger.error('Failed to fetch recent webhook events', { error });
      return [];
    }
  }
}

// Export singleton instance
export const dodoWebhookHandler = new DodoWebhookHandler();