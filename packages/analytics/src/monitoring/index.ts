/**
 * Comprehensive Model Health Monitoring System - Entry Point
 * 
 * This module exports all components of the model health monitoring system
 * for easy integration into the recoder.xyz platform.
 */

// Core monitoring components
export { ModelHealthMonitor, modelHealthMonitor } from './health-monitor';
export { ModelTracker, modelTracker } from './model-tracker';
export { AvailabilityChecker, availabilityChecker } from './availability-checker';
export { LatencyMonitor, latencyMonitor } from './latency-monitor';
export { CostTracker, costTracker } from './cost-tracker';
export { ErrorDetector, errorDetector } from './error-detector';

// Alerting system
export { AlertManager, alertManager } from './alerting/alert-manager';
export { NotificationService, notificationService } from './alerting/notification-service';
export { EscalationPolicies, escalationPolicies } from './alerting/escalation-policies';

// Types and interfaces
export type {
  HealthStatus,
  ModelRecommendation,
  PredictiveAlert,
  HealthConfiguration
} from './health-monitor';

export type {
  QualityMetrics,
  PerformanceTrend,
  ModelReliability,
  ModelBenchmark
} from './model-tracker';

export type {
  AvailabilityStatus,
  RegionalAvailability,
  OutageEvent,
  HealthCheckConfig
} from './availability-checker';

export type {
  LatencyMetrics,
  LatencyEvent,
  LatencySpike,
  LatencyTrend,
  OptimizationRecommendation
} from './latency-monitor';

export type {
  CostMetrics,
  CostEvent,
  BudgetAlert,
  BudgetConfiguration,
  CostOptimization
} from './cost-tracker';

export type {
  ErrorEvent,
  ErrorPattern,
  CircuitBreakerState,
  RetryPolicy,
  ErrorMetrics,
  ErrorType
} from './error-detector';

export type {
  Alert,
  AlertRule,
  AlertStatistics,
  AlertType,
  AlertSeverity
} from './alerting/alert-manager';

export type {
  NotificationChannel,
  NotificationResult,
  NotificationHistory
} from './alerting/notification-service';

export type {
  EscalationPolicy,
  EscalationRule,
  OnCallSchedule,
  ActiveEscalation
} from './alerting/escalation-policies';

/**
 * Initialize the complete monitoring system
 */
export async function initializeMonitoring(): Promise<void> {
  console.log('🚀 Initializing Recoder Model Health Monitoring System...');

  try {
    // Import the singletons
    const { modelHealthMonitor } = await import('./health-monitor');
    const { availabilityChecker } = await import('./availability-checker');
    const { latencyMonitor } = await import('./latency-monitor');
    const { costTracker } = await import('./cost-tracker');
    const { errorDetector } = await import('./error-detector');
    const { alertManager } = await import('./alerting/alert-manager');

    // Start all monitoring components
    await Promise.all([
      modelHealthMonitor.startMonitoring(),
      availabilityChecker.start(),
      latencyMonitor.start(),
      costTracker.start(),
      errorDetector.start(),
      alertManager.start()
    ]);

    console.log('✅ Model Health Monitoring System initialized successfully');
    console.log('📊 Monitoring Features:');
    console.log('  • Real-time availability monitoring across regions');
    console.log('  • Latency tracking with percentile analysis');
    console.log('  • Cost monitoring with budget alerts');
    console.log('  • Error pattern detection with circuit breakers');
    console.log('  • Predictive failure detection');
    console.log('  • Multi-channel alerting with escalation');
    console.log('  • Comprehensive health scoring');

  } catch (error) {
    console.error('❌ Failed to initialize monitoring system:', error);
    throw error;
  }
}

/**
 * Shutdown the complete monitoring system
 */
export async function shutdownMonitoring(): Promise<void> {
  console.log('🛑 Shutting down Model Health Monitoring System...');

  try {
    // Import the singletons
    const { modelHealthMonitor } = await import('./health-monitor');
    const { availabilityChecker } = await import('./availability-checker');
    const { latencyMonitor } = await import('./latency-monitor');
    const { costTracker } = await import('./cost-tracker');
    const { errorDetector } = await import('./error-detector');
    const { alertManager } = await import('./alerting/alert-manager');

    // Stop all monitoring components
    await Promise.all([
      modelHealthMonitor.stopMonitoring(),
      availabilityChecker.stop(),
      latencyMonitor.stop(),
      costTracker.stop(),
      errorDetector.stop(),
      alertManager.stop()
    ]);

    console.log('✅ Model Health Monitoring System shutdown complete');

  } catch (error) {
    console.error('❌ Error during monitoring system shutdown:', error);
    throw error;
  }
}

/**
 * Get system-wide health summary
 */
export async function getSystemHealthSummary(): Promise<{
  overall: any;
  models: any[];
  alerts: { active: number; critical: number };
  costs: { dailySpend: number; budgetStatus: string };
  availability: { average: number; regional: any[] };
}> {
  // Import the singletons
  const { modelHealthMonitor } = await import('./health-monitor');
  const { alertManager } = await import('./alerting/alert-manager');
  const { costTracker } = await import('./cost-tracker');
  const { availabilityChecker } = await import('./availability-checker');

  const overallHealth = await modelHealthMonitor.getOverallHealth();
  const allModelsHealth = await modelHealthMonitor.getAllModelsHealth();
  const activeAlerts = alertManager.getActiveAlerts();
  const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
  const costReport = await costTracker.getCostReport('24h');
  const availabilityReport = await availabilityChecker.getAvailabilityReport();

  return {
    overall: overallHealth,
    models: allModelsHealth,
    alerts: {
      active: activeAlerts.length,
      critical: criticalAlerts.length
    },
    costs: {
      dailySpend: costReport.totalCost,
      budgetStatus: costReport.budgetStatus.length > 0 ? costReport.budgetStatus[0].status : 'ok'
    },
    availability: {
      average: availabilityReport.overall.averageUptime,
      regional: availabilityReport.regions
    }
  };
}

/**
 * Quick health check for a specific model
 */
export async function checkModelHealth(modelName: string): Promise<{
  health: any;
  alerts: any[];
  recommendations: string[];
}> {
  // Import the singletons
  const { modelHealthMonitor } = await import('./health-monitor');
  const { alertManager } = await import('./alerting/alert-manager');

  const health = await modelHealthMonitor.getHealthStatus(modelName);
  const alerts = alertManager.getActiveAlerts({ source: modelName });
  const recommendations: string[] = [];

  // Generate recommendations based on health
  if (health.availability < 0.95) {
    recommendations.push('Consider switching to backup model due to low availability');
  }
  if (health.avgLatency > 5000) {
    recommendations.push('High latency detected - check regional routing');
  }
  if (health.errorRate > 0.05) {
    recommendations.push('Elevated error rate - review recent requests');
  }

  return { health, alerts, recommendations };
}

// Export monitoring system factory for lazy loading
export const monitoringSystem = {
  async getHealth() {
    const { modelHealthMonitor } = await import('./health-monitor');
    return modelHealthMonitor;
  },
  async getAvailability() {
    const { availabilityChecker } = await import('./availability-checker');
    return availabilityChecker;
  },
  async getLatency() {
    const { latencyMonitor } = await import('./latency-monitor');
    return latencyMonitor;
  },
  async getCost() {
    const { costTracker } = await import('./cost-tracker');
    return costTracker;
  },
  async getErrors() {
    const { errorDetector } = await import('./error-detector');
    return errorDetector;
  },
  async getAlerts() {
    const { alertManager } = await import('./alerting/alert-manager');
    return alertManager;
  },
  
  // Convenience methods
  initialize: initializeMonitoring,
  shutdown: shutdownMonitoring,
  getSystemSummary: getSystemHealthSummary,
  checkModel: checkModelHealth
};

export default monitoringSystem;