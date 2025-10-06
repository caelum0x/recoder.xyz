/**
 * OpenRouter Provider Adapter
 * Enables access to FREE models: DeepSeek R1, GLM 4.5 Air, Qwen3 Coder, etc.
 */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
}

interface GenerationResponse {
  content: string;
  model: string;
  tokens?: number;
  provider: string;
}

/**
 * OpenRouter API Client
 */
export class OpenRouterProvider {
  private apiKey: string;
  private baseURL = 'https://openrouter.ai/api/v1';

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';

    if (!this.apiKey) {
      console.warn('OPENROUTER_API_KEY not configured - free models will not be available');
    }
  }

  /**
   * Generate text completion
   */
  async generate(
    messages: ChatMessage[],
    options: OpenRouterOptions
  ): Promise<GenerationResponse> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3010',
        'X-Title': 'Recoder Chat',
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 4000,
        top_p: options.topP || 1,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenRouter API error: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice) {
      throw new Error('No response from OpenRouter');
    }

    return {
      content: choice.message?.content || '',
      model: data.model || options.model,
      tokens: data.usage?.total_tokens,
      provider: 'openrouter',
    };
  }

  /**
   * Stream text completion
   */
  async *generateStream(
    messages: ChatMessage[],
    options: OpenRouterOptions
  ): AsyncGenerator<string, void, unknown> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3010',
        'X-Title': 'Recoder Chat',
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 4000,
        top_p: options.topP || 1,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenRouter API error: ${JSON.stringify(error)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                yield delta;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Check available models
   */
  async getModels(): Promise<any[]> {
    if (!this.apiKey) {
      return [];
    }

    const response = await fetch(`${this.baseURL}/models`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * Check if OpenRouter is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Singleton instance
 */
export const openRouter = new OpenRouterProvider();

/**
 * Recommended models by task
 */
export const RECOMMENDED_MODELS = {
  reasoning: 'deepseek/deepseek-r1:free',
  coding: 'qwen/qwen3-coder-480b-a35b:free',
  general: 'glm-4.5-air',
  fast: 'deepseek/deepseek-v3-0324:free',
  safe: 'microsoft/mai-ds-r1:free',
};

/**
 * Generate with automatic model selection
 */
export async function generateWithBestFreeModel(
  messages: ChatMessage[],
  task: keyof typeof RECOMMENDED_MODELS = 'general'
): Promise<GenerationResponse> {
  const model = RECOMMENDED_MODELS[task];
  return openRouter.generate(messages, { model });
}
