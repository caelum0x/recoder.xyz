import { SubscriptionTier } from '../resources/types.js';

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
