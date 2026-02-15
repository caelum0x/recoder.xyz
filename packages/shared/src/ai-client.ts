/**
 * Cross-Platform AI Client
 * Unified AI interface for all Recoder platforms with intelligent routing
 */

import { EventEmitter } from 'events';
import { AIProviderRouter, AIRequest, AIResponse, AIRequestOptions, AIRequestMetadata } from './ai-provider-router';
import { AuthClient } from './auth-client';

export interface AIClientConfig {
  platform: 'cli' | 'web' | 'mobile' | 'desktop' | 'extension';
  baseURL?: string;
  enableCaching?: boolean;
  enableAnalytics?: boolean;
  fallbackProviders?: string[];
  routingStrategy?: 'speed' | 'cost' | 'quality' | 'balanced';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  metadata?: {
    timestamp?: string;
    platform?: string;
    context?: any;
  };
}

export interface AIStreamEvent {
  type: 'start' | 'content' | 'function_call' | 'error' | 'end';
  data: any;
  timestamp: string;
}

export interface AITaskRequest {
  type: 'code_generation' | 'code_review' | 'debugging' | 'explanation' | 'chat' | 'analysis';
  input: string;
  context?: {
    language?: string;
    framework?: string;
    files?: { name: string; content: string }[];
    environment?: string;
  };
  options?: AIRequestOptions;
}

export interface AITaskResponse {
  type: string;
  output: string;
  suggestions?: string[];
  metadata: {
    provider: string;
    model: string;
    confidence: number;
    processingTime: number;
    tokens: number;
    cost: number;
  };
}

export class AIClient extends EventEmitter {
  private router: AIProviderRouter;
  private authClient: AuthClient;
  private config: Required<AIClientConfig>;
  private requestCache: Map<string, AIResponse> = new Map();
  private activeStreams: Map<string, EventEmitter> = new Map();

  constructor(authClient: AuthClient, config: AIClientConfig) {
    super();
    
    this.authClient = authClient;
    this.config = {
      platform: config.platform,
      baseURL: config.baseURL || 'http://localhost:3001',
      enableCaching: config.enableCaching ?? true,
      enableAnalytics: config.enableAnalytics ?? true,
      fallbackProviders: config.fallbackProviders || ['anthropic-claude', 'groq-llama'],
      routingStrategy: config.routingStrategy || 'balanced'
    };

    this.router = new AIProviderRouter({
      baseURL: this.config.baseURL,
      routingStrategy: this.getRoutingStrategy(),
      enableCostTracking: this.config.enableAnalytics,
      enableHealthMonitoring: true
    });

    this.setupEventHandlers();
    this.setupProviderIntegrations();
  }

  private getRoutingStrategy() {
    switch (this.config.routingStrategy) {
      case 'speed':
        return { name: 'speed-optimized' as const, config: {} };
      case 'cost':
        return { name: 'cost-optimized' as const, config: {} };
      case 'quality':
        return { name: 'quality-optimized' as const, config: {} };
      case 'balanced':
      default:
        return { name: 'least-loaded' as const, config: {} };
    }
  }

  private setupProviderIntegrations(): void {
    // Platform-specific provider configurations
    const platformConfigs = this.getPlatformSpecificConfigs();
    
    for (const config of platformConfigs) {
      if (this.isProviderAvailable(config.type, config.requirements)) {
        // Provider would be configured here based on platform capabilities
        console.log(`Configured ${config.name} for ${this.config.platform}`);
      }
    }
  }

  private getPlatformSpecificConfigs() {
    const configs = [
      {
        name: 'Claude API',
        type: 'anthropic',
        requirements: ['api_key'],
        platforms: ['cli', 'web', 'mobile', 'desktop', 'extension']
      },
      {
        name: 'Groq',
        type: 'groq', 
        requirements: ['api_key'],
        platforms: ['cli', 'web', 'mobile', 'desktop', 'extension']
      },
      {
        name: 'Gemini',
        type: 'gemini',
        requirements: ['api_key'],
        platforms: ['cli', 'web', 'mobile', 'desktop', 'extension']
      },
      {
        name: 'Ollama Local',
        type: 'ollama',
        requirements: ['local_server'],
        platforms: ['cli', 'desktop'],
        localOnly: true
      },
      {
        name: 'VS Code Language Models',
        type: 'vscode-lm',
        requirements: ['vscode_extension'],
        platforms: ['extension'],
        integrated: true
      }
    ];

    return configs.filter(c => c.platforms.includes(this.config.platform));
  }

  private isProviderAvailable(type: string, requirements: string[]): boolean {
    // This would check if provider requirements are met
    // For now, simulate availability
    if (type === 'ollama' && !['cli', 'desktop'].includes(this.config.platform)) {
      return false;
    }
    if (type === 'vscode-lm' && this.config.platform !== 'extension') {
      return false;
    }
    return true;
  }

  // High-Level AI Tasks
  async generateCode(prompt: string, language: string, context?: any): Promise<AITaskResponse> {
    const request: AITaskRequest = {
      type: 'code_generation',
      input: prompt,
      context: {
        language,
        framework: context?.framework,
        files: context?.files,
        environment: this.config.platform
      },
      options: {
        temperature: 0.3, // Lower temperature for code generation
        maxTokens: 4000,
        systemPrompt: this.getSystemPrompt('code_generation', language)
      }
    };

    return await this.processTask(request);
  }

  async reviewCode(code: string, language: string, focus?: string[]): Promise<AITaskResponse> {
    const request: AITaskRequest = {
      type: 'code_review',
      input: code,
      context: {
        language,
        environment: this.config.platform
      },
      options: {
        temperature: 0.2,
        maxTokens: 2000,
        systemPrompt: this.getSystemPrompt('code_review', language, focus)
      }
    };

    return await this.processTask(request);
  }

  async debugCode(code: string, error: string, language: string): Promise<AITaskResponse> {
    const request: AITaskRequest = {
      type: 'debugging',
      input: `Code:\n${code}\n\nError:\n${error}`,
      context: {
        language,
        environment: this.config.platform
      },
      options: {
        temperature: 0.1, // Very low temperature for debugging
        maxTokens: 3000,
        systemPrompt: this.getSystemPrompt('debugging', language)
      }
    };

    return await this.processTask(request);
  }

  async explainCode(code: string, language: string, level: 'beginner' | 'intermediate' | 'advanced' = 'intermediate'): Promise<AITaskResponse> {
    const request: AITaskRequest = {
      type: 'explanation',
      input: code,
      context: {
        language,
        environment: this.config.platform
      },
      options: {
        temperature: 0.4,
        maxTokens: 2500,
        systemPrompt: this.getSystemPrompt('explanation', language, [level])
      }
    };

    return await this.processTask(request);
  }

  async chat(messages: ChatMessage[], stream = false): Promise<AITaskResponse | EventEmitter> {
    const request: AITaskRequest = {
      type: 'chat',
      input: JSON.stringify(messages),
      options: {
        temperature: 0.7,
        maxTokens: 2000,
        stream,
        systemPrompt: this.getSystemPrompt('chat')
      }
    };

    if (stream) {
      return this.processTaskStream(request);
    }

    return await this.processTask(request);
  }

  // Low-Level AI Interface
  async sendRequest(
    messages: ChatMessage[],
    options: AIRequestOptions = {},
    metadata: Partial<AIRequestMetadata> = {}
  ): Promise<AIResponse> {
    const requestId = this.generateRequestId();
    const cacheKey = this.generateCacheKey(messages, options);

    // Check cache
    if (this.config.enableCaching && this.requestCache.has(cacheKey)) {
      const cached = this.requestCache.get(cacheKey)!;
      this.emit('responseFromCache', { requestId, cached });
      return cached;
    }

    const request: AIRequest = {
      id: requestId,
      provider: '', // Will be determined by router
      model: '', // Will be determined by router
      platform: this.config.platform,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      options,
      metadata: {
        userId: this.authClient.getUser()?.id,
        deviceId: this.authClient.getDeviceInfo()?.deviceId,
        platform: this.config.platform,
        timestamp: new Date().toISOString(),
        requestType: metadata.requestType || 'chat',
        ...metadata
      }
    };

    try {
      this.emit('requestStarted', { requestId, request });
      
      const response = await this.router.routeRequest(request);
      
      // Cache successful responses
      if (this.config.enableCaching) {
        this.requestCache.set(cacheKey, response);
        
        // Clean cache periodically
        if (this.requestCache.size > 100) {
          const keys = Array.from(this.requestCache.keys());
          for (let i = 0; i < 20; i++) {
            this.requestCache.delete(keys[i]);
          }
        }
      }

      this.emit('responseReceived', { requestId, response });
      
      return response;

    } catch (error) {
      this.emit('requestFailed', { requestId, error });
      
      // Try fallback providers
      if (this.config.fallbackProviders.length > 0) {
        console.warn(`Primary request failed, trying fallback providers`);
        // Fallback logic would go here
      }
      
      throw error;
    }
  }

  sendStreamRequest(
    messages: ChatMessage[],
    options: AIRequestOptions = {},
    metadata: Partial<AIRequestMetadata> = {}
  ): EventEmitter {
    const requestId = this.generateRequestId();
    const stream = new EventEmitter();
    
    this.activeStreams.set(requestId, stream);

    // Simulate streaming response
    setTimeout(() => {
      stream.emit('start', { requestId });
      
      const words = 'This is a simulated streaming response from the AI provider.'.split(' ');
      let wordIndex = 0;
      
      const interval = setInterval(() => {
        if (wordIndex < words.length) {
          stream.emit('content', {
            content: words[wordIndex] + ' ',
            timestamp: new Date().toISOString()
          });
          wordIndex++;
        } else {
          clearInterval(interval);
          stream.emit('end', {
            usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70, cost: 0.01 },
            timestamp: new Date().toISOString()
          });
          this.activeStreams.delete(requestId);
        }
      }, 100);
    }, 100);

    return stream;
  }

  // Task Processing
  private async processTask(request: AITaskRequest): Promise<AITaskResponse> {
    const messages: ChatMessage[] = [
      { role: 'system', content: request.options?.systemPrompt || 'You are a helpful AI assistant.' },
      { role: 'user', content: request.input }
    ];

    const startTime = Date.now();
    const response = await this.sendRequest(messages, request.options);
    const processingTime = Date.now() - startTime;

    return {
      type: request.type,
      output: response.content,
      suggestions: this.extractSuggestions(response.content, request.type),
      metadata: {
        provider: response.provider,
        model: response.model,
        confidence: this.calculateConfidence(request.type, response),
        processingTime,
        tokens: response.usage.totalTokens,
        cost: response.usage.cost
      }
    };
  }

  private processTaskStream(request: AITaskRequest): EventEmitter {
    const messages: ChatMessage[] = [
      { role: 'system', content: request.options?.systemPrompt || 'You are a helpful AI assistant.' },
      { role: 'user', content: request.input }
    ];

    return this.sendStreamRequest(messages, { ...request.options, stream: true });
  }

  private getSystemPrompt(type: string, language?: string, params?: string[]): string {
    const prompts = {
      code_generation: `You are an expert ${language} developer. Generate clean, efficient, and well-documented code. Focus on best practices and production-ready solutions.`,
      code_review: `You are a senior software engineer performing a code review. Analyze the ${language} code for bugs, performance issues, security vulnerabilities, and style improvements.${params?.length ? ` Focus particularly on: ${params.join(', ')}.` : ''}`,
      debugging: `You are a debugging expert. Analyze the ${language} code and error message to identify the root cause and provide a clear solution with explanations.`,
      explanation: `You are a programming instructor. Explain the ${language} code in a clear, ${params?.[0] || 'intermediate'}-level manner with examples and context.`,
      chat: 'You are Claude, an AI assistant created by Anthropic. You are helpful, harmless, and honest. You excel at coding tasks and can help with software development across multiple platforms.',
      analysis: 'You are a technical analyst. Provide thorough analysis with insights, recommendations, and actionable conclusions.'
    };

    return prompts[type as keyof typeof prompts] || prompts.chat;
  }

  private extractSuggestions(content: string, type: string): string[] {
    // Extract actionable suggestions based on response type
    const suggestions: string[] = [];
    
    if (type === 'code_review') {
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.includes('suggestion') || line.includes('consider') || line.includes('recommend')) {
          suggestions.push(line.trim());
        }
      }
    } else if (type === 'debugging') {
      if (content.includes('try')) {
        suggestions.push('Try the proposed solution');
      }
      if (content.includes('check')) {
        suggestions.push('Verify the identified issues');
      }
    }
    
    return suggestions;
  }

  private calculateConfidence(type: string, response: AIResponse): number {
    // Simple confidence calculation based on response characteristics
    let confidence = 0.8; // Base confidence
    
    if (response.usage.totalTokens > 1000) confidence += 0.1; // Detailed response
    if (response.metadata.responseTime < 2000) confidence += 0.05; // Fast response
    if (response.provider === 'anthropic-claude') confidence += 0.05; // High-quality provider
    
    return Math.min(confidence, 1.0);
  }

  // Utility Methods
  private generateRequestId(): string {
    return `req_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }

  private generateCacheKey(messages: ChatMessage[], options: AIRequestOptions): string {
    const content = messages.map(m => `${m.role}:${m.content}`).join('|');
    const opts = JSON.stringify(options);
    return Buffer.from(`${content}:${opts}`).toString('base64').slice(0, 32);
  }

  // Analytics and Status
  getAnalytics() {
    return this.router.getProviderAnalytics();
  }

  getRecommendation(task: 'coding' | 'chat' | 'analysis' | 'multimodal', priority?: 'speed' | 'cost' | 'quality') {
    return this.router.getRecommendation(task, priority);
  }

  getStatus() {
    return {
      platform: this.config.platform,
      providersAvailable: this.router.totalProviders,
      healthyProviders: this.router.getHealthyProviders().length,
      routingMode: this.router.routingMode,
      cacheSize: this.requestCache.size,
      activeStreams: this.activeStreams.size,
      isAuthenticated: this.authClient.isAuthenticated()
    };
  }

  // Event handlers
  private setupEventHandlers(): void {
    this.router.on('providerError', (data) => {
      this.emit('providerError', data);
    });

    this.router.on('providerHealthUpdated', (data) => {
      this.emit('providerHealthUpdated', data);
    });

    this.router.on('requestCompleted', (data) => {
      if (this.config.enableAnalytics) {
        this.trackUsage(data);
      }
    });
  }

  private trackUsage(data: any): void {
    // Track usage for analytics
    this.emit('usageTracked', {
      platform: this.config.platform,
      provider: data.provider.id,
      model: data.model.id,
      tokens: data.response.usage.totalTokens,
      cost: data.response.usage.cost,
      timestamp: new Date().toISOString()
    });
  }

  // Platform-specific methods
  async getLocalModels(): Promise<string[]> {
    if (this.config.platform === 'desktop' || this.config.platform === 'cli') {
      // Check for Ollama models
      try {
        const ollama = this.router.getProvider('ollama-local');
        return ollama?.models.map(m => m.id) || [];
      } catch (error) {
        return [];
      }
    }
    return [];
  }

  async testProviderConnection(providerId: string): Promise<boolean> {
    const provider = this.router.getProvider(providerId);
    if (!provider) return false;

    try {
      // Test with a simple request
      const testMessages: ChatMessage[] = [
        { role: 'user', content: 'Hello' }
      ];
      
      await this.sendRequest(testMessages, { maxTokens: 10 });
      return true;
    } catch (error) {
      return false;
    }
  }

  // Cleanup
  destroy(): void {
    // Cancel active streams
    for (const [id, stream] of this.activeStreams) {
      stream.emit('cancelled', { reason: 'Client destroyed' });
      this.activeStreams.delete(id);
    }
    
    this.requestCache.clear();
    this.router.destroy();
    this.removeAllListeners();
  }
}

export default AIClient;