"use strict";
/**
 * Subscription and billing types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupportLevel = exports.Currency = exports.BillingInterval = exports.SubscriptionStatus = exports.SubscriptionPlan = void 0;
var SubscriptionPlan;
(function (SubscriptionPlan) {
    SubscriptionPlan["FREE"] = "free";
    SubscriptionPlan["STARTER"] = "starter";
    SubscriptionPlan["PRO"] = "pro";
    SubscriptionPlan["TEAM"] = "team";
    SubscriptionPlan["ENTERPRISE"] = "enterprise";
})(SubscriptionPlan || (exports.SubscriptionPlan = SubscriptionPlan = {}));
var SubscriptionStatus;
(function (SubscriptionStatus) {
    SubscriptionStatus["ACTIVE"] = "active";
    SubscriptionStatus["PAST_DUE"] = "past_due";
    SubscriptionStatus["CANCELED"] = "canceled";
    SubscriptionStatus["UNPAID"] = "unpaid";
    SubscriptionStatus["TRIALING"] = "trialing";
    SubscriptionStatus["INCOMPLETE"] = "incomplete";
    SubscriptionStatus["INCOMPLETE_EXPIRED"] = "incomplete_expired";
})(SubscriptionStatus || (exports.SubscriptionStatus = SubscriptionStatus = {}));
var BillingInterval;
(function (BillingInterval) {
    BillingInterval["MONTHLY"] = "monthly";
    BillingInterval["QUARTERLY"] = "quarterly";
    BillingInterval["YEARLY"] = "yearly";
})(BillingInterval || (exports.BillingInterval = BillingInterval = {}));
var Currency;
(function (Currency) {
    Currency["USD"] = "usd";
    Currency["EUR"] = "eur";
    Currency["GBP"] = "gbp";
    Currency["JPY"] = "jpy";
    Currency["CAD"] = "cad";
    Currency["AUD"] = "aud";
})(Currency || (exports.Currency = Currency = {}));
var SupportLevel;
(function (SupportLevel) {
    SupportLevel["COMMUNITY"] = "community";
    SupportLevel["EMAIL"] = "email";
    SupportLevel["PRIORITY"] = "priority";
    SupportLevel["DEDICATED"] = "dedicated";
    SupportLevel["WHITE_GLOVE"] = "white_glove";
})(SupportLevel || (exports.SupportLevel = SupportLevel = {}));
//# sourceMappingURL=subscription.js.map