/**
 * Usage Analytics System for Recoder.xyz Ecosystem
 * 
 * Privacy-focused analytics with user consent and data protection
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface AnalyticsEvent {
  id: string;
  timestamp: number;
  platform: 'cli' | 'web' | 'extension';
  userId?: string; // Hashed for privacy
  sessionId: string;
  eventType: string;
  eventName: string;
  properties: Record<string, any>;
  metadata: {
    version: string;
    os: string;
    nodeVersion?: string;
    browserVersion?: string;
    extensionVersion?: string;
  };
}

export interface UsageMetrics {
  daily: {
    users: number;
    sessions: number;
    codeGenerations: number;
    tokensUsed: number;
    errors: number;
  };
  weekly: {
    users: number;
    sessions: number;
    codeGenerations: number;
    avgSessionDuration: number;
    retentionRate: number;
  };
  monthly: {
    users: number;
    newUsers: number;
    churnRate: number;
    totalGenerations: number;
    avgGenerationsPerUser: number;
  };
  features: {
    mostUsedProviders: Array<{ provider: string; usage: number }>;
    mostUsedCommands: Array<{ command: string; usage: number }>;
    popularLanguages: Array<{ language: string; usage: number }>;
    averageProjectSize: number;
  };
}

export interface PrivacySettings {
  analyticsEnabled: boolean;
  errorReportingEnabled: boolean;
  performanceMetricsEnabled: boolean;
  featureUsageEnabled: boolean;
  shareAnonymousStats: boolean;
}

export class UsageAnalytics extends EventEmitter {
  private static instance: UsageAnalytics;
  private events: Map<string, AnalyticsEvent[]> = new Map();
  private sessionId: string;
  private userId?: string;
  private platform: 'cli' | 'web' | 'extension';
  private privacySettings: PrivacySettings;
  private isEnabled: boolean = false;

  private constructor(platform: 'cli' | 'web' | 'extension') {
    super();
    this.platform = platform;
    this.sessionId = this.generateSessionId();
    this.privacySettings = this.getDefaultPrivacySettings();
    this.initializeAnalytics();
  }

  static getInstance(platform: 'cli' | 'web' | 'extension'): UsageAnalytics {
    if (!UsageAnalytics.instance) {
      UsageAnalytics.instance = new UsageAnalytics(platform);
    }
    return UsageAnalytics.instance;
  }

  /**
   * Initialize analytics with user consent
   */
  async initializeAnalytics(): Promise<void> {
    // Load privacy settings from user configuration
    this.privacySettings = await this.loadPrivacySettings();
    this.isEnabled = this.privacySettings.analyticsEnabled;

    if (this.isEnabled) {
      this.startAnalytics();
    }
  }

  /**
   * Start analytics collection
   */
  private startAnalytics(): void {
    this.trackEvent('system', 'analytics_started', {
      platform: this.platform,
      version: this.getVersion()
    });

    // Track session start
    this.trackEvent('session', 'session_started', {
      sessionId: this.sessionId,
      timestamp: Date.now()
    });

    console.log('📈 Usage analytics started (privacy-compliant)');
  }

  /**
   * Set user ID (hashed for privacy)
   */
  setUserId(userId: string): void {
    if (!this.isEnabled) return;
    
    // Hash user ID for privacy
    this.userId = this.hashUserId(userId);
  }

  /**
   * Track analytics event
   */
  trackEvent(eventType: string, eventName: string, properties: Record<string, any> = {}): void {
    if (!this.isEnabled) return;

    const event: AnalyticsEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      platform: this.platform,
      userId: this.userId,
      sessionId: this.sessionId,
      eventType,
      eventName,
      properties: this.sanitizeProperties(properties),
      metadata: this.getMetadata()
    };

    // Store event
    const key = `${eventType}:${eventName}`;
    if (!this.events.has(key)) {
      this.events.set(key, []);
    }
    this.events.get(key)!.push(event);

    // Emit event for real-time processing
    this.emit('analytics:event', event);

    // Send to analytics service (if enabled)
    this.sendToAnalyticsService(event);
  }

  /**
   * Track code generation
   */
  trackCodeGeneration(provider: string, language: string, tokens: number, success: boolean): void {
    this.trackEvent('code_generation', 'generated', {
      provider,
      language,
      tokens,
      success,
      responseTime: Date.now() // Would be actual response time
    });
  }

  /**
   * Track command usage
   */
  trackCommandUsage(command: string, args: string[], success: boolean): void {
    this.trackEvent('command', 'executed', {
      command,
      argsCount: args.length,
      success,
      platform: this.platform
    });
  }

  /**
   * Track error occurrence
   */
  trackError(error: Error, context: Record<string, any> = {}): void {
    if (!this.privacySettings.errorReportingEnabled) return;

    this.trackEvent('error', 'occurred', {
      errorType: error.constructor.name,
      errorMessage: this.sanitizeErrorMessage(error.message),
      context: this.sanitizeProperties(context),
      stack: this.sanitizeStackTrace(error.stack)
    });
  }

  /**
   * Track performance metrics
   */
  trackPerformance(metric: string, value: number, unit: string): void {
    if (!this.privacySettings.performanceMetricsEnabled) return;

    this.trackEvent('performance', metric, {
      value,
      unit,
      timestamp: Date.now()
    });
  }

  /**
   * Track feature usage
   */
  trackFeatureUsage(feature: string, action: string, metadata: Record<string, any> = {}): void {
    if (!this.privacySettings.featureUsageEnabled) return;

    this.trackEvent('feature', `${feature}_${action}`, {
      feature,
      action,
      ...this.sanitizeProperties(metadata)
    });
  }

  /**
   * Get usage metrics
   */
  getUsageMetrics(): UsageMetrics {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;
    const monthMs = 30 * dayMs;

    const allEvents = Array.from(this.events.values()).flat();
    
    return {
      daily: this.calculateDailyMetrics(allEvents, now - dayMs, now),
      weekly: this.calculateWeeklyMetrics(allEvents, now - weekMs, now),
      monthly: this.calculateMonthlyMetrics(allEvents, now - monthMs, now),
      features: this.calculateFeatureMetrics(allEvents)
    };
  }

  /**
   * Update privacy settings
   */
  updatePrivacySettings(settings: Partial<PrivacySettings>): void {
    this.privacySettings = { ...this.privacySettings, ...settings };
    this.isEnabled = this.privacySettings.analyticsEnabled;
    
    // Save settings
    this.savePrivacySettings(this.privacySettings);
    
    if (!this.isEnabled) {
      this.trackEvent('system', 'analytics_disabled');
      this.clearStoredData();
    } else {
      this.startAnalytics();
    }

    this.emit('privacy:updated', this.privacySettings);
  }

  /**
   * Get current privacy settings
   */
  getPrivacySettings(): PrivacySettings {
    return { ...this.privacySettings };
  }

  /**
   * Export user data (GDPR compliance)
   */
  exportUserData(): any {
    if (!this.userId) {
      return { message: 'No user data available' };
    }

    const userEvents = Array.from(this.events.values())
      .flat()
      .filter(event => event.userId === this.userId);

    return {
      userId: this.userId, // Already hashed
      platform: this.platform,
      sessionCount: this.getUniqueSessionCount(userEvents),
      totalEvents: userEvents.length,
      events: userEvents,
      privacySettings: this.privacySettings,
      dataCollectionPeriod: {
        start: Math.min(...userEvents.map(e => e.timestamp)),
        end: Math.max(...userEvents.map(e => e.timestamp))
      }
    };
  }

  /**
   * Delete user data (GDPR compliance)
   */
  deleteUserData(): void {
    if (!this.userId) return;

    // Remove user events
    for (const [key, events] of this.events.entries()) {
      const filteredEvents = events.filter(event => event.userId !== this.userId);
      this.events.set(key, filteredEvents);
    }

    // Clear user ID
    this.userId = undefined;

    this.emit('data:deleted');
  }

  // Private methods

  private generateSessionId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private generateEventId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private hashUserId(userId: string): string {
    return crypto.createHash('sha256').update(userId).digest('hex').substring(0, 16);
  }

  private sanitizeProperties(properties: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(properties)) {
      // Remove sensitive data
      if (this.isSensitiveKey(key)) {
        continue;
      }
      
      // Sanitize string values
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (Array.isArray(value)) {
        sanitized[key] = value.length; // Only store array length
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = '[Object]'; // Don't recurse into objects
      }
    }
    
    return sanitized;
  }

  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password', 'token', 'key', 'secret', 'auth', 'credential',
      'email', 'username', 'userId', 'apiKey', 'accessToken'
    ];
    
    return sensitiveKeys.some(sensitive => 
      key.toLowerCase().includes(sensitive.toLowerCase())
    );
  }

  private sanitizeString(str: string): string {
    // Remove potential file paths, URLs, etc.
    return str
      .replace(/\/[^\s]+/g, '[PATH]') // Replace file paths
      .replace(/https?:\/\/[^\s]+/g, '[URL]') // Replace URLs
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]') // Replace emails
      .substring(0, 200); // Limit length
  }

  private sanitizeErrorMessage(message: string): string {
    return this.sanitizeString(message);
  }

  private sanitizeStackTrace(stack?: string): string {
    if (!stack) return '';
    
    // Only keep the first few lines and sanitize paths
    return stack
      .split('\n')
      .slice(0, 5)
      .map(line => this.sanitizeString(line))
      .join('\n');
  }

  private getMetadata() {
    return {
      version: this.getVersion(),
      os: process.platform,
      nodeVersion: process.version,
      // Browser/extension specific metadata would be added here
    };
  }

  private getVersion(): string {
    // Would get actual version from package.json
    return '1.0.0';
  }

  private async sendToAnalyticsService(event: AnalyticsEvent): Promise<void> {
    if (!this.privacySettings.shareAnonymousStats) return;

    try {
      // Send to analytics service (e.g., PostHog, Mixpanel, custom service)
      // Implementation would depend on chosen service
      
      // Example for custom service:
      // await fetch('https://analytics.recoder.xyz/events', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(event)
      // });
      
    } catch (error) {
      // Silently fail - analytics should never break the app
      console.debug('Analytics service error:', error);
    }
  }

  private calculateDailyMetrics(events: AnalyticsEvent[], start: number, end: number): UsageMetrics['daily'] {
    const dayEvents = events.filter(e => e.timestamp >= start && e.timestamp <= end);
    
    return {
      users: this.getUniqueUserCount(dayEvents),
      sessions: this.getUniqueSessionCount(dayEvents),
      codeGenerations: dayEvents.filter(e => e.eventType === 'code_generation').length,
      tokensUsed: dayEvents
        .filter(e => e.eventType === 'code_generation')
        .reduce((sum, e) => sum + (e.properties.tokens || 0), 0),
      errors: dayEvents.filter(e => e.eventType === 'error').length
    };
  }

  private calculateWeeklyMetrics(events: AnalyticsEvent[], start: number, end: number): UsageMetrics['weekly'] {
    const weekEvents = events.filter(e => e.timestamp >= start && e.timestamp <= end);
    
    return {
      users: this.getUniqueUserCount(weekEvents),
      sessions: this.getUniqueSessionCount(weekEvents),
      codeGenerations: weekEvents.filter(e => e.eventType === 'code_generation').length,
      avgSessionDuration: this.calculateAverageSessionDuration(weekEvents),
      retentionRate: this.calculateRetentionRate(weekEvents, start, end)
    };
  }

  private calculateMonthlyMetrics(events: AnalyticsEvent[], start: number, end: number): UsageMetrics['monthly'] {
    const monthEvents = events.filter(e => e.timestamp >= start && e.timestamp <= end);
    
    return {
      users: this.getUniqueUserCount(monthEvents),
      newUsers: 0, // Would require historical data
      churnRate: 0, // Would require historical data
      totalGenerations: monthEvents.filter(e => e.eventType === 'code_generation').length,
      avgGenerationsPerUser: 0 // Calculated from above
    };
  }

  private calculateFeatureMetrics(events: AnalyticsEvent[]): UsageMetrics['features'] {
    const providers = new Map<string, number>();
    const commands = new Map<string, number>();
    const languages = new Map<string, number>();
    
    events.forEach(event => {
      if (event.eventType === 'code_generation') {
        const provider = event.properties.provider;
        const language = event.properties.language;
        
        if (provider) providers.set(provider, (providers.get(provider) || 0) + 1);
        if (language) languages.set(language, (languages.get(language) || 0) + 1);
      }
      
      if (event.eventType === 'command') {
        const command = event.properties.command;
        if (command) commands.set(command, (commands.get(command) || 0) + 1);
      }
    });
    
    return {
      mostUsedProviders: Array.from(providers.entries())
        .map(([provider, usage]) => ({ provider, usage }))
        .sort((a, b) => b.usage - a.usage)
        .slice(0, 10),
      mostUsedCommands: Array.from(commands.entries())
        .map(([command, usage]) => ({ command, usage }))
        .sort((a, b) => b.usage - a.usage)
        .slice(0, 10),
      popularLanguages: Array.from(languages.entries())
        .map(([language, usage]) => ({ language, usage }))
        .sort((a, b) => b.usage - a.usage)
        .slice(0, 10),
      averageProjectSize: 0 // Would be calculated from project data
    };
  }

  private getUniqueUserCount(events: AnalyticsEvent[]): number {
    const userIds = new Set(events.map(e => e.userId).filter(Boolean));
    return userIds.size;
  }

  private getUniqueSessionCount(events: AnalyticsEvent[]): number {
    const sessionIds = new Set(events.map(e => e.sessionId));
    return sessionIds.size;
  }

  private calculateAverageSessionDuration(events: AnalyticsEvent[]): number {
    // Would calculate based on session start/end events
    return 0;
  }

  private calculateRetentionRate(events: AnalyticsEvent[], start: number, end: number): number {
    // Would calculate based on returning users
    return 0;
  }

  private getDefaultPrivacySettings(): PrivacySettings {
    return {
      analyticsEnabled: false, // Opt-in by default
      errorReportingEnabled: false,
      performanceMetricsEnabled: false,
      featureUsageEnabled: false,
      shareAnonymousStats: false
    };
  }

  private async loadPrivacySettings(): Promise<PrivacySettings> {
    // Would load from user configuration file
    return this.getDefaultPrivacySettings();
  }

  private savePrivacySettings(settings: PrivacySettings): void {
    // Would save to user configuration file
  }

  private clearStoredData(): void {
    this.events.clear();
    this.emit('data:cleared');
  }
}

// Export factory functions for each platform
export const createCLIAnalytics = () => UsageAnalytics.getInstance('cli');
export const createWebAnalytics = () => UsageAnalytics.getInstance('web');
export const createExtensionAnalytics = () => UsageAnalytics.getInstance('extension');

export default UsageAnalytics;