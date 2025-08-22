/**
 * Premium AI Client for CLI
 * Routes all AI requests through our production engine with OpenRouter API key
 * This enables monetization by using our API key instead of user keys
 */

import axios, { AxiosInstance } from 'axios';

// Simple logger fallback
const Logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  debug: (msg: string) => process.env.LOG_LEVEL === 'debug' && console.log(`[DEBUG] ${msg}`)
};

export interface PremiumModel {
  id: string;
  name: string;
  provider: string;
  tokens: string;
  usage: string;
  tier: 'premium' | 'enterprise';
  costPerToken: number;
  maxTokens: number;
  capabilities: string[];
  bestFor: string[];
  openRouterModel: string;
}

export interface AIRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  projectType?: string;
  complexity?: 'low' | 'medium' | 'high';
  userId?: string;
  sessionId?: string;
}

export interface AIResponse {
  success: boolean;
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
  };
  performance: {
    latency: number;
    throughput: number;
  };
  error?: string;
}

export interface UserSubscription {
  plan: 'free' | 'professional' | 'business' | 'enterprise';
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  quotas: {
    used: number;
    limit: number;
    resetDate: Date;
  };
}

export class PremiumAIClient {
  private client: AxiosInstance;
  private productionEngineUrl: string;

  // Available premium models (same as production engine)
  private readonly PREMIUM_MODELS: PremiumModel[] = [
    {
      id: 'claude-sonnet-4',
      name: 'Claude Sonnet 4',
      provider: 'anthropic',
      tokens: '520B tokens',
      usage: '4%',
      tier: 'premium',
      costPerToken: 0.00003,
      maxTokens: 200000,
      capabilities: ['reasoning', 'coding', 'analysis', 'writing'],
      bestFor: ['Complex coding', 'Advanced reasoning', 'System architecture'],
      openRouterModel: 'anthropic/claude-3.5-sonnet'
    },
    {
      id: 'gemini-2-5-flash',
      name: 'Gemini 2.5 Flash',
      provider: 'google',
      tokens: '265B tokens',
      usage: '3%',
      tier: 'premium',
      costPerToken: 0.000075,
      maxTokens: 1000000,
      capabilities: ['multimodal', 'fast-inference', 'code-generation'],
      bestFor: ['Fast development', 'Multimodal tasks', 'Real-time coding'],
      openRouterModel: 'google/gemini-flash-1.5'
    },
    {
      id: 'gemini-2-0-flash',
      name: 'Gemini 2.0 Flash',
      provider: 'google',
      tokens: '264B tokens',
      usage: '3%',
      tier: 'premium',
      costPerToken: 0.000075,
      maxTokens: 1000000,
      capabilities: ['multimodal', 'fast-inference', 'code-generation'],
      bestFor: ['Rapid prototyping', 'Web development', 'API design'],
      openRouterModel: 'google/gemini-flash-1.5'
    },
    {
      id: 'deepseek-v3-0324',
      name: 'DeepSeek V3 0324',
      provider: 'deepseek',
      tokens: '156B tokens',
      usage: '12%',
      tier: 'premium',
      costPerToken: 0.00014,
      maxTokens: 64000,
      capabilities: ['reasoning', 'mathematics', 'science', 'coding'],
      bestFor: ['Mathematical reasoning', 'Scientific analysis', 'Algorithm design'],
      openRouterModel: 'deepseek/deepseek-chat'
    },
    {
      id: 'qwen3-coder',
      name: 'Qwen3 Coder',
      provider: 'qwen',
      tokens: '146B tokens',
      usage: '3%',
      tier: 'premium',
      costPerToken: 0.0002,
      maxTokens: 32000,
      capabilities: ['coding', 'debugging', 'refactoring'],
      bestFor: ['Code optimization', 'Bug fixing', 'Code review'],
      openRouterModel: 'qwen/qwen-2.5-coder-32b-instruct'
    },
    {
      id: 'claude-3-7-sonnet',
      name: 'Claude 3.7 Sonnet',
      provider: 'anthropic',
      tokens: '143B tokens',
      usage: '12%',
      tier: 'premium',
      costPerToken: 0.00003,
      maxTokens: 200000,
      capabilities: ['reasoning', 'analysis', 'writing', 'coding'],
      bestFor: ['Complex analysis', 'Technical writing', 'Architecture design'],
      openRouterModel: 'anthropic/claude-3-sonnet'
    },
    {
      id: 'deepseek-v3-0324-free',
      name: 'DeepSeek V3 0324 (free)',
      provider: 'deepseek',
      tokens: '136B tokens',
      usage: '14%',
      tier: 'premium',
      costPerToken: 0,
      maxTokens: 64000,
      capabilities: ['reasoning', 'mathematics', 'basic-coding'],
      bestFor: ['Learning', 'Basic tasks', 'Experimentation'],
      openRouterModel: 'deepseek/deepseek-chat'
    },
    {
      id: 'gemini-2-5-pro',
      name: 'Gemini 2.5 Pro',
      provider: 'google',
      tokens: '136B tokens',
      usage: '7%',
      tier: 'enterprise',
      costPerToken: 0.00125,
      maxTokens: 2000000,
      capabilities: ['advanced-reasoning', 'multimodal', 'enterprise-features'],
      bestFor: ['Enterprise development', 'Complex systems', 'Large codebases'],
      openRouterModel: 'google/gemini-pro-1.5'
    },
    {
      id: 'r1-0528-free',
      name: 'R1 0528 (free)',
      provider: 'deepseek',
      tokens: '110B tokens',
      usage: '4%',
      tier: 'premium',
      costPerToken: 0,
      maxTokens: 64000,
      capabilities: ['reasoning', 'step-by-step-analysis'],
      bestFor: ['Problem solving', 'Educational use', 'Step-by-step reasoning'],
      openRouterModel: 'deepseek/deepseek-reasoner'
    },
    {
      id: 'kimi-k2',
      name: 'Kimi K2',
      provider: 'moonshotai',
      tokens: '98.5B tokens',
      usage: '1%',
      tier: 'premium',
      costPerToken: 0.0003,
      maxTokens: 200000,
      capabilities: ['long-context', 'document-analysis', 'coding'],
      bestFor: ['Long documents', 'Context analysis', 'Large codebases'],
      openRouterModel: 'moonshot/moonshot-v1-8k'
    }
  ];

  private readonly SUBSCRIPTION_TIERS = {
    FREE: {
      name: 'Free',
      price: 0,
      modelsAccess: ['deepseek-v3-0324-free', 'r1-0528-free'],
      requestsPerMonth: 100,
      features: ['Basic AI models', 'Limited requests', 'Community support']
    },
    PROFESSIONAL: {
      name: 'Professional',
      price: 20,
      modelsAccess: ['claude-sonnet-4', 'gemini-2-5-flash', 'gemini-2-0-flash', 'deepseek-v3-0324', 'qwen3-coder'],
      requestsPerMonth: 10000,
      features: ['Premium AI models', 'Priority support', 'Advanced features', 'API access']
    },
    BUSINESS: {
      name: 'Business',
      price: 50,
      modelsAccess: this.PREMIUM_MODELS.map(m => m.id),
      requestsPerMonth: 50000,
      features: ['All AI models', 'Team collaboration', 'Priority support', 'Custom integrations']
    },
    ENTERPRISE: {
      name: 'Enterprise',
      price: 200,
      modelsAccess: this.PREMIUM_MODELS.map(m => m.id),
      requestsPerMonth: 500000,
      features: ['All AI models', 'Enterprise support', 'Custom deployment', 'SLA guarantee']
    }
  };

  constructor() {
    // Use production URLs when available, fallback to local development
    this.productionEngineUrl = process.env.PRODUCTION_ENGINE_URL || 
                               process.env.NEXT_PUBLIC_ENGINE_URL || 
                               'https://engine.recoder.xyz';
    
    this.client = axios.create({
      baseURL: this.productionEngineUrl,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'recoder-cli/1.0.0',
        // Include our OpenRouter API key for authentication
        'x-openrouter-key': process.env.OPENROUTER_API_KEY,
        'x-client-type': 'cli'
      },
      timeout: 120000 // 2 minutes for AI requests
    });
  }

  /**
   * Generate AI response using our premium models
   */
  async generateResponse(request: AIRequest): Promise<AIResponse> {
    try {
      Logger.info(`Sending AI request to production engine: ${request.prompt.substring(0, 100)}...`);

      // Select best model for the task
      const selectedModel = this.selectBestModel(request.projectType || 'web', request.complexity || 'medium');
      
      const payload = {
        prompt: request.prompt,
        model: request.model || selectedModel,
        maxTokens: request.maxTokens || 4000,
        temperature: request.temperature || 0.3,
        userId: request.userId,
        sessionId: request.sessionId,
        metadata: {
          source: 'cli',
          timestamp: new Date().toISOString()
        }
      };

      Logger.debug(`Using model: ${payload.model}`);

      const response = await this.client.post('/api/ai/generate', payload);
      
      Logger.info(`AI request completed successfully using ${response.data.model}`);
      
      return {
        success: true,
        content: response.data.content || response.data.message || '',
        model: response.data.model || selectedModel,
        usage: response.data.usage || {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0
        },
        performance: response.data.performance || {
          latency: 0,
          throughput: 0
        }
      };

    } catch (error: any) {
      Logger.error(`AI request failed: ${error.message}`);
      
      // If production engine is unavailable, show subscription message
      if (error.code === 'ECONNREFUSED' || error.response?.status >= 500) {
        Logger.warn('Production engine unavailable - subscription required for AI features');
        
        return {
          success: false,
          content: '',
          model: 'unavailable',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 },
          performance: { latency: 0, throughput: 0 },
          error: 'AI services require an active subscription. Visit https://recoder.xyz/pricing to subscribe.'
        };
      }

      // Handle quota exceeded
      if (error.response?.status === 429) {
        return {
          success: false,
          content: '',
          model: 'rate-limited',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 },
          performance: { latency: 0, throughput: 0 },
          error: 'Monthly quota exceeded. Upgrade your plan at https://recoder.xyz/pricing for more requests.'
        };
      }

      // Handle unauthorized
      if (error.response?.status === 401 || error.response?.status === 403) {
        return {
          success: false,
          content: '',
          model: 'unauthorized',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 },
          performance: { latency: 0, throughput: 0 },
          error: 'Authentication required. Run "recoder auth login" to access AI features.'
        };
      }

      return {
        success: false,
        content: '',
        model: request.model || 'error',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 },
        performance: { latency: 0, throughput: 0 },
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Select the best model for a given task
   */
  private selectBestModel(projectType: string, complexity: 'low' | 'medium' | 'high'): string {
    const modelPreferences: Record<string, string[]> = {
      'web': ['gemini-2-5-flash', 'claude-3-7-sonnet', 'qwen3-coder'],
      'blockchain': ['claude-sonnet-4', 'deepseek-v3-0324', 'gemini-2-5-flash'],
      'backend': ['claude-3-7-sonnet', 'gemini-2-0-flash', 'deepseek-v3-0324'],
      'mobile': ['gemini-2-5-flash', 'qwen3-coder', 'claude-3-7-sonnet'],
      'ai': ['claude-sonnet-4', 'gemini-2-5-flash', 'deepseek-v3-0324'],
      'payments': ['claude-sonnet-4', 'claude-3-7-sonnet', 'deepseek-v3-0324']
    };

    // Adjust for complexity
    if (complexity === 'high') {
      return 'claude-sonnet-4'; // Best for complex tasks
    } else if (complexity === 'low') {
      return 'gemini-2-0-flash'; // Fast and cost-effective
    }

    const preferredModels = modelPreferences[projectType] || modelPreferences['web'];
    return preferredModels[0];
  }

  /**
   * Get available models for user's subscription tier
   */
  async getAvailableModels(subscriptionTier?: string): Promise<PremiumModel[]> {
    try {
      const response = await this.client.get('/api/ai/models');
      return response.data.models || this.PREMIUM_MODELS;
    } catch (error) {
      Logger.warn('Could not fetch models from production engine, using default list');
      
      // Return models based on subscription tier
      const tier = (subscriptionTier || 'FREE').toUpperCase() as keyof typeof this.SUBSCRIPTION_TIERS;
      const allowedModels = this.SUBSCRIPTION_TIERS[tier]?.modelsAccess || this.SUBSCRIPTION_TIERS.FREE.modelsAccess;
      
      return this.PREMIUM_MODELS.filter(model => allowedModels.includes(model.id));
    }
  }

  /**
   * Get user's subscription status
   */
  async getUserSubscription(userId?: string): Promise<UserSubscription | null> {
    try {
      const response = await this.client.get(`/api/users/${userId}/subscription`);
      return response.data.subscription;
    } catch (error) {
      Logger.warn('Could not fetch user subscription status');
      return null;
    }
  }

  /**
   * Check if production engine is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    models: number;
    latency: number;
    costs: { daily: number; monthly: number };
  }> {
    try {
      const response = await this.client.get('/api/health/detailed');
      return response.data;
    } catch (error) {
      return {
        status: 'unhealthy',
        models: 0,
        latency: 0,
        costs: { daily: 0, monthly: 0 }
      };
    }
  }

  /**
   * Get model recommendations for a specific task
   */
  getModelRecommendations(projectType: string, complexity: 'low' | 'medium' | 'high'): {
    recommended: PremiumModel;
    alternatives: PremiumModel[];
    reasoning: string;
  } {
    const recommendedId = this.selectBestModel(projectType, complexity);
    const recommended = this.PREMIUM_MODELS.find(m => m.id === recommendedId)!;
    
    const alternatives = this.PREMIUM_MODELS
      .filter(m => m.id !== recommendedId && m.bestFor.some(bf => recommended.bestFor.includes(bf)))
      .slice(0, 3);

    const reasoning = `Based on project type "${projectType}" and complexity "${complexity}", ${recommended.name} is optimal for ${recommended.bestFor.slice(0, 2).join(' and ')}.`;

    return {
      recommended,
      alternatives,
      reasoning
    };
  }
}

// Export singleton instance
export const premiumAIClient = new PremiumAIClient();