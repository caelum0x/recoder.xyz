'use client';

import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useAuth } from "@/lib/auth/auth-context";
import analytics from '@/lib/analytics';

interface AnalyticsContextType {
  trackPageView: (page: string, properties?: Record<string, any>) => void;
  trackFeatureUsage: (featureName: string, context?: string, metadata?: Record<string, any>) => void;
  trackAIUsage: (event: {
    model: string;
    provider: string;
    prompt?: { length: number; type: string };
    completion?: { length: number; responseTime: number; tokens: number };
    metadata?: Record<string, any>;
  }) => void;
  trackInteraction: (action: string, target?: string, properties?: Record<string, any>) => void;
  trackConversion: (action: string, value?: number, properties?: Record<string, any>) => void;
  trackError: (error: Error | string, context?: string, properties?: Record<string, any>) => void;
  trackApiCall: (endpoint: string, method: string, responseTime: number, success: boolean, properties?: Record<string, any>) => void;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

interface AnalyticsProviderProps {
  children: ReactNode;
}

export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  const { user } = useAuth();

  useEffect(() => {
    // Set user ID when session is available
    if (user?.id) {
      analytics.setUserId(user.id);
    }
  }, [user]);

  useEffect(() => {
    // Track initial page view
    if (typeof window !== 'undefined') {
      analytics.trackPageView(window.location.pathname);
    }
  }, []);

  const contextValue: AnalyticsContextType = {
    trackPageView: (page: string, properties?: Record<string, any>) => {
      analytics.trackPageView(page, properties);
    },

    trackFeatureUsage: (featureName: string, context?: string, metadata?: Record<string, any>) => {
      analytics.trackFeatureUsage(featureName, context, metadata);
    },

    trackAIUsage: (event) => {
      analytics.trackAIUsage(event);
    },

    trackInteraction: (action: string, target?: string, properties?: Record<string, any>) => {
      analytics.trackInteraction(action, target, properties);
    },

    trackConversion: (action: string, value?: number, properties?: Record<string, any>) => {
      analytics.trackConversion(action, value, properties);
    },

    trackError: (error: Error | string, context?: string, properties?: Record<string, any>) => {
      analytics.trackError(error, context, properties);
    },

    trackApiCall: (endpoint: string, method: string, responseTime: number, success: boolean, properties?: Record<string, any>) => {
      analytics.trackApiCall(endpoint, method, responseTime, success, properties);
    }
  };

  return (
    <AnalyticsContext.Provider value={contextValue}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
}

// Higher-order component for automatic feature usage tracking
export function withAnalytics<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  featureName: string,
  context?: string
) {
  return function AnalyticsWrapper(props: P) {
    const { trackFeatureUsage } = useAnalytics();

    useEffect(() => {
      trackFeatureUsage(featureName, context);
    }, [trackFeatureUsage]);

    return <WrappedComponent {...props} />;
  };
}

// Hook for tracking component mount/unmount
export function useFeatureTracking(featureName: string, context?: string, metadata?: Record<string, any>) {
  const { trackFeatureUsage } = useAnalytics();

  useEffect(() => {
    trackFeatureUsage(featureName, context, metadata);
  }, [trackFeatureUsage, featureName, context, metadata]);
}