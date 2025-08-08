/**
 * Local AI Integration Service for Mobile Platform
 * Provides direct access to local AI models (Ollama/LM Studio)
 */

export interface LocalAIModel {
  id: string;
  name: string;
  provider: 'ollama' | 'lm-studio';
  status: 'available' | 'unavailable';
}

export interface LocalAIResponse {
  id: string;
  role: 'assistant';
  content: string;
  timestamp: string;
  model?: string;
}

export class LocalAIIntegration {
  private ollamaBaseURL = 'http://localhost:11434';
  private lmStudioBaseURL = 'http://localhost:1234';

  constructor() {
    // Initialize the service
  }

  async testConnection(): Promise<{
    error: string; ollama: boolean; lmStudio: boolean 
}> {
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

    return { error: '', ...status };
  }

  async getAvailableModels(): Promise<{ local: LocalAIModel[]; cloud: LocalAIModel[] }> {
    const localModels: LocalAIModel[] = [];
    const status = await this.testConnection();

    if (status.ollama) {
      try {
        const response = await fetch(`${this.ollamaBaseURL}/api/tags`);
        const data = await response.json();
        
        if (data.models) {
          data.models.forEach((model: any) => {
            localModels.push({
              id: model.name,
              name: model.name,
              provider: 'ollama',
              status: 'available'
            });
          });
        }
      } catch (error) {
        console.error('Failed to fetch Ollama models:', error);
      }
    }

    if (status.lmStudio) {
      try {
        const response = await fetch(`${this.lmStudioBaseURL}/v1/models`);
        const data = await response.json();
        
        if (data.data) {
          data.data.forEach((model: any) => {
            localModels.push({
              id: model.id,
              name: model.id,
              provider: 'lm-studio',
              status: 'available'
            });
          });
        }
      } catch (error) {
        console.error('Failed to fetch LM Studio models:', error);
      }
    }

    // Fallback models if no local AI detected
    if (localModels.length === 0) {
      localModels.push({
        id: 'qwen2.5-coder:7b',
        name: 'Qwen2.5-Coder 7B (Ollama)',
        provider: 'ollama',
        status: 'unavailable'
      });
      
      localModels.push({
        id: 'local-model',
        name: 'Local Model (LM Studio)',
        provider: 'lm-studio',
        status: 'unavailable'
      });
    }

    return {
      local: localModels,
      cloud: [] // No cloud models in mobile version
    };
  }

  async chat(
    messages: Array<{ role: string; content: string }>,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      taskType?: string;
    } = {}
  ): Promise<LocalAIResponse> {
    const status = await this.testConnection();
    const model = options.model || 'qwen2.5-coder:7b';

    try {
      if (status.ollama) {
        return await this.generateWithOllama(messages, model, options);
      } else if (status.lmStudio) {
        return await this.generateWithLMStudio(messages, options);
      } else {
        throw new Error('No local AI services available');
      }
    } catch (error) {
      console.error('Generation failed:', error);
      throw error;
    }
  }

  async *streamChat(
    messages: Array<{ role: string; content: string }>,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      taskType?: string;
    } = {}
  ): AsyncGenerator<string, void, unknown> {
    const status = await this.testConnection();
    const model = options.model || 'qwen2.5-coder:7b';

    if (status.ollama) {
      yield* this.streamWithOllama(messages, model, options);
    } else if (status.lmStudio) {
      yield* this.streamWithLMStudio(messages, options);
    } else {
      throw new Error('No local AI services available for streaming');
    }
  }

  private async generateWithOllama(
    messages: Array<{ role: string; content: string }>,
    model: string,
    options: any
  ): Promise<LocalAIResponse> {
    const prompt = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    
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
      id: Date.now().toString(),
      role: 'assistant',
      content: data.response,
      timestamp: new Date().toISOString(),
      model: model
    };
  }

  private async generateWithLMStudio(
    messages: Array<{ role: string; content: string }>,
    options: any
  ): Promise<LocalAIResponse> {
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
      id: Date.now().toString(),
      role: 'assistant',
      content: data.choices[0].message.content,
      timestamp: new Date().toISOString(),
      model: 'local-model'
    };
  }

  private async *streamWithOllama(
    messages: Array<{ role: string; content: string }>,
    model: string,
    options: any
  ): AsyncGenerator<string, void, unknown> {
    const prompt = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    
    const response = await fetch(`${this.ollamaBaseURL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
        options: {
          temperature: options.temperature || 0.7,
          num_predict: options.maxTokens || 2000
        }
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      throw new Error(`Ollama streaming error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            yield data.response;
          }
        } catch (e) {
          // Skip malformed JSON lines
        }
      }
    }
  }

  private async *streamWithLMStudio(
    messages: Array<{ role: string; content: string }>,
    options: any
  ): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.lmStudioBaseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
        stream: true
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      throw new Error(`LM Studio streaming error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() && line.startsWith('data: '));
      
      for (const line of lines) {
        try {
          const jsonStr = line.replace('data: ', '');
          if (jsonStr === '[DONE]') break;
          
          const data = JSON.parse(jsonStr);
          const content = data.choices?.[0]?.delta?.content;
          if (content) {
            yield content;
          }
        } catch (e) {
          // Skip malformed JSON lines
        }
      }
    }
  }
}

// Export singleton instance
export const localAI = new LocalAIIntegration();
export default localAI;