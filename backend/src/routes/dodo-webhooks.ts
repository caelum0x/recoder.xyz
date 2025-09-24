/**
 * DODO Payments Webhook Routes
 * Handles real-time payment and subscription events from DODO Payments
 */

import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { dodoWebhookHandler, DodoWebhookEvent } from '../services/dodo-webhook-handler';
import { logger } from '../utils/logger';
import { APIResponse } from '../types';
import * as crypto from 'crypto';

const router = Router();

/**
 * Raw body parser middleware for webhook signature verification
 */
const rawBodyParser = (req: Request, res: Response, next: any) => {
  if (req.headers['content-type'] === 'application/json') {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      req.body = data;
      next();
    });
  } else {
    next();
  }
};

/**
 * POST /api/webhooks/dodo
 * Handle DODO Payments webhook events
 */
router.post('/dodo', rawBodyParser, async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['dodo-signature'] as string;
    const timestamp = req.headers['dodo-timestamp'] as string;
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    // Log webhook receipt
    logger.info('Received DODO webhook', {
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
      bodyLength: rawBody.length,
      userAgent: req.headers['user-agent']
    });

    // Verify webhook signature for security
    if (!dodoWebhookHandler.verifyWebhookSignature(rawBody, signature, timestamp)) {
      logger.error('DODO webhook signature verification failed', {
        signature: signature?.substring(0, 10) + '...',
        timestamp
      });
      res.status(400).json({
        success: false,
        error: 'Invalid webhook signature'
      } as APIResponse);
      return;
    }

    // Parse webhook event
    let event: DodoWebhookEvent;
    try {
      event = JSON.parse(rawBody);
    } catch (parseError) {
      logger.error('Failed to parse DODO webhook payload', { 
        error: parseError instanceof Error ? parseError.message : 'Parse error',
        rawBody: rawBody.substring(0, 200)
      });
      res.status(400).json({
        success: false,
        error: 'Invalid JSON payload'
      } as APIResponse);
      return;
    }

    // Validate event structure
    if (!event.id || !event.type || !event.data?.object) {
      logger.error('Invalid DODO webhook event structure', {
        hasId: !!event.id,
        hasType: !!event.type,
        hasData: !!event.data,
        hasObject: !!event.data?.object
      });
      res.status(400).json({
        success: false,
        error: 'Invalid event structure'
      } as APIResponse);
      return;
    }

    // Check timestamp to prevent replay attacks (events older than 5 minutes)
    const eventTimestamp = parseInt(timestamp, 10);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const maxAge = 5 * 60; // 5 minutes

    if (Math.abs(currentTimestamp - eventTimestamp) > maxAge) {
      logger.error('DODO webhook event too old', {
        eventTimestamp,
        currentTimestamp,
        ageDifference: currentTimestamp - eventTimestamp
      });
      res.status(400).json({
        success: false,
        error: 'Event timestamp too old'
      } as APIResponse);
      return;
    }

    // Process the webhook event
    await dodoWebhookHandler.processWebhookEvent(event);

    // Log successful processing
    logger.info('DODO webhook processed successfully', {
      eventId: event.id,
      eventType: event.type,
      objectId: event.data.object.id
    });

    // Respond to DODO that we received the webhook
    res.status(200).json({
      success: true,
      received: true,
      eventId: event.id
    } as APIResponse);

  } catch (error) {
    logger.error('DODO webhook processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    // Return 500 so DODO will retry the webhook
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed'
    } as APIResponse);
  }
});

/**
 * GET /api/webhooks/dodo/health
 * Health check endpoint for DODO webhook system
 */
router.get('/dodo/health', async (req: Request, res: Response): Promise<void> => {
  try {
    // Check database connectivity and webhook configuration
    const config = {
      webhookSecretConfigured: !!process.env.DODO_WEBHOOK_SECRET,
      dodoApiKeyConfigured: !!process.env.DODO_API_KEY,
      dodoApiUrlConfigured: !!process.env.DODO_PAYMENTS_URL
    };

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      configuration: config
    } as APIResponse);

  } catch (error) {
    logger.error('DODO webhook health check failed', { error });
    
    res.status(500).json({
      success: false,
      error: 'Health check failed'
    } as APIResponse);
  }
});

/**
 * POST /api/webhooks/dodo/test
 * Test endpoint for webhook processing (development only)
 */
router.post('/dodo/test', [
  body('eventType').isString().notEmpty().withMessage('Event type is required'),
  body('testData').isObject().withMessage('Test data is required')
], async (req: Request, res: Response): Promise<void> => {
  // Only allow in non-production environments
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({
      success: false,
      error: 'Test endpoint not available in production'
    } as APIResponse);
    return;
  }

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

    const { eventType, testData } = req.body;

    // Create test webhook event
    const testEvent: DodoWebhookEvent = {
      id: `test_${crypto.randomBytes(8).toString('hex')}`,
      type: eventType,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: testData
      }
    };

    logger.info('Processing test webhook event', {
      eventType,
      eventId: testEvent.id
    });

    // Process the test event
    await dodoWebhookHandler.processWebhookEvent(testEvent);

    res.json({
      success: true,
      message: 'Test webhook processed successfully',
      eventId: testEvent.id
    } as APIResponse);

  } catch (error) {
    logger.error('Test webhook processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Test webhook processing failed'
    } as APIResponse);
  }
});

/**
 * GET /api/webhooks/dodo/events
 * Get recent webhook events for debugging (requires admin auth)
 */
router.get('/dodo/events', async (req: Request, res: Response): Promise<void> => {
  try {
    // This would require admin authentication in production
    const events = await dodoWebhookHandler.getRecentEvents();

    res.json({
      success: true,
      data: events
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to fetch webhook events', { error });
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch events'
    } as APIResponse);
  }
});

export default router;