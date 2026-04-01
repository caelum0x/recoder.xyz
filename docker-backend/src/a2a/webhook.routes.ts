/**
 * @module webhook.routes
 *
 * Webhook endpoints for external service → A2A integration.
 * Mounted at /api/a2a/webhook
 *
 * POST /chatwoot          Chatwoot webhook receiver (message_created events)
 * POST /chatwoot/reply    Send a reply back through Chatwoot
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  normalizeChatwootEvent,
  dispatchWebhookToA2A,
  sendChatwootReply,
  type A2AWebhookEvent,
} from './webhook-gateway.js';
import { logger } from '../logger.js';

const router = Router();

function ok(res: Response, data: unknown): void {
  res.json({ success: true, data });
}

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, error: message });
}

// POST /api/a2a/webhook/chatwoot
// Chatwoot calls this on every conversation event. We ack immediately (< 5s)
// and dispatch to A2A in the background to avoid Chatwoot retry storms.
router.post('/chatwoot', (req: Request, res: Response) => {
  // Immediate ACK
  res.json({ success: true, received: true });

  const payload = req.body as Record<string, unknown>;
  logger.debug({ event: payload.event }, '[webhook.routes] Chatwoot event received');

  setImmediate(async () => {
    try {
      const event = normalizeChatwootEvent(payload as unknown as Parameters<typeof normalizeChatwootEvent>[0]);
      if (!event) return; // Ignored event type (outgoing, status update, etc.)

      await dispatchWebhookToA2A(event);
    } catch (err) {
      logger.warn({ err }, '[webhook.routes] Chatwoot dispatch failed');
    }
  });
});

// POST /api/a2a/webhook/chatwoot/reply
// Agents call this to send a reply back to the original Chatwoot conversation.
router.post('/chatwoot/reply', async (req: Request, res: Response) => {
  const { accountId, conversationId, content } = req.body as {
    accountId?: string;
    conversationId?: string;
    content?: string;
  };

  if (!accountId || !conversationId || !content) {
    return fail(res, 400, 'accountId, conversationId, and content are required');
  }

  try {
    await sendChatwootReply({ accountId, conversationId, content });
    ok(res, { sent: true });
  } catch (err) {
    logger.warn({ err }, '[webhook.routes] Chatwoot reply failed');
    fail(res, 500, err instanceof Error ? err.message : 'Reply failed');
  }
});

// GET /api/a2a/webhook/health — liveness check used by Chatwoot webhook config
router.get('/health', (_req: Request, res: Response) => {
  ok(res, { status: 'ok', service: 'recoder-a2a-webhook-gateway' });
});

export { router as webhookRouter };
