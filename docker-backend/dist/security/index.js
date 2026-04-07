"use strict";
/**
 * Security Module Index
 *
 * Exports all security-related functionality:
 * - Abuse prevention (IP blocking, pattern detection)
 * - WebSocket rate limiting
 * - Admin alerts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAlertCounts = exports.acknowledgeAlert = exports.getAlerts = exports.alertSystemIssue = exports.alertSuspiciousRequest = exports.alertAuthFailure = exports.alertWsRateLimitExceeded = exports.alertFromAbuseEvent = exports.sendAlert = exports.WS_RATE_LIMITS = exports.getAllWsRateLimitStats = exports.getWsRateLimiter = exports.WsRateLimiter = exports.AbusePrevention = exports.abusePrevention = void 0;
var abuse_prevention_js_1 = require("./abuse-prevention.js");
Object.defineProperty(exports, "abusePrevention", { enumerable: true, get: function () { return abuse_prevention_js_1.abusePrevention; } });
Object.defineProperty(exports, "AbusePrevention", { enumerable: true, get: function () { return abuse_prevention_js_1.AbusePrevention; } });
var ws_rate_limiter_js_1 = require("./ws-rate-limiter.js");
Object.defineProperty(exports, "WsRateLimiter", { enumerable: true, get: function () { return ws_rate_limiter_js_1.WsRateLimiter; } });
Object.defineProperty(exports, "getWsRateLimiter", { enumerable: true, get: function () { return ws_rate_limiter_js_1.getWsRateLimiter; } });
Object.defineProperty(exports, "getAllWsRateLimitStats", { enumerable: true, get: function () { return ws_rate_limiter_js_1.getAllWsRateLimitStats; } });
Object.defineProperty(exports, "WS_RATE_LIMITS", { enumerable: true, get: function () { return ws_rate_limiter_js_1.WS_RATE_LIMITS; } });
var admin_alerts_js_1 = require("./admin-alerts.js");
Object.defineProperty(exports, "sendAlert", { enumerable: true, get: function () { return admin_alerts_js_1.sendAlert; } });
Object.defineProperty(exports, "alertFromAbuseEvent", { enumerable: true, get: function () { return admin_alerts_js_1.alertFromAbuseEvent; } });
Object.defineProperty(exports, "alertWsRateLimitExceeded", { enumerable: true, get: function () { return admin_alerts_js_1.alertWsRateLimitExceeded; } });
Object.defineProperty(exports, "alertAuthFailure", { enumerable: true, get: function () { return admin_alerts_js_1.alertAuthFailure; } });
Object.defineProperty(exports, "alertSuspiciousRequest", { enumerable: true, get: function () { return admin_alerts_js_1.alertSuspiciousRequest; } });
Object.defineProperty(exports, "alertSystemIssue", { enumerable: true, get: function () { return admin_alerts_js_1.alertSystemIssue; } });
Object.defineProperty(exports, "getAlerts", { enumerable: true, get: function () { return admin_alerts_js_1.getAlerts; } });
Object.defineProperty(exports, "acknowledgeAlert", { enumerable: true, get: function () { return admin_alerts_js_1.acknowledgeAlert; } });
Object.defineProperty(exports, "getAlertCounts", { enumerable: true, get: function () { return admin_alerts_js_1.getAlertCounts; } });
