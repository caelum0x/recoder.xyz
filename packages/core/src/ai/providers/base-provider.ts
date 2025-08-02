/**
 * Base AI Provider Interface for Recoder.xyz
 * 
 * Abstract base class that all AI providers implement
 */

import { EventEmitter } from 'events';

export interface AIRequest {
  id: string;
  prompt: string;
  context?: {
    previousMessages?: Message[];
    projectContext?: string;
    codeContext?: string;
    userPreferences?: Record<string, any>;
    toolsAvailable?: boolean;
    taskId?: string; // Optional, for tracking specific tasks
    taskComplexity?: 'low' | 'medium' | 'high'; // Optional, can be used for custom task handling
    taskType?: string; // Optional, can be used for custom task handling
    //userPreferences?: Record<string, any>; // Optional, for user-specific preferences
    additionalMetadata?: Record<string, any>; // For custom metadata
    [key: string]: any; // Allow additional properties for flexibility
  };
  options: {
    priority: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    streaming?: boolean;
    systemPrompt?: string;
    tools?: ToolDefinition[];
  };
  metadata: {
    userId: string;
    sessionId: string;
    taskType: string;
    timestamp: number;
    toolsAvailable?: boolean;
  };
  toolsAvailable?: boolean;
  taskComplexity?: 'low' | 'medium' | 'high';
  taskType?: string; // Optional, can be used for custom task handling
  userPreferences?: Record<string, any>;
  additionalMetadata?: Record<string, any>; // For custom metadata
  [key: string]: any; // Allow additional properties for flexibility
}

export interface AIResponse {
  id: string;
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
  };
  metadata: {
    cached: boolean;
    model: string;
    provider: string;
    responseTime: number;
    finishReason: 'completed' | 'length' | 'content_filter' | 'tool_calls' | 'error';
    confidence?: number;
    toolCalls?: ToolCall[];
  };
  streaming?: {
    isComplete: boolean;
    streamId: string;
  };
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
  function?: {
    name: string;
    arguments: string;
  };
}

export interface StreamChunk {
  id: string;
  delta: string;
  usage?: Partial<AIResponse['usage']>;
  isComplete: boolean;
  metadata?: Record<string, any>;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
  project?: string;
  defaultModel?: string;
  rateLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    concurrentRequests?: number;
  };
  retryConfig?: {
    maxRetries?: number;
    backoffMultiplier?: number;
    maxBackoffTime?: number;
  };
}

export interface ProviderStatus {
  isHealthy: boolean;
  responseTime: number;
  errorRate: number;
  lastError?: string;
  rateLimitStatus: {
    remaining: number;
    resetTime: number;
    limit: number;
  };
  modelAvailability: Map<string, boolean>;
}

export abstract class BaseAIProvider extends EventEmitter {
  protected config: ProviderConfig;
  protected status: ProviderStatus;
  protected requestCount: number = 0;
  protected errorCount: number = 0;
  protected activeRequests: Map<string, AIRequest> = new Map();

  constructor(
    public readonly providerId: string,
    public readonly displayName: string,
    config: ProviderConfig
  ) {
    super();
    this.config = config;
    this.status = this.initializeStatus();
    this.setupHealthMonitoring();
  }

  /**
   * Send request to AI provider
   */
  abstract sendRequest(request: AIRequest): Promise<AIResponse>;

  /**
   * Send streaming request to AI provider
   */
  abstract sendStreamingRequest(request: AIRequest): AsyncGenerator<StreamChunk, AIResponse>;

  /**
   * Get available models for this provider
   */
  abstract getAvailableModels(): Promise<string[]>;

  /**
   * Test provider connection and authentication
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Get current provider status
   */
  getStatus(): ProviderStatus {
    return { ...this.status };
  }

  /**
   * Update provider configuration
   */
  updateConfig(newConfig: Partial<ProviderConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config:updated', this.config);
  }

  /**
   * Get provider statistics
   */
  getStatistics(): {
    totalRequests: number;
    successfulRequests: number;
    errorRate: number;
    averageResponseTime: number;
    tokensProcessed: number;
    totalCost: number;
  } {
    const successfulRequests = this.requestCount - this.errorCount;
    return {
      totalRequests: this.requestCount,
      successfulRequests,
      errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
      averageResponseTime: this.status.responseTime,
      tokensProcessed: 0, // Would be tracked in implementation
      totalCost: 0 // Would be calculated in implementation
    };
  }

  /**
   * Cancel active request
   */
  async cancelRequest(requestId: string): Promise<boolean> {
    const request = this.activeRequests.get(requestId);
    if (!request) return false;

    this.activeRequests.delete(requestId);
    this.emit('request:cancelled', { requestId, request });
    return true;
  }

  /**
   * Get active request count
   */
  getActiveRequestCount(): number {
    return this.activeRequests.size;
  }

  /**
   * Check if provider can handle request
   */
  canHandleRequest(request: AIRequest): {
    canHandle: boolean;
    reason?: string;
    waitTime?: number;
  } {
    // Check rate limits
    if (this.config.rateLimits?.concurrentRequests) {
      if (this.activeRequests.size >= this.config.rateLimits.concurrentRequests) {
        return {
          canHandle: false,
          reason: 'Concurrent request limit exceeded',
          waitTime: 5000 // 5 seconds
        };
      }
    }

    // Check if provider is healthy
    if (!this.status.isHealthy) {
      return {
        canHandle: false,
        reason: 'Provider is unhealthy'
      };
    }

    // Check token limits
    if (request.options.maxTokens && request.options.maxTokens > this.getMaxTokensSupported()) {
      return {
        canHandle: false,
        reason: 'Token limit exceeds provider capacity'
      };
    }

    return { canHandle: true };
  }

  /**
   * Get maximum tokens supported by provider
   */
  protected abstract getMaxTokensSupported(): number;

  /**
   * Initialize provider status
   */
  private initializeStatus(): ProviderStatus {
    return {
      isHealthy: true,
      responseTime: 0,
      errorRate: 0,
      rateLimitStatus: {
        remaining: 1000,
        resetTime: Date.now() + 60000,
        limit: 1000
      },
      modelAvailability: new Map()
    };
  }

  /**
   * Setup health monitoring
   */
  private setupHealthMonitoring(): void {
    // Monitor health every 30 seconds
    setInterval(async () => {
      try {
        const isHealthy = await this.testConnection();
        this.updateHealthStatus(isHealthy);
      } catch (error) {
        this.updateHealthStatus(false, error instanceof Error ? error.message : 'Unknown error');
      }
    }, 30000);
  }

  /**
   * Update health status
   */
  private updateHealthStatus(isHealthy: boolean, error?: string): void {
    const wasHealthy = this.status.isHealthy;
    this.status.isHealthy = isHealthy;
    
    if (error) {
      this.status.lastError = error;
    }

    if (wasHealthy !== isHealthy) {
      this.emit('health:changed', { providerId: this.providerId, isHealthy, error });
    }
  }

  /**
   * Track request start
   */
  protected trackRequestStart(request: AIRequest): void {
    this.activeRequests.set(request.id, request);
    this.requestCount++;
    this.emit('request:started', { providerId: this.providerId, request });
  }

  /**
   * Track request completion
   */
  protected trackRequestComplete(request: AIRequest, response: AIResponse): void {
    this.activeRequests.delete(request.id);
    
    // Update response time
    this.status.responseTime = response.metadata.responseTime;
    
    // Update error rate
    this.status.errorRate = this.errorCount / this.requestCount;
    
    this.emit('request:completed', { providerId: this.providerId, request, response });
  }

  /**
   * Track request error
   */
  protected trackRequestError(request: AIRequest, error: Error): void {
    this.activeRequests.delete(request.id);
    this.errorCount++;
    this.status.errorRate = this.errorCount / this.requestCount;
    this.status.lastError = error.message;

    this.emit('request:error', { providerId: this.providerId, request, error });
  }

  /**
   * Parse rate limit headers (common pattern across providers)
   */
  protected parseRateLimitHeaders(headers: Record<string, string>): void {
    if (headers['x-ratelimit-remaining']) {
      this.status.rateLimitStatus.remaining = parseInt(headers['x-ratelimit-remaining']);
    }
    if (headers['x-ratelimit-reset']) {
      this.status.rateLimitStatus.resetTime = parseInt(headers['x-ratelimit-reset']) * 1000;
    }
    if (headers['x-ratelimit-limit']) {
      this.status.rateLimitStatus.limit = parseInt(headers['x-ratelimit-limit']);
    }
  }

  /**
   * Apply exponential backoff for retries
   */
  protected async applyBackoff(attempt: number): Promise<void> {
    const baseDelay = 1000; // 1 second
    const maxDelay = this.config.retryConfig?.maxBackoffTime || 30000; // 30 seconds
    const multiplier = this.config.retryConfig?.backoffMultiplier || 2;
    
    const delay = Math.min(baseDelay * Math.pow(multiplier, attempt), maxDelay);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Validate request before processing
   */
  protected validateRequest(request: AIRequest): void {
    if (!request.id) {
      throw new Error('Request ID is required');
    }
    if (!request.prompt) {
      throw new Error('Request prompt is required');
    }
    if (!request.options) {
      throw new Error('Request options are required');
    }
    if (!request.metadata?.userId) {
      throw new Error('User ID is required in request metadata');
    }
  }

  /**
   * Sanitize request to remove sensitive data
   */
  protected sanitizeRequest(request: AIRequest): AIRequest {
    // Create a copy without sensitive information
    return {
      ...request,
      // Remove any potential sensitive data from context
      context: request.context ? {
        ...request.context,
        userPreferences: undefined // Remove user preferences for security
      } : undefined
    };
  }

  /**
   * Calculate request cost
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    // This would be implemented by each provider with their specific pricing
    return 0;
  }

  /**
   * Generate request ID if not provided
   */
  protected generateRequestId(): string {
    return `${this.providerId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default BaseAIProvider;