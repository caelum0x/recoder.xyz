/**
 * Unified API Adapter for Recoder CLI
 * 
 * Bridges the extension's proven API system with the CLI's existing AI Hub,
 * providing seamless integration and cost-efficient routing.
 */

import { Logger } from '../utils/logger';
import { buildApiHandler, type ApiHandler } from '../api';
import { costEfficientRouter, type TaskContext } from './cost-efficient-router';
import { recoderAIConfig } from './recoder-ai-config';
import type { ProviderSettings, AIResponse, AIMessage } from '../api/providers/types';

export interface UnifiedAPIOptions {
  preferredProvider?: string;
  maxTokens?: number;
  temperature?: number;
  includeStreaming?: boolean;
  costOptimized?: boolean;
}

export interface UnifiedAPIResult extends AIResponse {
  costInfo?: {
    estimatedCost: number;
    tier: string;
    reasoning: string;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    cacheReadTokens?: number;
    reasoningTokens?: number;
  };
}

export class UnifiedAPIAdapter {
  private handlers: Map<string, ApiHandler> = new Map();
  private initialized = false;

  constructor() {
    this.initializeHandlers();
  }

  /**
   * Initialize all available API handlers based on environment configuration
   */
  private async initializeHandlers(): Promise<void> {
    if (this.initialized) return;

    try {
      const configs = this.buildProviderConfigs();
      
      for (const [name, settings] of configs) {
        try {
          const handler = buildApiHandler(settings);
          this.handlers.set(name, handler);
          Logger.info(`✅ Initialized ${name} API handler`);
        } catch (error) {
          Logger.warn(`⚠️ Failed to initialize ${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      Logger.info(`🚀 Unified API adapter initialized with ${this.handlers.size} handlers`);
      this.initialized = true;
      
    } catch (error) {
      Logger.error('Failed to initialize unified API adapter:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Build provider configurations from environment variables
   */
  private buildProviderConfigs(): Map<string, ProviderSettings> {
    const configs = new Map<string, ProviderSettings>();

    // OpenRouter - unified access (RECOMMENDED)
    if (process.env.OPENROUTER_API_KEY) {
      configs.set('openrouter', {
        apiProvider: 'openrouter',
        openRouterApiKey: process.env.OPENROUTER_API_KEY,
        openRouterModelId: 'anthropic/claude-3.5-sonnet',
        openRouterUseMiddleOutTransform: true
      });
    }

    // Direct Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
      configs.set('anthropic', {
        apiProvider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        apiModelId: 'claude-3-5-sonnet-20241022'
      });
    }

    // Google Gemini
    if (process.env.GOOGLE_API_KEY) {
      configs.set('gemini', {
        apiProvider: 'gemini',
        geminiApiKey: process.env.GOOGLE_API_KEY,
        geminiModelId: 'gemini-2.0-flash-exp'
      });
    }

    // Groq
    if (process.env.GROQ_API_KEY) {
      configs.set('groq', {
        apiProvider: 'groq',
        groqApiKey: process.env.GROQ_API_KEY,
        groqModelId: 'llama-3.1-70b-versatile'
      });
    }

    // DeepSeek
    if (process.env.DEEPSEEK_API_KEY) {
      configs.set('deepseek', {
        apiProvider: 'deepseek',
        deepSeekApiKey: process.env.DEEPSEEK_API_KEY,
        deepSeekModelId: 'deepseek-r1'
      });
    }

    // Ollama (always available, local)
    configs.set('ollama', {
      apiProvider: 'ollama',
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      ollamaModelId: 'llama3.2:latest'
    });

    return configs;
  }

  /**
   * Generate response using cost-efficient routing
   */
  async generateResponse(
    messages: AIMessage[],
    context: TaskContext,
    options: UnifiedAPIOptions = {}
  ): Promise<UnifiedAPIResult> {
    await this.initializeHandlers();

    if (this.handlers.size === 0) {
      throw new Error('No API handlers available. Please configure API keys.');
    }

    try {
      // Use cost-efficient routing if enabled
      if (options.costOptimized !== false) {
        return await this.generateWithCostOptimization(messages, context, options);
      }

      // Direct provider selection
      const providerName = options.preferredProvider || 'openrouter';
      const handler = this.handlers.get(providerName);
      
      if (!handler) {
        throw new Error(`Provider ${providerName} not available`);
      }

      return await this.executeWithHandler(handler, messages, context, options);

    } catch (error) {
      Logger.error('Unified API generation failed:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Generate response with cost optimization
   */
  private async generateWithCostOptimization(
    messages: AIMessage[],
    context: TaskContext,
    options: UnifiedAPIOptions
  ): Promise<UnifiedAPIResult> {
    // Get optimal model selection
    const config = recoderAIConfig.getCostOptimizationConfig();
    const selection = await costEfficientRouter.selectOptimalModel(context, config);

    Logger.info(`💰 Cost-optimized selection: ${selection.model} (${selection.tier}, $${selection.estimatedCost.toFixed(4)})`);

    // Map model to available handler
    const handlerName = this.mapModelToHandler(selection.model);
    const handler = this.handlers.get(handlerName);

    if (!handler) {
      // Fallback to any available handler
      const fallbackHandler = Array.from(this.handlers.values())[0];
      if (!fallbackHandler) {
        throw new Error('No handlers available for cost-optimized generation');
      }
      
      Logger.warn(`⚠️ Fallback to available handler: ${Array.from(this.handlers.keys())[0]}`);
      return await this.executeWithHandler(fallbackHandler, messages, context, options, selection);
    }

    return await this.executeWithHandler(handler, messages, context, options, selection);
  }

  /**
   * Execute request with specific handler
   */
  private async executeWithHandler(
    handler: ApiHandler,
    messages: AIMessage[],
    context: TaskContext,
    options: UnifiedAPIOptions,
    costSelection?: { model: string; tier: string; estimatedCost: number; reasoning: string }
  ): Promise<UnifiedAPIResult> {
    try {
      // Convert messages to Anthropic format (used by unified API)
      const anthropicMessages = messages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        }));

      // Extract system prompt
      const systemPrompt = messages.find(msg => msg.role === 'system')?.content || 
        this.buildDefaultSystemPrompt(context);

      // Create stream and collect response
      let fullContent = '';
      let usage = { inputTokens: 0, outputTokens: 0, totalCost: 0, cacheReadTokens: 0, reasoningTokens: 0 };
      let modelUsed = 'unknown';

      const stream = handler.createMessage(systemPrompt, anthropicMessages, {
        taskId: `recoder-cli-${Date.now()}`,
        mode: 'production'
      });

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullContent += chunk.text;
        } else if (chunk.type === 'usage') {
          usage = {
            inputTokens: chunk.inputTokens || 0,
            outputTokens: chunk.outputTokens || 0,
            totalCost: chunk.totalCost || 0,
            cacheReadTokens: chunk.cacheReadTokens || 0,
            reasoningTokens: chunk.reasoningTokens || 0
          };
        }
      }

      // Get actual model info
      const modelInfo = handler.getModel();
      modelUsed = modelInfo.id;

      // Track usage for cost optimization
      if (costSelection) {
        await costEfficientRouter.trackUsage(modelUsed, usage.totalCost, {
          input: usage.inputTokens,
          output: usage.outputTokens
        });
      }

      const result: UnifiedAPIResult = {
        content: fullContent,
        model: modelUsed,
        provider: this.getProviderNameFromHandler(handler),
        tokens: {
          input: usage.inputTokens,
          output: usage.outputTokens
        },
        finishReason: 'stop',
        cost: usage.totalCost,
        usage
      };

      // Add cost info if using cost optimization
      if (costSelection) {
        result.costInfo = {
          estimatedCost: costSelection.estimatedCost,
          tier: costSelection.tier,
          reasoning: costSelection.reasoning
        };
      }

      return result;

    } catch (error) {
      Logger.error('Handler execution failed:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Map model ID to handler name
   */
  private mapModelToHandler(modelId: string): string {
    if (modelId.startsWith('ollama/')) return 'ollama';
    if (modelId.startsWith('anthropic/')) return this.handlers.has('openrouter') ? 'openrouter' : 'anthropic';
    if (modelId.startsWith('google/')) return this.handlers.has('openrouter') ? 'openrouter' : 'gemini';
    if (modelId.startsWith('deepseek/')) return this.handlers.has('openrouter') ? 'openrouter' : 'deepseek';
    if (modelId.startsWith('meta-llama/')) return this.handlers.has('openrouter') ? 'openrouter' : 'groq';
    
    // Default to OpenRouter if available, otherwise first available
    return this.handlers.has('openrouter') ? 'openrouter' : Array.from(this.handlers.keys())[0];
  }

  /**
   * Get provider name from handler
   */
  private getProviderNameFromHandler(handler: ApiHandler): string {
    // This is a bit hacky, but we can infer from the model info
    const modelInfo = handler.getModel();
    
    if (modelInfo.id.includes('claude')) return 'anthropic';
    if (modelInfo.id.includes('gemini')) return 'gemini';
    if (modelInfo.id.includes('llama') && !modelInfo.id.includes('ollama')) return 'groq';
    if (modelInfo.id.includes('deepseek')) return 'deepseek';
    if (modelInfo.id.includes('ollama')) return 'ollama';
    
    return 'openrouter'; // Default
  }

  /**
   * Build default system prompt based on context
   */
  private buildDefaultSystemPrompt(context: TaskContext): string {
    const basePrompt = `You are Recoder, an AI that generates REAL, PRODUCTION-READY code. Never create mock implementations.

CORE PRINCIPLES:
1. Generate ACTUAL working code with real functionality
2. Include proper error handling and validation
3. Use real API integrations and database operations
4. Include comprehensive TypeScript types
5. Generate working implementations, not placeholders
6. Add proper security measures
7. Use environment variables for configuration`;

    const taskSpecific = {
      blockchain: `\n\nBLOCKCHAIN SPECIALIZATION:
- Generate real smart contracts that compile and deploy
- Include actual token operations and DEX functionality
- Real wallet integration with proper transaction handling
- Solana/Ethereum mainnet-ready code`,
      web: `\n\nWEB DEVELOPMENT SPECIALIZATION:
- Generate complete React/Next.js applications
- Real backend APIs with database connections
- Proper state management and routing
- Production-ready styling and responsiveness`,
      backend: `\n\nBACKEND SPECIALIZATION:
- Real database schemas with migrations
- Production API endpoints with rate limiting
- Proper authentication (JWT, OAuth2)
- Real payment processing integration`,
      security: `\n\nSECURITY SPECIALIZATION:
- Implement real security measures
- Input validation and XSS prevention
- SQL injection protection
- Proper secrets management`
    };

    return basePrompt + (taskSpecific[context.type as keyof typeof taskSpecific] || '');
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get all providers with their capabilities
   */
  getAllProviders(): Array<{
    name: string;
    models: string[];
    capabilities: string[];
    cost: 'free' | 'paid' | 'mixed';
  }> {
    return Array.from(this.handlers.entries()).map(([name, handler]) => {
      const modelInfo = handler.getModel();
      
      return {
        name,
        models: [modelInfo.id],
        capabilities: this.getProviderCapabilities(name),
        cost: this.getProviderCost(name)
      };
    });
  }

  private getProviderCapabilities(name: string): string[] {
    const capabilities = {
      openrouter: ['multi-model', 'cost-optimization', 'high-quality'],
      anthropic: ['reasoning', 'complex-logic', 'security'],
      gemini: ['multimodal', 'fast-generation', 'analysis'],
      groq: ['fast-inference', 'real-time', 'cost-effective'],
      deepseek: ['reasoning', 'step-by-step', 'free-tier'],
      ollama: ['local', 'private', 'offline', 'free']
    };
    
    return capabilities[name as keyof typeof capabilities] || ['general'];
  }

  private getProviderCost(name: string): 'free' | 'paid' | 'mixed' {
    const costs = {
      openrouter: 'mixed' as const,
      anthropic: 'paid' as const,
      gemini: 'mixed' as const,
      groq: 'mixed' as const,
      deepseek: 'mixed' as const,
      ollama: 'free' as const
    };
    
    return costs[name as keyof typeof costs] || 'paid';
  }

  /**
   * Stream responses (for real-time applications)
   */
  async *streamResponse(
    messages: AIMessage[],
    context: TaskContext,
    options: UnifiedAPIOptions = {}
  ): AsyncGenerator<{ type: 'text' | 'usage' | 'error'; content: string; usage?: any }> {
    await this.initializeHandlers();

    const providerName = options.preferredProvider || 'openrouter';
    const handler = this.handlers.get(providerName);
    
    if (!handler) {
      yield { type: 'error', content: `Provider ${providerName} not available` };
      return;
    }

    try {
      const anthropicMessages = messages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        }));

      const systemPrompt = messages.find(msg => msg.role === 'system')?.content || 
        this.buildDefaultSystemPrompt(context);

      const stream = handler.createMessage(systemPrompt, anthropicMessages, {
        taskId: `recoder-cli-stream-${Date.now()}`,
        mode: 'streaming'
      });

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          yield { type: 'text', content: chunk.text };
        } else if (chunk.type === 'usage') {
          yield { type: 'usage', content: 'Usage data received', usage: chunk };
        }
      }

    } catch (error) {
      yield { 
        type: 'error', 
        content: `Streaming failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }
}

// Export singleton instance for CLI usage
export const unifiedAPI = new UnifiedAPIAdapter();