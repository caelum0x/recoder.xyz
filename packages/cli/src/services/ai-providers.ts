/**
 * AI Provider Integrations
 * Multi-AI orchestration for different tasks
 */

import axios, { AxiosInstance } from 'axios';
import { Logger } from '../utils/logger';

export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  tokens?: {
    input: number;
    output: number;
  };
}

export interface AIProvider {
  name: string;
  chat(messages: any[], options?: any): Promise<AIResponse>;
  isAvailable(): boolean;
  specialties: string[];
}

// Claude/Anthropic Provider
export class AnthropicProvider implements AIProvider {
  name = 'claude';
  specialties = ['blockchain', 'security', 'complex-reasoning', 'architecture'];
  private client: AxiosInstance;

  constructor(apiKey?: string) {
    this.client = axios.create({
      baseURL: 'https://api.anthropic.com/v1',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey || process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      }
    });
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      const response = await this.client.post('/messages', {
        model: options.model || 'claude-3-sonnet-20240229',
        max_tokens: options.maxTokens || 4000,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      });

      return {
        content: response.data.content[0].text,
        model: response.data.model,
        provider: 'claude',
        tokens: {
          input: response.data.usage.input_tokens,
          output: response.data.usage.output_tokens
        }
      };
    } catch (error: any) {
      Logger.error(`Claude API error: ${error.message}`);
      throw new Error(`Claude API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.ANTHROPIC_API_KEY);
  }
}

// Groq Provider
export class GroqProvider implements AIProvider {
  name = 'groq';
  specialties = ['react', 'nextjs', 'rapid-prototyping', 'api-endpoints', 'frontend'];
  private client: AxiosInstance;

  constructor(apiKey?: string) {
    this.client = axios.create({
      baseURL: 'https://api.groq.com/openai/v1',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || process.env.GROQ_API_KEY || ''}`
      }
    });
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      const response = await this.client.post('/chat/completions', {
        model: options.model || 'llama3-70b-8192',
        messages,
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7
      });

      const choice = response.data.choices[0];
      return {
        content: choice.message.content,
        model: response.data.model,
        provider: 'groq',
        tokens: {
          input: response.data.usage.prompt_tokens,
          output: response.data.usage.completion_tokens
        }
      };
    } catch (error: any) {
      Logger.error(`Groq API error: ${error.message}`);
      throw new Error(`Groq API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.GROQ_API_KEY);
  }
}

// Google Gemini Provider
export class GeminiProvider implements AIProvider {
  name = 'gemini';
  specialties = ['multimodal', 'large-codebases', 'documentation', 'analysis'];
  private client: AxiosInstance;

  constructor(apiKey?: string) {
    this.client = axios.create({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      params: {
        key: apiKey || process.env.GOOGLE_API_KEY || ''
      }
    });
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      const contents = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const response = await this.client.post('/models/gemini-pro:generateContent', {
        contents,
        generationConfig: {
          maxOutputTokens: options.maxTokens || 4000,
          temperature: options.temperature || 0.7
        }
      });

      const candidate = response.data.candidates[0];
      return {
        content: candidate.content.parts[0].text,
        model: 'gemini-pro',
        provider: 'gemini',
        tokens: {
          input: response.data.usageMetadata?.promptTokenCount || 0,
          output: response.data.usageMetadata?.candidatesTokenCount || 0
        }
      };
    } catch (error: any) {
      Logger.error(`Gemini API error: ${error.message}`);
      throw new Error(`Gemini API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.GOOGLE_API_KEY);
  }
}

// Ollama Provider (Local)
export class OllamaProvider implements AIProvider {
  name = 'ollama';
  specialties = ['privacy', 'local-models', 'custom-models', 'offline'];
  private client: AxiosInstance;

  constructor(baseUrl?: string) {
    this.client = axios.create({
      baseURL: baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      timeout: 60000 // 60s for local inference
    });
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      const response = await this.client.post('/api/chat', {
        model: options.model || 'codellama',
        messages,
        stream: false,
        options: {
          temperature: options.temperature || 0.7
        }
      });

      return {
        content: response.data.message.content,
        model: options.model || 'codellama',
        provider: 'ollama'
      };
    } catch (error: any) {
      Logger.error(`Ollama API error: ${error.message}`);
      throw new Error(`Ollama API failed: ${error.message}`);
    }
  }

  isAvailable(): boolean {
    // Check if Ollama is running locally
    try {
      return true; // Simplified - would normally ping the API
    } catch {
      return false;
    }
  }
}

// OpenAI Provider (Backup only)
export class OpenAIProvider implements AIProvider {
  name = 'openai';
  specialties = ['general-purpose']; // Limited specialties
  private client: AxiosInstance;

  constructor(apiKey?: string) {
    this.client = axios.create({
      baseURL: 'https://api.openai.com/v1',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || process.env.OPENAI_API_KEY || ''}`
      }
    });
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      const response = await this.client.post('/chat/completions', {
        model: options.model || 'gpt-3.5-turbo',
        messages,
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7
      });

      const choice = response.data.choices[0];
      return {
        content: choice.message.content,
        model: response.data.model,
        provider: 'openai',
        tokens: {
          input: response.data.usage.prompt_tokens,
          output: response.data.usage.completion_tokens
        }
      };
    } catch (error: any) {
      Logger.error(`OpenAI API error: ${error.message}`);
      throw new Error(`OpenAI API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.OPENAI_API_KEY);
  }
}