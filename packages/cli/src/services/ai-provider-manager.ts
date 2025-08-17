/**
 * AI Provider Manager - Centralized provider management
 */

export interface AIProviderConfig {
  name: string;
  endpoint: string;
  apiKey: string;
  models: string[];
  enabled: boolean;
}

export interface ProviderMetrics {
  requests: number;
  errors: number;
  latency: number;
  cost: number;
}

export class AIProviderManager {
  private static instance: AIProviderManager;
  private providers: Map<string, AIProviderConfig> = new Map();
  private metrics: Map<string, ProviderMetrics> = new Map();

  static getInstance(): AIProviderManager {
    if (!AIProviderManager.instance) {
      AIProviderManager.instance = new AIProviderManager();
    }
    return AIProviderManager.instance;
  }

  addProvider(config: AIProviderConfig) {
    this.providers.set(config.name, config);
    this.metrics.set(config.name, {
      requests: 0,
      errors: 0,
      latency: 0,
      cost: 0
    });
  }

  getProvider(name: string): AIProviderConfig | undefined {
    return this.providers.get(name);
  }

  getAllProviders(): AIProviderConfig[] {
    return Array.from(this.providers.values());
  }

  getMetrics(name: string): ProviderMetrics | undefined {
    return this.metrics.get(name);
  }

  updateMetrics(name: string, update: Partial<ProviderMetrics>) {
    const current = this.metrics.get(name);
    if (current) {
      this.metrics.set(name, { ...current, ...update });
    }
  }

  async generateCompletion(request: string | any, options: any = {}): Promise<any> {
    // Handle both string prompts and object requests
    const prompt = typeof request === 'string' ? request : request.prompt;
    
    // Implement completion generation
    return {
      text: 'Generated completion',
      model: typeof request === 'object' ? request.model : 'default',
      cost: 0.01,
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
      }
    };
  }
}

export const aiProviderManager = AIProviderManager.getInstance();