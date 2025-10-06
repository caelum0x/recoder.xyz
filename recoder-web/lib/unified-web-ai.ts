/**
 * Unified Web AI Integration for Recoder.xyz
 * 
 * LOCAL-FIRST PRIORITY: Free local AI (Ollama/LM Studio) → Cloud APIs
 * Integrates the extension's proven API system with the web platform,
 * providing cost-efficient AI routing for web-based code generation.
 */

// Use dynamic import for server-only API handlers
import type { ApiHandler } from './api';
import type { ProviderSettings, AIMessage, TaskContext } from './api/providers/types';
import { 
  getLocalFirstWebProvider, 
  getWebProviderStatus, 
  getWebSetupInstructions,
  hasAnyWebProvider,
  getWebProviderRecommendation
} from './api/providers/local-first-web-ai';

export interface WebGenerationOptions {
  preferredProvider?: string;
  model?: string;
  maxTokens?: number;   
  temperature?: number;
  language?: string;
  framework?: string;
  includeTests?: boolean;
  includeDocs?: boolean;
  costOptimized?: boolean;
}

export interface WebGenerationResult {
  confidence: number;
  code: string;
  explanation?: string;
  provider: string;
  model: string;
  tokens: {
    input: number;
    output: number;
  };
  cost?: number;
  metadata: {
    language: string;
    framework?: string;
    dependencies: string[];
    realFunctionality: boolean;
  };
}

export class UnifiedWebAI {
  private handlers: Map<string, ApiHandler> = new Map();
  private initialized = false;

  constructor() {
    this.initializeHandlers();
  }

  /**
   * Initialize API handlers for web environment
   */
  private async initializeHandlers(): Promise<void> {
    if (this.initialized) return;

    try {
      const configs = this.buildWebProviderConfigs();
      
      for (const [name, settings] of configs) {
        try {
          const { buildApiHandler } = await import('./api/index-browser');
          const handler = buildApiHandler(settings);
          this.handlers.set(name, handler as any); // Type assertion for browser/main ApiHandler compatibility
          console.log(`✅ Initialized ${name} web handler`);
        } catch (error) {
          console.warn(`⚠️ Failed to initialize ${name}:`, error);
        }
      }

      console.log(`🚀 Unified Web AI initialized with ${this.handlers.size} handlers`);
      this.initialized = true;
      
    } catch (error) {
      console.error('Failed to initialize unified web AI:', error);
    }
  }

  /**
   * Build provider configurations with LOCAL-FIRST priority
   */
  private buildWebProviderConfigs(): Map<string, ProviderSettings> {
    const configs = new Map<string, ProviderSettings>();

    // 🆓 PRIORITY 1: Local AI (FREE)
    const localProvider = getLocalFirstWebProvider('web');
    if (localProvider) {
      configs.set('local-first', localProvider);
    }

    // 🚀 PRIORITY 2: Get specialized providers for different tasks
    const taskTypes = ['backend', 'mobile', 'blockchain', 'security'] as const;
    for (const taskType of taskTypes) {
      const provider = getLocalFirstWebProvider(taskType);
      if (provider && provider.apiProvider !== localProvider?.apiProvider) {
        configs.set(`${taskType}-specialized`, provider);
      }
    }

    // 🔧 FALLBACK: Legacy configurations (maintained for compatibility)
    // OpenRouter - unified access
    if (process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY) {
      configs.set('openrouter-fallback', {
        apiProvider: 'openrouter',
        openRouterApiKey: process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY,
        openRouterModelId: 'anthropic/claude-3.5-sonnet',
        openRouterUseMiddleOutTransform: true
      });
    }

    // Direct Anthropic (server-side only)
    if (process.env.ANTHROPIC_API_KEY) {
      configs.set('anthropic-fallback', {
        apiProvider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        apiModelId: 'claude-3-5-sonnet-20241022'
      });
    }

    // Google Gemini
    if (process.env.NEXT_PUBLIC_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY) {
      configs.set('gemini-fallback', {
        apiProvider: 'gemini',
        geminiApiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY,
        geminiModelId: 'gemini-2.0-flash-exp'
      });
    }

    // Groq
    if (process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY) {
      configs.set('groq-fallback', {
        apiProvider: 'groq',
        groqApiKey: process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY,
        groqModelId: 'llama-3.1-70b-versatile'
      });
    }

    return configs;
  }

  /**
   * Generate code using web-optimized routing
   */
  async generateCode(
    prompt: string,
    options: WebGenerationOptions = {}
  ): Promise<WebGenerationResult> {
    await this.initializeHandlers();

    if (this.handlers.size === 0) {
      throw new Error('No AI providers available for web generation');
    }

    // Determine task context from prompt and options
    const context = this.analyzeWebTaskContext(prompt, options);
    
    // Select optimal provider for web use case
    const handlerName = this.selectWebOptimalProvider(context, options);
    const handler = this.handlers.get(handlerName);

    if (!handler) {
      throw new Error(`Provider ${handlerName} not available`);
    }

    try {
      // Build web-specific messages
      const messages = this.buildWebMessages(prompt, options);
      
      // Execute generation
      let fullContent = '';
      let usage = { inputTokens: 0, outputTokens: 0, totalCost: 0 };
      let modelUsed = 'unknown';

      const stream = handler.createMessage(messages.systemPrompt, messages.userMessages, {
        taskId: `recoder-web-${Date.now()}`,
        mode: 'web-generation'
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

      return {
        confidence: 1, // Default confidence value, adjust as needed
        code: this.extractCodeFromResponse(fullContent),
        explanation: this.extractExplanation(fullContent),
        provider: handlerName,
        model: modelUsed,
        tokens: {
          input: usage.inputTokens,
          output: usage.outputTokens
        },
        cost: usage.totalCost,
        metadata: {
          language: options.language || 'typescript',
          framework: options.framework || 'react',
          dependencies: this.extractDependencies(fullContent),
          realFunctionality: true
        }
      };

    } catch (error) {
      console.error('Web generation failed:', error);
      throw error;
    }
  }

  /**
   * Analyze task context for web generation
   */
  private analyzeWebTaskContext(prompt: string, options: WebGenerationOptions): TaskContext {
    const lowerPrompt = prompt.toLowerCase();
    
    // Determine task type
    let type: TaskContext['type'] = 'web';
    if (lowerPrompt.includes('api') || lowerPrompt.includes('backend') || lowerPrompt.includes('server')) {
      type = 'backend';
    } else if (lowerPrompt.includes('mobile') || lowerPrompt.includes('react native')) {
      type = 'mobile';
    } else if (lowerPrompt.includes('blockchain') || lowerPrompt.includes('smart contract')) {
      type = 'blockchain';
    } else if (lowerPrompt.includes('security') || lowerPrompt.includes('auth')) {
      type = 'security';
    }

    // Determine complexity
    let complexity: TaskContext['complexity'] = 'medium';
    if (lowerPrompt.includes('simple') || lowerPrompt.includes('basic')) {
      complexity = 'simple';
    } else if (lowerPrompt.includes('complex') || lowerPrompt.includes('advanced') || lowerPrompt.includes('enterprise')) {
      complexity = 'complex';
    }

    // Determine priority (web typically prefers speed and cost)
    const priority: TaskContext['priority'] = options.costOptimized ? 'cost' : 'speed';

    return {
      type,
      complexity,
      priority,
      requirements: [
        options.language || 'typescript',
        options.framework || 'react',
        ...(options.includeTests ? ['testing'] : []),
        ...(options.includeDocs ? ['documentation'] : [])
      ]
    };
  }

  /**
   * Select optimal provider for web use case with LOCAL-FIRST priority
   */
  private selectWebOptimalProvider(context: TaskContext, options: WebGenerationOptions): string {
    if (options.preferredProvider && this.handlers.has(options.preferredProvider)) {
      return options.preferredProvider;
    }

    // LOCAL-FIRST preferences (FREE models prioritized)
    const localFirstPreferences = {
      'web': ['local-first', 'backend-specialized', 'openrouter-fallback', 'groq-fallback', 'gemini-fallback', 'anthropic-fallback'],
      'backend': ['backend-specialized', 'local-first', 'openrouter-fallback', 'anthropic-fallback', 'groq-fallback', 'gemini-fallback'],
      'mobile': ['mobile-specialized', 'local-first', 'openrouter-fallback', 'gemini-fallback', 'groq-fallback', 'anthropic-fallback'],
      'blockchain': ['blockchain-specialized', 'local-first', 'openrouter-fallback', 'anthropic-fallback', 'gemini-fallback', 'groq-fallback'],
      'security': ['security-specialized', 'local-first', 'openrouter-fallback', 'anthropic-fallback', 'gemini-fallback', 'groq-fallback'],
      'devops': ['local-first', 'openrouter-fallback', 'groq-fallback', 'gemini-fallback', 'anthropic-fallback'],
      'general': ['local-first', 'openrouter-fallback', 'gemini-fallback', 'groq-fallback', 'anthropic-fallback']
    };

    const preferences = localFirstPreferences[context.type] || localFirstPreferences.web;
    
    for (const providerName of preferences) {
      if (this.handlers.has(providerName)) {
        return providerName;
      }
    }

    // Fallback to first available
    return Array.from(this.handlers.keys())[0];
  }

  /**
   * Build web-specific messages
   */
  private buildWebMessages(prompt: string, options: WebGenerationOptions): {
    systemPrompt: string;
    userMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } {
    const systemPrompt = `You are Recoder, an AI specialized in generating REAL, PRODUCTION-READY web applications. Never create mock implementations.

🆓 LOCAL-FIRST AI APPROACH:
This system prioritizes FREE local AI models (Ollama/LM Studio) over expensive cloud APIs to make AI-powered development accessible to everyone. When users have local AI available, they get unlimited usage at zero cost.

WEB DEVELOPMENT PRINCIPLES:
1. Generate complete, working React/Next.js components
2. Use modern JavaScript/TypeScript with proper types
3. Implement responsive design with Tailwind CSS
4. Include proper error handling and loading states
5. Add accessibility features (ARIA labels, semantic HTML)
6. Use real API integrations (no fake data)
7. Include proper state management (useState, useEffect, context)
8. Generate SEO-optimized components when applicable

FRAMEWORK REQUIREMENTS:
- Language: ${options.language || 'TypeScript'}
- Framework: ${options.framework || 'React/Next.js'}
- Styling: Tailwind CSS with responsive design
- State: React hooks and context API
- Testing: ${options.includeTests ? 'Jest + React Testing Library' : 'Not required'}
- Documentation: ${options.includeDocs ? 'Include JSDoc comments' : 'Basic comments only'}

QUALITY STANDARDS:
- All code must be production-ready
- Include proper error boundaries
- Implement loading and error states
- Use TypeScript interfaces for all props
- Follow React best practices and hooks rules
- Include proper SEO meta tags for pages

💡 COST-CONSCIOUS DEVELOPMENT:
Generate efficient, optimized code that works well with both free local models and premium cloud APIs. Focus on clarity and maintainability to get maximum value from AI assistance.`;

    const userMessages = [
      {
        role: 'user' as const,
        content: `Generate a complete, production-ready implementation for: ${prompt}

Requirements:
- Must be fully functional with real logic
- Include proper TypeScript types
- Responsive design with Tailwind CSS  
- Production-ready error handling
- Real API integrations (not mocked)
- Modern React patterns and hooks

Provide the response in this format:

## Explanation
[Brief explanation of the implementation approach]

## Code
\`\`\`${options.language || 'typescript'}
[Complete implementation here]
\`\`\`

## Dependencies
[List any new npm packages needed]

## Usage
[Brief usage instructions]`
      }
    ];

    return { systemPrompt, userMessages };
  }

  /**
   * Extract code from AI response
   */
  private extractCodeFromResponse(response: string): string {
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/g;
    const matches = response.match(codeBlockRegex);
    
    if (matches && matches.length > 0) {
      return matches
        .map(match => match.replace(/```(?:\w+)?\n/, '').replace(/\n```$/, ''))
        .sort((a, b) => b.length - a.length)[0]; // Return largest code block
    }
    
    return response;
  }

  /**
   * Extract explanation from response
   */
  private extractExplanation(response: string): string {
    const lines = response.split('\n');
    const explanationStart = lines.findIndex(line => line.includes('## Explanation'));
    const codeStart = lines.findIndex(line => line.includes('## Code'));
    
    if (explanationStart >= 0 && codeStart > explanationStart) {
      return lines.slice(explanationStart + 1, codeStart).join('\n').trim();
    }
    
    return 'Web component generated successfully';
  }

  /**
   * Extract dependencies from code
   */
  private extractDependencies(code: string): string[] {
    const dependencies: string[] = [];
    const importRegex = /import.*from ['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(code)) !== null) {
      const packageName = match[1];
      if (!packageName.startsWith('.') && !packageName.startsWith('/')) {
        dependencies.push(packageName.split('/')[0]);
      }
    }
    
    return [...new Set(dependencies)];
  }

  /**
   * Stream generation for real-time updates
   */
  async *streamGeneration(
    prompt: string,
    options: WebGenerationOptions = {}
  ): AsyncGenerator<{ type: 'text' | 'error' | 'complete'; content: string; metadata?: any }> {
    await this.initializeHandlers();

    const context = this.analyzeWebTaskContext(prompt, options);
    const handlerName = this.selectWebOptimalProvider(context, options);
    const handler = this.handlers.get(handlerName);

    if (!handler) {
      yield { type: 'error', content: `Provider ${handlerName} not available` };
      return;
    }

    try {
      const messages = this.buildWebMessages(prompt, options);
      
      const stream = handler.createMessage(messages.systemPrompt, messages.userMessages, {
        taskId: `recoder-web-stream-${Date.now()}`,
        mode: 'streaming'
      });

      let fullContent = '';
      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullContent += chunk.text;
          yield { type: 'text', content: chunk.text };
        } else if (chunk.type === 'usage') {
          yield { 
            type: 'complete', 
            content: fullContent,
            metadata: {
              provider: handlerName,
              model: handler.getModel().id,
              usage: chunk
            }
          };
        }
      }

    } catch (error) {
      yield { 
        type: 'error', 
        content: `Generation failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Get available providers for web with LOCAL-FIRST priority display
   */
  getAvailableProviders(): Array<{
    name: string;
    available: boolean;
    models: string[];
    cost: 'free' | 'paid' | 'mixed';
    priority: number;
  }> {
    const status = getWebProviderStatus();
    
    const providers = [
      // LOCAL (FREE) - Highest Priority
      { name: 'ollama', cost: 'free' as const, models: ['qwen2.5-coder:7b', 'codellama:13b', 'mistral:7b'], priority: 1, available: status.local.ollama },
      { name: 'lm-studio', cost: 'free' as const, models: ['local-model'], priority: 2, available: status.local.lmstudio },
      
      // CLOUD (MIXED/PAID) - Lower Priority
      { name: 'openrouter', cost: 'mixed' as const, models: ['claude-3.5-sonnet', 'gemini-2.0-flash', 'gpt-4'], priority: 3, available: status.cloud.openrouter },
      { name: 'groq', cost: 'mixed' as const, models: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant'], priority: 4, available: status.cloud.groq },
      { name: 'gemini', cost: 'mixed' as const, models: ['gemini-2.0-flash-exp'], priority: 5, available: status.cloud.gemini },
      { name: 'anthropic', cost: 'paid' as const, models: ['claude-3.5-sonnet'], priority: 6, available: status.cloud.anthropic },
      { name: 'openai', cost: 'paid' as const, models: ['gpt-4o', 'gpt-4o-mini'], priority: 7, available: status.cloud.openai },
      { name: 'xai', cost: 'paid' as const, models: ['grok-2-vision', 'grok-2'], priority: 8, available: status.cloud.xai }
    ];

    return providers.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get setup instructions for users
   */
  getSetupInstructions(): string {
    return getWebSetupInstructions();
  }

  /**
   * Get provider recommendation for task
   */
  getProviderRecommendation(taskType: string = 'web') {
    return getWebProviderRecommendation(taskType);
  }

  /**
   * Check if any provider is available
   */
  hasProviders(): boolean {
    return hasAnyWebProvider();
  }
}

// Export singleton for web usage
export const unifiedWebAI = new UnifiedWebAI();

// Convenience functions for direct usage
export const generateWebCode = async (prompt: string, options?: WebGenerationOptions): Promise<WebGenerationResult> => {
  return await unifiedWebAI.generateCode(prompt, options);
};

export const streamWebGeneration = (prompt: string, options?: WebGenerationOptions) => {
  return unifiedWebAI.streamGeneration(prompt, options);
};

export default unifiedWebAI;