/**
 * Smart AI Model Routing Service
 * Routes requests to optimal AI models based on task complexity and cost optimization
 */

import { Logger } from '@recoder/shared';
import { AuthService } from './auth';
import { ConfigManager } from '../utils/config';

export interface AIModelProvider {
  id: string;
  name: string;
  costPer1MTokens: number;
  strengths: string[];
  maxTokens: number;
  averageResponseTime: number;
  available: boolean;
}

export interface TaskComplexity {
  level: 'simple' | 'moderate' | 'complex' | 'expert';
  estimatedTokens: number;
  requiresReasoning: boolean;
  isMultimodal: boolean;
  domainSpecific: boolean;
  privacyLevel: PrivacyLevel;
}

export enum PrivacyLevel {
  PUBLIC = 'public',        // Can use any model including cloud
  INTERNAL = 'internal',    // Prefer local models, cloud allowed with encryption
  CONFIDENTIAL = 'confidential', // Local models only, no cloud
  RESTRICTED = 'restricted' // Specific approved models only
}

export interface PrivacyPolicy {
  level: PrivacyLevel;
  allowedProviders: string[];
  dataRetention: number; // days
  encryption: boolean;
  auditRequired: boolean;
}

export interface RoutingDecision {
  selectedModel: AIModelProvider;
  reasoning: string;
  estimatedCost: number;
  fallbackModels: AIModelProvider[];
}

export class AIRouterService {
  private models: Map<string, AIModelProvider> = new Map();
  private usageTracker: Map<string, number> = new Map();
  private privacyPolicies: Map<PrivacyLevel, PrivacyPolicy> = new Map();

  constructor() {
    this.initializeModels();
    this.initializePrivacyPolicies();
  }

  private initializeModels(): void {
    // DeepSeek V3 - Primary cost-optimized coding model
    this.models.set('deepseek-v3', {
      id: 'deepseek-v3',
      name: 'DeepSeek V3',
      costPer1MTokens: 0.14, // $0.14 input, $0.28 output
      strengths: ['coding', 'refactoring', 'debugging', 'documentation'],
      maxTokens: 64000,
      averageResponseTime: 2000,
      available: true
    });

    // Groq Llama - Fast iterations and simple tasks
    this.models.set('groq-llama-3.1-70b', {
      id: 'groq-llama-3.1-70b',
      name: 'Groq Llama 3.1 70B',
      costPer1MTokens: 0.08, // $0.05 input, $0.08 output
      strengths: ['fast-coding', 'simple-queries', 'iterations', 'chat'],
      maxTokens: 32000,
      averageResponseTime: 500, // Very fast
      available: true
    });

    // Mistral Large - Code generation and multilingual
    this.models.set('mistral-large-2407', {
      id: 'mistral-large-2407',
      name: 'Mistral Large 2407',
      costPer1MTokens: 3.00, // $3 input, $9 output average
      strengths: ['code-generation', 'multilingual', 'reasoning', 'efficiency'],
      maxTokens: 128000,
      averageResponseTime: 3000,
      available: true
    });

    // Perplexity Sonar - Research and real-time data
    this.models.set('perplexity-sonar-large', {
      id: 'perplexity-sonar-large',
      name: 'Perplexity Sonar Large',
      costPer1MTokens: 1.00, // $1 per 1M tokens
      strengths: ['research', 'real-time-data', 'web-search', 'factual-queries'],
      maxTokens: 127072,
      averageResponseTime: 4000,
      available: true
    });

    // Cohere Command R+ - Text generation and classification
    this.models.set('command-r-plus', {
      id: 'command-r-plus',
      name: 'Cohere Command R+',
      costPer1MTokens: 3.00, // $3 per 1M tokens
      strengths: ['text-generation', 'classification', 'embeddings', 'summarization'],
      maxTokens: 128000,
      averageResponseTime: 3500,
      available: true
    });

    // Claude Sonnet 4 - Complex reasoning and architecture
    this.models.set('claude-sonnet-4', {
      id: 'claude-sonnet-4',
      name: 'Claude Sonnet 4',
      costPer1MTokens: 3.00, // $3 input, $15 output
      strengths: ['architecture', 'complex-reasoning', 'security', 'blockchain'],
      maxTokens: 200000,
      averageResponseTime: 5000,
      available: true
    });

    // Gemini 2.5 Pro - Multimodal and large codebases
    this.models.set('gemini-2.5-pro', {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      costPer1MTokens: 1.25, // $1.25 input, $5 output
      strengths: ['multimodal', 'large-codebases', 'analysis', 'documentation'],
      maxTokens: 2000000, // 2M context window
      averageResponseTime: 4000,
      available: true
    });

    // Ollama Local - Free fallback
    this.models.set('ollama-local', {
      id: 'ollama-local',
      name: 'Ollama Local',
      costPer1MTokens: 0, // Free
      strengths: ['privacy', 'offline', 'basic-coding'],
      maxTokens: 32000,
      averageResponseTime: 8000,
      available: this.isOllamaAvailable()
    });
  }

  async routeRequest(
    prompt: string, 
    taskType: string,
    userTier: 'free' | 'premium' | 'pro' | 'enterprise',
    privacyLevel: PrivacyLevel = PrivacyLevel.PUBLIC
  ): Promise<RoutingDecision> {
    const complexity = this.analyzeTaskComplexity(prompt, taskType, privacyLevel);
    const userUsage = await this.getCurrentUsage();
    
    // Check privacy constraints first
    const privacyConstraints = this.getPrivacyConstraints(privacyLevel);
    if (!this.canProcessWithPrivacyLevel(privacyLevel, userTier)) {
      throw new Error(`Privacy level ${privacyLevel} not supported for ${userTier} tier`);
    }
    
    // Route based on privacy level first, then user tier
    if (complexity.privacyLevel === PrivacyLevel.CONFIDENTIAL || complexity.privacyLevel === PrivacyLevel.RESTRICTED) {
      Logger.info(`Privacy level ${complexity.privacyLevel} requires local processing`);
      return this.routeToLocalModel(complexity);
    }
    
    if (userTier === 'free') {
      return this.routeToLocalModel(complexity);
    }

    // Check if user has remaining quota
    const canUseCloudModels = await this.checkCloudModelQuota(userTier, complexity.estimatedTokens);
    
    if (!canUseCloudModels) {
      Logger.warn('Cloud model quota exceeded, falling back to local models');
      return this.routeToLocalModel(complexity);
    }

    const routingDecision = this.selectOptimalCloudModel(complexity, userTier, prompt);
    
    // Audit request for privacy compliance
    await this.auditRequest(prompt, complexity.privacyLevel, routingDecision.selectedModel.id);
    
    return routingDecision;
  }

  private analyzeTaskComplexity(prompt: string, taskType: string, privacyLevel: PrivacyLevel = PrivacyLevel.PUBLIC): TaskComplexity {
    const promptLower = prompt.toLowerCase();
    const estimatedTokens = Math.max(1000, prompt.length * 4); // Rough estimate

    // Determine complexity level
    let level: TaskComplexity['level'] = 'simple';
    let requiresReasoning = false;
    let isMultimodal = false;
    let domainSpecific = false;

    // Complex architecture keywords
    if (this.containsKeywords(promptLower, [
      'architecture', 'system design', 'microservices', 'scalability',
      'security audit', 'performance optimization', 'database design'
    ])) {
      level = 'expert';
      requiresReasoning = true;
    }
    // Blockchain/Web3 complexity
    else if (this.containsKeywords(promptLower, [
      'blockchain', 'smart contract', 'solana', 'ethereum', 'defi', 'web3'
    ])) {
      level = 'complex';
      requiresReasoning = true;
      domainSpecific = true;
    }
    // Moderate complexity
    else if (this.containsKeywords(promptLower, [
      'refactor', 'optimize', 'debug', 'test', 'api', 'database'
    ])) {
      level = 'moderate';
    }

    // Check for multimodal requirements
    isMultimodal = this.containsKeywords(promptLower, [
      'image', 'diagram', 'screenshot', 'visual', 'chart'
    ]);
    
    // Special handling for research tasks
    if (this.containsKeywords(promptLower, [
      'research', 'latest', 'current', 'recent', 'news', 'real-time'
    ])) {
      level = 'complex'; // Research tasks need specialized models
    }

    return {
      level,
      estimatedTokens,
      requiresReasoning,
      isMultimodal,
      domainSpecific,
      privacyLevel
    };
  }

  private selectOptimalCloudModel(
    complexity: TaskComplexity, 
    userTier: string,
    taskContext: string = ''
  ): RoutingDecision {
    // Apply privacy constraints
    const allowedModels = this.filterModelsByPrivacy(complexity.privacyLevel);
    const availableModels = Array.from(this.models.values())
      .filter(model => model.available && model.id !== 'ollama-local' && allowedModels.includes(model.id));
    
    if (availableModels.length === 0) {
      Logger.warn(`No models available for privacy level ${complexity.privacyLevel}, falling back to local`);
      return this.routeToLocalModel(complexity);
    }

    let selectedModel: AIModelProvider;
    let reasoning: string;

    // Route based on task requirements and cost optimization
    if (complexity.isMultimodal) {
      selectedModel = this.models.get('gemini-2.5-pro')!;
      reasoning = 'Multimodal content requires Gemini 2.5 Pro';
    }
    else if (complexity.level === 'expert' || complexity.domainSpecific) {
      // Prefer Claude for blockchain/security, Mistral for general expert tasks
      if (this.containsKeywords(taskContext.toLowerCase(), ['blockchain', 'security', 'audit'])) {
        selectedModel = this.models.get('claude-sonnet-4')! || this.models.get('mistral-large-2407')!;
        reasoning = 'Expert blockchain/security task routed to Claude Sonnet 4';
      } else {
        selectedModel = this.models.get('mistral-large-2407')! || this.models.get('claude-sonnet-4')!;
        reasoning = 'Expert task routed to cost-effective Mistral Large';
      }
    }
    else if (complexity.level === 'simple' || complexity.estimatedTokens < 2000) {
      selectedModel = this.models.get('groq-llama-3.1-70b')!;
      reasoning = 'Simple task routed to fast, cost-effective Groq Llama';
    }
    else {
      selectedModel = this.models.get('deepseek-v3')!;
      reasoning = 'Standard coding task routed to cost-optimized DeepSeek V3';
    }

    const estimatedCost = this.calculateCost(complexity.estimatedTokens, selectedModel);
    
    const fallbackModels = availableModels
      .filter(model => model.id !== selectedModel.id)
      .sort((a, b) => a.costPer1MTokens - b.costPer1MTokens);

    return {
      selectedModel,
      reasoning,
      estimatedCost,
      fallbackModels
    };
  }

  private routeToLocalModel(complexity: TaskComplexity): RoutingDecision {
    const localModel = this.models.get('ollama-local')!;
    
    if (!localModel.available) {
      throw new Error('No available models. Please install Ollama or upgrade to Premium.');
    }

    return {
      selectedModel: localModel,
      reasoning: 'Free tier or quota exceeded - using local Ollama model',
      estimatedCost: 0,
      fallbackModels: []
    };
  }

  private async checkCloudModelQuota(
    userTier: string, 
    estimatedTokens: number
  ): Promise<boolean> {
    try {
      const token = ConfigManager.getAuthToken();
      if (!token) return false;

      const usageCheck = await AuthService.checkUsageLimit(token, estimatedTokens);
      return usageCheck.allowed;
    } catch (error) {
      Logger.error('Failed to check usage quota:', error);
      return false;
    }
  }

  private calculateCost(tokens: number, model: AIModelProvider): number {
    // Estimate input/output ratio (typically 1:3 for code generation)
    const inputTokens = tokens * 0.25;
    const outputTokens = tokens * 0.75;
    
    // Use average of input/output costs for simplification
    const avgCostPer1M = model.costPer1MTokens;
    
    return (tokens / 1000000) * avgCostPer1M;
  }

  private containsKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }

  private isOllamaAvailable(): boolean {
    // Check if Ollama is installed and running
    // This would typically check for Ollama process or try to connect
    return true; // Assume available for now
  }

  private async getCurrentUsage(): Promise<any> {
    try {
      const token = ConfigManager.getAuthToken();
      if (!token) return { tokensUsed: 0, requestsUsed: 0 };

      const subscription = await AuthService.getSubscription(token);
      return subscription.success ? subscription.data?.usage || {} : {};
    } catch (error) {
      Logger.error('Failed to get current usage:', error);
      return { tokensUsed: 0, requestsUsed: 0 };
    }
  }

  async trackUsage(modelId: string, tokensUsed: number): Promise<void> {
    try {
      const token = ConfigManager.getAuthToken();
      if (!token) return;

      const model = this.models.get(modelId);
      if (!model || model.costPer1MTokens === 0) return; // Don't track free/local usage

      await AuthService.updateUsage(token, tokensUsed, 1);
      
      // Update local tracking
      const currentUsage = this.usageTracker.get(modelId) || 0;
      this.usageTracker.set(modelId, currentUsage + tokensUsed);

      Logger.debug(`Usage tracked: ${tokensUsed} tokens on ${model.name}`);
    } catch (error) {
      Logger.warn('Failed to track usage:', error);
    }
  }

  getModelStats(): { model: string; usage: number; cost: number }[] {
    return Array.from(this.usageTracker.entries()).map(([modelId, usage]) => {
      const model = this.models.get(modelId)!;
      return {
        model: model.name,
        usage,
        cost: this.calculateCost(usage, model)
      };
    });
  }

  // Get routing recommendations for user
  getRoutingInsights(): any {
    const stats = this.getModelStats();
    const totalCost = stats.reduce((sum, stat) => sum + stat.cost, 0);
    
    return {
      totalCost,
      modelUsage: stats,
      recommendations: this.generateCostOptimizationTips(stats)
    };
  }

  private generateCostOptimizationTips(stats: any[]): string[] {
    const tips: string[] = [];
    
    const expensiveUsage = stats.filter(stat => stat.cost > 1).length;
    if (expensiveUsage > 0) {
      tips.push('Consider breaking complex tasks into simpler ones to use cost-effective models');
    }
    
    const localModel = this.models.get('ollama-local');
    if (localModel?.available) {
      tips.push('Use local Ollama models for basic coding tasks to reduce costs');
    }
    
    return tips;
  }

  private initializePrivacyPolicies(): void {
    // PUBLIC - All cloud models allowed
    this.privacyPolicies.set(PrivacyLevel.PUBLIC, {
      level: PrivacyLevel.PUBLIC,
      allowedProviders: ['deepseek-v3', 'groq-llama-3.1-70b', 'claude-sonnet-4', 'gemini-2.5-pro', 'ollama-local'],
      dataRetention: 30,
      encryption: false,
      auditRequired: false
    });

    // INTERNAL - Cloud models with encryption preference
    this.privacyPolicies.set(PrivacyLevel.INTERNAL, {
      level: PrivacyLevel.INTERNAL,
      allowedProviders: ['deepseek-v3', 'groq-llama-3.1-70b', 'ollama-local'], // Exclude highest-cost models
      dataRetention: 7,
      encryption: true,
      auditRequired: true
    });

    // CONFIDENTIAL - Local models only
    this.privacyPolicies.set(PrivacyLevel.CONFIDENTIAL, {
      level: PrivacyLevel.CONFIDENTIAL,
      allowedProviders: ['ollama-local'],
      dataRetention: 0,
      encryption: true,
      auditRequired: true
    });

    // RESTRICTED - Specific approved models only (enterprise custom)
    this.privacyPolicies.set(PrivacyLevel.RESTRICTED, {
      level: PrivacyLevel.RESTRICTED,
      allowedProviders: ['ollama-local'], // Default to local, enterprise can override
      dataRetention: 0,
      encryption: true,
      auditRequired: true
    });
  }

  private getPrivacyConstraints(privacyLevel: PrivacyLevel): PrivacyPolicy {
    return this.privacyPolicies.get(privacyLevel) || this.privacyPolicies.get(PrivacyLevel.PUBLIC)!;
  }

  private canProcessWithPrivacyLevel(privacyLevel: PrivacyLevel, userTier: string): boolean {
    // Free tier can only use PUBLIC level with local models
    if (userTier === 'free' && privacyLevel !== PrivacyLevel.PUBLIC) {
      return false;
    }
    
    // Premium can use PUBLIC and INTERNAL
    if (userTier === 'premium' && [PrivacyLevel.CONFIDENTIAL, PrivacyLevel.RESTRICTED].includes(privacyLevel)) {
      return false;
    }
    
    // Pro can use all except RESTRICTED
    if (userTier === 'pro' && privacyLevel === PrivacyLevel.RESTRICTED) {
      return false;
    }
    
    // Enterprise can use all levels
    return true;
  }

  private filterModelsByPrivacy(privacyLevel: PrivacyLevel): string[] {
    const policy = this.getPrivacyConstraints(privacyLevel);
    return policy.allowedProviders;
  }

  async auditRequest(prompt: string, privacyLevel: PrivacyLevel, selectedModel: string): Promise<void> {
    const policy = this.getPrivacyConstraints(privacyLevel);
    
    if (policy.auditRequired) {
      const auditEntry = {
        timestamp: new Date().toISOString(),
        privacyLevel,
        selectedModel,
        promptHash: this.hashSensitiveData(prompt),
        encrypted: policy.encryption,
        dataRetention: policy.dataRetention
      };
      
      Logger.info(`Privacy audit: ${JSON.stringify(auditEntry)}`);
      // In production: save to secure audit log
    }
  }

  private hashSensitiveData(data: string): string {
    // Simple hash for demo - use proper cryptographic hash in production
    return Buffer.from(data).toString('base64').substring(0, 16);
  }

  setCustomPrivacyPolicy(tier: string, privacyLevel: PrivacyLevel, policy: Partial<PrivacyPolicy>): void {
    if (tier === 'enterprise') {
      const existingPolicy = this.getPrivacyConstraints(privacyLevel);
      const customPolicy = { ...existingPolicy, ...policy };
      this.privacyPolicies.set(privacyLevel, customPolicy);
      Logger.info(`Custom privacy policy set for ${privacyLevel}`);
    }
  }
}

// Export singleton instance
export const AIRouter = new AIRouterService();