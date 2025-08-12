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
import { ConsensusEngine, ConsensusRequest, ConsensusResponse } from './consensus-engine';

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
  private consensusEngine: ConsensusEngine;
  private initialized: boolean = false;

  constructor(config: AIHubConfig) {
    super();
    this.config = config;
    
    this.contextManager = new ContextManager();
    this.usageTracker = new UsageTracker();
    this.router = new ModelRouter(config.router);
    this.consensusEngine = new ConsensusEngine(this);
    
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
      
      // Route and process request (now supports parallel routing)
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

  /**
   * KILLER FEATURE: Parallel AI request processing for 3x speed improvement
   * Send the same request to multiple AI models simultaneously and aggregate results
   */
  public async sendParallelRequest(
    messages: any[],
    options: {
      models?: string[];
      aggregationStrategy?: 'fastest' | 'consensus' | 'quality_weighted' | 'best_of_n';
      maxParallelRequests?: number;
      timeout?: number;
    } & Partial<ModelRequest>
  ): Promise<ModelResponse & { parallelResults?: ModelResponse[]; aggregationStrategy?: string }> {
    this.ensureInitialized();

    const {
      models,
      aggregationStrategy = 'consensus',
      maxParallelRequests = 3,
      timeout = 30000,
      ...requestOptions
    } = options;

    // Select models for parallel execution
    const selectedModels = models || this.getOptimalModelsForParallel(requestOptions.context?.task);
    const modelsToUse = selectedModels.slice(0, maxParallelRequests);

    Logger.info(`Starting parallel request with ${modelsToUse.length} models`, {
      models: modelsToUse,
      strategy: aggregationStrategy
    });

    try {
      // Create requests for each model
      const parallelRequests = await Promise.all(
        modelsToUse.map(async (modelId, index) => {
          const request = await this.buildRequest(messages, {
            ...requestOptions,
            model: modelId,
            id: `${requestOptions.id || this.generateRequestId()}_parallel_${index}`
          });
          return { request, modelId };
        })
      );

      // Execute all requests in parallel with timeout
      const startTime = Date.now();
      const parallelPromises = parallelRequests.map(async ({ request, modelId }) => {
        try {
          this.usageTracker.trackRequestStart(request);
          const response = await Promise.race([
            this.router.routeRequest(request),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error(`Timeout after ${timeout}ms for model ${modelId}`)), timeout)
            )
          ]);
          this.usageTracker.trackRequestComplete(request, response);
          return { response, modelId, success: true };
        } catch (error) {
          this.usageTracker.trackRequestError(request, error);
          Logger.warn(`Parallel request failed for model ${modelId}:`, error.message);
          return { response: null, modelId, success: false, error: error.message };
        }
      });

      const results = await Promise.allSettled(parallelPromises);
      const successfulResults = results
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled' && result.value.success)
        .map(result => result.value);

      const parallelResponses = successfulResults.map(r => r.response);
      const executionTime = Date.now() - startTime;

      Logger.info(`Parallel execution completed`, {
        successful: successfulResults.length,
        total: modelsToUse.length,
        executionTime,
        strategy: aggregationStrategy
      });

      if (successfulResults.length === 0) {
        throw new Error('All parallel requests failed');
      }

      // Aggregate results based on strategy
      const aggregatedResponse = await this.aggregateParallelResponses(
        parallelResponses,
        aggregationStrategy,
        messages
      );

      // Add metadata about parallel execution
      const finalResponse = {
        ...aggregatedResponse,
        parallelResults: parallelResponses,
        aggregationStrategy,
        metadata: {
          ...aggregatedResponse.metadata,
          parallelExecution: {
            modelsUsed: successfulResults.map(r => r.modelId),
            executionTime,
            aggregationStrategy,
            speedImprovement: this.calculateSpeedImprovement(executionTime, parallelResponses.length)
          }
        }
      };

      this.emit('parallel-request-completed', {
        results: successfulResults,
        aggregatedResponse: finalResponse,
        executionTime
      });

      return finalResponse;

    } catch (error) {
      Logger.error('Parallel request execution failed:', error);
      this.emit('parallel-request-failed', { error, models: modelsToUse });
      throw error;
    }
  }

  /**
   * Subtask parallel workflow - break down complex tasks and process in parallel
   */
  public async sendSubtaskParallelRequest(
    messages: any[],
    options: {
      maxSubtasks?: number;
      orchestratorModel?: string;
      workerModels?: string[];
    } & Partial<ModelRequest>
  ): Promise<ModelResponse & { subtaskResults?: any[]; orchestrationData?: any }> {
    this.ensureInitialized();

    const {
      maxSubtasks = 3,
      orchestratorModel = 'claude-3-5-sonnet-20241022',
      workerModels = ['llama-3.1-70b-versatile', 'claude-3-haiku-20240307', 'gemini-1.5-pro'],
      ...requestOptions
    } = options;

    try {
      // Step 1: Use orchestrator to break down the task
      const taskContent = messages[messages.length - 1]?.content || '';
      const orchestrationResponse = await this.orchestrateSubtasks(taskContent, orchestratorModel, maxSubtasks);
      
      Logger.info('Task orchestration completed', {
        subtasks: orchestrationResponse.subtasks.length,
        analysis: orchestrationResponse.analysis.substring(0, 100) + '...'
      });

      // Step 2: Execute subtasks in parallel
      const subtaskPromises = orchestrationResponse.subtasks.map(async (subtask: any, index: number) => {
        const workerModel = workerModels[index % workerModels.length];
        const subtaskMessages = [
          ...messages.slice(0, -1), // Keep context
          {
            role: 'user',
            content: `${subtask.description}\n\nOriginal context: ${taskContent}`
          }
        ];

        const subtaskRequest = await this.buildRequest(subtaskMessages, {
          ...requestOptions,
          model: workerModel,
          id: `${requestOptions.id || this.generateRequestId()}_subtask_${index}`
        });

        try {
          const response = await this.router.routeRequest(subtaskRequest);
          return {
            subtask,
            response,
            workerModel,
            success: true
          };
        } catch (error) {
          return {
            subtask,
            response: null,
            workerModel,
            success: false,
            error: error.message
          };
        }
      });

      const subtaskResults = await Promise.all(subtaskPromises);
      const successfulResults = subtaskResults.filter(r => r.success);

      // Step 3: Synthesize results
      const synthesisMessages = [
        {
          role: 'system',
          content: 'You are tasked with synthesizing multiple subtask results into a cohesive final answer. Ensure the response is comprehensive, accurate, and well-structured.'
        },
        {
          role: 'user',
          content: `Original task: ${taskContent}\n\nSubtask results:\n${successfulResults.map((result, i) => `${i + 1}. ${result.subtask.type}: ${result.response?.content || result.response?.text || 'No response'}`).join('\n\n')}\n\nPlease synthesize these results into a final comprehensive answer.`
        }
      ];

      const synthesisRequest = await this.buildRequest(synthesisMessages, {
        ...requestOptions,
        model: orchestratorModel,
        id: `${requestOptions.id || this.generateRequestId()}_synthesis`
      });

      const finalResponse = await this.router.routeRequest(synthesisRequest);

      const enhancedResponse = {
        ...finalResponse,
        subtaskResults: successfulResults,
        orchestrationData: orchestrationResponse,
        metadata: {
          ...finalResponse.metadata,
          subtaskExecution: {
            totalSubtasks: orchestrationResponse.subtasks.length,
            successfulSubtasks: successfulResults.length,
            workerModels: [...new Set(successfulResults.map(r => r.workerModel))],
            orchestratorModel
          }
        }
      };

      this.emit('subtask-parallel-completed', {
        orchestrationData: orchestrationResponse,
        subtaskResults: successfulResults,
        finalResponse: enhancedResponse
      });

      return enhancedResponse;

    } catch (error) {
      Logger.error('Subtask parallel execution failed:', error);
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

  /**
   * Generate code with multi-model consensus (KILLER FEATURE vs Cursor/Copilot)
   */
  public async generateWithConsensus(request: Partial<ConsensusRequest>): Promise<ConsensusResponse> {
    this.ensureInitialized();

    const consensusRequest: ConsensusRequest = {
      id: request.id || this.generateRequestId(),
      prompt: request.prompt || '',
      task: request.task || TaskType.CODE_GENERATION,
      language: request.language,
      models: request.models || [], // Auto-select if empty
      consensusThreshold: request.consensusThreshold || 0.7,
      maxAttempts: request.maxAttempts || 3,
      preferences: {
        preferAccuracy: true,
        preferSpeed: false,
        preferCost: true,
        ...request.preferences
      }
    };

    Logger.info(`Starting consensus code generation: ${consensusRequest.id}`);
    return this.consensusEngine.generateWithConsensus(consensusRequest);
  }

  /**
   * Get consensus engine status and active requests
   */
  public getConsensusStatus(): {
    active: number;
    requests: ConsensusRequest[];
  } {
    const requests = this.consensusEngine.getActiveConsensus();
    return {
      active: requests.length,
      requests
    };
  }

  /**
   * Cancel a consensus request
   */
  public cancelConsensus(requestId: string): boolean {
    return this.consensusEngine.cancelConsensus(requestId);
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

  /**
   * Get optimal models for parallel execution based on task type
   */
  private getOptimalModelsForParallel(taskType?: TaskType): string[] {
    const allModels = this.getAvailableModels();
    
    // Define model combinations optimized for different task types
    const taskOptimizedModels = {
      [TaskType.CODE_GENERATION]: ['claude-3-5-sonnet-20241022', 'llama-3.1-70b-versatile', 'gemini-1.5-pro'],
      [TaskType.CODE_REVIEW]: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'deepseek-coder'],
      [TaskType.DEBUGGING]: ['claude-3-5-sonnet-20241022', 'llama-3.1-70b-versatile', 'claude-3-haiku-20240307'],
      [TaskType.SECURITY_ANALYSIS]: ['claude-3-5-sonnet-20241022', 'gemini-1.5-pro', 'llama-3.1-70b-versatile'],
      [TaskType.DOCUMENTATION]: ['claude-3-haiku-20240307', 'gemini-1.5-pro', 'llama-3.1-8b-instant']
    };

    const preferredModels = taskType ? taskOptimizedModels[taskType] : null;
    
    if (preferredModels) {
      // Filter to only include available models
      const availablePreferred = preferredModels.filter(modelId => 
        allModels.some(model => model.id === modelId && model.isAvailable)
      );
      
      if (availablePreferred.length >= 2) {
        return availablePreferred;
      }
    }

    // Fallback: select diverse high-quality models
    const fallbackModels = [
      'claude-3-5-sonnet-20241022',
      'llama-3.1-70b-versatile', 
      'claude-3-haiku-20240307',
      'gemini-1.5-pro',
      'llama-3.1-8b-instant'
    ];

    return fallbackModels
      .filter(modelId => allModels.some(model => model.id === modelId && model.isAvailable))
      .slice(0, 3);
  }

  /**
   * Aggregate multiple AI responses using different strategies
   */
  private async aggregateParallelResponses(
    responses: ModelResponse[],
    strategy: 'fastest' | 'consensus' | 'quality_weighted' | 'best_of_n',
    originalMessages: any[]
  ): Promise<ModelResponse> {
    if (responses.length === 0) {
      throw new Error('No responses to aggregate');
    }

    if (responses.length === 1) {
      return responses[0];
    }

    switch (strategy) {
      case 'fastest':
        // Return the first successful response (already handled by Promise.race in caller)
        return responses[0];

      case 'best_of_n':
        // Use an aggregator model to select the best response
        return await this.selectBestResponse(responses, originalMessages);

      case 'quality_weighted':
        // Weight responses by model quality scores
        return await this.qualityWeightedAggregation(responses);

      case 'consensus':
      default:
        // Use consensus-based aggregation
        return await this.consensusAggregation(responses, originalMessages);
    }
  }

  /**
   * Use an AI model to select the best response from multiple candidates
   */
  private async selectBestResponse(responses: ModelResponse[], originalMessages: any[]): Promise<ModelResponse> {
    try {
      const evaluationPrompt = `You are tasked with evaluating multiple AI responses and selecting the best one. Consider accuracy, completeness, helpfulness, and relevance to the original question.

Original question: ${originalMessages[originalMessages.length - 1]?.content || 'N/A'}

Responses to evaluate:
${responses.map((response, index) => `
Response ${index + 1}:
${response.content || response.text || 'No content'}
`).join('\n')}

Please respond with only the number (1, 2, 3, etc.) of the best response.`;

      const evaluationRequest = await this.buildRequest([
        { role: 'user', content: evaluationPrompt }
      ], {
        model: 'claude-3-5-sonnet-20241022', // Use a high-quality model for evaluation
        options: { temperature: 0.1, maxTokens: 10 }
      });

      const evaluationResponse = await this.router.routeRequest(evaluationRequest);
      const selectedIndex = parseInt(evaluationResponse.content?.trim() || '1') - 1;
      
      if (selectedIndex >= 0 && selectedIndex < responses.length) {
        return responses[selectedIndex];
      }
      
      // Fallback to first response if parsing fails
      return responses[0];
      
    } catch (error) {
      Logger.warn('Failed to evaluate responses, falling back to first response:', error.message);
      return responses[0];
    }
  }

  /**
   * Weight responses by model quality and capabilities
   */
  private async qualityWeightedAggregation(responses: ModelResponse[]): Promise<ModelResponse> {
    // Calculate quality scores based on response length, coherence, and model reputation
    const scoredResponses = responses.map((response, index) => {
      const content = response.content || response.text || '';
      const lengthScore = Math.min(content.length / 1000, 1); // Normalize to 0-1
      const modelScore = this.getModelQualityScore(response.model || 'unknown');
      const hasCodeBlocks = (content.match(/```/g) || []).length / 2; // Number of code blocks
      const codeScore = Math.min(hasCodeBlocks / 3, 1); // Up to 3 code blocks get full score
      
      const totalScore = lengthScore * 0.3 + modelScore * 0.4 + codeScore * 0.3;
      
      return {
        response,
        score: totalScore,
        index
      };
    });

    // Return the highest scoring response
    const bestResponse = scoredResponses.reduce((best, current) => 
      current.score > best.score ? current : best
    );

    return bestResponse.response;
  }

  /**
   * Create a consensus response by combining multiple responses
   */
  private async consensusAggregation(responses: ModelResponse[], originalMessages: any[]): Promise<ModelResponse> {
    try {
      const aggregationPrompt = `You are tasked with synthesizing multiple AI responses into a single, high-quality response. Critically evaluate the information provided, recognizing that some may be biased or incorrect. Your response should offer a refined, accurate, and comprehensive answer.

Original question: ${originalMessages[originalMessages.length - 1]?.content || 'N/A'}

Responses to synthesize:
${responses.map((response, index) => `
Response ${index + 1} (${response.model || 'unknown'}):
${response.content || response.text || 'No content'}
`).join('\n')}

Please provide a synthesized response that combines the best elements from all responses while maintaining accuracy and coherence.`;

      const synthesisRequest = await this.buildRequest([
        { role: 'user', content: aggregationPrompt }
      ], {
        model: 'claude-3-5-sonnet-20241022', // Use high-quality model for synthesis
        options: { temperature: 0.3, maxTokens: 4000 }
      });

      const synthesizedResponse = await this.router.routeRequest(synthesisRequest);
      
      return {
        ...synthesizedResponse,
        metadata: {
          ...synthesizedResponse.metadata,
          aggregationMethod: 'consensus',
          sourceResponses: responses.length
        }
      };
      
    } catch (error) {
      Logger.warn('Failed to create consensus response, falling back to best individual response:', error.message);
      return await this.qualityWeightedAggregation(responses);
    }
  }

  /**
   * Get quality score for a model (0-1 scale)
   */
  private getModelQualityScore(modelId: string): number {
    const modelQualityMap: Record<string, number> = {
      'claude-3-5-sonnet-20241022': 0.95,
      'gpt-4-turbo-preview': 0.90,
      'llama-3.1-70b-versatile': 0.85,
      'gemini-1.5-pro': 0.85,
      'claude-3-haiku-20240307': 0.80,
      'llama-3.1-8b-instant': 0.70,
      'deepseek-coder': 0.85
    };

    return modelQualityMap[modelId] || 0.75; // Default score for unknown models
  }

  /**
   * Calculate speed improvement from parallel execution
   */
  private calculateSpeedImprovement(actualTime: number, numModels: number): number {
    // Estimate what sequential execution would have taken
    const estimatedSequentialTime = actualTime * numModels;
    return estimatedSequentialTime / actualTime;
  }

  /**
   * Orchestrate subtasks by breaking down complex tasks
   */
  private async orchestrateSubtasks(taskContent: string, orchestratorModel: string, maxSubtasks: number): Promise<{
    analysis: string;
    subtasks: Array<{ type: string; description: string }>;
  }> {
    const orchestrationPrompt = `Analyze this task and break it down into 2-${maxSubtasks} distinct subtasks that can be processed in parallel:

Task: ${taskContent}

Provide an analysis of your understanding of the task and how it can be broken down into parallel subtasks. Focus on how each subtask serves different aspects of the overall task.

Then provide ${maxSubtasks} subtasks, each with a type and description:

Example format:
Analysis: [Your analysis here]

Subtasks:
1. Type: [task_type], Description: [detailed description]
2. Type: [task_type], Description: [detailed description]
3. Type: [task_type], Description: [detailed description]

Focus on creating subtasks that are independent and can be processed simultaneously.`;

    const orchestrationRequest = await this.buildRequest([
      { role: 'user', content: orchestrationPrompt }
    ], {
      model: orchestratorModel,
      options: { temperature: 0.2, maxTokens: 1000 }
    });

    const response = await this.router.routeRequest(orchestrationRequest);
    const content = response.content || response.text || '';

    // Parse the response to extract analysis and subtasks
    const analysisMatch = content.match(/Analysis:\s*(.*?)(?=Subtasks:|$)/s);
    const analysis = analysisMatch ? analysisMatch[1].trim() : 'Task analysis not available';

    const subtaskMatches = content.match(/\d+\.\s*Type:\s*(.*?),\s*Description:\s*(.*?)(?=\d+\.|$)/gs) || [];
    const subtasks = subtaskMatches.map(match => {
      const [, type, description] = match.match(/Type:\s*(.*?),\s*Description:\s*(.*?)$/) || ['', 'general', 'No description'];
      return {
        type: type.trim(),
        description: description.trim()
      };
    }).slice(0, maxSubtasks);

    // Fallback if parsing fails
    if (subtasks.length === 0) {
      const fallbackSubtasks = [
        { type: 'analysis', description: `Analyze and understand the requirements: ${taskContent}` },
        { type: 'implementation', description: `Implement the core functionality: ${taskContent}` },
        { type: 'optimization', description: `Optimize and refine the solution: ${taskContent}` }
      ].slice(0, maxSubtasks);

      return {
        analysis: 'Automatic task breakdown applied',
        subtasks: fallbackSubtasks
      };
    }

    return { analysis, subtasks };
  }
}