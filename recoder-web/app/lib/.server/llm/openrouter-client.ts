import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('OpenRouterClient');
/**
 * OpenRouter Native Client
 * Direct API integration without AI SDK
 * Supports: Structured Outputs, Tool Calling, Streaming
 */

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface StructuredOutputSchema {
  type: 'json_schema';
  json_schema: {
    name: string;
    strict: boolean;
    schema: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  tools?: Tool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  response_format?: StructuredOutputSchema | { type: 'json_object' };
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenRouterStreamChunk {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  }>;
}

export class OpenRouterClient {
  private apiKey: string;
  private baseURL: string = 'https://openrouter.ai/api/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Create a chat completion (non-streaming)
   */
  async createChatCompletion(request: OpenRouterRequest): Promise<OpenRouterResponse> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://recoder.xyz',
        'X-Title': 'Recoder.xyz'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Create a streaming chat completion
   */
  async createStreamingChatCompletion(request: OpenRouterRequest): Promise<ReadableStream<Uint8Array>> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://recoder.xyz',
        'X-Title': 'Recoder.xyz'
      },
      body: JSON.stringify({
        ...request,
        stream: true
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    return response.body;
  }

  /**
   * Parse SSE stream and extract text chunks
   */
  async *parseSSEStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<OpenRouterStreamChunk> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          
          if (trimmed === '') continue;
          if (trimmed === 'data: [DONE]') return;
          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.substring(6); // Remove 'data: ' prefix
          
          try {
            const chunk = JSON.parse(data) as OpenRouterStreamChunk;
            yield chunk;
          } catch (e) {
            logger.error('Failed to parse SSE chunk:', e, data);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Stream text content only (simplified interface)
   */
  async *streamText(request: OpenRouterRequest): AsyncGenerator<string> {
    const stream = await this.createStreamingChatCompletion(request);
    
    for await (const chunk of this.parseSSEStream(stream)) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield delta.content;
      }
    }
  }

  /**
   * Convert to Remix-compatible streaming response
   */
  async createStreamingResponse(request: OpenRouterRequest): Promise<Response> {
    const stream = await this.createStreamingChatCompletion(request);
    
    // Transform SSE stream to text stream
    const textStream = new TransformStream<Uint8Array, Uint8Array>({
      transform: async (chunk, controller) => {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          
          if (trimmed === '' || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.substring(6);
          
          try {
            const parsed = JSON.parse(data) as OpenRouterStreamChunk;
            const content = parsed.choices[0]?.delta?.content;
            
            if (content) {
              controller.enqueue(new TextEncoder().encode(content));
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    });

    return new Response(stream.pipeThrough(textStream), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }
}

/**
 * Create an OpenRouter client
 */
export function createOpenRouterClient(apiKey: string): OpenRouterClient {
  return new OpenRouterClient(apiKey);
}
