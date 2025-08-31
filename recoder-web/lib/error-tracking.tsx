/**
 * Enhanced Error Tracking & Performance Monitoring
 * SESSION 4 Enhancement - Comprehensive monitoring system
 */

interface ErrorEvent {
  id: string;
  timestamp: number;
  type: 'javascript_error' | 'react_error' | 'api_error' | 'auth_error' | 'validation_error';
  message: string;
  stack?: string;
  url: string;
  lineNumber?: number;
  columnNumber?: number;
  userAgent: string;
  userId?: string;
  sessionId: string;
  platform: 'web' | 'chat' | 'cli' | 'engine';
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>;
  resolved?: boolean;
}

interface PerformanceMetrics {
  id: string;
  timestamp: number;
  type: 'navigation' | 'resource' | 'api_call' | 'form_submission';
  duration: number;
  url: string;
  success: boolean;
  userId?: string;
  sessionId: string;
  platform: string;
  metadata?: Record<string, any>;
}

class EnhancedErrorTracking {
  private static instance: EnhancedErrorTracking;
  private sessionId: string;
  private userId?: string;
  private platform: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.platform = this.detectPlatform();
    this.setupGlobalErrorHandlers();
    this.setupPerformanceMonitoring();
  }

  static getInstance(): EnhancedErrorTracking {
    if (!EnhancedErrorTracking.instance) {
      EnhancedErrorTracking.instance = new EnhancedErrorTracking();
    }
    return EnhancedErrorTracking.instance;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private detectPlatform(): string {
    if (typeof window === 'undefined') return 'server';
    
    const hostname = window.location.hostname;
    if (hostname.includes('chat.recoder.xyz')) return 'chat';
    if (hostname.includes('worthy-truth-production.up.railway.app')) return 'web';
    if (hostname.includes('recoder.xyz')) return 'main';
    return 'web';
  }

  private setupGlobalErrorHandlers(): void {
    if (typeof window === 'undefined') return;

    // JavaScript errors
    window.addEventListener('error', (event) => {
      this.trackError({
        type: 'javascript_error',
        message: event.message,
        stack: event.error?.stack,
        url: event.filename,
        lineNumber: event.lineno,
        columnNumber: event.colno,
        severity: 'high'
      });
    });

    // Promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.trackError({
        type: 'javascript_error',
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        url: window.location.href,
        severity: 'high'
      });
    });

    // React Error Boundary compatibility
    this.setupReactErrorTracking();
  }

  private setupReactErrorTracking(): void {
    // Monitor for React Error #418 specifically
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      const message = args.join(' ');
      if (message.includes('Minified React error #418') || 
          message.includes('Invalid model') ||
          message.includes('hydration')) {
        this.trackError({
          type: 'react_error',
          message: message,
          url: window.location.href,
          severity: 'critical',
          context: {
            reactError: true,
            errorCode: message.includes('#418') ? '418' : 'hydration'
          }
        });
      }
      originalConsoleError.apply(console, args);
    };
  }

  private setupPerformanceMonitoring(): void {
    if (typeof window === 'undefined') return;

    // Monitor page load performance
    window.addEventListener('load', () => {
      setTimeout(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        this.trackPerformance({
          type: 'navigation',
          duration: navigation.loadEventEnd - navigation.fetchStart,
          url: window.location.href,
          success: true,
          metadata: {
            dnsLookup: navigation.domainLookupEnd - navigation.domainLookupStart,
            serverResponse: navigation.responseEnd - navigation.requestStart,
            domProcessing: navigation.domContentLoadedEventEnd - navigation.responseEnd
          }
        });
      }, 0);
    });

    // Monitor API calls
    this.interceptFetch();
  }

  private interceptFetch(): void {
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const startTime = performance.now();
      const url = typeof args[0] === 'string' ? args[0] : args[0].url;
      
      try {
        const response = await originalFetch(...args);
        const duration = performance.now() - startTime;
        
        this.trackPerformance({
          type: 'api_call',
          duration,
          url,
          success: response.ok,
          metadata: {
            status: response.status,
            statusText: response.statusText,
            method: args[1]?.method || 'GET'
          }
        });

        if (!response.ok) {
          this.trackError({
            type: 'api_error',
            message: `API Error: ${response.status} ${response.statusText}`,
            url,
            severity: response.status >= 500 ? 'high' : 'medium',
            context: {
              status: response.status,
              method: args[1]?.method || 'GET'
            }
          });
        }

        return response;
      } catch (error) {
        const duration = performance.now() - startTime;
        
        this.trackPerformance({
          type: 'api_call',
          duration,
          url,
          success: false
        });

        this.trackError({
          type: 'api_error',
          message: `Network Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          url,
          severity: 'high',
          context: {
            networkError: true,
            method: args[1]?.method || 'GET'
          }
        });

        throw error;
      }
    };
  }

  public trackError(errorData: Partial<ErrorEvent>): void {
    const error: ErrorEvent = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type: errorData.type || 'javascript_error',
      message: errorData.message || 'Unknown error',
      stack: errorData.stack,
      url: errorData.url || (typeof window !== 'undefined' ? window.location.href : ''),
      lineNumber: errorData.lineNumber,
      columnNumber: errorData.columnNumber,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      userId: this.userId,
      sessionId: this.sessionId,
      platform: this.platform as any,
      severity: errorData.severity || 'medium',
      context: errorData.context,
      resolved: false
    };

    // Send to analytics endpoint
    this.sendErrorToServer(error);

    // Log for development
    if (process.env.NODE_ENV === 'development') {
      console.warn('🚨 Error tracked:', error);
    }
  }

  public trackPerformance(perfData: Partial<PerformanceMetrics>): void {
    const metrics: PerformanceMetrics = {
      id: `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type: perfData.type || 'navigation',
      duration: perfData.duration || 0,
      url: perfData.url || (typeof window !== 'undefined' ? window.location.href : ''),
      success: perfData.success !== false,
      userId: this.userId,
      sessionId: this.sessionId,
      platform: this.platform,
      metadata: perfData.metadata
    };

    // Send to analytics endpoint
    this.sendPerformanceToServer(metrics);
  }

  public trackFormSubmission(formType: string, success: boolean, duration?: number): void {
    this.trackPerformance({
      type: 'form_submission',
      duration: duration || 0,
      url: window.location.href,
      success,
      metadata: {
        formType,
        timestamp: Date.now()
      }
    });
  }

  private async sendErrorToServer(error: ErrorEvent): Promise<void> {
    try {
      await fetch('/api/analytics/errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(error),
      });
    } catch (err) {
      // Silently fail to avoid infinite loops
      console.warn('Failed to send error to server:', err);
    }
  }

  private async sendPerformanceToServer(metrics: PerformanceMetrics): Promise<void> {
    try {
      await fetch('/api/analytics/performance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metrics),
      });
    } catch (err) {
      // Silently fail
      console.warn('Failed to send performance data to server:', err);
    }
  }

  public setUserId(userId: string): void {
    this.userId = userId;
    
    // Update analytics service if available
    if (typeof window !== 'undefined' && (window as any).analytics) {
      (window as any).analytics.setUserId(userId);
    }
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  // Health check for monitoring system itself
  public healthCheck(): { status: 'healthy' | 'degraded'; checks: Record<string, boolean> } {
    const checks = {
      sessionId: !!this.sessionId,
      platform: !!this.platform,
      errorHandlers: typeof window !== 'undefined' && !!window.onerror,
      fetchIntercepted: typeof window !== 'undefined' && !!window.fetch
    };

    const allHealthy = Object.values(checks).every(Boolean);

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      checks
    };
  }
}

// Export singleton instance
export const errorTracker = typeof window !== 'undefined' ? EnhancedErrorTracking.getInstance() : null;

// React Error Boundary component
export function ErrorBoundary({ children, fallback }: { 
  children: React.ReactNode; 
  fallback?: React.ComponentType<{error: Error}>; 
}) {
  return (
    <ErrorBoundaryImpl fallback={fallback}>
      {children}
    </ErrorBoundaryImpl>
  );
}

class ErrorBoundaryImpl extends React.Component<
  { children: React.ReactNode; fallback?: React.ComponentType<{error: Error}> },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    errorTracker?.trackError({
      type: 'react_error',
      message: error.message,
      stack: error.stack,
      severity: 'high',
      context: {
        componentStack: errorInfo.componentStack,
        errorBoundary: true
      }
    });
  }

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback;
      if (FallbackComponent && this.state.error) {
        return <FallbackComponent error={this.state.error} />;
      }
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <h2 className="text-red-800 font-semibold">Something went wrong</h2>
          <p className="text-red-600 text-sm mt-1">
            An error occurred while rendering this component. The error has been logged.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default EnhancedErrorTracking;