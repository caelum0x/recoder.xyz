// Error tracking and analytics integration for Recoder.xyz platform
import { NextRequest } from 'next/server';

interface ErrorEvent {
  message: string;
  stack?: string;
  url: string;
  userAgent: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  sessionId?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, any>;
}

interface AnalyticsEvent {
  event: string;
  properties: Record<string, any>;
  userId?: string;
  sessionId?: string;
  timestamp: Date;
}

interface PerformanceMetrics {
  loadTime: number;
  renderTime: number;
  interactionTime: number;
  memoryUsage?: number;
  component: string;
  page: string;
}

class MonitoringService {
  private errorQueue: ErrorEvent[] = [];
  private analyticsQueue: AnalyticsEvent[] = [];
  private performanceQueue: PerformanceMetrics[] = [];
  private isFlushingErrors = false;
  private isFlushingAnalytics = false;
  private isFlushingPerformance = false;

  constructor() {
    // Flush queues periodically
    if (typeof window !== 'undefined') {
      setInterval(() => this.flushQueues(), 30000); // Every 30 seconds
      
      // Setup global error handlers
      this.setupGlobalErrorHandlers();
      
      // Setup performance monitoring
      this.setupPerformanceMonitoring();
    }
  }

  private setupGlobalErrorHandlers() {
    // Unhandled JavaScript errors
    window.addEventListener('error', (event) => {
      this.trackError({
        message: event.message,
        stack: event.error?.stack,
        url: event.filename || window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date(),
        severity: 'high',
        component: 'global',
        action: 'unhandled_error',
        metadata: {
          lineno: event.lineno,
          colno: event.colno,
          type: 'javascript_error'
        }
      });
    });

    // Unhandled Promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.trackError({
        message: event.reason?.message || 'Unhandled Promise Rejection',
        stack: event.reason?.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date(),
        severity: 'high',
        component: 'global',
        action: 'unhandled_rejection',
        metadata: {
          reason: event.reason,
          type: 'promise_rejection'
        }
      });
    });

    // Network errors (fetch failures)
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        
        if (!response.ok) {
          this.trackError({
            message: `HTTP ${response.status}: ${response.statusText}`,
            url: typeof args[0] === 'string' ? args[0] : args[0].url,
            userAgent: navigator.userAgent,
            timestamp: new Date(),
            severity: response.status >= 500 ? 'critical' : 'medium',
            component: 'network',
            action: 'fetch_error',
            metadata: {
              status: response.status,
              statusText: response.statusText,
              type: 'network_error'
            }
          });
        }
        
        return response;
      } catch (error: any) {
        this.trackError({
          message: error.message || 'Network request failed',
          stack: error.stack,
          url: typeof args[0] === 'string' ? args[0] : args[0].url,
          userAgent: navigator.userAgent,
          timestamp: new Date(),
          severity: 'critical',
          component: 'network',
          action: 'fetch_exception',
          metadata: {
            error: error.toString(),
            type: 'network_exception'
          }
        });
        throw error;
      }
    };
  }

  private setupPerformanceMonitoring() {
    // Page load performance
    window.addEventListener('load', () => {
      setTimeout(() => {
        const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        
        this.trackPerformance({
          loadTime: perfData.loadEventEnd - perfData.navigationStart,
          renderTime: perfData.domContentLoadedEventEnd - perfData.navigationStart,
          interactionTime: perfData.loadEventEnd - perfData.domContentLoadedEventEnd,
          component: 'page',
          page: window.location.pathname
        });
      }, 1000);
    });

    // Web Vitals tracking
    if ('PerformanceObserver' in window) {
      // Largest Contentful Paint (LCP)
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.trackAnalytics('web_vital_lcp', {
            value: entry.startTime,
            page: window.location.pathname,
            rating: entry.startTime > 4000 ? 'poor' : entry.startTime > 2500 ? 'needs_improvement' : 'good'
          });
        }
      }).observe({ entryTypes: ['largest-contentful-paint'] });

      // First Input Delay (FID)
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.trackAnalytics('web_vital_fid', {
            value: (entry as any).processingStart - entry.startTime,
            page: window.location.pathname,
            rating: (entry as any).processingStart - entry.startTime > 300 ? 'poor' : 
                   (entry as any).processingStart - entry.startTime > 100 ? 'needs_improvement' : 'good'
          });
        }
      }).observe({ entryTypes: ['first-input'] });

      // Cumulative Layout Shift (CLS)
      let clsValue = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        
        this.trackAnalytics('web_vital_cls', {
          value: clsValue,
          page: window.location.pathname,
          rating: clsValue > 0.25 ? 'poor' : clsValue > 0.1 ? 'needs_improvement' : 'good'
        });
      }).observe({ entryTypes: ['layout-shift'] });
    }
  }

  trackError(error: Omit<ErrorEvent, 'timestamp'> & { timestamp?: Date }) {
    const errorEvent: ErrorEvent = {
      ...error,
      timestamp: error.timestamp || new Date(),
    };

    this.errorQueue.push(errorEvent);

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error tracked:', errorEvent);
    }

    // Flush immediately for critical errors
    if (errorEvent.severity === 'critical') {
      this.flushErrors();
    }
  }

  trackAnalytics(event: string, properties: Record<string, any>, userId?: string) {
    const analyticsEvent: AnalyticsEvent = {
      event,
      properties,
      userId,
      sessionId: this.getSessionId(),
      timestamp: new Date(),
    };

    this.analyticsQueue.push(analyticsEvent);

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Analytics event:', analyticsEvent);
    }
  }

  trackPerformance(metrics: Omit<PerformanceMetrics, 'timestamp'>) {
    this.performanceQueue.push(metrics);

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Performance metrics:', metrics);
    }
  }

  private async flushQueues() {
    await Promise.all([
      this.flushErrors(),
      this.flushAnalytics(),
      this.flushPerformance()
    ]);
  }

  private async flushErrors() {
    if (this.isFlushingErrors || this.errorQueue.length === 0) return;

    this.isFlushingErrors = true;
    const errors = [...this.errorQueue];
    this.errorQueue = [];

    try {
      // Send to multiple monitoring services
      await Promise.allSettled([
        this.sendToSentry(errors),
        this.sendToLogRocket(errors),
        this.sendToDatadog(errors),
        this.sendToCustomEndpoint('/api/monitoring/errors', errors)
      ]);
    } catch (error) {
      console.error('Failed to flush error queue:', error);
      // Re-add errors to queue for retry
      this.errorQueue.unshift(...errors);
    } finally {
      this.isFlushingErrors = false;
    }
  }

  private async flushAnalytics() {
    if (this.isFlushingAnalytics || this.analyticsQueue.length === 0) return;

    this.isFlushingAnalytics = true;
    const events = [...this.analyticsQueue];
    this.analyticsQueue = [];

    try {
      await Promise.allSettled([
        this.sendToGoogleAnalytics(events),
        this.sendToMixpanel(events),
        this.sendToAmplitude(events),
        this.sendToCustomEndpoint('/api/monitoring/analytics', events)
      ]);
    } catch (error) {
      console.error('Failed to flush analytics queue:', error);
      this.analyticsQueue.unshift(...events);
    } finally {
      this.isFlushingAnalytics = false;
    }
  }

  private async flushPerformance() {
    if (this.isFlushingPerformance || this.performanceQueue.length === 0) return;

    this.isFlushingPerformance = true;
    const metrics = [...this.performanceQueue];
    this.performanceQueue = [];

    try {
      await Promise.allSettled([
        this.sendToNewRelic(metrics),
        this.sendToDatadog(metrics),
        this.sendToCustomEndpoint('/api/monitoring/performance', metrics)
      ]);
    } catch (error) {
      console.error('Failed to flush performance queue:', error);
      this.performanceQueue.unshift(...metrics);
    } finally {
      this.isFlushingPerformance = false;
    }
  }

  private async sendToSentry(errors: ErrorEvent[]) {
    if (!window.Sentry) return;
    
    errors.forEach(error => {
      window.Sentry.captureException(new Error(error.message), {
        level: error.severity as any,
        tags: {
          component: error.component,
          action: error.action
        },
        extra: error.metadata,
        user: error.userId ? { id: error.userId } : undefined
      });
    });
  }

  private async sendToLogRocket(errors: ErrorEvent[]) {
    if (!window.LogRocket) return;
    
    errors.forEach(error => {
      window.LogRocket.captureException(new Error(error.message));
    });
  }

  private async sendToDatadog(data: ErrorEvent[] | PerformanceMetrics[]) {
    if (!window.DD_RUM) return;
    
    data.forEach(item => {
      if ('message' in item) {
        // Error event
        window.DD_RUM.addError(item.message, {
          stack: item.stack,
          component: item.component,
          action: item.action
        });
      } else {
        // Performance metric
        window.DD_RUM.addTiming(item.component, item.loadTime);
      }
    });
  }

  private async sendToGoogleAnalytics(events: AnalyticsEvent[]) {
    if (!window.gtag) return;
    
    events.forEach(event => {
      window.gtag('event', event.event, {
        ...event.properties,
        user_id: event.userId,
        session_id: event.sessionId
      });
    });
  }

  private async sendToMixpanel(events: AnalyticsEvent[]) {
    if (!window.mixpanel) return;
    
    events.forEach(event => {
      window.mixpanel.track(event.event, {
        ...event.properties,
        distinct_id: event.userId,
        $session_id: event.sessionId
      });
    });
  }

  private async sendToAmplitude(events: AnalyticsEvent[]) {
    if (!window.amplitude) return;
    
    events.forEach(event => {
      window.amplitude.track(event.event, event.properties, {
        user_id: event.userId,
        session_id: event.sessionId
      });
    });
  }

  private async sendToNewRelic(metrics: PerformanceMetrics[]) {
    if (!window.newrelic) return;
    
    metrics.forEach(metric => {
      window.newrelic.recordMetric('Custom/Performance/LoadTime', metric.loadTime);
      window.newrelic.recordMetric('Custom/Performance/RenderTime', metric.renderTime);
    });
  }

  private async sendToCustomEndpoint(endpoint: string, data: any[]) {
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ events: data }),
      });
    } catch (error) {
      console.error(`Failed to send data to ${endpoint}:`, error);
    }
  }

  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('monitoring_session_id');
    if (!sessionId) {
      sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
      sessionStorage.setItem('monitoring_session_id', sessionId);
    }
    return sessionId;
  }

  // Public methods for manual tracking
  public trackUserAction(action: string, properties: Record<string, any> = {}) {
    this.trackAnalytics('user_action', {
      action,
      ...properties,
      page: typeof window !== 'undefined' ? window.location.pathname : undefined
    });
  }

  public trackPageView(page: string, properties: Record<string, any> = {}) {
    this.trackAnalytics('page_view', {
      page,
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      ...properties
    });
  }

  public trackAPICall(endpoint: string, method: string, duration: number, status: number) {
    this.trackAnalytics('api_call', {
      endpoint,
      method,
      duration,
      status,
      success: status >= 200 && status < 400
    });
  }

  public trackFeatureUsage(feature: string, properties: Record<string, any> = {}) {
    this.trackAnalytics('feature_usage', {
      feature,
      ...properties
    });
  }
}

// Global monitoring instance
export const monitoring = new MonitoringService();

// React Hook for component-level monitoring
export function useMonitoring(componentName: string) {
  const trackError = (error: Error, action?: string, metadata?: Record<string, any>) => {
    monitoring.trackError({
      message: error.message,
      stack: error.stack,
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      severity: 'medium',
      component: componentName,
      action,
      metadata
    });
  };

  const trackAction = (action: string, properties?: Record<string, any>) => {
    monitoring.trackUserAction(action, {
      component: componentName,
      ...properties
    });
  };

  const trackPerformance = (metrics: Omit<PerformanceMetrics, 'component'>) => {
    monitoring.trackPerformance({
      ...metrics,
      component: componentName
    });
  };

  return {
    trackError,
    trackAction,
    trackPerformance
  };
}

// Server-side monitoring for API routes
export function trackServerError(req: NextRequest, error: Error, severity: ErrorEvent['severity'] = 'medium') {
  const errorEvent: ErrorEvent = {
    message: error.message,
    stack: error.stack,
    url: req.url,
    userAgent: req.headers.get('user-agent') || '',
    timestamp: new Date(),
    severity,
    component: 'server',
    action: 'api_error',
    metadata: {
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
      type: 'server_error'
    }
  };

  // In server environment, send directly to monitoring services
  if (process.env.NODE_ENV === 'production') {
    // Send to external monitoring services
    Promise.allSettled([
      fetch(process.env.SENTRY_DSN || '', {
        method: 'POST',
        body: JSON.stringify(errorEvent)
      }),
      fetch(process.env.DATADOG_ENDPOINT || '', {
        method: 'POST',
        body: JSON.stringify(errorEvent)
      })
    ]);
  } else {
    console.error('Server error tracked:', errorEvent);
  }
}

// Type declarations for external monitoring services
declare global {
  interface Window {
    Sentry: any;
    LogRocket: any;
    DD_RUM: any;
    gtag: any;
    mixpanel: any;
    amplitude: any;
    newrelic: any;
  }
}