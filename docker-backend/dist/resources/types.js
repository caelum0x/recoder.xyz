"use strict";
/**
 * Resource Management Types
 * Defines resource limits, usage tracking, and tier configurations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionTier = void 0;
/**
 * Subscription tiers matching the enterprise billing module
 */
var SubscriptionTier;
(function (SubscriptionTier) {
    SubscriptionTier["FREE"] = "free";
    SubscriptionTier["PRO"] = "pro";
    SubscriptionTier["ENTERPRISE"] = "enterprise";
})(SubscriptionTier || (exports.SubscriptionTier = SubscriptionTier = {}));
