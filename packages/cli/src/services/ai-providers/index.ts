/**
 * AI Providers Module
 * 
 * Enhanced AI provider integrations for recoder.xyz CLI with
 * intelligent routing, local AI capabilities, and cloud fallbacks.
 */

export { 
  EnhancedOllamaProvider, 
  enhancedOllamaProvider 
} from './enhanced-ollama-provider';

export type { 
  OllamaProviderConfig, 
  OllamaCapabilities 
} from './enhanced-ollama-provider';

// Re-export AI hub types for convenience
export type { 
  AIProvider, 
  AIResponse, 
  TaskContext, 
  AIRequestOptions 
} from '../ai-hub';