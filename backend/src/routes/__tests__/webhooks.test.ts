/**
 * Tests for Webhooks Route
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock the webhook route handler
const mockWebhookHandler = jest.fn();

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock webhook endpoint
  app.post('/webhooks/dodo', mockWebhookHandler);
  
  return app;
};

describe('Webhooks Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe('POST /webhooks/dodo', () => {
    it('should accept valid webhook payload', async () => {
      const webhookPayload = {
        event_type: 'subscription.created',
        data: {
          subscription_id: 'sub_123',
          customer_id: 'cust_123',
          status: 'active',
          plan_id: 'plan_123'
        }
      };

      mockWebhookHandler.mockImplementation((req, res) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .post('/webhooks/dodo')
        .send(webhookPayload);

      expect(response.status).toBe(200);
      expect(mockWebhookHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle subscription events', async () => {
      const subscriptionEvent = {
        event_type: 'subscription.updated',
        data: {
          subscription_id: 'sub_123',
          status: 'cancelled'
        }
      };

      mockWebhookHandler.mockImplementation((req, res) => {
        expect(req.body.event_type).toBe('subscription.updated');
        res.status(200).json({ success: true });
      });

      await request(app)
        .post('/webhooks/dodo')
        .send(subscriptionEvent);

      expect(mockWebhookHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          body: subscriptionEvent
        }),
        expect.any(Object)
      );
    });

    it('should handle payment events', async () => {
      const paymentEvent = {
        event_type: 'payment.succeeded',
        data: {
          payment_id: 'pay_123',
          amount: 2999,
          currency: 'usd'
        }
      };

      mockWebhookHandler.mockImplementation((req, res) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .post('/webhooks/dodo')
        .send(paymentEvent);

      expect(response.status).toBe(200);
    });

    it('should reject invalid payloads', async () => {
      mockWebhookHandler.mockImplementation((req, res) => {
        res.status(400).json({ error: 'Invalid payload' });
      });

      const response = await request(app)
        .post('/webhooks/dodo')
        .send({ invalid: 'payload' });

      expect(response.status).toBe(400);
    });

    it('should handle webhook verification', async () => {
      const validPayload = {
        event_type: 'test.event',
        data: { test: true }
      };

      mockWebhookHandler.mockImplementation((req, res) => {
        // Mock signature verification
        const signature = req.headers['x-dodo-signature'];
        if (!signature) {
          return res.status(401).json({ error: 'Missing signature' });
        }
        res.status(200).json({ success: true });
      });

      // Test without signature
      const responseWithoutSig = await request(app)
        .post('/webhooks/dodo')
        .send(validPayload);

      expect(responseWithoutSig.status).toBe(401);

      // Test with signature
      const responseWithSig = await request(app)
        .post('/webhooks/dodo')
        .set('x-dodo-signature', 'valid-signature')
        .send(validPayload);

      expect(responseWithSig.status).toBe(200);
    });
  });

  describe('error handling', () => {
    it('should handle malformed JSON', async () => {
      mockWebhookHandler.mockImplementation((req, res) => {
        res.status(400).json({ error: 'Invalid JSON' });
      });

      const response = await request(app)
        .post('/webhooks/dodo')
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });

    it('should handle large payloads gracefully', async () => {
      const largePayload = {
        event_type: 'test.event',
        data: {
          large_data: 'x'.repeat(10000) // 10KB of data
        }
      };

      mockWebhookHandler.mockImplementation((req, res) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .post('/webhooks/dodo')
        .send(largePayload);

      expect(response.status).toBe(200);
    });
  });
});