/**
 * Shared API types for production engine
 */

export interface ApiHandlerOptions {
  // Common options
  maxRetries?: number;
  timeout?: number;
  
  // Provider-specific options
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  
  // Anthropic specific
  anthropicApiKey?: string;
  anthropicVersion?: string;
  
  // Vertex specific  
  vertexProjectId?: string;
  vertexRegion?: string;
  
  // Gemini specific
  geminiApiKey?: string;
  
  // Other provider options
  [key: string]: any;
}

export interface ApiResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model?: string;
  finishReason?: string;
}