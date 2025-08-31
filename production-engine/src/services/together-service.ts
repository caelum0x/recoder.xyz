/**
 * Together.ai Service - Free Tier AI Integration
 * Free models for non-paying users to compete with other platforms
 * Cost optimization strategy: Free tier → Together.ai, Paid tier → OpenRouter
 */

import { logger } from '../utils/logger';

export interface TogetherConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
}

export interface TogetherModel {
  id: string;
  name: string;
  provider: string;
  context_length: number;
  capabilities: string[];
  cost: 'free' | 'paid';
  bestFor: string[];
}

// Free models from Together.ai for our free tier users
export const TOGETHER_FREE_MODELS: TogetherModel[] = [
  {
    id: 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo',
    name: 'Meta Llama 3.3 70B Instruct Turbo',
    provider: 'meta',
    context_length: 128000,
    capabilities: ['coding', 'reasoning', 'general'],
    cost: 'free',
    bestFor: ['general coding', 'explanations', 'basic projects']
  },
  {
    id: 'deepseek-ai/deepseek-r1-distill-llama-70b',
    name: 'DeepSeek R1 Distill Llama 70B',
    provider: 'deepseek',
    context_length: 64000,
    capabilities: ['reasoning', 'problem-solving', 'coding'],
    cost: 'free',
    bestFor: ['complex reasoning', 'algorithm design', 'debugging']
  },
  {
    id: 'LG-AI-EXAONE/EXAONE-3.5-32B-Instruct',
    name: 'EXAONE 3.5 32B Instruct',
    provider: 'lg-ai',
    context_length: 32000,
    capabilities: ['coding', 'analysis', 'multilingual'],
    cost: 'free',
    bestFor: ['code analysis', 'documentation', 'multilingual projects']
  },
  {
    id: 'LG-AI-EXAONE/EXAONE-Deep-32B',
    name: 'EXAONE Deep 32B',
    provider: 'lg-ai',
    context_length: 32000,
    capabilities: ['deep-reasoning', 'complex-analysis'],
    cost: 'free',
    bestFor: ['complex problem solving', 'architectural decisions']
  },
  {
    id: 'meta-llama/Llama-Vision-Free',
    name: 'Meta Llama Vision Free',
    provider: 'meta',
    context_length: 32000,
    capabilities: ['vision', 'multimodal', 'image-analysis'],
    cost: 'free',
    bestFor: ['UI/UX analysis', 'image processing', 'design feedback']
  }
];

export interface GenerationRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
}

export interface GenerationResponse {
  success: boolean;
  content?: string;
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: string;
}

class TogetherService {
  private config: TogetherConfig;
  private isConfigured: boolean = false;

  constructor() {
    this.config = {
      apiKey: process.env.TOGETHER_API_KEY || '',
      baseUrl: 'https://api.together.xyz/v1',
      timeout: 30000,
      maxRetries: 3
    };

    this.isConfigured = !!this.config.apiKey;
    
    if (this.isConfigured) {
      logger.info('🤝 Together.ai service initialized for free tier users');
    } else {
      logger.warn('⚠️ Together.ai API key not configured - free tier will be limited');
    }
  }

  /**
   * Generate code using Together.ai free models
   */
  async generateCode(request: GenerationRequest): Promise<GenerationResponse> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Together.ai not configured - please add TOGETHER_API_KEY to environment'
      };
    }

    try {
      logger.info(`🤝 Generating code with Together.ai model: ${request.model}`);

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          max_tokens: request.max_tokens || 4000,
          temperature: request.temperature || 0.7,
          top_p: request.top_p || 0.9,
          stream: false
        }),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Together.ai API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from Together.ai API');
      }

      const content = data.choices[0].message.content;
      
      logger.info(`✅ Together.ai generation successful: ${content.length} characters generated`);

      return {
        success: true,
        content,
        model: request.model,
        usage: data.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };

    } catch (error: any) {
      logger.error(`❌ Together.ai generation failed: ${error.message}`);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Select best free model for coding task
   */
  selectBestFreeModel(taskType: 'coding' | 'reasoning' | 'analysis' | 'multimodal' = 'coding'): string {
    const suitableModels = TOGETHER_FREE_MODELS.filter(model => 
      model.capabilities.includes(taskType) || 
      model.bestFor.some(use => use.includes(taskType))
    );

    if (suitableModels.length === 0) {
      // Default fallback to the most general model
      return TOGETHER_FREE_MODELS[0].id;
    }

    // Prioritize by context length for coding tasks
    if (taskType === 'coding') {
      return suitableModels.sort((a, b) => b.context_length - a.context_length)[0].id;
    }

    // For reasoning tasks, prefer DeepSeek
    if (taskType === 'reasoning') {
      const deepSeekModel = suitableModels.find(m => m.provider === 'deepseek');
      return deepSeekModel?.id || suitableModels[0].id;
    }

    return suitableModels[0].id;
  }

  /**
   * Get available free models
   */
  getAvailableModels(): TogetherModel[] {
    return TOGETHER_FREE_MODELS;
  }

  /**
   * Health check for Together.ai service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    configured: boolean;
    modelsAvailable: number;
    latency?: number;
  }> {
    if (!this.isConfigured) {
      return {
        status: 'unhealthy',
        configured: false,
        modelsAvailable: 0
      };
    }

    try {
      const startTime = Date.now();
      
      // Quick test with minimal request
      const testResponse = await this.generateCode({
        model: this.selectBestFreeModel('coding'),
        messages: [
          { role: 'user', content: 'return "test"' }
        ],
        max_tokens: 10,
        temperature: 0
      });

      const latency = Date.now() - startTime;

      if (testResponse.success) {
        return {
          status: 'healthy',
          configured: true,
          modelsAvailable: TOGETHER_FREE_MODELS.length,
          latency
        };
      } else {
        return {
          status: 'degraded',
          configured: true,
          modelsAvailable: TOGETHER_FREE_MODELS.length,
          latency
        };
      }

    } catch (error: any) {
      logger.error(`Together.ai health check failed: ${error.message}`);
      
      return {
        status: 'unhealthy',
        configured: true,
        modelsAvailable: 0
      };
    }
  }

  /**
   * Check if service is properly configured
   */
  isServiceConfigured(): boolean {
    return this.isConfigured;
  }

  /**
   * Format prompt for coding tasks
   */
  formatCodingPrompt(description: string, projectType: string = 'react'): Array<{role: 'system' | 'user'; content: string}> {
    return [
      {
        role: 'system',
        content: `You are an expert ${projectType} developer. Generate clean, production-ready code with proper error handling, TypeScript types, and best practices. Include comments for complex logic.`
      },
      {
        role: 'user',
        content: `Create ${projectType} code for: ${description}

Requirements:
- Use TypeScript if applicable
- Include proper error handling
- Add helpful comments
- Follow modern best practices
- Make it production-ready

Generate complete, working code:`
      }
    ];
  }
}

// Singleton instance
export const togetherService = new TogetherService();
