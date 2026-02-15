import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('ABTesting');
/**
 * A/B Testing System for Prompt Strategy Optimization
 * Automatically discovers the most effective prompt strategies
 */

export interface ABTestConfig {
  enabled: boolean;
  testId: string;
  variants: ABTestVariant[];
  splitRatio: number[]; // e.g., [0.5, 0.3, 0.2] for 50/30/20 split
  minSampleSize: number;
  maxTestDuration: number; // in days
  confidenceLevel: number; // 0.95 for 95% confidence
}

export interface ABTestVariant {
  id: string;
  name: string;
  strategy: string;
  description: string;
  weight: number;
}

export interface ABTestResult {
  variantId: string;
  strategy: string;
  requests: number;
  avgTokensSaved: number;
  avgSavingsPercentage: number;
  avgResponseTime: number;
  qualityScore: number;
  costPerRequest: number;
  conversionRate: number; // successful generations / total attempts
}

export interface ABTestMetrics {
  testId: string;
  startDate: number;
  endDate?: number;
  status: 'running' | 'completed' | 'paused';
  results: Record<string, ABTestResult>;
  winner?: string;
  confidenceLevel: number;
  statisticalSignificance: boolean;
}

class ABTestingManager {
  private activeTests: Map<string, ABTestConfig> = new Map();
  private testResults: Map<string, ABTestMetrics> = new Map();
  private userAssignments: Map<string, string> = new Map(); // userId -> variantId

  // Default A/B test configurations
  private readonly DEFAULT_PROMPT_TEST: ABTestConfig = {
    enabled: true,
    testId: 'prompt-strategy-optimization-v1',
    variants: [
      {
        id: 'control',
        name: 'Smart Selection (Control)',
        strategy: 'smart',
        description: 'Current smart prompt selection algorithm',
        weight: 0.4
      },
      {
        id: 'minimal-aggressive',
        name: 'Aggressive Minimal',
        strategy: 'minimal',
        description: 'Use minimal prompts more aggressively',
        weight: 0.3
      },
      {
        id: 'template-focused',
        name: 'Template-First',
        strategy: 'template',
        description: 'Prioritize template-specific prompts',
        weight: 0.3
      }
    ],
    splitRatio: [0.4, 0.3, 0.3],
    minSampleSize: 100,
    maxTestDuration: 14, // 2 weeks
    confidenceLevel: 0.95
  };

  constructor() {
    this.initializeDefaultTests();
  }

  private initializeDefaultTests(): void {
    this.activeTests.set(
      this.DEFAULT_PROMPT_TEST.testId,
      this.DEFAULT_PROMPT_TEST
    );

    this.testResults.set(this.DEFAULT_PROMPT_TEST.testId, {
      testId: this.DEFAULT_PROMPT_TEST.testId,
      startDate: Date.now(),
      status: 'running',
      results: {},
      confidenceLevel: this.DEFAULT_PROMPT_TEST.confidenceLevel,
      statisticalSignificance: false
    });
  }

  /**
   * Get the optimal strategy for a user based on A/B testing
   */
  getStrategyForUser(
    userId: string,
    userMessage: string,
    conversationLength: number,
    testId: string = this.DEFAULT_PROMPT_TEST.testId
  ): string {
    const test = this.activeTests.get(testId);
    if (!test || !test.enabled) {
      return 'smart'; // fallback to smart strategy
    }

    // Check if user is already assigned to a variant
    const existingAssignment = this.userAssignments.get(`${userId}-${testId}`);
    if (existingAssignment) {
      const variant = test.variants.find(v => v.id === existingAssignment);
      return variant?.strategy || 'smart';
    }

    // Assign user to a variant based on weights
    const variant = this.assignUserToVariant(userId, test);
    this.userAssignments.set(`${userId}-${testId}`, variant.id);

    return variant.strategy;
  }

  /**
   * Record results for A/B test analysis
   */
  recordTestResult(
    userId: string,
    testId: string,
    metrics: {
      tokensSaved: number;
      savingsPercentage: number;
      responseTime: number;
      qualityScore: number;
      costPerRequest: number;
      successful: boolean;
    }
  ): void {
    const variantId = this.userAssignments.get(`${userId}-${testId}`);
    if (!variantId) return;

    const testMetrics = this.testResults.get(testId);
    if (!testMetrics) return;

    // Initialize result if it doesn't exist
    if (!testMetrics.results[variantId]) {
      const test = this.activeTests.get(testId);
      const variant = test?.variants.find(v => v.id === variantId);

      testMetrics.results[variantId] = {
        variantId,
        strategy: variant?.strategy || 'unknown',
        requests: 0,
        avgTokensSaved: 0,
        avgSavingsPercentage: 0,
        avgResponseTime: 0,
        qualityScore: 0,
        costPerRequest: 0,
        conversionRate: 0
      };
    }

    const result = testMetrics.results[variantId];
    const oldRequests = result.requests;
    const newRequests = oldRequests + 1;

    // Update running averages
    result.requests = newRequests;
    result.avgTokensSaved = this.updateRunningAverage(
      result.avgTokensSaved,
      metrics.tokensSaved,
      oldRequests,
      newRequests
    );
    result.avgSavingsPercentage = this.updateRunningAverage(
      result.avgSavingsPercentage,
      metrics.savingsPercentage,
      oldRequests,
      newRequests
    );
    result.avgResponseTime = this.updateRunningAverage(
      result.avgResponseTime,
      metrics.responseTime,
      oldRequests,
      newRequests
    );
    result.qualityScore = this.updateRunningAverage(
      result.qualityScore,
      metrics.qualityScore,
      oldRequests,
      newRequests
    );
    result.costPerRequest = this.updateRunningAverage(
      result.costPerRequest,
      metrics.costPerRequest,
      oldRequests,
      newRequests
    );

    // Update conversion rate
    const previousSuccesses = result.conversionRate * oldRequests;
    const newSuccesses = previousSuccesses + (metrics.successful ? 1 : 0);
    result.conversionRate = newSuccesses / newRequests;

    // Check if test should be concluded
    this.checkTestCompletion(testId);
  }

  /**
   * Get current A/B test results
   */
  getTestResults(testId: string): ABTestMetrics | null {
    return this.testResults.get(testId) || null;
  }

  /**
   * Get all active tests
   */
  getActiveTests(): ABTestConfig[] {
    return Array.from(this.activeTests.values()).filter(test => test.enabled);
  }

  /**
   * Determine the winning strategy with statistical significance
   */
  private checkTestCompletion(testId: string): void {
    const test = this.activeTests.get(testId);
    const metrics = this.testResults.get(testId);

    if (!test || !metrics) return;

    // Check if minimum sample size is reached
    const totalRequests = Object.values(metrics.results)
      .reduce((sum, result) => sum + result.requests, 0);

    if (totalRequests < test.minSampleSize) return;

    // Check if test duration exceeded
    const testDuration = (Date.now() - metrics.startDate) / (1000 * 60 * 60 * 24);
    if (testDuration > test.maxTestDuration) {
      this.concludeTest(testId);
      return;
    }

    // Calculate statistical significance
    const significance = this.calculateStatisticalSignificance(metrics.results);
    metrics.statisticalSignificance = significance.isSignificant;

    if (significance.isSignificant) {
      metrics.winner = significance.winner;
      this.concludeTest(testId);
    }
  }

  /**
   * Conclude a test and update system configuration
   */
  private concludeTest(testId: string): void {
    const metrics = this.testResults.get(testId);
    if (!metrics) return;

    metrics.status = 'completed';
    metrics.endDate = Date.now();

    // If we have a clear winner, update the default strategy
    if (metrics.winner && metrics.statisticalSignificance) {
      const winningResult = metrics.results[metrics.winner];
      logger.info(`A/B Test ${testId} concluded. Winner: ${metrics.winner} (${winningResult.strategy})`);

      // You could automatically update the system configuration here
      // For now, we'll just log the results
    }
  }

  /**
   * Statistical significance calculation using z-test
   */
  private calculateStatisticalSignificance(
    results: Record<string, ABTestResult>
  ): { isSignificant: boolean; winner?: string } {
    const variants = Object.values(results);
    if (variants.length < 2) return { isSignificant: false };

    // Compare primary metric (cost savings percentage)
    let bestVariant = variants[0];
    let significantDifference = false;

    for (let i = 1; i < variants.length; i++) {
      const current = variants[i];
      const zScore = this.calculateZScore(
        bestVariant.avgSavingsPercentage,
        current.avgSavingsPercentage,
        bestVariant.requests,
        current.requests
      );

      // Z-score > 1.96 indicates 95% confidence
      if (Math.abs(zScore) > 1.96) {
        significantDifference = true;
        if (current.avgSavingsPercentage > bestVariant.avgSavingsPercentage) {
          bestVariant = current;
        }
      }
    }

    return {
      isSignificant: significantDifference,
      winner: significantDifference ? bestVariant.variantId : undefined
    };
  }

  /**
   * Calculate Z-score for two variants
   */
  private calculateZScore(
    mean1: number,
    mean2: number,
    n1: number,
    n2: number
  ): number {
    // Simplified z-score calculation
    // In a real implementation, you'd want to use the actual standard deviations
    const pooledStdDev = Math.sqrt(((n1 - 1) + (n2 - 1)) / (n1 + n2 - 2));
    const standardError = pooledStdDev * Math.sqrt(1/n1 + 1/n2);

    return Math.abs(mean1 - mean2) / (standardError || 1);
  }

  /**
   * Assign user to variant based on weights
   */
  private assignUserToVariant(userId: string, test: ABTestConfig): ABTestVariant {
    // Use hash of userId for consistent assignment
    const hash = this.hashString(userId + test.testId);
    const random = (hash % 1000) / 1000; // Convert to 0-1 range

    let cumulativeWeight = 0;
    for (let i = 0; i < test.variants.length; i++) {
      cumulativeWeight += test.splitRatio[i];
      if (random <= cumulativeWeight) {
        return test.variants[i];
      }
    }

    return test.variants[0]; // fallback
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Update running average efficiently
   */
  private updateRunningAverage(
    currentAvg: number,
    newValue: number,
    oldCount: number,
    newCount: number
  ): number {
    return (currentAvg * oldCount + newValue) / newCount;
  }

  /**
   * Create a new A/B test
   */
  createTest(config: ABTestConfig): void {
    this.activeTests.set(config.testId, config);
    this.testResults.set(config.testId, {
      testId: config.testId,
      startDate: Date.now(),
      status: 'running',
      results: {},
      confidenceLevel: config.confidenceLevel,
      statisticalSignificance: false
    });
  }

  /**
   * Export test results for analysis
   */
  exportResults(): string {
    const allResults = Array.from(this.testResults.values());
    return JSON.stringify({
      exportDate: new Date().toISOString(),
      tests: allResults,
      version: '1.0'
    }, null, 2);
  }
}

// Global A/B testing instance
export const abTestingManager = new ABTestingManager();

// Utility functions
export const generateUserId = (request: Request): string => {
  // Generate consistent user ID from IP + User-Agent
  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Simple hash of IP + UserAgent for consistent user identification
  let hash = 0;
  const combined = `${ip}-${userAgent}`;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return Math.abs(hash).toString(36);
};