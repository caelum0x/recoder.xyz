/**
 * OpenRouter AI Service for CLI
 * Real AI chat integration with smart routing and pricing optimization
 */

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
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
}

interface ChatRequest {
  messages: OpenRouterMessage[];
  userPlan?: 'free' | '$10/week' | '$20/month' | '$100/month' | '$200/month' | 'enterprise';
  priority?: 'cost' | 'quality' | 'speed';
  contextType?: 'chat' | 'code' | 'planning' | 'debugging';
}

interface ChatResponse {
  content: string;
  model: string;
  provider: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
  };
  routingInfo: {
    selectedModel: string;
    routingStrategy: string;
    costOptimization: number; // Percentage saved vs Claude direct
  };
}

export class OpenRouterAI {
  private apiKey: string;
  private baseURL = 'https://openrouter.ai/api/v1';
  private productionEngineURL: string;
  
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.productionEngineURL = process.env.PRODUCTION_ENGINE_URL || 'http://localhost:3100';
    
    if (!this.apiKey) {
      console.warn('⚠️ OpenRouter API key not found. Using fallback mode.');
    }
  }

  /**
   * Send chat message with smart routing
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      // Try production engine first for enhanced routing
      if (await this.isProductionEngineAvailable()) {
        return await this.chatViaProductionEngine(request);
      }
      
      // Fallback to direct OpenRouter
      return await this.chatDirectOpenRouter(request);
      
    } catch (error) {
      console.error('❌ OpenRouter chat failed:', error.message);
      throw error;
    }
  }

  /**
   * Chat via production engine for enhanced routing and cost optimization
   */
  private async chatViaProductionEngine(request: ChatRequest): Promise<ChatResponse> {
    try {
      const response = await fetch(`${this.productionEngineURL}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          messages: request.messages,
          userPlan: request.userPlan || 'free',
          priority: request.priority || 'quality',
          contextType: request.contextType || 'chat',
          enableSmartRouting: true,
          enableCostOptimization: true
        })
      });

      if (!response.ok) {
        throw new Error(`Production engine error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        content: data.content,
        model: data.model,
        provider: 'production-engine',
        usage: {
          inputTokens: data.usage.inputTokens,
          outputTokens: data.usage.outputTokens,
          totalTokens: data.usage.totalTokens,
          cost: data.usage.cost
        },
        routingInfo: {
          selectedModel: data.model,
          routingStrategy: data.routingStrategy || 'smart-routing',
          costOptimization: data.costOptimization || 0
        }
      };
      
    } catch (error) {
      console.warn('Production engine unavailable, falling back to direct OpenRouter');
      throw error;
    }
  }

  /**
   * Direct OpenRouter chat with model selection
   */
  private async chatDirectOpenRouter(request: ChatRequest): Promise<ChatResponse> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key required');
    }

    // Select model based on user plan and request type
    const model = this.selectModelForRequest(request);
    
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://recoder.xyz',
        'X-Title': 'Recoder.xyz CLI'
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: this.getTemperatureForContext(request.contextType),
        max_tokens: this.getMaxTokensForPlan(request.userPlan),
        top_p: 0.9,
        frequency_penalty: 0,
        presence_penalty: 0
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data: OpenRouterResponse = await response.json();
    const cost = this.calculateCost(data.usage.total_tokens, model);
    
    // Calculate cost optimization vs Claude direct pricing
    const claudeCost = this.calculateCost(data.usage.total_tokens, 'anthropic/claude-3.5-sonnet');
    const costOptimization = Math.round(((claudeCost - cost) / claudeCost) * 100);

    return {
      content: data.choices[0].message.content,
      model,
      provider: 'openrouter',
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
        cost
      },
      routingInfo: {
        selectedModel: model,
        routingStrategy: 'plan-based-selection',
        costOptimization
      }
    };
  }

  /**
   * Smart model selection with 79% cost optimization strategy
   */
  private selectModelForRequest(request: ChatRequest): string {
    const { userPlan = 'free', contextType = 'chat', priority = 'quality' } = request;
    
    // FREE TIER: Only free models
    if (userPlan === 'free') {
      const freeModels = [
        'deepseek/deepseek-v3-0324-free',
        'deepseek/deepseek-r1-0528-free'
      ];
      
      // Smart routing even for free: 60% DeepSeek V3, 40% R1
      const random = Math.random();
      return random < 0.6 ? freeModels[0] : freeModels[1];
    }
    
    // PAID TIERS: Smart routing for 79% cost reduction
    const allModels = {
      // Premium models (15% of traffic) - Best quality
      premium: [
        'anthropic/claude-4-sonnet',        // $15/1M tokens
        'anthropic/claude-3.5-sonnet',      // $15/1M tokens  
        'google/gemini-2.5-pro'             // $7.50/1M tokens
      ],
      
      // Balanced models (25% of traffic) - Good quality, medium cost
      balanced: [
        'google/gemini-2.5-flash',          // $0.30/1M tokens
        'google/gemini-2.0-flash',          // $0.30/1M tokens
        'qwen/qwq-32b-preview'              // $1.00/1M tokens
      ],
      
      // Cost-effective models (60% of traffic) - Great value
      costEffective: [
        'deepseek/deepseek-v3-0324',        // $2.19/1M tokens
        'meta-llama/llama-3.3-70b-instruct', // $0.79/1M tokens
        'microsoft/wizardlm-2-8x22b'       // $1.00/1M tokens
      ]
    };

    // Smart routing distribution: 60% cost-effective, 25% balanced, 15% premium
    const random = Math.random();
    let modelTier: 'costEffective' | 'balanced' | 'premium';
    
    if (random < 0.6) {
      modelTier = 'costEffective';
    } else if (random < 0.85) {
      modelTier = 'balanced';
    } else {
      modelTier = 'premium';
    }
    
    // Override based on priority
    if (priority === 'cost') {
      modelTier = 'costEffective';
    } else if (priority === 'quality') {
      modelTier = 'premium';
    }
    
    // Override based on context type
    if (contextType === 'code' || contextType === 'debugging') {
      // Code generation needs quality
      modelTier = random < 0.4 ? 'premium' : 'balanced';
    } else if (contextType === 'planning') {
      // Planning needs reasoning
      modelTier = 'premium';
    }
    
    // Select random model from chosen tier
    const tierModels = allModels[modelTier];
    const randomModel = tierModels[Math.floor(Math.random() * tierModels.length)];
    
    return randomModel;
  }

  /**
   * Get temperature based on context type
   */
  private getTemperatureForContext(contextType?: string): number {
    const temperatures = {
      'chat': 0.7,        // Natural conversation
      'code': 0.1,        // Precise code generation
      'planning': 0.5,    // Structured thinking
      'debugging': 0.2    // Logical problem solving
    };
    
    return temperatures[contextType as keyof typeof temperatures] || 0.7;
  }

  /**
   * Get max tokens based on user plan
   */
  private getMaxTokensForPlan(userPlan?: string): number {
    const limits = {
      'free': 2000,
      '$10/week': 4000,
      '$20/month': 8000,
      '$100/month': 16000,
      '$200/month': 32000,
      'enterprise': 64000
    };
    
    return limits[userPlan as keyof typeof limits] || 2000;
  }

  /**
   * Calculate cost based on OpenRouter pricing
   */
  private calculateCost(tokens: number, model: string): number {
    // OpenRouter pricing per 1M tokens (simplified)
    const pricing: Record<string, { input: number; output: number }> = {
      // Premium models
      'anthropic/claude-4-sonnet': { input: 3.0, output: 15.0 },
      'anthropic/claude-3.5-sonnet': { input: 3.0, output: 15.0 },
      'google/gemini-2.5-pro': { input: 1.25, output: 5.0 },
      
      // Balanced models
      'google/gemini-2.5-flash': { input: 0.075, output: 0.3 },
      'google/gemini-2.0-flash': { input: 0.075, output: 0.3 },
      'qwen/qwq-32b-preview': { input: 0.2, output: 1.0 },
      
      // Cost-effective models
      'deepseek/deepseek-v3-0324': { input: 0.55, output: 2.19 },
      'meta-llama/llama-3.3-70b-instruct': { input: 0.59, output: 0.79 },
      'microsoft/wizardlm-2-8x22b': { input: 0.63, output: 1.0 },
      
      // Free models
      'deepseek/deepseek-v3-0324-free': { input: 0, output: 0 },
      'deepseek/deepseek-r1-0528-free': { input: 0, output: 0 }
    };

    const modelPricing = pricing[model] || { input: 1.0, output: 2.0 };
    
    // Estimate 30% input, 70% output tokens
    const inputTokens = Math.ceil(tokens * 0.3);
    const outputTokens = Math.ceil(tokens * 0.7);
    
    const cost = (inputTokens * modelPricing.input + outputTokens * modelPricing.output) / 1000000;
    
    return parseFloat(cost.toFixed(6));
  }

  /**
   * Check if production engine is available
   */
  private async isProductionEngineAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.productionEngineURL}/health`, {
        method: 'GET',
        timeout: 3000
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available models for user's plan
   */
  getAvailableModels(userPlan: 'free' | '$10/week' | '$20/month' | '$100/month' | '$200/month' | 'enterprise' = 'free'): string[] {
    if (userPlan === 'free') {
      return [
        'deepseek/deepseek-v3-0324-free',
        'deepseek/deepseek-r1-0528-free'
      ];
    }
    
    return [
      'anthropic/claude-4-sonnet',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.5-pro',
      'google/gemini-2.5-flash',
      'google/gemini-2.0-flash',
      'deepseek/deepseek-v3-0324',
      'qwen/qwq-32b-preview',
      'meta-llama/llama-3.3-70b-instruct',
      'microsoft/wizardlm-2-8x22b'
    ];
  }

  /**
   * Get rate limits for user's plan
   */
  getRateLimits(userPlan: 'free' | '$10/week' | '$20/month' | '$100/month' | '$200/month' | 'enterprise' = 'free'): {
    requestsPerHour: number;
    requestsPerDay: number;
    tokensPerRequest: number;
  } {
    const limits = {
      'free': { requestsPerHour: 10, requestsPerDay: 50, tokensPerRequest: 2000 },
      '$10/week': { requestsPerHour: 50, requestsPerDay: 500, tokensPerRequest: 4000 },
      '$20/month': { requestsPerHour: 100, requestsPerDay: 1000, tokensPerRequest: 8000 },
      '$100/month': { requestsPerHour: 500, requestsPerDay: 5000, tokensPerRequest: 16000 },
      '$200/month': { requestsPerHour: 1000, requestsPerDay: 10000, tokensPerRequest: 32000 },
      'enterprise': { requestsPerHour: -1, requestsPerDay: -1, tokensPerRequest: 64000 }
    };

    return limits[userPlan] || limits.free;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; models: number; apiKey: boolean }> {
    try {
      if (!this.apiKey) {
        return { status: 'no-api-key', models: 0, apiKey: false };
      }

      const response = await fetch(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://recoder.xyz'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return { 
          status: 'healthy', 
          models: data.data?.length || 0, 
          apiKey: true 
        };
      }

      return { status: 'api-error', models: 0, apiKey: true };
    } catch (error) {
      return { status: 'offline', models: 0, apiKey: false };
    }
  }
}

export const openRouterAI = new OpenRouterAI();
export default openRouterAI;