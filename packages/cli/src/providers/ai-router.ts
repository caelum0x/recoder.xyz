/**
 * AI PROVIDER ROUTER
 * Intelligent routing system for optimal AI model selection
 */

import { EventEmitter } from 'events';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { groq } from '@ai-sdk/groq';
import { generateObject, generateText, streamText } from 'ai';
import { z } from 'zod';

export interface AIProvider {
  id: string;
  name: string;
  type: 'cloud' | 'local';
  models: AIModel[];
  capabilities: AICapability[];
  pricing: {
    inputTokens: number; // per 1M tokens
    outputTokens: number; // per 1M tokens
    currency: string;
  };
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  latency: {
    average: number; // ms
    p95: number; // ms
  };
  reliability: number; // 0-1 score
  available: boolean;
}

export interface AIModel {
  id: string;
  name: string;
  contextLength: number;
  maxOutputTokens: number;
  capabilities: AICapability[];
  strengths: string[];
  weaknesses: string[];
  costEfficiency: number; // 0-1 score
  speed: number; // 0-1 score
  quality: number; // 0-1 score
}

export type AICapability = 
  | 'code-generation'
  | 'code-review'
  | 'debugging'
  | 'documentation'
  | 'architecture-design'
  | 'testing'
  | 'refactoring'
  | 'optimization'
  | 'security-analysis'
  | 'explanation'
  | 'translation'
  | 'creative-writing'
  | 'data-analysis'
  | 'reasoning'
  | 'multimodal';

export interface SelectionCriteria {
  task: AICapability;
  complexity: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  language?: string;
  estimatedTokens: number;
  priority: 'speed' | 'quality' | 'cost' | 'reliability';
  constraints?: {
    maxLatency?: number;
    maxCost?: number;
    requiresLocal?: boolean;
    requiresStreaming?: boolean;
  };
}

export interface GenerationRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  streaming?: boolean;
  systemPrompt?: string;
  schema?: z.ZodSchema;
}

export interface GenerationResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
  };
  model: string;
  provider: string;
  latency: number;
  quality?: number;
}

export class AIProviderRouter extends EventEmitter {
  private providers = new Map<string, AIProvider>();
  private performanceHistory = new Map<string, Array<{
    timestamp: number;
    latency: number;
    success: boolean;
    task: AICapability;
    tokens: number;
  }>>();
  private costTracker = new Map<string, {
    totalCost: number;
    totalTokens: number;
    requests: number;
  }>();

  constructor() {
    super();
    console.log('🤖 AI Provider Router initialized');
  }

  async initialize(): Promise<void> {
    await this.setupProviders();
    await this.testProviderAvailability();
    this.startPerformanceMonitoring();
    console.log(`✅ AI Router ready with ${this.providers.size} providers`);
  }

  private async setupProviders(): Promise<void> {
    // Anthropic Claude
    this.providers.set('anthropic', {
      id: 'anthropic',
      name: 'Anthropic Claude',
      type: 'cloud',
      models: [
        {
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          contextLength: 200000,
          maxOutputTokens: 8192,
          capabilities: ['code-generation', 'code-review', 'debugging', 'architecture-design', 'reasoning', 'security-analysis'],
          strengths: ['Complex reasoning', 'Security analysis', 'Code architecture', 'Long context'],
          weaknesses: ['Speed', 'Cost for simple tasks'],
          costEfficiency: 0.7,
          speed: 0.6,
          quality: 0.95
        },
        {
          id: 'claude-3-haiku-20240307',
          name: 'Claude 3 Haiku',
          contextLength: 200000,
          maxOutputTokens: 4096,
          capabilities: ['code-generation', 'explanation', 'documentation'],
          strengths: ['Speed', 'Cost efficiency', 'Simple tasks'],
          weaknesses: ['Complex reasoning', 'Advanced architecture'],
          costEfficiency: 0.95,
          speed: 0.9,
          quality: 0.8
        }
      ],
      capabilities: ['code-generation', 'code-review', 'debugging', 'architecture-design', 'reasoning', 'security-analysis'],
      pricing: {
        inputTokens: 3.00,
        outputTokens: 15.00,
        currency: 'USD'
      },
      rateLimit: {
        requestsPerMinute: 50,
        tokensPerMinute: 40000
      },
      latency: {
        average: 2500,
        p95: 4000
      },
      reliability: 0.98,
      available: !!process.env.ANTHROPIC_API_KEY
    });

    // OpenAI GPT
    this.providers.set('openai', {
      id: 'openai',
      name: 'OpenAI GPT',
      type: 'cloud',
      models: [
        {
          id: 'gpt-4-turbo',
          name: 'GPT-4 Turbo',
          contextLength: 128000,
          maxOutputTokens: 4096,
          capabilities: ['code-generation', 'code-review', 'debugging', 'multimodal', 'creative-writing'],
          strengths: ['Versatility', 'Multimodal', 'Creative tasks'],
          weaknesses: ['Cost', 'Code security analysis'],
          costEfficiency: 0.6,
          speed: 0.7,
          quality: 0.9
        },
        {
          id: 'gpt-3.5-turbo',
          name: 'GPT-3.5 Turbo',
          contextLength: 16385,
          maxOutputTokens: 4096,
          capabilities: ['code-generation', 'explanation', 'documentation'],
          strengths: ['Speed', 'Cost', 'General purpose'],
          weaknesses: ['Complex reasoning', 'Latest knowledge'],
          costEfficiency: 0.9,
          speed: 0.85,
          quality: 0.75
        }
      ],
      capabilities: ['code-generation', 'code-review', 'debugging', 'multimodal', 'creative-writing'],
      pricing: {
        inputTokens: 10.00,
        outputTokens: 30.00,
        currency: 'USD'
      },
      rateLimit: {
        requestsPerMinute: 60,
        tokensPerMinute: 90000
      },
      latency: {
        average: 1800,
        p95: 3000
      },
      reliability: 0.95,
      available: !!process.env.OPENAI_API_KEY
    });

    // Groq (Fast inference)
    this.providers.set('groq', {
      id: 'groq',
      name: 'Groq',
      type: 'cloud',
      models: [
        {
          id: 'llama-3.1-70b-versatile',
          name: 'Llama 3.1 70B',
          contextLength: 32768,
          maxOutputTokens: 8000,
          capabilities: ['code-generation', 'debugging', 'explanation'],
          strengths: ['Ultra-fast inference', 'Cost effective', 'Good for iteration'],
          weaknesses: ['Limited context', 'Less sophisticated reasoning'],
          costEfficiency: 0.85,
          speed: 0.98,
          quality: 0.8
        },
        {
          id: 'mixtral-8x7b-32768',
          name: 'Mixtral 8x7B',
          contextLength: 32768,
          maxOutputTokens: 8000,
          capabilities: ['code-generation', 'explanation', 'translation'],
          strengths: ['Speed', 'Multilingual', 'Code generation'],
          weaknesses: ['Complex reasoning', 'Architecture design'],
          costEfficiency: 0.9,
          speed: 0.95,
          quality: 0.75
        }
      ],
      capabilities: ['code-generation', 'debugging', 'explanation'],
      pricing: {
        inputTokens: 0.59,
        outputTokens: 0.79,
        currency: 'USD'
      },
      rateLimit: {
        requestsPerMinute: 30,
        tokensPerMinute: 6000
      },
      latency: {
        average: 400,
        p95: 800
      },
      reliability: 0.93,
      available: !!process.env.GROQ_API_KEY
    });

    // Local Ollama (if available)
    if (await this.checkOllamaAvailability()) {
      this.providers.set('ollama', {
        id: 'ollama',
        name: 'Ollama Local',
        type: 'local',
        models: await this.getOllamaModels(),
        capabilities: ['code-generation', 'explanation', 'debugging'],
        pricing: {
          inputTokens: 0,
          outputTokens: 0,
          currency: 'FREE'
        },
        rateLimit: {
          requestsPerMinute: 1000,
          tokensPerMinute: 100000
        },
        latency: {
          average: 800,
          p95: 1500
        },
        reliability: 0.9,
        available: true
      });
    }
  }

  async selectProvider(criteria: SelectionCriteria): Promise<AIProvider> {
    const availableProviders = Array.from(this.providers.values())
      .filter(p => p.available)
      .filter(p => p.capabilities.includes(criteria.task));

    if (availableProviders.length === 0) {
      throw new Error(`No available providers for task: ${criteria.task}`);
    }

    // Apply constraints
    let filteredProviders = availableProviders;

    if (criteria.constraints?.requiresLocal) {
      filteredProviders = filteredProviders.filter(p => p.type === 'local');
    }

    if (criteria.constraints?.maxLatency) {
      filteredProviders = filteredProviders.filter(p => p.latency.average <= criteria.constraints!.maxLatency!);
    }

    if (filteredProviders.length === 0) {
      throw new Error('No providers meet the specified constraints');
    }

    // Score providers based on priority
    const scoredProviders = filteredProviders.map(provider => ({
      provider,
      score: this.calculateProviderScore(provider, criteria)
    }));

    // Sort by score (highest first)
    scoredProviders.sort((a, b) => b.score - a.score);

    const selectedProvider = scoredProviders[0].provider;
    console.log(`🎯 Selected provider: ${selectedProvider.name} (score: ${scoredProviders[0].score.toFixed(2)})`);
    
    return selectedProvider;
  }

  private calculateProviderScore(provider: AIProvider, criteria: SelectionCriteria): number {
    let score = 0;

    // Base reliability score
    score += provider.reliability * 0.2;

    // Task-specific capability bonus
    const hasCapability = provider.capabilities.includes(criteria.task);
    if (hasCapability) score += 0.3;

    // Model quality for task
    const relevantModels = provider.models.filter(m => m.capabilities.includes(criteria.task));
    if (relevantModels.length > 0) {
      const avgQuality = relevantModels.reduce((sum, m) => sum + m.quality, 0) / relevantModels.length;
      score += avgQuality * 0.25;
    }

    // Priority-based scoring
    switch (criteria.priority) {
      case 'speed':
        score += this.getSpeedScore(provider) * 0.4;
        break;
      case 'quality':
        score += this.getQualityScore(provider, criteria.task) * 0.4;
        break;
      case 'cost':
        score += this.getCostScore(provider, criteria.estimatedTokens) * 0.4;
        break;
      case 'reliability':
        score += provider.reliability * 0.4;
        break;
    }

    // Complexity bonus
    const complexityBonus = this.getComplexityBonus(provider, criteria.complexity);
    score += complexityBonus * 0.15;

    // Performance history bonus
    const performanceBonus = this.getPerformanceBonus(provider.id, criteria.task);
    score += performanceBonus * 0.1;

    return score;
  }

  private getSpeedScore(provider: AIProvider): number {
    // Invert latency to get speed score (lower latency = higher score)
    const maxLatency = 5000; // 5 seconds
    return Math.max(0, (maxLatency - provider.latency.average) / maxLatency);
  }

  private getQualityScore(provider: AIProvider, task: AICapability): number {
    const relevantModels = provider.models.filter(m => m.capabilities.includes(task));
    if (relevantModels.length === 0) return 0;
    
    return relevantModels.reduce((sum, m) => sum + m.quality, 0) / relevantModels.length;
  }

  private getCostScore(provider: AIProvider, estimatedTokens: number): number {
    if (provider.pricing.inputTokens === 0) return 1; // Free is best

    const estimatedCost = (estimatedTokens / 1000000) * provider.pricing.inputTokens;
    const maxCost = 0.50; // $0.50 threshold
    
    return Math.max(0, (maxCost - estimatedCost) / maxCost);
  }

  private getComplexityBonus(provider: AIProvider, complexity: string): number {
    const complexityRequirements = {
      beginner: 0.6,
      intermediate: 0.7,
      advanced: 0.8,
      expert: 0.9
    } as const;

    const required = complexityRequirements[complexity as keyof typeof complexityRequirements];
    const avgQuality = provider.models.reduce((sum, m) => sum + m.quality, 0) / provider.models.length;
    
    return avgQuality >= required ? 0.2 : 0;
  }

  private getPerformanceBonus(providerId: string, task: AICapability): number {
    const history = this.performanceHistory.get(providerId) || [];
    const relevantHistory = history.filter(h => h.task === task).slice(-10); // Last 10 requests
    
    if (relevantHistory.length < 3) return 0;
    
    const successRate = relevantHistory.filter(h => h.success).length / relevantHistory.length;
    const avgLatency = relevantHistory.reduce((sum, h) => sum + h.latency, 0) / relevantHistory.length;
    
    return (successRate * 0.7) + ((2000 - Math.min(avgLatency, 2000)) / 2000 * 0.3);
  }

  async generateCode(prompt: string, options: Partial<GenerationRequest> = {}): Promise<GenerationResponse> {
    const startTime = Date.now();
    
    try {
      // Select appropriate provider if not specified
      let provider: AIProvider;
      if (options.model) {
        // Find provider by model
        provider = Array.from(this.providers.values())
          .find(p => p.models.some(m => m.id === options.model))!;
        
        if (!provider) {
          throw new Error(`Model not found: ${options.model}`);
        }
      } else {
        // Auto-select provider
        provider = await this.selectProvider({
          task: 'code-generation',
          complexity: 'advanced',
          estimatedTokens: options.maxTokens || 2000,
          priority: 'quality'
        });
      }

      // Generate using selected provider
      const response = await this.callProvider(provider, prompt, { prompt, ...options });
      
      // Track performance
      const latency = Date.now() - startTime;
      this.trackPerformance(provider.id, latency, true, 'code-generation', response.usage.totalTokens);
      this.trackCost(provider.id, response.usage.totalTokens, response.usage.cost);

      console.log(`✅ Code generated via ${provider.name} (${latency}ms, ${response.usage.totalTokens} tokens)`);
      
      return response;

    } catch (error) {
      const latency = Date.now() - startTime;
      console.error(`❌ Code generation failed (${latency}ms):`, error);
      throw error;
    }
  }

  private async callProvider(provider: AIProvider, prompt: string, options: GenerationRequest): Promise<GenerationResponse> {
    const modelId = options.model || this.getBestModel(provider, 'code-generation');
    const model = provider.models.find(m => m.id === modelId)!;

    let providerInstance;
    switch (provider.id) {
      case 'anthropic':
        providerInstance = anthropic;
        break;
      case 'openai':
        providerInstance = openai;
        break;
      case 'groq':
        providerInstance = groq;
        break;
      case 'ollama':
        // Handle Ollama locally
        return this.callOllama(modelId, prompt, options);
      default:
        throw new Error(`Unsupported provider: ${provider.id}`);
    }

    const startTime = Date.now();

    if (options.schema) {
      // Structured generation
      const result = await generateObject({
        model: providerInstance(modelId),
        prompt,
        schema: options.schema,
        temperature: options.temperature || 0.3
      } as any);

      return {
        content: JSON.stringify(result.object, null, 2),
        usage: {
          inputTokens: (result.usage as any)?.promptTokens || 0,
          outputTokens: (result.usage as any)?.completionTokens || 0,
          totalTokens: result.usage?.totalTokens || 0,
          cost: this.calculateCost(provider, result.usage?.totalTokens || 0)
        },
        model: modelId,
        provider: provider.id,
        latency: Date.now() - startTime
      };
    } else {
      // Regular text generation
      const result = await generateText({
        model: providerInstance(modelId),
        prompt,
        temperature: options.temperature || 0.3,
        system: options.systemPrompt
      } as any);

      return {
        content: result.text,
        usage: {
          inputTokens: (result.usage as any)?.promptTokens || 0,
          outputTokens: (result.usage as any)?.completionTokens || 0,
          totalTokens: result.usage?.totalTokens || 0,
          cost: this.calculateCost(provider, result.usage?.totalTokens || 0)
        },
        model: modelId,
        provider: provider.id,
        latency: Date.now() - startTime
      };
    }
  }

  private async callOllama(model: string, prompt: string, options: GenerationRequest): Promise<GenerationResponse> {
    // Implementation for local Ollama calls
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature || 0.3,
          num_predict: options.maxTokens || 4000
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      content: data.response,
      usage: {
        inputTokens: data.prompt_eval_count || 0,
        outputTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        cost: 0 // Local is free
      },
      model,
      provider: 'ollama',
      latency: data.total_duration ? Math.round(data.total_duration / 1000000) : 0
    };
  }

  private getBestModel(provider: AIProvider, task: AICapability): string {
    const relevantModels = provider.models.filter(m => m.capabilities.includes(task));
    
    if (relevantModels.length === 0) {
      return provider.models[0].id; // Fallback to first model
    }

    // Sort by quality score
    relevantModels.sort((a, b) => b.quality - a.quality);
    return relevantModels[0].id;
  }

  private calculateCost(provider: AIProvider, totalTokens: number): number {
    const inputRatio = 0.7; // Assume 70% input, 30% output
    const outputRatio = 0.3;
    
    const inputTokens = totalTokens * inputRatio;
    const outputTokens = totalTokens * outputRatio;
    
    return ((inputTokens / 1000000) * provider.pricing.inputTokens) +
           ((outputTokens / 1000000) * provider.pricing.outputTokens);
  }

  private trackPerformance(providerId: string, latency: number, success: boolean, task: AICapability, tokens: number): void {
    if (!this.performanceHistory.has(providerId)) {
      this.performanceHistory.set(providerId, []);
    }

    const history = this.performanceHistory.get(providerId)!;
    history.push({
      timestamp: Date.now(),
      latency,
      success,
      task,
      tokens
    });

    // Keep only last 100 entries
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  private trackCost(providerId: string, tokens: number, cost: number): void {
    if (!this.costTracker.has(providerId)) {
      this.costTracker.set(providerId, { totalCost: 0, totalTokens: 0, requests: 0 });
    }

    const tracker = this.costTracker.get(providerId)!;
    tracker.totalCost += cost;
    tracker.totalTokens += tokens;
    tracker.requests += 1;
  }

  private async testProviderAvailability(): Promise<void> {
    for (const [id, provider] of this.providers.entries()) {
      try {
        if (provider.type === 'local' && id === 'ollama') {
          provider.available = await this.checkOllamaAvailability();
        } else {
          // Test with a simple request
          await this.callProvider(provider, 'Hello', { prompt: 'Hello', maxTokens: 10 });
          provider.available = true;
        }
      } catch (error) {
        provider.available = false;
        console.warn(`⚠️ Provider ${provider.name} unavailable:`, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async checkOllamaAvailability(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:11434/api/version', { 
        signal: AbortSignal.timeout(5000) 
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async getOllamaModels(): Promise<AIModel[]> {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) return [];
      
      const data = await response.json();
      return data.models?.map((model: any) => ({
        id: model.name,
        name: model.name,
        contextLength: 4096, // Default
        maxOutputTokens: 2048,
        capabilities: ['code-generation', 'explanation', 'debugging'],
        strengths: ['Local privacy', 'No cost', 'Always available'],
        weaknesses: ['Limited capabilities', 'Hardware dependent'],
        costEfficiency: 1.0,
        speed: 0.7,
        quality: 0.7
      })) || [];
    } catch {
      return [];
    }
  }

  private startPerformanceMonitoring(): void {
    setInterval(() => {
      this.updateProviderMetrics();
    }, 60000); // Update every minute
  }

  private updateProviderMetrics(): void {
    for (const [id, provider] of this.providers.entries()) {
      const history = this.performanceHistory.get(id) || [];
      const recentHistory = history.filter(h => Date.now() - h.timestamp < 300000); // Last 5 minutes

      if (recentHistory.length > 0) {
        const avgLatency = recentHistory.reduce((sum, h) => sum + h.latency, 0) / recentHistory.length;
        const successRate = recentHistory.filter(h => h.success).length / recentHistory.length;

        provider.latency.average = avgLatency;
        provider.reliability = successRate;
      }
    }
  }

  // Public API methods
  getAvailableProviders(): AIProvider[] {
    return Array.from(this.providers.values()).filter(p => p.available);
  }

  getProviderStats(providerId: string): any {
    const provider = this.providers.get(providerId);
    const history = this.performanceHistory.get(providerId) || [];
    const costs = this.costTracker.get(providerId);

    return {
      provider,
      performance: {
        totalRequests: history.length,
        avgLatency: history.length > 0 ? history.reduce((sum, h) => sum + h.latency, 0) / history.length : 0,
        successRate: history.length > 0 ? history.filter(h => h.success).length / history.length : 0
      },
      costs: costs || { totalCost: 0, totalTokens: 0, requests: 0 }
    };
  }

  getCostSummary(): any {
    const summary = {
      totalCost: 0,
      totalTokens: 0,
      totalRequests: 0,
      byProvider: {} as Record<string, { totalCost: number; totalTokens: number; requests: number }>
    };

    for (const [providerId, costs] of this.costTracker.entries()) {
      summary.totalCost += costs.totalCost;
      summary.totalTokens += costs.totalTokens;
      summary.totalRequests += costs.requests;
      summary.byProvider[providerId] = costs;
    }

    return summary;
  }

  async getBestProvider(task: AICapability, priority: 'speed' | 'quality' | 'cost' | 'reliability' = 'quality'): Promise<AIProvider | null> {
    try {
      return await this.selectProvider({
        task,
        complexity: 'advanced',
        estimatedTokens: 2000,
        priority
      });
    } catch {
      return null;
    }
  }
}

export const aiRouter = new AIProviderRouter();