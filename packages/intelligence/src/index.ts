/**
 * Intelligence Package - AI Learning and Adaptation System
 * Exports all intelligence components for the Recoder ecosystem
 */

// Re-export from JavaScript files for compatibility
// Note: context-memory is now handled by CLI package directly
export * from '../cost-tracker'; 
export * from '../feedback-processor';
export * from '../performance-optimizer';
export * from '../recommendation-engine';
export * from '../user-pattern-analyzer';

// Intelligence system types
export interface IntelligenceConfig {
  memoryEnabled: boolean;
  costTrackingEnabled: boolean;
  feedbackProcessingEnabled: boolean;
  performanceOptimizationEnabled: boolean;
  recommendationEngineEnabled: boolean;
  patternAnalysisEnabled: boolean;
}

export interface IntelligenceMetrics {
  memoryUsage: number;
  costSavings: number;
  performanceGain: number;
  recommendationAccuracy: number;
  patternMatchScore: number;
}

// Default export for convenience
export default {
  version: '1.0.0',
  name: '@recoder/intelligence'
};