// DODO Payments Webhook Handler
// Processes subscription events and updates database

import express from 'express';
import { getDodoPaymentsInstance } from '../services/dodo-payments';
import { logger } from '../utils/logger';
import { prisma } from '../database/prisma';

const router = express.Router();
const dodoPayments = getDodoPaymentsInstance();

// Raw body parser for webhook signature verification
router.use('/dodo', express.raw({ type: 'application/json' }));

/**
 * POST /api/webhooks/dodo
 * Handle DODO Payments webhooks
 */
router.post('/dodo', async (req, res) => {
  try {
    const signature = req.headers['x-dodo-signature'] as string;
    const payload = req.body.toString();

    // Verify webhook signature
    if (!dodoPayments.verifyWebhookSignature(payload, signature)) {
      logger.warn('Invalid DODO webhook signature', { signature });
      return res.status(400).json({
        success: false,
        error: 'Invalid signature'
      });
    }

    const event = JSON.parse(payload);
    logger.info('DODO webhook received', { eventType: event.type, eventId: event.id });

    // Process webhook event
    await processWebhookEvent(event);

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to process DODO webhook', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed'
    });
  }
});

/**
 * Process different types of webhook events
 */
async function processWebhookEvent(event: any) {
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
async function handleSubscriptionCreated(data: any) {
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
    await prisma.subscription.upsert({
      where: { dodoSubscriptionId: subscription_id },
      update: {
        status: status,
        amount: recurring_pre_tax_amount
      },
      create: {
        id: subscription_id,
        userId: user.id,
        planId: product_id,
        dodoSubscriptionId: subscription_id,
        status: status,
        amount: recurring_pre_tax_amount,
        currency: 'USD'
      }
    });

    logger.info('Subscription created event processed', { subscriptionId: subscription_id, userId: user.id });
  } catch (error) {
    logger.error('Failed to handle subscription created event', { error: error.message, data });
  }
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(data: any) {
  try {
    const { subscription_id, status, recurring_pre_tax_amount, product_id } = data;

    await prisma.subscription.updateMany({
      where: { dodoSubscriptionId: subscription_id },
      data: {
        status: status,
        amount: recurring_pre_tax_amount,
        planId: product_id
      }
    });

    logger.info('Subscription updated event processed', { subscriptionId: subscription_id });
  } catch (error) {
    logger.error('Failed to handle subscription updated event', { error: error.message, data });
  }
}

/**
 * Handle subscription cancelled event
 */
async function handleSubscriptionCancelled(data: any) {
  try {
    const { subscription_id, cancelled_at, cancel_at_next_billing_date } = data;

    await prisma.subscription.updateMany({
      where: { dodoSubscriptionId: subscription_id },
      data: {
        status: cancel_at_next_billing_date ? 'cancelled_at_period_end' : 'cancelled',
        cancelledAt: cancelled_at ? new Date(cancelled_at) : new Date()
      }
    });

    logger.info('Subscription cancelled event processed', { subscriptionId: subscription_id });
  } catch (error) {
    logger.error('Failed to handle subscription cancelled event', { error: error.message, data });
  }
}

/**
 * Handle subscription expired event
 */
async function handleSubscriptionExpired(data: any) {
  try {
    const { subscription_id } = data;

    await prisma.subscription.updateMany({
      where: { dodoSubscriptionId: subscription_id },
      data: {
        status: 'expired'
      }
    });

    logger.info('Subscription expired event processed', { subscriptionId: subscription_id });
  } catch (error) {
    logger.error('Failed to handle subscription expired event', { error: error.message, data });
  }
}

/**
 * Handle payment succeeded event
 */
async function handlePaymentSucceeded(data: any) {
  try {
    const { payment_id, subscription_id, amount, currency } = data;

    // Find subscription
    const subscription = await prisma.subscription.findFirst({
      where: { dodoSubscriptionId: subscription_id }
    });

    if (!subscription) {
      logger.warn('Subscription not found for payment succeeded event', { subscriptionId: subscription_id });
      return;
    }

    // Record successful payment
    await prisma.payment.upsert({
      where: { id: payment_id },
      update: {
        status: 'succeeded',
        amount: amount,
        currency: currency
      },
      create: {
        id: payment_id,
        subscriptionId: subscription.id,
        amount: amount,
        currency: currency,
        status: 'succeeded'
      }
    });

    // Update subscription to active
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'active' }
    });

    // Update user's subscription status
    await prisma.user.update({
      where: { id: subscription.userId },
      data: { subscriptionStatus: 'active' }
    });

    logger.info('Payment succeeded event processed', { paymentId: payment_id, subscriptionId: subscription_id });
  } catch (error) {
    logger.error('Failed to handle payment succeeded event', { error: error.message, data });
  }
}

/**
 * Handle payment failed event
 */
async function handlePaymentFailed(data: any) {
  try {
    const { payment_id, subscription_id, amount, currency, failure_reason } = data;

    // Find subscription
    const subscription = await prisma.subscription.findFirst({
      where: { dodoSubscriptionId: subscription_id }
    });

    if (!subscription) {
      logger.warn('Subscription not found for payment failed event', { subscriptionId: subscription_id });
      return;
    }

    // Record failed payment
    await prisma.payment.upsert({
      where: { id: payment_id },
      update: {
        status: 'failed',
        amount: amount,
        currency: currency,
        failureReason: failure_reason
      },
      create: {
        id: payment_id,
        subscriptionId: subscription.id,
        amount: amount,
        currency: currency,
        status: 'failed',
        failureReason: failure_reason
      }
    });

    // Update subscription status
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'failed' }
    });

    // Send notification to user about failed payment
    // This would integrate with your notification system
    
    logger.info('Payment failed event processed', { paymentId: payment_id, subscriptionId: subscription_id, reason: failure_reason });
  } catch (error) {
    logger.error('Failed to handle payment failed event', { error: error.message, data });
  }
}

/**
 * Handle invoice created event
 */
async function handleInvoiceCreated(data: any) {
  try {
    const { invoice_id, subscription_id, amount, currency, due_date } = data;

    // Find subscription
    const subscription = await prisma.subscription.findFirst({
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
        dueDate: due_date ? new Date(due_date) : new Date()
      }
    });

    logger.info('Invoice created event processed', { invoiceId: invoice_id, subscriptionId: subscription_id });
  } catch (error) {
    logger.error('Failed to handle invoice created event', { error: error.message, data });
  }
}

/**
 * Handle invoice paid event
 */
async function handleInvoicePaid(data: any) {
  try {
    const { invoice_id, payment_id } = data;

    // Update invoice status
    await prisma.invoice.updateMany({
      where: { id: invoice_id },
      data: {
        status: 'paid',
        paymentId: payment_id,
        paidAt: new Date()
      }
    });

    logger.info('Invoice paid event processed', { invoiceId: invoice_id, paymentId: payment_id });
  } catch (error) {
    logger.error('Failed to handle invoice paid event', { error: error.message, data });
  }
}

/**
 * Handle customer created event
 */
async function handleCustomerCreated(data: any) {
  try {
    const { customer_id, email, name } = data;

    // Update user with DODO customer ID
    await prisma.user.updateMany({
      where: { email: email },
      data: { dodoCustomerId: customer_id }
    });

    logger.info('Customer created event processed', { customerId: customer_id, email });
  } catch (error) {
    logger.error('Failed to handle customer created event', { error: error.message, data });
  }
}

export default router;