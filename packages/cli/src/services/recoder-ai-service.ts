/**
 * Recoder AI Service - Backend-First Authentication Model
 * Routes all AI requests through recoder.xyz backend (like Claude Code)
 * No user API keys required - everything goes through our infrastructure
 */

import { backendClient } from './backend-client';
import { Logger } from 'recoder-shared';
import chalk from 'chalk';

export interface RecoderAIRequest {
  messages: Array<{ role: string; content: string }>;
  type: 'code_generation' | 'chat' | 'analysis' | 'planning';
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
  };
}

export interface RecoderAIResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  provider: string;
}

export class RecoderAIService {
  private static instance: RecoderAIService;

  static getInstance(): RecoderAIService {
    if (!RecoderAIService.instance) {
      RecoderAIService.instance = new RecoderAIService();
    }
    return RecoderAIService.instance;
  }

  /**
   * Main AI chat method - routes through recoder.xyz backend
   */
  async chat(request: RecoderAIRequest): Promise<RecoderAIResponse> {
    // Check authentication first
    if (!backendClient.isAuthenticated()) {
      throw new Error('Authentication required. Run: recoder auth login');
    }

    // Check quota
    const hasQuota = await backendClient.checkQuota();
    if (!hasQuota) {
      throw new Error('Request quota exceeded. Please upgrade your plan or wait for reset.');
    }

    try {
      // Route request through backend (like Claude Code does)
      const response = await backendClient.makeAIRequest({
        messages: request.messages,
        type: request.type,
        options: request.options || {}
      });

      // Track usage
      await backendClient.trackUsage({
        platform: 'cli',
        command: request.type,
        tokens: response.usage.inputTokens + response.usage.outputTokens,
        model: response.model,
        timestamp: new Date()
      });

      return response;

    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Authentication expired. Please run: recoder auth login');
      } else if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please wait or upgrade your plan.');
      } else if (error.response?.status === 402) {
        throw new Error('Payment required. Please upgrade your plan at recoder.xyz');
      }
      
      Logger.error('AI request failed:', error);
      throw new Error(`AI request failed: ${error.message}`);
    }
  }

  /**
   * Check if user can make AI requests
   */
  async checkAvailability(): Promise<{
    authenticated: boolean;
    hasQuota: boolean;
    plan: string;
    quotaUsed: number;
    quotaTotal: number;
  }> {
    const isAuthenticated = backendClient.isAuthenticated();
    
    if (!isAuthenticated) {
      return {
        authenticated: false,
        hasQuota: false,
        plan: 'none',
        quotaUsed: 0,
        quotaTotal: 0
      };
    }

    const session = backendClient.getCurrentSession();
    const hasQuota = await backendClient.checkQuota();

    return {
      authenticated: true,
      hasQuota,
      plan: session?.plan || 'free',
      quotaUsed: session?.quotas.usedRequests || 0,
      quotaTotal: session?.quotas.totalRequests || 0
    };
  }

  /**
   * Display authentication status to user
   */
  async displayStatus(): Promise<void> {
    const status = await this.checkAvailability();

    if (!status.authenticated) {
      console.log(chalk.yellow('❌ Not authenticated with recoder.xyz'));
      console.log(chalk.white('Run: recoder auth login'));
      return;
    }

    const session = backendClient.getCurrentSession();
    console.log(chalk.green(`✅ Authenticated as ${session?.email}`));
    console.log(chalk.white(`Plan: ${status.plan.toUpperCase()}`));
    console.log(chalk.white(`Quota: ${status.quotaUsed}/${status.quotaTotal} requests used`));
    
    if (!status.hasQuota) {
      console.log(chalk.red('❌ No remaining quota'));
      console.log(chalk.white('Upgrade at: https://recoder.xyz/pricing'));
    }
  }

  /**
   * Prompt user to authenticate if needed
   */
  async ensureAuthenticated(): Promise<boolean> {
    const status = await this.checkAvailability();

    if (!status.authenticated) {
      console.log(chalk.yellow('🔐 Authentication required'));
      console.log(chalk.white('Please run: recoder auth login'));
      return false;
    }

    if (!status.hasQuota) {
      console.log(chalk.yellow('📊 Quota exceeded'));
      console.log(chalk.white('Upgrade at: https://recoder.xyz/pricing'));
      return false;
    }

    return true;
  }
}

export const recoderAI = RecoderAIService.getInstance();