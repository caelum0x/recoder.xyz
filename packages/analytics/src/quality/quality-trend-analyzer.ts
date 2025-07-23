/**
 * Quality Trend Analysis & Regression Detection System
 * 
 * Advanced system for analyzing quality trends over time, detecting regressions,
 * identifying patterns, and providing insights into model performance evolution.
 * Includes statistical analysis, seasonal decomposition, and change point detection.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';
import { QualityAssessmentResult } from './quality-assessor';

export interface QualityTrend {
  id: string;
  modelName: string;
  metricName: string;
  timeframe: string;                    // e.g., '1h', '24h', '7d', '30d'
  
  // Trend analysis results
  trendDirection: 'improving' | 'degrading' | 'stable' | 'volatile';
  trendStrength: number;                // 0-1 strength of trend
  confidenceLevel: number;              // 0-1 statistical confidence
  
  // Statistical measures
  statistics: {
    current: number;
    baseline: number;
    change: number;                     // Absolute change
    percentChange: number;              // Percentage change
    significance: number;               // Statistical significance (p-value)
    
    // Distribution properties
    mean: number;
    median: number;
    stdDev: number;
    variance: number;
    skewness: number;
    kurtosis: number;
    
    // Trend properties
    slope: number;                      // Linear regression slope
    rSquared: number;                   // Coefficient of determination
    autocorrelation: number;            // Serial correlation
  };
  
  // Time series decomposition
  decomposition?: {
    trend: number[];                    // Trend component
    seasonal: number[];                 // Seasonal component
    residual: number[];                 // Residual component
    seasonalityStrength: number;        // 0-1 strength of seasonality
    trendStrength: number;              // 0-1 strength of trend
  };
  
  // Change points
  changePoints: ChangePoint[];
  
  // Predictions
  forecast?: QualityForecast;
  
  // Analysis metadata
  dataPoints: number;
  analysisTimestamp: Date;
  nextAnalysis: Date;
}

export interface ChangePoint {
  timestamp: Date;
  index: number;                        // Index in data series
  type: 'level_shift' | 'trend_change' | 'variance_change' | 'outlier';
  magnitude: number;                    // Size of change
  confidence: number;                   // 0-1 confidence in detection
  
  // Before/after statistics
  beforeMean: number;
  afterMean: number;
  beforeTrend: number;
  afterTrend: number;
  
  // Context
  description: string;
  potentialCauses: string[];
  impact: 'minimal' | 'moderate' | 'significant' | 'severe';
}

export interface QualityForecast {
  horizon: number;                      // Forecast horizon in minutes
  predictions: Array<{
    timestamp: Date;
    predictedValue: number;
    confidence: number;                 // 0-1 confidence
    lowerBound: number;
    upperBound: number;
  }>;
  
  // Forecast quality
  accuracy: number;                     // Historical forecast accuracy
  method: 'linear' | 'exponential' | 'seasonal' | 'arima' | 'ensemble';
  uncertainty: number;                  // Forecast uncertainty measure
}

export interface QualityRegression {
  id: string;
  modelName: string;
  detectedAt: Date;
  severity: 'minor' | 'moderate' | 'major' | 'critical';
  
  // Regression details
  affectedMetrics: string[];
  regressionMagnitude: number;          // Size of regression
  duration: number;                     // Duration in minutes
  impact: QualityRegressionImpact;
  
  // Root cause analysis
  rootCause?: {
    type: 'model_update' | 'data_drift' | 'infrastructure' | 'external' | 'unknown';
    description: string;
    confidence: number;
    evidence: string[];
  };
  
  // Recovery information
  recoveredAt?: Date;
  recoveryActions: string[];
  preventionMeasures: string[];
  
  // Analysis
  comparison: {
    beforeRegression: QualitySnapshot;
    duringRegression: QualitySnapshot;
    afterRecovery?: QualitySnapshot;
  };
}

export interface QualityRegressionImpact {
  userExperience: {
    satisfactionDrop: number;           // Percentage drop
    complaintIncrease: number;          // Percentage increase
    usageDecline: number;               // Percentage decline
  };
  
  business: {
    costIncrease: number;               // USD cost increase
    revenueLoss: number;                // USD revenue loss
    reputationImpact: 'low' | 'medium' | 'high';
  };
  
  technical: {
    errorRateIncrease: number;          // Percentage increase
    latencyIncrease: number;            // Percentage increase
    throughputDecrease: number;         // Percentage decrease
  };
}

export interface QualitySnapshot {
  timestamp: Date;
  overallScore: number;
  metricScores: Record<string, number>;
  sampleSize: number;
  confidence: number;
}

export interface TrendAnalysisConfig {
  minDataPoints: number;                // Minimum data points for analysis
  trendDetectionWindow: number;         // Window size for trend detection
  changePointSensitivity: number;      // Sensitivity for change point detection
  seasonalityWindow: number;            // Window for seasonality detection
  forecastHorizon: number;              // Default forecast horizon
  regressionThreshold: number;          // Threshold for regression detection
  updateFrequency: number;              // Analysis update frequency in minutes
}

export class QualityTrendAnalyzer extends EventEmitter {
  private qualityHistory: Map<string, QualityAssessmentResult[]> = new Map();
  private trends: Map<string, QualityTrend> = new Map();
  private regressions: Map<string, QualityRegression> = new Map();
  private snapshots: Map<string, QualitySnapshot[]> = new Map();
  
  private config: TrendAnalysisConfig = {
    minDataPoints: 30,
    trendDetectionWindow: 20,
    changePointSensitivity: 0.8,
    seasonalityWindow: 144,               // 12 hours at 5-minute intervals
    forecastHorizon: 360,                 // 6 hours
    regressionThreshold: 0.1,             // 10% drop threshold
    updateFrequency: 300000               // 5 minutes
  };

  private analysisTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config?: Partial<TrendAnalysisConfig>) {
    super();
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Start quality trend analysis
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Quality trend analyzer is already running');
      return;
    }

    Logger.info('Starting quality trend analysis...');

    // Start analysis timer
    this.analysisTimer = setInterval(() => {
      this.performAnalysis();
    }, this.config.updateFrequency);

    this.isRunning = true;
    this.emit('analyzerStarted');

    Logger.info('Quality trend analyzer started successfully');
  }

  /**
   * Stop quality trend analysis
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    Logger.info('Stopping quality trend analysis...');

    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }

    this.isRunning = false;
    this.emit('analyzerStopped');

    Logger.info('Quality trend analyzer stopped');
  }

  /**
   * Add quality assessment result for analysis
   */
  async addQualityData(
    modelName: string,
    assessment: QualityAssessmentResult
  ): Promise<void> {
    const key = modelName;
    let history = this.qualityHistory.get(key) || [];
    
    // Add new assessment
    history.push(assessment);
    
    // Sort by timestamp
    history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Keep only recent data
    const retentionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
    history = history.filter(h => h.timestamp >= retentionCutoff);
    
    this.qualityHistory.set(key, history);

    // Update snapshot
    await this.updateSnapshot(modelName, assessment);

    // Trigger real-time regression detection
    if (history.length >= this.config.minDataPoints) {
      await this.detectRealTimeRegression(modelName, history);
    }

    Logger.debug(`Added quality data for ${modelName}, total points: ${history.length}`);
  }

  /**
   * Get quality trend for a model
   */
  getTrend(modelName: string, metricName: string = 'overallScore'): QualityTrend | null {
    const key = `${modelName}_${metricName}`;
    return this.trends.get(key) || null;
  }

  /**
   * Get all trends for a model
   */
  getModelTrends(modelName: string): QualityTrend[] {
    return Array.from(this.trends.values())
      .filter(trend => trend.modelName === modelName);
  }

  /**
   * Get quality regressions
   */
  getQualityRegressions(filters?: {
    modelName?: string;
    severity?: string;
    timeframe?: number; // hours
    resolved?: boolean;
  }): QualityRegression[] {
    let regressions = Array.from(this.regressions.values());

    if (filters) {
      if (filters.modelName) {
        regressions = regressions.filter(r => r.modelName === filters.modelName);
      }
      if (filters.severity) {
        regressions = regressions.filter(r => r.severity === filters.severity);
      }
      if (filters.timeframe) {
        const cutoff = new Date(Date.now() - filters.timeframe * 60 * 60 * 1000);
        regressions = regressions.filter(r => r.detectedAt >= cutoff);
      }
      if (filters.resolved !== undefined) {
        regressions = regressions.filter(r => !!r.recoveredAt === filters.resolved);
      }
    }

    return regressions.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
  }

  /**
   * Analyze quality trends for all models
   */
  async analyzeAllTrends(): Promise<Map<string, QualityTrend[]>> {
    const results = new Map<string, QualityTrend[]>();

    for (const [modelName, history] of this.qualityHistory) {
      if (history.length < this.config.minDataPoints) {
        continue;
      }

      const modelTrends = await this.analyzeModelTrends(modelName, history);
      results.set(modelName, modelTrends);
    }

    return results;
  }

  /**
   * Get quality forecast for a model
   */
  async getForecast(
    modelName: string,
    metricName: string = 'overallScore',
    horizon?: number
  ): Promise<QualityForecast | null> {
    const trend = this.getTrend(modelName, metricName);
    
    if (!trend || !trend.forecast) {
      // Generate forecast on demand
      const history = this.qualityHistory.get(modelName);
      if (!history || history.length < this.config.minDataPoints) {
        return null;
      }

      return await this.generateForecast(
        modelName,
        metricName,
        history,
        horizon || this.config.forecastHorizon
      );
    }

    return trend.forecast;
  }

  /**
   * Force regression detection for a model
   */
  async detectRegression(modelName: string): Promise<QualityRegression[]> {
    const history = this.qualityHistory.get(modelName);
    if (!history || history.length < this.config.minDataPoints) {
      return [];
    }

    return await this.detectRegressions(modelName, history);
  }

  // Private methods

  private async performAnalysis(): Promise<void> {
    try {
      // Analyze trends for all models
      for (const [modelName, history] of this.qualityHistory) {
        if (history.length >= this.config.minDataPoints) {
          await this.analyzeModelTrends(modelName, history);
          await this.detectRegressions(modelName, history);
        }
      }

      // Cleanup old data
      await this.cleanupOldData();

    } catch (error) {
      Logger.error('Error performing quality trend analysis:', error);
    }
  }

  private async analyzeModelTrends(
    modelName: string,
    history: QualityAssessmentResult[]
  ): Promise<QualityTrend[]> {
    const trends: QualityTrend[] = [];

    // Analyze overall score trend
    const overallTrend = await this.analyzeSingleMetricTrend(
      modelName,
      'overallScore',
      history.map(h => ({ timestamp: h.timestamp, value: h.overallScore }))
    );
    trends.push(overallTrend);

    // Analyze individual metric trends
    const metricNames = ['compilationScore', 'testScore', 'securityScore', 'performanceScore'];
    
    for (const metricName of metricNames) {
      const metricData = history.map(h => ({
        timestamp: h.timestamp,
        value: h.metrics[metricName] || 0
      }));

      const trend = await this.analyzeSingleMetricTrend(modelName, metricName, metricData);
      trends.push(trend);
    }

    // Store trends
    trends.forEach(trend => {
      const key = `${trend.modelName}_${trend.metricName}`;
      this.trends.set(key, trend);
    });

    return trends;
  }

  private async analyzeSingleMetricTrend(
    modelName: string,
    metricName: string,
    data: Array<{ timestamp: Date; value: number }>
  ): Promise<QualityTrend> {
    const values = data.map(d => d.value);
    const n = values.length;

    // Calculate basic statistics
    const mean = this.calculateMean(values);
    const median = this.calculateMedian(values);
    const stdDev = this.calculateStdDev(values, mean);
    const variance = stdDev * stdDev;

    // Calculate trend using linear regression
    const { slope, rSquared } = this.calculateLinearRegression(values);
    
    // Determine trend direction and strength
    const trendDirection = this.determineTrendDirection(slope, stdDev);
    const trendStrength = Math.min(1, Math.abs(slope) / stdDev);
    
    // Detect change points
    const changePoints = await this.detectChangePoints(data);
    
    // Calculate seasonal decomposition if enough data
    const decomposition = n >= this.config.seasonalityWindow ? 
      this.performSeasonalDecomposition(values) : undefined;

    // Generate forecast
    const forecast = await this.generateForecast(modelName, metricName, 
      data.map(d => ({ timestamp: d.timestamp, assessment: { overallScore: d.value } } as any)));

    const trend: QualityTrend = {
      id: `trend_${modelName}_${metricName}_${Date.now()}`,
      modelName,
      metricName,
      timeframe: '24h',
      trendDirection,
      trendStrength,
      confidenceLevel: rSquared,
      statistics: {
        current: values[values.length - 1],
        baseline: values[0],
        change: values[values.length - 1] - values[0],
        percentChange: ((values[values.length - 1] - values[0]) / values[0]) * 100,
        significance: this.calculateSignificance(values),
        mean,
        median,
        stdDev,
        variance,
        skewness: this.calculateSkewness(values, mean, stdDev),
        kurtosis: this.calculateKurtosis(values, mean, stdDev),
        slope,
        rSquared,
        autocorrelation: this.calculateAutocorrelation(values)
      },
      decomposition,
      changePoints,
      forecast,
      dataPoints: n,
      analysisTimestamp: new Date(),
      nextAnalysis: new Date(Date.now() + this.config.updateFrequency)
    };

    return trend;
  }

  private async detectRegressions(
    modelName: string,
    history: QualityAssessmentResult[]
  ): Promise<QualityRegression[]> {
    const regressions: QualityRegression[] = [];
    
    // Look for significant drops in recent data
    const recentWindow = 20; // Last 20 data points
    const baselineWindow = 50; // Baseline from earlier data

    if (history.length < recentWindow + baselineWindow) {
      return regressions;
    }

    const baseline = history.slice(0, baselineWindow);
    const recent = history.slice(-recentWindow);

    const baselineScore = this.calculateMean(baseline.map(h => h.overallScore));
    const recentScore = this.calculateMean(recent.map(h => h.overallScore));
    
    const regressionMagnitude = (baselineScore - recentScore) / baselineScore;

    if (regressionMagnitude > this.config.regressionThreshold) {
      const regression = await this.createQualityRegression(
        modelName,
        regressionMagnitude,
        baseline,
        recent,
        history
      );
      
      regressions.push(regression);
      this.regressions.set(regression.id, regression);
      
      this.emit('regressionDetected', regression);
      Logger.warn(`Quality regression detected in ${modelName}: ${(regressionMagnitude * 100).toFixed(1)}% drop`);
    }

    return regressions;
  }

  private async detectRealTimeRegression(
    modelName: string,
    history: QualityAssessmentResult[]
  ): Promise<void> {
    // Quick regression check on latest data
    if (history.length < 10) return;

    const latest = history.slice(-5);
    const previous = history.slice(-15, -5);

    const latestAvg = this.calculateMean(latest.map(h => h.overallScore));
    const previousAvg = this.calculateMean(previous.map(h => h.overallScore));

    const drop = (previousAvg - latestAvg) / previousAvg;

    if (drop > this.config.regressionThreshold) {
      this.emit('realTimeRegressionAlert', {
        modelName,
        drop,
        timestamp: new Date(),
        latestScore: latestAvg,
        previousScore: previousAvg
      });
    }
  }

  private async createQualityRegression(
    modelName: string,
    magnitude: number,
    baseline: QualityAssessmentResult[],
    recent: QualityAssessmentResult[],
    fullHistory: QualityAssessmentResult[]
  ): Promise<QualityRegression> {
    const severity = this.calculateRegressionSeverity(magnitude);
    const affectedMetrics = this.identifyAffectedMetrics(baseline, recent);
    
    const regression: QualityRegression = {
      id: `regression_${modelName}_${Date.now()}`,
      modelName,
      detectedAt: new Date(),
      severity,
      affectedMetrics,
      regressionMagnitude: magnitude,
      duration: 0, // Will be calculated when recovered
      impact: this.calculateRegressionImpact(magnitude, recent.length),
      rootCause: await this.analyzeRootCause(modelName, baseline, recent, fullHistory),
      recoveryActions: this.generateRecoveryActions(severity, affectedMetrics),
      preventionMeasures: this.generatePreventionMeasures(affectedMetrics),
      comparison: {
        beforeRegression: this.createQualitySnapshot(baseline, 'before'),
        duringRegression: this.createQualitySnapshot(recent, 'during')
      }
    };

    return regression;
  }

  private calculateRegressionSeverity(magnitude: number): 'minor' | 'moderate' | 'major' | 'critical' {
    if (magnitude > 0.4) return 'critical';      // >40% drop
    if (magnitude > 0.25) return 'major';        // >25% drop
    if (magnitude > 0.15) return 'moderate';     // >15% drop
    return 'minor';                              // >10% drop
  }

  private identifyAffectedMetrics(
    baseline: QualityAssessmentResult[],
    recent: QualityAssessmentResult[]
  ): string[] {
    const affected: string[] = [];
    const metricNames = ['compilationScore', 'testScore', 'securityScore', 'performanceScore'];

    for (const metric of metricNames) {
      const baselineAvg = this.calculateMean(baseline.map(h => h.metrics[metric] || 0));
      const recentAvg = this.calculateMean(recent.map(h => h.metrics[metric] || 0));
      
      const drop = (baselineAvg - recentAvg) / baselineAvg;
      
      if (drop > 0.1) { // 10% drop threshold
        affected.push(metric);
      }
    }

    return affected;
  }

  private calculateRegressionImpact(magnitude: number, sampleSize: number): QualityRegressionImpact {
    const severityMultiplier = magnitude * 2; // Scale impact by magnitude
    
    return {
      userExperience: {
        satisfactionDrop: severityMultiplier * 30,    // Up to 60% satisfaction drop
        complaintIncrease: severityMultiplier * 50,   // Up to 100% complaint increase
        usageDecline: severityMultiplier * 20         // Up to 40% usage decline
      },
      business: {
        costIncrease: severityMultiplier * 1000,      // Up to $2000 cost increase
        revenueLoss: severityMultiplier * 5000,       // Up to $10000 revenue loss
        reputationImpact: magnitude > 0.3 ? 'high' : magnitude > 0.2 ? 'medium' : 'low'
      },
      technical: {
        errorRateIncrease: severityMultiplier * 25,   // Up to 50% error rate increase
        latencyIncrease: severityMultiplier * 40,     // Up to 80% latency increase
        throughputDecrease: severityMultiplier * 30   // Up to 60% throughput decrease
      }
    };
  }

  private async analyzeRootCause(
    modelName: string,
    baseline: QualityAssessmentResult[],
    recent: QualityAssessmentResult[],
    fullHistory: QualityAssessmentResult[]
  ): Promise<QualityRegression['rootCause']> {
    // Simplified root cause analysis
    const evidence: string[] = [];
    let type: QualityRegression['rootCause']['type'] = 'unknown';
    let confidence = 0.5;
    
    // Check timing patterns
    const regressionStart = recent[0].timestamp;
    const timeSinceLastUpdate = Date.now() - regressionStart.getTime();
    
    if (timeSinceLastUpdate < 24 * 60 * 60 * 1000) { // Within 24 hours
      type = 'model_update';
      confidence = 0.8;
      evidence.push('Regression occurred within 24 hours, likely model update');
    }
    
    // Check metric patterns
    const compilationDrop = this.calculateMetricDrop(baseline, recent, 'compilationScore');
    const securityDrop = this.calculateMetricDrop(baseline, recent, 'securityScore');
    
    if (compilationDrop > 0.2) {
      evidence.push('Significant compilation score drop detected');
      type = 'model_update';
      confidence = Math.max(confidence, 0.7);
    }
    
    if (securityDrop > 0.2) {
      evidence.push('Significant security score drop detected');
    }

    return {
      type,
      description: `Quality regression likely caused by ${type.replace('_', ' ')}`,
      confidence,
      evidence
    };
  }

  private calculateMetricDrop(
    baseline: QualityAssessmentResult[],
    recent: QualityAssessmentResult[],
    metricName: string
  ): number {
    const baselineAvg = this.calculateMean(baseline.map(h => h.metrics[metricName] || 0));
    const recentAvg = this.calculateMean(recent.map(h => h.metrics[metricName] || 0));
    
    if (baselineAvg === 0) return 0;
    return Math.max(0, (baselineAvg - recentAvg) / baselineAvg);
  }

  private generateRecoveryActions(severity: string, affectedMetrics: string[]): string[] {
    const actions: string[] = [];
    
    actions.push('Investigate recent model or configuration changes');
    actions.push('Compare current output with baseline samples');
    
    if (affectedMetrics.includes('compilationScore')) {
      actions.push('Check for syntax or compilation issues in generated code');
    }
    
    if (affectedMetrics.includes('securityScore')) {
      actions.push('Review security scanning rules and model outputs');
    }
    
    if (severity === 'critical' || severity === 'major') {
      actions.push('Consider rolling back to previous model version');
      actions.push('Activate manual review process for critical outputs');
    }
    
    return actions;
  }

  private generatePreventionMeasures(affectedMetrics: string[]): string[] {
    const measures: string[] = [];
    
    measures.push('Implement automated regression testing before model updates');
    measures.push('Set up quality gates with automatic rollback triggers');
    measures.push('Increase monitoring frequency after model changes');
    
    if (affectedMetrics.includes('compilationScore')) {
      measures.push('Add compilation validation to CI/CD pipeline');
    }
    
    if (affectedMetrics.includes('securityScore')) {
      measures.push('Implement security scanning in pre-production');
    }
    
    return measures;
  }

  private createQualitySnapshot(
    assessments: QualityAssessmentResult[],
    phase: string
  ): QualitySnapshot {
    const overallScores = assessments.map(a => a.overallScore);
    const metricScores: Record<string, number> = {};
    
    const metricNames = ['compilationScore', 'testScore', 'securityScore', 'performanceScore'];
    for (const metric of metricNames) {
      const scores = assessments.map(a => a.metrics[metric] || 0);
      metricScores[metric] = this.calculateMean(scores);
    }
    
    return {
      timestamp: new Date(),
      overallScore: this.calculateMean(overallScores),
      metricScores,
      sampleSize: assessments.length,
      confidence: Math.min(1, assessments.length / 20) // Confidence based on sample size
    };
  }

  private async updateSnapshot(modelName: string, assessment: QualityAssessmentResult): Promise<void> {
    const snapshots = this.snapshots.get(modelName) || [];
    
    const snapshot: QualitySnapshot = {
      timestamp: assessment.timestamp,
      overallScore: assessment.overallScore,
      metricScores: assessment.metrics,
      sampleSize: 1,
      confidence: 1
    };
    
    snapshots.push(snapshot);
    
    // Keep only recent snapshots
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    const filtered = snapshots.filter(s => s.timestamp >= cutoff);
    
    this.snapshots.set(modelName, filtered);
  }

  private async detectChangePoints(
    data: Array<{ timestamp: Date; value: number }>
  ): Promise<ChangePoint[]> {
    const changePoints: ChangePoint[] = [];
    const values = data.map(d => d.value);
    const n = values.length;
    
    if (n < 20) return changePoints; // Need sufficient data
    
    // Simple change point detection using sliding window
    const windowSize = Math.floor(n / 10);
    
    for (let i = windowSize; i < n - windowSize; i++) {
      const before = values.slice(i - windowSize, i);
      const after = values.slice(i, i + windowSize);
      
      const beforeMean = this.calculateMean(before);
      const afterMean = this.calculateMean(after);
      const beforeStd = this.calculateStdDev(before, beforeMean);
      const afterStd = this.calculateStdDev(after, afterMean);
      
      // Check for significant mean shift
      const meanDiff = Math.abs(afterMean - beforeMean);
      const pooledStd = Math.sqrt((beforeStd * beforeStd + afterStd * afterStd) / 2);
      
      if (meanDiff > 2 * pooledStd && pooledStd > 0) { // 2-sigma threshold
        const magnitude = meanDiff / beforeMean;
        const confidence = Math.min(1, meanDiff / (3 * pooledStd));
        
        changePoints.push({
          timestamp: data[i].timestamp,
          index: i,
          type: 'level_shift',
          magnitude,
          confidence,
          beforeMean,
          afterMean,
          beforeTrend: 0, // Simplified
          afterTrend: 0,  // Simplified
          description: `Significant change detected: ${beforeMean.toFixed(2)} → ${afterMean.toFixed(2)}`,
          potentialCauses: ['Model update', 'Data distribution change', 'System configuration change'],
          impact: magnitude > 0.3 ? 'severe' : magnitude > 0.2 ? 'significant' : magnitude > 0.1 ? 'moderate' : 'minimal'
        });
      }
    }
    
    return changePoints;
  }

  private async generateForecast(
    modelName: string,
    metricName: string,
    history: QualityAssessmentResult[],
    horizon: number = this.config.forecastHorizon
  ): Promise<QualityForecast> {
    const values = history.map(h => metricName === 'overallScore' ? h.overallScore : h.metrics[metricName] || 0);
    const timestamps = history.map(h => h.timestamp);
    
    // Simple linear extrapolation (in production, would use more sophisticated methods)
    const { slope } = this.calculateLinearRegression(values);
    const lastValue = values[values.length - 1];
    const lastTimestamp = timestamps[timestamps.length - 1];
    
    const predictions = [];
    const stepSize = 60 * 1000; // 1 minute steps
    const steps = Math.floor(horizon * 60 * 1000 / stepSize);
    
    for (let i = 1; i <= steps; i++) {
      const futureTimestamp = new Date(lastTimestamp.getTime() + i * stepSize);
      const predictedValue = lastValue + slope * i;
      const uncertainty = Math.min(0.2, i * 0.01); // Increasing uncertainty over time
      
      predictions.push({
        timestamp: futureTimestamp,
        predictedValue: Math.max(0, Math.min(1, predictedValue)), // Clamp to [0,1]
        confidence: Math.max(0.1, 1 - uncertainty),
        lowerBound: Math.max(0, predictedValue - uncertainty),
        upperBound: Math.min(1, predictedValue + uncertainty)
      });
    }
    
    return {
      horizon,
      predictions,
      accuracy: 0.75, // Historical accuracy (would be calculated from past forecasts)
      method: 'linear',
      uncertainty: predictions.length > 0 ? predictions[predictions.length - 1].confidence : 0.5
    };
  }

  private performSeasonalDecomposition(values: number[]): QualityTrend['decomposition'] {
    // Simplified seasonal decomposition
    const n = values.length;
    const seasonLength = Math.min(24, Math.floor(n / 4)); // Assume daily seasonality
    
    const trend = this.calculateTrendComponent(values, seasonLength);
    const detrended = values.map((v, i) => v - trend[i]);
    const seasonal = this.calculateSeasonalComponent(detrended, seasonLength);
    const residual = values.map((v, i) => v - trend[i] - seasonal[i % seasonLength]);
    
    return {
      trend,
      seasonal,
      residual,
      seasonalityStrength: this.calculateSeasonalityStrength(seasonal),
      trendStrength: this.calculateTrendStrength(trend)
    };
  }

  private calculateTrendComponent(values: number[], windowSize: number): number[] {
    const trend: number[] = [];
    const halfWindow = Math.floor(windowSize / 2);
    
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(values.length, i + halfWindow + 1);
      const window = values.slice(start, end);
      trend.push(this.calculateMean(window));
    }
    
    return trend;
  }

  private calculateSeasonalComponent(detrended: number[], seasonLength: number): number[] {
    const seasonal: number[] = new Array(seasonLength).fill(0);
    const counts: number[] = new Array(seasonLength).fill(0);
    
    for (let i = 0; i < detrended.length; i++) {
      const seasonIndex = i % seasonLength;
      seasonal[seasonIndex] += detrended[i];
      counts[seasonIndex]++;
    }
    
    // Average seasonal components
    for (let i = 0; i < seasonLength; i++) {
      if (counts[i] > 0) {
        seasonal[i] /= counts[i];
      }
    }
    
    return seasonal;
  }

  private calculateSeasonalityStrength(seasonal: number[]): number {
    const variance = this.calculateVariance(seasonal);
    return Math.min(1, variance * 10); // Normalize to [0,1]
  }

  private calculateTrendStrength(trend: number[]): number {
    const { rSquared } = this.calculateLinearRegression(trend);
    return rSquared;
  }

  private async cleanupOldData(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
    
    // Cleanup quality history
    for (const [key, history] of this.qualityHistory) {
      const filtered = history.filter(h => h.timestamp >= cutoff);
      if (filtered.length === 0) {
        this.qualityHistory.delete(key);
      } else {
        this.qualityHistory.set(key, filtered);
      }
    }
    
    // Cleanup old regressions
    for (const [key, regression] of this.regressions) {
      if (regression.detectedAt < cutoff && regression.recoveredAt) {
        this.regressions.delete(key);
      }
    }
  }

  // Statistical helper methods

  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? 
      (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  private calculateStdDev(values: number[], mean?: number): number {
    if (values.length === 0) return 0;
    const m = mean ?? this.calculateMean(values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private calculateVariance(values: number[]): number {
    const mean = this.calculateMean(values);
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  private calculateSkewness(values: number[], mean: number, stdDev: number): number {
    if (stdDev === 0) return 0;
    const n = values.length;
    const sum = values.reduce((s, val) => s + Math.pow((val - mean) / stdDev, 3), 0);
    return sum / n;
  }

  private calculateKurtosis(values: number[], mean: number, stdDev: number): number {
    if (stdDev === 0) return 0;
    const n = values.length;
    const sum = values.reduce((s, val) => s + Math.pow((val - mean) / stdDev, 4), 0);
    return sum / n - 3; // Excess kurtosis
  }

  private calculateLinearRegression(values: number[]): { slope: number; rSquared: number } {
    const n = values.length;
    if (n < 2) return { slope: 0, rSquared: 0 };
    
    const xValues = Array.from({ length: n }, (_, i) => i);
    const xMean = (n - 1) / 2;
    const yMean = this.calculateMean(values);
    
    let numerator = 0;
    let denominator = 0;
    let totalSumSquares = 0;
    
    for (let i = 0; i < n; i++) {
      const xDiff = xValues[i] - xMean;
      const yDiff = values[i] - yMean;
      numerator += xDiff * yDiff;
      denominator += xDiff * xDiff;
      totalSumSquares += yDiff * yDiff;
    }
    
    const slope = denominator === 0 ? 0 : numerator / denominator;
    const rSquared = totalSumSquares === 0 ? 0 : Math.pow(numerator, 2) / (denominator * totalSumSquares);
    
    return { slope, rSquared };
  }

  private calculateAutocorrelation(values: number[]): number {
    if (values.length < 2) return 0;
    
    const mean = this.calculateMean(values);
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < values.length - 1; i++) {
      numerator += (values[i] - mean) * (values[i + 1] - mean);
    }
    
    for (let i = 0; i < values.length; i++) {
      denominator += Math.pow(values[i] - mean, 2);
    }
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateSignificance(values: number[]): number {
    // Simple significance test - in production would use proper statistical tests
    const mean = this.calculateMean(values);
    const stdDev = this.calculateStdDev(values, mean);
    const n = values.length;
    
    if (n < 10 || stdDev === 0) return 1.0; // Not significant
    
    const tStat = Math.abs(mean) / (stdDev / Math.sqrt(n));
    
    // Approximate p-value (simplified)
    return Math.max(0.001, Math.min(1.0, 2 * (1 - this.approximateNormalCDF(tStat))));
  }

  private approximateNormalCDF(x: number): number {
    // Approximation of standard normal CDF
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  }

  private erf(x: number): number {
    // Approximation of error function
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);
    
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    
    return sign * y;
  }

  private determineTrendDirection(slope: number, stdDev: number): 'improving' | 'degrading' | 'stable' | 'volatile' {
    const threshold = stdDev * 0.1; // 10% of standard deviation
    
    if (Math.abs(slope) < threshold) {
      return 'stable';
    } else if (slope > threshold) {
      return 'improving';
    } else {
      return 'degrading';
    }
  }
}

// Export singleton instance
export const qualityTrendAnalyzer = new QualityTrendAnalyzer();