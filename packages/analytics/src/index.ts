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

// Quality assessment
export { QualityAssessor, qualityAssessor } from './quality/quality-assessor';
export type {
  QualityMetrics,
  QualityAssessmentRequest,
  QualityAssessmentResult
} from './quality/quality-assessor';

// System monitoring
export { 
  initializeMonitoring, 
  getSystemHealthSummary, 
  monitoringSystem 
} from './monitoring/index';

// A/B Testing system
export class ABTestingSystem {
  async runTest(testId: string, variants: Array<{ name: string; sampleSize?: number; conversions?: number }>): Promise<{
    testId: string;
    winner: any | null;
    confidence: number;
    needsMoreData: boolean;
    results: Array<{ name: string; conversionRate: number }>;
  }> {
    if (!variants || variants.length < 2) {
      return { testId, winner: null, confidence: 0, needsMoreData: true, results: [] };
    }

    // Calculate conversion rates for each variant
    const results = variants.map(v => ({
      name: v.name,
      sampleSize: v.sampleSize || 0,
      conversions: v.conversions || 0,
      conversionRate: v.sampleSize && v.sampleSize > 0 ? (v.conversions || 0) / v.sampleSize : 0,
    }));

    // Need minimum sample size for meaningful results
    const minSample = 30;
    const hasEnoughData = results.every(r => r.sampleSize >= minSample);
    if (!hasEnoughData) {
      return {
        testId,
        winner: null,
        confidence: 0,
        needsMoreData: true,
        results: results.map(r => ({ name: r.name, conversionRate: r.conversionRate })),
      };
    }

    // Find the best performing variant
    const sorted = [...results].sort((a, b) => b.conversionRate - a.conversionRate);
    const best = sorted[0];
    const runnerUp = sorted[1];

    // Calculate z-score for difference in proportions
    const p1 = best.conversionRate;
    const p2 = runnerUp.conversionRate;
    const n1 = best.sampleSize;
    const n2 = runnerUp.sampleSize;

    if (p1 === p2) {
      return {
        testId,
        winner: null,
        confidence: 0,
        needsMoreData: true,
        results: results.map(r => ({ name: r.name, conversionRate: r.conversionRate })),
      };
    }

    const pooledP = (best.conversions + runnerUp.conversions) / (n1 + n2);
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2));
    const zScore = se > 0 ? (p1 - p2) / se : 0;

    // Approximate confidence from z-score using normal CDF
    // P(Z < z) ≈ 1 / (1 + exp(-1.7155277 * z * (1 + 0.0417 * z * z)))
    const absZ = Math.abs(zScore);
    const cdf = 1 / (1 + Math.exp(-1.7155277 * absZ * (1 + 0.0417 * absZ * absZ)));
    const confidence = Math.min(0.9999, Math.max(0, (cdf - 0.5) * 2)); // Convert one-tail to confidence

    const winner = confidence >= 0.5 ? variants.find(v => v.name === best.name) || null : null;

    return {
      testId,
      winner,
      confidence: Math.round(confidence * 10000) / 10000,
      needsMoreData: confidence < 0.5,
      results: results.map(r => ({ name: r.name, conversionRate: r.conversionRate })),
    };
  }
}

// Default export  
export default RecoderAnalytics;