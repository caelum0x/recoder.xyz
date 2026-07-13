"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveUserTier = resolveUserTier;
exports.resolveTierFromProductId = resolveTierFromProductId;
const types_js_1 = require("../resources/types.js");
const polar_webhook_js_1 = require("./polar-webhook.js");
/**
 * Resolve a user's current entitlement tier from their active Polar subscription.
 * Connects the Polar webhook subscription state to tier resolution (the link that
 * was missing between billing/polar-webhook and entitlement checks).
 */
function resolveUserTier(userId) {
    const active = (0, polar_webhook_js_1.getActiveSubscriptionByUserId)(userId);
    if (!active) {
        return types_js_1.SubscriptionTier.FREE;
    }
    return resolveTierFromProductId({
        productId: active.productId,
        proProductId: process.env.POLAR_PRO_PRODUCT_ID,
        // Optional: only maps to TEAM when a team product id is configured AND the
        // active subscription's product matches it. Absent env -> no team match
        // (degrade-safe, never inflates an existing pro/enterprise subscriber).
        teamProductId: process.env.POLAR_TEAM_PRODUCT_ID,
        enterpriseProductId: process.env.POLAR_ENTERPRISE_PRODUCT_ID,
    });
}
function resolveTierFromProductId(args) {
    const productId = args.productId ?? '';
    const proProductId = args.proProductId ?? '';
    const teamProductId = args.teamProductId ?? '';
    const enterpriseProductId = args.enterpriseProductId ?? '';
    if (productId && enterpriseProductId && productId === enterpriseProductId) {
        return types_js_1.SubscriptionTier.ENTERPRISE;
    }
    // TEAM is opt-in: only an exact match against a configured team product id
    // yields TEAM. It is checked before the PRO fallback so a real team product
    // is never silently downgraded to PRO, but an unknown product still never
    // inflates to TEAM.
    if (productId && teamProductId && productId === teamProductId) {
        return types_js_1.SubscriptionTier.TEAM;
    }
    if (productId && proProductId && productId === proProductId) {
        return types_js_1.SubscriptionTier.PRO;
    }
    // Default paid subscriptions to PRO to avoid accidental free-tier provisioning.
    return types_js_1.SubscriptionTier.PRO;
}
