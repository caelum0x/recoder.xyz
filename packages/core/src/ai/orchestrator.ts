/**
 * AI Orchestration Engine for Recoder.xyz
 * 
 * Coordinates multiple AI providers with intelligent routing, fallback handling, and performance optimization
 */

import { EventEmitter } from 'events';
import { intelligentRouter, RoutingRequest, RoutingResult } from './providers/intelligent-router';
import { providerRegistry } from './providers/enhanced-provider-registry';
import { BaseAIProvider, AIRequest, AIResponse, StreamChunk } from './providers/base-provider';
import ClaudeProvider, { ClaudeConfig } from './providers/claude-provider';
import GroqProvider, { GroqConfig } from './providers/groq-provider';
import GeminiProvider, { GeminiConfig } from './providers/gemini-provider';
import KimiProvider, { KimiConfig } from './providers/kimi-provider';
import QwenProvider, { QwenConfig } from './providers/qwen-provider';
import DeepSeekR1Provider, { DeepSeekR1Config } from './providers/deepseek-r1-provider';

export interface OrchestratorConfig {
  providers: {
    claude?: ClaudeConfig;
    groq?: GroqConfig;
    gemini?: GeminiConfig;
    kimi?: KimiConfig;
    qwen?: QwenConfig;
    deepseekR1?: DeepSeekR1Config;
    deepseek?: any;
    xai?: any;
    ollama?: any;
  };
  routing: {
    enableIntelligentRouting: boolean;
    fallbackEnabled: boolean;
    maxRetries: number;
    timeoutMs: number;
  };
  optimization: {
    enableCaching: boolean;
    cacheSize: number;
    enableLoadBalancing: boolean;
    enableCostOptimization: boolean;
  };
  monitoring: {
    enableMetrics: boolean;
    enableLogging: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

export interface GenerationRequest {
  id?: string;
  prompt: string;
  context?: {
    projectPath?: string;
    previousMessages?: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      timestamp: number;
    }>;
    codeContext?: string;
    userPreferences?: Record<string, any>;
  };
  options?: {
    provider?: string;
    model?: string;
    priority?: 'quality' | 'speed' | 'cost' | 'balanced';
    maxTokens?: number;
    temperature?: number;
    streaming?: boolean;
    tools?: any[];
    systemPrompt?: string;
  };
  user: {
    id: string;
    tier: 'free' | 'pro' | 'enterprise';
    preferences?: Record<string, any>;
  };
  task: {
    type: 'code-generation' | 'security-audit' | 'ui-components' | 'analysis' | 'debugging' | 'documentation';
    complexity: 'simple' | 'moderate' | 'complex' | 'enterprise';
    language?: string;
    framework?: string;
    domain?: string;
  };
}

export interface GenerationResult {
  id: string;
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
  };
  metadata: {
    provider: string;
    model: string;
    responseTime: number;
    routing: RoutingResult;
    fallbackUsed?: boolean;
    cacheHit?: boolean;
    quality: {
      score: number;
      metrics: Record<string, number>;
    };
  };
  warnings?: string[];
  errors?: string[];
}

export interface OrchestratorMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  totalCost: number;
  providerUsage: Map<string, number>;
  routingAccuracy: number;
  cacheHitRate: number;
  fallbackRate: number;
}

export class AIOrchestrator extends EventEmitter {
  private static instance: AIOrchestrator;
  private config: OrchestratorConfig;
  private providers: Map<string, BaseAIProvider> = new Map();
  private cache: Map<string, GenerationResult> = new Map();
  private metrics: OrchestratorMetrics;
  private activeRequests: Map<string, GenerationRequest> = new Map();

  private constructor(config: OrchestratorConfig) {
    super();
    this.config = config;
    this.metrics = this.initializeMetrics();
    this.initializeProviders();
    this.setupEventListeners();
  }

  static getInstance(config?: OrchestratorConfig): AIOrchestrator {
    if (!AIOrchestrator.instance) {
      if (!config) {
        throw new Error('Configuration required for initial AIOrchestrator setup');
      }
      AIOrchestrator.instance = new AIOrchestrator(config);
    }
    return AIOrchestrator.instance;
  }

  /**
   * Generate code using intelligent AI routing
   */
  async generateCode(request: GenerationRequest): Promise<GenerationResult> {
    const requestId = request.id || this.generateRequestId();
    const startTime = Date.now();

    try {
      // Track request
      this.activeRequests.set(requestId, request);
      this.metrics.totalRequests++;
      this.emit('request:started', { requestId, request });

      // Check cache first
      if (this.config.optimization.enableCaching) {
        const cached = this.checkCache(request);
        if (cached) {
          this.metrics.successfulRequests++;
          this.emit('request:completed', { requestId, result: cached, cached: true });
          return { ...cached, metadata: { ...cached.metadata, cacheHit: true } };
        }
      }

      // Route request to optimal provider
      let routingResult: RoutingResult;
      let selectedProvider: BaseAIProvider;

      if (this.config.routing.enableIntelligentRouting && !request.options?.provider) {
        routingResult = await this.routeRequest(request);
        selectedProvider = this.providers.get(routingResult.selectedModel.provider)!;
      } else {
        // Use specified provider or default
        const providerName = request.options?.provider || 'claude';
        selectedProvider = this.providers.get(providerName)!;
        if (!selectedProvider) {
          throw new Error(`Provider ${providerName} not available`);
        }
        
        // Create mock routing result
        routingResult = {
          selectedModel: Array.from(providerRegistry.getAllModels().values()).flat()
            .find(m => m.provider === providerName)!,
          fallbackModels: [],
          reasoning: `User specified provider: ${providerName}`,
          estimatedCost: 0,
          estimatedResponseTime: 1000,
          confidence: 0.8,
          routingStrategy: 'user-specified'
        };
      }

      // Build AI request
      const aiRequest = this.buildAIRequest(request, routingResult);

      // Execute request with fallback handling
      const result = await this.executeWithFallback(
        aiRequest, 
        selectedProvider, 
        routingResult.fallbackModels
      );

      // Process and enhance result
      const generationResult = this.processResult(result, routingResult, startTime, requestId);

      // Cache result
      if (this.config.optimization.enableCaching) {
        this.cacheResult(request, generationResult);
      }

      // Update metrics
      this.metrics.successfulRequests++;
      this.metrics.totalCost += generationResult.usage.cost;
      this.updateProviderUsage(generationResult.metadata.provider);

      this.activeRequests.delete(requestId);
      this.emit('request:completed', { requestId, result: generationResult });

      return generationResult;

    } catch (error) {
      this.metrics.failedRequests++;
      this.activeRequests.delete(requestId);
      this.emit('request:failed', { requestId, error });
      throw error;
    }
  }

  /**
   * Generate code with streaming
   */
  async* generateCodeStream(request: GenerationRequest): AsyncGenerator<StreamChunk, GenerationResult> {
    const requestId = request.id || this.generateRequestId();
    const startTime = Date.now();

    try {
      this.activeRequests.set(requestId, request);
      this.metrics.totalRequests++;

      // Route request
      const routingResult = await this.routeRequest(request);
      const selectedProvider = this.providers.get(routingResult.selectedModel.provider)!;

      // Build streaming request
      const aiRequest = this.buildAIRequest(request, routingResult, true);

      // Stream response
      const streamGenerator = selectedProvider.sendStreamingRequest(aiRequest);
      
      for await (const chunk of streamGenerator) {
        if ('content' in chunk) {
          // Final response
          const generationResult = this.processResult(chunk as AIResponse, routingResult, startTime, requestId);
          this.metrics.successfulRequests++;
          this.activeRequests.delete(requestId);
          return generationResult;
        } else {
          // Stream chunk
          yield chunk as StreamChunk;
        }
      }

    } catch (error) {
      this.metrics.failedRequests++;
      this.activeRequests.delete(requestId);
      throw error;
    }

    throw new Error('Stream ended unexpectedly');
  }

  /**
   * Get orchestrator metrics
   */
  getMetrics(): OrchestratorMetrics {
    return { ...this.metrics };
  }

  /**
   * Get provider status
   */
  getProviderStatus(): Map<string, any> {
    const status = new Map();
    for (const [name, provider] of this.providers) {
      status.set(name, {
        ...provider.getStatus(),
        statistics: provider.getStatistics()
      });
    }
    return status;
  }

  /**
   * Update orchestrator configuration
   */
  updateConfig(newConfig: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config:updated', this.config);
  }

  /**
   * Shutdown orchestrator
   */
  shutdown(): void {
    // Cancel active requests
    for (const [requestId, request] of this.activeRequests) {
      this.emit('request:cancelled', { requestId, request });
    }
    this.activeRequests.clear();

    // Clear cache
    this.cache.clear();

    this.emit('orchestrator:shutdown');
  }

  // Private methods

  /**
   * Initialize AI providers
   */
  private initializeProviders(): void {
    if (this.config.providers.claude) {
      this.providers.set('claude', new ClaudeProvider(this.config.providers.claude));
    }

    if (this.config.providers.groq) {
      this.providers.set('groq', new GroqProvider(this.config.providers.groq));
    }

    if (this.config.providers.gemini) {
      this.providers.set('gemini', new GeminiProvider(this.config.providers.gemini));
    }

    if (this.config.providers.kimi) {
      this.providers.set('moonshot', new KimiProvider(this.config.providers.kimi));
    }

    if (this.config.providers.qwen) {
      this.providers.set('qwen', new QwenProvider(this.config.providers.qwen));
    }

    if (this.config.providers.deepseekR1) {
      this.providers.set('deepseek-r1', new DeepSeekR1Provider(this.config.providers.deepseekR1));
    }

    // Initialize other providers as they're implemented
    // if (this.config.providers.deepseek) {
    //   this.providers.set('deepseek', new DeepSeekProvider(this.config.providers.deepseek));
    // }

    this.log('info', `Initialized ${this.providers.size} AI providers`);
  }

  /**
   * Route request to optimal provider
   */
  private async routeRequest(request: GenerationRequest): Promise<RoutingResult> {
    const routingRequest: RoutingRequest = {
      id: request.id || this.generateRequestId(),
      task: {
        type: request.task.type,
        complexity: request.task.complexity,
        language: request.task.language,
        framework: request.task.framework,
        domain: request.task.domain
      },
      context: {
        project: request.context?.projectPath,
        existingCode: request.context?.codeContext,
        requirements: [], // Could be extracted from prompt
        constraints: []
      },
      preferences: {
        priority: request.options?.priority || 'balanced',
        maxCost: undefined,
        maxResponseTime: this.config.routing.timeoutMs,
        requiresStreaming: request.options?.streaming || false,
        requiresImages: false
      },
      user: {
        id: request.user.id,
        tier: request.user.tier,
        usage: {
          tokensUsedToday: 0, // Would be tracked
          requestsToday: 0
        }
      }
    };

    return intelligentRouter.routeRequest(routingRequest);
  }

  /**
   * Build AI request from generation request
   */
  private buildAIRequest(
    request: GenerationRequest, 
    routing: RoutingResult, 
    streaming: boolean = false
  ): AIRequest {
    return {
      id: request.id || this.generateRequestId(),
      prompt: request.prompt,
      context: {
        previousMessages: request.context?.previousMessages?.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          metadata: {}
        })),
        projectContext: request.context?.projectPath,
        codeContext: request.context?.codeContext,
        userPreferences: request.context?.userPreferences
      },
      options: {
        model: routing.selectedModel.modelId,
        maxTokens: request.options?.maxTokens || 4096,
        temperature: request.options?.temperature || 0.7,
        streaming,
        systemPrompt: request.options?.systemPrompt || this.buildSystemPrompt(request),
        tools: request.options?.tools
      },
      metadata: {
        userId: request.user.id,
        sessionId: `session-${Date.now()}`,
        taskType: request.task.type,
        timestamp: Date.now()
      }
    };
  }

  /**
   * Execute request with fallback handling
   */
  private async executeWithFallback(
    request: AIRequest,
    primaryProvider: BaseAIProvider,
    fallbackModels: any[]
  ): Promise<AIResponse> {
    let lastError: Error | null = null;
    let attempts = 0;

    // Try primary provider
    try {
      return await this.executeWithTimeout(primaryProvider, request);
    } catch (error) {
      lastError = error as Error;
      attempts++;
      this.log('warn', `Primary provider failed: ${lastError.message}`);
    }

    // Try fallback providers
    if (this.config.routing.fallbackEnabled && fallbackModels.length > 0) {
      for (const fallbackModel of fallbackModels.slice(0, 2)) { // Max 2 fallbacks
        const fallbackProvider = this.providers.get(fallbackModel.provider);
        if (!fallbackProvider) continue;

        try {
          request.options.model = fallbackModel.modelId;
          const result = await this.executeWithTimeout(fallbackProvider, request);
          this.log('info', `Fallback to ${fallbackModel.provider} succeeded`);
          return result;
        } catch (error) {
          lastError = error as Error;
          attempts++;
          this.log('warn', `Fallback provider ${fallbackModel.provider} failed: ${lastError.message}`);
        }
      }
    }

    throw new Error(`All providers failed after ${attempts} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * Execute request with timeout
   */
  private async executeWithTimeout(
    provider: BaseAIProvider,
    request: AIRequest
  ): Promise<AIResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout after ${this.config.routing.timeoutMs}ms`));
      }, this.config.routing.timeoutMs);

      provider.sendRequest(request)
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Process AI response into generation result
   */
  private processResult(
    aiResponse: AIResponse,
    routing: RoutingResult,
    startTime: number,
    requestId: string
  ): GenerationResult {
    const responseTime = Date.now() - startTime;

    return {
      id: requestId,
      content: aiResponse.content,
      usage: aiResponse.usage,
      metadata: {
        provider: aiResponse.metadata.provider,
        model: aiResponse.metadata.model,
        responseTime,
        routing,
        quality: {
          score: this.calculateQualityScore(aiResponse),
          metrics: this.extractQualityMetrics(aiResponse)
        }
      },
      warnings: this.extractWarnings(aiResponse),
      errors: this.extractErrors(aiResponse)
    };
  }

  /**
   * Check cache for existing result
   */
  private checkCache(request: GenerationRequest): GenerationResult | null {
    const cacheKey = this.generateCacheKey(request);
    return this.cache.get(cacheKey) || null;
  }

  /**
   * Cache generation result
   */
  private cacheResult(request: GenerationRequest, result: GenerationResult): void {
    const cacheKey = this.generateCacheKey(request);
    this.cache.set(cacheKey, result);

    // Implement LRU cache eviction
    if (this.cache.size > this.config.optimization.cacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  /**
   * Generate cache key for request
   */
  private generateCacheKey(request: GenerationRequest): string {
    const keyData = {
      prompt: request.prompt,
      taskType: request.task.type,
      language: request.task.language,
      framework: request.task.framework
    };
    return JSON.stringify(keyData);
  }

  /**
   * Build system prompt based on task type
   */
  private buildSystemPrompt(request: GenerationRequest): string {
    const basePrompt = "You are Recoder, an AI assistant that generates real, production-ready code. Never create mock implementations or placeholder functions.";

    const taskPrompts = {
      'code-generation': `${basePrompt} Focus on creating functional, tested, and deployable code.`,
      'security-audit': `${basePrompt} Perform thorough security analysis and provide actionable recommendations.`,
      'ui-components': `${basePrompt} Create responsive, accessible UI components with proper styling.`,
      'analysis': `${basePrompt} Provide comprehensive analysis with clear structure and actionable insights.`,
      'debugging': `${basePrompt} Identify root causes and provide working solutions.`,
      'documentation': `${basePrompt} Create clear, comprehensive documentation with examples.`
    };

    return taskPrompts[request.task.type] || basePrompt;
  }

  /**
   * Setup event listeners for providers
   */
  private setupEventListeners(): void {
    for (const [name, provider] of this.providers) {
      provider.on('request:completed', (data) => {
        this.emit('provider:request-completed', { provider: name, ...data });
      });

      provider.on('request:error', (data) => {
        this.emit('provider:request-error', { provider: name, ...data });
      });

      provider.on('health:changed', (data) => {
        this.emit('provider:health-changed', { provider: name, ...data });
      });
    }
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): OrchestratorMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      totalCost: 0,
      providerUsage: new Map(),
      routingAccuracy: 0,
      cacheHitRate: 0,
      fallbackRate: 0
    };
  }

  /**
   * Update provider usage metrics
   */
  private updateProviderUsage(provider: string): void {
    const current = this.metrics.providerUsage.get(provider) || 0;
    this.metrics.providerUsage.set(provider, current + 1);
  }

  /**
   * Calculate quality score for response
   */
  private calculateQualityScore(response: AIResponse): number {
    let score = 0.5; // Base score

    // Factor in confidence
    if (response.metadata.confidence) {
      score += response.metadata.confidence * 0.3;
    }

    // Factor in finish reason
    if (response.metadata.finishReason === 'completed') {
      score += 0.2;
    }

    // Factor in content length (reasonable responses)
    const contentLength = response.content.length;
    if (contentLength > 100 && contentLength < 10000) {
      score += 0.1;
    }

    return Math.min(1.0, score);
  }

  /**
   * Extract quality metrics from response
   */
  private extractQualityMetrics(response: AIResponse): Record<string, number> {
    return {
      responseTime: response.metadata.responseTime,
      tokenEfficiency: response.usage.outputTokens / Math.max(response.usage.inputTokens, 1),
      costEfficiency: response.usage.totalTokens / Math.max(response.usage.cost, 0.001)
    };
  }

  /**
   * Extract warnings from response
   */
  private extractWarnings(response: AIResponse): string[] {
    const warnings: string[] = [];

    if (response.metadata.finishReason === 'length') {
      warnings.push('Response was truncated due to token limit');
    }

    if (response.usage.cost > 1.0) {
      warnings.push('High cost request - consider optimization');
    }

    return warnings;
  }

  /**
   * Extract errors from response
   */
  private extractErrors(response: AIResponse): string[] {
    const errors: string[] = [];

    if (response.metadata.finishReason === 'error') {
      errors.push('Provider returned error response');
    }

    if (response.metadata.finishReason === 'content_filter') {
      errors.push('Content was filtered by provider safety systems');
    }

    return errors;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log message with level
   */
  private log(level: string, message: string): void {
    if (this.config.monitoring.enableLogging) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
  }
}

export default AIOrchestrator;