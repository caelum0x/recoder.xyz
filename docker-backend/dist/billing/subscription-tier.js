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
        enterpriseProductId: process.env.POLAR_ENTERPRISE_PRODUCT_ID,
    });
}
function resolveTierFromProductId(args) {
    const productId = args.productId ?? '';
    const proProductId = args.proProductId ?? '';
    const enterpriseProductId = args.enterpriseProductId ?? '';
    if (productId && enterpriseProductId && productId === enterpriseProductId) {
        return types_js_1.SubscriptionTier.ENTERPRISE;
    }
    if (productId && proProductId && productId === proProductId) {
        return types_js_1.SubscriptionTier.PRO;
    }
    // Default paid subscriptions to PRO to avoid accidental free-tier provisioning.
    return types_js_1.SubscriptionTier.PRO;
}
