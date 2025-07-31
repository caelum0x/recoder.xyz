/**
 * Main Model Health Monitoring Orchestrator
 * 
 * Coordinates all health monitoring activities across multiple AI model providers.
 * Provides unified health status, predictive failure detection, and automated recovery.
 */

import { Logger } from '@recoder/shared';
import { ModelTracker, ModelHealthMetrics } from './model-tracker';
import { AvailabilityChecker } from './availability-checker';
import { LatencyMonitor } from './latency-monitor';
import { CostTracker } from './cost-tracker';
import { ErrorDetector } from './error-detector';
import { AlertManager, AlertType, AlertSeverity } from './alerting/alert-manager'; 
import { EventEmitter } from 'events';

export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'critical' | 'down';
  score: number; // 0-100 overall health score
  timestamp: Date;
  activeModels: number;
  healthyModels: number;
  degradedModels: number;
  criticalModels: number;
  downModels: number;
}

export interface ModelRecommendation {
  recommended: string[];
  alternatives: string[];
  reason: string;
  confidence: number;
}

export interface PredictiveAlert {
  modelName: string;
  provider: string;
  probability: number; // 0-1 failure probability
  timeToFailure: number; // estimated minutes
  indicators: string[];
  recommendedActions: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface HealthConfiguration {
  checkInterval: number; // milliseconds
  alertThresholds: {
    availability: number;
    latency: number;
    errorRate: number;
    costIncrease: number;
  };
  predictiveSettings: {
    enabled: boolean;
    predictionWindow: number; // minutes
    confidenceThreshold: number;
  };
  autoRecovery: {
    enabled: boolean;
    maxRetries: number;
    backoffMultiplier: number;
  };
}

export class ModelHealthMonitor extends EventEmitter {
  private modelTracker!: ModelTracker;
  private availabilityChecker!: AvailabilityChecker;
  private latencyMonitor!: LatencyMonitor;
  private costTracker!: CostTracker;
  private errorDetector!: ErrorDetector;
  private alertManager!: AlertManager;
  
  private config: HealthConfiguration;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private modelsHealthCache: Map<string, ModelHealthMetrics> = new Map();
  private lastOverallHealth: HealthStatus | null = null;

  constructor(config?: Partial<HealthConfiguration>) {
    super();
    
    this.config = {
      checkInterval: 30000, // 30 seconds
      alertThresholds: {
        availability: 0.95, // 95%
        latency: 5000, // 5 seconds
        errorRate: 0.05, // 5%
        costIncrease: 0.2 // 20%
      },
      predictiveSettings: {
        enabled: true,
        predictionWindow: 30, // 30 minutes
        confidenceThreshold: 0.7
      },
      autoRecovery: {
        enabled: true,
        maxRetries: 3,
        backoffMultiplier: 2
      },
      ...config
    };

    this.initializeComponents();
    this.setupEventHandlers();
  }

  private initializeComponents(): void {
    this.modelTracker = new ModelTracker();
    this.availabilityChecker = new AvailabilityChecker();
    this.latencyMonitor = new LatencyMonitor();
    this.costTracker = new CostTracker();
    this.errorDetector = new ErrorDetector();
    this.alertManager = new AlertManager();

    Logger.info('Model health monitoring components initialized');
  }

  private setupEventHandlers(): void {
    // Listen for critical events from components
    this.availabilityChecker.on('modelDown', (modelName: string) => {
      this.handleModelDown(modelName);
    });

    this.errorDetector.on('errorSpike', (modelName: string, errorRate: number) => {
      this.handleErrorSpike(modelName, errorRate);
    });

    this.latencyMonitor.on('latencySpike', (modelName: string, latency: number) => {
      this.handleLatencySpike(modelName, latency);
    });

    this.costTracker.on('costAlert', (modelName: string, increase: number) => {
      this.handleCostAlert(modelName, increase);
    });
  }

  /**
   * Start comprehensive health monitoring
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      Logger.warn('Health monitoring is already running');
      return;
    }

    Logger.info('Starting comprehensive model health monitoring...');

    try {
      // Initialize all monitoring components
      await Promise.all([
        this.availabilityChecker.start(),
        this.latencyMonitor.start(),
        this.costTracker.start(),
        this.errorDetector.start()
      ]);

      // Start periodic health checks
      this.monitoringInterval = setInterval(() => {
        this.performHealthCheck();
      }, this.config.checkInterval);

      this.isMonitoring = true;
      this.emit('monitoringStarted');
      
      Logger.info('Model health monitoring started successfully');
    } catch (error) {
      Logger.error('Failed to start health monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop health monitoring
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    Logger.info('Stopping model health monitoring...');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Stop all monitoring components
    await Promise.all([
      this.availabilityChecker.stop(),
      this.latencyMonitor.stop(),
      this.costTracker.stop(),
      this.errorDetector.stop()
    ]);

    this.isMonitoring = false;
    this.emit('monitoringStopped');
    
    Logger.info('Model health monitoring stopped');
  }

  /**
   * Get comprehensive health status for a specific model
   */
  async getHealthStatus(modelName: string): Promise<ModelHealthMetrics> {
    try {
      // Check cache first
      const cached = this.modelsHealthCache.get(modelName);
      if (cached && (Date.now() - cached.lastUpdated.getTime()) < 60000) { // 1 minute cache
        return cached;
      }

      // Gather health data from all monitoring components
      const [
        availability,
        latencyMetrics,
        costMetrics,
        errorMetrics,
        qualityScore
      ] = await Promise.all([
        this.availabilityChecker.checkAvailability(modelName),
        this.latencyMonitor.getLatencyMetrics(modelName, '1h'),
        this.costTracker.getCostMetrics(modelName),
        this.errorDetector.getErrorMetrics(modelName),
        this.modelTracker.getQualityScore(modelName)
      ]);

      const healthMetrics: ModelHealthMetrics = {
        modelName,
        provider: this.getProviderFromModel(modelName),
        availability: availability.uptime,
        avgLatency: latencyMetrics.avg,
        errorRate: errorMetrics.rate,
        costPerToken: costMetrics.currentRate,
        qualityScore,
        throughput: this.calculateThroughput(latencyMetrics.avg),
        lastUpdated: new Date(),
        trends: {
          latency: this.mapTrendToExpected(this.analyzeTrend(latencyMetrics.trend || 'stable')),
          cost: this.mapTrendToExpected(this.analyzeTrend(costMetrics.costTrend || 'stable')),
          quality: this.mapTrendToExpected(this.analyzeTrend(qualityScore > 0.8 ? 'stable' : 'decreasing'))
        }
      };

      // Cache the result
      this.modelsHealthCache.set(modelName, healthMetrics);
      
      return healthMetrics;
    } catch (error) {
      Logger.error(`Failed to get health status for ${modelName}:`, error);
      throw error;
    }
  }

  /**
   * Get health status for all monitored models
   */
  async getAllModelsHealth(): Promise<ModelHealthMetrics[]> {
    const modelNames = await this.getMonitoredModels();
    const healthPromises = modelNames.map(name => this.getHealthStatus(name));
    
    try {
      const healthMetrics = await Promise.all(healthPromises);
      return healthMetrics;
    } catch (error) {
      Logger.error('Failed to get health status for all models:', error);
      throw error;
    }
  }

  /**
   * Get overall system health status
   */
  async getOverallHealth(): Promise<HealthStatus> {
    const allModelsHealth = await this.getAllModelsHealth();
    
    let healthyCount = 0;
    let degradedCount = 0;
    let criticalCount = 0;
    let downCount = 0;
    let totalScore = 0;

    allModelsHealth.forEach(health => {
      const score = this.calculateHealthScore(health);
      totalScore += score;

      if (score >= 90) healthyCount++;
      else if (score >= 70) degradedCount++;
      else if (score >= 40) criticalCount++;
      else downCount++;
    });

    const overallScore = allModelsHealth.length > 0 ? totalScore / allModelsHealth.length : 0;
    let overallStatus: HealthStatus['overall'];

    if (overallScore >= 90) overallStatus = 'healthy';
    else if (overallScore >= 70) overallStatus = 'degraded';
    else if (overallScore >= 40) overallStatus = 'critical';
    else overallStatus = 'down';

    const healthStatus: HealthStatus = {
      overall: overallStatus,
      score: overallScore,
      timestamp: new Date(),
      activeModels: allModelsHealth.length,
      healthyModels: healthyCount,
      degradedModels: degradedCount,
      criticalModels: criticalCount,
      downModels: downCount
    };

    // Emit events if health status changed
    if (this.lastOverallHealth?.overall !== overallStatus) {
      this.emit('healthStatusChanged', healthStatus, this.lastOverallHealth);
    }

    this.lastOverallHealth = healthStatus;
    return healthStatus;
  }

  /**
   * Predict potential model failures using ML-based analysis
   */
  async predictModelFailure(modelName: string): Promise<number> {
    if (!this.config.predictiveSettings.enabled) {
      return 0;
    }

    try {
      const health = await this.getHealthStatus(modelName);
      const errorTrend = await this.errorDetector.getErrorTrend(modelName, '1h');
      const latencyTrend = await this.latencyMonitor.getLatencyTrend(modelName, '1h');
      
      // Simple ML-like prediction based on multiple factors
      let failureProbability = 0;

      // Factor 1: Current availability (weight: 0.3)
      if (health.availability < 0.9) {
        failureProbability += (0.9 - health.availability) * 0.3;
      }

      // Factor 2: Error rate trend (weight: 0.4)
      if (errorTrend.isIncreasing && health.errorRate > 0.02) {
        failureProbability += health.errorRate * 0.4;
      }

      // Factor 3: Latency degradation (weight: 0.2)
      if (latencyTrend.isIncreasing && health.avgLatency > 3000) {
        failureProbability += Math.min(health.avgLatency / 10000, 0.2);
      }

      // Factor 4: Historical patterns (weight: 0.1)
      const historicalFailures = await this.errorDetector.getHistoricalFailurePattern(modelName);
      failureProbability += historicalFailures.riskScore * 0.1;

      return Math.min(failureProbability, 1.0);
    } catch (error) {
      Logger.error(`Failed to predict failure for ${modelName}:`, error);
      return 0;
    }
  }

  /**
   * Get predictive alerts for models at risk
   */
  async getPredictiveAlerts(): Promise<PredictiveAlert[]> {
    const modelNames = await this.getMonitoredModels();
    const alerts: PredictiveAlert[] = [];

    for (const modelName of modelNames) {
      const probability = await this.predictModelFailure(modelName);
      
      if (probability >= this.config.predictiveSettings.confidenceThreshold) {
        const health = await this.getHealthStatus(modelName);
        const indicators = this.identifyFailureIndicators(health);
        
        alerts.push({
          modelName,
          provider: health.provider,
          probability,
          timeToFailure: this.estimateTimeToFailure(probability),
          indicators,
          recommendedActions: this.generateRecommendations(health, indicators),
          severity: this.calculateSeverity(probability)
        });
      }
    }

    return alerts.sort((a, b) => b.probability - a.probability);
  }

  /**
   * Recommend alternative models when one fails
   */
  async recommendAlternatives(failedModel: string): Promise<string[]> {
    try {
      const allHealth = await this.getAllModelsHealth();
      const failedModelProvider = this.getProviderFromModel(failedModel);
      
      // Filter healthy models, prioritize different providers
      const alternatives = allHealth
        .filter(health => 
          health.modelName !== failedModel &&
          health.availability > 0.9 &&
          health.errorRate < 0.05 &&
          health.avgLatency < 5000
        )
        .sort((a, b) => {
          // Prefer different providers
          const aProviderBonus = a.provider !== failedModelProvider ? 10 : 0;
          const bProviderBonus = b.provider !== failedModelProvider ? 10 : 0;
          
          const aScore = this.calculateHealthScore(a) + aProviderBonus;
          const bScore = this.calculateHealthScore(b) + bProviderBonus;
          
          return bScore - aScore;
        })
        .slice(0, 3) // Top 3 alternatives
        .map(health => health.modelName);

      return alternatives;
    } catch (error) {
      Logger.error(`Failed to recommend alternatives for ${failedModel}:`, error);
      return [];
    }
  }

  /**
   * Generate comprehensive model recommendation
   */
  async getModelRecommendation(taskType: string, requirements: any): Promise<ModelRecommendation> {
    const allHealth = await this.getAllModelsHealth();
    
    // Filter models based on requirements and health
    const suitableModels = allHealth.filter(health => {
      const healthScore = this.calculateHealthScore(health);
      return healthScore >= 70 && 
             health.availability >= 0.9 &&
             health.errorRate <= 0.05;
    });

    // Score models based on task type
    const scoredModels = suitableModels.map(health => ({
      model: health.modelName,
      score: this.scoreModelForTask(health, taskType, requirements)
    })).sort((a, b) => b.score - a.score);

    const recommended = scoredModels.slice(0, 2).map(m => m.model);
    const alternatives = scoredModels.slice(2, 5).map(m => m.model);

    return {
      recommended,
      alternatives,
      reason: this.generateRecommendationReason(recommended[0], taskType),
      confidence: scoredModels.length > 0 ? scoredModels[0].score / 100 : 0
    };
  }

  // Private helper methods

  private async performHealthCheck(): Promise<void> {
    try {
      const overallHealth = await this.getOverallHealth();
      
      // Check for alerts
      const predictiveAlerts = await this.getPredictiveAlerts();
      
      // Process alerts
      for (const alert of predictiveAlerts) {
        await this.alertManager.processAlert({
          type: AlertType.PREDICTIVE,
          severity: AlertSeverity.HIGH,
          source: 'health_monitor',
          modelName: alert.modelName,
          message: `Model ${alert.modelName} has ${(alert.probability * 100).toFixed(1)}% failure probability`,
          data: alert
        });
      }

      this.emit('healthCheckCompleted', overallHealth);
    } catch (error) {
      Logger.error('Health check failed:', error);
      this.emit('healthCheckFailed', error);
    }
  }

  private async handleModelDown(modelName: string): Promise<void> {
    Logger.warn(`Model ${modelName} is down`);
    
    if (this.config.autoRecovery.enabled) {
      await this.attemptRecovery(modelName);
    }

    const alternatives = await this.recommendAlternatives(modelName);
    
    await this.alertManager.processAlert({
      type: AlertType.AVAILABILITY,
      severity: AlertSeverity.CRITICAL,
      source: 'health_monitor',
      modelName,
      message: `Model ${modelName} is unavailable`,
      data: { alternatives }
    });

    this.emit('modelDown', modelName, alternatives);
  }

  private async handleErrorSpike(modelName: string, errorRate: number): Promise<void> {
    Logger.warn(`Error spike detected for ${modelName}: ${(errorRate * 100).toFixed(1)}%`);
    
    await this.alertManager.processAlert({
      type: AlertType.ERROR_RATE,
      severity: errorRate > 0.1 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH,
      source: 'health_monitor',
      modelName,
      message: `High error rate detected: ${(errorRate * 100).toFixed(1)}%`,
      data: { errorRate }
    });

    this.emit('errorSpike', modelName, errorRate);
  }

  private async handleLatencySpike(modelName: string, latency: number): Promise<void> {
    Logger.warn(`Latency spike detected for ${modelName}: ${latency}ms`);
    
    await this.alertManager.processAlert({
      type: AlertType.LATENCY,
      severity: latency > 10000 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
      source: 'health_monitor',
      modelName,
      message: `High latency detected: ${latency}ms`,
      data: { latency }
    });

    this.emit('latencySpike', modelName, latency);
  }

  private async handleCostAlert(modelName: string, increase: number): Promise<void> {
    Logger.warn(`Cost increase detected for ${modelName}: ${(increase * 100).toFixed(1)}%`);
    
    await this.alertManager.processAlert({
      type: AlertType.COST,
      severity: increase > 0.5 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
      source: 'health_monitor',
      modelName,
      message: `Significant cost increase: ${(increase * 100).toFixed(1)}%`,
      data: { increase }
    });

    this.emit('costAlert', modelName, increase);
  }

  private calculateHealthScore(health: ModelHealthMetrics): number {
    const availabilityScore = health.availability * 30;
    const latencyScore = Math.max(0, 30 - (health.avgLatency / 100));
    const errorScore = Math.max(0, 20 - (health.errorRate * 400));
    const qualityScore = health.qualityScore * 20;
    
    return Math.min(100, availabilityScore + latencyScore + errorScore + qualityScore);
  }

  private calculateThroughput(avgLatency: number): number {
    if (avgLatency === 0) return 0;
    return Math.round(60000 / avgLatency); // requests per minute
  }

  private analyzeTrend(trend: any): 'increasing' | 'decreasing' | 'stable' {
    if (typeof trend === 'string') {
      // Convert from old naming to new naming
      if (trend === 'improving') return 'increasing';
      if (trend === 'degrading') return 'decreasing';
      return trend as any;
    }
    if (trend > 0.1) return 'increasing';
    if (trend < -0.1) return 'decreasing';
    return 'stable';
  }

  private mapTrendToExpected(trend: 'increasing' | 'decreasing' | 'stable'): 'improving' | 'degrading' | 'stable' {
    if (trend === 'increasing') return 'improving';
    if (trend === 'decreasing') return 'degrading';
    return 'stable';
  }

  private getProviderFromModel(modelName: string): string {
    if (modelName.includes('claude')) return 'anthropic';
    if (modelName.includes('gpt') || modelName.includes('openai')) return 'openai';
    if (modelName.includes('gemini')) return 'google';
    if (modelName.includes('mistral')) return 'mistral';
    if (modelName.includes('llama') || modelName.includes('ollama')) return 'ollama';
    return 'unknown';
  }

  private async getMonitoredModels(): Promise<string[]> {
    // This would typically come from configuration or discovery
    return [
      'claude-sonnet-4',
      'claude-haiku-3',
      'gpt-4-turbo',
      'gpt-4o',
      'gemini-2.5-pro',
      'mistral-large-2407',
      'deepseek-v3',
      'llama-3.3-70b'
    ];
  }

  private identifyFailureIndicators(health: ModelHealthMetrics): string[] {
    const indicators: string[] = [];
    
    if (health.availability < 0.95) indicators.push('Low availability');
    if (health.errorRate > 0.02) indicators.push('High error rate');
    if (health.avgLatency > 5000) indicators.push('High latency');
    if (health.trends.latency === 'degrading') indicators.push('Degrading latency trend');
    if (health.trends.quality === 'degrading') indicators.push('Degrading quality');
    if (health.trends.cost === 'degrading') indicators.push('Rising costs');
    
    return indicators;
  }

  private estimateTimeToFailure(probability: number): number {
    // Simple estimation based on probability
    return Math.max(5, Math.round((1 - probability) * 60)); // minutes
  }

  private generateRecommendations(health: ModelHealthMetrics, indicators: string[]): string[] {
    const recommendations: string[] = [];
    
    if (indicators.includes('Low availability')) {
      recommendations.push('Switch to backup model');
    }
    if (indicators.includes('High error rate')) {
      recommendations.push('Implement circuit breaker');
    }
    if (indicators.includes('High latency')) {
      recommendations.push('Reduce request complexity');
    }
    if (indicators.includes('Rising costs')) {
      recommendations.push('Consider alternative model');
    }
    
    recommendations.push('Monitor closely');
    return recommendations;
  }

  private calculateSeverity(probability: number): PredictiveAlert['severity'] {
    if (probability >= 0.9) return 'critical';
    if (probability >= 0.7) return 'high';
    if (probability >= 0.5) return 'medium';
    return 'low';
  }

  private scoreModelForTask(health: ModelHealthMetrics, taskType: string, requirements: any): number {
    let score = this.calculateHealthScore(health);
    
    // Task-specific scoring adjustments
    if (taskType === 'security' && health.modelName.includes('claude')) score += 10;
    if (taskType === 'coding' && health.modelName.includes('deepseek')) score += 10;
    if (taskType === 'creative' && health.modelName.includes('gpt')) score += 5;
    
    // Requirements-based adjustments
    if (requirements?.lowLatency && health.avgLatency < 2000) score += 5;
    if (requirements?.highQuality && health.qualityScore > 0.9) score += 5;
    if (requirements?.costOptimized && health.costPerToken < 0.001) score += 5;
    
    return Math.min(100, score);
  }

  private generateRecommendationReason(modelName: string, taskType: string): string {
    return `${modelName} recommended for ${taskType} based on current health metrics, availability, and task-specific performance indicators.`;
  }

  private async attemptRecovery(modelName: string): Promise<void> {
    Logger.info(`Attempting recovery for ${modelName}`);
    
    // Simple recovery attempt - in production this would be more sophisticated
    try {
      await this.availabilityChecker.checkAvailability(modelName);
      Logger.info(`Recovery successful for ${modelName}`);
    } catch (error) {
      Logger.error(`Recovery failed for ${modelName}:`, error);
    }
  }
}

// Export singleton instance
export const modelHealthMonitor = new ModelHealthMonitor();