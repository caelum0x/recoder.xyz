/**
 * A/B Testing Framework for Model Comparison
 * 
 * Comprehensive A/B testing system for comparing different AI models,
 * tracking user preferences, conducting statistical significance testing,
 * and enabling automatic model selection based on performance metrics.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';
import { QualityAssessmentResult } from './quality-assessor';

export interface ABTest {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'stopped';
  startTime: Date;
  endTime?: Date;
  duration?: number;                    // Test duration in hours
  
  // Test configuration
  config: {
    modelA: string;                     // Control model
    modelB: string;                     // Test model
    trafficSplit: number;               // Percentage to model B (0-100)
    targetSampleSize: number;           // Minimum samples needed
    significanceLevel: number;          // Statistical significance (e.g., 0.05)
    minimumEffect: number;              // Minimum detectable effect size
    
    // Test scope
    taskTypes?: string[];               // Specific task types to test
    userSegments?: string[];            // User segments to include
    regions?: string[];                 // Geographic regions
    timeWindows?: Array<{start: string; end: string}>; // Time-based restrictions
  };
  
  // Current results
  results: ABTestResults;
  
  // Test metadata
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
}

export interface ABTestResults {
  totalSamples: number;
  samplesA: number;                     // Control group size
  samplesB: number;                     // Test group size
  
  // Primary metrics
  qualityMetrics: {
    modelA: ModelTestMetrics;
    modelB: ModelTestMetrics;
    comparison: MetricComparison;
  };
  
  // User preference data
  userPreferences: {
    preferA: number;                    // Users preferring model A
    preferB: number;                    // Users preferring model B
    noPreference: number;               // Users with no preference
    confidenceInterval: [number, number];
  };
  
  // Statistical analysis
  statisticalSignificance: {
    isSignificant: boolean;
    pValue: number;
    confidenceLevel: number;
    effectSize: number;
    
    // Specific tests
    tTest?: TTestResult;
    chiSquare?: ChiSquareResult;
    mannWhitney?: MannWhitneyResult;
  };
  
  // Business metrics
  businessImpact: {
    costDifference: number;             // Cost per request difference
    latencyDifference: number;          // Average latency difference
    errorRateDifference: number;        // Error rate difference
    userSatisfactionDifference: number; // User satisfaction difference
  };
  
  // Recommendation
  recommendation: {
    winner: 'A' | 'B' | 'inconclusive';
    confidence: number;                 // 0-1 confidence in recommendation
    reasoning: string[];
    nextActions: string[];
  };
}

export interface ModelTestMetrics {
  model: string;
  samples: number;
  
  // Quality scores
  avgQualityScore: number;
  qualityScoreStdDev: number;
  qualityDistribution: Record<string, number>; // Score buckets
  
  // Performance metrics
  avgLatency: number;
  latencyP95: number;
  avgCost: number;
  errorRate: number;
  
  // User feedback
  avgUserRating: number;
  userRatingStdDev: number;
  positiveRatings: number;
  negativeRatings: number;
  
  // Task-specific performance
  taskPerformance: Record<string, {
    samples: number;
    avgScore: number;
    successRate: number;
  }>;
}

export interface MetricComparison {
  qualityImprovement: number;           // % improvement from A to B
  latencyChange: number;                // % change in latency
  costChange: number;                   // % change in cost
  errorRateChange: number;              // % change in error rate
  userSatisfactionChange: number;       // % change in satisfaction
  
  // Statistical confidence for each metric
  qualityConfidence: number;
  latencyConfidence: number;
  costConfidence: number;
  errorRateConfidence: number;
  satisfactionConfidence: number;
}

export interface TTestResult {
  testStatistic: number;
  pValue: number;
  degreesOfFreedom: number;
  criticalValue: number;
  isSignificant: boolean;
}

export interface ChiSquareResult {
  testStatistic: number;
  pValue: number;
  degreesOfFreedom: number;
  criticalValue: number;
  isSignificant: boolean;
  expectedValues: number[][];
  observedValues: number[][];
}

export interface MannWhitneyResult {
  uStatistic: number;
  pValue: number;
  zScore: number;
  isSignificant: boolean;
  medianDifference: number;
}

export interface TestAssignment {
  requestId: string;
  testId: string;
  userId?: string;
  assignedModel: 'A' | 'B';
  timestamp: Date;
  taskType: string;
  
  // Context information
  userSegment?: string;
  region?: string;
  sessionId?: string;
}

export interface TestFeedback {
  requestId: string;
  testId: string;
  userId?: string;
  
  // Feedback data
  userRating: number;                   // 1-5 scale
  preference: 'A' | 'B' | 'none';       // If user saw both
  qualityAssessment?: QualityAssessmentResult;
  
  // Performance data
  latency: number;
  cost: number;
  success: boolean;
  errorType?: string;
  
  timestamp: Date;
}

export class ABTestingFramework extends EventEmitter {
  private activeTests: Map<string, ABTest> = new Map();
  private testHistory: ABTest[] = [];
  private assignments: Map<string, TestAssignment> = new Map();
  private feedback: Map<string, TestFeedback[]> = new Map();
  
  private config = {
    maxConcurrentTests: 5,
    defaultTestDuration: 168,            // 1 week in hours
    minSampleSize: 100,
    maxSampleSize: 10000,
    defaultSignificanceLevel: 0.05,
    assignmentCacheSize: 10000,
  };

  constructor() {
    super();
  }

  /**
   * Create and start a new A/B test
   */
  async createTest(testConfig: {
    name: string;
    description: string;
    modelA: string;
    modelB: string;
    trafficSplit?: number;
    targetSampleSize?: number;
    duration?: number;
    significanceLevel?: number;
    taskTypes?: string[];
    userSegments?: string[];
    createdBy: string;
    tags?: string[];
  }): Promise<string> {
    // Validate configuration
    await this.validateTestConfig(testConfig);
    
    // Check concurrent test limits
    if (this.activeTests.size >= this.config.maxConcurrentTests) {
      throw new Error(`Maximum concurrent tests limit reached (${this.config.maxConcurrentTests})`);
    }

    const testId = `abtest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const test: ABTest = {
      id: testId,
      name: testConfig.name,
      description: testConfig.description,
      status: 'draft',
      startTime: new Date(),
      duration: testConfig.duration || this.config.defaultTestDuration,
      
      config: {
        modelA: testConfig.modelA,
        modelB: testConfig.modelB,
        trafficSplit: testConfig.trafficSplit || 50,
        targetSampleSize: testConfig.targetSampleSize || this.config.minSampleSize,
        significanceLevel: testConfig.significanceLevel || this.config.defaultSignificanceLevel,
        minimumEffect: 0.05, // 5% minimum detectable effect
        taskTypes: testConfig.taskTypes,
        userSegments: testConfig.userSegments,
      },
      
      results: this.initializeResults(),
      
      createdBy: testConfig.createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: testConfig.tags || []
    };

    this.activeTests.set(testId, test);
    
    Logger.info(`Created A/B test: ${test.name} (${testConfig.modelA} vs ${testConfig.modelB})`);
    this.emit('testCreated', test);
    
    return testId;
  }

  /**
   * Start an A/B test
   */
  async startTest(testId: string): Promise<void> {
    const test = this.activeTests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    if (test.status !== 'draft') {
      throw new Error(`Test ${testId} is not in draft status`);
    }

    test.status = 'running';
    test.startTime = new Date();
    
    if (test.duration) {
      test.endTime = new Date(Date.now() + test.duration * 60 * 60 * 1000);
    }

    test.updatedAt = new Date();
    this.activeTests.set(testId, test);

    Logger.info(`Started A/B test: ${test.name}`);
    this.emit('testStarted', test);
  }

  /**
   * Assign a model for a request based on active tests
   */
  async assignModel(request: {
    taskType: string;
    userId?: string;
    userSegment?: string;
    region?: string;
    sessionId?: string;
  }): Promise<{
    model: string;
    testId?: string;
    assignment?: 'A' | 'B';
  }> {
    // Find applicable tests
    const applicableTests = this.findApplicableTests(request);
    
    if (applicableTests.length === 0) {
      // No active tests, return default model
      return { model: this.getDefaultModel(request.taskType) };
    }

    // For simplicity, use the first applicable test
    // In production, you might want more sophisticated logic
    const test = applicableTests[0];
    const assignment = this.determineAssignment(test, request);
    
    const model = assignment === 'A' ? test.config.modelA : test.config.modelB;
    
    // Store assignment
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const assignmentRecord: TestAssignment = {
      requestId,
      testId: test.id,
      userId: request.userId,
      assignedModel: assignment,
      timestamp: new Date(),
      taskType: request.taskType,
      userSegment: request.userSegment,
      region: request.region,
      sessionId: request.sessionId
    };

    this.assignments.set(requestId, assignmentRecord);
    
    // Cleanup old assignments to prevent memory leaks
    if (this.assignments.size > this.config.assignmentCacheSize) {
      this.cleanupOldAssignments();
    }

    return { model, testId: test.id, assignment };
  }

  /**
   * Record feedback for a test assignment
   */
  async recordFeedback(requestId: string, feedbackData: {
    userRating?: number;
    preference?: 'A' | 'B' | 'none';
    qualityAssessment?: QualityAssessmentResult;
    latency: number;
    cost: number;
    success: boolean;
    errorType?: string;
  }): Promise<void> {
    const assignment = this.assignments.get(requestId);
    if (!assignment) {
      Logger.warn(`No assignment found for request ${requestId}`);
      return;
    }

    const feedback: TestFeedback = {
      requestId,
      testId: assignment.testId,
      userId: assignment.userId,
      userRating: feedbackData.userRating || 3,
      preference: feedbackData.preference || 'none',
      qualityAssessment: feedbackData.qualityAssessment,
      latency: feedbackData.latency,
      cost: feedbackData.cost,
      success: feedbackData.success,
      errorType: feedbackData.errorType,
      timestamp: new Date()
    };

    // Store feedback
    const testFeedback = this.feedback.get(assignment.testId) || [];
    testFeedback.push(feedback);
    this.feedback.set(assignment.testId, testFeedback);

    // Update test results
    await this.updateTestResults(assignment.testId);

    Logger.debug(`Recorded feedback for test ${assignment.testId}, request ${requestId}`);
  }

  /**
   * Get current test results
   */
  getTestResults(testId: string): ABTestResults | null {
    const test = this.activeTests.get(testId);
    return test ? test.results : null;
  }

  /**
   * Stop a running test
   */
  async stopTest(testId: string, reason?: string): Promise<void> {
    const test = this.activeTests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    if (test.status !== 'running') {
      throw new Error(`Test ${testId} is not running`);
    }

    test.status = 'stopped';
    test.endTime = new Date();
    test.updatedAt = new Date();

    // Final results calculation
    await this.calculateFinalResults(testId);

    // Move to history
    this.testHistory.push(test);
    this.activeTests.delete(testId);

    Logger.info(`Stopped A/B test: ${test.name}${reason ? ` (${reason})` : ''}`);
    this.emit('testStopped', test);
  }

  /**
   * Get active tests
   */
  getActiveTests(): ABTest[] {
    return Array.from(this.activeTests.values());
  }

  /**
   * Get test history
   */
  getTestHistory(limit: number = 50): ABTest[] {
    return this.testHistory
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Check for tests that should be automatically completed
   */
  async checkTestCompletion(): Promise<void> {
    for (const [testId, test] of this.activeTests) {
      if (test.status !== 'running') continue;

      const shouldComplete = await this.shouldCompleteTest(test);
      
      if (shouldComplete) {
        await this.completeTest(testId);
      }
    }
  }

  // Private helper methods

  private async validateTestConfig(config: any): Promise<void> {
    if (!config.name || !config.modelA || !config.modelB) {
      throw new Error('Test name, modelA, and modelB are required');
    }

    if (config.modelA === config.modelB) {
      throw new Error('ModelA and ModelB must be different');
    }

    if (config.trafficSplit && (config.trafficSplit < 1 || config.trafficSplit > 99)) {
      throw new Error('Traffic split must be between 1 and 99');
    }

    if (config.targetSampleSize && config.targetSampleSize < this.config.minSampleSize) {
      throw new Error(`Target sample size must be at least ${this.config.minSampleSize}`);
    }
  }

  private initializeResults(): ABTestResults {
    return {
      totalSamples: 0,
      samplesA: 0,
      samplesB: 0,
      
      qualityMetrics: {
        modelA: this.initializeModelMetrics('A'),
        modelB: this.initializeModelMetrics('B'),
        comparison: this.initializeComparison()
      },
      
      userPreferences: {
        preferA: 0,
        preferB: 0,
        noPreference: 0,
        confidenceInterval: [0, 0]
      },
      
      statisticalSignificance: {
        isSignificant: false,
        pValue: 1.0,
        confidenceLevel: 0.05,
        effectSize: 0
      },
      
      businessImpact: {
        costDifference: 0,
        latencyDifference: 0,
        errorRateDifference: 0,
        userSatisfactionDifference: 0
      },
      
      recommendation: {
        winner: 'inconclusive',
        confidence: 0,
        reasoning: [],
        nextActions: []
      }
    };
  }

  private initializeModelMetrics(model: string): ModelTestMetrics {
    return {
      model,
      samples: 0,
      avgQualityScore: 0,
      qualityScoreStdDev: 0,
      qualityDistribution: {},
      avgLatency: 0,
      latencyP95: 0,
      avgCost: 0,
      errorRate: 0,
      avgUserRating: 0,
      userRatingStdDev: 0,
      positiveRatings: 0,
      negativeRatings: 0,
      taskPerformance: {}
    };
  }

  private initializeComparison(): MetricComparison {
    return {
      qualityImprovement: 0,
      latencyChange: 0,
      costChange: 0,
      errorRateChange: 0,
      userSatisfactionChange: 0,
      qualityConfidence: 0,
      latencyConfidence: 0,
      costConfidence: 0,
      errorRateConfidence: 0,
      satisfactionConfidence: 0
    };
  }

  private findApplicableTests(request: any): ABTest[] {
    return Array.from(this.activeTests.values()).filter(test => {
      if (test.status !== 'running') return false;
      
      // Check task type filter
      if (test.config.taskTypes && !test.config.taskTypes.includes(request.taskType)) {
        return false;
      }
      
      // Check user segment filter
      if (test.config.userSegments && request.userSegment && 
          !test.config.userSegments.includes(request.userSegment)) {
        return false;
      }
      
      // Check region filter
      if (test.config.regions && request.region && 
          !test.config.regions.includes(request.region)) {
        return false;
      }
      
      return true;
    });
  }

  private determineAssignment(test: ABTest, request: any): 'A' | 'B' {
    // Use hash-based assignment for consistency
    const hashInput = `${test.id}_${request.userId || 'anonymous'}_${request.sessionId || ''}`;
    const hash = this.simpleHash(hashInput);
    const percentage = hash % 100;
    
    return percentage < test.config.trafficSplit ? 'B' : 'A';
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private getDefaultModel(taskType: string): string {
    // Return default model based on task type
    const defaults: Record<string, string> = {
      'code_generation': 'claude-sonnet-4',
      'text_analysis': 'groq-llama3-70b',
      'creative_writing': 'gemini-2.5-pro',
      'data_processing': 'mistral-large-2407'
    };
    
    return defaults[taskType] || 'claude-sonnet-4';
  }

  private async updateTestResults(testId: string): Promise<void> {
    const test = this.activeTests.get(testId);
    if (!test) return;

    const feedbackData = this.feedback.get(testId) || [];
    
    // Calculate updated metrics
    const updatedResults = await this.calculateTestResults(test, feedbackData);
    test.results = updatedResults;
    test.updatedAt = new Date();
    
    this.activeTests.set(testId, test);
    
    // Check if test should be completed early due to significance
    if (updatedResults.statisticalSignificance.isSignificant && 
        updatedResults.totalSamples >= test.config.targetSampleSize) {
      Logger.info(`Test ${testId} reached statistical significance with sufficient samples`);
    }
  }

  private async calculateTestResults(test: ABTest, feedbackData: TestFeedback[]): Promise<ABTestResults> {
    const results = this.initializeResults();
    
    if (feedbackData.length === 0) {
      return results;
    }

    // Separate feedback by model assignment
    const assignments = Array.from(this.assignments.values())
      .filter(a => a.testId === test.id);
    
    const feedbackA = feedbackData.filter(f => {
      const assignment = assignments.find(a => a.requestId === f.requestId);
      return assignment?.assignedModel === 'A';
    });
    
    const feedbackB = feedbackData.filter(f => {
      const assignment = assignments.find(a => a.requestId === f.requestId);
      return assignment?.assignedModel === 'B';
    });

    // Calculate basic metrics
    results.totalSamples = feedbackData.length;
    results.samplesA = feedbackA.length;
    results.samplesB = feedbackB.length;

    // Calculate model-specific metrics
    results.qualityMetrics.modelA = this.calculateModelMetrics(test.config.modelA, feedbackA);
    results.qualityMetrics.modelB = this.calculateModelMetrics(test.config.modelB, feedbackB);
    
    // Calculate comparisons
    results.qualityMetrics.comparison = this.calculateComparison(
      results.qualityMetrics.modelA,
      results.qualityMetrics.modelB
    );

    // Calculate user preferences
    results.userPreferences = this.calculateUserPreferences(feedbackData);

    // Calculate statistical significance
    results.statisticalSignificance = await this.calculateStatisticalSignificance(
      feedbackA, feedbackB, test.config.significanceLevel
    );

    // Calculate business impact
    results.businessImpact = this.calculateBusinessImpact(
      results.qualityMetrics.modelA,
      results.qualityMetrics.modelB
    );

    // Generate recommendation
    results.recommendation = this.generateRecommendation(results, test);

    return results;
  }

  private calculateModelMetrics(modelName: string, feedback: TestFeedback[]): ModelTestMetrics {
    if (feedback.length === 0) {
      return this.initializeModelMetrics(modelName);
    }

    const qualityScores = feedback
      .filter(f => f.qualityAssessment)
      .map(f => f.qualityAssessment!.overallScore);
    
    const latencies = feedback.map(f => f.latency);
    const costs = feedback.map(f => f.cost);
    const userRatings = feedback.filter(f => f.userRating > 0).map(f => f.userRating);
    const errors = feedback.filter(f => !f.success);
    
    return {
      model: modelName,
      samples: feedback.length,
      avgQualityScore: this.average(qualityScores),
      qualityScoreStdDev: this.standardDeviation(qualityScores),
      qualityDistribution: this.createDistribution(qualityScores, 10),
      avgLatency: this.average(latencies),
      latencyP95: this.percentile(latencies, 95),
      avgCost: this.average(costs),
      errorRate: errors.length / feedback.length,
      avgUserRating: this.average(userRatings),
      userRatingStdDev: this.standardDeviation(userRatings),
      positiveRatings: userRatings.filter(r => r >= 4).length,
      negativeRatings: userRatings.filter(r => r <= 2).length,
      taskPerformance: this.calculateTaskPerformance(feedback)
    };
  }

  private calculateComparison(metricsA: ModelTestMetrics, metricsB: ModelTestMetrics): MetricComparison {
    const safePercentageChange = (a: number, b: number): number => {
      if (a === 0) return b === 0 ? 0 : 100;
      return ((b - a) / a) * 100;
    };

    return {
      qualityImprovement: safePercentageChange(metricsA.avgQualityScore, metricsB.avgQualityScore),
      latencyChange: safePercentageChange(metricsA.avgLatency, metricsB.avgLatency),
      costChange: safePercentageChange(metricsA.avgCost, metricsB.avgCost),
      errorRateChange: safePercentageChange(metricsA.errorRate, metricsB.errorRate),
      userSatisfactionChange: safePercentageChange(metricsA.avgUserRating, metricsB.avgUserRating),
      
      // Simplified confidence calculations (would use proper statistical methods in production)
      qualityConfidence: Math.min(0.95, Math.max(metricsA.samples, metricsB.samples) / 100),
      latencyConfidence: Math.min(0.95, Math.max(metricsA.samples, metricsB.samples) / 100),
      costConfidence: Math.min(0.95, Math.max(metricsA.samples, metricsB.samples) / 100),
      errorRateConfidence: Math.min(0.95, Math.max(metricsA.samples, metricsB.samples) / 100),
      satisfactionConfidence: Math.min(0.95, Math.max(metricsA.samples, metricsB.samples) / 100)
    };
  }

  private calculateUserPreferences(feedback: TestFeedback[]): ABTestResults['userPreferences'] {
    const preferences = feedback.filter(f => f.preference !== 'none');
    const preferA = preferences.filter(f => f.preference === 'A').length;
    const preferB = preferences.filter(f => f.preference === 'B').length;
    const noPreference = feedback.filter(f => f.preference === 'none').length;
    
    // Simple confidence interval calculation
    const total = preferA + preferB;
    const proportion = total > 0 ? preferB / total : 0.5;
    const standardError = total > 0 ? Math.sqrt(proportion * (1 - proportion) / total) : 0.5;
    const marginOfError = 1.96 * standardError; // 95% confidence interval
    
    return {
      preferA,
      preferB,
      noPreference,
      confidenceInterval: [
        Math.max(0, proportion - marginOfError),
        Math.min(1, proportion + marginOfError)
      ]
    };
  }

  private async calculateStatisticalSignificance(
    feedbackA: TestFeedback[],
    feedbackB: TestFeedback[],
    significanceLevel: number
  ): Promise<ABTestResults['statisticalSignificance']> {
    if (feedbackA.length < 10 || feedbackB.length < 10) {
      return {
        isSignificant: false,
        pValue: 1.0,
        confidenceLevel: significanceLevel,
        effectSize: 0
      };
    }

    // Simplified t-test for quality scores
    const scoresA = feedbackA
      .filter(f => f.qualityAssessment)
      .map(f => f.qualityAssessment!.overallScore);
    const scoresB = feedbackB
      .filter(f => f.qualityAssessment)
      .map(f => f.qualityAssessment!.overallScore);

    if (scoresA.length === 0 || scoresB.length === 0) {
      return {
        isSignificant: false,
        pValue: 1.0,
        confidenceLevel: significanceLevel,
        effectSize: 0
      };
    }

    const tTestResult = this.performTTest(scoresA, scoresB);
    const effectSize = this.calculateCohenD(scoresA, scoresB);

    return {
      isSignificant: tTestResult.pValue < significanceLevel,
      pValue: tTestResult.pValue,
      confidenceLevel: significanceLevel,
      effectSize,
      tTest: tTestResult
    };
  }

  private calculateBusinessImpact(metricsA: ModelTestMetrics, metricsB: ModelTestMetrics): ABTestResults['businessImpact'] {
    return {
      costDifference: metricsB.avgCost - metricsA.avgCost,
      latencyDifference: metricsB.avgLatency - metricsA.avgLatency,
      errorRateDifference: metricsB.errorRate - metricsA.errorRate,
      userSatisfactionDifference: metricsB.avgUserRating - metricsA.avgUserRating
    };
  }

  private generateRecommendation(results: ABTestResults, test: ABTest): ABTestResults['recommendation'] {
    const reasoning: string[] = [];
    const nextActions: string[] = [];
    let winner: 'A' | 'B' | 'inconclusive' = 'inconclusive';
    let confidence = 0;

    // Check statistical significance
    if (!results.statisticalSignificance.isSignificant) {
      reasoning.push('Results are not statistically significant');
      nextActions.push('Continue test to gather more data');
      nextActions.push('Consider increasing traffic allocation');
    } else {
      reasoning.push(`Results are statistically significant (p=${results.statisticalSignificance.pValue.toFixed(4)})`);
      
      // Determine winner based on primary metrics
      const qualityImprovement = results.qualityMetrics.comparison.qualityImprovement;
      const costChange = results.qualityMetrics.comparison.costChange;
      const userSatisfactionChange = results.qualityMetrics.comparison.userSatisfactionChange;
      
      if (qualityImprovement > 5) { // 5% improvement threshold
        winner = 'B';
        confidence += 0.4;
        reasoning.push(`Model B shows ${qualityImprovement.toFixed(1)}% quality improvement`);
      } else if (qualityImprovement < -5) {
        winner = 'A';
        confidence += 0.4;
        reasoning.push(`Model A shows ${Math.abs(qualityImprovement).toFixed(1)}% better quality`);
      }
      
      if (costChange < -10) { // 10% cost reduction
        winner = winner === 'inconclusive' ? 'B' : winner;
        confidence += 0.3;
        reasoning.push(`Model B reduces costs by ${Math.abs(costChange).toFixed(1)}%`);
      } else if (costChange > 10) {
        winner = winner === 'inconclusive' ? 'A' : winner;
        confidence += 0.3;
        reasoning.push(`Model A is ${costChange.toFixed(1)}% more cost-effective`);
      }
      
      if (userSatisfactionChange > 0.2) { // 0.2 point improvement
        winner = winner === 'inconclusive' ? 'B' : winner;
        confidence += 0.3;
        reasoning.push(`Model B shows better user satisfaction`);
      } else if (userSatisfactionChange < -0.2) {
        winner = winner === 'inconclusive' ? 'A' : winner;  
        confidence += 0.3;
        reasoning.push(`Model A shows better user satisfaction`);
      }
    }

    // Generate next actions based on winner
    if (winner === 'A') {
      nextActions.push('Continue using Model A as primary');
      nextActions.push('Consider optimizing Model B further');
    } else if (winner === 'B') {
      nextActions.push('Gradually roll out Model B to all traffic');
      nextActions.push('Monitor performance during rollout');
    } else {
      nextActions.push('Extend test duration to gather more data');
      nextActions.push('Consider testing with different parameters');
    }

    return {
      winner,
      confidence: Math.min(1, confidence),
      reasoning,
      nextActions
    };
  }

  private async shouldCompleteTest(test: ABTest): boolean {
    // Check if test duration has passed
    if (test.endTime && new Date() > test.endTime) {
      return true;
    }

    // Check if target sample size is reached and results are significant
    if (test.results.totalSamples >= test.config.targetSampleSize &&
        test.results.statisticalSignificance.isSignificant) {
      return true;
    }

    // Check if maximum sample size is reached
    if (test.results.totalSamples >= this.config.maxSampleSize) {
      return true;
    }

    return false;
  }

  private async completeTest(testId: string): Promise<void> {
    const test = this.activeTests.get(testId);
    if (!test) return;

    test.status = 'completed';
    test.endTime = new Date();
    test.updatedAt = new Date();

    // Final calculations
    await this.calculateFinalResults(testId);

    // Move to history
    this.testHistory.push(test);
    this.activeTests.delete(testId);

    Logger.info(`Completed A/B test: ${test.name}`);
    this.emit('testCompleted', test);
  }

  private async calculateFinalResults(testId: string): Promise<void> {
    const test = this.activeTests.get(testId) || 
                 this.testHistory.find(t => t.id === testId);
    
    if (!test) return;

    const feedbackData = this.feedback.get(testId) || [];
    test.results = await this.calculateTestResults(test, feedbackData);
    
    Logger.info(`Final results for test ${testId}: ${test.results.recommendation.winner} wins with ${(test.results.recommendation.confidence * 100).toFixed(1)}% confidence`);
  }

  private cleanupOldAssignments(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
    const toDelete: string[] = [];
    
    for (const [requestId, assignment] of this.assignments) {
      if (assignment.timestamp.getTime() < cutoff) {
        toDelete.push(requestId);
      }
    }
    
    toDelete.forEach(requestId => this.assignments.delete(requestId));
    Logger.debug(`Cleaned up ${toDelete.length} old assignments`);
  }

  // Statistical helper methods

  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }

  private standardDeviation(numbers: number[]): number {
    if (numbers.length < 2) return 0;
    const avg = this.average(numbers);
    const squaredDiffs = numbers.map(n => Math.pow(n - avg, 2));
    return Math.sqrt(this.average(squaredDiffs));
  }

  private percentile(numbers: number[], p: number): number {
    if (numbers.length === 0) return 0;
    const sorted = numbers.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p / 100) - 1;
    return sorted[Math.max(0, index)];
  }

  private createDistribution(numbers: number[], buckets: number): Record<string, number> {
    if (numbers.length === 0) return {};
    
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    const bucketSize = (max - min) / buckets;
    const distribution: Record<string, number> = {};
    
    for (let i = 0; i < buckets; i++) {
      const bucketMin = min + i * bucketSize;
      const bucketMax = min + (i + 1) * bucketSize;
      const key = `${bucketMin.toFixed(2)}-${bucketMax.toFixed(2)}`;
      distribution[key] = numbers.filter(n => n >= bucketMin && n < bucketMax).length;
    }
    
    return distribution;
  }

  private calculateTaskPerformance(feedback: TestFeedback[]): Record<string, any> {
    const taskGroups = new Map<string, TestFeedback[]>();
    
    // Group feedback by task type
    const assignments = Array.from(this.assignments.values());
    feedback.forEach(f => {
      const assignment = assignments.find(a => a.requestId === f.requestId);
      if (assignment) {
        const taskType = assignment.taskType;
        if (!taskGroups.has(taskType)) {
          taskGroups.set(taskType, []);
        }
        taskGroups.get(taskType)!.push(f);
      }
    });
    
    const performance: Record<string, any> = {};
    for (const [taskType, taskFeedback] of taskGroups) {
      const qualityScores = taskFeedback
        .filter(f => f.qualityAssessment)
        .map(f => f.qualityAssessment!.overallScore);
      
      performance[taskType] = {
        samples: taskFeedback.length,
        avgScore: this.average(qualityScores),
        successRate: taskFeedback.filter(f => f.success).length / taskFeedback.length
      };
    }
    
    return performance;
  }

  private performTTest(samplesA: number[], samplesB: number[]): TTestResult {
    if (samplesA.length === 0 || samplesB.length === 0) {
      return {
        testStatistic: 0,
        pValue: 1.0,
        degreesOfFreedom: 0,
        criticalValue: 0,
        isSignificant: false
      };
    }

    const meanA = this.average(samplesA);
    const meanB = this.average(samplesB);
    const stdA = this.standardDeviation(samplesA);
    const stdB = this.standardDeviation(samplesB);
    const nA = samplesA.length;
    const nB = samplesB.length;

    // Welch's t-test (unequal variances)
    const pooledStd = Math.sqrt((stdA * stdA / nA) + (stdB * stdB / nB));
    const testStatistic = pooledStd === 0 ? 0 : (meanB - meanA) / pooledStd;
    
    const degreesOfFreedom = nA + nB - 2;
    
    // Simplified p-value calculation (would use proper distribution in production)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(testStatistic)));
    
    return {
      testStatistic,
      pValue: Math.max(0.001, Math.min(1.0, pValue)), // Clamp to reasonable range
      degreesOfFreedom,
      criticalValue: 1.96, // For 95% confidence
      isSignificant: pValue < 0.05
    };
  }

  private calculateCohenD(samplesA: number[], samplesB: number[]): number {
    if (samplesA.length === 0 || samplesB.length === 0) return 0;
    
    const meanA = this.average(samplesA);
    const meanB = this.average(samplesB);
    const stdA = this.standardDeviation(samplesA);
    const stdB = this.standardDeviation(samplesB);
    
    const pooledStd = Math.sqrt(((samplesA.length - 1) * stdA * stdA + 
                                (samplesB.length - 1) * stdB * stdB) / 
                               (samplesA.length + samplesB.length - 2));
    
    return pooledStd === 0 ? 0 : (meanB - meanA) / pooledStd;
  }

  private normalCDF(x: number): number {
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
}

// Export singleton instance
export const abTestingFramework = new ABTestingFramework();