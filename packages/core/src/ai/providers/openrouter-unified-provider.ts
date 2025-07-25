/**
 * OpenRouter Unified Provider for Recoder.xyz
 * 
 * Provides unified access to Kimi K2, Qwen 3, DeepSeek R1, and other models
 * through OpenRouter's intelligent routing with automatic fallbacks
 */

import { BaseAIProvider, AIRequest, AIResponse, StreamChunk, ProviderConfig } from './base-provider';

export interface OpenRouterConfig extends ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  siteName?: string;
  appName?: string;
  defaultFallbacks?: boolean;
  costOptimization?: 'speed' | 'cost' | 'balanced';
}

export interface OpenRouterModel {
  id: string;
  name: string;
  costPerMToken: {
    input: number;
    output: number;
  };
  contextLength: number;
  specialties: string[];
  tier: 'premium' | 'balanced' | 'efficient';
}

export interface OpenRouterRequestBody {
  model: string;
  messages: any[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  provider?: {
    order?: string[];
    allow_fallbacks?: boolean;
    data_collection?: 'deny' | 'allow';
  };
  models?: string[];
  route?: 'fallback';
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  provider_name?: string;
}

export class OpenRouterUnifiedProvider extends BaseAIProvider {
  private config: OpenRouterConfig;
  private baseUrl: string;
  private models: Map<string, OpenRouterModel> = new Map();

  constructor(config: OpenRouterConfig) {
    super('openrouter', 'OpenRouter Unified', config);
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
    this.initializeModels();
  }

  /**
   * Initialize supported models with pricing and capabilities
   */
  private initializeModels(): void {
    const modelConfigs: OpenRouterModel[] = [
      // Kimi K2 - #5 on leaderboard
      {
        id: 'moonshot/kimi-k2',
        name: 'Kimi K2',
        costPerMToken: { input: 0.15, output: 2.50 },
        contextLength: 128000,
        specialties: ['analysis', 'tool-calling', 'agentic', 'long-context'],
        tier: 'premium'
      },
      // Qwen 3 Coder - #9 on leaderboard  
      {
        id: 'qwen/qwen-3-coder-480b',
        name: 'Qwen 3 Coder 480B',
        costPerMToken: { input: 0.20, output: 0.60 },
        contextLength: 256000,
        specialties: ['code-generation', 'repository-analysis', 'efficiency'],
        tier: 'balanced'
      },
      // DeepSeek R1 - #8 on leaderboard
      {
        id: 'deepseek/deepseek-r1',
        name: 'DeepSeek R1',
        costPerMToken: { input: 0.55, output: 2.19 },
        contextLength: 65536,
        specialties: ['reasoning', 'step-by-step', 'cost-effective', 'transparent-thinking'],
        tier: 'premium'
      },
      // Additional high-performing models
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        costPerMToken: { input: 3.00, output: 15.00 },
        contextLength: 200000,
        specialties: ['complex-reasoning', 'security', 'architecture'],
        tier: 'premium'
      },
      {
        id: 'meta-llama/llama-3.3-70b-instruct',
        name: 'Llama 3.3 70B',
        costPerMToken: { input: 0.35, output: 0.40 },
        contextLength: 131072,
        specialties: ['general', 'fast', 'cost-effective'],
        tier: 'efficient'
      }
    ];

    modelConfigs.forEach(model => {
      this.models.set(model.id, model);
    });
  }

  /**
   * Send request with intelligent model routing
   */
  async sendRequest(request: AIRequest): Promise<AIResponse> {
    this.validateRequest(request);
    this.trackRequestStart(request);

    const startTime = Date.now();

    try {
      const routingDecision = this.determineOptimalRouting(request);
      const openRouterRequest = this.buildOpenRouterRequest(request, routingDecision);
      
      const response = await this.makeAPIRequest('/chat/completions', openRouterRequest);
      const openRouterResponse = response as OpenRouterResponse;

      if (!openRouterResponse.choices || openRouterResponse.choices.length === 0) {
        throw new Error('No response choices received from OpenRouter');
      }

      const choice = openRouterResponse.choices[0];
      const content = choice.message.content;

      const aiResponse: AIResponse = {
        id: request.id,
        content,
        usage: {
          inputTokens: openRouterResponse.usage.prompt_tokens,
          outputTokens: openRouterResponse.usage.completion_tokens,
          totalTokens: openRouterResponse.usage.total_tokens,
          cost: this.calculateActualCost(
            openRouterResponse.model,
            openRouterResponse.usage.prompt_tokens,
            openRouterResponse.usage.completion_tokens
          )
        },
        metadata: {
          model: openRouterResponse.model,
          provider: openRouterResponse.provider_name || 'openrouter',
          responseTime: Date.now() - startTime,
          finishReason: this.mapFinishReason(choice.finish_reason),
          confidence: this.calculateConfidence(choice, openRouterResponse.model),
          toolCalls: [],
          routingDecision: routingDecision.rationale
        }
      };

      this.trackRequestComplete(request, aiResponse);
      return aiResponse;

    } catch (error) {
      this.trackRequestError(request, error as Error);
      throw error;
    }
  }

  /**
   * Determine optimal routing based on task complexity and cost constraints
   */
  private determineOptimalRouting(request: AIRequest): {
    primaryModel: string;
    fallbacks: string[];
    rationale: string;
  } {
    const taskComplexity = this.assessTaskComplexity(request);
    const userBudget = request.context?.budget || 'balanced';
    const requiresReasoning = this.requiresReasoning(request);
    const requiresCode = this.requiresCodeGeneration(request);

    // Cost optimization routing based on your plan's $12-13 target per user
    if (userBudget === 'cost-optimized' || request.context?.tier === 'free') {
      return {
        primaryModel: 'meta-llama/llama-3.3-70b-instruct',
        fallbacks: ['qwen/qwen-3-coder-480b', 'moonshot/kimi-k2'],
        rationale: 'Cost-optimized routing for budget-conscious users'
      };
    }

    // Reasoning-heavy tasks -> DeepSeek R1
    if (requiresReasoning || taskComplexity === 'high') {
      return {
        primaryModel: 'deepseek/deepseek-r1',
        fallbacks: ['anthropic/claude-3.5-sonnet', 'moonshot/kimi-k2'],
        rationale: 'Advanced reasoning required - using DeepSeek R1 for transparent thinking'
      };
    }

    // Code generation tasks -> Qwen 3 Coder
    if (requiresCode || request.metadata.taskType === 'code-generation') {
      return {
        primaryModel: 'qwen/qwen-3-coder-480b',
        fallbacks: ['moonshot/kimi-k2', 'meta-llama/llama-3.3-70b-instruct'],
        rationale: 'Code generation optimized - using Qwen 3 Coder for repository-scale understanding'
      };
    }

    // Complex analysis or tool calling -> Kimi K2
    if (request.context?.toolsAvailable || taskComplexity === 'medium') {
      return {
        primaryModel: 'moonshot/kimi-k2',
        fallbacks: ['qwen/qwen-3-coder-480b', 'meta-llama/llama-3.3-70b-instruct'],
        rationale: 'Analysis and tool calling - using Kimi K2 for agentic capabilities'
      };
    }

    // Default balanced routing
    return {
      primaryModel: 'meta-llama/llama-3.3-70b-instruct',
      fallbacks: ['qwen/qwen-3-coder-480b', 'moonshot/kimi-k2'],
      rationale: 'Balanced routing for general tasks'
    };
  }

  /**
   * Build OpenRouter request with fallback configuration
   */
  private buildOpenRouterRequest(request: AIRequest, routing: any): OpenRouterRequestBody {
    const messages = this.formatMessages(request);

    return {
      model: routing.primaryModel,
      models: [routing.primaryModel, ...routing.fallbacks],
      messages,
      max_tokens: request.options.maxTokens || 4096,
      temperature: request.options.temperature || 0.7,
      top_p: 0.9,
      stream: false,
      provider: {
        order: this.getProviderOrder(routing.primaryModel),
        allow_fallbacks: this.config.defaultFallbacks !== false,
        data_collection: 'deny'
      },
      route: 'fallback'
    };
  }

  /**
   * Get provider order preferences for model
   */
  private getProviderOrder(modelId: string): string[] {
    const providerMap: { [key: string]: string[] } = {
      'moonshot/kimi-k2': ['Moonshot', 'OpenRouter'],
      'qwen/qwen-3-coder-480b': ['Together', 'Hugging Face', 'OpenRouter'],
      'deepseek/deepseek-r1': ['DeepSeek', 'OpenRouter'],
      'anthropic/claude-3.5-sonnet': ['Anthropic', 'OpenRouter'],
      'meta-llama/llama-3.3-70b-instruct': ['Together', 'Fireworks', 'OpenRouter']
    };

    return providerMap[modelId] || ['OpenRouter'];
  }

  /**
   * Assess task complexity for routing decisions
   */
  private assessTaskComplexity(request: AIRequest): 'low' | 'medium' | 'high' {
    const prompt = request.prompt.toLowerCase();
    const inputLength = request.prompt.length;

    // High complexity indicators
    if (prompt.includes('architecture') || 
        prompt.includes('design pattern') ||
        prompt.includes('security audit') ||
        prompt.includes('performance optimization') ||
        inputLength > 8000) {
      return 'high';
    }

    // Medium complexity indicators
    if (prompt.includes('refactor') ||
        prompt.includes('debug') ||
        prompt.includes('analyze') ||
        inputLength > 2000) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Check if request requires reasoning capabilities
   */
  private requiresReasoning(request: AIRequest): boolean {
    const indicators = [
      'why', 'how', 'explain', 'reasoning', 'step-by-step',
      'analyze', 'compare', 'evaluate', 'decision', 'strategy'
    ];

    return indicators.some(indicator => 
      request.prompt.toLowerCase().includes(indicator)
    );
  }

  /**
   * Check if request requires code generation
   */
  private requiresCodeGeneration(request: AIRequest): boolean {
    const indicators = [
      'function', 'class', 'method', 'code', 'implement',
      'create', 'build', 'generate', 'write', 'programming'
    ];

    return indicators.some(indicator => 
      request.prompt.toLowerCase().includes(indicator)
    );
  }

  /**
   * Calculate actual cost based on model used
   */
  private calculateActualCost(model: string, inputTokens: number, outputTokens: number): number {
    const modelConfig = this.models.get(model);
    if (!modelConfig) {
      // Fallback cost estimation
      return ((inputTokens / 1_000_000) * 1.0) + ((outputTokens / 1_000_000) * 3.0);
    }

    const inputCost = (inputTokens / 1_000_000) * modelConfig.costPerMToken.input;
    const outputCost = (outputTokens / 1_000_000) * modelConfig.costPerMToken.output;
    
    // Add OpenRouter's 5.5% fee for credit purchases
    return (inputCost + outputCost) * 1.055;
  }

  /**
   * Format messages for OpenRouter API
   */
  private formatMessages(request: AIRequest): any[] {
    const messages = [];

    // Add system prompt if provided
    if (request.options.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.options.systemPrompt
      });
    }

    // Add context messages if provided
    if (request.context?.previousMessages) {
      messages.push(...request.context.previousMessages);
    }

    // Add current prompt
    messages.push({
      role: 'user',
      content: request.prompt
    });

    return messages;
  }

  /**
   * Make API request to OpenRouter
   */
  private async makeAPIRequest(endpoint: string, body: OpenRouterRequestBody): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'HTTP-Referer': this.config.siteName || 'https://recoder.xyz',
      'X-Title': this.config.appName || 'Recoder AI Coding Assistant'
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`OpenRouter API error: ${response.status} - ${error.error?.message || 'Unknown error'}`);
    }

    return response.json();
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<string[]> {
    return Array.from(this.models.keys());
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const testRequest: OpenRouterRequestBody = {
        model: 'meta-llama/llama-3.3-70b-instruct',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1
      };

      await this.makeAPIRequest('/chat/completions', testRequest);
      return true;
    } catch (error) {
      console.error('OpenRouter connection test failed:', error);
      return false;
    }
  }

  /**
   * Get maximum tokens supported
   */
  protected getMaxTokensSupported(): number {
    return 256000; // Max from Qwen 3 Coder
  }

  /**
   * Map finish reason to standard format
   */
  private mapFinishReason(finishReason: string): AIResponse['metadata']['finishReason'] {
    const mapping: { [key: string]: AIResponse['metadata']['finishReason'] } = {
      'stop': 'completed',
      'length': 'length',
      'content_filter': 'content_filter',
      'tool_calls': 'tool_calls'
    };

    return mapping[finishReason] || 'completed';
  }

  /**
   * Calculate confidence score based on model and response
   */
  private calculateConfidence(choice: any, model: string): number {
    const modelConfig = this.models.get(model);
    let baseConfidence = 0.85;

    if (modelConfig?.tier === 'premium') {
      baseConfidence = 0.92;
    } else if (modelConfig?.tier === 'balanced') {
      baseConfidence = 0.88;
    }

    if (choice.finish_reason === 'stop') {
      baseConfidence += 0.05;
    }

    const content = choice.message?.content || '';
    if (content.length > 100 && !content.includes('I cannot') && !content.includes('I\'m sorry')) {
      baseConfidence += 0.03;
    }

    return Math.min(1.0, baseConfidence);
  }

  /**
   * Get cost optimization recommendations
   */
  getCostOptimizationRecommendations(usage: { totalCost: number; requestCount: number }): {
    currentTier: string;
    suggestedActions: string[];
    projectedSavings: number;
  } {
    const avgCostPerRequest = usage.totalCost / usage.requestCount;
    const recommendations: string[] = [];
    let projectedSavings = 0;

    if (avgCostPerRequest > 0.02) {
      recommendations.push('Consider using Qwen 3 Coder for code generation tasks (60% cost reduction)');
      projectedSavings += usage.totalCost * 0.6;
    }

    if (usage.requestCount > 1000) {
      recommendations.push('Enable context caching for up to 90% savings on repeated queries');
      projectedSavings += usage.totalCost * 0.4;
    }

    const currentTier = avgCostPerRequest > 0.05 ? 'premium' : 
                       avgCostPerRequest > 0.02 ? 'balanced' : 'efficient';

    return {
      currentTier,
      suggestedActions: recommendations,
      projectedSavings
    };
  }
}

export default OpenRouterUnifiedProvider;