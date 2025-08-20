/**
 * API Key Pool Manager
 * Manages centralized API keys for @recoder/cli users
 * Implements cost optimization and usage tracking
 */

import { Logger } from '@recoder/shared';
import { backendClient } from './backend-client';

export interface APIKeyConfig {
  provider: 'openai' | 'anthropic' | 'groq' | 'gemini' | 'deepseek' | 'openrouter';
  key: string;
  dailyLimit: number;
  currentUsage: number;
  costPerToken: number;
  priority: number; // 1-10, higher = preferred
  status: 'active' | 'suspended' | 'rate_limited' | 'quota_exceeded';
  region?: string;
}

export interface RoutingDecision {
  provider: string;
  model: string;
  apiKey: string;
  estimatedCost: number;
  reasoning: string;
}

export class APIKeyPoolManager {
  private apiKeys: Map<string, APIKeyConfig> = new Map();
  private usageCache: Map<string, number> = new Map();
  private initialized = false;

  constructor() {
    this.initializeAPIKeys();
  }

  /**
   * Initialize API key pool from backend configuration
   */
  private async initializeAPIKeys(): Promise<void> {
    try {
      // In production, this would fetch from secure backend storage
      const defaultKeys: APIKeyConfig[] = [
        {
          provider: 'openrouter',
          key: process.env.RECODER_OPENROUTER_KEY || 'sk-or-demo',
          dailyLimit: 100000,
          currentUsage: 0,
          costPerToken: 0.000002, // $2 per 1M tokens average
          priority: 10,
          status: 'active'
        },
        {
          provider: 'groq',
          key: process.env.RECODER_GROQ_KEY || 'gsk-demo',
          dailyLimit: 50000,
          currentUsage: 0,
          costPerToken: 0.0000002, // Very cheap
          priority: 9,
          status: 'active'
        },
        {
          provider: 'deepseek',
          key: process.env.RECODER_DEEPSEEK_KEY || 'sk-deepseek-demo',
          dailyLimit: 75000,
          currentUsage: 0,
          costPerToken: 0.0000001, // Very cheap
          priority: 8,
          status: 'active'
        },
        {
          provider: 'anthropic',
          key: process.env.RECODER_ANTHROPIC_KEY || 'sk-ant-demo',
          dailyLimit: 25000,
          currentUsage: 0,
          costPerToken: 0.000008, // More expensive but high quality
          priority: 7,
          status: 'active'
        }
      ];

      defaultKeys.forEach(key => {
        this.apiKeys.set(`${key.provider}-${key.region || 'default'}`, key);
      });

      this.initialized = true;
      Logger.info(`🔑 API Key Pool initialized with ${this.apiKeys.size} providers`);
      
    } catch (error) {
      Logger.error('Failed to initialize API key pool:', error);
      this.initialized = false;
    }
  }

  /**
   * Get optimal API key and model for a request
   */
  async getOptimalRouting(
    prompt: string,
    taskType: 'coding' | 'chat' | 'analysis' | 'planning' = 'coding',
    userPlan: 'free' | 'pro' | 'enterprise' = 'free'
  ): Promise<RoutingDecision> {
    if (!this.initialized) {
      await this.initializeAPIKeys();
    }

    const estimatedTokens = this.estimateTokens(prompt);
    const availableKeys = Array.from(this.apiKeys.values()).filter(key => 
      key.status === 'active' && 
      key.currentUsage + estimatedTokens < key.dailyLimit
    );

    if (availableKeys.length === 0) {
      throw new Error('No available API keys with sufficient quota');
    }

    // Sort by cost-efficiency and priority
    const sortedKeys = availableKeys.sort((a, b) => {
      const costA = a.costPerToken * estimatedTokens;
      const costB = b.costPerToken * estimatedTokens;
      const scoreA = (costA * 0.7) + ((10 - a.priority) * 0.3);
      const scoreB = (costB * 0.7) + ((10 - b.priority) * 0.3);
      return scoreA - scoreB;
    });

    const selected = sortedKeys[0];
    const model = this.getOptimalModel(selected.provider, taskType, userPlan);
    const estimatedCost = selected.costPerToken * estimatedTokens;

    // Track usage
    selected.currentUsage += estimatedTokens;
    this.usageCache.set(`${selected.provider}-${Date.now()}`, estimatedTokens);

    return {
      provider: selected.provider,
      model,
      apiKey: selected.key,
      estimatedCost,
      reasoning: `Selected ${selected.provider}/${model} - Cost: $${estimatedCost.toFixed(6)}, Priority: ${selected.priority}`
    };
  }

  /**
   * Get optimal model for provider and task type
   */
  private getOptimalModel(
    provider: string, 
    taskType: 'coding' | 'chat' | 'analysis' | 'planning',
    userPlan: 'free' | 'pro' | 'enterprise'
  ): string {
    const modelMap: Record<string, Record<string, string[]>> = {
      openrouter: {
        free: ['google/gemini-2.5-flash', 'qwen/qwen-2.5-coder-7b-instruct'],
        pro: ['anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-thinking'],
        enterprise: ['anthropic/claude-sonnet-4', 'google/gemini-2.5-pro']
      },
      groq: {
        free: ['llama-3.3-70b-versatile'],
        pro: ['llama-3.3-70b-versatile', 'deepseek-r1-distill-llama-70b'],
        enterprise: ['llama-3.3-70b-versatile']
      },
      deepseek: {
        free: ['deepseek-chat'],
        pro: ['deepseek-chat', 'deepseek-reasoner'],
        enterprise: ['deepseek-reasoner']
      },
      anthropic: {
        free: ['claude-3-haiku'],
        pro: ['claude-3.5-sonnet'],
        enterprise: ['claude-3.5-sonnet', 'claude-3-opus']
      }
    };

    const models = modelMap[provider]?.[userPlan] || ['default'];
    
    // Task-specific model selection
    if (taskType === 'coding') {
      const codingModels = models.filter(m => 
        m.includes('coder') || m.includes('sonnet') || m.includes('reasoner')
      );
      return codingModels[0] || models[0];
    }

    return models[0];
  }

  /**
   * Estimate token count for prompt
   */
  private estimateTokens(prompt: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    // Add 500 tokens for completion
    return Math.ceil(prompt.length / 4) + 500;
  }

  /**
   * Check if user can make request based on quota
   */
  async checkUserQuota(userId: string, estimatedTokens: number): Promise<boolean> {
    try {
      const session = backendClient.getCurrentSession();
      if (!session) {
        // Allow limited usage for non-authenticated users
        return estimatedTokens < 1000;
      }

      const quotaRemaining = session.quotas.totalRequests - session.quotas.usedRequests;
      return quotaRemaining > 0;
    } catch (error) {
      Logger.warn('Failed to check user quota:', error);
      return false;
    }
  }

  /**
   * Track API usage for billing
   */
  async trackUsage(
    userId: string, 
    provider: string, 
    model: string, 
    tokens: number, 
    cost: number
  ): Promise<void> {
    try {
      await backendClient.trackUsage({
        platform: 'cli',
        command: `${provider}/${model}`,
        tokens,
        model,
        timestamp: new Date()
      });

      Logger.debug(`📊 Tracked usage: ${tokens} tokens, $${cost.toFixed(6)} cost`);
    } catch (error) {
      Logger.warn('Failed to track usage:', error);
    }
  }

  /**
   * Get current API key pool status
   */
  getPoolStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    this.apiKeys.forEach((config, key) => {
      status[key] = {
        provider: config.provider,
        status: config.status,
        usage: `${config.currentUsage}/${config.dailyLimit}`,
        utilization: Math.round((config.currentUsage / config.dailyLimit) * 100),
        priority: config.priority
      };
    });

    return status;
  }

  /**
   * Update API key status (for rate limiting, etc.)
   */
  updateKeyStatus(provider: string, status: APIKeyConfig['status']): void {
    const key = Array.from(this.apiKeys.keys()).find(k => k.startsWith(provider));
    if (key) {
      const config = this.apiKeys.get(key);
      if (config) {
        config.status = status;
        Logger.info(`🔑 Updated ${provider} status to ${status}`);
      }
    }
  }

  /**
   * Calculate daily cost savings vs user providing own keys
   */
  calculateCostSavings(dailyUsage: number): { ourCost: number; userCost: number; savings: number } {
    const avgTokensPerRequest = 2000;
    const totalTokens = dailyUsage * avgTokensPerRequest;
    
    // Our optimized cost (bulk rates + smart routing)
    const ourCost = totalTokens * 0.000002; // $2 per 1M tokens average
    
    // User's cost with individual API keys (no bulk discounts)
    const userCost = totalTokens * 0.000015; // $15 per 1M tokens average
    
    const savings = userCost - ourCost;
    
    return {
      ourCost: Math.round(ourCost * 100) / 100,
      userCost: Math.round(userCost * 100) / 100,
      savings: Math.round(savings * 100) / 100
    };
  }

  /**
   * Get optimal API key for enhanced request handler compatibility
   */
  async getOptimalAPIKey(model: string, userId: string): Promise<{ id: string; provider: string; key: string } | null> {
    try {
      const routing = await this.getOptimalRouting('', 'coding', 'pro');
      return {
        id: `${routing.provider}-optimal`,
        provider: routing.provider,
        key: routing.apiKey
      };
    } catch (error) {
      Logger.error('Failed to get optimal API key:', error);
      return null;
    }
  }

  /**
   * Record usage for enhanced request handler compatibility
   */
  async recordUsage(keyId: string, cost: number, duration: number): Promise<void> {
    try {
      Logger.info('Recording API key usage', { keyId, cost, duration });
      // Update usage tracking here
    } catch (error) {
      Logger.error('Failed to record API key usage:', error);
    }
  }
}

// Export singleton instance
export const apiKeyPoolManager = new APIKeyPoolManager();
export default apiKeyPoolManager;