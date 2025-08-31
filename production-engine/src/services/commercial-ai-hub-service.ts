/**
 * Commercial AI Hub Service for Production Engine
 * Smart routing: OpenRouter (premium users) + Together.ai (free users)
 * Cost optimization strategy for competitive advantage
 */

import { logger } from '../utils/logger';
import { openRouterService } from './openrouter-service';
import { togetherService } from './together-service';

export interface GenerationOptions {
  type?: string;
  complexity?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  temperature?: number;
  userTier?: 'free' | 'pro' | 'enterprise';
  userId?: string;
}

export interface GenerationContext {
  type: 'web' | 'backend' | 'blockchain' | 'mobile' | 'ai' | 'payments';
  complexity: 'simple' | 'medium' | 'complex';
  requirements: {
    realCode: boolean;
    includeTests: boolean;
    includeDocs: boolean;
    securityAudit: boolean;
    performanceOptimized: boolean;
  };
}

export interface SmartRoutingResult {
  success: boolean;
  content?: string;
  model?: string;
  provider?: 'openrouter' | 'together';
  cost?: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: string;
}

export class CommercialAIHubService {
  
  constructor() {
    logger.info('🤖 Initializing Commercial AI Hub Service with Smart Routing...');
    logger.info('📊 Premium users → OpenRouter | Free users → Together.ai');
  }

  /**
   * Smart AI routing based on user tier and request complexity
   */
  async generateWithSmartRouting(
    prompt: string, 
    options: GenerationOptions = {}
  ): Promise<SmartRoutingResult> {
    const userTier = options.userTier || 'free';
    const complexity = options.complexity || 'medium';
    
    logger.info(`🧠 Smart routing: User tier=${userTier}, Complexity=${complexity}`);

    // Route based on user tier and complexity
    if (userTier === 'free') {
      return await this.generateWithTogether(prompt, options);
    } else {
      return await this.generateWithOpenRouter(prompt, options);
    }
  }

  /**
   * Generate using OpenRouter (premium models for paid users)
   */
  private async generateWithOpenRouter(
    prompt: string, 
    options: GenerationOptions
  ): Promise<SmartRoutingResult> {
    try {
      logger.info(`🚀 Using OpenRouter for premium user generation...`);
      
      const result = await openRouterService.instance.generateCode(prompt, {
        projectType: options.type || 'web',
        maxTokens: options.maxTokens || 8000,
        temperature: options.temperature || 0.3
      });

      if (result.success) {
        logger.info(`✅ OpenRouter generation successful with model: ${result.model}`);
        return {
          success: true,
          content: result.content,
          model: result.model,
          provider: 'openrouter',
          cost: 0, // Calculate from usage if needed
          usage: {
            prompt_tokens: result.usage?.promptTokens || 0,
            completion_tokens: result.usage?.completionTokens || 0,
            total_tokens: result.usage?.totalTokens || 0
          }
        };
      } else {
        throw new Error(result.error || 'OpenRouter generation failed');
      }

    } catch (error: any) {
      logger.error(`❌ OpenRouter generation failed: ${error.message}`);
      
      // Fallback to Together.ai for resilience
      logger.info('🔄 Falling back to Together.ai for error recovery...');
      return await this.generateWithTogether(prompt, options);
    }
  }

  /**
   * Generate using Together.ai (free models for free tier users)
   */
  private async generateWithTogether(
    prompt: string, 
    options: GenerationOptions
  ): Promise<SmartRoutingResult> {
    try {
      logger.info(`🤝 Using Together.ai for free tier user generation...`);
      
      const taskType = this.determineTaskType(options.type || 'web');
      const bestModel = togetherService.selectBestFreeModel(taskType);
      const messages = togetherService.formatCodingPrompt(prompt, options.type || 'react');
      
      const result = await togetherService.generateCode({
        model: bestModel,
        messages,
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7
      });

      if (result.success) {
        logger.info(`✅ Together.ai generation successful with model: ${result.model}`);
        return {
          success: true,
          content: result.content,
          model: result.model,
          provider: 'together',
          cost: 0, // Free tier
          usage: result.usage
        };
      } else {
        throw new Error(result.error || 'Together.ai generation failed');
      }

    } catch (error: any) {
      logger.error(`❌ Together.ai generation failed: ${error.message}`);
      
      return {
        success: false,
        error: `Both OpenRouter and Together.ai failed: ${error.message}`,
        provider: 'together'
      };
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async generateWithBestModel(
    prompt: string, 
    options: GenerationOptions = {}
  ): Promise<string> {
    const result = await this.generateWithSmartRouting(prompt, options);
    
    if (result.success) {
      return result.content || '';
    } else {
      throw new Error(result.error || 'Code generation failed');
    }
  }

  /**
   * Get available AI providers (both premium and free)
   */
  async getAvailableProviders(): Promise<string[]> {
    try {
      const providers: string[] = [];
      
      // Add OpenRouter models for premium users
      if (openRouterService.instance.isConfigured()) {
        const openRouterModels = openRouterService.instance.getAvailableModels();
        providers.push(...openRouterModels.map(model => `openrouter/${model.provider}/${model.id}`));
      }
      
      // Add Together.ai models for free users
      if (togetherService.isServiceConfigured()) {
        const togetherModels = togetherService.getAvailableModels();
        providers.push(...togetherModels.map(model => `together/${model.provider}/${model.id}`));
      }
      
      return providers.length > 0 ? providers : ['no-providers-configured'];
    } catch (error: any) {
      logger.error(`Failed to get providers: ${error.message}`);
      return ['error-getting-providers'];
    }
  }

  /**
   * Enhanced health check for both OpenRouter and Together.ai
   */
  async healthCheck(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: {
      openrouter: {
        status: string;
        healthy: boolean;
        modelsAvailable: number;
      };
      together: {
        status: string;
        healthy: boolean;
        modelsAvailable: number;
      };
    };
    totalModelsAvailable: number;
  }> {
    try {
      const openRouterHealth = await openRouterService.instance.healthCheck();
      const togetherHealth = await togetherService.healthCheck();
      
      const services = {
        openrouter: {
          status: openRouterHealth.status,
          healthy: openRouterHealth.status === 'healthy',
          modelsAvailable: openRouterHealth.modelsAvailable || 0
        },
        together: {
          status: togetherHealth.status,
          healthy: togetherHealth.status === 'healthy',
          modelsAvailable: togetherHealth.modelsAvailable || 0
        }
      };

      const totalModelsAvailable = services.openrouter.modelsAvailable + services.together.modelsAvailable;
      
      // Determine overall health
      let overall: 'healthy' | 'degraded' | 'unhealthy';
      if (services.openrouter.healthy && services.together.healthy) {
        overall = 'healthy';
      } else if (services.openrouter.healthy || services.together.healthy) {
        overall = 'degraded';
      } else {
        overall = 'unhealthy';
      }

      logger.info(`🏥 AI Hub Health Check: ${overall} - OpenRouter(${services.openrouter.modelsAvailable}) + Together(${services.together.modelsAvailable}) = ${totalModelsAvailable} models`);

      return {
        overall,
        services,
        totalModelsAvailable
      };

    } catch (error: any) {
      logger.error(`Health check failed: ${error.message}`);
      
      return {
        overall: 'unhealthy',
        services: {
          openrouter: { status: 'error', healthy: false, modelsAvailable: 0 },
          together: { status: 'error', healthy: false, modelsAvailable: 0 }
        },
        totalModelsAvailable: 0
      };
    }
  }

  /**
   * Determine task type for model selection
   */
  private determineTaskType(projectType: string): 'coding' | 'reasoning' | 'analysis' | 'multimodal' {
    const codingTypes = ['web', 'react', 'vue', 'angular', 'node', 'express', 'next'];
    const reasoningTypes = ['algorithm', 'backend', 'api', 'database'];
    const analysisTypes = ['review', 'optimize', 'refactor', 'documentation'];
    
    if (codingTypes.some(type => projectType.toLowerCase().includes(type))) {
      return 'coding';
    } else if (reasoningTypes.some(type => projectType.toLowerCase().includes(type))) {
      return 'reasoning';
    } else if (analysisTypes.some(type => projectType.toLowerCase().includes(type))) {
      return 'analysis';
    }
    
    return 'coding'; // Default fallback
  }
}

// Create and export the singleton instance
export const commercialAIHubService = new CommercialAIHubService();
