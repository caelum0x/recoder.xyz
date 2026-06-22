import { SubscriptionTier } from '../resources/types.js';
import { getActiveSubscriptionByUserId } from './polar-webhook.js';

/**
 * Resolve a user's current entitlement tier from their active Polar subscription.
 * Connects the Polar webhook subscription state to tier resolution (the link that
 * was missing between billing/polar-webhook and entitlement checks).
 */
export function resolveUserTier(userId: string): SubscriptionTier {
  const active = getActiveSubscriptionByUserId(userId);
  if (!active) {
    return SubscriptionTier.FREE;
  }
  return resolveTierFromProductId({
    productId: active.productId,
    proProductId: process.env.POLAR_PRO_PRODUCT_ID,
    enterpriseProductId: process.env.POLAR_ENTERPRISE_PRODUCT_ID,
  });
}

export function resolveTierFromProductId(args: {
  productId?: string | null;
  proProductId?: string | null;
  enterpriseProductId?: string | null;
}): SubscriptionTier {
  const productId = args.productId ?? '';
  const proProductId = args.proProductId ?? '';
  const enterpriseProductId = args.enterpriseProductId ?? '';

  if (productId && enterpriseProductId && productId === enterpriseProductId) {
    return SubscriptionTier.ENTERPRISE;
  }
  if (productId && proProductId && productId === proProductId) {
    return SubscriptionTier.PRO;
  }
  // Default paid subscriptions to PRO to avoid accidental free-tier provisioning.
  return SubscriptionTier.PRO;
}
