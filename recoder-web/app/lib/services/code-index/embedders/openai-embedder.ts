/**
 * OpenAI Embedder
 * Implementation using OpenAI's embedding API
 */

import { BaseEmbedder, type BaseEmbedderOptions } from './base-embedder';
import type { EmbeddingResponse, EmbedderInfo } from '../interfaces';

interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIEmbedderOptions extends BaseEmbedderOptions {
  organization?: string;
}

export class OpenAIEmbedder extends BaseEmbedder {
  private organization?: string;
  private static readonly DEFAULT_MODEL = 'text-embedding-3-small';
  private static readonly DEFAULT_DIMENSIONS = 1536;

  constructor(options: OpenAIEmbedderOptions) {
    super({
      ...options,
      baseUrl: options.baseUrl || 'https://api.openai.com/v1',
      modelId: options.modelId || OpenAIEmbedder.DEFAULT_MODEL,
      dimensions: options.dimensions || OpenAIEmbedder.DEFAULT_DIMENSIONS
    });
    this.organization = options.organization;
  }

  get embedderInfo(): EmbedderInfo {
    return {
      name: 'openai',
      modelId: this.modelId,
      dimensions: this.dimensions
    };
  }

  async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
    const modelToUse = model || this.modelId;
    const batches = this.batchTexts(texts);
    const allEmbeddings: number[][] = [];
    let totalPromptTokens = 0;
    let totalTokens = 0;

    for (const batch of batches) {
      const result = await this.withRetry(async () => {
        return this.embedBatch(batch, modelToUse);
      });

      allEmbeddings.push(...result.embeddings);
      totalPromptTokens += result.usage?.promptTokens || 0;
      totalTokens += result.usage?.totalTokens || 0;
    }

    return {
      embeddings: allEmbeddings,
      usage: {
        promptTokens: totalPromptTokens,
        totalTokens: totalTokens
      }
    };
  }

  private async embedBatch(texts: string[], model: string): Promise<EmbeddingResponse> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...(this.organization && { 'OpenAI-Organization': this.organization })
      },
      body: JSON.stringify({
        input: texts,
        model: model,
        dimensions: this.dimensions
      }),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
    }

    const data: OpenAIEmbeddingResponse = await response.json();

    // Sort embeddings by index to maintain order
    const sortedEmbeddings = data.data
      .sort((a, b) => a.index - b.index)
      .map(item => item.embedding);

    return {
      embeddings: sortedEmbeddings,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        totalTokens: data.usage.total_tokens
      }
    };
  }

  async validateConfiguration(): Promise<{ valid: boolean; error?: string }> {
    if (!this.apiKey) {
      return { valid: false, error: 'OpenAI API key is required' };
    }

    try {
      const result = await this.createEmbeddings(['test']);
      if (result.embeddings && result.embeddings.length > 0) {
        // Verify dimensions
        if (result.embeddings[0].length !== this.dimensions) {
          console.warn(`Expected ${this.dimensions} dimensions, got ${result.embeddings[0].length}`);
        }
        return { valid: true };
      }
      return { valid: false, error: 'Invalid response from OpenAI' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('401')) {
        return { valid: false, error: 'Invalid OpenAI API key' };
      }
      if (message.includes('429')) {
        return { valid: false, error: 'OpenAI rate limit exceeded' };
      }
      return { valid: false, error: message };
    }
  }
}

/**
 * Creates an OpenAI embedder with default configuration
 */
export function createOpenAIEmbedder(apiKey: string, options?: Partial<OpenAIEmbedderOptions>): OpenAIEmbedder {
  return new OpenAIEmbedder({
    apiKey,
    ...options
  });
}
