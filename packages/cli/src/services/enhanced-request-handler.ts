/**
 * Enhanced Request Handler
 * Integrates billing, quota enforcement, and smart routing for production requests
 */
import { Logger } from 'recoder-shared';
import { billingIntegration } from './billing-integration';
import { apiKeyPoolManager } from './api-key-pool-manager';
import { backendClient } from './backend-client';

export interface RequestOptions {
  model: string;
  messages: Array<{ role: string; content: string }>;
  user_id?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface RequestResult {
  success: boolean;
  response?: string;
  cost?: number;
  model_used?: string;
  error?: string;
  quota_exceeded?: boolean;
  upgrade_required?: boolean;
}

export class EnhancedRequestHandler {
  private logger = new Logger();

  /**
   * Handle an AI request with full billing and quota integration
   */
  async handleRequest(options: RequestOptions): Promise<RequestResult> {
    try {
      // Get user ID from session if not provided
      const userId = options.user_id || await this.getCurrentUserId();
      
      if (!userId) {
        return {
          success: false,
          error: 'User authentication required'
        };
      }

      // Check if user can make request
      const canMakeRequest = await billingIntegration.canMakeRequest(userId, options.model);
      
      if (!canMakeRequest.allowed) {
        return {
          success: false,
          error: canMakeRequest.reason,
          quota_exceeded: canMakeRequest.reason?.includes('quota') || canMakeRequest.reason?.includes('exceeded'),
          upgrade_required: canMakeRequest.upgrade_required
        };
      }

      // Get optimal API key for the model
      const apiKeyConfig = await apiKeyPoolManager.getOptimalAPIKey(options.model, userId);
      
      if (!apiKeyConfig) {
        return {
          success: false,
          error: `No API key available for model ${options.model}`
        };
      }

      // Make the request to production engine
      const startTime = Date.now();
      const requestPayload = {
        ...options,
        api_key_id: apiKeyConfig.id,
        provider: apiKeyConfig.provider,
        user_id: userId
      };

      this.logger.info('Making production engine request', {
        model: options.model,
        provider: apiKeyConfig.provider,
        userId: userId
      });

      const response = await this.callProductionEngine(requestPayload);
      const duration = Date.now() - startTime;

      // Calculate cost based on usage
      const cost = await this.calculateCost(options.model, response.usage);

      // Record usage for billing
      await billingIntegration.recordUsage(userId, options.model, cost);

      // Update API key usage stats
      await apiKeyPoolManager.recordUsage(apiKeyConfig.id, cost, duration);

      this.logger.info('Request completed successfully', {
        model: options.model,
        cost: cost,
        duration: duration,
        userId: userId
      });

      return {
        success: true,
        response: response.content,
        cost: cost,
        model_used: options.model
      };

    } catch (error) {
      this.logger.error('Request failed', { error, options });
      
      // Check if it's a quota/billing error
      if (error.message?.includes('quota') || error.message?.includes('limit')) {
        return {
          success: false,
          error: error.message,
          quota_exceeded: true,
          upgrade_required: true
        };
      }

      return {
        success: false,
        error: `Request failed: ${error.message}`
      };
    }
  }

  /**
   * Call production engine with billing-aware routing
   */
  private async callProductionEngine(payload: any): Promise<{
    content: string;
    usage: { prompt_tokens: number; completion_tokens: number };
  }> {
    try {
      const response = await fetch(`${process.env.PRODUCTION_ENGINE_URL || 'http://localhost:3100'}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': payload.user_id
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Production engine call failed', error);
      throw error;
    }
  }

  /**
   * Calculate cost based on model and token usage
   */
  private async calculateCost(model: string, usage: { prompt_tokens: number; completion_tokens: number }): Promise<number> {
    // Cost per token (in dollars) - these should come from a pricing config
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4o': { input: 0.0025, output: 0.01 },
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
      'claude-3-haiku': { input: 0.00025, output: 0.00125 },
      'gemini-pro': { input: 0.001, output: 0.002 }
    };

    const modelPricing = pricing[model] || { input: 0.001, output: 0.002 }; // Default pricing

    const inputCost = (usage.prompt_tokens / 1000) * modelPricing.input;
    const outputCost = (usage.completion_tokens / 1000) * modelPricing.output;

    return inputCost + outputCost;
  }

  /**
   * Get current user ID from authentication
   */
  private async getCurrentUserId(): Promise<string | null> {
    try {
      const session = backendClient.getCurrentSession();
      return session?.userId || null;
    } catch {
      return null;
    }
  }

  /**
   * Handle streaming requests with billing
   */
  async handleStreamingRequest(options: RequestOptions, onChunk: (chunk: string) => void): Promise<RequestResult> {
    try {
      const userId = options.user_id || await this.getCurrentUserId();
      
      if (!userId) {
        return { success: false, error: 'User authentication required' };
      }

      // Pre-check quota
      const canMakeRequest = await billingIntegration.canMakeRequest(userId, options.model);
      if (!canMakeRequest.allowed) {
        return {
          success: false,
          error: canMakeRequest.reason,
          quota_exceeded: canMakeRequest.reason?.includes('quota'),
          upgrade_required: canMakeRequest.upgrade_required
        };
      }

      // Get API key
      const apiKeyConfig = await apiKeyPoolManager.getOptimalAPIKey(options.model, userId);
      if (!apiKeyConfig) {
        return { success: false, error: `No API key available for model ${options.model}` };
      }

      // Make streaming request
      const response = await fetch(`${process.env.PRODUCTION_ENGINE_URL || 'http://localhost:3100'}/api/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': userId
        },
        body: JSON.stringify({
          ...options,
          api_key_id: apiKeyConfig.id,
          provider: apiKeyConfig.provider,
          user_id: userId,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`Streaming request failed: ${response.statusText}`);
      }

      let fullResponse = '';
      const reader = response.body?.getReader();
      
      if (!reader) {
        throw new Error('No response stream available');
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data.trim() === '[DONE]') {
                break;
              }
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullResponse += parsed.content;
                  onChunk(parsed.content);
                }
              } catch (e) {
                // Ignore JSON parse errors for streaming data
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Record usage after streaming completes
      const estimatedTokens = Math.ceil(fullResponse.length / 4); // Rough estimate
      const cost = await this.calculateCost(options.model, {
        prompt_tokens: Math.ceil((options.messages.reduce((acc, m) => acc + m.content.length, 0)) / 4),
        completion_tokens: estimatedTokens
      });

      await billingIntegration.recordUsage(userId, options.model, cost);
      await apiKeyPoolManager.recordUsage(apiKeyConfig.id, cost, Date.now());

      return {
        success: true,
        response: fullResponse,
        cost: cost,
        model_used: options.model
      };

    } catch (error) {
      this.logger.error('Streaming request failed', error);
      return {
        success: false,
        error: `Streaming request failed: ${error.message}`
      };
    }
  }

  /**
   * Get user's current quota status
   */
  async getQuotaStatus(userId?: string): Promise<{
    current_usage: number;
    quota_limit: number;
    percentage_used: number;
    time_until_reset: number;
  }> {
    try {
      const uid = userId || await this.getCurrentUserId();
      if (!uid) {
        throw new Error('User ID required');
      }

      const billing = await billingIntegration.getUserBilling(uid);
      if (!billing) {
        throw new Error('No billing information found');
      }

      const tier = billingIntegration.getSubscriptionTiers()[billing.subscription.name];
      const quotaLimit = tier.requests_per_month === -1 ? Infinity : tier.requests_per_month;
      const percentageUsed = quotaLimit === Infinity ? 0 : (billing.current_usage / quotaLimit * 100);
      const timeUntilReset = new Date(billing.billing_period_end).getTime() - Date.now();

      return {
        current_usage: billing.current_usage,
        quota_limit: quotaLimit,
        percentage_used: percentageUsed,
        time_until_reset: Math.max(0, timeUntilReset)
      };
    } catch (error) {
      this.logger.error('Failed to get quota status', error);
      throw error;
    }
  }
}

export const enhancedRequestHandler = new EnhancedRequestHandler();