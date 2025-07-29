/**
 * Unified OpenRouter Provider - Single API for all AI models
 * Replaces individual provider implementations with one unified interface
 */

import axios, { AxiosInstance } from 'axios';
import { Logger } from '../utils/logger';
import { aiCache } from './ai-cache';
import { modelSelector, ModelRanking } from './model-rankings';

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
  architecture: {
    modality: string;
    tokenizer: string;
    instruct_type?: string;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number;
  };
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface TaskContext {
  type: 'blockchain' | 'web' | 'mobile' | 'backend' | 'security' | 'devops' | 'general';
  complexity: 'simple' | 'medium' | 'complex';
  priority: 'speed' | 'quality' | 'cost';
  requirements?: string[];
}

export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  tokens?: {
    input: number;
    output: number;
  };
  finishReason?: string;
}

export class OpenRouterProvider {
  private client: AxiosInstance;
  private availableModels: OpenRouterModel[] = [];
  private modelMap: Map<string, string> = new Map(); // Maps provider names to OpenRouter model IDs
  
  constructor(apiKey?: string) {
    this.client = axios.create({
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://recoder.xyz',
        'X-Title': 'Recoder.xyz'
      }
    });
    
    this.initializeModelMap();
  }

  /**
   * Initialize model mapping for different providers through OpenRouter
   */
  private initializeModelMap(): void {
    // Map provider names to best OpenRouter model IDs
    this.modelMap.set('claude', 'anthropic/claude-3.5-sonnet');
    this.modelMap.set('groq', 'meta-llama/llama-3.1-70b-instruct'); 
    this.modelMap.set('gemini', 'google/gemini-2.0-flash-exp');
    this.modelMap.set('deepseek', 'deepseek/deepseek-r1');
    this.modelMap.set('qwen', 'qwen/qwen-2.5-coder-32b-instruct');
    this.modelMap.set('kimi', 'moonshot/moonshot-v1-8k');
    this.modelMap.set('mistral', 'mistralai/mistral-large');
    this.modelMap.set('together', 'meta-llama/llama-3.1-70b-instruct');
    this.modelMap.set('huggingface', 'meta-llama/llama-3.1-8b-instruct');
    this.modelMap.set('openai', 'openai/gpt-4o');
    
    // Fallback models for cost optimization
    this.modelMap.set('fast', 'meta-llama/llama-3.1-8b-instruct');
    this.modelMap.set('free', 'meta-llama/llama-3.1-8b-instruct');
    this.modelMap.set('premium', 'anthropic/claude-3.5-sonnet');
  }

  /**
   * Fetch available models from OpenRouter
   */
  async fetchAvailableModels(): Promise<OpenRouterModel[]> {
    try {
      const response = await this.client.get('/models');
      this.availableModels = response.data.data;
      Logger.info(`✅ Loaded ${this.availableModels.length} models from OpenRouter`);
      return this.availableModels;
    } catch (error: any) {
      Logger.error(`Failed to fetch OpenRouter models: ${error.message}`);
      return [];
    }
  }

  /**
   * Smart model selection based on task context
   */
  selectOptimalModel(context: TaskContext, preferredProvider?: string): string {
    // If a specific provider is requested, use its mapped model
    if (preferredProvider && this.modelMap.has(preferredProvider)) {
      return this.modelMap.get(preferredProvider)!;
    }

    // Use intelligent model selection based on rankings
    const taskTypeMapping = {
      'blockchain': 'reasoning',
      'web': 'coding',
      'mobile': 'coding', 
      'backend': 'coding',
      'security': 'reasoning',
      'devops': 'general',
      'general': 'general'
    };
    
    const modelTask = taskTypeMapping[context.type] || 'coding';
    
    // Get best models from rankings
    const bestModels = modelSelector.getBestModelForTask(modelTask, {
      prioritizePerformance: context.priority === 'quality',
      prioritizeCost: context.priority === 'cost',
      preferFreeModels: context.priority === 'cost',
      useLatestModels: true
    });

    // Map to OpenRouter model IDs
    for (const model of bestModels) {
      const openRouterModel = this.modelMap.get(model.provider);
      if (openRouterModel) {
        Logger.debug(`🎯 Selected ${openRouterModel} for ${context.type} task (${context.priority} priority)`);
        return openRouterModel;
      }
    }

    // Fallback based on priority
    if (context.priority === 'cost') {
      return this.modelMap.get('free')!;
    }
    if (context.priority === 'speed') {
      return this.modelMap.get('fast')!;
    }
    
    // Default to Claude for quality
    return this.modelMap.get('claude')!;
  }

  /**
   * Chat with AI using OpenRouter's unified API
   */
  async chat(
    messages: any[], 
    context: TaskContext, 
    options: any = {}
  ): Promise<AIResponse> {
    const model = options.model || this.selectOptimalModel(context, options.preferredProvider);
    
    // Create cache key
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    
    // Check cache first
    const cachedResponse = await aiCache.get(prompt, 'openrouter', model, options);
    if (cachedResponse) {
      Logger.info(`🎯 Cache hit for ${model} (saved API call)`);
      return {
        content: cachedResponse,
        model,
        provider: 'openrouter',
        tokens: { input: 0, output: 0 },
        finishReason: 'cached'
      };
    }

    try {
      const response = await this.client.post('/chat/completions', {
        model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 0.9,
        stream: options.stream || false,
        // Fallback models for reliability
        models: this.getFallbackModels(model)
      });

      const result: AIResponse = {
        content: response.data.choices[0].message.content,
        model: response.data.model,
        provider: 'openrouter',
        tokens: {
          input: response.data.usage.prompt_tokens,
          output: response.data.usage.completion_tokens
        },
        finishReason: response.data.choices[0].finish_reason
      };

      Logger.info(`✅ OpenRouter responded with ${result.model} (${result.tokens?.output} tokens)`);

      // Cache the response
      await aiCache.set(
        prompt,
        'openrouter',
        model,
        result.content,
        result.tokens || { input: 0, output: 0 },
        options
      );

      return result;

    } catch (error: any) {
      Logger.error(`OpenRouter API error: ${error.message}`);
      throw new Error(`OpenRouter API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Get fallback models for reliability
   */
  private getFallbackModels(primaryModel: string): string[] {
    const fallbacks: { [key: string]: string[] } = {
      'anthropic/claude-3.5-sonnet': ['anthropic/claude-3-sonnet', 'meta-llama/llama-3.1-70b-instruct'],
      'google/gemini-2.0-flash-exp': ['google/gemini-pro', 'meta-llama/llama-3.1-70b-instruct'],
      'deepseek/deepseek-r1': ['deepseek/deepseek-chat', 'meta-llama/llama-3.1-70b-instruct'],
      'qwen/qwen-2.5-coder-32b-instruct': ['qwen/qwen-2-72b-instruct', 'meta-llama/llama-3.1-70b-instruct'],
      'meta-llama/llama-3.1-70b-instruct': ['meta-llama/llama-3.1-8b-instruct', 'anthropic/claude-3-sonnet']
    };

    return fallbacks[primaryModel] || ['meta-llama/llama-3.1-8b-instruct'];
  }

  /**
   * Generate production-ready code using OpenRouter
   */
  async generateProductionCode(
    description: string,
    context: TaskContext,
    options: any = {}
  ): Promise<{
    code: string;
    files: Array<{ path: string; content: string; }>;
    instructions: string;
    tests: string;
    deployment?: string;
  }> {
    const systemPrompt = this.buildProductionSystemPrompt(context);
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate REAL, PRODUCTION-READY code for: ${description}

Requirements:
- Must be fully functional, not placeholder code
- Include actual database operations with proper CRUD
- Real API endpoints with authentication and error handling
- Proper error handling and validation
- Include tests that actually verify functionality
- Provide deployment instructions

Context: ${JSON.stringify(context, null, 2)}` }
    ];

    const response = await this.chat(messages, context, {
      maxTokens: 8000,
      temperature: 0.3,
      ...options
    });

    return this.parseCodeResponse(response.content);
  }

  private buildProductionSystemPrompt(context: TaskContext): string {
    const basePrompt = `You are a senior software engineer with 15+ years of experience building production systems. You generate REAL, WORKING CODE - never placeholder or mock implementations.

CORE PRINCIPLES:
1. All code must be production-ready and fully functional
2. Include real database operations (not mocked)
3. Real API integrations with proper error handling
4. Actual authentication and authorization
5. Comprehensive input validation and sanitization
6. Proper logging and monitoring
7. Include deployment configurations`;

    const specializations = {
      blockchain: `
BLOCKCHAIN SPECIALIZATION:
- Generate real smart contracts that compile and deploy
- Include actual token operations and DEX functionality
- Real wallet integration with proper transaction handling
- Solana/Ethereum mainnet-ready code
- Include proper security audits and gas optimization`,

      web: `
WEB DEVELOPMENT SPECIALIZATION:
- Generate complete React/Next.js applications
- Real backend APIs with database connections
- Proper state management and routing
- Production-ready styling and responsiveness
- SEO optimization and performance tuning`,

      backend: `
BACKEND SPECIALIZATION:
- Real database schemas with migrations
- Production API endpoints with rate limiting
- Proper authentication (JWT, OAuth2)
- Real payment processing integration
- Microservices architecture ready`,

      security: `
SECURITY SPECIALIZATION:
- Implement real security measures
- Input validation and XSS prevention
- SQL injection protection
- Proper secrets management
- Security audit and compliance checks`
    };

    return basePrompt + (specializations[context.type as keyof typeof specializations] || '');
  }

  private parseCodeResponse(content: string): {
    code: string;
    files: Array<{ path: string; content: string; }>;
    instructions: string;
    tests: string;
    deployment?: string;
  } {
    const files: Array<{ path: string; content: string; }> = [];
    let instructions = '';
    let tests = '';
    let deployment = '';

    // Extract code blocks and file structures
    const codeBlockRegex = /```(?:(\w+)\s+)?(?:(?:file|path):\s*(.+?)(?:\n|$))?([\s\S]*?)```/gi;
    let match;
    
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const [, language, filePath, code] = match;
      
      if (filePath) {
        files.push({
          path: filePath.trim(),
          content: code.trim()
        });
      }
    }

    // Extract sections
    const sections = content.split(/#+\s*/);
    for (const section of sections) {
      const lower = section.toLowerCase();
      if (lower.includes('instruction') || lower.includes('setup')) {
        instructions = section.substring(section.indexOf('\n') + 1);
      } else if (lower.includes('test')) {
        tests = section.substring(section.indexOf('\n') + 1);
      } else if (lower.includes('deploy')) {
        deployment = section.substring(section.indexOf('\n') + 1);
      }
    }

    return {
      code: content,
      files,
      instructions: instructions.trim(),
      tests: tests.trim(),
      deployment: deployment.trim()
    };
  }

  /**
   * Stream responses using OpenRouter
   */
  async generateStreamingResponse(
    messages: any[],
    context: TaskContext,
    options: any = {},
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const model = this.selectOptimalModel(context, options.preferredProvider);
    
    try {
      const response = await this.client.post('/chat/completions', {
        model,
        messages,
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7,
        stream: true,
        models: this.getFallbackModels(model)
      }, {
        responseType: 'stream'
      });

      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch (e) {
              // Ignore invalid JSON
            }
          }
        }
      });

    } catch (error: any) {
      Logger.error(`OpenRouter streaming error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get cost estimate for request
   */
  estimateCost(prompt: string, model: string): number {
    // Rough token estimation (4 chars = 1 token)
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = 1000; // Estimated output
    
    // OpenRouter pricing varies by model, this is a general estimate
    const pricePerMToken = {
      'anthropic/claude-3.5-sonnet': 3.00,
      'google/gemini-2.0-flash-exp': 0.075,
      'meta-llama/llama-3.1-70b-instruct': 0.50,
      'deepseek/deepseek-r1': 0.10,
      'qwen/qwen-2.5-coder-32b-instruct': 0.15
    };

    const price = pricePerMToken[model as keyof typeof pricePerMToken] || 0.50;
    return ((inputTokens + outputTokens) / 1000000) * price;
  }

  /**
   * Check if API key is available
   */
  isAvailable(): boolean {
    return !!(process.env.OPENROUTER_API_KEY);
  }

  /**
   * Get supported models
   */
  getSupportedModels(): Array<{
    id: string;
    name: string;
    provider: string;
    contextLength: number;
    pricing: { input: string; output: string; };
  }> {
    return [
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'Anthropic',
        contextLength: 200000,
        pricing: { input: '$3.00/M', output: '$15.00/M' }
      },
      {
        id: 'google/gemini-2.0-flash-exp',
        name: 'Gemini 2.0 Flash',
        provider: 'Google',
        contextLength: 1048576,
        pricing: { input: '$0.075/M', output: '$0.30/M' }
      },
      {
        id: 'deepseek/deepseek-r1',
        name: 'DeepSeek R1',
        provider: 'DeepSeek',
        contextLength: 65536,
        pricing: { input: '$0.10/M', output: '$0.40/M' }
      },
      {
        id: 'qwen/qwen-2.5-coder-32b-instruct',
        name: 'Qwen 2.5 Coder',
        provider: 'Alibaba',
        contextLength: 32768,
        pricing: { input: '$0.15/M', output: '$0.60/M' }
      },
      {
        id: 'meta-llama/llama-3.1-70b-instruct',
        name: 'Llama 3.1 70B',
        provider: 'Meta',
        contextLength: 131072,
        pricing: { input: '$0.50/M', output: '$0.50/M' }
      }
    ];
  }
}

// Export singleton instance
export const openRouterProvider = new OpenRouterProvider();