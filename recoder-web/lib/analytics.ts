/**
 * Client-side analytics service for tracking user interactions
 */

interface AnalyticsEvent {
  sessionId?: string;
  userId?: string;
  type: 'page_view' | 'feature_use' | 'api_call' | 'interaction' | 'conversion' | 'error';
  category: 'navigation' | 'ai_interaction' | 'code_generation' | 'authentication' | 'settings' | 'deployment';
  action: string;
  target?: string;
  properties?: Record<string, any>;
}

interface FeatureUsageEvent {
  userId?: string;
  featureName: string;
  context?: string;
  sessionId?: string;
  platform?: string;
  metadata?: Record<string, any>;
}

interface AIUsageEvent {
  userId?: string;
  model: string;
  provider: string;
  prompt?: {
    length: number;
    type: string;
  };
  completion?: {
    length: number;
    responseTime: number;
    tokens: number;
  };
  metadata?: Record<string, any>;
}

interface SessionData {
  userId?: string;
  deviceId: string;
  platform: 'web' | 'cli' | 'extension' | 'router';
  device: {
    type: 'desktop' | 'mobile' | 'tablet' | 'server';
    os: string;
    browser?: string;
    screen?: { width: number; height: number };
  };
  location?: {
    country: string;
    region: string;
    city: string;
    timezone: string;
  };
  network?: {
    connection: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
    speed?: 'slow' | 'fast' | 'very-fast';
  };
  metadata?: Record<string, any>;
}

class AnalyticsService {
  private sessionId: string | null = null;
  private userId: string | null = null;
  private isEnabled: boolean = true;
  private queue: any[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private sessionStartTime: number = Date.now();

  constructor() {
    if (typeof window !== 'undefined') {
      this.initializeSession();
      this.setupEventListeners();
      this.startPeriodicFlush();
    }
  }

  /**
   * Initialize analytics session
   */
  private async initializeSession(): Promise<void> {
    try {
      // Generate or retrieve device ID
      const deviceId = this.getDeviceId();
      
      // Detect user info
      this.userId = this.getUserId();
      
      // Get device and browser info
      const deviceInfo = this.getDeviceInfo();
      const locationInfo = await this.getLocationInfo();
      const networkInfo = this.getNetworkInfo();

      const sessionData: SessionData = {
        userId: this.userId || undefined,
        deviceId,
        platform: 'web',
        device: deviceInfo,
        location: locationInfo,
        network: networkInfo,
        metadata: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          referrer: document.referrer,
          timestamp: new Date().toISOString()
        }
      };

      // Start session with backend
      const response = await fetch('/api/analytics/session/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData),
      });

      if (response.ok) {
        const result = await response.json();
        this.sessionId = result.sessionId;
      }
    } catch (error) {
      console.error('Failed to initialize analytics session:', error);
    }
  }

  /**
   * Set user ID for tracking
   */
  setUserId(userId: string): void {
    this.userId = userId;
    if (typeof window !== 'undefined') {
      localStorage.setItem('analytics_user_id', userId);
    }
  }

  /**
   * Track page view
   */
  trackPageView(page: string, properties?: Record<string, any>): void {
    this.track({
      type: 'page_view',
      category: 'navigation',
      action: 'page_view',
      target: page,
      properties: {
        ...properties,
        path: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        title: document.title,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Track feature usage
   */
  trackFeatureUsage(featureName: string, context?: string, metadata?: Record<string, any>): void {
    const event: FeatureUsageEvent = {
      userId: this.userId || undefined,
      featureName,
      context: context || 'web',
      sessionId: this.sessionId || undefined,
      platform: 'web',
      metadata: {
        ...metadata,
        timestamp: Date.now(),
        page: window.location.pathname
      }
    };

    this.sendFeatureUsage(event);
  }

  /**
   * Track AI usage
   */
  trackAIUsage(event: Partial<AIUsageEvent>): void {
    const aiEvent: AIUsageEvent = {
      userId: this.userId || undefined,
      model: event.model || 'unknown',
      provider: event.provider || 'unknown',
      prompt: event.prompt,
      completion: event.completion,
      metadata: {
        ...event.metadata,
        timestamp: Date.now(),
        sessionId: this.sessionId,
        page: window.location.pathname
      }
    };

    this.sendAIUsage(aiEvent);
  }

  /**
   * Track user interaction
   */
  trackInteraction(action: string, target?: string, properties?: Record<string, any>): void {
    this.track({
      type: 'interaction',
      category: 'ai_interaction',
      action,
      target,
      properties: {
        ...properties,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Track conversion event
   */
  trackConversion(action: string, value?: number, properties?: Record<string, any>): void {
    this.track({
      type: 'conversion',
      category: 'ai_interaction',
      action,
      properties: {
        ...properties,
        value,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Track error
   */
  trackError(error: Error | string, context?: string, properties?: Record<string, any>): void {
    const errorInfo = typeof error === 'string' ? { message: error } : {
      message: error.message,
      stack: error.stack,
      name: error.name
    };

    this.track({
      type: 'error',
      category: 'ai_interaction',
      action: 'error',
      target: context,
      properties: {
        ...properties,
        error: errorInfo,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        url: window.location.href
      }
    });
  }

  /**
   * Track API call
   */
  trackApiCall(endpoint: string, method: string, responseTime: number, success: boolean, properties?: Record<string, any>): void {
    this.track({
      type: 'api_call',
      category: 'ai_interaction',
      action: `${method.toUpperCase()} ${endpoint}`,
      properties: {
        ...properties,
        endpoint,
        method,
        responseTime,
        success,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Generic event tracking
   */
  private track(event: AnalyticsEvent): void {
    if (!this.isEnabled || !this.sessionId) {
      return;
    }

    const fullEvent = {
      ...event,
      sessionId: this.sessionId,
      userId: this.userId || undefined,
      timestamp: new Date()
    };

    this.queue.push({ type: 'activity', data: fullEvent });
    
    // Flush if queue is getting large
    if (this.queue.length >= 10) {
      this.flush();
    }
  }

  /**
   * Send feature usage event
   */
  private async sendFeatureUsage(event: FeatureUsageEvent): Promise<void> {
    try {
      await fetch('/api/analytics/feature', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });
    } catch (error) {
      console.error('Failed to track feature usage:', error);
    }
  }

  /**
   * Send AI usage event
   */
  private async sendAIUsage(event: AIUsageEvent): Promise<void> {
    try {
      await fetch('/api/analytics/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });
    } catch (error) {
      console.error('Failed to track AI usage:', error);
    }
  }

  /**
   * Flush queued events
   */
  private async flush(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    const events = this.queue.splice(0);
    
    try {
      // Send all queued activity events
      const activityEvents = events.filter(e => e.type === 'activity');
      
      for (const event of activityEvents) {
        await fetch('/api/analytics/activity', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event.data),
        });
      }
    } catch (error) {
      console.error('Failed to flush analytics events:', error);
      // Re-add failed events to queue
      this.queue.unshift(...events);
    }
  }

  /**
   * Start periodic flush
   */
  private startPeriodicFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 30000); // Flush every 30 seconds
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.flush();
      }
    });

    // Track page unload
    window.addEventListener('beforeunload', () => {
      this.endSession();
    });

    // Track navigation
    let currentPath = window.location.pathname;
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      if (window.location.pathname !== currentPath) {
        currentPath = window.location.pathname;
        analytics.trackPageView(currentPath);
      }
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      if (window.location.pathname !== currentPath) {
        currentPath = window.location.pathname;
        analytics.trackPageView(currentPath);
      }
    };

    window.addEventListener('popstate', () => {
      if (window.location.pathname !== currentPath) {
        currentPath = window.location.pathname;
        this.trackPageView(currentPath);
      }
    });
  }

  /**
   * End current session
   */
  private async endSession(): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    // Flush any remaining events
    await this.flush();

    // End session
    try {
      await fetch('/api/analytics/session/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: this.sessionId }),
      });
    } catch (error) {
      console.error('Failed to end analytics session:', error);
    }
  }

  /**
   * Get or generate device ID
   */
  private getDeviceId(): string {
    let deviceId = localStorage.getItem('analytics_device_id');
    
    if (!deviceId) {
      deviceId = `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('analytics_device_id', deviceId);
    }
    
    return deviceId;
  }

  /**
   * Get user ID from storage or session
   */
  private getUserId(): string | null {
    return localStorage.getItem('analytics_user_id') || null;
  }

  /**
   * Get device information
   */
  private getDeviceInfo() {
    const userAgent = navigator.userAgent;
    let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';
    let os = 'unknown';
    let browser = 'unknown';

    // Detect device type
    if (/Mobi|Android/i.test(userAgent)) {
      deviceType = 'mobile';
    } else if (/Tablet|iPad/i.test(userAgent)) {
      deviceType = 'tablet';
    }

    // Detect OS
    if (/Windows/i.test(userAgent)) os = 'Windows';
    else if (/Mac/i.test(userAgent)) os = 'macOS';
    else if (/Linux/i.test(userAgent)) os = 'Linux';
    else if (/Android/i.test(userAgent)) os = 'Android';
    else if (/iOS/i.test(userAgent)) os = 'iOS';

    // Detect browser
    if (/Chrome/i.test(userAgent)) browser = 'Chrome';
    else if (/Firefox/i.test(userAgent)) browser = 'Firefox';
    else if (/Safari/i.test(userAgent)) browser = 'Safari';
    else if (/Edge/i.test(userAgent)) browser = 'Edge';

    return {
      type: deviceType,
      os,
      browser,
      screen: {
        width: window.screen.width,
        height: window.screen.height
      }
    };
  }

  /**
   * Get location information (simplified)
   */
  private async getLocationInfo() {
    try {
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      
      return {
        country: data.country_name || 'Unknown',
        region: data.region || 'Unknown',
        city: data.city || 'Unknown',
        timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      };
    } catch (error) {
      return {
        country: 'Unknown',
        region: 'Unknown',
        city: 'Unknown',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
    }
  }

  /**
   * Get network information
   */
  private getNetworkInfo() {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    
    return {
      connection: connection?.type || 'unknown',
      speed: connection?.effectiveType || 'unknown'
    };
  }

  /**
   * Enable/disable analytics
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    
    if (!enabled) {
      this.flush();
      if (this.flushInterval) {
        clearInterval(this.flushInterval);
        this.flushInterval = null;
      }
    } else if (!this.flushInterval) {
      this.startPeriodicFlush();
    }
  }

  /**
   * Check if analytics is enabled
   */
  isAnalyticsEnabled(): boolean {
    return this.isEnabled;
  }
}

// Create singleton instance
const analytics = new AnalyticsService();

export default analytics;
export { AnalyticsService };
export type { AnalyticsEvent, FeatureUsageEvent, AIUsageEvent };