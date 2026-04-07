"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTierFromProductId = resolveTierFromProductId;
const types_js_1 = require("../resources/types.js");
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
