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

// Export model functions for compatibility
export async function getLocalChatModel() {
  return {
    generateText: async (prompt: string, options: any = {}) => {
      const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
      const response = await localAI.smartGenerate(messages, options);
      return { text: response.content };
    }
  };
}

export async function getLocalTitleModel() {
  return {
    generateText: async (prompt: string, options: any = {}) => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'Generate a short, concise title for the following content.' },
        { role: 'user', content: prompt }
      ];
      const response = await localAI.smartGenerate(messages, { ...options, maxTokens: 50 });
      return { text: response.content };
    }
  };
}

export async function getLocalReasoningModel() {
  return {
    generateText: async (prompt: string, options: any = {}) => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'Think step by step and provide detailed reasoning.' },
        { role: 'user', content: prompt }
      ];
      const response = await localAI.smartGenerate(messages, options);
      return { text: response.content };
    }
  };
}

export async function getLocalArtifactModel() {
  return {
    generateText: async (prompt: string, options: any = {}) => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'Generate clean, production-ready code without explanations.' },
        { role: 'user', content: prompt }
      ];
      const response = await localAI.smartGenerate(messages, options);
      return { text: response.content };
    }
  };
}

// Default export
export default localAI;