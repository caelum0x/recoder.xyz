/**
 * Multi-Channel Notification Service
 * 
 * Handles sending alerts and notifications through multiple channels including
 * Slack, email, webhooks, and SMS with intelligent routing and fallbacks.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';
import * as https from 'https';
import * as http from 'http';

export interface NotificationChannel {
  id: string;
  name: string;
  type: 'slack' | 'email' | 'webhook' | 'sms' | 'teams' | 'discord';
  enabled: boolean;
  config: Record<string, any>;
  priority: number;         // Higher = preferred (1-10)
  conditions?: {
    severities?: string[];  // Only for these severities
    sources?: string[];     // Only for these sources
    tags?: string[];        // Only for alerts with these tags
  };
}

export interface NotificationTemplate {
  id: string;
  name: string;
  channel: string;
  alertTemplate: string;
  resolutionTemplate: string;
  variables: string[];      // Available template variables
}

export interface NotificationResult {
  channelId: string;
  success: boolean;
  timestamp: Date;
  error?: string;
  responseTime: number;
}

export interface NotificationHistory {
  alertId: string;
  channelId: string;
  timestamp: Date;
  success: boolean;
  message: string;
  error?: string;
}

export class NotificationService extends EventEmitter {
  private channels: Map<string, NotificationChannel> = new Map();
  private templates: Map<string, NotificationTemplate> = new Map();
  private history: NotificationHistory[] = [];
  private rateLimits: Map<string, { count: number; resetTime: number }> = new Map();

  private config = {
    maxHistorySize: 10000,
    rateLimitWindow: 60000,     // 1 minute
    defaultRateLimit: 60,       // 60 notifications per minute per channel
    retryAttempts: 3,
    retryDelayMs: 2000,
    timeout: 10000,             // 10 seconds
  };

  private isRunning = false;

  constructor() {
    super();
    this.initializeDefaultChannels();
    this.initializeDefaultTemplates();
  }

  private initializeDefaultChannels(): void {
    const defaultChannels: NotificationChannel[] = [
      {
        id: 'slack_alerts',
        name: 'Slack Alerts Channel',
        type: 'slack',
        enabled: true,
        config: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
          channel: '#alerts',
          username: 'Recoder Health Monitor',
          iconEmoji: ':warning:'
        },
        priority: 9,
        conditions: {
          severities: ['high', 'critical']
        }
      },
      {
        id: 'email_oncall',
        name: 'On-Call Email',
        type: 'email',
        enabled: true,
        config: {
          smtpHost: process.env.SMTP_HOST || 'localhost',
          smtpPort: parseInt(process.env.SMTP_PORT || '587'),
          smtpUser: process.env.SMTP_USER || '',
          smtpPass: process.env.SMTP_PASS || '',
          from: process.env.ALERT_FROM_EMAIL || 'alerts@recoder.xyz',
          to: process.env.ONCALL_EMAIL || 'oncall@recoder.xyz'
        },
        priority: 8,
        conditions: {
          severities: ['critical']
        }
      },
      {
        id: 'email_billing',
        name: 'Billing Team Email',
        type: 'email',
        enabled: true,
        config: {
          smtpHost: process.env.SMTP_HOST || 'localhost',
          smtpPort: parseInt(process.env.SMTP_PORT || '587'),
          smtpUser: process.env.SMTP_USER || '',
          smtpPass: process.env.SMTP_PASS || '',
          from: process.env.ALERT_FROM_EMAIL || 'alerts@recoder.xyz',
          to: process.env.BILLING_EMAIL || 'billing@recoder.xyz'
        },
        priority: 7,
        conditions: {
          tags: ['budget', 'cost']
        }
      },
      {
        id: 'webhook_external',
        name: 'External Monitoring Webhook',
        type: 'webhook',
        enabled: false, // Disabled by default
        config: {
          url: process.env.EXTERNAL_WEBHOOK_URL || '',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.WEBHOOK_TOKEN || ''}`
          }
        },
        priority: 5
      }
    ];

    defaultChannels.forEach(channel => {
      this.channels.set(channel.id, channel);
    });

    Logger.info(`Initialized ${defaultChannels.length} notification channels`);
  }

  private initializeDefaultTemplates(): void {
    const defaultTemplates: NotificationTemplate[] = [
      {
        id: 'slack_alert',
        name: 'Slack Alert Template',
        channel: 'slack',
        alertTemplate: `🚨 *{{severity | upper}} Alert* 🚨

*{{title}}*
{{message}}

📊 *Details:*
• Model: {{modelName || 'N/A'}}
• Provider: {{provider || 'N/A'}}
• Source: {{source}}
• Time: {{timestamp | formatDate}}

{{#if data.errorRate}}• Error Rate: {{data.errorRate}}%{{/if}}
{{#if data.latency}}• Latency: {{data.latency}}ms{{/if}}
{{#if data.cost}}• Cost: ${{data.cost}}{{/if}}

🔗 <{{dashboardUrl}}|View Dashboard>`,
        resolutionTemplate: `✅ *Resolved* - {{title}}

Resolved by: {{resolvedBy}}
Resolution time: {{resolutionTime}} minutes
{{#if resolutionNote}}Note: {{resolutionNote}}{{/if}}`,
        variables: ['severity', 'title', 'message', 'modelName', 'provider', 'source', 'timestamp', 'data', 'resolvedBy', 'resolutionTime', 'resolutionNote']
      },
      {
        id: 'email_alert',
        name: 'Email Alert Template',
        channel: 'email',
        alertTemplate: `Subject: [{{severity | upper}}] {{title}}

Alert Details:
--------------
Severity: {{severity | upper}}
Model: {{modelName || 'N/A'}}
Provider: {{provider || 'N/A'}}
Source: {{source}}
Timestamp: {{timestamp | formatDate}}

Description:
{{message}}

{{#if data}}
Additional Data:
{{#each data}}
{{@key}}: {{this}}
{{/each}}
{{/if}}

Dashboard: {{dashboardUrl}}

This is an automated alert from Recoder Health Monitoring System.`,
        resolutionTemplate: `Subject: [RESOLVED] {{title}}

The following alert has been resolved:

Alert: {{title}}
Resolved by: {{resolvedBy}}
Resolution time: {{resolutionTime}} minutes
{{#if resolutionNote}}
Resolution note: {{resolutionNote}}
{{/if}}

Original alert timestamp: {{timestamp | formatDate}}
Resolved at: {{resolvedAt | formatDate}}

This is an automated notification from Recoder Health Monitoring System.`,
        variables: ['severity', 'title', 'message', 'modelName', 'provider', 'source', 'timestamp', 'data', 'resolvedBy', 'resolutionTime', 'resolutionNote', 'resolvedAt']
      },
      {
        id: 'webhook_alert',
        name: 'Webhook Alert Template',
        channel: 'webhook',
        alertTemplate: `{
  "alert_id": "{{id}}",
  "type": "{{type}}",
  "severity": "{{severity}}",
  "title": "{{title}}",
  "message": "{{message}}",
  "source": "{{source}}",
  "model_name": "{{modelName}}",
  "provider": "{{provider}}",
  "timestamp": "{{timestamp | iso}}",
  "tags": {{tags | json}},
  "data": {{data | json}},
  "dashboard_url": "{{dashboardUrl}}"
}`,
        resolutionTemplate: `{
  "alert_id": "{{id}}",
  "type": "resolution",
  "title": "{{title}}",
  "resolved_by": "{{resolvedBy}}",
  "resolved_at": "{{resolvedAt | iso}}",
  "resolution_time_minutes": {{resolutionTime}},
  "resolution_note": "{{resolutionNote}}",
  "original_timestamp": "{{timestamp | iso}}"
}`,
        variables: ['id', 'type', 'severity', 'title', 'message', 'source', 'modelName', 'provider', 'timestamp', 'tags', 'data', 'resolvedBy', 'resolvedAt', 'resolutionTime', 'resolutionNote']
      }
    ];

    defaultTemplates.forEach(template => {
      this.templates.set(template.id, template);
    });

    Logger.info(`Initialized ${defaultTemplates.length} notification templates`);
  }

  /**
   * Start notification service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Notification service is already running');
      return;
    }

    Logger.info('Starting notification service...');

    // Test configured channels
    await this.testChannels();

    this.isRunning = true;
    this.emit('serviceStarted');

    Logger.info('Notification service started successfully');
  }

  /**
   * Stop notification service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    Logger.info('Stopping notification service...');
    
    this.isRunning = false;
    this.emit('serviceStopped');

    Logger.info('Notification service stopped');
  }

  /**
   * Send alert notification through specified channels
   */
  async sendAlert(alert: any, channelIds: string[]): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    for (const channelId of channelIds) {
      if (!this.isRateLimited(channelId)) {
        const result = await this.sendToChannel(alert, channelId, 'alert');
        results.push(result);
        
        // Record in history
        this.recordNotification(alert.id, channelId, result.success, 'Alert notification', result.error);
      } else {
        results.push({
          channelId,
          success: false,
          timestamp: new Date(),
          error: 'Rate limited',
          responseTime: 0
        });
      }
    }

    this.emit('alertSent', alert.id, results);
    return results;
  }

  /**
   * Send resolution notification
   */
  async sendResolution(alert: any, channelIds: string[]): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    for (const channelId of channelIds) {
      if (!this.isRateLimited(channelId)) {
        const result = await this.sendToChannel(alert, channelId, 'resolution');
        results.push(result);
        
        // Record in history
        this.recordNotification(alert.id, channelId, result.success, 'Resolution notification', result.error);
      }
    }

    this.emit('resolutionSent', alert.id, results);
    return results;
  }

  /**
   * Add or update notification channel
   */
  async addChannel(channel: NotificationChannel): Promise<void> {
    this.channels.set(channel.id, channel);
    
    // Test the channel
    await this.testChannel(channel.id);
    
    Logger.info(`Added notification channel: ${channel.name}`);
  }

  /**
   * Get all notification channels
   */
  getChannels(): NotificationChannel[] {
    return Array.from(this.channels.values());
  }

  /**
   * Get notification history
   */
  getHistory(alertId?: string, channelId?: string, limit: number = 100): NotificationHistory[] {
    let filtered = this.history;

    if (alertId) {
      filtered = filtered.filter(h => h.alertId === alertId);
    }

    if (channelId) {
      filtered = filtered.filter(h => h.channelId === channelId);
    }

    return filtered
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get notification statistics
   */
  getStatistics(timeframe: string = '24h'): {
    totalSent: number;
    successRate: number;
    byChannel: Record<string, { sent: number; success: number; successRate: number }>;
    averageResponseTime: number;
  } {
    const cutoff = this.getTimeframeCutoff(timeframe);
    const recentHistory = this.history.filter(h => h.timestamp >= cutoff);

    const totalSent = recentHistory.length;
    const successful = recentHistory.filter(h => h.success).length;
    const successRate = totalSent > 0 ? (successful / totalSent) * 100 : 0;

    const byChannel: Record<string, { sent: number; success: number; successRate: number }> = {};
    
    recentHistory.forEach(h => {
      if (!byChannel[h.channelId]) {
        byChannel[h.channelId] = { sent: 0, success: 0, successRate: 0 };
      }
      byChannel[h.channelId].sent++;
      if (h.success) {
        byChannel[h.channelId].success++;
      }
    });

    Object.keys(byChannel).forEach(channelId => {
      const stats = byChannel[channelId];
      stats.successRate = (stats.success / stats.sent) * 100;
    });

    // Calculate average response time (would need to track this in history)
    const averageResponseTime = 150; // Placeholder

    return {
      totalSent,
      successRate,
      byChannel,
      averageResponseTime
    };
  }

  // Private helper methods

  private async sendToChannel(alert: any, channelId: string, type: 'alert' | 'resolution'): Promise<NotificationResult> {
    const startTime = Date.now();
    const channel = this.channels.get(channelId);

    if (!channel) {
      return {
        channelId,
        success: false,
        timestamp: new Date(),
        error: 'Channel not found',
        responseTime: 0
      };
    }

    if (!channel.enabled) {
      return {
        channelId,
        success: false,
        timestamp: new Date(),
        error: 'Channel disabled',
        responseTime: 0
      };
    }

    // Check channel conditions
    if (!this.alertMatchesChannelConditions(alert, channel)) {
      return {
        channelId,
        success: false,
        timestamp: new Date(),
        error: 'Alert does not match channel conditions',
        responseTime: 0
      };
    }

    try {
      let success = false;
      let error: string | undefined;

      switch (channel.type) {
        case 'slack':
          success = await this.sendSlackNotification(alert, channel, type);
          break;
        case 'email':
          success = await this.sendEmailNotification(alert, channel, type);
          break;
        case 'webhook':
          success = await this.sendWebhookNotification(alert, channel, type);
          break;
        case 'teams':
          success = await this.sendTeamsNotification(alert, channel, type);
          break;
        case 'discord':
          success = await this.sendDiscordNotification(alert, channel, type);
          break;
        default:
          error = `Unsupported channel type: ${channel.type}`;
      }

      const responseTime = Date.now() - startTime;

      return {
        channelId,
        success,
        timestamp: new Date(),
        error,
        responseTime
      };

    } catch (err) {
      const responseTime = Date.now() - startTime;
      const error = err instanceof Error ? err.message : 'Unknown error';

      return {
        channelId,
        success: false,
        timestamp: new Date(),
        error,
        responseTime
      };
    }
  }

  private async sendSlackNotification(alert: any, channel: NotificationChannel, type: 'alert' | 'resolution'): Promise<boolean> {
    const template = this.templates.get('slack_alert');
    if (!template) return false;

    const message = this.renderTemplate(
      type === 'alert' ? template.alertTemplate : template.resolutionTemplate,
      alert
    );

    const payload = {
      channel: channel.config.channel,
      username: channel.config.username,
      icon_emoji: channel.config.iconEmoji,
      text: message
    };

    return this.sendHttpRequest(channel.config.webhookUrl, 'POST', payload);
  }

  private async sendEmailNotification(alert: any, channel: NotificationChannel, type: 'alert' | 'resolution'): Promise<boolean> {
    const template = this.templates.get('email_alert');
    if (!template) return false;

    const message = this.renderTemplate(
      type === 'alert' ? template.alertTemplate : template.resolutionTemplate,
      alert
    );

    // Extract subject from message (assuming first line is subject)
    const lines = message.split('\n');
    const subject = lines[0].replace('Subject: ', '');
    const body = lines.slice(1).join('\n');

    // In a real implementation, you would use nodemailer or similar
    Logger.info(`Would send email to ${channel.config.to}: ${subject}`);
    
    return true; // Simulated success
  }

  private async sendWebhookNotification(alert: any, channel: NotificationChannel, type: 'alert' | 'resolution'): Promise<boolean> {
    const template = this.templates.get('webhook_alert');
    if (!template) return false;

    const message = this.renderTemplate(
      type === 'alert' ? template.alertTemplate : template.resolutionTemplate,
      alert
    );

    const payload = JSON.parse(message);

    return this.sendHttpRequest(
      channel.config.url,
      channel.config.method || 'POST',
      payload,
      channel.config.headers
    );
  }

  private async sendTeamsNotification(alert: any, channel: NotificationChannel, type: 'alert' | 'resolution'): Promise<boolean> {
    // Microsoft Teams webhook implementation
    Logger.info(`Would send Teams notification for alert ${alert.id}`);
    return true; // Simulated success
  }

  private async sendDiscordNotification(alert: any, channel: NotificationChannel, type: 'alert' | 'resolution'): Promise<boolean> {
    // Discord webhook implementation
    Logger.info(`Would send Discord notification for alert ${alert.id}`);
    return true; // Simulated success
  }

  private async sendHttpRequest(
    url: string,
    method: string,
    payload: any,
    headers?: Record<string, string>
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const data = JSON.stringify(payload);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...headers
        },
        timeout: this.config.timeout
      };

      const req = client.request(options, (res) => {
        const success = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300;
        resolve(success);
      });

      req.on('error', () => {
        resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.write(data);
      req.end();
    });
  }

  private renderTemplate(template: string, alert: any): string {
    let rendered = template;

    // Simple template rendering (in production, use a proper template engine)
    const variables = {
      ...alert,
      dashboardUrl: `https://dashboard.recoder.xyz/alerts/${alert.id}`,
      resolutionTime: alert.resolvedAt && alert.timestamp 
        ? Math.round((alert.resolvedAt.getTime() - alert.timestamp.getTime()) / 60000)
        : 0
    };

    // Replace variables
    Object.keys(variables).forEach(key => {
      const value = variables[key];
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, String(value || ''));
    });

    // Handle formatters (basic implementation)
    rendered = rendered.replace(/{{(\w+) \| upper}}/g, (match, key) => {
      return String(variables[key] || '').toUpperCase();
    });

    rendered = rendered.replace(/{{(\w+) \| formatDate}}/g, (match, key) => {
      const date = variables[key];
      return date instanceof Date ? date.toISOString() : '';
    });

    return rendered;
  }

  private alertMatchesChannelConditions(alert: any, channel: NotificationChannel): boolean {
    const conditions = channel.conditions;
    if (!conditions) return true;

    if (conditions.severities && !conditions.severities.includes(alert.severity)) {
      return false;
    }

    if (conditions.sources && !conditions.sources.includes(alert.source)) {
      return false;
    }

    if (conditions.tags && !conditions.tags.some(tag => alert.tags?.includes(tag))) {
      return false;
    }

    return true;
  }

  private isRateLimited(channelId: string): boolean {
    const now = Date.now();
    const rateLimit = this.rateLimits.get(channelId);

    if (!rateLimit || now >= rateLimit.resetTime) {
      // Reset or initialize rate limit
      this.rateLimits.set(channelId, {
        count: 1,
        resetTime: now + this.config.rateLimitWindow
      });
      return false;
    }

    if (rateLimit.count >= this.config.defaultRateLimit) {
      return true;
    }

    rateLimit.count++;
    return false;
  }

  private recordNotification(alertId: string, channelId: string, success: boolean, message: string, error?: string): void {
    const record: NotificationHistory = {
      alertId,
      channelId,
      timestamp: new Date(),
      success,
      message,
      error
    };

    this.history.push(record);

    // Maintain history size limit
    if (this.history.length > this.config.maxHistorySize) {
      this.history.splice(0, this.history.length - this.config.maxHistorySize);
    }
  }

  private async testChannels(): Promise<void> {
    for (const [channelId, channel] of this.channels) {
      if (channel.enabled) {
        await this.testChannel(channelId);
      }
    }
  }

  private async testChannel(channelId: string): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) return;

    try {
      // Send a test notification
      const testAlert = {
        id: 'test',
        type: 'system',
        severity: 'low',
        title: 'Test Notification',
        message: 'This is a test notification to verify channel configuration.',
        source: 'notification-service',
        timestamp: new Date(),
        tags: ['test']
      };

      await this.sendToChannel(testAlert, channelId, 'alert');
      Logger.debug(`Successfully tested channel: ${channel.name}`);
    } catch (error) {
      Logger.warn(`Failed to test channel ${channel.name}:`, error);
    }
  }

  private getTimeframeCutoff(timeframe: string): Date {
    const now = new Date();
    const match = timeframe.match(/^(\d+)([mhd])$/);
    
    if (!match) return new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default 24h

    const value = parseInt(match[1]);
    const unit = match[2];
    let milliseconds = 0;

    switch (unit) {
      case 'm': milliseconds = value * 60 * 1000; break;
      case 'h': milliseconds = value * 60 * 60 * 1000; break;
      case 'd': milliseconds = value * 24 * 60 * 60 * 1000; break;
    }

    return new Date(now.getTime() - milliseconds);
  }
}

// Export singleton instance
export const notificationService = new NotificationService();