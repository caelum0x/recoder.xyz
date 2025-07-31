/**
 * Error Pattern Detection & Analysis
 * 
 * Intelligent error detection with pattern recognition, categorization,
 * automatic retry logic, and circuit breaker implementation.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';

export interface ErrorEvent {
  id: string;
  modelName: string;
  provider: string;
  timestamp: Date;
  errorType: ErrorType;
  errorCode?: string;
  message: string;
  requestId?: string;
  userId?: string;
  retryAttempt: number;
  context: {
    inputTokens?: number;
    requestSize?: number;
    region?: string;
    taskType?: string;
    httpStatus?: number;
    responseTime?: number;
    loadLevel?: 'low' | 'medium' | 'high';
  };
  resolved: boolean;
  resolutionTime?: Date;
  resolutionMethod?: 'retry' | 'fallback' | 'manual' | 'timeout';
}

export enum ErrorType {
  RATE_LIMIT = 'rate_limit',
  API_ERROR = 'api_error',
  MODEL_FAILURE = 'model_failure',
  NETWORK_ERROR = 'network_error',
  AUTHENTICATION = 'authentication',
  QUOTA_EXCEEDED = 'quota_exceeded',
  TIMEOUT = 'timeout',
  VALIDATION_ERROR = 'validation_error',
  UNKNOWN = 'unknown'
}

export interface ErrorPattern {
  id: string;
  modelName?: string;
  provider?: string;
  errorType: ErrorType;
  pattern: {
    frequency: number;        // Errors per hour
    timePattern?: string;     // Time-based pattern (e.g., "peak_hours")
    userPattern?: string;     // User-based pattern
    requestPattern?: string;  // Request-based pattern
  };
  triggers: {
    threshold: number;        // Error rate threshold
    window: number;          // Time window in minutes
    conditions: string[];    // Additional conditions
  };
  confidence: number;       // Pattern confidence (0-1)
  firstSeen: Date;
  lastSeen: Date;
  occurrences: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface CircuitBreakerState {
  modelName: string;
  state: 'closed' | 'open' | 'half_open';
  failureCount: number;
  lastFailureTime?: Date;
  nextRetryTime?: Date;
  successCount: number;
  config: {
    failureThreshold: number;    // Failures before opening
    recoveryTimeout: number;     // Time before trying half-open (ms)
    successThreshold: number;    // Successes needed to close
    monitoringWindow: number;    // Window for counting failures (ms)
  };
}

export interface RetryPolicy {
  modelName: string;
  errorType: ErrorType;
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;           // Random jitter to prevent thundering herd
  retryConditions: string[];  // Conditions that allow retry
}

export interface ErrorMetrics {
  modelName: string;
  timeframe: string;
  totalErrors: number;
  errorRate: number;          // Percentage of requests that failed
  rate: number;              // Alias for errorRate for backward compatibility
  errorsByType: Record<ErrorType, number>;
  mttr: number;              // Mean time to recovery (minutes)
  topErrors: Array<{
    message: string;
    count: number;
    percentage: number;
  }>;
  trend: 'improving' | 'degrading' | 'stable';
  lastUpdated: Date;
}

export interface HistoricalFailurePattern {
  modelName: string;
  riskScore: number;         // 0-1 risk of future failure
  patterns: {
    dailyPattern: number[];   // 24 values for each hour
    weeklyPattern: number[];  // 7 values for each day
    loadCorrelation: number;  // -1 to 1 correlation with load
  };
  predictors: Array<{
    factor: string;
    correlation: number;
    significance: number;
  }>;
}

export class ErrorDetector extends EventEmitter {
  private errorHistory: Map<string, ErrorEvent[]> = new Map();
  private errorPatterns: Map<string, ErrorPattern> = new Map();
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private retryPolicies: Map<string, RetryPolicy[]> = new Map();
  private activePatterns: Map<string, ErrorPattern[]> = new Map();

  private config = {
    maxErrorHistory: 10000,      // Maximum errors to store per model
    patternDetectionWindow: 3600000, // 1 hour for pattern detection
    circuitBreakerWindow: 300000,    // 5 minutes for circuit breaker
    patternAnalysisInterval: 300000, // Analyze patterns every 5 minutes
    cleanupInterval: 3600000,        // Clean old data every hour
  };

  private patternAnalysisTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
    this.initializeErrorTracking();
    this.initializeDefaultPolicies();
  }

  private initializeErrorTracking(): void {
    const knownModels = [
      'claude-sonnet-4', 'claude-haiku-3', 'gpt-4-turbo', 'gpt-4o',
      'gemini-2.5-pro', 'mistral-large-2407', 'deepseek-v3', 'llama-3.3-70b'
    ];

    knownModels.forEach(modelName => {
      this.errorHistory.set(modelName, []);
      this.activePatterns.set(modelName, []);
      
      // Initialize circuit breaker
      this.circuitBreakers.set(modelName, {
        modelName,
        state: 'closed',
        failureCount: 0,
        successCount: 0,
        config: {
          failureThreshold: 5,      // 5 failures to open
          recoveryTimeout: 60000,   // 1 minute recovery
          successThreshold: 3,      // 3 successes to close
          monitoringWindow: 300000  // 5 minute window
        }
      });
    });

    Logger.info(`Initialized error tracking for ${knownModels.length} models`);
  }

  private initializeDefaultPolicies(): void {
    const defaultPolicies: Array<{ modelName: string; policies: RetryPolicy[] }> = [
      {
        modelName: 'claude-sonnet-4',
        policies: [
          {
            modelName: 'claude-sonnet-4',
            errorType: ErrorType.RATE_LIMIT,
            maxRetries: 3,
            initialDelayMs: 1000,
            maxDelayMs: 16000,
            backoffMultiplier: 2,
            jitterMs: 500,
            retryConditions: ['after_delay', 'exponential_backoff']
          },
          {
            modelName: 'claude-sonnet-4',
            errorType: ErrorType.NETWORK_ERROR,
            maxRetries: 2,
            initialDelayMs: 500,
            maxDelayMs: 5000,
            backoffMultiplier: 2,
            jitterMs: 200,
            retryConditions: ['transient_error']
          }
        ]
      }
    ];

    defaultPolicies.forEach(({ modelName, policies }) => {
      this.retryPolicies.set(modelName, policies);
    });

    Logger.info(`Initialized retry policies for ${defaultPolicies.length} models`);
  }

  /**
   * Start error detection and monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Error detector is already running');
      return;
    }

    Logger.info('Starting error detection...');

    // Start pattern analysis
    this.patternAnalysisTimer = setInterval(() => {
      this.analyzeErrorPatterns();
    }, this.config.patternAnalysisInterval);

    // Start cleanup
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldData();
    }, this.config.cleanupInterval);

    this.isRunning = true;
    this.emit('detectionStarted');

    Logger.info('Error detection started successfully');
  }

  /**
   * Stop error detection
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    Logger.info('Stopping error detection...');

    if (this.patternAnalysisTimer) {
      clearInterval(this.patternAnalysisTimer);
      this.patternAnalysisTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.isRunning = false;
    this.emit('detectionStopped');

    Logger.info('Error detection stopped');
  }

  /**
   * Record an error event with enhanced categorization
   */
  async recordError(
    modelName: string,
    error: {
      errorType?: ErrorType;
      message: string;
      errorCode?: string;
      requestId?: string;
      userId?: string;
      retryAttempt?: number;
      httpStatus?: number;
      responseTime?: number;
      inputTokens?: number;
      context?: any;
    }
  ): Promise<string> {
    // Enhanced error categorization
    const errorType = error.errorType || await this.categorizeError(error);
    
    const errorEvent: ErrorEvent = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      modelName,
      provider: this.getProviderFromModel(modelName),
      timestamp: new Date(),
      errorType,
      errorCode: error.errorCode,
      message: error.message,
      requestId: error.requestId,
      userId: error.userId,
      retryAttempt: error.retryAttempt || 0,
      context: {
        httpStatus: error.httpStatus,
        responseTime: error.responseTime,
        inputTokens: error.inputTokens,
        loadLevel: await this.getCurrentLoadLevel(modelName),
        timeOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        ...error.context || {}
      },
      resolved: false
    };

    // Store the error
    const modelErrors = this.errorHistory.get(modelName) || [];
    modelErrors.push(errorEvent);

    // Maintain history limit
    if (modelErrors.length > this.config.maxErrorHistory) {
      modelErrors.splice(0, modelErrors.length - this.config.maxErrorHistory);
    }

    this.errorHistory.set(modelName, modelErrors);

    // Update circuit breaker state
    await this.updateCircuitBreaker(modelName, false);

    // Enhanced pattern detection
    await this.detectErrorPatterns(modelName, errorEvent);

    // Check for immediate patterns
    await this.checkForImmediatePatterns(modelName, errorEvent);

    // Emit events
    this.emit('errorRecorded', errorEvent);
    
    // Advanced error spike detection
    const spikeAnalysis = await this.analyzeErrorSpike(modelName);
    if (spikeAnalysis.isSpike) {
      this.emit('errorSpike', modelName, spikeAnalysis.rate, spikeAnalysis);
    }

    Logger.debug(`Recorded ${errorType} error for ${modelName}: ${error.message}`);
    
    return errorEvent.id;
  }

  /**
   * Mark an error as resolved
   */
  async resolveError(
    errorId: string,
    resolutionMethod: 'retry' | 'fallback' | 'manual' | 'timeout'
  ): Promise<void> {
    // Find and resolve the error
    for (const [modelName, errors] of this.errorHistory) {
      const error = errors.find(e => e.id === errorId);
      if (error && !error.resolved) {
        error.resolved = true;
        error.resolutionTime = new Date();
        error.resolutionMethod = resolutionMethod;

        // Update circuit breaker on successful resolution
        if (resolutionMethod === 'retry') {
          await this.updateCircuitBreaker(modelName, true);
        }

        this.emit('errorResolved', error);
        Logger.debug(`Resolved error ${errorId} via ${resolutionMethod}`);
        return;
      }
    }

    Logger.warn(`Error ${errorId} not found for resolution`);
  }

  /**
   * Get error metrics for a model
   */
  async getErrorMetrics(modelName: string, timeframe: string = '1h'): Promise<ErrorMetrics> {
    const errors = this.getRecentErrors(modelName, timeframe);
    const totalErrors = errors.length;

    // Calculate error rate (would need total requests to be accurate)
    // For now, estimate based on error frequency
    const timeframeMinutes = this.parseTimeframeMinutes(timeframe);
    const estimatedRequests = Math.max(totalErrors * 10, 100); // Rough estimate
    const errorRate = (totalErrors / estimatedRequests) * 100;

    // Group by error type
    const errorsByType = errors.reduce((acc, error) => {
      acc[error.errorType] = (acc[error.errorType] || 0) + 1;
      return acc;
    }, {} as Record<ErrorType, number>);

    // Calculate MTTR (Mean Time To Recovery)
    const resolvedErrors = errors.filter(e => e.resolved && e.resolutionTime);
    const mttr = resolvedErrors.length > 0
      ? resolvedErrors.reduce((sum, error) => {
          const resolution = error.resolutionTime!.getTime() - error.timestamp.getTime();
          return sum + resolution;
        }, 0) / (resolvedErrors.length * 60000) // Convert to minutes
      : 0;

    // Top error messages
    const errorCounts = new Map<string, number>();
    errors.forEach(error => {
      const shortMessage = error.message.substring(0, 100);
      errorCounts.set(shortMessage, (errorCounts.get(shortMessage) || 0) + 1);
    });

    const topErrors = Array.from(errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([message, count]) => ({
        message,
        count,
        percentage: (count / totalErrors) * 100
      }));

    // Analyze trend
    const trend = await this.analyzeErrorTrend(modelName, timeframe);

    return {
      modelName,
      timeframe,
      totalErrors,
      errorRate,
      rate: errorRate,  // Alias for backward compatibility
      errorsByType,
      mttr,
      topErrors,
      trend,
      lastUpdated: new Date()
    };
  }

  /**
   * Get error trend analysis
   */
  async getErrorTrend(modelName: string, timeframe: string): Promise<{
    isIncreasing: boolean;
    changeRate: number;
    confidence: number;
  }> {
    const errors = this.getRecentErrors(modelName, timeframe);
    
    if (errors.length < 10) {
      return { isIncreasing: false, changeRate: 0, confidence: 0 };
    }

    // Divide timeframe into buckets
    const bucketCount = 10;
    const timeframeMs = this.parseTimeframeMinutes(timeframe) * 60000;
    const bucketSize = timeframeMs / bucketCount;
    const now = Date.now();

    const buckets = new Array(bucketCount).fill(0);
    errors.forEach(error => {
      const age = now - error.timestamp.getTime();
      const bucketIndex = Math.floor(age / bucketSize);
      if (bucketIndex < bucketCount) {
        buckets[bucketCount - 1 - bucketIndex]++; // Reverse to get chronological order
      }
    });

    // Simple linear regression
    const n = buckets.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = buckets;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const isIncreasing = slope > 0;

    // Calculate R-squared for confidence
    const meanY = sumY / n;
    const ssRes = y.reduce((sum, yi, i) => {
      const predicted = (sumY - slope * sumX) / n + slope * x[i];
      return sum + Math.pow(yi - predicted, 2);
    }, 0);
    const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
    const confidence = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

    return {
      isIncreasing,
      changeRate: Math.abs(slope),
      confidence
    };
  }

  /**
   * Get historical failure patterns for prediction
   */
  async getHistoricalFailurePattern(modelName: string): Promise<HistoricalFailurePattern> {
    const errors = this.errorHistory.get(modelName) || [];
    const last30Days = errors.filter(e => 
      Date.now() - e.timestamp.getTime() < 30 * 24 * 60 * 60 * 1000
    );

    // Daily pattern (24 hours)
    const dailyPattern = new Array(24).fill(0);
    last30Days.forEach(error => {
      const hour = error.timestamp.getHours();
      dailyPattern[hour]++;
    });

    // Weekly pattern (7 days)
    const weeklyPattern = new Array(7).fill(0);
    last30Days.forEach(error => {
      const day = error.timestamp.getDay();
      weeklyPattern[day]++;
    });

    // Calculate risk score based on recent error frequency
    const recentErrors = this.getRecentErrors(modelName, '24h');
    const riskScore = Math.min(recentErrors.length / 100, 1); // Cap at 1.0

    return {
      modelName,
      riskScore,
      patterns: {
        dailyPattern,
        weeklyPattern,
        loadCorrelation: 0 // Would need load data to calculate
      },
      predictors: [
        {
          factor: 'recent_error_rate',
          correlation: 0.8,
          significance: 0.9
        },
        {
          factor: 'time_of_day',
          correlation: 0.3,
          significance: 0.6
        }
      ]
    };
  }

  /**
   * Check if circuit breaker allows request
   */
  async shouldAllowRequest(modelName: string): Promise<boolean> {
    const breaker = this.circuitBreakers.get(modelName);
    if (!breaker) return true;

    const now = Date.now();

    switch (breaker.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if it's time to try half-open
        if (breaker.nextRetryTime && now >= breaker.nextRetryTime.getTime()) {
          breaker.state = 'half_open';
          breaker.successCount = 0;
          Logger.info(`Circuit breaker for ${modelName} moving to half-open`);
        }
        return breaker.state === 'half_open';

      case 'half_open':
        return true;

      default:
        return true;
    }
  }

  /**
   * Get retry policy for a specific error
   */
  getRetryPolicy(modelName: string, errorType: ErrorType): RetryPolicy | null {
    const policies = this.retryPolicies.get(modelName) || [];
    return policies.find(p => p.errorType === errorType) || null;
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  calculateRetryDelay(policy: RetryPolicy, attemptNumber: number): number {
    const exponentialDelay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attemptNumber);
    const cappedDelay = Math.min(exponentialDelay, policy.maxDelayMs);
    const jitter = Math.random() * policy.jitterMs;
    
    return cappedDelay + jitter;
  }

  // Private helper methods

  private getRecentErrors(modelName: string, timeframe: string): ErrorEvent[] {
    const errors = this.errorHistory.get(modelName) || [];
    const cutoff = new Date(Date.now() - this.parseTimeframeMinutes(timeframe) * 60000);
    
    return errors.filter(error => error.timestamp >= cutoff);
  }

  private parseTimeframeMinutes(timeframe: string): number {
    const match = timeframe.match(/^(\d+)([mhd])$/);
    if (!match) return 60; // Default to 1 hour

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'm': return value;
      case 'h': return value * 60;
      case 'd': return value * 60 * 24;
      default: return 60;
    }
  }

  private async updateCircuitBreaker(modelName: string, success: boolean): Promise<void> {
    const breaker = this.circuitBreakers.get(modelName);
    if (!breaker) return;

    const now = new Date();

    if (success) {
      if (breaker.state === 'half_open') {
        breaker.successCount++;
        if (breaker.successCount >= breaker.config.successThreshold) {
          breaker.state = 'closed';
          breaker.failureCount = 0;
          Logger.info(`Circuit breaker for ${modelName} closed after recovery`);
        }
      } else if (breaker.state === 'closed') {
        // Reset failure count on success
        breaker.failureCount = Math.max(0, breaker.failureCount - 1);
      }
    } else {
      breaker.failureCount++;
      breaker.lastFailureTime = now;

      if (breaker.state === 'closed' && breaker.failureCount >= breaker.config.failureThreshold) {
        breaker.state = 'open';
        breaker.nextRetryTime = new Date(now.getTime() + breaker.config.recoveryTimeout);
        
        this.emit('circuitBreakerOpened', modelName, breaker);
        Logger.warn(`Circuit breaker opened for ${modelName} after ${breaker.failureCount} failures`);
      } else if (breaker.state === 'half_open') {
        // Failed in half-open, go back to open
        breaker.state = 'open';
        breaker.nextRetryTime = new Date(now.getTime() + breaker.config.recoveryTimeout);
        Logger.warn(`Circuit breaker for ${modelName} back to open after half-open failure`);
      }
    }

    this.circuitBreakers.set(modelName, breaker);
  }

  private async checkForImmediatePatterns(modelName: string, error: ErrorEvent): Promise<void> {
    const recentErrors = this.getRecentErrors(modelName, '10m');
    
    // Check for rate limit pattern (many rate limit errors in short time)
    if (error.errorType === ErrorType.RATE_LIMIT) {
      const rateLimitErrors = recentErrors.filter(e => e.errorType === ErrorType.RATE_LIMIT);
      if (rateLimitErrors.length >= 5) {
        this.emit('patternDetected', {
          type: 'rate_limit_spike',
          modelName,
          count: rateLimitErrors.length,
          timeframe: '10m'
        });
      }
    }

    // Check for network error clustering
    if (error.errorType === ErrorType.NETWORK_ERROR) {
      const networkErrors = recentErrors.filter(e => e.errorType === ErrorType.NETWORK_ERROR);
      if (networkErrors.length >= 3) {
        this.emit('patternDetected', {
          type: 'network_instability',
          modelName,
          count: networkErrors.length,
          timeframe: '10m'
        });
      }
    }
  }

  private async analyzeErrorPatterns(): Promise<void> {
    for (const [modelName] of this.errorHistory) {
      const errors = this.getRecentErrors(modelName, '1h');
      const patterns = await this.detectPatterns(modelName, errors);
      
      patterns.forEach(pattern => {
        const existingPattern = this.errorPatterns.get(pattern.id);
        if (existingPattern) {
          existingPattern.occurrences++;
          existingPattern.lastSeen = new Date();
        } else {
          this.errorPatterns.set(pattern.id, pattern);
          this.emit('newPatternDetected', pattern);
        }
      });
    }
  }

  private async detectPatterns(modelName: string, errors: ErrorEvent[]): Promise<ErrorPattern[]> {
    const patterns: ErrorPattern[] = [];

    // Pattern: High error rate
    if (errors.length > 20) { // More than 20 errors per hour
      patterns.push({
        id: `high_error_rate_${modelName}`,
        modelName,
        errorType: ErrorType.UNKNOWN,
        pattern: {
          frequency: errors.length,
          timePattern: 'sustained_high_rate'
        },
        triggers: {
          threshold: 20,
          window: 60,
          conditions: ['error_count > threshold']
        },
        confidence: 0.9,
        firstSeen: new Date(),
        lastSeen: new Date(),
        occurrences: 1,
        severity: 'high'
      });
    }

    // Pattern: Cascading failures (errors followed by more errors)
    const timeOrderedErrors = errors.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    let cascadingCount = 0;
    for (let i = 1; i < timeOrderedErrors.length; i++) {
      const timeDiff = timeOrderedErrors[i].timestamp.getTime() - timeOrderedErrors[i - 1].timestamp.getTime();
      if (timeDiff < 30000) { // Within 30 seconds
        cascadingCount++;
      }
    }

    if (cascadingCount > 5) {
      patterns.push({
        id: `cascading_failures_${modelName}`,
        modelName,
        errorType: ErrorType.UNKNOWN,
        pattern: {
          frequency: cascadingCount,
          timePattern: 'cascading'
        },
        triggers: {
          threshold: 5,
          window: 60,
          conditions: ['consecutive_errors_within_30s']
        },
        confidence: 0.8,
        firstSeen: new Date(),
        lastSeen: new Date(),
        occurrences: 1,
        severity: 'critical'
      });
    }

    return patterns;
  }

  private async analyzeErrorTrend(modelName: string, timeframe: string): Promise<'improving' | 'degrading' | 'stable'> {
    const trend = await this.getErrorTrend(modelName, timeframe);
    
    if (trend.confidence < 0.5) return 'stable';
    if (trend.isIncreasing && trend.changeRate > 0.1) return 'degrading';
    if (!trend.isIncreasing && trend.changeRate > 0.1) return 'improving';
    
    return 'stable';
  }

  private cleanupOldData(): void {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    // Clean error history
    for (const [modelName, errors] of this.errorHistory) {
      const filteredErrors = errors.filter(error => error.timestamp >= cutoff);
      this.errorHistory.set(modelName, filteredErrors);
    }

    // Clean old patterns
    for (const [patternId, pattern] of this.errorPatterns) {
      if (pattern.lastSeen < cutoff) {
        this.errorPatterns.delete(patternId);
      }
    }

    Logger.debug('Cleaned up old error data');
  }

  private getProviderFromModel(modelName: string): string {
    if (modelName.includes('claude')) return 'anthropic';
    if (modelName.includes('gpt')) return 'openai';
    if (modelName.includes('gemini')) return 'google';
    if (modelName.includes('mistral')) return 'mistral';
    if (modelName.includes('deepseek')) return 'deepseek';
    if (modelName.includes('llama')) return 'ollama';
    return 'unknown';
  }

  /**
   * Enhanced error categorization using multiple signals
   */
  private async categorizeError(error: any): Promise<ErrorType> {
    const message = error.message.toLowerCase();
    const httpStatus = error.httpStatus;
    const errorCode = error.errorCode;

    // Rate limit detection
    if (httpStatus === 429 || 
        message.includes('rate limit') || 
        message.includes('too many requests') ||
        errorCode === 'rate_limit_exceeded') {
      return ErrorType.RATE_LIMIT;
    }

    // Authentication errors
    if (httpStatus === 401 || 
        httpStatus === 403 ||
        message.includes('unauthorized') ||
        message.includes('invalid api key') ||
        message.includes('authentication')) {
      return ErrorType.AUTHENTICATION;
    }

    // Quota exceeded
    if (message.includes('quota') || 
        message.includes('billing') ||
        message.includes('usage limit') ||
        errorCode === 'insufficient_quota') {
      return ErrorType.QUOTA_EXCEEDED;
    }

    // Network errors
    if (httpStatus >= 500 && httpStatus < 600 ||
        message.includes('network') ||
        message.includes('connection') ||
        message.includes('timeout') ||
        error.responseTime > 30000) {
      return ErrorType.NETWORK_ERROR;
    }

    // Timeout errors
    if (message.includes('timeout') ||
        error.responseTime > 60000 ||
        errorCode === 'timeout') {
      return ErrorType.TIMEOUT;
    }

    // Model-specific failures
    if (message.includes('model') ||
        message.includes('service unavailable') ||
        httpStatus === 503) {
      return ErrorType.MODEL_FAILURE;
    }

    // Validation errors
    if (httpStatus === 400 ||
        message.includes('invalid') ||
        message.includes('validation') ||
        message.includes('bad request')) {
      return ErrorType.VALIDATION_ERROR;
    }

    // API errors (general)
    if (httpStatus >= 400 && httpStatus < 500) {
      return ErrorType.API_ERROR;
    }

    return ErrorType.UNKNOWN;
  }

  /**
   * Get current load level for context
   */
  private async getCurrentLoadLevel(modelName: string): Promise<'low' | 'medium' | 'high'> {
    const recentErrors = this.getRecentErrors(modelName, '5m');
    const errorRate = recentErrors.length / 300; // per second

    if (errorRate > 0.1) return 'high';
    if (errorRate > 0.05) return 'medium';
    return 'low';
  }

  /**
   * Advanced error pattern detection
   */
  private async detectErrorPatterns(modelName: string, errorEvent: ErrorEvent): Promise<void> {
    const recentErrors = this.getRecentErrors(modelName, '1h');

    // Time-based pattern detection
    await this.detectTimeBasedPatterns(modelName, recentErrors);

    // Load-based pattern detection
    await this.detectLoadBasedPatterns(modelName, recentErrors);

    // Input-based pattern detection
    await this.detectInputBasedPatterns(modelName, recentErrors);

    // User-based pattern detection
    await this.detectUserBasedPatterns(modelName, recentErrors);
  }

  /**
   * Detect time-based error patterns
   */
  private async detectTimeBasedPatterns(modelName: string, errors: ErrorEvent[]): Promise<void> {
    // Group errors by hour of day
    const hourlyDistribution = new Array(24).fill(0);
    errors.forEach(error => {
      const hour = error.timestamp.getHours();
      hourlyDistribution[hour]++;
    });

    // Find peak error hours
    const maxErrors = Math.max(...hourlyDistribution);
    const avgErrors = hourlyDistribution.reduce((sum, count) => sum + count, 0) / 24;

    if (maxErrors > avgErrors * 2) {
      const peakHours = hourlyDistribution
        .map((count, hour) => ({ hour, count }))
        .filter(item => item.count > avgErrors * 1.5)
        .map(item => item.hour);

      this.emit('patternDetected', {
        type: 'time_based',
        modelName,
        pattern: 'peak_hours_errors',
        details: { peakHours, maxErrors, avgErrors }
      });
    }

    // Weekly pattern detection
    const weeklyDistribution = new Array(7).fill(0);
    errors.forEach(error => {
      const day = error.timestamp.getDay();
      weeklyDistribution[day]++;
    });

    const maxWeeklyErrors = Math.max(...weeklyDistribution);
    const avgWeeklyErrors = weeklyDistribution.reduce((sum, count) => sum + count, 0) / 7;

    if (maxWeeklyErrors > avgWeeklyErrors * 2) {
      this.emit('patternDetected', {
        type: 'weekly_pattern',
        modelName,
        pattern: 'day_of_week_errors',
        details: { weeklyDistribution }
      });
    }
  }

  /**
   * Detect load-based error patterns
   */
  private async detectLoadBasedPatterns(modelName: string, errors: ErrorEvent[]): Promise<void> {
    const loadLevels = { low: 0, medium: 0, high: 0 };
    
    errors.forEach(error => {
      const loadLevel = error.context.loadLevel as keyof typeof loadLevels;
      if (loadLevel && loadLevels.hasOwnProperty(loadLevel)) {
        loadLevels[loadLevel]++;
      }
    });

    const totalErrors = Object.values(loadLevels).reduce((sum, count) => sum + count, 0);
    
    if (totalErrors > 0) {
      const highLoadErrorRate = loadLevels.high / totalErrors;
      
      if (highLoadErrorRate > 0.6) { // 60% of errors during high load
        this.emit('patternDetected', {
          type: 'load_based',
          modelName,
          pattern: 'high_load_correlation',
          details: { loadLevels, errorRate: highLoadErrorRate }
        });
      }
    }
  }

  /**
   * Detect input-based error patterns
   */
  private async detectInputBasedPatterns(modelName: string, errors: ErrorEvent[]): Promise<void> {
    // Group by input token ranges
    const tokenRanges = {
      small: 0,    // < 1000 tokens
      medium: 0,   // 1000-5000 tokens
      large: 0,    // 5000-15000 tokens
      xlarge: 0    // > 15000 tokens
    };

    errors.forEach(error => {
      const tokens = error.context.inputTokens || 0;
      if (tokens < 1000) tokenRanges.small++;
      else if (tokens < 5000) tokenRanges.medium++;
      else if (tokens < 15000) tokenRanges.large++;
      else tokenRanges.xlarge++;
    });

    const totalErrors = Object.values(tokenRanges).reduce((sum, count) => sum + count, 0);
    
    if (totalErrors > 0) {
      // Check for disproportionate errors in large requests
      const largeRequestErrorRate = (tokenRanges.large + tokenRanges.xlarge) / totalErrors;
      
      if (largeRequestErrorRate > 0.7) { // 70% of errors from large requests
        this.emit('patternDetected', {
          type: 'input_based',
          modelName,
          pattern: 'large_input_correlation',
          details: { tokenRanges, errorRate: largeRequestErrorRate }
        });
      }
    }
  }

  /**
   * Detect user-based error patterns
   */
  private async detectUserBasedPatterns(modelName: string, errors: ErrorEvent[]): Promise<void> {
    const userErrors = new Map<string, number>();
    
    errors.forEach(error => {
      if (error.userId) {
        userErrors.set(error.userId, (userErrors.get(error.userId) || 0) + 1);
      }
    });

    // Find users with disproportionate error rates
    const sortedUsers = Array.from(userErrors.entries())
      .sort((a, b) => b[1] - a[1]);

    if (sortedUsers.length > 0) {
      const topUserErrors = sortedUsers[0][1];
      const totalErrors = errors.length;
      
      if (topUserErrors / totalErrors > 0.3) { // Single user causing 30% of errors
        this.emit('patternDetected', {
          type: 'user_based',
          modelName,
          pattern: 'single_user_spike',
          details: { 
            userId: sortedUsers[0][0], 
            errorCount: topUserErrors,
            percentage: (topUserErrors / totalErrors) * 100
          }
        });
      }
    }
  }

  /**
   * Advanced error spike analysis
   */
  private async analyzeErrorSpike(modelName: string): Promise<{
    isSpike: boolean;
    rate: number;
    severity: 'minor' | 'moderate' | 'severe' | 'critical';
    cause?: string;
    recommendation?: string;
  }> {
    const recentErrors = this.getRecentErrors(modelName, '5m');
    const rate = recentErrors.length / 300; // errors per second

    // Baseline comparison
    const historicalErrors = this.getRecentErrors(modelName, '1h');
    const historicalRate = historicalErrors.length / 3600;
    
    const spikeMultiplier = rate / (historicalRate || 0.001);
    
    let isSpike = false;
    let severity: 'minor' | 'moderate' | 'severe' | 'critical' = 'minor';
    let cause: string | undefined;
    let recommendation: string | undefined;

    if (spikeMultiplier > 10 || rate > 1) {
      isSpike = true;
      severity = 'critical';
      cause = await this.identifySpikeCause(recentErrors);
      recommendation = 'Immediate investigation required - circuit breaker may engage';
    } else if (spikeMultiplier > 5 || rate > 0.5) {
      isSpike = true;
      severity = 'severe';
      cause = await this.identifySpikeCause(recentErrors);
      recommendation = 'Monitor closely and prepare fallback options';
    } else if (spikeMultiplier > 3 || rate > 0.2) {
      isSpike = true;
      severity = 'moderate';
      recommendation = 'Review recent changes and monitor trends';
    } else if (spikeMultiplier > 2 || rate > 0.1) {
      isSpike = true;
      severity = 'minor';
      recommendation = 'Increased monitoring recommended';
    }

    return { isSpike, rate, severity, cause, recommendation };
  }

  /**
   * Enhanced spike cause identification
   */
  private async identifySpikeCause(errors: ErrorEvent[]): Promise<string> {
    if (errors.length === 0) return 'Unknown cause';

    // Analyze error types
    const errorTypes = new Map<ErrorType, number>();
    errors.forEach(error => {
      errorTypes.set(error.errorType, (errorTypes.get(error.errorType) || 0) + 1);
    });

    const dominantErrorType = Array.from(errorTypes.entries())
      .sort((a, b) => b[1] - a[1])[0];

    const dominantPercentage = (dominantErrorType[1] / errors.length) * 100;

    if (dominantPercentage > 70) {
      switch (dominantErrorType[0]) {
        case ErrorType.RATE_LIMIT:
          return 'Rate limit exceeded - high traffic volume';
        case ErrorType.NETWORK_ERROR:
          return 'Network connectivity issues or provider outage';
        case ErrorType.MODEL_FAILURE:
          return 'Model service degradation or maintenance';
        case ErrorType.AUTHENTICATION:
          return 'Authentication issues - check API keys';
        case ErrorType.TIMEOUT:
          return 'Request timeout spike - possible overload';
        default:
          return `Dominant error type: ${dominantErrorType[0]}`;
      }
    }

    // Check for user patterns
    const userCounts = new Map<string, number>();
    errors.forEach(error => {
      if (error.userId) {
        userCounts.set(error.userId, (userCounts.get(error.userId) || 0) + 1);
      }
    });

    if (userCounts.size > 0) {
      const topUser = Array.from(userCounts.entries())
        .sort((a, b) => b[1] - a[1])[0];
      
      if (topUser[1] / errors.length > 0.5) {
        return `Single user (${topUser[0]}) causing majority of errors`;
      }
    }

    // Check for load correlation
    const highLoadErrors = errors.filter(e => e.context.loadLevel === 'high').length;
    if (highLoadErrors / errors.length > 0.8) {
      return 'High correlation with system load - capacity issue';
    }

    return 'Multiple factors - requires detailed investigation';
  }
}

// Export singleton instance
export const errorDetector = new ErrorDetector();