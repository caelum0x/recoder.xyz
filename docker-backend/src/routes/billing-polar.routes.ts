/**
 * Billing (Polar) API Routes
 *
 * Additive, fail-safe billing via Polar. Does not touch existing entitlements.
 * Covers health, product listing, checkout creation, and subscription listing.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. The
 * `polar-client` collaborators are lazily imported exactly as before; only the
 * `authenticateRequest` middleware is injected via the factory.
 */

import express, { Router } from 'express';
import {
  ErrorCode,
  createError,
  asyncHandler,
  sendError,
  sendSuccess,
} from '../errors/index.js';

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

type AuthMiddleware = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
) => void;

export interface BillingPolarRouterDeps {
  authenticateRequest: AuthMiddleware;
}

export function createBillingPolarRouter(deps: BillingPolarRouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  router.get('/api/billing/polar/health', asyncHandler(async (_req: express.Request, res: express.Response) => {
    const { polarHealth } = await import('../polar-client.js');
    sendSuccess(res, await polarHealth());
  }));

  router.get('/api/billing/polar/products', authenticateRequest, asyncHandler(async (_req: AuthenticatedRequest, res: express.Response) => {
    const { listProducts } = await import('../polar-client.js');
    sendSuccess(res, await listProducts());
  }));

  router.post('/api/billing/polar/checkout', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { products, successUrl, customerEmail, metadata } = req.body ?? {};
    if (!Array.isArray(products) || products.length === 0) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'products (non-empty array of product IDs) is required'));
    }
    const { createCheckout } = await import('../polar-client.js');
    const result = await createCheckout({ products, successUrl, customerEmail, metadata });
    if (!result.available) return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, result.reason ?? 'Polar unavailable'));
    if (result.reason && !result.checkoutUrl) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, result.reason));
    sendSuccess(res, result);
  }));

  router.get('/api/billing/polar/subscriptions', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { listSubscriptions } = await import('../polar-client.js');
    sendSuccess(res, await listSubscriptions(req.query.customerId as string | undefined));
  }));

  return router;
}
