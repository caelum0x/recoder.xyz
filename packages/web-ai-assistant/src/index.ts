/**
 * @recoder/web-ai-assistant
 * Shared AI assistant package for all Recoder platforms
 */

// Core AI Assistant
export { 
  WebAIAssistant,
  type AIAssistantConfig,
  type CodeCompletionRequest,
  type CodeCompletionResponse,
  type RefactoringRequest,
  type RefactoringResponse,
  type CodeAnalysisResult,
  type AssistantState
} from './web-ai-assistant';

// Engines
export { CodeCompletionEngine, type CompletionCandidate } from './engines/completion-engine';
export { RefactoringEngine, type RefactoringOption } from './engines/refactoring-engine';  
export { CodeGenerationEngine, type GenerationResult } from './engines/generation-engine';
export { RealTimeAnalyzer, type AnalysisResult } from './engines/realtime-analyzer';
export { ContextManager, type ProjectContext } from './engines/context-manager';

// Utilities
export { AIModelRouter } from './utils/model-router';
export { CodePatternDetector } from './utils/pattern-detector';
export { PerformanceOptimizer } from './utils/performance-optimizer';

// Create default instance
import { WebAIAssistant, type AIAssistantConfig } from './web-ai-assistant';
import { CodeCompletionEngine } from './engines/completion-engine';
import { RefactoringEngine } from './engines/refactoring-engine';  
import { CodeGenerationEngine } from './engines/generation-engine';
import { RealTimeAnalyzer } from './engines/realtime-analyzer';
import { ContextManager } from './engines/context-manager';
import { AIModelRouter } from './utils/model-router';
import { CodePatternDetector } from './utils/pattern-detector';
import { PerformanceOptimizer } from './utils/performance-optimizer';

/**
 * Factory function to create a configured WebAIAssistant instance
 */
export const createWebAIAssistant = (config: AIAssistantConfig) => {
  return new WebAIAssistant(config);
};

/**
 * Default export for convenience
 */
export default {
  WebAIAssistant,
  CodeCompletionEngine,
  RefactoringEngine,
  CodeGenerationEngine,
  RealTimeAnalyzer,
  ContextManager,
  AIModelRouter,
  CodePatternDetector,
  PerformanceOptimizer,
  createWebAIAssistant
};