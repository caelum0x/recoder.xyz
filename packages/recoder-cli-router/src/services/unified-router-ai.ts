/**
 * Unified Router AI Service for Recoder CLI Router
 * 
 * Integrates the extension's proven API system with the CLI router,
 * providing intelligent routing across multiple AI providers with cost optimization.
 */

import { buildApiHandler, type ApiHandler } from '../api';
import { routerBackendClient, type RequestUsage } from './backend-client';
import type { ProviderSettings } from '../api/providers/types';

export interface RouterAIOptions {
  preferredProvider?: string;
  maxTokens?: number;
  temperature?: number;
  priority?: 'cost' | 'quality' | 'speed';
  contextType?: 'default' | 'background' | 'think' | 'longContext' | 'webSearch';
}

export interface RouterAIResponse {
  content: string;
  model: string;
  provider: string;
  tokens: {
    input: number;
    output: number;
  };
  cost?: number;
  quotaInfo?: {
    used: number;
    total: number;
    remaining: number;
  };
}

export interface RouterConfig {
  enabled: boolean;
  providers: {
    [key: string]: {
      enabled: boolean;
      priority: number;
      maxConcurrent: number;
      costPerToken: number;
    };
  };
  routing: {
    default: string;
    background: string;
    think: string;
    longContext: string;
    webSearch: string;
  };
}

export class UnifiedRouterAI {
  private handlers: Map<string, ApiHandler> = new Map();
  private config: RouterConfig;
  private initialized = false;

  constructor() {
    this.config = this.loadRouterConfig();
    this.initializeHandlers();
  }

  /**
   * Load router configuration from file or environment
   */
  private loadRouterConfig(): RouterConfig {
    // Default configuration - can be overridden by config file
    return {
      enabled: true,
      providers: {
        openrouter: { enabled: true, priority: 1, maxConcurrent: 5, costPerToken: 0.00001 },
        ollama: { enabled: true, priority: 2, maxConcurrent: 3, costPerToken: 0.0 },
        anthropic: { enabled: true, priority: 3, maxConcurrent: 2, costPerToken: 0.00003 },
        gemini: { enabled: true, priority: 4, maxConcurrent: 4, costPerToken: 0.000001 },
        groq: { enabled: true, priority: 5, maxConcurrent: 5, costPerToken: 0.000001 },
        deepseek: { enabled: true, priority: 6, maxConcurrent: 3, costPerToken: 0.000001 }
      },
      routing: {
        default: 'openrouter',
        background: 'ollama',
        think: 'anthropic',
        longContext: 'gemini',
        webSearch: 'openrouter'
      }
    };
  }

  /**
   * Initialize API handlers with router-specific configurations
   */
  private async initializeHandlers(): Promise<void> {
    if (this.initialized) return;

    try {
      const configs = this.buildRouterProviderConfigs();
      
      for (const [name, settings] of configs) {
        if (!this.config.providers[name]?.enabled) {
          console.log(`⏭️ Skipping disabled provider: ${name}`);
          continue;
        }

        try {
          const handler = buildApiHandler(settings);
          this.handlers.set(name, handler);
          console.log(`✅ Router initialized ${name} handler`);
        } catch (error) {
          console.warn(`⚠️ Failed to initialize ${name}:`, error);
        }
      }

      console.log(`🚀 Router AI initialized with ${this.handlers.size} handlers`);
      this.initialized = true;
      
    } catch (error) {
      console.error('Failed to initialize router AI:', error);
    }
  }

  /**
   * Build provider configurations for router environment
   */
  private buildRouterProviderConfigs(): Map<string, ProviderSettings> {
    const configs = new Map<string, ProviderSettings>();

    // OpenRouter - best for routing diverse requests
    if (process.env.OPENROUTER_API_KEY) {
      configs.set('openrouter', {
        apiProvider: 'openrouter',
        openRouterApiKey: process.env.OPENROUTER_API_KEY,
        openRouterModelId: 'anthropic/claude-3.5-sonnet',
        openRouterUseMiddleOutTransform: true
      });
    }

    // Ollama - local, free, great for background tasks
    configs.set('ollama', {
      apiProvider: 'ollama',
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      ollamaModelId: 'llama3.2:latest'
    });

    // Anthropic - high quality for complex reasoning
    if (process.env.ANTHROPIC_API_KEY) {
      configs.set('anthropic', {
        apiProvider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        apiModelId: 'claude-3-5-sonnet-20241022'
      });
    }

    // Gemini - excellent for long context
    if (process.env.GOOGLE_API_KEY) {
      configs.set('gemini', {
        apiProvider: 'gemini',
        geminiApiKey: process.env.GOOGLE_API_KEY,
        geminiModelId: 'gemini-2.0-flash-exp'
      });
    }

    // Groq - very fast for quick responses
    if (process.env.GROQ_API_KEY) {
      configs.set('groq', {
        apiProvider: 'groq',
        groqApiKey: process.env.GROQ_API_KEY,
        groqModelId: 'llama-3.1-70b-versatile'
      });
    }

    // DeepSeek - cost effective reasoning
    if (process.env.DEEPSEEK_API_KEY) {
      configs.set('deepseek', {
        apiProvider: 'deepseek',
        deepSeekApiKey: process.env.DEEPSEEK_API_KEY,
        deepSeekModelId: 'deepseek-r1'
      });
    }

    return configs;
  }

  /**
   * Route request to optimal provider based on context and configuration
   */
  async routeRequest(
    prompt: string,
    options: RouterAIOptions = {}
  ): Promise<RouterAIResponse> {
    await this.initializeHandlers();

    // Check quota and authentication
    const quotaCheck = await routerBackendClient.processRequest(
      prompt,
      'auto-selected',
      'code'
    );

    if (!quotaCheck.allowed) {
      throw new Error('Request not allowed: quota exceeded or authentication required');
    }

    try {
      // Select optimal provider based on context and routing rules
      const selectedProvider = this.selectProviderByContext(options);
      const handler = this.handlers.get(selectedProvider);

      if (!handler) {
        throw new Error(`Provider ${selectedProvider} not available`);
      }

      // Build messages for the selected provider
      const messages = this.buildRouterMessages(prompt, options);
      
      // Execute request
      let fullContent = '';
      let usage = { inputTokens: 0, outputTokens: 0, totalCost: 0 };
      let modelUsed = 'unknown';

      const stream = handler.createMessage(messages.systemPrompt, messages.userMessages, {
        taskId: `router-${Date.now()}`,
        mode: 'router-processing'
      });

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullContent += chunk.text;
        } else if (chunk.type === 'usage') {
          usage = {
            inputTokens: chunk.inputTokens || 0,
            outputTokens: chunk.outputTokens || 0,
            totalCost: chunk.totalCost || 0
          };
        }
      }

      const modelInfo = handler.getModel();
      modelUsed = modelInfo.id;

      // Track usage with backend
      await routerBackendClient.trackUsage({
        platform: 'router',
        command: options.contextType || 'default',
        tokens: usage.inputTokens + usage.outputTokens,
        model: modelUsed,
        timestamp: new Date()
      });

      // Get quota info
      const session = routerBackendClient.getCurrentSession();
      const quotaInfo = session ? {
        used: session.quotas.usedRequests,
        total: session.quotas.totalRequests,
        remaining: session.quotas.totalRequests - session.quotas.usedRequests
      } : undefined;

      console.log(`✅ Router processed via ${selectedProvider} (${modelUsed})`);
      console.log(`📊 Tokens: ${usage.inputTokens} in, ${usage.outputTokens} out`);
      if (quotaInfo) {
        console.log(`🎯 Quota: ${quotaInfo.remaining}/${quotaInfo.total} remaining`);
      }

      return {
        content: fullContent,
        model: modelUsed,
        provider: selectedProvider,
        tokens: {
          input: usage.inputTokens,
          output: usage.outputTokens
        },
        cost: usage.totalCost,
        quotaInfo
      };

    } catch (error) {
      console.error('Router request failed:', error);
      throw error;
    }
  }

  /**
   * Select provider based on context type and routing rules
   */
  private selectProviderByContext(options: RouterAIOptions): string {
    const contextType = options.contextType || 'default';
    
    // Use routing configuration
    let preferredProvider = this.config.routing[contextType as keyof typeof this.config.routing];
    
    // Override with user preference
    if (options.preferredProvider && this.handlers.has(options.preferredProvider)) {
      preferredProvider = options.preferredProvider;
    }

    // Apply priority-based selection
    if (options.priority) {
      preferredProvider = this.selectByPriority(options.priority);
    }

    // Ensure provider is available
    if (!this.handlers.has(preferredProvider)) {
      // Fallback to first available provider
      const availableProviders = Array.from(this.handlers.keys());
      if (availableProviders.length > 0) {
        preferredProvider = availableProviders[0];
        console.warn(`⚠️ Fallback to ${preferredProvider} (original not available)`);
      } else {
        throw new Error('No AI providers available');
      }
    }

    return preferredProvider;
  }

  /**
   * Select provider based on priority (cost, quality, speed)
   */
  private selectByPriority(priority: 'cost' | 'quality' | 'speed'): string {
    const availableProviders = Array.from(this.handlers.keys());
    
    const priorityMap = {
      cost: ['ollama', 'deepseek', 'gemini', 'groq', 'openrouter', 'anthropic'],
      quality: ['anthropic', 'openrouter', 'gemini', 'deepseek', 'groq', 'ollama'],
      speed: ['groq', 'gemini', 'ollama', 'openrouter', 'deepseek', 'anthropic']
    };

    const preferenceOrder = priorityMap[priority];
    
    for (const provider of preferenceOrder) {
      if (availableProviders.includes(provider)) {
        return provider;
      }
    }

    return availableProviders[0]; // Fallback
  }

  /**
   * Build messages for router context
   */
  private buildRouterMessages(prompt: string, options: RouterAIOptions): {
    systemPrompt: string;
    userMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } {
    const contextType = options.contextType || 'default';
    
    const systemPrompts = {
      default: `You are Recoder, an AI that generates REAL, PRODUCTION-READY code. Never create mock implementations.

CORE PRINCIPLES:
1. Generate ACTUAL working code with real functionality
2. Include proper error handling and validation
3. Use real API integrations and database operations
4. Include comprehensive TypeScript types
5. Generate working implementations, not placeholders
6. Add proper security measures
7. Use environment variables for configuration`,

      background: `You are Recoder running in background mode. Provide concise, efficient responses focused on practical solutions.

BACKGROUND MODE PRINCIPLES:
1. Prioritize speed and efficiency
2. Generate minimal but complete solutions
3. Focus on core functionality
4. Minimize token usage while maintaining quality`,

      think: `You are Recoder in deep thinking mode. Take time to analyze the problem thoroughly before providing a comprehensive solution.

THINKING MODE PRINCIPLES:
1. Break down complex problems step by step
2. Consider multiple approaches and trade-offs
3. Provide detailed explanations and reasoning
4. Generate robust, well-architected solutions`,

      longContext: `You are Recoder processing a long-context request. Handle large amounts of information systematically.

LONG CONTEXT PRINCIPLES:
1. Process information in logical chunks
2. Maintain context across long discussions
3. Summarize key points when appropriate
4. Handle complex multi-part requirements`,

      webSearch: `You are Recoder with web search capabilities. Provide up-to-date information and current best practices.

WEB SEARCH PRINCIPLES:
1. Acknowledge current trends and latest technologies
2. Provide real-world examples and use cases
3. Include links to documentation when relevant
4. Consider recent changes in the ecosystem`
    };

    const systemPrompt = systemPrompts[contextType as keyof typeof systemPrompts] || systemPrompts.default;

    const userMessages = [
      {
        role: 'user' as const,
        content: prompt
      }
    ];

    return { systemPrompt, userMessages };
  }

  /**
   * Get router status and available providers
   */
  getRouterStatus(): {
    enabled: boolean;
    availableProviders: string[];
    config: RouterConfig;
    quotaInfo?: any;
  } {
    const session = routerBackendClient.getCurrentSession();
    
    return {
      enabled: this.config.enabled,
      availableProviders: Array.from(this.handlers.keys()),
      config: this.config,
      quotaInfo: session ? {
        user: session.email,
        plan: session.plan,
        used: session.quotas.usedRequests,
        total: session.quotas.totalRequests,
        remaining: session.quotas.totalRequests - session.quotas.usedRequests,
        resetDate: session.quotas.resetDate
      } : undefined
    };
  }

  /**
   * Update router configuration
   */
  updateConfig(newConfig: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('📝 Router configuration updated');
    
    // Reinitialize if providers changed
    if (newConfig.providers) {
      this.initialized = false;
      this.initializeHandlers();
    }
  }

  /**
   * Test provider connectivity
   */
  async testProviders(): Promise<{ [provider: string]: boolean }> {
    await this.initializeHandlers();
    
    const results: { [provider: string]: boolean } = {};
    
    for (const [name, handler] of this.handlers) {
      try {
        // Simple test message
        const testMessages = [{
          role: 'user' as const,
          content: 'Hello, respond with just "OK"'
        }];

        const stream = handler.createMessage('You are a test assistant.', testMessages, {
          taskId: `test-${Date.now()}`,
          mode: 'connectivity-test'
        });

        let hasResponse = false;
        for await (const chunk of stream) {
          if (chunk.type === 'text' && chunk.text.length > 0) {
            hasResponse = true;
            break;
          }
        }

        results[name] = hasResponse;
        console.log(`${hasResponse ? '✅' : '❌'} ${name} connectivity test`);
        
      } catch (error) {
        results[name] = false;
        console.log(`❌ ${name} connectivity test failed:`, error);
      }
    }

    return results;
  }
}

// Export singleton for router usage
export const unifiedRouterAI = new UnifiedRouterAI();
export default unifiedRouterAI;