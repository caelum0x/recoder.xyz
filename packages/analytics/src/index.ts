/**
 * Recoder.xyz Analytics Package
 * 
 * Comprehensive analytics and monitoring for the Recoder ecosystem
 */

// Core monitoring
export { ProductionMonitoring, productionMonitoring } from './monitoring/production-monitoring';
export type {
  MetricData,
  AlertRule,
  SystemHealth,
  ServiceHealth
} from './monitoring/production-monitoring';

// Dashboard
export { MonitoringDashboard, monitoringDashboard } from './dashboard/monitoring-dashboard';
export type {
  DashboardMetrics,
  PlatformMetrics,
  AIProviderMetrics,
  DashboardReport
} from './dashboard/monitoring-dashboard';

// Usage analytics
export { 
  UsageAnalytics,
  createCLIAnalytics,
  createWebAnalytics,
  createExtensionAnalytics
} from './tracking/usage-analytics';
import { UsageAnalytics } from './tracking/usage-analytics';
export type {
  AnalyticsEvent,
  UsageMetrics,
  PrivacySettings
} from './tracking/usage-analytics';

// Analytics factory for different platforms
export class RecoderAnalytics {
  private static instances = new Map<string, any>();

  /**
   * Get analytics instance for platform
   */
  static forPlatform(platform: 'cli' | 'web' | 'extension') {
    const key = `analytics-${platform}`;
    
    if (!this.instances.has(key)) {
      let analytics;
      
      switch (platform) {
        case 'cli':
          analytics = UsageAnalytics.getInstance('cli');
          break;
        case 'web':
          analytics = UsageAnalytics.getInstance('web');
          break;
        case 'extension':
          analytics = UsageAnalytics.getInstance('extension');
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
      
      this.instances.set(key, analytics);
    }
    
    return this.instances.get(key);
  }

  /**
   * Get monitoring dashboard
   */
  static getDashboard() {
    const key = 'dashboard';
    
    if (!this.instances.has(key)) {
      const { monitoringDashboard } = require('./dashboard/monitoring-dashboard');
      this.instances.set(key, monitoringDashboard);
    }
    
    return this.instances.get(key);
  }

  /**
   * Get production monitoring
   */
  static getMonitoring() {
    const key = 'monitoring';
    
    if (!this.instances.has(key)) {
      const { productionMonitoring } = require('./monitoring/production-monitoring');
      this.instances.set(key, productionMonitoring);
    }
    
    return this.instances.get(key);
  }

  /**
   * Initialize analytics for platform
   */
  static async initialize(platform: 'cli' | 'web' | 'extension', options: {
    userId?: string;
    enableAnalytics?: boolean;
    enableMonitoring?: boolean;
  } = {}) {
    const analytics = this.forPlatform(platform);
    const dashboard = this.getDashboard();
    const monitoring = this.getMonitoring();

    // Initialize analytics
    if (options.enableAnalytics !== false) {
      await analytics.initializeAnalytics();
      
      if (options.userId) {
        analytics.setUserId(options.userId);
      }
    }

    // Start monitoring
    if (options.enableMonitoring !== false) {
      monitoring.startMonitoring();
      dashboard.start();
    }

    return {
      analytics,
      dashboard,
      monitoring
    };
  }

  /**
   * Shutdown all analytics
   */
  static shutdown() {
    // Stop monitoring
    try {
      const { monitoringDashboard } = require('./dashboard/monitoring-dashboard');
      const { productionMonitoring } = require('./monitoring/production-monitoring');
      monitoringDashboard.stop();
      productionMonitoring.stopMonitoring();
    } catch (error) {
      console.warn('Error stopping monitoring:', error);
    }

    // Clear instances
    this.instances.clear();
  }
}

// Default export
export default RecoderAnalytics;