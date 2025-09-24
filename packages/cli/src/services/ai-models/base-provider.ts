/**
 * Base AI Model Provider - Abstract interface for all model providers
 */

import { EventEmitter } from 'events';
import { Logger } from 'recoder-shared';
import {
  ModelMetadata,
  ModelRequest,
  ModelResponse,
  ModelHealth,
  ModelConfiguration,
  StreamingResponse,
  ModelError,
  ErrorType,
  HealthStatus,
  ModelProvider
} from 'recoder-shared/types/ai-models';

export abstract class BaseModelProvider extends EventEmitter {
  protected config: ModelConfiguration;
  protected models: Map<string, ModelMetadata> = new Map();
  protected healthStatus: Map<string, ModelHealth> = new Map();

  constructor(config: ModelConfiguration) {
    super();
    this.config = config;
    this.setupHealthMonitoring();
  }

  // Abstract methods that must be implemented by providers
  abstract initialize(): Promise<void>;
  abstract sendRequest(request: ModelRequest): Promise<ModelResponse>;
  abstract streamRequest(request: ModelRequest): AsyncGenerator<StreamingResponse, ModelResponse>;
  abstract validateConfig(): Promise<boolean>;
  abstract getAvailableModels(): Promise<ModelMetadata[]>;
  abstract getProvider(): ModelProvider;

  // Common provider functionality
  public async isHealthy(modelId?: string): Promise<boolean> {
    if (modelId) {
      const health = this.healthStatus.get(modelId);
      return health?.status === HealthStatus.HEALTHY;
    }
    
    // Check if any model is healthy
    for (const health of this.healthStatus.values()) {
      if (health.status === HealthStatus.HEALTHY) {
        return true;
      }
    }
    return false;
  }

  public getModelHealth(modelId: string): ModelHealth | undefined {
    return this.healthStatus.get(modelId);
  }

  public getAllModelsHealth(): ModelHealth[] {
    return Array.from(this.healthStatus.values());
  }

  public getModel(modelId: string): ModelMetadata | undefined {
    return this.models.get(modelId);
  }

  public getAllModels(): ModelMetadata[] {
    return Array.from(this.models.values());
  }

  public getAvailableModelsSync(): ModelMetadata[] {
    return Array.from(this.models.values()).filter(model => model.isAvailable);
  }

  protected async performHealthCheck(modelId: string): Promise<ModelHealth> {
    const startTime = Date.now();
    const model = this.models.get(modelId);
    
    if (!model) {
      return {
        model: modelId,
        status: HealthStatus.UNAVAILABLE,
        availability: 0,
        averageResponseTime: 0,
        errorRate: 1,
        lastChecked: new Date(),
        issues: ['Model not found'],
        metrics: {
          uptime: 0,
          requestCount: 0,
          successRate: 0,
          p50ResponseTime: 0,
          p95ResponseTime: 0,
          p99ResponseTime: 0
        }
      };
    }

    try {
      // Perform a lightweight health check request
      const healthRequest: ModelRequest = {
        id: `health-check-${modelId}-${Date.now()}`,
        model: modelId,
        messages: [
          {
            role: 'user',
            content: 'Hello',
            metadata: { timestamp: new Date() }
          }
        ],
        options: {
          maxTokens: 10,
          temperature: 0.1
        },
        context: {
          task: 'chat' as any,
          priority: 'low' as any,
          privacyLevel: 'public' as any,
          timeoutMs: 5000
        },
        timestamp: new Date()
      };

      const response = await this.sendRequest(healthRequest);
      const responseTime = Date.now() - startTime;

      const currentHealth = this.healthStatus.get(modelId);
      const metrics = currentHealth?.metrics || {
        uptime: 0,
        requestCount: 0,
        successRate: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0
      };

      return {
        model: modelId,
        status: HealthStatus.HEALTHY,
        availability: 1,
        averageResponseTime: responseTime,
        errorRate: 0,
        lastChecked: new Date(),
        metrics: {
          ...metrics,
          requestCount: metrics.requestCount + 1,
          successRate: ((metrics.successRate * (metrics.requestCount - 1)) + 1) / metrics.requestCount
        }
      };
    } catch (error) {
      Logger.error('Health check failed', { modelId, error });
      
      return {
        model: modelId,
        status: HealthStatus.UNAVAILABLE,
        availability: 0,
        averageResponseTime: Date.now() - startTime,
        errorRate: 1,
        lastChecked: new Date(),
        issues: [error instanceof Error ? error.message : 'Unknown error'],
        metrics: {
          uptime: 0,
          requestCount: 1,
          successRate: 0,
          p50ResponseTime: 0,
          p95ResponseTime: 0,
          p99ResponseTime: 0
        }
      };
    }
  }

  protected setupHealthMonitoring(): void {
    // Initial health check after 1 second
    setTimeout(() => {
      this.runHealthChecks();
    }, 1000);

    // Periodic health checks every 5 minutes
    setInterval(() => {
      this.runHealthChecks();
    }, 5 * 60 * 1000);
  }

  protected async runHealthChecks(): Promise<void> {
    const modelIds = Array.from(this.models.keys());
    
    for (const modelId of modelIds) {
      try {
        const health = await this.performHealthCheck(modelId);
        this.healthStatus.set(modelId, health);
        
        // Update model availability
        const model = this.models.get(modelId);
        if (model) {
          model.isAvailable = health.status === HealthStatus.HEALTHY;
          this.models.set(modelId, model);
        }

        this.emit('health-updated', { modelId, health });
      } catch (error) {
        Logger.error('Health check error', { modelId, error });
      }
    }
  }

  protected createError(
    code: string,
    message: string,
    type: ErrorType = ErrorType.UNKNOWN,
    retryable: boolean = false,
    details?: Record<string, any>
  ): ModelError {
    return {
      code,
      message,
      type,
      retryable,
      details
    };
  }

  protected handleApiError(error: any, modelId: string): ModelError {
    // Common error handling logic
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 401:
          return this.createError(
            'UNAUTHORIZED',
            'Invalid API key or authentication failed',
            ErrorType.AUTHENTICATION,
            false,
            { status, modelId }
          );
        case 403:
          return this.createError(
            'FORBIDDEN',
            'Permission denied or quota exceeded',
            ErrorType.PERMISSION_DENIED,
            false,
            { status, modelId }
          );
        case 429:
          return this.createError(
            'RATE_LIMIT',
            'Rate limit exceeded, please try again later',
            ErrorType.RATE_LIMIT,
            true,
            { status, modelId, retryAfter: error.response.headers['retry-after'] }
          );
        case 500:
        case 502:
        case 503:
        case 504:
          return this.createError(
            'SERVER_ERROR',
            'Server error, please try again',
            ErrorType.API_ERROR,
            true,
            { status, modelId }
          );
        default:
          return this.createError(
            'API_ERROR',
            data?.error?.message || `HTTP ${status} error`,
            ErrorType.API_ERROR,
            status >= 500,
            { status, modelId, data }
          );
      }
    }

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return this.createError(
        'TIMEOUT',
        'Request timeout',
        ErrorType.TIMEOUT,
        true,
        { modelId }
      );
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return this.createError(
        'NETWORK_ERROR',
        'Network connection failed',
        ErrorType.NETWORK_ERROR,
        true,
        { modelId, code: error.code }
      );
    }

    return this.createError(
      'UNKNOWN_ERROR',
      error.message || 'Unknown error occurred',
      ErrorType.UNKNOWN,
      false,
      { modelId, originalError: error }
    );
  }

  protected validateRequest(request: ModelRequest): void {
    if (!request.id) {
      throw new Error('Request ID is required');
    }

    if (!request.model) {
      throw new Error('Model ID is required');
    }

    if (!request.messages || request.messages.length === 0) {
      throw new Error('At least one message is required');
    }

    const model = this.models.get(request.model);
    if (!model) {
      throw new Error(`Model ${request.model} not found`);
    }

    if (!model.isAvailable) {
      throw new Error(`Model ${request.model} is not available`);
    }

    // Validate token limits
    const estimatedTokens = this.estimateTokens(request.messages);
    if (estimatedTokens > model.limits.maxContextLength) {
      throw new Error(`Request exceeds model context length: ${estimatedTokens} > ${model.limits.maxContextLength}`);
    }
  }

  protected estimateTokens(messages: any[]): number {
    // Simple token estimation (4 characters ≈ 1 token)
    return messages.reduce((total, message) => {
      return total + Math.ceil(message.content.length / 4);
    }, 0);
  }

  protected generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  protected sanitizeResponse(response: ModelResponse): ModelResponse {
    // Remove sensitive information from responses
    const sanitized = { ...response };
    
    if (sanitized.metadata) {
      delete (sanitized.metadata as any).internalId;
      delete (sanitized.metadata as any).apiKey;
    }

    return sanitized;
  }

  public async destroy(): Promise<void> {
    this.removeAllListeners();
    this.models.clear();
    this.healthStatus.clear();
  }
}