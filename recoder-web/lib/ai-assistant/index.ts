/**
 * Recoder Web AI Assistant
 * Re-export from shared package with platform-specific enhancements
 */

// Re-export everything from the shared package
export {
  WebAIAssistant,
  type AIAssistantConfig,
  type CodeCompletionRequest,
  type CodeCompletionResponse,
  type RefactoringRequest,
  type RefactoringResponse,
  type CodeAnalysisResult,
  type AssistantState,
  CodeCompletionEngine,
  type CompletionCandidate,
  RefactoringEngine,
  type RefactoringOption,
  CodeGenerationEngine,
  type GenerationResult,
  RealTimeAnalyzer,
  type AnalysisResult,
  ContextManager,
  type ProjectContext,
  AIModelRouter,
  CodePatternDetector,
  PerformanceOptimizer,
  createWebAIAssistant
} from 'recoder-web-ai-assistant';

// Platform-specific initialization
import { createWebAIAssistant as createSharedAssistant } from 'recoder-web-ai-assistant';
import { unifiedWebAI } from '../unified-web-ai';

/**
 * Create a Web AI Assistant configured for the recoder-web platform
 */
export const createRecoderWebAIAssistant = (config?: Partial<any>) => {
  const defaultConfig = {
    ai: {
      defaultModel: 'claude-3-sonnet',
      fallbackModels: ['gemini-2.0-flash', 'groq-llama'],
      maxContextTokens: 8000,
      temperature: 0.1,
      enableStreaming: true
    },
    features: {
      codeCompletion: true,
      inlineRefactoring: true,
      smartSuggestions: true,
      contextAwareness: true,
      realTimeAnalysis: true,
      collaborativeEditing: false
    },
    performance: {
      completionDebounceMs: 150,
      analysisThrottleMs: 500,
      cacheTimeout: 300000,
      maxConcurrentRequests: 3
    },
    crossPlatform: {
      enabled: true,
      syncContext: true,
      syncPreferences: true
    },
    ...config
  };

  return createSharedAssistant(defaultConfig);
};

export default {
  createWebAIAssistant: createSharedAssistant,
  createRecoderWebAIAssistant
};