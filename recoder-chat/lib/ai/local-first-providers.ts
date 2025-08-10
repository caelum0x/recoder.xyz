/**
 * Simple Local-First AI Providers
 * Direct implementation without complex AI SDK dependencies
 */

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
   * Smart generation - automatically choose best available local AI
   */
  async smartGenerate(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number; preferredModel?: string } = {}
  ): Promise<GenerationResponse> {
    const status = await this.testConnections();

    if (status.ollama) {
      return this.generateWithOllama(messages, {
        ...options,
        model: options.preferredModel || 'qwen2.5-coder:7b'
      });
    } else if (status.lmStudio) {
      return this.generateWithLMStudio(messages, options);
    } else {
      throw new Error('No local AI services available. Please install and start Ollama or LM Studio.');
    }
  }

  /**
   * Check if any local AI is available
   */
  async isAvailable(): Promise<boolean> {
    const status = await this.testConnections();
    return status.ollama || status.lmStudio;
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