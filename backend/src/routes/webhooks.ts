// DODO Payments Webhook Handler
// Processes subscription events and updates database

import express, { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { prisma } from '../database/prisma';
import { APIResponse, WebhookEvent } from '../types';
import * as crypto from 'crypto';

const router = express.Router();

// Raw body parser for webhook signature verification
router.use('/dodo', express.raw({ type: 'application/json' }));

/**
 * POST /api/webhooks/dodo
 * Handle DODO Payments webhooks
 */
router.post('/dodo', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-dodo-signature'] as string;
    const payload = req.body.toString();

    // Verify webhook signature (simplified for now)
    if (!signature) {
      logger.warn('Missing DODO webhook signature');
      return res.status(400).json({
        success: false,
        error: 'Missing signature'
      });
    }

    const event = JSON.parse(payload);
    logger.info('DODO webhook received', { eventType: event.type, eventId: event.id });

    // Process webhook event
    await processWebhookEvent(event);

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to process DODO webhook', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed'
    });
  }
});

/**
 * Process different types of webhook events
 */
async function processWebhookEvent(event: WebhookEvent) {
  switch (event.type) {
    case 'subscription.created':
      await handleSubscriptionCreated(event.data);
      break;
    
    case 'subscription.updated':
      await handleSubscriptionUpdated(event.data);
      break;
    
    case 'subscription.cancelled':
      await handleSubscriptionCancelled(event.data);
      break;
    
    case 'subscription.expired':
      await handleSubscriptionExpired(event.data);
      break;
    
    case 'payment.succeeded':
      await handlePaymentSucceeded(event.data);
      break;
    
    case 'payment.failed':
      await handlePaymentFailed(event.data);
      break;
    
    case 'invoice.created':
      await handleInvoiceCreated(event.data);
      break;
    
    case 'invoice.paid':
      await handleInvoicePaid(event.data);
      break;
    
    case 'customer.created':
      await handleCustomerCreated(event.data);
      break;
    
    default:
      logger.info('Unhandled DODO webhook event type', { eventType: event.type });
  }
}

/**
 * Handle subscription created event
 */
async function handleSubscriptionCreated(data: Record<string, any>) {
  try {
    const { subscription_id, customer, product_id, status, recurring_pre_tax_amount } = data;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: customer.email }
    });

    if (!user) {
      logger.warn('User not found for subscription created event', { email: customer.email });
      return;
    }

    // Update subscription status
    await prisma.dodoSubscription.upsert({
      where: { dodoSubscriptionId: subscription_id },
      update: {
        status: status,
        amount: recurring_pre_tax_amount
      },
      create: {
        id: subscription_id,
        userId: user.id,
        planId: product_id,
        planName: product_id, // Use product_id as plan name for now
        dodoSubscriptionId: subscription_id,
        status: status,
        amount: recurring_pre_tax_amount,
        currency: 'USD',
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      }
    });

    logger.info('Subscription created event processed', { subscriptionId: subscription_id, userId: user.id });
  } catch (error) {
    logger.error('Failed to handle subscription created event', { error: error instanceof Error ? error.message : 'Unknown error', data });
  }
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(data: Record<string, any>) {
  try {
    const { subscription_id, status, recurring_pre_tax_amount, product_id } = data;

    await prisma.dodoSubscription.updateMany({
      where: { dodoSubscriptionId: subscription_id },
      data: {
        status: status,
        amount: recurring_pre_tax_amount,
        planId: product_id
      }
    });

    logger.info('Subscription updated event processed', { subscriptionId: subscription_id });
  } catch (error) {
    logger.error('Failed to handle subscription updated event', { error: error instanceof Error ? error.message : 'Unknown error', data });
  }
}

/**
 * Handle subscription cancelled event
 */
async function handleSubscriptionCancelled(data: Record<string, any>) {
  try {
    const { subscription_id, cancelled_at, cancel_at_next_billing_date } = data;

    await prisma.dodoSubscription.updateMany({
      where: { dodoSubscriptionId: subscription_id },
      data: {
        status: cancel_at_next_billing_date ? 'cancelled_at_period_end' : 'cancelled',
        cancelAtPeriodEnd: cancel_at_next_billing_date || false
      }
    });

    logger.info('Subscription cancelled event processed', { subscriptionId: subscription_id });
  } catch (error) {
    logger.error('Failed to handle subscription cancelled event', { error: error instanceof Error ? error.message : 'Unknown error', data });
  }
}

/**
 * Handle subscription expired event
 */
async function handleSubscriptionExpired(data: Record<string, any>) {
  try {
    const { subscription_id } = data;

    await prisma.dodoSubscription.updateMany({
      where: { dodoSubscriptionId: subscription_id },
      data: {
        status: 'expired'
      }
    });

    logger.info('Subscription expired event processed', { subscriptionId: subscription_id });
  } catch (error) {
    logger.error('Failed to handle subscription expired event', { error: error instanceof Error ? error.message : 'Unknown error', data });
  }
}

/**
 * Handle payment succeeded event
 */
async function handlePaymentSucceeded(data: Record<string, any>) {
  try {
    const { payment_id, subscription_id, amount, currency } = data;

    // Find subscription
    const subscription = await prisma.dodoSubscription.findFirst({
      where: { dodoSubscriptionId: subscription_id }
    });

    if (!subscription) {
      logger.warn('Subscription not found for payment succeeded event', { subscriptionId: subscription_id });
      return;
    }

    // Record successful payment
    await prisma.dodoCharge.upsert({
      where: { dodoChargeId: payment_id },
      update: {
        status: 'succeeded',
        amount: amount,
        currency: currency
      },
      create: {
        id: crypto.randomUUID(),
        subscriptionId: subscription.id,
        dodoChargeId: payment_id,
        amount: amount,
        currency: currency,
        description: 'Payment succeeded',
        status: 'succeeded'
      }
    });

    // Update subscription to active
    await prisma.dodoSubscription.update({
      where: { id: subscription.id },
      data: { status: 'active' }
    });

    // Update user's subscription status
    await prisma.user.update({
      where: { id: subscription.userId },
      data: { subscription: 'active' }
    });

    logger.info('Payment succeeded event processed', { paymentId: payment_id, subscriptionId: subscription_id });
  } catch (error) {
    logger.error('Failed to handle payment succeeded event', { error: error instanceof Error ? error.message : 'Unknown error', data });
  }
}

/**
 * Handle payment failed event
 */
async function handlePaymentFailed(data: Record<string, any>) {
  try {
    const { payment_id, subscription_id, amount, currency, failure_reason } = data;

    // Find subscription
    const subscription = await prisma.dodoSubscription.findFirst({
      where: { dodoSubscriptionId: subscription_id }
    });

    if (!subscription) {
      logger.warn('Subscription not found for payment failed event', { subscriptionId: subscription_id });
      return;
    }

    // Record failed payment
    await prisma.dodoCharge.upsert({
      where: { dodoChargeId: payment_id },
      update: {
        status: 'failed',
        amount: amount,
        currency: currency,
        description: failure_reason || 'Payment failed'
      },
      create: {
        id: crypto.randomUUID(),
        subscriptionId: subscription.id,
        dodoChargeId: payment_id,
        amount: amount,
        currency: currency,
        description: failure_reason || 'Payment failed',
        status: 'failed'
      }
    });

    // Update subscription status
    await prisma.dodoSubscription.update({
      where: { id: subscription.id },
      data: { status: 'failed' }
    });

    // Send notification to user about failed payment
    // This would integrate with your notification system
    
    logger.info('Payment failed event processed', { paymentId: payment_id, subscriptionId: subscription_id, reason: failure_reason });
  } catch (error) {
    logger.error('Failed to handle payment failed event', { error: error instanceof Error ? error.message : 'Unknown error', data });
  }
}

/**
 * Handle invoice created event
 */
async function handleInvoiceCreated(data: Record<string, any>) {
  try {
    const { invoice_id, subscription_id, amount, currency, due_date } = data;

    // Find subscription
    const subscription = await prisma.dodoSubscription.findFirst({
      where: { dodoSubscriptionId: subscription_id }
    });

    if (!subscription) {
      logger.warn('Subscription not found for invoice created event', { subscriptionId: subscription_id });
      return;
    }

    // Create invoice record
    await prisma.invoice.create({
      data: {
        id: invoice_id,
        subscriptionId: subscription.id,
        amount: amount,
        currency: currency,
        status: 'pending',
        userId: subscription.userId
      }
    });

    logger.info('Invoice created event processed', { invoiceId: invoice_id, subscriptionId: subscription_id });
  } catch (error) {
    logger.error('Failed to handle invoice created event', { error: error instanceof Error ? error.message : 'Unknown error', data });
  }
}

/**
 * Handle invoice paid event
 */
async function handleInvoicePaid(data: Record<string, any>) {
  try {
    const { invoice_id, payment_id } = data;

    // Update invoice status
    await prisma.invoice.updateMany({
      where: { id: invoice_id },
      data: {
        status: 'paid',
        paidAt: new Date()
      }
    });

    logger.info('Invoice paid event processed', { invoiceId: invoice_id, paymentId: payment_id });
  } catch (error) {
    logger.error('Failed to handle invoice paid event', { error: error instanceof Error ? error.message : 'Unknown error', data });
  }
}

/**
 * Handle customer created event
 */
async function handleCustomerCreated(data: Record<string, any>) {
  try {
    const { customer_id, email, name } = data;

    // Update user (Note: User model doesn't have dodoCustomerId field, so we'll skip this for now)
    // In the future, we could add this field to the User model or store it in metadata
    // await prisma.user.updateMany({
    //   where: { email: email },
    //   data: { /* dodoCustomerId: customer_id */ }
    // });

    logger.info('Customer created event processed', { customerId: customer_id, email });
  } catch (error) {
    logger.error('Failed to handle customer created event', { error: error instanceof Error ? error.message : 'Unknown error', data });
  }
}

export default router;