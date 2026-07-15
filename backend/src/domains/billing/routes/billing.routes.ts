/**
 * Billing routes — the authenticated self-service surface for the active MoR
 * provider. Mount under `/api/billing` behind the identity auth middleware.
 *
 *   GET  /plan      — the caller's effective entitlement view (plan+features+quotas)
 *   POST /checkout  — start a hosted checkout for a plan tier → a redirect URL
 *   GET  /portal    — customer-portal data: active subscription + recent invoices
 *   POST /cancel    — cancel the caller's active subscription (now or at period end)
 *
 * The billing subject is derived from the authenticated {@link Principal}
 * (org scope wins over user), never from the request body — a caller can only act
 * on their own subject. Every provider interaction is FAIL-SAFE: an unconfigured
 * provider surfaces `SERVICE_UNAVAILABLE` (503), and an unmapped plan product
 * surfaces `VALIDATION_ERROR` (400) — never a fabricated checkout URL.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { createError, ErrorCode, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import type { EntitlementGate } from '../ports/entitlement.port.js';
import type { MeteringRepository } from '../ports/metering-repo.port.js';
import type { PlanCatalog } from '../services/plan-catalog.service.js';
import type { ProviderRegistry } from '../provider-registry.js';
import { PLAN_TIERS, type BillingSubject, type PlanTier } from '../types.js';

export interface BillingRouterDeps {
  readonly gate: EntitlementGate;
  readonly registry: ProviderRegistry;
  readonly catalog: PlanCatalog;
  readonly repo: MeteringRepository;
  readonly mw: AuthMiddleware;
  readonly logger: Logger;
}

/** Purchasable tiers only (never `free`; `enterprise` is negotiated upstream). */
const purchasableTiers = PLAN_TIERS.filter((t): t is PlanTier => t !== 'free' && t !== 'enterprise');

const checkoutBodySchema = z.object({
  plan: z.enum(purchasableTiers as unknown as [PlanTier, ...PlanTier[]]),
  successUrl: z.string().url(),
  cancelUrl: z.string().url().optional(),
});

const cancelBodySchema = z.object({
  atPeriodEnd: z.boolean().optional(),
});

/** Derive the billing subject from the authenticated principal (org wins). */
function subjectOf(principal: Principal): BillingSubject {
  return principal.orgId
    ? { subjectId: principal.orgId, kind: 'org' }
    : { subjectId: principal.userId, kind: 'user' };
}

function principalOf(req: Request): Principal | null {
  return req.principal && !req.principal.isAnonymous ? req.principal : null;
}

export function buildBillingRouter(deps: BillingRouterDeps): Router {
  const { gate, registry, catalog, repo, mw, logger } = deps;
  const router = Router();

  router.get(
    '/plan',
    mw.authenticate,
    asyncHandler(async (req, res) => {
      const principal = req.principal;
      if (!principal) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const view = await gate.view(subjectOf(principal));
      sendSuccess(res, view);
    }),
  );

  router.post(
    '/checkout',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const principal = principalOf(req);
      if (!principal) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const parsed = checkoutBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'invalid body'));
        return;
      }
      const subject = subjectOf(principal);
      const productId = catalog.productForPlan(parsed.data.plan, registry.activeName);
      if (!productId) {
        sendError(
          res,
          createError(
            ErrorCode.VALIDATION_ERROR,
            `no ${registry.activeName} product configured for plan '${parsed.data.plan}'`,
          ),
        );
        return;
      }
      try {
        const result = await registry.active().createCheckout({
          subject,
          plan: parsed.data.plan,
          productId,
          successUrl: parsed.data.successUrl,
          ...(parsed.data.cancelUrl ? { cancelUrl: parsed.data.cancelUrl } : {}),
          ...(principal.email ? { customerEmail: principal.email } : {}),
        });
        sendSuccess(res, result, { statusCode: 201 });
      } catch (error) {
        logger.warn({ error, plan: parsed.data.plan }, 'checkout failed');
        sendError(res, error);
      }
    }),
  );

  router.get(
    '/portal',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const principal = principalOf(req);
      if (!principal) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const subject = subjectOf(principal);
      const [subscription, invoices, view] = await Promise.all([
        repo.getActiveSubscription(subject.subjectId),
        repo.listInvoices(subject.subjectId, 20),
        gate.view(subject),
      ]);
      sendSuccess(res, {
        provider: registry.activeName,
        plan: view.plan,
        subscription,
        invoices,
        canManage: subscription != null && subscription.status !== 'canceled',
      });
    }),
  );

  router.post(
    '/cancel',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const principal = principalOf(req);
      if (!principal) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const parsed = cancelBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'invalid body'));
        return;
      }
      const subject = subjectOf(principal);
      const sub = await repo.getActiveSubscription(subject.subjectId);
      if (!sub || !sub.providerSubId) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'no active subscription to cancel'));
        return;
      }
      // Cancel with the provider the subscription belongs to (not necessarily the
      // active default provider) — degrade-safe: `null` ⇒ provider unreachable.
      const providerPort = registry.get(sub.provider);
      const updated = await providerPort.cancel(sub.providerSubId, {
        atPeriodEnd: parsed.data.atPeriodEnd ?? true,
      });
      if (!updated) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'cancellation could not be confirmed with the provider'));
        return;
      }
      // The durable projection is reconciled by the provider's webhook; we return
      // the provider's immediate view so the UI reflects the pending change.
      sendSuccess(res, {
        provider: sub.provider,
        providerSubId: updated.providerSubId,
        status: updated.status,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      });
    }),
  );

  return router;
}
