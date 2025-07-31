/**
 * Simple Intelligence System for Recoder.xyz
 * 
 * Provides basic AI intelligence and learning capabilities
 */

import { EventEmitter } from 'events';

export interface IntelligenceConfig {
  enablePatternLearning: boolean;
  enableContextMemory: boolean;
  enablePerformanceOptimization: boolean;
  enableRecommendations: boolean;
}

export interface UserPattern {
  id: string;
  userId: string;
  pattern: string;
  frequency: number;
  lastSeen: Date;
  confidence: number;
}

export interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: Date;
  success: boolean;
}

export interface Recommendation {
  id: string;
  type: 'optimization' | 'workflow' | 'feature';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  confidence: number;
}

export class SimpleIntelligence extends EventEmitter {
  private config: IntelligenceConfig;
  private patterns: Map<string, UserPattern> = new Map();
  private metrics: PerformanceMetric[] = [];
  private recommendations: Recommendation[] = [];

  constructor(config: Partial<IntelligenceConfig> = {}) {
    super();
    
    this.config = {
      enablePatternLearning: true,
      enableContextMemory: true,
      enablePerformanceOptimization: true,
      enableRecommendations: true,
      ...config
    };
  }

  /**
   * Track user behavior pattern
   */
  trackPattern(userId: string, pattern: string): void {
    if (!this.config.enablePatternLearning) return;

    const patternId = `${userId}:${pattern}`;
    const existing = this.patterns.get(patternId);

    if (existing) {
      existing.frequency++;
      existing.lastSeen = new Date();
      existing.confidence = Math.min(existing.confidence + 0.1, 1.0);
    } else {
      this.patterns.set(patternId, {
        id: patternId,
        userId,
        pattern,
        frequency: 1,
        lastSeen: new Date(),
        confidence: 0.5
      });
    }

    this.emit('patternTracked', { userId, pattern });
  }

  /**
   * Record performance metric
   */
  recordMetric(operation: string, duration: number, success: boolean = true): void {
    if (!this.config.enablePerformanceOptimization) return;

    const metric: PerformanceMetric = {
      operation,
      duration,
      timestamp: new Date(),
      success
    };

    this.metrics.push(metric);
    
    // Keep only last 1000 metrics
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }

    this.emit('metricRecorded', metric);
  }

  /**
   * Generate recommendations based on patterns and metrics
   */
  generateRecommendations(userId: string): Recommendation[] {
    if (!this.config.enableRecommendations) return [];

    const userPatterns = Array.from(this.patterns.values())
      .filter(p => p.userId === userId)
      .sort((a, b) => b.frequency - a.frequency);

    const recommendations: Recommendation[] = [];

    // Pattern-based recommendations
    if (userPatterns.length > 0) {
      const topPattern = userPatterns[0];
      if (topPattern.frequency >= 5) {
        recommendations.push({
          id: `pattern-${Date.now()}`,
          type: 'workflow',
          title: 'Create Custom Command',
          description: `You frequently use "${topPattern.pattern}". Consider creating a custom command for faster access.`,
          priority: 'medium',
          confidence: topPattern.confidence
        });
      }
    }

    // Performance-based recommendations
    const recentMetrics = this.metrics.slice(-100);
    const slowOperations = recentMetrics
      .filter(m => m.duration > 5000)
      .map(m => m.operation);

    if (slowOperations.length > 0) {
      const mostCommonSlow = slowOperations
        .reduce((acc, op) => {
          acc[op] = (acc[op] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

      const slowestOp = Object.entries(mostCommonSlow)
        .sort((a, b) => b[1] - a[1])[0];

      if (slowestOp) {
        recommendations.push({
          id: `perf-${Date.now()}`,
          type: 'optimization',
          title: 'Performance Optimization',
          description: `Operation "${slowestOp[0]}" is taking longer than usual. Consider optimizing or caching.`,
          priority: 'high',
          confidence: 0.8
        });
      }
    }

    this.recommendations = recommendations;
    return recommendations;
  }

  /**
   * Get user patterns
   */
  getPatterns(userId?: string): UserPattern[] {
    const patterns = Array.from(this.patterns.values());
    return userId ? patterns.filter(p => p.userId === userId) : patterns;
  }

  /**
   * Get performance metrics
   */
  getMetrics(operation?: string): PerformanceMetric[] {
    return operation 
      ? this.metrics.filter(m => m.operation === operation)
      : this.metrics;
  }

  /**
   * Get average performance for operation
   */
  getAveragePerformance(operation: string): number {
    const operationMetrics = this.metrics.filter(m => m.operation === operation);
    if (operationMetrics.length === 0) return 0;
    
    const total = operationMetrics.reduce((sum, m) => sum + m.duration, 0);
    return total / operationMetrics.length;
  }

  /**
   * Clear old data
   */
  cleanup(): void {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Remove old patterns
    for (const [key, pattern] of this.patterns.entries()) {
      if (pattern.lastSeen < oneWeekAgo) {
        this.patterns.delete(key);
      }
    }

    // Keep only recent metrics
    this.metrics = this.metrics.filter(m => m.timestamp > oneWeekAgo);
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      patterns: this.patterns.size,
      metrics: this.metrics.length,
      recommendations: this.recommendations.length,
      config: this.config
    };
  }
}

// Export singleton instance
export const intelligence = new SimpleIntelligence();
export default intelligence;