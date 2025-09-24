// DODO Payments Webhook Handler
// Processes subscription events and updates database

import express, { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { prisma } from '../database/prisma';
import { APIResponse, WebhookEvent } from '../types';
import * as crypto from 'crypto';

const router = express.Router();

// Health check endpoint for webhook service
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Webhook service is healthy',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/api/webhooks/dodo - DODO Payments webhook handler',
      '/api/webhooks/test - Test webhook endpoint',
      '/api/webhooks/health - Health check'
    ]
  });
});

// Test webhook endpoint for development
router.post('/test', express.json(), async (req: Request, res: Response): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ success: false, error: 'Test endpoint not available in production' });
    return;
  }

  try {
    logger.info('Test webhook received', { body: req.body, headers: req.headers });
    
    res.json({
      success: true,
      message: 'Test webhook received successfully',
      receivedData: req.body,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Test webhook error', { error });
    res.status(500).json({ success: false, error: 'Test webhook failed' });
  }
});

// Raw body parser specifically for webhook signature verification
router.use('/dodo', express.raw({ 
  type: 'application/json',
  limit: '1mb' // Prevent large payloads
}));

/**
 * POST /api/webhooks/dodo
 * Handle DODO Payments webhooks with enhanced error handling
 */
router.post('/dodo', async (req: Request, res: Response): Promise<void> => {
  let event: WebhookEvent;
  
  try {
    const signature = req.headers['x-dodo-signature'] as string;
    const timestamp = req.headers['x-dodo-timestamp'] as string;
    
    // Basic validation
    if (!signature) {
      logger.warn('Missing DODO webhook signature', { ip: req.ip });
      res.status(400).json({
        success: false,
        error: 'Missing signature',
        code: 'WEBHOOK_SIGNATURE_MISSING'
      });
      return;
    }

    if (!req.body || req.body.length === 0) {
      logger.warn('Empty webhook payload received', { ip: req.ip });
      res.status(400).json({
        success: false,
        error: 'Empty payload',
        code: 'WEBHOOK_EMPTY_PAYLOAD'
      });
      return;
    }

    // Convert buffer to string safely
    let payload: string;
    try {
      payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
    } catch (bufferError) {
      logger.error('Failed to convert webhook payload to string', { error: bufferError });
      res.status(400).json({
        success: false,
        error: 'Invalid payload encoding',
        code: 'WEBHOOK_ENCODING_ERROR'
      });
      return;
    }

    // Parse JSON with proper error handling
    try {
      event = JSON.parse(payload);
    } catch (parseError) {
      logger.error('Failed to parse webhook JSON payload', { 
        error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
        payloadLength: payload.length,
        payloadPreview: payload.substring(0, 100)
      });
      res.status(400).json({
        success: false,
        error: 'Invalid JSON payload',
        code: 'WEBHOOK_JSON_PARSE_ERROR'
      });
      return;
    }

    // Validate webhook event structure
    if (!event || typeof event !== 'object') {
      logger.warn('Invalid webhook event structure', { event });
      res.status(400).json({
        success: false,
        error: 'Invalid event structure',
        code: 'WEBHOOK_INVALID_STRUCTURE'
      });
      return;
    }

    if (!event.type || !event.data) {
      logger.warn('Missing required webhook event fields', { 
        hasType: !!event.type, 
        hasData: !!event.data,
        eventKeys: Object.keys(event)
      });
      res.status(400).json({
        success: false,
        error: 'Missing required event fields (type, data)',
        code: 'WEBHOOK_MISSING_FIELDS'
      });
      return;
    }

    // Enhanced signature verification (for production)
    if (process.env.NODE_ENV === 'production') {
      const expectedSignature = generateWebhookSignature(payload, process.env.DODO_WEBHOOK_SECRET);
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        logger.warn('Invalid webhook signature', { 
          providedSignature: signature.substring(0, 10) + '...',
          ip: req.ip 
        });
        res.status(401).json({
          success: false,
          error: 'Invalid signature',
          code: 'WEBHOOK_SIGNATURE_INVALID'
        });
        return;
      }
    }

    logger.info('DODO webhook received and validated', { 
      eventType: event.type, 
      eventId: event.id,
      timestamp: timestamp,
      ip: req.ip
    });

    // Process webhook event
    await processWebhookEvent(event);

    res.json({ 
      success: true,
      message: 'Webhook processed successfully',
      eventId: event.id,
      eventType: event.type
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error('Webhook processing failed', { 
      error: errorMessage,
      stack: errorStack,
      eventType: event?.type,
      eventId: event?.id,
      ip: req.ip
    });
    
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed',
      code: 'WEBHOOK_PROCESSING_ERROR',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
});

/**
 * Generate webhook signature for verification
 */
function generateWebhookSignature(payload: string, secret?: string): string {
  if (!secret) {
    return 'no-secret-configured';
  }
  
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

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
 * Handle payment succeeded event with enhanced validation and error handling
 */
async function handlePaymentSucceeded(data: Record<string, any>) {
  try {
    // Validate required fields
    const { payment_id, subscription_id, amount, currency } = data;

    if (!payment_id || !subscription_id || amount === undefined || !currency) {
      logger.error('Missing required fields in payment succeeded event', { 
        hasPaymentId: !!payment_id,
        hasSubscriptionId: !!subscription_id,
        hasAmount: amount !== undefined,
        hasCurrency: !!currency,
        data 
      });
      throw new Error('Missing required payment fields');
    }

    // Validate amount is a positive number
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numericAmount) || numericAmount <= 0) {
      logger.error('Invalid payment amount', { amount, numericAmount });
      throw new Error('Invalid payment amount');
    }

    // Find subscription with error handling
    const subscription = await prisma.dodoSubscription.findFirst({
      where: { dodoSubscriptionId: subscription_id },
      include: {
        user: {
          select: { id: true, email: true, name: true }
        }
      }
    });

    if (!subscription) {
      logger.warn('Subscription not found for payment succeeded event', { 
        subscriptionId: subscription_id,
        paymentId: payment_id 
      });
      throw new Error(`Subscription not found: ${subscription_id}`);
    }

    // Check if payment already processed to prevent duplicates
    const existingCharge = await prisma.dodoCharge.findFirst({
      where: { dodoChargeId: payment_id }
    });

    if (existingCharge && existingCharge.status === 'succeeded') {
      logger.info('Payment already processed, skipping', { 
        paymentId: payment_id,
        existingChargeId: existingCharge.id 
      });
      return;
    }

    // Use transaction to ensure data consistency
    await prisma.$transaction(async (tx) => {
      // Record successful payment
      await tx.dodoCharge.upsert({
        where: { dodoChargeId: payment_id },
        update: {
          status: 'succeeded',
          amount: numericAmount,
          currency: currency.toUpperCase(),
          processedAt: new Date()
        },
        create: {
          id: crypto.randomUUID(),
          subscriptionId: subscription.id,
          dodoChargeId: payment_id,
          amount: numericAmount,
          currency: currency.toUpperCase(),
          description: 'Payment succeeded',
          status: 'succeeded',
          processedAt: new Date()
        }
      });

      // Update subscription to active and set next billing date
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1); // Assume monthly billing

      await tx.dodoSubscription.update({
        where: { id: subscription.id },
        data: { 
          status: 'active',
          lastPaymentAt: new Date(),
          nextBillingDate: nextBillingDate
        }
      });

      // Update user's subscription status
      await tx.user.update({
        where: { id: subscription.userId },
        data: { 
          subscription: 'active',
          subscriptionStatus: 'active'
        }
      });

      // Create audit log entry
      await tx.auditLog.create({
        data: {
          userId: subscription.userId,
          action: 'payment_succeeded',
          resource: 'payment',
          resourceId: payment_id,
          metadata: {
            amount: numericAmount,
            currency: currency,
            subscriptionId: subscription_id,
            timestamp: new Date()
          }
        }
      });
    });

    logger.info('Payment succeeded event processed successfully', { 
      paymentId: payment_id, 
      subscriptionId: subscription_id,
      userId: subscription.userId,
      userEmail: subscription.user.email,
      amount: numericAmount,
      currency: currency
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle payment succeeded event', { 
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      data,
      paymentId: data?.payment_id,
      subscriptionId: data?.subscription_id
    });
    
    // Re-throw error to be handled by the main webhook handler
    throw error;
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