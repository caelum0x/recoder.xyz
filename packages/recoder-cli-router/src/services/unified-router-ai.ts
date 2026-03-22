/**
 * Unified Router AI Service for Recoder CLI Router
 * 
 * Integrates the extension's proven API system with the CLI router,
 * providing intelligent routing across multiple AI providers with cost optimization.
 */

import { buildApiHandler, type ApiHandler } from '../api';
import { routerBackendClient } from './backend-client';
import type { ApiHandlerOptions } from 'recoder-shared';
import { executionPipeline } from '../integrations/execution-pipeline';
import type { AgentId } from '../integrations/a2a-bridge';

export interface RouterAIOptions {
  preferredProvider?: string;
  maxTokens?: number;
  temperature?: number;
  priority?: 'cost' | 'quality' | 'speed';
  contextType?: 'default' | 'background' | 'think' | 'longContext' | 'webSearch';
  /** Run code blocks from the response in a Daytona sandbox */
  autoExecute?: boolean;
  /** Delegate to another agent if the task is better suited for it */
  autoDelegate?: boolean;
  /** Explicitly run a command in a Daytona sandbox */
  sandboxCommand?: string;
  /** Explicitly delegate to a specific agent */
  delegateTo?: AgentId;
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
  /** Execution pipeline result (sandbox or A2A delegation) */
  execution?: ExecutionResult;
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
   * Updated to prioritize OpenRouter with our API key for monetization
   */
  private loadRouterConfig(): RouterConfig {
    // Monetization-focused configuration - OpenRouter first with our API key
    return {
      enabled: true,
      providers: {
        // OpenRouter is now primary provider using our API key for monetization
        openrouter: { 
          enabled: true, 
          priority: 1, 
          maxConcurrent: 10, 
          costPerToken: 0.00001,
        },
        // Ollama disabled in production to force subscription revenue
        ollama: { enabled: false, priority: 9, maxConcurrent: 0, costPerToken: 0.0 },
        // Other providers as fallback only if OpenRouter fails
        anthropic: { enabled: false, priority: 8, maxConcurrent: 1, costPerToken: 0.00003 },
        gemini: { enabled: false, priority: 7, maxConcurrent: 1, costPerToken: 0.000001 },
        groq: { enabled: false, priority: 6, maxConcurrent: 1, costPerToken: 0.000001 },
        deepseek: { enabled: false, priority: 5, maxConcurrent: 1, costPerToken: 0.000001 }
      },
      routing: {
        // All requests route to OpenRouter for consistent monetization
        default: 'openrouter',
        background: 'openrouter',
        think: 'openrouter',
        longContext: 'openrouter',
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
      
      for (const [name, settings] of configs.entries()) {
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
  private buildRouterProviderConfigs(): Map<string, ApiHandlerOptions> {
    const configs = new Map<string, ApiHandlerOptions>();

    // OpenRouter - PRIMARY provider using our API key for monetization
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    configs.set('openrouter', {
      apiProvider: 'openrouter' as const,
      openRouterApiKey: openRouterApiKey,
      // Use Claude Sonnet 4 as default for best quality
      openRouterModelId: 'anthropic/claude-3.5-sonnet',
      openRouterUseMiddleOutTransform: true,
      // Smart model selection for 60/25/15% cost optimization
      openRouterModels: [
        // FREE TIER (for free users)
        'deepseek/deepseek-v3-0324-free',   // Free DeepSeek V3
        'deepseek/deepseek-r1-0528-free',   // Free R1 0528
        
        // COST-EFFECTIVE TIER (60% of paid traffic)
        'deepseek/deepseek-v3-0324',        // $2.19/1M - Best value
        'meta-llama/llama-3.3-70b-instruct', // $0.79/1M - Very cheap
        'microsoft/wizardlm-2-8x22b',       // $1.00/1M - Good quality
        
        // BALANCED TIER (25% of paid traffic)  
        'google/gemini-2.5-flash',          // $0.30/1M - Fast & cheap
        'google/gemini-2.0-flash',          // $0.30/1M - Reliable
        'qwen/qwq-32b-preview',             // $1.00/1M - Code specialist
        
        // PREMIUM TIER (15% of paid traffic)
        'anthropic/claude-4-sonnet',        // $15/1M - Best quality
        'anthropic/claude-3.5-sonnet',      // $15/1M - Proven quality
        'google/gemini-2.5-pro'             // $7.50/1M - Professional
      ]
    });

    // Ollama - local, free, great for background tasks
    configs.set('ollama', {
      apiProvider: 'ollama' as const,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      ollamaModelId: 'llama3.2:latest'
    });

    // Anthropic - high quality for complex reasoning
    if (process.env.ANTHROPIC_API_KEY) {
      configs.set('anthropic', {
        apiProvider: 'anthropic' as const,
        apiKey: process.env.ANTHROPIC_API_KEY,
        apiModelId: 'claude-3-5-sonnet-20241022'
      });
    }

    // Gemini - excellent for long context
    if (process.env.GOOGLE_API_KEY) {
      configs.set('gemini', {
        apiProvider: 'gemini' as const,
        geminiApiKey: process.env.GOOGLE_API_KEY,
        geminiModelId: 'gemini-2.0-flash-exp'
      });
    }

    // Groq - very fast for quick responses
    if (process.env.GROQ_API_KEY) {
      configs.set('groq', {
        apiProvider: 'groq' as const,
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

      // Run execution pipeline (sandbox / A2A) if requested
      let execution: ExecutionResult | undefined;
      if (options.sandboxCommand || options.delegateTo || options.autoExecute || options.autoDelegate) {
        try {
          execution = await executionPipeline.process({
            prompt: options.sandboxCommand ? prompt : fullContent,
            autoExecute: options.autoExecute,
            autoDelegate: options.autoDelegate,
            sandboxCommand: options.sandboxCommand,
            delegateTo: options.delegateTo,
          });
          if (execution.executed) {
            console.log(`⚡ Execution pipeline: ${execution.summary}`);
          }
        } catch (error: any) {
          console.warn(`⚠️ Execution pipeline error: ${error.message}`);
        }
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
        quotaInfo,
        execution,
      };

    } catch (error) {
      console.error('Router request failed:', error);
      throw error;
    }
  }

  /**
   * Select provider and model with smart routing for cost optimization
   * Implements 60/25/15% distribution for maximum profit
   */
  private selectProviderByContext(options: RouterAIOptions): string {
    // Always use OpenRouter for smart model selection unless specifically overridden
    let preferredProvider = 'openrouter';
    
    // Override with user preference if valid
    if (options.preferredProvider && this.handlers.has(options.preferredProvider)) {
      preferredProvider = options.preferredProvider;
    }

    // Apply priority-based fallback selection
    if (options.priority && !this.handlers.has(preferredProvider)) {
      preferredProvider = this.selectByPriority(options.priority);
    }

    // Ensure provider is available
    if (!this.handlers.has(preferredProvider)) {
      // Fallback to first available provider
      const availableProviders = Array.from(this.handlers.keys());
      if (availableProviders.length > 0) {
        preferredProvider = availableProviders[0];
        console.warn(`⚠️ Fallback to ${preferredProvider} (OpenRouter not available)`);
      } else {
        throw new Error('No AI providers available');
      }
    }

    return preferredProvider;
  }

  /**
   * Select provider based on priority with OpenRouter preference
   * All priorities route through OpenRouter for consistent smart model selection
   */
  private selectByPriority(priority: 'cost' | 'quality' | 'speed'): string {
    const availableProviders = Array.from(this.handlers.keys());
    
    // OpenRouter handles all priorities through smart model selection
    if (availableProviders.includes('openrouter')) {
      return 'openrouter';
    }
    
    // Fallback priority maps if OpenRouter unavailable
    const priorityMap = {
      cost: ['deepseek', 'groq', 'gemini', 'ollama', 'anthropic'],
      quality: ['anthropic', 'gemini', 'deepseek', 'groq', 'ollama'],
      speed: ['groq', 'gemini', 'deepseek', 'ollama', 'anthropic']
    };

    const preferenceOrder = priorityMap[priority];
    
    for (const provider of preferenceOrder) {
      if (availableProviders.includes(provider)) {
        return provider;
      }
    }

    return availableProviders[0]; // Final fallback
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
    execution?: {
      sandbox: { configured: boolean; apiUrl: string; activeSandboxes: number };
      a2a: { configured: boolean; apiUrl: string; dockerUrl: string };
    };
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
      } : undefined,
      execution: executionPipeline.getStatus(),
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

  // ── Daytona Sandbox Methods ──

  /**
   * Run a command in a Daytona sandbox (one-shot ephemeral)
   */
  async sandboxRun(command: string, options?: { image?: string; timeoutMs?: number }): Promise<SandboxExecResult> {
    return executionPipeline.runInSandbox(command, options);
  }

  /**
   * Run a multi-file script in a Daytona sandbox
   */
  async sandboxRunScript(steps: {
    files?: Array<{ path: string; content: string }>;
    installCommand?: string;
    runCommand: string;
    image?: string;
    timeoutMs?: number;
  }): Promise<SandboxExecResult> {
    return executionPipeline.runScript(steps);
  }

  // ── A2A Agent Methods ──

  /**
   * List agents on the A2A platform
   */
  async listAgents(): Promise<A2AAgent[]> {
    return a2aBridge.listAgents();
  }

  /**
   * List tasks on the A2A platform
   */
  async listTasks(): Promise<A2ATask[]> {
    return a2aBridge.listTasks();
  }

  /**
   * Send a task to another agent
   */
  async sendTask(targetAgent: AgentId, task: string, capability?: 'execute' | 'plan' | 'edit'): Promise<A2ATask> {
    return a2aBridge.sendTask({ targetAgent, task, capability });
  }

  /**
   * Create a new agent thread with Daytona sandbox
   */
  async createAgentThread(prompt: string, agentId?: string): Promise<A2AThread> {
    return a2aBridge.createThread({ prompt, agentId });
  }

  /**
   * Get execution pipeline status (sandbox + A2A)
   */
  getExecutionStatus(): {
    sandbox: { configured: boolean; apiUrl: string; activeSandboxes: number };
    a2a: { configured: boolean; apiUrl: string; dockerUrl: string };
  } {
    return executionPipeline.getStatus();
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