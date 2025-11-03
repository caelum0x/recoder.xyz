/**
 * Monitoring & Alerts System
 * Send alerts for system issues, errors, and important events
 */

interface AlertConfig {
  webhookUrl?: string;
  email?: string;
  slackWebhook?: string;
  discordWebhook?: string;
}

export enum AlertLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface Alert {
  level: AlertLevel;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

export class AlertManager {
  private config: AlertConfig;
  private env: Env;

  constructor(env: Env, config: AlertConfig = {}) {
    this.env = env;
    this.config = config;
  }

  /**
   * Send alert
   */
  async sendAlert(alert: Alert): Promise<void> {
    console.log(`[ALERT ${alert.level.toUpperCase()}] ${alert.title}: ${alert.message}`);

    // Send to configured channels
    const promises: Promise<void>[] = [];

    if (this.config.slackWebhook) {
      promises.push(this.sendToSlack(alert));
    }

    if (this.config.discordWebhook) {
      promises.push(this.sendToDiscord(alert));
    }

    if (this.config.webhookUrl) {
      promises.push(this.sendToWebhook(alert));
    }

    // Wait for all to complete (don't throw if one fails)
    await Promise.allSettled(promises);
  }

  /**
   * Send to Slack
   */
  private async sendToSlack(alert: Alert): Promise<void> {
    if (!this.config.slackWebhook) return;

    try {
      const color = this.getColorForLevel(alert.level);
      
      await fetch(this.config.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attachments: [
            {
              color,
              title: alert.title,
              text: alert.message,
              fields: alert.metadata
                ? Object.entries(alert.metadata).map(([key, value]) => ({
                    title: key,
                    value: String(value),
                    short: true,
                  }))
                : [],
              footer: 'Recoder.xyz',
              ts: Math.floor(alert.timestamp / 1000),
            },
          ],
        }),
      });
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }

  /**
   * Send to Discord
   */
  private async sendToDiscord(alert: Alert): Promise<void> {
    if (!this.config.discordWebhook) return;

    try {
      const color = this.getColorCodeForLevel(alert.level);
      
      await fetch(this.config.discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title: alert.title,
              description: alert.message,
              color,
              fields: alert.metadata
                ? Object.entries(alert.metadata).map(([key, value]) => ({
                    name: key,
                    value: String(value),
                    inline: true,
                  }))
                : [],
              footer: {
                text: 'Recoder.xyz',
              },
              timestamp: new Date(alert.timestamp).toISOString(),
            },
          ],
        }),
      });
    } catch (error) {
      console.error('Failed to send Discord alert:', error);
    }
  }

  /**
   * Send to custom webhook
   */
  private async sendToWebhook(alert: Alert): Promise<void> {
    if (!this.config.webhookUrl) return;

    try {
      await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert),
      });
    } catch (error) {
      console.error('Failed to send webhook alert:', error);
    }
  }

  /**
   * Get color for alert level (Slack)
   */
  private getColorForLevel(level: AlertLevel): string {
    switch (level) {
      case AlertLevel.INFO:
        return '#36a64f'; // Green
      case AlertLevel.WARNING:
        return '#ff9800'; // Orange
      case AlertLevel.ERROR:
        return '#f44336'; // Red
      case AlertLevel.CRITICAL:
        return '#9c27b0'; // Purple
      default:
        return '#2196f3'; // Blue
    }
  }

  /**
   * Get color code for alert level (Discord)
   */
  private getColorCodeForLevel(level: AlertLevel): number {
    switch (level) {
      case AlertLevel.INFO:
        return 0x36a64f; // Green
      case AlertLevel.WARNING:
        return 0xff9800; // Orange
      case AlertLevel.ERROR:
        return 0xf44336; // Red
      case AlertLevel.CRITICAL:
        return 0x9c27b0; // Purple
      default:
        return 0x2196f3; // Blue
    }
  }
}

/**
 * Initialize alert manager
 */
export function getAlertManager(env: Env): AlertManager {
  return new AlertManager(env, {
    slackWebhook: env.SLACK_WEBHOOK_URL,
    discordWebhook: env.DISCORD_WEBHOOK_URL,
    webhookUrl: env.ALERT_WEBHOOK_URL,
  });
}

/**
 * Common alert functions
 */
export async function alertDatabaseDown(env: Env, error: Error): Promise<void> {
  const alertManager = getAlertManager(env);
  await alertManager.sendAlert({
    level: AlertLevel.CRITICAL,
    title: '🚨 Database Down',
    message: 'Database connection failed',
    metadata: {
      error: error.message,
      timestamp: new Date().toISOString(),
    },
    timestamp: Date.now(),
  });
}

export async function alertRateLimitExceeded(env: Env, userId: string, limit: number): Promise<void> {
  const alertManager = getAlertManager(env);
  await alertManager.sendAlert({
    level: AlertLevel.WARNING,
    title: '⚠️ Rate Limit Exceeded',
    message: `User ${userId} exceeded rate limit`,
    metadata: {
      userId,
      limit,
    },
    timestamp: Date.now(),
  });
}

export async function alertPaymentFailed(env: Env, userId: string, amount: number): Promise<void> {
  const alertManager = getAlertManager(env);
  await alertManager.sendAlert({
    level: AlertLevel.ERROR,
    title: '💳 Payment Failed',
    message: `Payment failed for user ${userId}`,
    metadata: {
      userId,
      amount,
      currency: 'USD',
    },
    timestamp: Date.now(),
  });
}

export async function alertHighErrorRate(env: Env, errorRate: number): Promise<void> {
  const alertManager = getAlertManager(env);
  await alertManager.sendAlert({
    level: AlertLevel.WARNING,
    title: '⚠️ High Error Rate',
    message: `System error rate is ${errorRate.toFixed(2)}%`,
    metadata: {
      errorRate: `${errorRate.toFixed(2)}%`,
      threshold: '5%',
    },
    timestamp: Date.now(),
  });
}
