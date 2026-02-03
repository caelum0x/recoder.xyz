/**
 * Embedder Interfaces
 * Defines the contract for embedding providers
 */

export interface EmbeddingResponse {
  embeddings: number[][];
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

export type EmbedderProviderType =
  | 'openai'
  | 'openai-compatible'
  | 'ollama'
  | 'gemini'
  | 'mistral'
  | 'openrouter'
  | 'bedrock'
  | 'vercel-ai-gateway'
  | 'voyage'
  | 'cohere';

export interface EmbedderInfo {
  name: EmbedderProviderType;
  modelId?: string;
  dimensions?: number;
}

export interface IEmbedder {
  /**
   * Creates embeddings for the given texts
   * @param texts Array of text strings to create embeddings for
   * @param model Optional model ID to use for embeddings
   * @returns Promise resolving to an EmbeddingResponse
   */
  createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse>;

  /**
   * Validates the embedder configuration
   * @returns Promise resolving to validation result
   */
  validateConfiguration(): Promise<{ valid: boolean; error?: string }>;

  /**
   * Gets information about this embedder
   */
  get embedderInfo(): EmbedderInfo;

  /**
   * Gets the embedding dimensions for the model
   */
  getDimensions(): number;
}

export interface EmbedderConfig {
  provider: EmbedderProviderType;
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  dimensions?: number;
  maxRetries?: number;
  timeout?: number;
}
