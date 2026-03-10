/**
 * Admin Alert System
 *
 * Sends notifications to admins when suspicious activity is detected.
 * Integrates with the abuse prevention system and health monitoring.
 *
 * Alert channels:
 * - Console (always on)
 * - Webhook (Slack/Discord) if configured
 * - In-memory alert log for admin dashboard
 */

import { abusePrevention, type AbuseEvent, type AbuseSeverity } from './abuse-prevention.js';

// ==================== Types ====================

export interface AdminAlert {
  id: string;
  severity: AbuseSeverity;
  category: AlertCategory;
  title: string;
  message: string;
  details: Record<string, unknown>;
  timestamp: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
}

export type AlertCategory =
  | 'security'
  | 'abuse'
  | 'system'
  | 'performance'
  | 'container';

interface AlertConfig {
  /** Webhook URL for external notifications (Slack/Discord) */
  webhookUrl?: string;
  /** Minimum severity to trigger webhook notifications */
  webhookMinSeverity: AbuseSeverity;
  /** Max alerts to keep in memory */
  maxAlerts: number;
  /** Cooldown period for duplicate alerts (ms) */
  deduplicationWindowMs: number;
}

// ==================== Configuration ====================

const config: AlertConfig = {
  webhookUrl: process.env.ADMIN_ALERT_WEBHOOK_URL,
  webhookMinSeverity: (process.env.ADMIN_ALERT_MIN_SEVERITY as AbuseSeverity) || 'medium',
  maxAlerts: 500,
  deduplicationWindowMs: 5 * 60 * 1000, // 5 minutes
};

const SEVERITY_ORDER: Record<AbuseSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

// ==================== Alert Store ====================

const alerts: AdminAlert[] = [];
const recentAlertKeys = new Map<string, number>(); // key -> timestamp for dedup

function generateAlertKey(category: AlertCategory, title: string): string {
  return `${category}:${title}`;
}

function isDuplicate(category: AlertCategory, title: string): boolean {
  const key = generateAlertKey(category, title);
  const lastSent = recentAlertKeys.get(key);
  if (lastSent && Date.now() - lastSent < config.deduplicationWindowMs) {
    return true;
  }
  recentAlertKeys.set(key, Date.now());

  // Clean old dedup entries
  if (recentAlertKeys.size > 200) {
    const cutoff = Date.now() - config.deduplicationWindowMs;
    for (const [k, t] of recentAlertKeys) {
      if (t < cutoff) recentAlertKeys.delete(k);
    }
  }

  return false;
}

// ==================== Alert Functions ====================

/**
 * Send an admin alert.
 */
export function sendAlert(
  severity: AbuseSeverity,
  category: AlertCategory,
  title: string,
  message: string,
  details: Record<string, unknown> = {}
): AdminAlert | null {
  // Dedup check
  if (isDuplicate(category, title)) {
    return null;
  }

  const alert: AdminAlert = {
    id: `alert-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    severity,
    category,
    title,
    message,
    details,
    timestamp: Date.now(),
    acknowledged: false,
  };

  alerts.push(alert);

  // Trim alerts if too many
  if (alerts.length > config.maxAlerts) {
    alerts.splice(0, alerts.length - config.maxAlerts);
  }

  // Console log
  const severityLabel = severity.toUpperCase();
  const prefix = severity === 'critical' ? '!!!!' : severity === 'high' ? '!!!' : '!!';
  console.warn(`[ADMIN ALERT ${prefix}] [${severityLabel}] [${category}] ${title}: ${message}`);
  if (Object.keys(details).length > 0) {
    console.warn(`  Details: ${JSON.stringify(details)}`);
  }

  // Webhook notification for high/critical severity
  if (
    config.webhookUrl &&
    SEVERITY_ORDER[severity] >= SEVERITY_ORDER[config.webhookMinSeverity]
  ) {
    sendWebhook(alert).catch(err => {
      console.error(`[Admin Alert] Webhook failed: ${err.message}`);
    });
  }

  return alert;
}

/**
 * Send alert to webhook (Slack/Discord compatible).
 */
async function sendWebhook(alert: AdminAlert): Promise<void> {
  if (!config.webhookUrl) return;

  const color = {
    low: '#36a64f',
    medium: '#daa520',
    high: '#ff6600',
    critical: '#ff0000',
  }[alert.severity];

  // Slack-compatible payload
  const payload = {
    text: `[${alert.severity.toUpperCase()}] ${alert.title}`,
    attachments: [
      {
        color,
        title: alert.title,
        text: alert.message,
        fields: Object.entries(alert.details).slice(0, 10).map(([key, value]) => ({
          title: key,
          value: typeof value === 'string' ? value : JSON.stringify(value),
          short: true,
        })),
        ts: Math.floor(alert.timestamp / 1000),
      },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// ==================== Alert from Abuse Events ====================

/**
 * Convert an abuse event into an admin alert if warranted.
 */
export function alertFromAbuseEvent(event: AbuseEvent): void {
  if (SEVERITY_ORDER[event.severity] < SEVERITY_ORDER['medium']) {
    return; // Only alert for medium+ severity
  }

  const sourceStr = event.source.ip
    ? `IP: ${event.source.ip}`
    : event.source.userId
      ? `User: ${event.source.userId}`
      : 'Unknown source';

  sendAlert(
    event.severity,
    'abuse',
    `Abuse detected: ${event.type}`,
    `${event.type} from ${sourceStr}`,
    {
      abuseType: event.type,
      source: event.source,
      action: event.action || 'none',
      ...event.details,
    }
  );
}

// ==================== Query Functions ====================

/**
 * Get recent alerts, optionally filtered.
 */
export function getAlerts(options?: {
  limit?: number;
  severity?: AbuseSeverity;
  category?: AlertCategory;
  unacknowledgedOnly?: boolean;
}): AdminAlert[] {
  let result = [...alerts];

  if (options?.severity) {
    result = result.filter(
      a => SEVERITY_ORDER[a.severity] >= SEVERITY_ORDER[options.severity!]
    );
  }

  if (options?.category) {
    result = result.filter(a => a.category === options.category);
  }

  if (options?.unacknowledgedOnly) {
    result = result.filter(a => !a.acknowledged);
  }

  result.reverse(); // Newest first

  if (options?.limit) {
    result = result.slice(0, options.limit);
  }

  return result;
}

/**
 * Acknowledge an alert.
 */
export function acknowledgeAlert(alertId: string, userId: string): boolean {
  const alert = alerts.find(a => a.id === alertId);
  if (!alert) return false;

  alert.acknowledged = true;
  alert.acknowledgedBy = userId;
  alert.acknowledgedAt = Date.now();
  return true;
}

/**
 * Get alert counts by severity.
 */
export function getAlertCounts(): Record<AbuseSeverity, number> {
  const counts: Record<AbuseSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  for (const alert of alerts) {
    if (alert.timestamp >= oneDayAgo && !alert.acknowledged) {
      counts[alert.severity]++;
    }
  }

  return counts;
}

// ==================== Security-Specific Alerts ====================

/**
 * Alert when WebSocket rate limit is exceeded.
 */
export function alertWsRateLimitExceeded(
  endpoint: string,
  projectId: string,
  userId?: string,
  messageCount?: number
): void {
  sendAlert(
    'medium',
    'security',
    `WebSocket rate limit exceeded: ${endpoint}`,
    `WebSocket ${endpoint} rate limit exceeded for project ${projectId}`,
    { endpoint, projectId, userId, messageCount }
  );
}

/**
 * Alert on multiple auth failures.
 */
export function alertAuthFailure(ip: string, failureCount: number): void {
  const severity: AbuseSeverity = failureCount >= 10 ? 'high' : 'medium';
  sendAlert(
    severity,
    'security',
    'Multiple authentication failures',
    `${failureCount} auth failures from IP ${ip}`,
    { ip, failureCount }
  );
}

/**
 * Alert on suspicious request patterns.
 */
export function alertSuspiciousRequest(
  ip: string,
  path: string,
  patterns: string[]
): void {
  sendAlert(
    'high',
    'security',
    'Suspicious request detected',
    `Suspicious patterns in request to ${path} from ${ip}`,
    { ip, path, patterns }
  );
}

/**
 * Alert on system issues.
 */
export function alertSystemIssue(
  title: string,
  message: string,
  severity: AbuseSeverity = 'medium',
  details: Record<string, unknown> = {}
): void {
  sendAlert(severity, 'system', title, message, details);
}
