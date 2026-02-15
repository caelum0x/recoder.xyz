/**
 * Base Embedder
 * Abstract base class for embedding providers
 */

import type { IEmbedder, EmbeddingResponse, EmbedderInfo, EmbedderProviderType } from '../interfaces';
import { createScopedLogger } from '~/utils/logger';
import {
  MAX_BATCH_TOKENS,
  MAX_ITEM_TOKENS,
  MAX_BATCH_RETRIES,
  INITIAL_RETRY_DELAY_MS
} from '../constants';

const logger = createScopedLogger('BaseEmbedder');

export interface BaseEmbedderOptions {
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  dimensions?: number;
  maxRetries?: number;
  timeout?: number;
}

export abstract class BaseEmbedder implements IEmbedder {
  protected apiKey: string;
  protected baseUrl: string;
  protected modelId: string;
  protected dimensions: number;
  protected maxRetries: number;
  protected timeout: number;

  constructor(options: BaseEmbedderOptions) {
    this.apiKey = options.apiKey || '';
    this.baseUrl = options.baseUrl || '';
    this.modelId = options.modelId || '';
    this.dimensions = options.dimensions || 1536;
    this.maxRetries = options.maxRetries || MAX_BATCH_RETRIES;
    this.timeout = options.timeout || 60000;
  }

  abstract get embedderInfo(): EmbedderInfo;

  getDimensions(): number {
    return this.dimensions;
  }

  abstract createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse>;

  async validateConfiguration(): Promise<{ valid: boolean; error?: string }> {
    try {
      // Test with a minimal embedding request
      const result = await this.createEmbeddings(['test']);
      if (result.embeddings && result.embeddings.length > 0) {
        return { valid: true };
      }
      return { valid: false, error: 'Invalid response from embedder' };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Batches texts for embedding based on token limits
   * @param texts Array of texts to batch
   * @returns Array of batches
   */
  protected batchTexts(texts: string[]): string[][] {
    const batches: string[][] = [];
    let currentBatch: string[] = [];
    let currentTokens = 0;

    for (const text of texts) {
      const estimatedTokens = this.estimateTokens(text);

      if (estimatedTokens > MAX_ITEM_TOKENS) {
        logger.warn(`Text exceeds max tokens (${estimatedTokens}), truncating`);
        const truncated = this.truncateToTokens(text, MAX_ITEM_TOKENS);
        if (currentTokens + MAX_ITEM_TOKENS <= MAX_BATCH_TOKENS) {
          currentBatch.push(truncated);
          currentTokens += MAX_ITEM_TOKENS;
        } else {
          if (currentBatch.length > 0) {
            batches.push(currentBatch);
          }
          currentBatch = [truncated];
          currentTokens = MAX_ITEM_TOKENS;
        }
        continue;
      }

      if (currentTokens + estimatedTokens <= MAX_BATCH_TOKENS) {
        currentBatch.push(text);
        currentTokens += estimatedTokens;
      } else {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
        }
        currentBatch = [text];
        currentTokens = estimatedTokens;
      }
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Estimates token count for text
   * @param text Text to estimate
   * @returns Estimated token count
   */
  protected estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncates text to fit within token limit
   * @param text Text to truncate
   * @param maxTokens Maximum tokens
   * @returns Truncated text
   */
  protected truncateToTokens(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars - 3) + '...';
  }

  /**
   * Retries a function with exponential backoff
   * @param fn Function to retry
   * @param maxRetries Maximum retry attempts
   * @returns Result of successful execution
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = this.maxRetries
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check for rate limiting
        if (this.isRateLimitError(error)) {
          const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          logger.warn(`Rate limited, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await this.sleep(delayMs);
          continue;
        }

        // Check for retryable errors
        if (!this.isRetryableError(error)) {
          throw lastError;
        }

        if (attempt < maxRetries - 1) {
          const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          logger.warn(`Request failed, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await this.sleep(delayMs);
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Checks if error is a rate limit error
   * @param error Error to check
   * @returns True if rate limit error
   */
  protected isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('429') ||
        error.message.toLowerCase().includes('rate limit') ||
        error.message.toLowerCase().includes('too many requests');
    }
    return false;
  }

  /**
   * Checks if error is retryable
   * @param error Error to check
   * @returns True if retryable
   */
  protected isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('500') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504')
      );
    }
    return false;
  }

  /**
   * Sleeps for specified milliseconds
   * @param ms Milliseconds to sleep
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
