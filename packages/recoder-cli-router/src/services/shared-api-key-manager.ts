/**
 * Shared API Key Manager
 * Manages API keys shared between CLI router and main backend
 * Provides intelligent routing and cost optimization across shared pools
 */

import { EventEmitter } from 'events';
import { Logger } from './logger';
import MainBackendConnection, { SharedAPIKeyPool } from './main-backend-connection';

export interface APIKeyMetrics {
  provider: string;
  model: string;
  requests_made: number;
  tokens_used: number;
  total_cost: number;
  avg_response_time: number;
  success_rate: number;
  last_used: Date;
}

export interface RoutingDecision {
  selected_key: {
    provider: string;
    key_id: string;
    masked_key: string;
    cost_per_token: number;
  };
  reasoning: string;
  alternatives: Array<{
    provider: string;
    key_id: string;
    cost_per_token: number;
    reason_skipped: string;
  }>;
  expected_cost: number;
}

export class SharedAPIKeyManager extends EventEmitter {
  private logger: Logger;
  private backendConnection: MainBackendConnection | null = null;
  private localPools: Map<string, SharedAPIKeyPool> = new Map();
  private keyMetrics: Map<string, APIKeyMetrics> = new Map();
  private fallbackKeys: Map<string, string> = new Map(); // Local backup keys
  private lastSync: Date | null = null;

  constructor() {
    super();
    this.logger = new Logger('SharedAPIKeyManager');
  }

  /**
   * Initialize with backend connection
   */
  async initialize(backendConnection: MainBackendConnection): Promise<void> {
    this.backendConnection = backendConnection;

    // Listen for API key sync events
    this.backendConnection.on('api_keys_synced', (pools: SharedAPIKeyPool[]) => {
      this.updateLocalPools(pools);
    });

    // Listen for connection events
    this.backendConnection.on('connected', () => {
      this.logger.info('🔗 Connected to shared API key pools');
    });

    this.backendConnection.on('connection_failed', () => {
      this.logger.warn('⚠️ Backend connection failed - using local keys only');
    });

    // Initial sync
    await this.syncPools();

    this.logger.info('🔑 Shared API Key Manager initialized');
  }

  /**
   * Get optimal API key for request with intelligent routing
   */
  async getOptimalAPIKey(
    provider: string,
    modelName: string,
    estimatedTokens: number = 1000,
    prioritize: 'cost' | 'speed' | 'reliability' = 'cost'
  ): Promise<RoutingDecision | null> {
    try {
      // First try shared pools
      const sharedDecision = await this.getOptimalSharedKey(provider, modelName, estimatedTokens, prioritize);
      if (sharedDecision) {
        return sharedDecision;
      }

      // Fallback to local keys
      const localKey = this.fallbackKeys.get(provider);
      if (localKey) {
        this.logger.info(`🔄 Using local fallback key for ${provider}`);
        
        return {
          selected_key: {
            provider: provider,
            key_id: 'local_fallback',
            masked_key: this.maskKey(localKey),
            cost_per_token: this.getEstimatedCostPerToken(provider, modelName)
          },
          reasoning: 'Using local fallback key - shared pools unavailable',
          alternatives: [],
          expected_cost: estimatedTokens * this.getEstimatedCostPerToken(provider, modelName)
        };
      }

      this.logger.error(`No API key available for ${provider}/${modelName}`);
      return null;

    } catch (error: any) {
      this.logger.error('Failed to get optimal API key', error);
      return null;
    }
  }

  /**
   * Get optimal key from shared pools
   */
  private async getOptimalSharedKey(
    provider: string,
    modelName: string,
    estimatedTokens: number,
    prioritize: 'cost' | 'speed' | 'reliability'
  ): Promise<RoutingDecision | null> {
    const pool = this.localPools.get(provider);
    if (!pool || pool.keys.length === 0) {
      // Try to request key from backend
      const requestedKey = await this.requestKeyFromBackend(provider, modelName);
      if (requestedKey) {
        return {
          selected_key: {
            provider: provider,
            key_id: 'backend_provided',
            masked_key: this.maskKey(requestedKey.api_key),
            cost_per_token: requestedKey.cost_per_token
          },
          reasoning: 'Backend-provided key for on-demand usage',
          alternatives: [],
          expected_cost: estimatedTokens * requestedKey.cost_per_token
        };
      }
      return null;
    }

    // Score available keys based on priority
    const scoredKeys = pool.keys.map(key => {
      let score = 0;
      
      switch (prioritize) {
        case 'cost':
          // Lower cost = higher score
          score = 1 / (key.cost_per_token + 0.00001);
          break;
        case 'speed':
          // Lower rate limit = higher score (assuming rate limit correlates with speed)
          score = key.rate_limit;
          break;
        case 'reliability':
          // Higher health score = higher score
          score = key.health_score;
          break;
      }
      
      // Apply penalties for high usage
      const usagePenalty = key.current_usage > 0.8 ? 0.5 : 1.0;
      score *= usagePenalty;
      
      // Apply priority boost
      score *= key.priority;
      
      return { ...key, score };
    });

    // Sort by score (descending)
    scoredKeys.sort((a, b) => b.score - a.score);
    
    if (scoredKeys.length === 0) {
      return null;
    }

    const selectedKey = scoredKeys[0];
    const alternatives = scoredKeys.slice(1, 4).map(key => ({
      provider: provider,
      key_id: key.id,
      cost_per_token: key.cost_per_token,
      reason_skipped: this.getSkipReason(key, selectedKey)
    }));

    return {
      selected_key: {
        provider: provider,
        key_id: selectedKey.id,
        masked_key: selectedKey.key_masked,
        cost_per_token: selectedKey.cost_per_token
      },
      reasoning: this.generateRoutingReasoning(selectedKey, prioritize, pool.optimization_settings),
      alternatives: alternatives,
      expected_cost: estimatedTokens * selectedKey.cost_per_token
    };
  }

  /**
   * Request key from backend for on-demand usage
   */
  private async requestKeyFromBackend(provider: string, modelName?: string): Promise<{
    api_key: string;
    rate_limit: number;
    cost_per_token: number;
    expires_at?: Date;
  } | null> {
    if (!this.backendConnection) {
      return null;
    }

    try {
      const keyData = await this.backendConnection.requestSharedAPIKey(provider, modelName);
      if (keyData) {
        this.logger.info(`🔑 Received on-demand API key for ${provider}/${modelName}`);
      }
      return keyData;
    } catch (error: any) {
      this.logger.error(`Failed to request key from backend for ${provider}`, error);
      return null;
    }
  }

  /**
   * Report API key usage to backend and update local metrics
   */
  async reportUsage(
    keyId: string,
    provider: string,
    model: string,
    usage: {
      tokens_used: number;
      cost: number;
      response_time: number;
      success: boolean;
      error?: string;
    }
  ): Promise<void> {
    try {
      // Update local metrics
      this.updateKeyMetrics(keyId, provider, model, usage);

      // Report to backend if connected
      if (this.backendConnection && keyId !== 'local_fallback') {
        await this.backendConnection.reportAPIKeyUsage(keyId, usage);
      }

      this.logger.debug(`📊 Reported usage for ${provider}/${model}: ${usage.tokens_used} tokens, $${usage.cost.toFixed(6)}`);

    } catch (error: any) {
      this.logger.error('Failed to report API key usage', error);
    }
  }

  /**
   * Update local API key pools from backend sync
   */
  private updateLocalPools(pools: SharedAPIKeyPool[]): void {
    this.localPools.clear();
    
    pools.forEach(pool => {
      this.localPools.set(pool.provider, pool);
      this.logger.debug(`🔄 Updated pool for ${pool.provider}: ${pool.keys.length} keys available`);
    });

    this.lastSync = new Date();
    this.emit('pools_updated', pools);

    this.logger.info(`🔑 Updated ${pools.length} shared API key pools`);
  }

  /**
   * Add local fallback API key
   */
  addFallbackKey(provider: string, apiKey: string): void {
    this.fallbackKeys.set(provider, apiKey);
    this.logger.info(`🛡️ Added fallback key for ${provider}`);
  }

  /**
   * Sync pools from backend
   */
  async syncPools(): Promise<void> {
    if (!this.backendConnection) {
      this.logger.warn('No backend connection available for pool sync');
      return;
    }

    try {
      const pools = await this.backendConnection.syncAPIKeyPools();
      this.updateLocalPools(pools);
    } catch (error: any) {
      this.logger.error('Failed to sync API key pools', error);
    }
  }

  /**
   * Get cost optimization recommendations
   */
  async getCostOptimizationRecommendations(): Promise<any> {
    if (!this.backendConnection) {
      return this.getLocalOptimizationRecommendations();
    }

    try {
      return await this.backendConnection.getCostOptimizationRecommendations();
    } catch (error: any) {
      this.logger.error('Failed to get optimization recommendations from backend', error);
      return this.getLocalOptimizationRecommendations();
    }
  }

  /**
   * Get local optimization recommendations based on usage metrics
   */
  private getLocalOptimizationRecommendations(): any {
    const recommendations = [];
    
    // Analyze local metrics for recommendations
    for (const [keyId, metrics] of this.keyMetrics.entries()) {
      if (metrics.success_rate < 0.95) {
        recommendations.push({
          type: 'reliability',
          description: `Consider switching from ${metrics.provider} - low success rate (${(metrics.success_rate * 100).toFixed(1)}%)`,
          potential_savings: 0,
          confidence: 0.8
        });
      }

      if (metrics.avg_response_time > 5000) {
        recommendations.push({
          type: 'performance',
          description: `${metrics.provider} showing high latency - consider alternative provider`,
          potential_savings: 0,
          confidence: 0.7
        });
      }
    }

    return {
      recommendations,
      current_efficiency: this.calculateCurrentEfficiency(),
      projected_savings: 0
    };
  }

  /**
   * Update key metrics with usage data
   */
  private updateKeyMetrics(
    keyId: string,
    provider: string,
    model: string,
    usage: {
      tokens_used: number;
      cost: number;
      response_time: number;
      success: boolean;
    }
  ): void {
    const metricsKey = `${keyId}-${provider}-${model}`;
    const existing = this.keyMetrics.get(metricsKey);

    if (existing) {
      // Update existing metrics with running averages
      existing.requests_made++;
      existing.tokens_used += usage.tokens_used;
      existing.total_cost += usage.cost;
      existing.avg_response_time = (existing.avg_response_time + usage.response_time) / 2;
      existing.success_rate = (existing.success_rate + (usage.success ? 1 : 0)) / 2;
      existing.last_used = new Date();
    } else {
      // Create new metrics entry
      this.keyMetrics.set(metricsKey, {
        provider,
        model,
        requests_made: 1,
        tokens_used: usage.tokens_used,
        total_cost: usage.cost,
        avg_response_time: usage.response_time,
        success_rate: usage.success ? 1 : 0,
        last_used: new Date()
      });
    }
  }

  /**
   * Helper methods
   */
  private maskKey(key: string): string {
    if (key.length <= 8) return '***';
    return key.substring(0, 4) + '*'.repeat(key.length - 8) + key.substring(key.length - 4);
  }

  private getEstimatedCostPerToken(provider: string, model: string): number {
    // Estimated costs per 1000 tokens (rough estimates)
    const costs: Record<string, Record<string, number>> = {
      openai: {
        'gpt-4o': 0.00500,
        'gpt-4o-mini': 0.00015,
        'gpt-3.5-turbo': 0.00050
      },
      anthropic: {
        'claude-3.5-sonnet': 0.00300,
        'claude-3-haiku': 0.00025
      },
      google: {
        'gemini-pro': 0.00125,
        'gemini-flash': 0.00037
      }
    };

    return costs[provider]?.[model] || 0.002; // Default fallback
  }

  private getSkipReason(key: any, selectedKey: any): string {
    if (key.cost_per_token > selectedKey.cost_per_token * 1.5) {
      return 'Higher cost';
    }
    if (key.health_score < selectedKey.health_score * 0.8) {
      return 'Lower reliability';
    }
    if (key.current_usage > 0.9) {
      return 'High usage';
    }
    return 'Lower priority';
  }

  private generateRoutingReasoning(
    selectedKey: any,
    prioritize: string,
    optimizationSettings: any
  ): string {
    const reasons = [];
    
    reasons.push(`Selected for ${prioritize} optimization`);
    reasons.push(`Cost: $${selectedKey.cost_per_token.toFixed(6)}/token`);
    reasons.push(`Health: ${selectedKey.health_score.toFixed(1)}/10`);
    
    if (selectedKey.current_usage > 0.5) {
      reasons.push(`Moderate usage (${(selectedKey.current_usage * 100).toFixed(0)}%)`);
    }

    return reasons.join(' • ');
  }

  private calculateCurrentEfficiency(): number {
    let totalCost = 0;
    let totalSavings = 0;

    for (const metrics of this.keyMetrics.values()) {
      totalCost += metrics.total_cost;
      // Estimate savings compared to individual API pricing
      totalSavings += metrics.total_cost * 0.3; // Assume 30% savings through pooling
    }

    return totalSavings > 0 ? (totalSavings / (totalCost + totalSavings)) * 100 : 0;
  }

  /**
   * Get current status and statistics
   */
  getStatus(): {
    pools_available: number;
    total_keys: number;
    fallback_keys: number;
    last_sync: Date | null;
    metrics_tracked: number;
  } {
    let totalKeys = 0;
    for (const pool of this.localPools.values()) {
      totalKeys += pool.keys.length;
    }

    return {
      pools_available: this.localPools.size,
      total_keys: totalKeys,
      fallback_keys: this.fallbackKeys.size,
      last_sync: this.lastSync,
      metrics_tracked: this.keyMetrics.size
    };
  }
}

export default SharedAPIKeyManager;