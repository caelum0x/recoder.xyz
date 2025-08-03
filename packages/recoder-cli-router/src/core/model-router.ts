// Smart AI Model Router for Recoder CLI
// Routes requests to the best AI model based on task type, cost, and performance

// Database utilities would be imported from unified system when available
// import { PlanType } from '../../../lib/database';

export type PlanType = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface ModelProvider {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  models: ModelConfig[];
  rateLimit: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
  costPerToken: {
    input: number;
    output: number;
  };
  reliability: number; // 0-1 score
  avgResponseTime: number; // milliseconds
}

export interface ModelConfig {
  id: string;
  name: string;
  displayName: string;
  provider: string;
  capabilities: ModelCapability[];
  contextWindow: number;
  maxTokens: number;
  multimodal: boolean;
  strengths: TaskType[];
  weaknesses?: TaskType[];
  costMultiplier: number; // Relative cost vs base
  qualityScore: number; // 0-1 quality rating
}

export enum TaskType {
  // Code Generation
  WEB_DEVELOPMENT = 'web_development',
  MOBILE_DEVELOPMENT = 'mobile_development', 
  BACKEND_API = 'backend_api',
  DATABASE_DESIGN = 'database_design',
  
  // Blockchain
  SMART_CONTRACTS = 'smart_contracts',
  DEFI_PROTOCOLS = 'defi_protocols',
  NFT_SYSTEMS = 'nft_systems',
  
  // AI/ML
  AI_INTEGRATION = 'ai_integration',
  ML_PIPELINES = 'ml_pipelines',
  DATA_ANALYSIS = 'data_analysis',
  
  // DevOps
  DEPLOYMENT = 'deployment',
  CI_CD = 'ci_cd',
  INFRASTRUCTURE = 'infrastructure',
  
  // Security
  SECURITY_AUDIT = 'security_audit',
  VULNERABILITY_SCAN = 'vulnerability_scan',
  PENETRATION_TEST = 'penetration_test',
  
  // General
  CODE_REVIEW = 'code_review',
  DOCUMENTATION = 'documentation',
  DEBUGGING = 'debugging',
  REFACTORING = 'refactoring',
  TESTING = 'testing'
}

export enum ModelCapability {
  CODE_GENERATION = 'code_generation',
  CODE_ANALYSIS = 'code_analysis',
  NATURAL_LANGUAGE = 'natural_language',
  MULTIMODAL = 'multimodal',
  FUNCTION_CALLING = 'function_calling',
  JSON_MODE = 'json_mode',
  STREAMING = 'streaming'
}

export interface RoutingRequest {
  prompt: string;
  taskType: TaskType;
  userPlan: PlanType;
  userId: string;
  priority: 'low' | 'medium' | 'high';
  maxCost?: number;
  preferredProviders?: string[];
  requireCapabilities?: ModelCapability[];
  context?: {
    language?: string;
    framework?: string;
    complexity?: 'simple' | 'medium' | 'complex';
    fileTypes?: string[];
  };
}

export interface RoutingResponse {
  selectedModel: ModelConfig;
  provider: ModelProvider;
  reasoning: string;
  estimatedCost: number;
  estimatedTime: number;
  confidence: number;
  fallbackModels: ModelConfig[];
}

export class ModelRouter {
  private providers: Map<string, ModelProvider> = new Map();
  private modelCache: Map<string, ModelConfig> = new Map();
  private performanceMetrics: Map<string, PerformanceMetric[]> = new Map();
  
  constructor() {
    this.initializeProviders();
    this.loadPerformanceHistory();
  }

  // Initialize AI providers with real configurations
  private initializeProviders() {
    // Anthropic Claude - Best for complex logic, security, blockchain
    this.addProvider({
      id: 'anthropic',
      name: 'Anthropic',
      endpoint: 'https://api.anthropic.com/v1/messages',
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      models: [
        {
          id: 'claude-3-5-sonnet-20241022',
          name: 'claude-3-5-sonnet',
          displayName: 'Claude 3.5 Sonnet',
          provider: 'anthropic',
          capabilities: [ModelCapability.CODE_GENERATION, ModelCapability.CODE_ANALYSIS, ModelCapability.NATURAL_LANGUAGE],
          contextWindow: 200000,
          maxTokens: 8192,
          multimodal: true,
          strengths: [TaskType.SMART_CONTRACTS, TaskType.SECURITY_AUDIT, TaskType.BACKEND_API, TaskType.CODE_REVIEW],
          costMultiplier: 1.0,
          qualityScore: 0.95
        },
        {
          id: 'claude-3-haiku-20240307',
          name: 'claude-3-haiku',
          displayName: 'Claude 3 Haiku',
          provider: 'anthropic',
          capabilities: [ModelCapability.CODE_GENERATION, ModelCapability.NATURAL_LANGUAGE],
          contextWindow: 200000,
          maxTokens: 4096,
          multimodal: false,
          strengths: [TaskType.DEBUGGING, TaskType.REFACTORING, TaskType.TESTING],
          costMultiplier: 0.25,
          qualityScore: 0.85
        }
      ],
      rateLimit: { requestsPerMinute: 50, requestsPerDay: 1000 },
      costPerToken: { input: 0.003, output: 0.015 },
      reliability: 0.98,
      avgResponseTime: 2500
    });

    // Groq - Best for fast coding, React/Next.js, rapid prototyping
    this.addProvider({
      id: 'groq',
      name: 'Groq',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: process.env.GROQ_API_KEY || '',
      models: [
        {
          id: 'llama-3.1-70b-versatile',
          name: 'llama3-70b',
          displayName: 'Llama 3.1 70B',
          provider: 'groq',
          capabilities: [ModelCapability.CODE_GENERATION, ModelCapability.NATURAL_LANGUAGE, ModelCapability.STREAMING],
          contextWindow: 32768,
          maxTokens: 8192,
          multimodal: false,
          strengths: [TaskType.WEB_DEVELOPMENT, TaskType.MOBILE_DEVELOPMENT, TaskType.CI_CD],
          costMultiplier: 0.5,
          qualityScore: 0.88
        },
        {
          id: 'llama-3.1-8b-instant',
          name: 'llama3-8b',
          displayName: 'Llama 3.1 8B Instant',
          provider: 'groq',
          capabilities: [ModelCapability.CODE_GENERATION, ModelCapability.STREAMING],
          contextWindow: 32768,
          maxTokens: 8192,
          multimodal: false,
          strengths: [TaskType.DEBUGGING, TaskType.REFACTORING, TaskType.TESTING],
          costMultiplier: 0.1,
          qualityScore: 0.75
        }
      ],
      rateLimit: { requestsPerMinute: 100, requestsPerDay: 2000 },
      costPerToken: { input: 0.0005, output: 0.0008 },
      reliability: 0.95,
      avgResponseTime: 800
    });

    // Google Gemini - Best for multimodal, large codebases, documentation
    this.addProvider({
      id: 'google',
      name: 'Google',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
      apiKey: process.env.GOOGLE_API_KEY || '',
      models: [
        {
          id: 'gemini-1.5-pro',
          name: 'gemini-pro',
          displayName: 'Gemini 1.5 Pro',
          provider: 'google',
          capabilities: [ModelCapability.CODE_GENERATION, ModelCapability.MULTIMODAL, ModelCapability.NATURAL_LANGUAGE],
          contextWindow: 2000000,
          maxTokens: 8192,
          multimodal: true,
          strengths: [TaskType.DOCUMENTATION, TaskType.DATA_ANALYSIS, TaskType.AI_INTEGRATION],
          costMultiplier: 0.8,
          qualityScore: 0.90
        }
      ],
      rateLimit: { requestsPerMinute: 60, requestsPerDay: 1500 },
      costPerToken: { input: 0.00125, output: 0.005 },
      reliability: 0.93,
      avgResponseTime: 3000
    });

    // OpenAI - Backup only
    this.addProvider({
      id: 'openai',
      name: 'OpenAI',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      apiKey: process.env.OPENAI_API_KEY || '',
      models: [
        {
          id: 'gpt-4-turbo-preview',
          name: 'gpt-4-turbo',
          displayName: 'GPT-4 Turbo',
          provider: 'openai',
          capabilities: [ModelCapability.CODE_GENERATION, ModelCapability.NATURAL_LANGUAGE, ModelCapability.FUNCTION_CALLING],
          contextWindow: 128000,
          maxTokens: 4096,
          multimodal: false,
          strengths: [TaskType.DOCUMENTATION, TaskType.CODE_REVIEW],
          weaknesses: [TaskType.SMART_CONTRACTS, TaskType.DEFI_PROTOCOLS],
          costMultiplier: 2.0,
          qualityScore: 0.82
        }
      ],
      rateLimit: { requestsPerMinute: 40, requestsPerDay: 800 },
      costPerToken: { input: 0.01, output: 0.03 },
      reliability: 0.90,
      avgResponseTime: 4000
    });
  }

  // Add provider to the router
  private addProvider(provider: ModelProvider) {
    this.providers.set(provider.id, provider);
    
    // Cache models for quick lookup
    provider.models.forEach(model => {
      this.modelCache.set(model.id, model);
    });
  }

  // Smart model selection based on request parameters
  async selectModel(request: RoutingRequest): Promise<RoutingResponse> {
    const candidates = this.getCandidateModels(request);
    
    if (candidates.length === 0) {
      throw new Error('No suitable models found for this request');
    }

    // Score each candidate
    const scoredCandidates = candidates.map(candidate => ({
      ...candidate,
      score: this.calculateModelScore(candidate.model, candidate.provider, request)
    }));

    // Sort by score (highest first)
    scoredCandidates.sort((a, b) => b.score - a.score);
    
    const selected = scoredCandidates[0];
    const fallbacks = scoredCandidates.slice(1, 3).map(c => c.model);

    return {
      selectedModel: selected.model,
      provider: selected.provider,
      reasoning: this.generateReasoning(selected, request),
      estimatedCost: this.estimateCost(selected.model, request),
      estimatedTime: selected.provider.avgResponseTime,
      confidence: selected.score,
      fallbackModels: fallbacks
    };
  }

  // Get candidate models based on task type and requirements
  private getCandidateModels(request: RoutingRequest): Array<{model: ModelConfig, provider: ModelProvider}> {
    const candidates: Array<{model: ModelConfig, provider: ModelProvider}> = [];

    for (const provider of this.providers.values()) {
      // Skip if provider not available
      if (!provider.apiKey) continue;

      // Check user plan restrictions
      if (!this.isProviderAllowed(provider, request.userPlan)) continue;

      // Check preferred providers
      if (request.preferredProviders && !request.preferredProviders.includes(provider.id)) {
        continue;
      }

      for (const model of provider.models) {
        // Check if model is suitable for task
        if (!this.isModelSuitableForTask(model, request.taskType)) continue;

        // Check required capabilities
        if (request.requireCapabilities) {
          const hasAllCapabilities = request.requireCapabilities.every(cap => 
            model.capabilities.includes(cap)
          );
          if (!hasAllCapabilities) continue;
        }

        // Check cost limits
        const estimatedCost = this.estimateCost(model, request);
        if (request.maxCost && estimatedCost > request.maxCost) continue;

        candidates.push({ model, provider });
      }
    }

    return candidates;
  }

  // Calculate model score based on multiple factors
  private calculateModelScore(model: ModelConfig, provider: ModelProvider, request: RoutingRequest): number {
    let score = 0;

    // Quality score (0-40 points)
    score += model.qualityScore * 40;

    // Task suitability (0-30 points)
    if (model.strengths.includes(request.taskType)) {
      score += 30;
    } else if (model.weaknesses?.includes(request.taskType)) {
      score -= 15;
    } else {
      score += 15; // Neutral
    }

    // Cost efficiency (0-15 points) - lower cost = higher score
    const costScore = Math.max(0, 15 - (model.costMultiplier * 10));
    score += costScore;

    // Reliability (0-10 points)
    score += provider.reliability * 10;

    // Speed (0-5 points) - faster = higher score
    const speedScore = Math.max(0, 5 - (provider.avgResponseTime / 1000));
    score += speedScore;

    // Plan-based bonuses
    if (request.userPlan === 'ENTERPRISE') {
      score += 5; // Enterprise gets small bonus for premium models
    } else if (request.userPlan === 'FREE' && model.costMultiplier <= 0.5) {
      score += 3; // Free users get bonus for cheaper models
    }

    // Priority adjustments
    if (request.priority === 'high' && provider.avgResponseTime < 2000) {
      score += 3;
    }

    return Math.min(100, Math.max(0, score));
  }

  // Check if model is suitable for task type
  private isModelSuitableForTask(model: ModelConfig, taskType: TaskType): boolean {
    // Strong preference for models that excel at this task
    if (model.strengths.includes(taskType)) return true;
    
    // Avoid models that are weak at this task
    if (model.weaknesses?.includes(taskType)) return false;
    
    // Check general compatibility
    const taskCategories = {
      blockchain: [TaskType.SMART_CONTRACTS, TaskType.DEFI_PROTOCOLS, TaskType.NFT_SYSTEMS],
      web: [TaskType.WEB_DEVELOPMENT, TaskType.MOBILE_DEVELOPMENT],
      backend: [TaskType.BACKEND_API, TaskType.DATABASE_DESIGN],
      security: [TaskType.SECURITY_AUDIT, TaskType.VULNERABILITY_SCAN, TaskType.PENETRATION_TEST],
      devops: [TaskType.DEPLOYMENT, TaskType.CI_CD, TaskType.INFRASTRUCTURE],
      analysis: [TaskType.CODE_REVIEW, TaskType.DEBUGGING, TaskType.DATA_ANALYSIS]
    };

    // Models with code generation capability can handle most tasks
    return model.capabilities.includes(ModelCapability.CODE_GENERATION);
  }

  // Check if provider is allowed for user plan
  private isProviderAllowed(provider: ModelProvider, userPlan: PlanType): boolean {
    // All users can access all providers, but with different rate limits
    return true;
  }

  // Estimate cost for request
  private estimateCost(model: ModelConfig, request: RoutingRequest): number {
    const estimatedInputTokens = Math.ceil(request.prompt.length / 4); // Rough estimate
    const estimatedOutputTokens = 1000; // Conservative estimate
    
    const provider = this.providers.get(model.provider)!;
    const inputCost = estimatedInputTokens * provider.costPerToken.input;
    const outputCost = estimatedOutputTokens * provider.costPerToken.output;
    
    return (inputCost + outputCost) * model.costMultiplier;
  }

  // Generate human-readable reasoning
  private generateReasoning(selected: any, request: RoutingRequest): string {
    const reasons = [];
    
    if (selected.model.strengths.includes(request.taskType)) {
      reasons.push(`${selected.model.displayName} excels at ${request.taskType.replace('_', ' ')}`);
    }
    
    if (selected.model.costMultiplier <= 0.5) {
      reasons.push('cost-effective option');
    }
    
    if (selected.provider.avgResponseTime < 2000) {
      reasons.push('fast response time');
    }
    
    if (selected.provider.reliability > 0.95) {
      reasons.push('high reliability');
    }

    return `Selected for: ${reasons.join(', ')}. Confidence: ${Math.round(selected.score)}/100`;
  }

  // Load performance history (simplified)
  private loadPerformanceHistory() {
    // TODO: Load from database
    console.log('Loading performance history...');
  }

  // Get available models
  getAvailableModels(): ModelConfig[] {
    return Array.from(this.modelCache.values());
  }

  // Get provider by ID
  getProvider(id: string): ModelProvider | undefined {
    return this.providers.get(id);
  }
}

interface PerformanceMetric {
  timestamp: Date;
  responseTime: number;
  success: boolean;
  cost: number;
  quality: number;
}