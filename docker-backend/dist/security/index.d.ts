/**
 * Security Module Index
 *
 * Exports all security-related functionality:
 * - Abuse prevention (IP blocking, pattern detection)
 * - WebSocket rate limiting
 * - Admin alerts
 */
export { abusePrevention, AbusePrevention } from './abuse-prevention.js';
export type { AbuseEvent, AbuseType, AbuseSeverity, AbuseAction, BlocklistEntry, AbuseStats } from './abuse-prevention.js';
export { WsRateLimiter, getWsRateLimiter, getAllWsRateLimitStats, WS_RATE_LIMITS } from './ws-rate-limiter.js';
export type { WsRateLimitConfig } from './ws-rate-limiter.js';
export { sendAlert, alertFromAbuseEvent, alertWsRateLimitExceeded, alertAuthFailure, alertSuspiciousRequest, alertSystemIssue, getAlerts, acknowledgeAlert, getAlertCounts, } from './admin-alerts.js';
export type { AdminAlert, AlertCategory } from './admin-alerts.js';
