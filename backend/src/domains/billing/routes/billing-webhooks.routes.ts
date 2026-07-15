/**
 * Billing webhook routes — the ONE unauthenticated ingress that mutates the
 * subscription projection, gated by a per-provider RAW-BODY signature check.
 *
 *   POST /api/billing/webhooks/:provider   (provider ∈ polar|creem|paddle|dodo)
 *
 * SECURITY / CORRECTNESS:
 *  - These routes carry NO session auth (a provider cannot present one). Trust is
 *    established ONLY by the adapter's `verifyWebhook`/`parseEvent` over the exact
 *    bytes received — so this router installs its own `express.raw` body parser
 *    and the edge MUST mount it BEFORE any global `express.json()` (otherwise the
 *    JSON parser consumes the stream and the signature can never verify). See the
 *    wiring report.
 *  - A bad/absent signature ⇒ `parseEvent` returns `null` ⇒ 400 (dropped, never
 *    trusted). A duplicate event ⇒ 200 (idempotent no-op). A repo fault ⇒ 5xx so
 *    the provider RETRIES rather than the event being silently lost.
 *  - The response body is intentionally minimal (no payload echo, no secrets).
 */
import { Router, type Request, type Response } from 'express';
import express from 'express';
import { createError, ErrorCode, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { WebhookService } from '../services/webhook.service.js';
import { BILLING_PROVIDERS, type BillingProviderName } from '../types.js';

export interface BillingWebhooksRouterDeps {
  readonly webhooks: WebhookService;
  readonly logger: Logger;
}

/** Normalize express headers to a plain `string→string` record for the verifier. */
function headerRecord(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') out[k] = v;
    else if (Array.isArray(v)) out[k] = v[0] ?? '';
  }
  return out;
}

/** The exact bytes the provider signed (a Buffer via `express.raw`), or null. */
function rawBodyOf(req: Request): Buffer | null {
  if (Buffer.isBuffer(req.body)) return req.body;
  // Some upstream setups capture the raw buffer on `req.rawBody`.
  const captured = (req as { rawBody?: unknown }).rawBody;
  if (Buffer.isBuffer(captured)) return captured;
  return null;
}

function isProvider(v: string): v is BillingProviderName {
  return (BILLING_PROVIDERS as readonly string[]).includes(v);
}

export function buildBillingWebhooksRouter(deps: BillingWebhooksRouterDeps): Router {
  const { webhooks, logger } = deps;
  const router = Router();

  router.post(
    '/webhooks/:provider',
    // Raw body is mandatory for signature verification — parse it here, not as JSON.
    express.raw({ type: '*/*', limit: '1mb' }),
    asyncHandler(async (req: Request, res: Response) => {
      const provider = String(req.params.provider ?? '').toLowerCase();
      if (!isProvider(provider)) {
        sendError(res, createError(ErrorCode.NOT_FOUND, `unknown billing provider: ${provider}`));
        return;
      }

      const rawBody = rawBodyOf(req);
      if (!rawBody) {
        // Fail closed: without the exact bytes we cannot verify — never trust it.
        logger.error({ provider }, 'billing webhook missing raw body — cannot verify signature');
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'raw request body required for signature verification'));
        return;
      }

      const parsed = webhooks.verifyAndParse(provider, rawBody, headerRecord(req));
      if (!parsed) {
        // Bad or absent signature: drop it (do not leak which check failed).
        logger.warn({ provider }, 'billing webhook signature verification failed — dropped');
        sendError(res, createError(ErrorCode.AUTH_INVALID_TOKEN, 'invalid webhook signature'));
        return;
      }

      const result = await webhooks.process(parsed, rawBody);
      sendSuccess(res, {
        received: true,
        provider,
        type: result.type,
        action: result.action,
        duplicate: result.duplicate,
        ...(result.plan ? { plan: result.plan } : {}),
        ...(result.status ? { status: result.status } : {}),
      });
    }),
  );

  return router;
}
