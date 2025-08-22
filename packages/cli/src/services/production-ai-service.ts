/**
 * Production AI Service for CLI
 * Routes all AI requests through our production engine with centralized OpenRouter API key
 * Users pay subscription fee, we handle all AI costs internally
 */

import axios, { AxiosResponse } from 'axios';
import { getConfig, getDefaultModel, AVAILABLE_MODELS } from '../config/production';
import { Logger } from '../utils/logger';

export interface AIRequest {
  prompt: string;
  model?: string;
  taskType?: 'coding' | 'debugging' | 'architecture' | 'frontend' | 'algorithms';
  projectContext?: {
    language?: string;
    framework?: string;
    files?: string[];
  };
  userPreferences?: {
    codeStyle?: string;
    verbosity?: 'concise' | 'detailed' | 'comprehensive';
  };
}

export interface AIResponse {
  success: boolean;
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost?: number;
  };
  metadata: {
    responseTime: number;
    requestId: string;
    fallbackUsed?: boolean;
  };
  error?: string;
}

export interface UserSession {
  accessToken: string;
  userId: string;
  subscriptionTier: 'free' | 'pro' | 'enterprise';
  quotaRemaining: number;
  quotaLimit: number;
}

export class ProductionAIService {
  private config = getConfig();
  private userSession: UserSession | null = null;

  constructor(userSession?: UserSession) {
    this.userSession = userSession || null;
  }

  /**
   * Authenticate user and get session info
   */
  async authenticate(accessToken: string): Promise<UserSession> {
    try {
      const response = await axios.post(`${this.config.backendUrl}/api/auth/cli`, {
        action: 'validate_token',
        token: accessToken
      }, {
        timeout: this.config.defaultTimeout,
        headers: {
          'User-Agent': 'recoder-cli/1.0.0',
          'Content-Type': 'application/json'
        }
      });

      if (response.data.success) {
        const user = response.data.user;
        this.userSession = {
          accessToken: accessToken,
          userId: user.id,
          subscriptionTier: user.subscription_plan || 'free',
          quotaRemaining: user.quota?.requests_remaining || 0,
          quotaLimit: user.quota?.requests_limit || 100
        };

        Logger.info(`✅ Authenticated as ${user.email} (${this.userSession.subscriptionTier} plan)`);
        Logger.info(`📊 Quota: ${this.userSession.quotaRemaining}/${this.userSession.quotaLimit} requests remaining`);

        return this.userSession;
      } else {
        throw new Error(response.data.error || 'Authentication failed');
      }
    } catch (error: any) {
      Logger.error('Authentication error:', error.message);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Generate AI response using production engine with centralized OpenRouter key
   */
  async generateResponse(request: AIRequest): Promise<AIResponse> {
    if (!this.userSession) {
      throw new Error('User not authenticated. Please run "recoder auth login" first.');
    }

    // Check quota
    if (this.userSession.quotaRemaining <= 0) {
      throw new Error(`Quota exceeded. Upgrade your plan at ${this.config.websiteUrl}/billing`);
    }

    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Select appropriate model
      const model = request.model || getDefaultModel(request.taskType);
      
      // Verify model access based on subscription tier
      const availableModels = this.getAvailableModels();
      if (!availableModels.includes(model)) {
        const fallbackModel = availableModels[0];
        Logger.warn(`⚠️ Model ${model} not available for ${this.userSession.subscriptionTier} tier. Using ${fallbackModel}`);
        request.model = fallbackModel;
      }

      // Send request to production engine (it will use our centralized OpenRouter key)
      const response: AxiosResponse = await axios.post(`${this.config.productionEngineUrl}/api/ai/generate`, {
        prompt: request.prompt,
        model: request.model || model,
        userId: this.userSession.userId,
        subscriptionTier: this.userSession.subscriptionTier,
        taskType: request.taskType,
        projectContext: request.projectContext,
        userPreferences: request.userPreferences,
        requestId: requestId
      }, {
        timeout: this.config.defaultTimeout,
        headers: {
          // User authentication - backend validates, production engine uses our OpenRouter key
          'Authorization': `Bearer ${this.userSession.accessToken}`,
          'User-Agent': 'recoder-cli/1.0.0',
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
          'X-User-ID': this.userSession.userId
        }
      });

      const responseTime = Date.now() - startTime;

      if (response.data.success) {
        // Update quota
        this.userSession.quotaRemaining -= 1;

        // Log usage
        await this.logUsage({
          requestId,
          model: response.data.model,
          usage: response.data.usage,
          responseTime
        });

        Logger.info(`✅ Generated response using ${response.data.model} (${responseTime}ms)`);
        Logger.info(`📊 Quota remaining: ${this.userSession.quotaRemaining}/${this.userSession.quotaLimit}`);

        return {
          success: true,
          content: response.data.content,
          model: response.data.model,
          usage: response.data.usage,
          metadata: {
            responseTime,
            requestId,
            fallbackUsed: response.data.fallbackUsed
          }
        };
      } else {
        throw new Error(response.data.error || 'Generation failed');
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      } else if (error.response?.status === 402) {
        throw new Error(`Quota exceeded. Upgrade your plan at ${this.config.websiteUrl}/billing`);
      } else if (error.response?.status === 401) {
        throw new Error('Authentication expired. Please run "recoder auth login" again.');
      }

      Logger.error('AI generation error:', error.message);
      return {
        success: false,
        content: '',
        model: request.model || 'unknown',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        metadata: { responseTime, requestId },
        error: error.message
      };
    }
  }

  /**
   * Get available models for current subscription tier
   */
  getAvailableModels(): string[] {
    if (!this.userSession) {
      return ['deepseek-free']; // Free tier default
    }

    const tier = this.userSession.subscriptionTier;
    const availableModels = AVAILABLE_MODELS
      .filter(model => {
        if (tier === 'free') return model.tier === 'free';
        if (tier === 'pro') return model.tier !== 'enterprise-only';
        return true; // enterprise gets all
      })
      .map(model => model.id);

    return availableModels;
  }

  /**
   * Get subscription info and upgrade options
   */
  getSubscriptionInfo(): any {
    if (!this.userSession) {
      return { tier: 'unauthenticated', message: 'Please authenticate first' };
    }

    return {
      tier: this.userSession.subscriptionTier,
      quota: {
        remaining: this.userSession.quotaRemaining,
        limit: this.userSession.quotaLimit,
        percentage: Math.round((this.userSession.quotaRemaining / this.userSession.quotaLimit) * 100)
      },
      availableModels: this.getAvailableModels().length,
      upgradeUrl: `${this.config.websiteUrl}/billing`
    };
  }

  /**
   * Check service health
   */
  async checkHealth(): Promise<{ status: string; services: any }> {
    const services = {
      productionEngine: 'unknown',
      backend: 'unknown',
      authentication: 'unknown'
    };

    try {
      // Check production engine
      const engineResponse = await axios.get(`${this.config.productionEngineUrl}/health`, { timeout: 5000 });
      services.productionEngine = engineResponse.status === 200 ? 'healthy' : 'unhealthy';
    } catch (error) {
      services.productionEngine = 'unreachable';
    }

    try {
      // Check backend
      const backendResponse = await axios.get(`${this.config.backendUrl}/api/auth/cli`, { timeout: 5000 });
      services.backend = backendResponse.status === 200 ? 'healthy' : 'unhealthy';
    } catch (error) {
      services.backend = 'unreachable';
    }

    // Check authentication
    services.authentication = this.userSession ? 'authenticated' : 'unauthenticated';

    const allHealthy = Object.values(services).every(status => 
      status === 'healthy' || status === 'authenticated'
    );

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      services
    };
  }

  /**
   * Log usage for analytics and billing
   */
  private async logUsage(logData: any): Promise<void> {
    try {
      if (this.config.enableTelemetry) {
        await axios.post(`${this.config.backendUrl}/api/analytics/usage`, {
          ...logData,
          userId: this.userSession?.userId,
          timestamp: new Date().toISOString()
        }, {
          headers: {
            'Authorization': `Bearer ${this.userSession?.accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        });
      }
    } catch (error) {
      // Don't fail the main request if analytics logging fails
      Logger.warn('Failed to log usage analytics:', error);
    }
  }
}