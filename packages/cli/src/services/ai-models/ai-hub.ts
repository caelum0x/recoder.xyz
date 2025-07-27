/**
 * AI Model Integration Hub - Central orchestrator for all AI model interactions
 */

import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger';
import {
  ModelRequest,
  ModelResponse,
  StreamingResponse,
  ModelMetadata,
  ModelProvider,
  ModelConfiguration,
  TaskType,
  PrivacyLevel,
  ModelRecommendation,
  ModelUsageStats,
  LocalModelConfig,
  HybridProcessingConfig,
  RequestContext,
  ModelRoutingRule
} from '@recoder/shared/types/ai-models';

import { BaseModelProvider } from './base-provider';
import { OpenAIProvider } from './providers/openai-provider';
import { AnthropicProvider } from './providers/anthropic-provider';
import { OllamaProvider, OllamaConfig } from './providers/ollama-provider';
import { ModelRouter, RouterConfig } from './model-router';
import { ContextManager } from './context-manager';
import { UsageTracker } from './usage-tracker';

export interface AIHubConfig {
  providers: {
    openai?: ModelConfiguration;
    anthropic?: ModelConfiguration;
    google?: ModelConfiguration;
    mistral?: ModelConfiguration;
    ollama?: OllamaConfig;
    custom?: ModelConfiguration[];
  };
  router: RouterConfig;
  localModels: LocalModelConfig;
  hybrid: HybridProcessingConfig;
  defaultSettings: {
    privacyLevel: PrivacyLevel;
    timeout: number;
    retryCount: number;
    temperature: number;
    maxTokens: number;
  };
  features: {
    enableCaching: boolean;
    enableMonitoring: boolean;
    enableAnalytics: boolean;
    enableAutoInstall: boolean;
    enableHybridProcessing: boolean;
  };
}

export class AIModelHub extends EventEmitter {
  private config: AIHubConfig;
  private providers: Map<ModelProvider, BaseModelProvider> = new Map();
  private router: ModelRouter;
  private contextManager: ContextManager;
  private usageTracker: UsageTracker;
  private initialized: boolean = false;

  constructor(config: AIHubConfig) {
    super();
    this.config = config;
    
    this.contextManager = new ContextManager();
    this.usageTracker = new UsageTracker();
    this.router = new ModelRouter(config.router);
    
    this.setupEventHandlers();
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    Logger.info('Initializing AI Model Hub...');

    try {
      // Initialize providers
      await this.initializeProviders();
      
      // Setup router with providers
      this.setupRouter();
      
      // Initialize context manager
      await this.contextManager.initialize();
      
      // Initialize usage tracker
      await this.usageTracker.initialize();
      
      this.initialized = true;
      
      Logger.info('AI Model Hub initialized successfully');

      this.emit('initialized');
    } catch (error) {
      Logger.error('Failed to initialize AI Model Hub', { error });
      throw error;
    }
  }

  public async sendRequest(
    messages: any[],
    options: Partial<ModelRequest> = {}
  ): Promise<ModelResponse> {
    this.ensureInitialized();

    const request = await this.buildRequest(messages, options);
    
    try {
      // Track request start
      this.usageTracker.trackRequestStart(request);
      
      // Route and process request
      const response = await this.router.routeRequest(request);
      
      // Track request completion
      this.usageTracker.trackRequestComplete(request, response);
      
      // Update context if needed
      await this.contextManager.updateContext(request, response);
      
      this.emit('request-completed', { request, response });
      
      return response;
    } catch (error) {
      this.usageTracker.trackRequestError(request, error);
      this.emit('request-failed', { request, error });
      throw error;
    }
  }

  public async* streamRequest(
    messages: any[],
    options: Partial<ModelRequest> = {}
  ): AsyncGenerator<StreamingResponse, ModelResponse> {
    this.ensureInitialized();

    const request = await this.buildRequest(messages, options);
    
    try {
      this.usageTracker.trackRequestStart(request);
      
      const stream = this.router.streamRequest(request);
      let finalResponse: ModelResponse | undefined;
      
      for await (const chunk of stream) {
        yield chunk;
        finalResponse = chunk as any; // Will be the final response
      }
      
      if (!finalResponse) {
        throw new Error('No response received from stream');
      }
      
      this.usageTracker.trackRequestComplete(request, finalResponse);
      await this.contextManager.updateContext(request, finalResponse);
      
      this.emit('stream-completed', { request, response: finalResponse });
      
      return finalResponse;
    } catch (error) {
      this.usageTracker.trackRequestError(request, error);
      this.emit('stream-failed', { request, error });
      throw error;
    }
  }

  public async getModelRecommendation(
    task: TaskType,
    context?: Partial<RequestContext>
  ): Promise<ModelRecommendation> {
    this.ensureInitialized();

    const request = await this.buildRequest([], {
      context: {
        task,
        priority: 'medium' as any,
        privacyLevel: this.config.defaultSettings.privacyLevel,
        ...context
      }
    });

    return this.router.getModelRecommendation(request);
  }

  public getAllModels(): ModelMetadata[] {
    const allModels: ModelMetadata[] = [];
    
    for (const provider of this.providers.values()) {
      allModels.push(...provider.getAllModels());
    }
    
    return allModels.sort((a, b) => b.priority - a.priority);
  }

  public getAvailableModels(): ModelMetadata[] {
    return this.getAllModels().filter(model => model.isAvailable);
  }

  public getLocalModels(): ModelMetadata[] {
    return this.getAllModels().filter(model => model.isLocal);
  }

  public getCloudModels(): ModelMetadata[] {
    return this.getAllModels().filter(model => !model.isLocal);
  }

  public getModelsByTask(task: TaskType): ModelMetadata[] {
    return this.getAllModels().filter(model => {
      switch (task) {
        case TaskType.CODE_GENERATION:
          return model.capabilities.codeGeneration;
        case TaskType.CODE_REVIEW:
          return model.capabilities.codeReview;
        case TaskType.DEBUGGING:
          return model.capabilities.debugging;
        case TaskType.SECURITY_ANALYSIS:
          return model.capabilities.security;
        case TaskType.DOCUMENTATION:
          return model.capabilities.documentation;
        default:
          return model.capabilities.chat;
      }
    });
  }

  public async installLocalModel(modelName: string): Promise<void> {
    this.ensureInitialized();
    
    const provider = this.providers.get(ModelProvider.OLLAMA);
    
    if (!provider || provider.constructor.name !== 'OllamaProvider') {
      throw new Error('Ollama provider not available');
    }
    
    const ollamaProvider = provider as unknown as OllamaProvider;

    await ollamaProvider.installModel(modelName);
    
    this.emit('model-installed', { model: modelName, provider: 'ollama' });
  }

  public async uninstallLocalModel(modelName: string): Promise<void> {
    this.ensureInitialized();
    
    const provider = this.providers.get(ModelProvider.OLLAMA);
    
    if (!provider || provider.constructor.name !== 'OllamaProvider') {
      throw new Error('Ollama provider not available');
    }
    
    const ollamaProvider = provider as unknown as OllamaProvider;

    await ollamaProvider.uninstallModel(modelName);
    
    this.emit('model-uninstalled', { model: modelName, provider: 'ollama' });
  }

  public getModelDownloadProgress(modelName: string): { progress: number; status: string } | undefined {
    const provider = this.providers.get(ModelProvider.OLLAMA);
    
    if (!provider || provider.constructor.name !== 'OllamaProvider') {
      return undefined;
    }
    
    const ollamaProvider = provider as unknown as OllamaProvider;
    return ollamaProvider.getDownloadProgress(modelName);
  }

  public getUsageStats(period: string = 'day'): ModelUsageStats[] {
    return this.usageTracker.getUsageStats(period as any);
  }

  public getModelHealth(modelId?: string): any {
    if (modelId) {
      const model = this.getAllModels().find(m => m.id === modelId);
      if (!model) return null;
      
      const provider = this.providers.get(model.provider);
      return provider?.getModelHealth(modelId);
    }

    const healthData: any = {};
    
    for (const [providerType, provider] of this.providers) {
      healthData[providerType] = provider.getAllModelsHealth();
    }
    
    return healthData;
  }

  public async testModel(modelId: string): Promise<{
    success: boolean;
    responseTime: number;
    error?: string;
  }> {
    this.ensureInitialized();

    const startTime = Date.now();
    
    try {
      const response = await this.sendRequest([
        { role: 'user', content: 'Hello! Please respond with "Test successful."' }
      ], {
        model: modelId,
        options: {
          maxTokens: 50,
          temperature: 0.1
        }
      });

      return {
        success: !response.error,
        responseTime: Date.now() - startTime,
        error: response.error?.message
      };
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public updateConfiguration(config: Partial<AIHubConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update router configuration
    if (config.router) {
      this.router = new ModelRouter(config.router);
      this.setupRouter();
    }
    
    this.emit('config-updated', config);
  }

  public addRoutingRule(rule: ModelRoutingRule): void {
    this.config.router.routingRules.push(rule);
    this.router = new ModelRouter(this.config.router);
    this.setupRouter();
    
    this.emit('routing-rule-added', rule);
  }

  public removeRoutingRule(ruleId: string): void {
    this.config.router.routingRules = this.config.router.routingRules
      .filter(rule => rule.id !== ruleId);
    
    this.router = new ModelRouter(this.config.router);
    this.setupRouter();
    
    this.emit('routing-rule-removed', ruleId);
  }

  public async getContextSummary(projectPath?: string): Promise<any> {
    return this.contextManager.getContextSummary(projectPath);
  }

  public async destroy(): Promise<void> {
    Logger.info('Destroying AI Model Hub...');
    
    // Destroy all providers
    for (const provider of this.providers.values()) {
      await provider.destroy();
    }
    
    this.providers.clear();
    this.removeAllListeners();
    this.initialized = false;
    
    Logger.info('AI Model Hub destroyed');
  }

  private async initializeProviders(): Promise<void> {
    const { providers } = this.config;

    // Initialize OpenAI provider
    if (providers.openai?.enabled) {
      try {
        const openaiProvider = new OpenAIProvider(providers.openai);
        await openaiProvider.initialize();
        this.providers.set(ModelProvider.OPENAI, openaiProvider);
        Logger.info('OpenAI provider initialized');
      } catch (error) {
        Logger.warn('Failed to initialize OpenAI provider', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Initialize Anthropic provider
    if (providers.anthropic?.enabled) {
      try {
        const anthropicProvider = new AnthropicProvider(providers.anthropic);
        await anthropicProvider.initialize();
        this.providers.set(ModelProvider.ANTHROPIC, anthropicProvider);
        Logger.info('Anthropic provider initialized');
      } catch (error) {
        Logger.warn('Failed to initialize Anthropic provider', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Initialize Ollama provider (local models)
    if (providers.ollama?.enabled) {
      try {
        const ollamaProvider = new OllamaProvider(providers.ollama);
        await ollamaProvider.initialize();
        this.providers.set(ModelProvider.OLLAMA, ollamaProvider);
        Logger.info('Ollama provider initialized');
        
        // Setup event forwarding for model downloads
        ollamaProvider.on('model-download-started', (data) => this.emit('model-download-started', data));
        ollamaProvider.on('model-download-progress', (data) => this.emit('model-download-progress', data));
        ollamaProvider.on('model-download-completed', (data) => this.emit('model-download-completed', data));
        ollamaProvider.on('model-download-failed', (data) => this.emit('model-download-failed', data));
      } catch (error) {
        Logger.warn('Failed to initialize Ollama provider', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (this.providers.size === 0) {
      throw new Error('No providers were successfully initialized');
    }
  }

  private setupRouter(): void {
    // Add all providers to router
    for (const provider of this.providers.values()) {
      this.router.addProvider(provider);
    }

    // Setup router event forwarding
    this.router.on('request-routed', (data) => this.emit('request-routed', data));
  }

  private setupEventHandlers(): void {
    // Forward provider events
    this.on('provider-health-updated', (data) => {
      this.emit('model-health-updated', data);
    });
  }

  private async buildRequest(
    messages: any[],
    options: Partial<ModelRequest> = {}
  ): Promise<ModelRequest> {
    const requestId = options.id || this.generateRequestId();
    
    // Build context from current state
    const context: RequestContext = {
      task: TaskType.CHAT,
      priority: 'medium' as any,
      privacyLevel: this.config.defaultSettings.privacyLevel,
      timeoutMs: this.config.defaultSettings.timeout,
      retryCount: this.config.defaultSettings.retryCount,
      ...options.context
    };

    // Enhance context with project information if available
    const enhancedContext = await this.contextManager.enhanceContext(context);

    return {
      id: requestId,
      model: options.model || '', // Will be selected by router
      messages: messages.map(msg => ({
        ...msg,
        metadata: {
          timestamp: new Date(),
          ...msg.metadata
        }
      })),
      options: {
        temperature: this.config.defaultSettings.temperature,
        maxTokens: this.config.defaultSettings.maxTokens,
        ...options.options
      },
      context: enhancedContext,
      timestamp: new Date()
    };
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('AI Model Hub not initialized. Call initialize() first.');
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}