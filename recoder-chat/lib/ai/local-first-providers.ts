/**
 * Advanced Local-First AI Providers
 * With intelligent caching, performance optimization, and smart routing
 */

// import { aiCache } from './advanced-caching-system';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface GenerationResponse {
  content: string;
  model: string;
  provider: string;
}

/**
 * Local AI Provider Class
 */
export class LocalAIProvider {
  private ollamaBaseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  private lmStudioBaseURL = process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234';

  /**
   * Test local AI connections
   */
  async testConnections(): Promise<{ ollama: boolean; lmStudio: boolean }> {
    const status = { ollama: false, lmStudio: false };

    try {
      const ollamaResponse = await fetch(`${this.ollamaBaseURL}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      status.ollama = ollamaResponse.ok;
    } catch {
      status.ollama = false;
    }

    try {
      const lmStudioResponse = await fetch(`${this.lmStudioBaseURL}/v1/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      status.lmStudio = lmStudioResponse.ok;
    } catch {
      status.lmStudio = false;
    }

    return status;
  }

  /**
   * Generate with Ollama
   */
  async generateWithOllama(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number; model?: string } = {}
  ): Promise<GenerationResponse> {
    const prompt = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    const model = options.model || 'qwen2.5-coder:7b';

    const response = await fetch(`${this.ollamaBaseURL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature || 0.7,
          num_predict: options.maxTokens || 2000
        }
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.response,
      model,
      provider: 'ollama'
    };
  }

  /**
   * Generate with Together AI (FREE models)
   */
  async generateWithTogetherAI(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number; model?: string } = {}
  ): Promise<GenerationResponse> {
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error('Together AI API key not configured');
    }

    const model = options.model || 'deepseek-ai/deepseek-r1-distill-llama-70b';

    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      throw new Error(`Together AI error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      model,
      provider: 'together-ai'
    };
  }

  /**
   * Generate with LM Studio
   */
  async generateWithLMStudio(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<GenerationResponse> {
    const response = await fetch(`${this.lmStudioBaseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
        stream: false
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      throw new Error(`LM Studio error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      model: 'local-model',
      provider: 'lm-studio'
    };
  }

  /**
   * Smart generation with advanced caching and performance optimization
   * Priority: Cache > Local AI (free) > Together AI (free) > Error
   */
  async smartGenerate(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number; preferredModel?: string } = {}
  ): Promise<GenerationResponse> {
    const startTime = Date.now();
    
    // PRIORITY 1: Simple caching disabled for now to avoid circular deps
    // TODO: Re-enable intelligent caching after fixing circular dependencies
    
    // PRIORITY 2: Use direct model selection for now
    console.log('🚀 Using direct model selection (cache disabled)');

    let response: GenerationResponse;
    let success = false;
    
    try {
      const status = await this.testConnections();

      // PRIORITY 3: Local AI (completely free)
      if (status.ollama) {
        response = await this.generateWithOllama(messages, {
          ...options,
          model: options.preferredModel || 'qwen2.5-coder:7b'
        });
        success = true;
      } else if (status.lmStudio) {
        response = await this.generateWithLMStudio(messages, options);
        success = true;
      } else {
        // PRIORITY 4: Together AI free models (internet required but free)
        if (process.env.TOGETHER_API_KEY) {
          response = await this.generateWithTogetherAI(messages, {
            ...options,
            model: options.preferredModel || 'deepseek-ai/deepseek-r1-distill-llama-70b'
          });
          success = true;
        } else {
          throw new Error('No AI services available. Please install Ollama/LM Studio or configure Together AI API key.');
        }
      }

      // Update performance metrics (simplified)
      const responseTime = Date.now() - startTime;
      const tokens = response.content.split(' ').length;
      // TODO: Re-enable aiCache.updatePerformance when circular deps fixed

      // Cache disabled for now
      // TODO: Re-enable aiCache.setCached when circular deps fixed
      
      console.log(`⚡ Generated in ${responseTime}ms using ${response.provider}:${response.model}`);
      return response;
      
    } catch (error) {
      // Update performance metrics for failure (simplified)
      const responseTime = Date.now() - startTime;
      // TODO: Re-enable aiCache.updatePerformance when circular deps fixed
      console.log(`❌ Generation failed after ${responseTime}ms`);
      throw error;
    }
  }

  /**
   * Check if any AI is available (local or Together AI)
   */
  async isAvailable(): Promise<boolean> {
    const status = await this.testConnections();
    const hasLocal = status.ollama || status.lmStudio;
    const hasTogetherAI = !!process.env.TOGETHER_API_KEY;
    return hasLocal || hasTogetherAI;
  }
}

// Export singleton instance
export const localAI = new LocalAIProvider();

// Export model functions for compatibility with AI SDK
export async function getLocalChatModel() {
  return {
    provider: 'local-ai',
    modelId: 'local-chat',
    specificationVersion: 'v2' as const,
    supportedUrls: {},
    doGenerate: async (params: any) => {
      const { messages, ...options } = params;
      const chatMessages: ChatMessage[] = messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      }));
      
      const response = await localAI.smartGenerate(chatMessages, options);
      
      return {
        content: [{ type: 'text' as const, text: response.content }],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop' as const,
        warnings: []
      };
    },
    doStream: async function* (params: any) {
      const { messages, ...options } = params;
      const chatMessages: ChatMessage[] = messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      }));
      
      try {
        const response = await localAI.smartGenerate(chatMessages, options);
        
        // Stream the response word by word for better UX
        const words = response.content.split(' ');
        let accumulated = '';
        
        for (const word of words) {
          accumulated += (accumulated ? ' ' : '') + word;
          yield {
            type: 'text-delta',
            textDelta: word + ' '
          };
          await new Promise(resolve => setTimeout(resolve, 50)); // Small delay for streaming effect
        }
        
        yield {
          type: 'finish',
          finishReason: 'stop' as const,
          usage: { inputTokens: 0, outputTokens: words.length, totalTokens: words.length }
        };
      } catch (error) {
        yield {
          type: 'error',
          error: error instanceof Error ? error : new Error('Generation failed')
        };
      }
    }
  };
}

export async function getLocalTitleModel() {
  return {
    provider: 'local-ai',
    modelId: 'local-title',
    specificationVersion: 'v2' as const,
    supportedUrls: {},
    doGenerate: async (params: any) => {
      const { prompt } = params;
      const titleMessages: ChatMessage[] = [
        { role: 'system', content: 'Generate a short, concise title for the following content.' },
        { role: 'user', content: prompt }
      ];
      
      const response = await localAI.smartGenerate(titleMessages, { maxTokens: 50 });
      
      return {
        content: [{ type: 'text' as const, text: response.content }],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop' as const,
        warnings: []
      };
    },
    doStream: async function* (params: any) {
      const { prompt } = params;
      const titleMessages: ChatMessage[] = [
        { role: 'system', content: 'Generate a short, concise title for the following content.' },
        { role: 'user', content: prompt }
      ];
      
      try {
        const response = await localAI.smartGenerate(titleMessages, { maxTokens: 50 });
        
        yield {
          type: 'text-delta',
          textDelta: response.content
        };
        
        yield {
          type: 'finish',
          finishReason: 'stop' as const,
          usage: { inputTokens: 0, outputTokens: 10, totalTokens: 10 }
        };
      } catch (error) {
        yield {
          type: 'error',
          error: error instanceof Error ? error : new Error('Generation failed')
        };
      }
    }
  };
}

export async function getLocalReasoningModel() {
  return {
    provider: 'local-ai',
    modelId: 'local-reasoning',
    doGenerate: async (params: any) => {
      const { messages, ...options } = params;
      const reasoningMessages: ChatMessage[] = [
        { role: 'system', content: 'Think step by step and provide detailed reasoning.' },
        ...messages.map((msg: any) => ({ role: msg.role, content: msg.content }))
      ];
      
      const response = await localAI.smartGenerate(reasoningMessages, options);
      
      return {
        content: [{ type: 'text' as const, text: response.content }],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop' as const,
        warnings: []
      };
    }
  };
}

export async function getLocalArtifactModel() {
  return {
    provider: 'local-ai',
    modelId: 'local-artifact',
    doGenerate: async (params: any) => {
      const { messages, ...options } = params;
      const artifactMessages: ChatMessage[] = [
        { role: 'system', content: 'Generate clean, production-ready code without explanations.' },
        ...messages.map((msg: any) => ({ role: msg.role, content: msg.content }))
      ];
      
      const response = await localAI.smartGenerate(artifactMessages, options);
      
      return {
        content: [{ type: 'text' as const, text: response.content }],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop' as const,
        warnings: []
      };
    }
  };
}

// Default export
export default localAI;