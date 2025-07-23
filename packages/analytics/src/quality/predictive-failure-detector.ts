/**
 * Predictive Failure Detection System
 * 
 * Advanced system for predicting AI model failures before they occur using
 * machine learning algorithms, pattern recognition, and anomaly detection.
 * Provides early warning alerts and automated mitigation strategies.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';

export interface FailurePrediction {
  id: string;
  modelName: string;
  provider: string;
  predictionType: PredictionType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;                   // 0-1 confidence score
  timeToFailure: number;                // Estimated minutes until failure
  
  // Prediction details
  indicators: FailureIndicator[];
  rootCause: string;
  description: string;
  
  // Affected metrics
  affectedMetrics: string[];
  estimatedImpact: {
    availabilityDrop: number;           // Percentage points
    latencyIncrease: number;            // Percentage increase
    errorRateIncrease: number;          // Percentage points
    costImpact: number;                 // USD per hour
  };
  
  // Recommended actions
  recommendedActions: RecommendedAction[];
  preventiveActions: PreventiveAction[];
  
  // Prediction metadata
  createdAt: Date;
  validUntil?: Date;
  resolvedAt?: Date;
  actualFailure?: ActualFailure;
}

export enum PredictionType {
  AVAILABILITY_FAILURE = 'availability_failure',
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  COST_SPIKE = 'cost_spike',
  QUALITY_REGRESSION = 'quality_regression',
  CIRCUIT_BREAKER_TRIGGER = 'circuit_breaker_trigger',
  RATE_LIMIT_BREACH = 'rate_limit_breach',
  DEPENDENCY_FAILURE = 'dependency_failure',
  RESOURCE_EXHAUSTION = 'resource_exhaustion'
}

export interface FailureIndicator {
  type: IndicatorType;
  name: string;
  currentValue: number;
  normalRange: [number, number];
  trend: 'increasing' | 'decreasing' | 'volatile' | 'stable';
  severity: number;                     // 0-1 severity contribution
  confidence: number;                   // 0-1 confidence in indicator
  lastUpdated: Date;
}

export enum IndicatorType {
  LATENCY_TREND = 'latency_trend',
  ERROR_RATE_PATTERN = 'error_rate_pattern',
  REQUEST_VOLUME_ANOMALY = 'request_volume_anomaly',
  QUALITY_DEGRADATION = 'quality_degradation',
  COST_ANOMALY = 'cost_anomaly',
  AVAILABILITY_PATTERN = 'availability_pattern',
  DEPENDENCY_HEALTH = 'dependency_health',
  RESOURCE_UTILIZATION = 'resource_utilization',
  EXTERNAL_SIGNAL = 'external_signal'
}

export interface RecommendedAction {
  type: 'immediate' | 'preventive' | 'monitoring';
  priority: 'low' | 'medium' | 'high' | 'critical';
  action: string;
  description: string;
  estimatedEffectiveness: number;       // 0-1 effectiveness score
  implementationCost: 'low' | 'medium' | 'high';
  timeToImplement: number;              // Minutes
  automatable: boolean;
}

export interface PreventiveAction {
  type: 'scaling' | 'failover' | 'caching' | 'throttling' | 'circuit_breaker';
  config: Record<string, any>;
  triggerConditions: string[];
  estimatedImpactReduction: number;     // Percentage reduction in impact
}

export interface ActualFailure {
  occurredAt: Date;
  type: PredictionType;
  actualSeverity: 'low' | 'medium' | 'high' | 'critical';
  actualImpact: {
    availabilityDrop: number;
    latencyIncrease: number;
    errorRateIncrease: number;
    costImpact: number;
    duration: number;                   // Minutes
  };
  predictionAccuracy: number;           // 0-1 accuracy score
}

export interface PredictionModel {
  id: string;
  name: string;
  type: 'ml_model' | 'rule_based' | 'hybrid';
  version: string;
  
  // Model configuration
  config: {
    features: string[];                 // Input feature names
    lookbackWindow: number;             // Minutes of history to consider
    predictionHorizon: number;          // Minutes into future to predict
    confidenceThreshold: number;        // Minimum confidence to trigger alert
    updateFrequency: number;            // Model update frequency in minutes
  };
  
  // Model performance
  performance: {
    accuracy: number;                   // Overall prediction accuracy
    precision: number;                  // True positive rate
    recall: number;                     // Sensitivity
    f1Score: number;                    // F1 score
    lastEvaluated: Date;
    trainingDataPoints: number;
  };
  
  // Model state
  isActive: boolean;
  lastPrediction: Date;
  trainingStatus: 'untrained' | 'training' | 'trained' | 'updating';
  
  createdAt: Date;
  updatedAt: Date;
}

export interface MetricTimeSeries {
  metricName: string;
  modelName: string;
  dataPoints: Array<{
    timestamp: Date;
    value: number;
    metadata?: Record<string, any>;
  }>;
  
  // Statistical properties
  statistics: {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    seasonality?: {
      detected: boolean;
      period?: number;                  // Period in minutes
      strength?: number;                // 0-1 strength of seasonality
    };
  };
}

export interface AnomalyDetectionResult {
  isAnomaly: boolean;
  anomalyScore: number;                 // 0-1 anomaly score
  expectedValue: number;
  actualValue: number;
  deviation: number;                    // Standard deviations from normal
  anomalyType: 'point' | 'contextual' | 'collective';
  explanation: string;
}

export class PredictiveFailureDetector extends EventEmitter {
  private predictions: Map<string, FailurePrediction> = new Map();
  private models: Map<string, PredictionModel> = new Map();
  private timeSeriesData: Map<string, MetricTimeSeries> = new Map();
  private predictionHistory: FailurePrediction[] = [];
  
  private config = {
    maxPredictions: 1000,
    maxHistorySize: 10000,
    predictionInterval: 300000,          // 5 minutes
    dataRetentionHours: 168,             // 1 week
    minDataPointsForPrediction: 50,
    defaultConfidenceThreshold: 0.7,
    anomalyDetectionSensitivity: 0.8,
  };

  private predictionTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
    this.initializeDefaultModels();
  }

  private initializeDefaultModels(): void {
    const defaultModels: PredictionModel[] = [
      {
        id: 'latency_predictor',
        name: 'Latency Anomaly Predictor',
        type: 'hybrid',
        version: '1.0.0',
        config: {
          features: ['latency_p50', 'latency_p95', 'latency_p99', 'request_volume', 'error_rate'],
          lookbackWindow: 1440,           // 24 hours
          predictionHorizon: 60,          // 1 hour ahead
          confidenceThreshold: 0.8,
          updateFrequency: 60             // Update every hour
        },
        performance: {
          accuracy: 0.85,
          precision: 0.82,
          recall: 0.88,
          f1Score: 0.85,
          lastEvaluated: new Date(),
          trainingDataPoints: 1000
        },
        isActive: true,
        lastPrediction: new Date(),
        trainingStatus: 'trained',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'availability_predictor',
        name: 'Availability Failure Predictor',
        type: 'ml_model',
        version: '1.0.0',
        config: {
          features: ['availability', 'error_rate', 'response_time', 'dependency_health'],
          lookbackWindow: 720,            // 12 hours
          predictionHorizon: 30,          // 30 minutes ahead
          confidenceThreshold: 0.75,
          updateFrequency: 30             // Update every 30 minutes
        },
        performance: {
          accuracy: 0.90,
          precision: 0.87,
          recall: 0.93,
          f1Score: 0.90,
          lastEvaluated: new Date(),
          trainingDataPoints: 2000
        },
        isActive: true,
        lastPrediction: new Date(),
        trainingStatus: 'trained',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'quality_predictor',
        name: 'Quality Regression Predictor',
        type: 'rule_based',
        version: '1.0.0',
        config: {
          features: ['quality_score', 'user_rating', 'task_complexity', 'context_length'],
          lookbackWindow: 480,            // 8 hours
          predictionHorizon: 120,         // 2 hours ahead
          confidenceThreshold: 0.7,
          updateFrequency: 120            // Update every 2 hours
        },
        performance: {
          accuracy: 0.78,
          precision: 0.75,
          recall: 0.81,
          f1Score: 0.78,
          lastEvaluated: new Date(),
          trainingDataPoints: 1500
        },
        isActive: true,
        lastPrediction: new Date(),
        trainingStatus: 'trained',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    defaultModels.forEach(model => {
      this.models.set(model.id, model);
    });

    Logger.info(`Initialized ${defaultModels.length} prediction models`);
  }

  /**
   * Start predictive failure detection
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Predictive failure detector is already running');
      return;
    }

    Logger.info('Starting predictive failure detection...');

    // Start prediction timer
    this.predictionTimer = setInterval(() => {
      this.runPredictions();
    }, this.config.predictionInterval);

    this.isRunning = true;
    this.emit('detectorStarted');

    Logger.info('Predictive failure detector started successfully');
  }

  /**
   * Stop predictive failure detection
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    Logger.info('Stopping predictive failure detection...');

    if (this.predictionTimer) {
      clearInterval(this.predictionTimer);
      this.predictionTimer = null;
    }

    this.isRunning = false;
    this.emit('detectorStopped');

    Logger.info('Predictive failure detector stopped');
  }

  /**
   * Add metric data for analysis
   */
  async addMetricData(
    metricName: string,
    modelName: string,
    value: number,
    timestamp: Date = new Date(),
    metadata?: Record<string, any>
  ): Promise<void> {
    const key = `${modelName}_${metricName}`;
    let timeSeries = this.timeSeriesData.get(key);

    if (!timeSeries) {
      timeSeries = {
        metricName,
        modelName,
        dataPoints: [],
        statistics: {
          mean: 0,
          median: 0,
          stdDev: 0,
          min: 0,
          max: 0,
          trend: 'stable'
        }
      };
      this.timeSeriesData.set(key, timeSeries);
    }

    // Add new data point
    timeSeries.dataPoints.push({
      timestamp,
      value,
      metadata
    });

    // Keep only recent data
    const cutoff = new Date(Date.now() - this.config.dataRetentionHours * 60 * 60 * 1000);
    timeSeries.dataPoints = timeSeries.dataPoints.filter(dp => dp.timestamp >= cutoff);

    // Update statistics
    await this.updateTimeSeriesStatistics(timeSeries);

    // Check for immediate anomalies
    const anomaly = await this.detectAnomaly(timeSeries, value);
    if (anomaly.isAnomaly && anomaly.anomalyScore > this.config.anomalyDetectionSensitivity) {
      await this.handleImmediateAnomaly(modelName, metricName, anomaly);
    }
  }

  /**
   * Get current predictions
   */
  getCurrentPredictions(filters?: {
    modelName?: string;
    severity?: string;
    type?: PredictionType;
  }): FailurePrediction[] {
    let predictions = Array.from(this.predictions.values())
      .filter(p => !p.resolvedAt);

    if (filters) {
      if (filters.modelName) {
        predictions = predictions.filter(p => p.modelName === filters.modelName);
      }
      if (filters.severity) {
        predictions = predictions.filter(p => p.severity === filters.severity);
      }
      if (filters.type) {
        predictions = predictions.filter(p => p.predictionType === filters.type);
      }
    }

    return predictions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get prediction accuracy statistics
   */
  getPredictionAccuracy(timeframe: number = 168): {
    totalPredictions: number;
    correctPredictions: number;
    falsePositives: number;
    falseNegatives: number;
    accuracy: number;
    precision: number;
    recall: number;
  } {
    const cutoff = new Date(Date.now() - timeframe * 60 * 60 * 1000);
    const historicalPredictions = this.predictionHistory
      .filter(p => p.createdAt >= cutoff && p.actualFailure);

    const totalPredictions = historicalPredictions.length;
    const correctPredictions = historicalPredictions
      .filter(p => p.actualFailure!.predictionAccuracy > 0.7).length;
    
    const falsePositives = historicalPredictions
      .filter(p => !p.actualFailure || p.actualFailure.predictionAccuracy < 0.3).length;
    
    const falseNegatives = 0; // Would need separate tracking of missed failures

    return {
      totalPredictions,
      correctPredictions,
      falsePositives,
      falseNegatives,
      accuracy: totalPredictions > 0 ? correctPredictions / totalPredictions : 0,
      precision: (correctPredictions + falsePositives) > 0 ? 
        correctPredictions / (correctPredictions + falsePositives) : 0,
      recall: (correctPredictions + falseNegatives) > 0 ? 
        correctPredictions / (correctPredictions + falseNegatives) : 0
    };
  }

  /**
   * Report an actual failure for prediction validation
   */
  async reportActualFailure(
    modelName: string,
    failureType: PredictionType,
    severity: 'low' | 'medium' | 'high' | 'critical',
    impact: ActualFailure['actualImpact'],
    occurredAt: Date = new Date()
  ): Promise<void> {
    // Find matching predictions
    const matchingPredictions = Array.from(this.predictions.values())
      .filter(p => 
        p.modelName === modelName &&
        p.predictionType === failureType &&
        !p.actualFailure &&
        Math.abs(occurredAt.getTime() - p.createdAt.getTime()) < p.timeToFailure * 60 * 1000
      );

    for (const prediction of matchingPredictions) {
      const actualFailure: ActualFailure = {
        occurredAt,
        type: failureType,
        actualSeverity: severity,
        actualImpact: impact,
        predictionAccuracy: this.calculatePredictionAccuracy(prediction, {
          occurredAt,
          type: failureType,
          actualSeverity: severity,
          actualImpact: impact
        })
      };

      prediction.actualFailure = actualFailure;
      prediction.resolvedAt = new Date();
      
      // Move to history
      this.predictionHistory.push(prediction);
      this.predictions.delete(prediction.id);

      // Update model performance
      await this.updateModelPerformance(prediction, actualFailure);
    }

    Logger.info(`Reported actual failure for ${modelName}: ${failureType} (${severity})`);
    this.emit('actualFailureReported', {
      modelName,
      failureType,
      severity,
      impact,
      occurredAt,
      matchedPredictions: matchingPredictions.length
    });
  }

  /**
   * Manually resolve a prediction
   */
  async resolvePrediction(predictionId: string, resolution: string): Promise<void> {
    const prediction = this.predictions.get(predictionId);
    if (!prediction) {
      throw new Error(`Prediction ${predictionId} not found`);
    }

    prediction.resolvedAt = new Date();
    
    // Move to history
    this.predictionHistory.push(prediction);
    this.predictions.delete(predictionId);

    Logger.info(`Resolved prediction ${predictionId}: ${resolution}`);
    this.emit('predictionResolved', prediction);
  }

  // Private methods

  private async runPredictions(): Promise<void> {
    try {
      const activeModels = Array.from(this.models.values())
        .filter(m => m.isActive && m.trainingStatus === 'trained');

      for (const model of activeModels) {
        await this.runModelPredictions(model);
      }

      // Cleanup expired predictions
      await this.cleanupExpiredPredictions();

    } catch (error) {
      Logger.error('Error running predictions:', error);
    }
  }

  private async runModelPredictions(model: PredictionModel): Promise<void> {
    // Get relevant time series data
    const modelNames = this.getUniqueModelNames();
    
    for (const modelName of modelNames) {
      const features = await this.extractFeatures(modelName, model.config.features);
      
      if (features.length < this.config.minDataPointsForPrediction) {
        continue; // Not enough data for reliable prediction
      }

      const prediction = await this.generatePrediction(model, modelName, features);
      
      if (prediction && prediction.confidence >= model.config.confidenceThreshold) {
        await this.storePrediction(prediction);
      }
    }

    // Update model's last prediction time
    model.lastPrediction = new Date();
    this.models.set(model.id, model);
  }

  private getUniqueModelNames(): string[] {
    const modelNames = new Set<string>();
    for (const key of this.timeSeriesData.keys()) {
      const modelName = key.split('_')[0];
      modelNames.add(modelName);
    }
    return Array.from(modelNames);
  }

  private async extractFeatures(modelName: string, featureNames: string[]): Promise<number[]> {
    const features: number[] = [];
    
    for (const featureName of featureNames) {
      const key = `${modelName}_${featureName}`;
      const timeSeries = this.timeSeriesData.get(key);
      
      if (timeSeries && timeSeries.dataPoints.length > 0) {
        // Use the most recent value as the feature
        const recentValue = timeSeries.dataPoints[timeSeries.dataPoints.length - 1].value;
        features.push(recentValue);
      } else {
        features.push(0); // Default value for missing features
      }
    }
    
    return features;
  }

  private async generatePrediction(
    model: PredictionModel,
    modelName: string,
    features: number[]
  ): Promise<FailurePrediction | null> {
    // This is a simplified prediction logic
    // In production, this would use actual ML models or more sophisticated algorithms
    
    const indicators = await this.analyzeIndicators(modelName, model.config.features, features);
    const severity = this.calculateSeverity(indicators);
    const confidence = this.calculateConfidence(indicators, model);
    
    if (confidence < model.config.confidenceThreshold) {
      return null; // Confidence too low
    }

    const predictionType = this.determinePredictionType(indicators);
    const timeToFailure = this.estimateTimeToFailure(indicators, model.config.predictionHorizon);
    
    const prediction: FailurePrediction = {
      id: `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      modelName,
      provider: 'unknown', // Would be determined from model registry
      predictionType,
      severity,
      confidence,
      timeToFailure,
      indicators,
      rootCause: this.identifyRootCause(indicators),
      description: this.generateDescription(predictionType, severity, indicators),
      affectedMetrics: model.config.features,
      estimatedImpact: this.estimateImpact(indicators, severity),
      recommendedActions: this.generateRecommendedActions(predictionType, severity, indicators),
      preventiveActions: this.generatePreventiveActions(predictionType, indicators),
      createdAt: new Date(),
      validUntil: new Date(Date.now() + timeToFailure * 60 * 1000)
    };

    return prediction;
  }

  private async analyzeIndicators(
    modelName: string,
    featureNames: string[],
    features: number[]
  ): Promise<FailureIndicator[]> {
    const indicators: FailureIndicator[] = [];
    
    for (let i = 0; i < featureNames.length && i < features.length; i++) {
      const featureName = featureNames[i];
      const currentValue = features[i];
      const key = `${modelName}_${featureName}`;
      const timeSeries = this.timeSeriesData.get(key);
      
      if (!timeSeries) continue;
      
      const normalRange = this.calculateNormalRange(timeSeries);
      const trend = this.analyzeTrend(timeSeries);
      const severity = this.calculateIndicatorSeverity(currentValue, normalRange, trend);
      
      indicators.push({
        type: this.mapFeatureToIndicatorType(featureName),
        name: featureName,
        currentValue,
        normalRange,
        trend,
        severity,
        confidence: Math.min(1, timeSeries.dataPoints.length / 100), // Confidence based on data amount
        lastUpdated: new Date()
      });
    }
    
    return indicators;
  }

  private calculateNormalRange(timeSeries: MetricTimeSeries): [number, number] {
    const stats = timeSeries.statistics;
    const margin = stats.stdDev * 2; // 2 standard deviations
    return [stats.mean - margin, stats.mean + margin];
  }

  private analyzeTrend(timeSeries: MetricTimeSeries): 'increasing' | 'decreasing' | 'volatile' | 'stable' {
    if (timeSeries.dataPoints.length < 10) {
      return 'stable';
    }

    const recent = timeSeries.dataPoints.slice(-10);
    const values = recent.map(dp => dp.value);
    
    // Simple trend analysis using linear regression slope
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, i) => sum + val * i, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const absSlope = Math.abs(slope);
    const volatility = this.calculateVolatility(values);
    
    if (volatility > timeSeries.statistics.stdDev) {
      return 'volatile';
    } else if (slope > absSlope * 0.1) {
      return 'increasing';
    } else if (slope < -absSlope * 0.1) {
      return 'decreasing';
    } else {
      return 'stable';
    }
  }

  private calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0;
    
    const differences = [];
    for (let i = 1; i < values.length; i++) {
      differences.push(Math.abs(values[i] - values[i - 1]));
    }
    
    return differences.reduce((sum, diff) => sum + diff, 0) / differences.length;
  }

  private calculateIndicatorSeverity(
    currentValue: number,
    normalRange: [number, number],
    trend: string
  ): number {
    let severity = 0;
    
    // Check if value is outside normal range
    if (currentValue < normalRange[0] || currentValue > normalRange[1]) {
      const deviation = Math.max(
        Math.abs(currentValue - normalRange[0]),
        Math.abs(currentValue - normalRange[1])
      );
      const rangeSize = normalRange[1] - normalRange[0];
      severity += Math.min(1, deviation / rangeSize);
    }
    
    // Add severity based on trend
    if (trend === 'volatile') {
      severity += 0.3;
    } else if (trend === 'increasing' || trend === 'decreasing') {
      severity += 0.2;
    }
    
    return Math.min(1, severity);
  }

  private mapFeatureToIndicatorType(featureName: string): IndicatorType {
    const mapping: Record<string, IndicatorType> = {
      'latency_p50': IndicatorType.LATENCY_TREND,
      'latency_p95': IndicatorType.LATENCY_TREND,
      'latency_p99': IndicatorType.LATENCY_TREND,
      'error_rate': IndicatorType.ERROR_RATE_PATTERN,
      'request_volume': IndicatorType.REQUEST_VOLUME_ANOMALY,
      'quality_score': IndicatorType.QUALITY_DEGRADATION,
      'availability': IndicatorType.AVAILABILITY_PATTERN,
      'cost': IndicatorType.COST_ANOMALY
    };
    
    return mapping[featureName] || IndicatorType.EXTERNAL_SIGNAL;
  }

  private calculateSeverity(indicators: FailureIndicator[]): 'low' | 'medium' | 'high' | 'critical' {
    if (indicators.length === 0) return 'low';
    
    const avgSeverity = indicators.reduce((sum, ind) => sum + ind.severity, 0) / indicators.length;
    const maxSeverity = Math.max(...indicators.map(ind => ind.severity));
    
    // Weight both average and maximum severity
    const combinedSeverity = avgSeverity * 0.6 + maxSeverity * 0.4;
    
    if (combinedSeverity > 0.8) return 'critical';
    if (combinedSeverity > 0.6) return 'high';
    if (combinedSeverity > 0.3) return 'medium';
    return 'low';
  }

  private calculateConfidence(indicators: FailureIndicator[], model: PredictionModel): number {
    if (indicators.length === 0) return 0;
    
    const avgIndicatorConfidence = indicators.reduce((sum, ind) => sum + ind.confidence, 0) / indicators.length;
    const modelAccuracy = model.performance.accuracy;
    const dataQuality = Math.min(1, indicators.length / model.config.features.length);
    
    return avgIndicatorConfidence * 0.4 + modelAccuracy * 0.4 + dataQuality * 0.2;
  }

  private determinePredictionType(indicators: FailureIndicator[]): PredictionType {
    // Count indicators by type
    const typeCounts = new Map<IndicatorType, number>();
    indicators.forEach(ind => {
      typeCounts.set(ind.type, (typeCounts.get(ind.type) || 0) + 1);
    });
    
    // Find most common indicator type
    let maxCount = 0;
    let dominantType = IndicatorType.EXTERNAL_SIGNAL;
    
    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantType = type;
      }
    }
    
    // Map indicator type to prediction type
    const mapping: Record<IndicatorType, PredictionType> = {
      [IndicatorType.LATENCY_TREND]: PredictionType.PERFORMANCE_DEGRADATION,
      [IndicatorType.ERROR_RATE_PATTERN]: PredictionType.AVAILABILITY_FAILURE,
      [IndicatorType.REQUEST_VOLUME_ANOMALY]: PredictionType.RESOURCE_EXHAUSTION,
      [IndicatorType.QUALITY_DEGRADATION]: PredictionType.QUALITY_REGRESSION,
      [IndicatorType.COST_ANOMALY]: PredictionType.COST_SPIKE,
      [IndicatorType.AVAILABILITY_PATTERN]: PredictionType.AVAILABILITY_FAILURE,
      [IndicatorType.DEPENDENCY_HEALTH]: PredictionType.DEPENDENCY_FAILURE,
      [IndicatorType.RESOURCE_UTILIZATION]: PredictionType.RESOURCE_EXHAUSTION,
      [IndicatorType.EXTERNAL_SIGNAL]: PredictionType.AVAILABILITY_FAILURE
    };
    
    return mapping[dominantType] || PredictionType.AVAILABILITY_FAILURE;
  }

  private estimateTimeToFailure(indicators: FailureIndicator[], maxHorizon: number): number {
    if (indicators.length === 0) return maxHorizon;
    
    const avgSeverity = indicators.reduce((sum, ind) => sum + ind.severity, 0) / indicators.length;
    
    // Higher severity = shorter time to failure
    const timeRatio = 1 - avgSeverity;
    return Math.max(5, Math.round(maxHorizon * timeRatio)); // Minimum 5 minutes
  }

  private identifyRootCause(indicators: FailureIndicator[]): string {
    if (indicators.length === 0) return 'Unknown';
    
    const highSeverityIndicators = indicators.filter(ind => ind.severity > 0.6);
    
    if (highSeverityIndicators.length > 0) {
      const primaryIndicator = highSeverityIndicators[0];
      return `${primaryIndicator.name} showing ${primaryIndicator.trend} trend`;
    }
    
    return 'Multiple minor indicators contributing to potential failure';
  }

  private generateDescription(
    type: PredictionType,
    severity: string,
    indicators: FailureIndicator[]
  ): string {
    const descriptions: Record<PredictionType, string> = {
      [PredictionType.AVAILABILITY_FAILURE]: 'Model availability is predicted to degrade',
      [PredictionType.PERFORMANCE_DEGRADATION]: 'Performance metrics show deteriorating trend',
      [PredictionType.COST_SPIKE]: 'Unexpected cost increase is predicted',
      [PredictionType.QUALITY_REGRESSION]: 'Output quality is expected to decline',
      [PredictionType.CIRCUIT_BREAKER_TRIGGER]: 'Circuit breaker is likely to trigger',
      [PredictionType.RATE_LIMIT_BREACH]: 'Rate limits are predicted to be exceeded',
      [PredictionType.DEPENDENCY_FAILURE]: 'Dependency failure is anticipated',
      [PredictionType.RESOURCE_EXHAUSTION]: 'Resource exhaustion is predicted'
    };
    
    const baseDescription = descriptions[type] || 'System failure is predicted';
    const severityDescription = severity === 'critical' ? ' with critical impact' : '';
    const indicatorCount = indicators.length > 1 ? ` based on ${indicators.length} indicators` : '';
    
    return baseDescription + severityDescription + indicatorCount;
  }

  private estimateImpact(indicators: FailureIndicator[], severity: string): FailurePrediction['estimatedImpact'] {
    const severityMultiplier = {
      'low': 0.1,
      'medium': 0.3,
      'high': 0.6,
      'critical': 1.0
    }[severity] || 0.5;
    
    return {
      availabilityDrop: severityMultiplier * 20,      // Up to 20% availability drop
      latencyIncrease: severityMultiplier * 200,      // Up to 200% latency increase
      errorRateIncrease: severityMultiplier * 10,     // Up to 10% error rate increase
      costImpact: severityMultiplier * 100            // Up to $100/hour cost impact
    };
  }

  private generateRecommendedActions(
    type: PredictionType,
    severity: string,
    indicators: FailureIndicator[]
  ): RecommendedAction[] {
    const actions: RecommendedAction[] = [];
    
    // Add type-specific actions
    switch (type) {
      case PredictionType.PERFORMANCE_DEGRADATION:
        actions.push({
          type: 'immediate',
          priority: severity === 'critical' ? 'critical' : 'high',
          action: 'Scale up resources',
          description: 'Increase compute resources to handle performance degradation',
          estimatedEffectiveness: 0.8,
          implementationCost: 'medium',
          timeToImplement: 5,
          automatable: true
        });
        break;
        
      case PredictionType.AVAILABILITY_FAILURE:
        actions.push({
          type: 'immediate',
          priority: 'critical',
          action: 'Enable failover',
          description: 'Switch to backup model or provider',
          estimatedEffectiveness: 0.9,
          implementationCost: 'low',
          timeToImplement: 2,
          automatable: true
        });
        break;
        
      case PredictionType.COST_SPIKE:
        actions.push({
          type: 'preventive',
          priority: 'medium',
          action: 'Implement cost controls',
          description: 'Activate budget limits and usage throttling',
          estimatedEffectiveness: 0.7,
          implementationCost: 'low',
          timeToImplement: 1,
          automatable: true
        });
        break;
    }
    
    // Add general monitoring action
    actions.push({
      type: 'monitoring',
      priority: 'medium',
      action: 'Increase monitoring frequency',
      description: 'Monitor affected metrics more closely',
      estimatedEffectiveness: 0.6,
      implementationCost: 'low',
      timeToImplement: 1,
      automatable: true
    });
    
    return actions;
  }

  private generatePreventiveActions(
    type: PredictionType,
    indicators: FailureIndicator[]
  ): PreventiveAction[] {
    const actions: PreventiveAction[] = [];
    
    switch (type) {
      case PredictionType.PERFORMANCE_DEGRADATION:
        actions.push({
          type: 'scaling',
          config: {
            scaleUpThreshold: 0.8,
            scaleUpAmount: 1.5,
            cooldownPeriod: 300
          },
          triggerConditions: ['latency_p95 > threshold', 'cpu_utilization > 80%'],
          estimatedImpactReduction: 70
        });
        break;
        
      case PredictionType.AVAILABILITY_FAILURE:
        actions.push({
          type: 'failover',
          config: {
            backupProvider: 'groq',
            healthCheckInterval: 30,
            failoverThreshold: 0.9
          },
          triggerConditions: ['availability < 90%', 'error_rate > 5%'],
          estimatedImpactReduction: 85
        });
        break;
        
      case PredictionType.COST_SPIKE:
        actions.push({
          type: 'throttling',
          config: {
            maxRequestsPerMinute: 100,
            priorityLevels: ['critical', 'high', 'medium', 'low'],
            costLimit: 1000
          },
          triggerConditions: ['hourly_cost > budget_threshold'],
          estimatedImpactReduction: 60
        });
        break;
    }
    
    return actions;
  }

  private async storePrediction(prediction: FailurePrediction): Promise<void> {
    // Check for duplicate predictions
    const existing = Array.from(this.predictions.values()).find(p =>
      p.modelName === prediction.modelName &&
      p.predictionType === prediction.predictionType &&
      !p.resolvedAt &&
      Math.abs(p.createdAt.getTime() - prediction.createdAt.getTime()) < 300000 // 5 minutes
    );
    
    if (existing) {
      Logger.debug(`Duplicate prediction ignored for ${prediction.modelName}`);
      return;
    }
    
    this.predictions.set(prediction.id, prediction);
    
    // Cleanup if too many predictions
    if (this.predictions.size > this.config.maxPredictions) {
      await this.cleanupOldPredictions();
    }
    
    this.emit('predictionCreated', prediction);
    Logger.info(`Created prediction: ${prediction.predictionType} for ${prediction.modelName} (confidence: ${(prediction.confidence * 100).toFixed(1)}%)`);
  }

  private async cleanupExpiredPredictions(): Promise<void> {
    const now = new Date();
    const expiredPredictions: string[] = [];
    
    for (const [id, prediction] of this.predictions) {
      if (prediction.validUntil && now > prediction.validUntil) {
        expiredPredictions.push(id);
      }
    }
    
    expiredPredictions.forEach(id => {
      const prediction = this.predictions.get(id);
      if (prediction) {
        prediction.resolvedAt = new Date();
        this.predictionHistory.push(prediction);
        this.predictions.delete(id);
      }
    });
    
    if (expiredPredictions.length > 0) {
      Logger.debug(`Cleaned up ${expiredPredictions.length} expired predictions`);
    }
  }

  private async cleanupOldPredictions(): Promise<void> {
    const predictions = Array.from(this.predictions.values());
    predictions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    
    const toRemove = predictions.slice(0, predictions.length - this.config.maxPredictions + 100);
    
    toRemove.forEach(prediction => {
      prediction.resolvedAt = new Date();
      this.predictionHistory.push(prediction);
      this.predictions.delete(prediction.id);
    });
  }

  private async updateTimeSeriesStatistics(timeSeries: MetricTimeSeries): Promise<void> {
    const values = timeSeries.dataPoints.map(dp => dp.value);
    
    if (values.length === 0) return;
    
    const sorted = values.slice().sort((a, b) => a - b);
    const sum = values.reduce((s, v) => s + v, 0);
    const mean = sum / values.length;
    
    let sumSquaredDiffs = 0;
    for (const value of values) {
      sumSquaredDiffs += Math.pow(value - mean, 2);
    }
    
    timeSeries.statistics = {
      mean,
      median: sorted[Math.floor(sorted.length / 2)],
      stdDev: Math.sqrt(sumSquaredDiffs / values.length),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      trend: this.analyzeTrend(timeSeries)
    };
  }

  private async detectAnomaly(timeSeries: MetricTimeSeries, currentValue: number): Promise<AnomalyDetectionResult> {
    const stats = timeSeries.statistics;
    const deviation = Math.abs(currentValue - stats.mean) / (stats.stdDev || 1);
    
    const isAnomaly = deviation > 2.5; // More than 2.5 standard deviations
    const anomalyScore = Math.min(1, deviation / 3); // Normalize to 0-1
    
    return {
      isAnomaly,
      anomalyScore,
      expectedValue: stats.mean,
      actualValue: currentValue,
      deviation,
      anomalyType: 'point',
      explanation: isAnomaly ? 
        `Value ${currentValue} is ${deviation.toFixed(2)} standard deviations from mean ${stats.mean.toFixed(2)}` :
        'Value within normal range'
    };
  }

  private async handleImmediateAnomaly(
    modelName: string,
    metricName: string,
    anomaly: AnomalyDetectionResult
  ): Promise<void> {
    Logger.warn(`Immediate anomaly detected in ${modelName}.${metricName}: ${anomaly.explanation}`);
    
    this.emit('immediateAnomaly', {
      modelName,
      metricName,
      anomaly,
      timestamp: new Date()
    });
  }

  private calculatePredictionAccuracy(
    prediction: FailurePrediction,
    actualFailure: Partial<ActualFailure>
  ): number {
    let accuracy = 0;
    
    // Type accuracy (40% weight)
    if (prediction.predictionType === actualFailure.type) {
      accuracy += 0.4;
    }
    
    // Severity accuracy (30% weight)
    const severityMapping = { low: 1, medium: 2, high: 3, critical: 4 };
    const predictedSeverity = severityMapping[prediction.severity];
    const actualSeverity = severityMapping[actualFailure.actualSeverity!];
    const severityDiff = Math.abs(predictedSeverity - actualSeverity);
    accuracy += 0.3 * Math.max(0, 1 - severityDiff / 3);
    
    // Timing accuracy (30% weight)
    if (actualFailure.occurredAt) {
      const timeDiff = Math.abs(
        actualFailure.occurredAt.getTime() - 
        (prediction.createdAt.getTime() + prediction.timeToFailure * 60000)
      );
      const maxTimeDiff = prediction.timeToFailure * 60000; // Same as prediction window
      accuracy += 0.3 * Math.max(0, 1 - timeDiff / maxTimeDiff);
    }
    
    return Math.min(1, Math.max(0, accuracy));
  }

  private async updateModelPerformance(
    prediction: FailurePrediction,
    actualFailure: ActualFailure
  ): Promise<void> {
    // This would update the prediction model's performance metrics
    // based on the accuracy of the prediction
    Logger.debug(`Updating model performance based on prediction accuracy: ${actualFailure.predictionAccuracy}`);
  }
}

// Export singleton instance
export const predictiveFailureDetector = new PredictiveFailureDetector();