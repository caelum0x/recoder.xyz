/**
 * AI Hub - Multi-Provider AI Orchestration with Cost-Efficient Routing
 * Enhanced with unified API providers and intelligent cost optimization
 */

import chalk from 'chalk';
import axios, { AxiosInstance } from 'axios';
import { Logger } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import { aiCache, AIResponseCache } from './ai-cache';
import { modelSelector, IntelligentModelSelector, ModelRanking, MODEL_RANKINGS } from './model-rankings';
import { costEfficientRouter, TaskContext as CostTaskContext, CostOptimizationConfig } from './cost-efficient-router';
import { unifiedAPI, UnifiedAPIAdapter, UnifiedAPIOptions } from './unified-api-adapter';
import { packageIntegration, PackageIntegrationManager } from './package-integration';
import { buildApiHandler } from '../api';
import type { ApiHandler } from '../api';
import type { AIMessage, ProviderSettings } from '../api/providers/types';

const execAsync = promisify(exec);

// Real AI Provider Interfaces
export interface AIProvider {
  name: string;
  chat(messages: any[], options?: any): Promise<AIResponse>;
  isAvailable(): boolean;
  specialties: string[];
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

export interface TaskContext {
  type: 'blockchain' | 'web' | 'mobile' | 'backend' | 'security' | 'devops' | 'general';
  complexity: 'simple' | 'medium' | 'complex';
  priority: 'speed' | 'quality' | 'cost';
  requirements?: string[];
}

export interface AIRequestOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  context?: string;
  systemPrompt?: string;
  stream?: boolean;
}

// Claude/Anthropic Provider with Latest Model Rankings
class AnthropicProvider implements AIProvider {
  name = 'claude';
  specialties = ['blockchain', 'security', 'complex-reasoning', 'architecture'];
  private client: AxiosInstance;
  private availableModels = ['claude-sonnet-4', 'claude-3.7-sonnet', 'claude-3-sonnet-20240229'];

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
      // Use intelligent model selection for optimal performance
      const selectedModel = options.model || this.getOptimalModel(options.taskType || 'coding');
      
      const response = await this.client.post('/messages', {
        model: selectedModel,
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
      Logger.error(`Claude API error: ${error.message}`, '');
      throw new Error(`Claude API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.ANTHROPIC_API_KEY);
  }

  private getOptimalModel(taskType: string = 'coding'): string {
    // Get best Claude model based on latest rankings
    const claudeRankings = MODEL_RANKINGS.filter(model => model.provider === 'claude');
    const bestModel = claudeRankings.sort((a, b) => b.codingScore - a.codingScore)[0];
    
    // Map to actual API model names
    const modelMapping = {
      'claude-sonnet-4': 'claude-3-5-sonnet-20241022', // Latest available
      'claude-3.7-sonnet': 'claude-3-5-sonnet-20241022',
      'claude-3-sonnet-20240229': 'claude-3-sonnet-20240229'
    };
    
    return modelMapping[bestModel?.name as keyof typeof modelMapping] || 'claude-3-5-sonnet-20241022';
  }
}

// Groq Provider with Enhanced Model Selection
class GroqProvider implements AIProvider {
  name = 'groq';
  specialties = ['react', 'nextjs', 'rapid-prototyping', 'api-endpoints', 'frontend', 'fast-generation'];
  private client: AxiosInstance;
  private availableModels = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant'];

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
        model: options.model || this.getOptimalModel(options.taskType || 'coding'),
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
      Logger.error(`Groq API error: ${error.message}`, '');
      throw new Error(`Groq API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.GROQ_API_KEY);
  }

  private getOptimalModel(taskType: string = 'coding'): string {
    // For coding tasks, use the largest model available
    if (taskType === 'coding' || taskType === 'complex') {
      return 'llama-3.1-70b-versatile';
    }
    // For fast tasks, use the instant model
    if (taskType === 'fast' || taskType === 'simple') {
      return 'llama-3.1-8b-instant';
    }
    return 'llama-3.1-70b-versatile';
  }
}

// Mistral Provider
class MistralProvider implements AIProvider {
  name = 'mistral';
  specialties = ['code-generation', 'multilingual', 'reasoning', 'efficiency'];
  private client: AxiosInstance;

  constructor(apiKey?: string) {
    this.client = axios.create({
      baseURL: 'https://api.mistral.ai/v1',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || process.env.MISTRAL_API_KEY || ''}`
      }
    });
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      const response = await this.client.post('/chat/completions', {
        model: options.model || 'mistral-large-2407',
        messages,
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7
      });

      const choice = response.data.choices[0];
      return {
        content: choice.message.content,
        model: response.data.model,
        provider: 'mistral',
        tokens: {
          input: response.data.usage.prompt_tokens,
          output: response.data.usage.completion_tokens
        }
      };
    } catch (error: any) {
      Logger.error(`Mistral API error: ${error.message}`, '');
      throw new Error(`Mistral API failed: ${error.response?.data?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.MISTRAL_API_KEY);
  }
}

// Perplexity Provider
class PerplexityProvider implements AIProvider {
  name = 'perplexity';
  specialties = ['research', 'real-time-data', 'web-search', 'factual-queries'];
  private client: AxiosInstance;

  constructor(apiKey?: string) {
    this.client = axios.create({
      baseURL: 'https://api.perplexity.ai',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || process.env.PERPLEXITY_API_KEY || ''}`
      }
    });
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      const response = await this.client.post('/chat/completions', {
        model: options.model || 'llama-3.1-sonar-large-128k-online',
        messages,
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7
      });

      const choice = response.data.choices[0];
      return {
        content: choice.message.content,
        model: response.data.model,
        provider: 'perplexity',
        tokens: {
          input: response.data.usage.prompt_tokens || 0,
          output: response.data.usage.completion_tokens || 0
        }
      };
    } catch (error: any) {
      Logger.error(`Perplexity API error: ${error.message}`, '');
      throw new Error(`Perplexity API failed: ${error.response?.data?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.PERPLEXITY_API_KEY);
  }
}

// Cohere Provider
class CohereProvider implements AIProvider {
  name = 'cohere';
  specialties = ['text-generation', 'classification', 'embeddings', 'summarization'];
  private client: AxiosInstance;

  constructor(apiKey?: string) {
    this.client = axios.create({
      baseURL: 'https://api.cohere.com/v1',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || process.env.COHERE_API_KEY || ''}`,
        'Cohere-Version': '2022-12-06'
      }
    });
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      // Convert messages to Cohere format
      const lastMessage = messages[messages.length - 1];
      const conversationHistory = messages.slice(0, -1).map(msg => ({
        role: msg.role === 'assistant' ? 'CHATBOT' : 'USER',
        message: msg.content
      }));

      const response = await this.client.post('/chat', {
        model: options.model || 'command-r-plus',
        message: lastMessage.content,
        chat_history: conversationHistory,
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7
      });

      return {
        content: response.data.text,
        model: 'command-r-plus',
        provider: 'cohere',
        tokens: {
          input: response.data.meta?.tokens?.input_tokens || 0,
          output: response.data.meta?.tokens?.output_tokens || 0
        }
      };
    } catch (error: any) {
      Logger.error(`Cohere API error: ${error.message}`, '');
      throw new Error(`Cohere API failed: ${error.response?.data?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.COHERE_API_KEY);
  }
}

// Hugging Face Provider
class HuggingFaceProvider implements AIProvider {
  name = 'huggingface';
  specialties = ['code-generation', 'text-generation', 'open-source-models', 'cost-effective'];
  private client: AxiosInstance;

  constructor(apiKey?: string) {
    this.client = axios.create({
      baseURL: 'https://api-inference.huggingface.co/models',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || process.env.HUGGINGFACE_API_KEY || ''}`
      }
    });
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      // Use Hugging Face Code Llama or CodeT5+ for code generation
      const model = options.model || 'codellama/CodeLlama-7b-Instruct-hf';
      const endpoint = `/${model}`;
      
      // Convert messages to prompt format
      const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n\n') + '\nassistant:';
      
      const response = await this.client.post(endpoint, {
        inputs: prompt,
        parameters: {
          max_new_tokens: options.maxTokens || 4000,
          temperature: options.temperature || 0.7,
          return_full_text: false,
          do_sample: true
        },
        options: {
          wait_for_model: true
        }
      });

      // Handle different response formats
      let content = '';
      if (Array.isArray(response.data) && response.data[0]?.generated_text) {
        content = response.data[0].generated_text;
      } else if (response.data?.generated_text) {
        content = response.data.generated_text;
      } else {
        content = JSON.stringify(response.data);
      }

      return {
        content: content.trim(),
        model: model,
        provider: 'huggingface',
        tokens: {
          input: Math.ceil(prompt.length / 4),
          output: Math.ceil(content.length / 4)
        }
      };
    } catch (error: any) {
      Logger.error(`Hugging Face API error: ${error.message}`, '');
      throw new Error(`Hugging Face API failed: ${error.response?.data?.error || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.HUGGINGFACE_API_KEY);
  }
}

// OpenRouter Provider
class OpenRouterProvider implements AIProvider {
  name = 'openrouter';
  specialties = ['multi-model-access', 'cost-optimization', 'model-variety', 'api-aggregation'];
  private client: AxiosInstance;

  constructor(apiKey?: string) {
    this.client = axios.create({
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || process.env.OPENROUTER_API_KEY || ''}`,
        'HTTP-Referer': 'https://recoder.xyz',
        'X-Title': 'Recoder.xyz'
      }
    });
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      // Use Claude 3.5 Sonnet or GPT-4 through OpenRouter for better coding
      const model = options.model || 'anthropic/claude-3.5-sonnet';
      
      const response = await this.client.post('/chat/completions', {
        model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7,
        top_p: 0.9
      });

      const choice = response.data.choices[0];
      return {
        content: choice.message.content,
        model: response.data.model,
        provider: 'openrouter',
        tokens: {
          input: response.data.usage?.prompt_tokens || 0,
          output: response.data.usage?.completion_tokens || 0
        },
        finishReason: choice.finish_reason
      };
    } catch (error: any) {
      Logger.error(`OpenRouter API error: ${error.message}`, '');
      throw new Error(`OpenRouter API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.OPENROUTER_API_KEY);
  }
}

// Together AI Provider  
class TogetherAIProvider implements AIProvider {
  name = 'together';
  specialties = ['open-source-models', 'fast-inference', 'code-generation', 'cost-effective'];
  private client: AxiosInstance;

  constructor(apiKey?: string) {
    this.client = axios.create({
      baseURL: 'https://api.together.xyz/v1',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || process.env.TOGETHER_API_KEY || ''}`
      }
    });
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      // Use CodeLlama or Mistral for code generation
      const model = options.model || 'codellama/CodeLlama-34b-Instruct-hf';
      
      const response = await this.client.post('/chat/completions', {
        model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7,
        top_p: 0.9,
        repetition_penalty: 1.1
      });

      const choice = response.data.choices[0];
      return {
        content: choice.message.content,
        model: response.data.model,
        provider: 'together',
        tokens: {
          input: response.data.usage?.prompt_tokens || 0,
          output: response.data.usage?.completion_tokens || 0
        },
        finishReason: choice.finish_reason
      };
    } catch (error: any) {
      Logger.error(`Together AI API error: ${error.message}`, '');
      throw new Error(`Together AI API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.TOGETHER_API_KEY);
  }
}

// Custom Endpoint Provider
class CustomProvider implements AIProvider {
  name: string;
  specialties: string[];
  private client: AxiosInstance;
  private config: CustomProviderConfig;

  constructor(config: CustomProviderConfig) {
    this.name = config.name;
    this.specialties = config.specialties || ['general'];
    this.config = config;
    
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': config.authHeader || `Bearer ${config.apiKey}`,
        ...config.customHeaders
      },
      timeout: config.timeout || 30000
    });
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      const requestBody = this.config.requestFormat === 'openai' ? {
        model: options.model || this.config.defaultModel,
        messages,
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7
      } : {
        // Custom format - can be extended
        prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
        max_length: options.maxTokens || 4000,
        temperature: options.temperature || 0.7
      };

      const response = await this.client.post(this.config.chatEndpoint || '/chat/completions', requestBody);
      
      // Parse response based on format
      const content = this.config.responseFormat === 'openai' 
        ? response.data.choices[0].message.content
        : response.data.text || response.data.response || JSON.stringify(response.data);

      return {
        content,
        model: this.config.defaultModel || 'custom',
        provider: this.name,
        tokens: {
          input: response.data.usage?.prompt_tokens || 0,
          output: response.data.usage?.completion_tokens || 0
        }
      };
    } catch (error: any) {
      Logger.error(`Custom provider ${this.name} error: ${error.message}`, '');
      throw new Error(`Custom provider failed: ${error.response?.data?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(this.config.apiKey || this.config.authHeader);
  }
}

interface CustomProviderConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  authHeader?: string;
  customHeaders?: Record<string, string>;
  defaultModel?: string;
  specialties?: string[];
  chatEndpoint?: string;
  requestFormat?: 'openai' | 'custom';
  responseFormat?: 'openai' | 'custom';
  timeout?: number;
}

// Ollama Local Provider
class OllamaProvider implements AIProvider {
  name = 'ollama';
  specialties = ['local-ai', 'privacy-first', 'offline-capable', 'code-generation'];
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      const http = require('http');
      
      // Convert messages to Ollama format
      const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
      
      const requestData = JSON.stringify({
        model: options.model || 'tinyllama:latest', // Use available lightweight model
        prompt: prompt + '\nassistant:',
        stream: false,
        options: {
          temperature: options.temperature || 0.7,
          num_predict: options.maxTokens || 2000
        }
      });

      const requestOptions = {
        hostname: '127.0.0.1',
        port: 11434,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestData)
        },
        timeout: options.timeout || 60000
      };

      const response: any = await new Promise((resolve, reject) => {
        const req = http.request(requestOptions, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => {
            try {
              if (res.statusCode === 200) {
                resolve(JSON.parse(data));
              } else {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              }
            } catch (error) {
              reject(new Error(`Invalid JSON response: ${data}`));
            }
          });
        });

        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.write(requestData);
        req.end();
      });

      return {
        content: response.response || '',
        model: response.model || 'ollama-local',
        provider: this.name,
        tokens: {
          input: response.prompt_eval_count || 0,
          output: response.eval_count || 0
        },
        finishReason: response.done ? 'stop' : 'length'
      };

    } catch (error: any) {
      Logger.error(`Ollama provider error: ${error.message}`, '');
      
      // Check if it's a connection error - Ollama might not be running
      if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
        throw new Error('Ollama service not running. Run "recoder ollama install" to set up local AI.');
      }
      
      throw new Error(`Ollama failed: ${error.message}`);
    }
  }

  isAvailable(): boolean {
    // Ollama doesn't require API keys, just needs to be running
    return true;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const http = require('http');
      
      return new Promise((resolve) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 11434,
          path: '/api/tags',
          method: 'GET',
          timeout: 5000
        }, (res: any) => {
          resolve(res.statusCode === 200);
        });

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        
        req.end();
      });
    } catch (error) {
      return false;
    }
  }
}

// Google Gemini Provider with Latest Models
class GeminiProvider implements AIProvider {
  name = 'gemini';
  specialties = ['multimodal', 'large-codebases', 'documentation', 'analysis', 'fast-generation'];
  private client: AxiosInstance;
  private availableModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-pro'];

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

      const selectedModel = options.model || this.getOptimalModel(options.taskType || 'analysis');
      const response = await this.client.post(`/models/${selectedModel}:generateContent`, {
        contents,
        generationConfig: {
          maxOutputTokens: options.maxTokens || 4000,
          temperature: options.temperature || 0.7
        }
      });

      const candidate = response.data.candidates[0];
      return {
        content: candidate.content.parts[0].text,
        model: selectedModel,
        provider: 'gemini',
        tokens: {
          input: response.data.usageMetadata?.promptTokenCount || 0,
          output: response.data.usageMetadata?.candidatesTokenCount || 0
        }
      };
    } catch (error: any) {
      Logger.error(`Gemini API error: ${error.message}`, '');
      throw new Error(`Gemini API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.GOOGLE_API_KEY);
  }

  private getOptimalModel(taskType: string = 'analysis'): string {
    // Use latest high-performance Gemini models based on rankings
    const geminiRankings = MODEL_RANKINGS.filter(model => model.provider === 'gemini');
    const bestModel = geminiRankings.sort((a, b) => {
      if (taskType === 'coding') return b.codingScore - a.codingScore;
      if (taskType === 'fast') return b.costEfficiency - a.costEfficiency;
      return parseInt(b.tokenCapacity) - parseInt(a.tokenCapacity);
    })[0];
    
    const modelMapping = {
      'gemini-2.5-flash': 'gemini-2.0-flash-exp', // Use available experimental model
      'gemini-2.0-flash': 'gemini-2.0-flash-exp',
      'gemini-2.5-pro': 'gemini-1.5-pro', // Fallback to available pro model
      'gemini-pro': 'gemini-pro'
    };
    
    return modelMapping[bestModel?.name as keyof typeof modelMapping] || 'gemini-2.0-flash-exp';
  }
}

// DeepSeek Provider (OpenAI-compatible)
class DeepSeekProvider implements AIProvider {
  name = 'deepseek';
  specialties = ['reasoning', 'code-generation', 'math', 'cost-effective'];
  private client: AxiosInstance;
  private availableModels = ['deepseek-chat', 'deepseek-reasoner'];

  constructor(apiKey?: string) {
    this.client = axios.create({
      baseURL: 'https://api.deepseek.com',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || process.env.DEEPSEEK_API_KEY || ''}`
      }
    });
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      const response = await this.client.post('/chat/completions', {
        model: options.model || this.getOptimalModel(options.taskType || 'coding'),
        messages,
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7
      });

      const choice = response.data.choices[0];
      return {
        content: choice.message.content,
        model: response.data.model,
        provider: 'deepseek',
        tokens: {
          input: response.data.usage.prompt_tokens,
          output: response.data.usage.completion_tokens
        }
      };
    } catch (error: any) {
      Logger.error(`DeepSeek API error: ${error.message}`, '');
      throw new Error(`DeepSeek API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.DEEPSEEK_API_KEY);
  }

  private getOptimalModel(taskType: string = 'coding'): string {
    // Use reasoner for complex reasoning/math tasks
    if (taskType === 'reasoning' || taskType === 'math' || taskType === 'complex') {
      return 'deepseek-reasoner';
    }
    // Default to V3 chat model for coding and general tasks
    return 'deepseek-chat';
  }
}

// Qwen Provider (OpenAI-compatible via DashScope)
class QwenProvider implements AIProvider {
  name = 'qwen';
  specialties = ['code-generation', 'multilingual', 'fast-generation', 'cost-effective'];
  private client: AxiosInstance;
  private availableModels = ['qwen-plus', 'qwen-turbo', 'qwen-max'];

  constructor(apiKey?: string) {
    this.client = axios.create({
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || ''}`
      }
    });
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      const response = await this.client.post('/chat/completions', {
        model: options.model || this.getOptimalModel(options.taskType || 'coding'),
        messages,
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7
      });

      const choice = response.data.choices[0];
      return {
        content: choice.message.content,
        model: response.data.model,
        provider: 'qwen',
        tokens: {
          input: response.data.usage.prompt_tokens,
          output: response.data.usage.completion_tokens
        }
      };
    } catch (error: any) {
      Logger.error(`Qwen API error: ${error.message}`, '');
      throw new Error(`Qwen API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY);
  }

  private getOptimalModel(taskType: string = 'coding'): string {
    // Use max model for complex tasks
    if (taskType === 'complex' || taskType === 'reasoning') {
      return 'qwen-max';
    }
    // Use turbo for fast/simple tasks
    if (taskType === 'fast' || taskType === 'simple') {
      return 'qwen-turbo';
    }
    return 'qwen-plus';
  }
}

// Kimi Provider (OpenAI-compatible via Moonshot)
class KimiProvider implements AIProvider {
  name = 'kimi';
  specialties = ['long-context', 'reasoning', 'code-generation', 'analysis'];
  private client: AxiosInstance;
  private availableModels = ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'];

  constructor(apiKey?: string) {
    this.client = axios.create({
      baseURL: 'https://api.moonshot.cn/v1',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || ''}`
      }
    });
  }

  async chat(messages: any[], options: any = {}): Promise<AIResponse> {
    try {
      const response = await this.client.post('/chat/completions', {
        model: options.model || this.getOptimalModel(options.taskType || 'coding'),
        messages,
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7
      });

      const choice = response.data.choices[0];
      return {
        content: choice.message.content,
        model: response.data.model,
        provider: 'kimi',
        tokens: {
          input: response.data.usage.prompt_tokens,
          output: response.data.usage.completion_tokens
        }
      };
    } catch (error: any) {
      Logger.error(`Kimi API error: ${error.message}`, '');
      throw new Error(`Kimi API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  isAvailable(): boolean {
    return !!(process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY);
  }

  private getOptimalModel(taskType: string = 'coding'): string {
    // Use 128k model for long-context/analysis tasks
    if (taskType === 'analysis' || taskType === 'long-context') {
      return 'moonshot-v1-128k';
    }
    // Use 32k for complex tasks
    if (taskType === 'complex' || taskType === 'reasoning') {
      return 'moonshot-v1-32k';
    }
    // Default to 8k for fast/coding tasks
    return 'moonshot-v1-8k';
  }
}

export { CustomProviderConfig };

export class AIHub {
  private providers: Map<string, AIProvider> = new Map();
  private providerPreferences: Map<string, string[]> = new Map();
  private unifiedApiHandlers: Map<string, ApiHandler> = new Map();
  private static instance: AIHub;

  private constructor() {
    this.initializePackageIntegrations();
    this.initializeProvidersAsync();
    this.initializeUnifiedApiHandlers();
    this.setupProviderPreferences();
  }

  private async initializePackageIntegrations(): Promise<void> {
    try {
      await packageIntegration.initialize();
      
      // Log integration status
      const status = packageIntegration.getIntegrationStatus();
      if (status.fullyIntegrated) {
        Logger.info('✅ All package integrations initialized successfully');
      } else {
        Logger.warn(`⚠️ Partial integration: ${status.available.join(', ')}`);
      }
    } catch (error) {
      Logger.error('Failed to initialize package integrations:', error);
    }
  }

  private async initializeProvidersAsync(): Promise<void> {
    try {
      await this.initializeProviders();
    } catch (error) {
      Logger.error('Failed to initialize AI providers:', error instanceof Error ? error.message : String(error));
    }
  }

  public static getInstance(): AIHub {
    if (!AIHub.instance) {
      AIHub.instance = new AIHub();
    }
    return AIHub.instance;
  }

  private async initializeProviders(): Promise<void> {
    // Initialize all AI providers including new models with latest rankings
    const providers = [
      new OllamaProvider(),  // Prioritize local AI first
      new AnthropicProvider(), // Claude Sonnet 4 - Top performer
      new GeminiProvider(), // Gemini 2.5 Flash - High performance, free tier
      new DeepSeekProvider(), // DeepSeek V3 - Free, high coding score
      new QwenProvider(), // Qwen3 Coder - Free, perfect coding score
      new KimiProvider(), // Kimi K2 - High performance
      new GroqProvider(), // Fast generation
      new MistralProvider(),
      new PerplexityProvider(),
      new CohereProvider(),
      new HuggingFaceProvider(),
      new OpenRouterProvider(),
      new TogetherAIProvider()
    ];
    
    // ✅ New AI models now integrated with latest performance rankings
    Logger.info('🚀 Initialized with latest AI model rankings:');
    Logger.info('   Claude Sonnet 4: 594B tokens, 28% improvement, 10/10 coding');
    Logger.info('   Gemini 2.5 Flash: 308B tokens, 17% improvement, 8/10 coding (FREE)');
    Logger.info('   DeepSeek V3: 213B tokens, 7% improvement, 9/10 coding (FREE)');
    Logger.info('   Qwen3 Coder: 89.9B tokens, perfect 10/10 coding score (FREE)');
    Logger.info('   Kimi K2: 45.1B tokens, 17% improvement, 7/10 coding');
    
    // TODO: Initialize Enhanced Ollama Provider when available
    // try {
    //   await enhancedOllamaProvider.initialize();
    //   if (enhancedOllamaProvider.isAvailable()) {
    //     providers.push(enhancedOllamaProvider);
    //   }
    // } catch (error) {
    //   Logger.warn('⚠️ Enhanced Ollama provider initialization failed:', error instanceof Error ? error.message : String(error));
    // }
    
    // TODO: Add custom providers when loadCustomProviders is implemented
    // const customProviders = this.loadCustomProviders();
    // providers.push(...customProviders);

    for (const provider of providers) {
      if (provider.isAvailable()) {
        this.providers.set(provider.name, provider);
        Logger.info(`✅ Initialized ${provider.name} provider`);
      } else {
        Logger.warn(`⚠️ ${provider.name} provider not available (missing API key)`, '');
      }
    }

    if (this.providers.size === 0) {
      Logger.error('❌ No AI providers available. Configure API keys or enable local AI:', '');
      Logger.error('   LOCAL AI: Ollama auto-installs for free, private local models', '');
      Logger.error('   ANTHROPIC_API_KEY - for Claude', '');
      Logger.error('   GROQ_API_KEY - for Groq/Llama', '');
      Logger.error('   GOOGLE_API_KEY - for Gemini', '');
      Logger.error('   MISTRAL_API_KEY - for Mistral', '');
      Logger.error('   PERPLEXITY_API_KEY - for Perplexity', '');
      Logger.error('   COHERE_API_KEY - for Cohere', '');
      Logger.error('   HUGGINGFACE_API_KEY - for Hugging Face models', '');
      Logger.error('   OPENROUTER_API_KEY - for OpenRouter multi-model access', '');
      Logger.error('   TOGETHER_API_KEY - for Together AI open-source models', '');
      Logger.error('   DEEPSEEK_API_KEY - for DeepSeek V3/R1 models (FREE tier available)', '');
      Logger.error('   QWEN_API_KEY or DASHSCOPE_API_KEY - for Qwen3 Coder (FREE)', '');
      Logger.error('   KIMI_API_KEY or MOONSHOT_API_KEY - for Kimi K2 models', '');
    } else {
      Logger.info(`✅ AI Hub initialized with ${this.providers.size} providers: ${Array.from(this.providers.keys()).join(', ')}`);
    }
  }

  private setupProviderPreferences(): void {
    // Define task-specific provider preferences based on latest model rankings
    // Free models prioritized first: Ollama (local), then free cloud options
    // High-performance models: Claude Sonnet 4, Gemini 2.5 Flash, DeepSeek V3, Qwen3 Coder
    
    // Get intelligent recommendations from model selector
    const recommendations = modelSelector.getRecommendedConfig({
      preferFreeModels: true,
      useLatestModels: true,
      prioritizePerformance: false,
      prioritizeCost: true
    });
    
    // Build preferences based on model rankings and provider capabilities
    this.providerPreferences.set('blockchain', ['ollama', 'claude', 'openrouter', 'together', 'deepseek', 'qwen', 'mistral', 'groq', 'gemini', 'huggingface']);
    this.providerPreferences.set('web', ['ollama', 'together', 'huggingface', 'qwen', 'groq', 'mistral', 'claude', 'openrouter', 'gemini']);
    this.providerPreferences.set('mobile', ['ollama', 'together', 'huggingface', 'qwen', 'groq', 'mistral', 'claude', 'openrouter', 'gemini']);
    this.providerPreferences.set('backend', ['ollama', 'together', 'huggingface', 'deepseek', 'qwen', 'groq', 'mistral', 'claude', 'openrouter']);
    this.providerPreferences.set('security', ['claude', 'openrouter', 'deepseek', 'ollama', 'gemini', 'mistral', 'groq', 'together']);
    this.providerPreferences.set('devops', ['ollama', 'together', 'deepseek', 'qwen', 'claude', 'openrouter', 'mistral', 'groq', 'gemini']);
    this.providerPreferences.set('research', ['perplexity', 'openrouter', 'together', 'gemini', 'claude', 'deepseek', 'ollama', 'groq']);
    this.providerPreferences.set('documentation', ['ollama', 'cohere', 'huggingface', 'gemini', 'claude', 'mistral', 'openrouter']);
    this.providerPreferences.set('general', ['ollama', 'together', 'huggingface', 'qwen', 'groq', 'mistral', 'claude', 'openrouter', 'gemini']);
    this.providerPreferences.set('reasoning', ['deepseek', 'claude', 'openrouter', 'together', 'ollama', 'gemini', 'mistral']);
    this.providerPreferences.set('code-generation', ['qwen', 'together', 'huggingface', 'ollama', 'deepseek', 'groq', 'claude', 'openrouter', 'mistral']);
    this.providerPreferences.set('analysis', ['gemini', 'openrouter', 'deepseek', 'claude', 'ollama', 'together', 'groq']);
    this.providerPreferences.set('fast-generation', ['gemini', 'groq', 'together', 'huggingface', 'ollama', 'qwen']);
    this.providerPreferences.set('cost-effective', ['ollama', 'deepseek', 'qwen', 'huggingface', 'together', 'groq']);
  }

  /**
   * Smart model selection based on task context with latest performance rankings
   */
  selectBestProvider(context: TaskContext): AIProvider {
    // Use intelligent model selector for optimized provider choice
    const taskTypeMapping = {
      'blockchain': 'reasoning',
      'web': 'coding',
      'mobile': 'coding', 
      'backend': 'coding',
      'security': 'reasoning',
      'devops': 'general',
      'general': 'general'
    };
    
    const modelTask = (taskTypeMapping[context.type as keyof typeof taskTypeMapping] || 'coding') as 'coding' | 'reasoning' | 'analysis' | 'general';
    
    // Get best models from rankings
    const bestModels = modelSelector.getBestModelForTask(modelTask, {
      prioritizePerformance: context.priority === 'quality',
      prioritizeCost: context.priority === 'cost',
      preferFreeModels: true, // Prioritize free models
      useLatestModels: true
    });
    
    // Map model rankings to available providers
    const providerOrder = bestModels.map(model => model.provider)
      .concat(['ollama']) // Always include Ollama as fallback
      .filter((provider, index, self) => self.indexOf(provider) === index); // Remove duplicates
    
    // Find the first available provider from optimized rankings
    for (const providerName of providerOrder) {
      const provider = this.providers.get(providerName);
      if (provider) {
        const selectedModel = bestModels.find(m => m.provider === providerName);
        Logger.debug(`🎯 Selected ${providerName} for ${context.type} task (model: ${selectedModel?.name}, complexity: ${context.complexity})`);
        return provider;
      }
    }

    // Fallback to any available provider
    const fallback = Array.from(this.providers.values())[0];
    if (fallback) {
      Logger.warn(`⚠️ Using fallback provider ${fallback.name} for ${context.type} task`, '');
      return fallback;
    }

    throw new Error('❌ No AI providers available. Please configure API keys.');
  }

  /**
   * Get intelligent provider recommendations based on model rankings
   */
  getProviderRecommendations(context: TaskContext): {
    primary: string;
    fallbacks: string[];
    reasoning: string;
    freeOptions: string[];
  } {
    const taskTypeMapping = {
      'blockchain': 'reasoning',
      'web': 'coding',
      'mobile': 'coding', 
      'backend': 'coding',
      'security': 'reasoning',
      'devops': 'general',
      'general': 'general'
    };
    
    const modelTask = taskTypeMapping[context.type as keyof typeof taskTypeMapping] || 'coding';
    
    const config = modelSelector.getRecommendedConfig({
      prioritizePerformance: context.priority === 'quality',
      prioritizeCost: context.priority === 'cost', 
      preferFreeModels: context.priority === 'cost',
      useLatestModels: true
    });
    
    return {
      primary: config.primary?.provider || 'ollama',
      fallbacks: config.fallbacks?.map((m: any) => m.provider) || ['groq', 'together'],
      reasoning: config.reasoning?.provider || 'claude',
      freeOptions: config.freeOptions?.map((m: any) => m.provider) || ['ollama', 'huggingface']
    };
  }

  /**
   * Chat with AI using smart provider selection, caching, and full package integration
   */
  async chat(
    messages: any[], 
    context: TaskContext, 
    options: any = {}
  ): Promise<AIResponse> {
    // Step 1: Security integration - sanitize input
    let sanitizedMessages = messages;
    if (packageIntegration.security.isAvailable()) {
      sanitizedMessages = messages.map(msg => ({
        ...msg,
        content: packageIntegration.security.sanitizePrompt(msg.content || '')
      }));
      
      // Create audit trail
      packageIntegration.security.createAuditTrail('ai_request', {
        provider: context.type,
        messageCount: messages.length,
        context: context.type
      });
    }

    // Step 2: Intelligence integration - optimize context
    let optimizedContext = context;
    if (packageIntegration.intelligence.isAvailable()) {
      optimizedContext = packageIntegration.intelligence.optimizePerformance(context) || context;
      
      // Store context in memory for learning
      packageIntegration.intelligence.manageContextMemory('store', {
        context: optimizedContext,
        messages: sanitizedMessages.slice(-2), // Store last 2 messages
        timestamp: new Date().toISOString()
      });

      // Get AI recommendations for provider selection
      const recommendations = packageIntegration.intelligence.getRecommendations({
        context: optimizedContext,
        previousProviders: Array.from(this.providers.keys())
      });
      
      if (recommendations.length > 0) {
        Logger.info(`🧠 Intelligence recommendations: ${recommendations.slice(0, 2).join(', ')}`);
      }
    }

    // Step 3: CLI Router integration - use recoder-cli-router for optimal routing
    let selectedProvider: AIProvider;
    let routerResponse = null;
    
    // Try to use CLI Router for intelligent model selection
    try {
      const axios = require('axios');
      const routerEndpoint = process.env.CLI_ROUTER_ENDPOINT || 'http://127.0.0.1:3456/api/router/select';
      
      const promptContent = sanitizedMessages.map(m => m.content).join(' ');
      const routerRequest = {
        prompt: promptContent,
        taskType: optimizedContext.type.replace('-', '_').toUpperCase(),
        context: {
          complexity: optimizedContext.complexity,
          language: 'typescript',
          framework: options.framework || 'general'
        },
        priority: optimizedContext.priority,
        preferredProviders: Array.from(this.providers.keys())
      };
      
      const response = await axios.post(routerEndpoint, routerRequest, {
        timeout: 3000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.data.success && response.data.selectedModel) {
        routerResponse = response.data;
        const suggestedProvider = response.data.provider.name;
        
        if (this.providers.has(suggestedProvider)) {
          selectedProvider = this.providers.get(suggestedProvider)!;
          Logger.info(`🎯 CLI Router selected: ${suggestedProvider} (${response.data.selectedModel.displayName})`);
          Logger.info(`💡 Reasoning: ${response.data.reasoning}`);
          Logger.info(`💰 Estimated cost: $${response.data.estimatedCost.toFixed(4)}`);
        } else {
          selectedProvider = this.selectBestProvider(optimizedContext);
          Logger.info(`⚠️ Router suggested unavailable provider ${suggestedProvider}, using fallback: ${selectedProvider.name}`);
        }
      } else {
        selectedProvider = this.selectBestProvider(optimizedContext);
        Logger.info(`🎯 CLI Router failed, using standard selection: ${selectedProvider.name}`);
      }
    } catch (routerError: any) {
      // CLI Router not available, use standard selection
      selectedProvider = this.selectBestProvider(optimizedContext);
      Logger.debug(`CLI Router unavailable (${routerError.message}), using standard selection: ${selectedProvider.name}`);
    }
    
    // Create cache key from sanitized messages
    const prompt = sanitizedMessages.map(m => `${m.role}: ${m.content}`).join('\n');
    
    // Check cache first
    const cachedResponse = await aiCache.get(prompt, selectedProvider.name, options.model || 'default', options);
    if (cachedResponse && AIResponseCache.isCacheable(prompt, cachedResponse)) {
      Logger.info(`🎯 Cache hit for ${selectedProvider.name} (saved API call)`);
      
      // Track cache hit analytics
      if (packageIntegration.analytics.isAvailable()) {
        packageIntegration.analytics.trackUsage('cache_hit', {
          provider: selectedProvider.name,
          context: context.type,
          tokensSaved: cachedResponse.length * 0.75 // Estimate
        });
      }
      
      return {
        content: cachedResponse,
        model: options.model || 'default',
        provider: selectedProvider.name,
        tokens: { input: 0, output: 0 }, // Cached response, no tokens used
        finishReason: 'cached'
      };
    }
    
    try {
      let response: AIResponse;
      
      // Step 4: Use router for actual request if available
      if (packageIntegration.router.isAvailable()) {
        const routerResponse = packageIntegration.router.routeRequest({
          messages: sanitizedMessages,
          provider: selectedProvider.name,
          options
        }, {
          context: optimizedContext,
          fallbackEnabled: true
        });
        
        if (routerResponse) {
          response = routerResponse;
          Logger.info(`✅ Router handled request via ${selectedProvider.name}`);
        } else {
          // Fallback to direct provider call
          response = await selectedProvider.chat(sanitizedMessages, options);
          Logger.info(`✅ Direct call to ${selectedProvider.name} (router fallback)`);
        }
      } else {
        // Direct provider call
        response = await selectedProvider.chat(sanitizedMessages, options);
        Logger.info(`✅ ${selectedProvider.name} responded with ${response.tokens?.output || 0} tokens`);
      }
      
      // Step 5: Analytics integration - track usage and costs
      if (packageIntegration.analytics.isAvailable()) {
        packageIntegration.analytics.trackUsage('ai_request', {
          provider: response.provider,
          model: response.model,
          inputTokens: response.tokens?.input || 0,
          outputTokens: response.tokens?.output || 0,
          context: context.type,
          cached: false
        });
        
        // Track cost optimization if applicable
        const estimatedCost = this.calculateEstimatedCost(response);
        if (estimatedCost > 0) {
          const baseCost = estimatedCost * 1.2; // Assume 20% savings
          packageIntegration.analytics.trackCostOptimization(
            response.provider, 
            baseCost - estimatedCost,
            { model: response.model, context: context.type }
          );
        }
      }
      
      // Step 6: Security integration - scan response for vulnerabilities
      if (packageIntegration.security.isAvailable()) {
        const vulnerabilities = packageIntegration.security.scanForVulnerabilities(response.content);
        const secrets = packageIntegration.security.detectSecrets(response.content);
        
        if (vulnerabilities.length > 0 || secrets.length > 0) {
          Logger.warn(`⚠️ Security scan found ${vulnerabilities.length} vulnerabilities, ${secrets.length} potential secrets`);
          
          // Create security audit trail
          packageIntegration.security.createAuditTrail('security_scan', {
            provider: response.provider,
            vulnerabilities: vulnerabilities.length,
            secrets: secrets.length,
            responseLength: response.content.length
          });
        }
      }
      
      // Cache the response if it's cacheable
      if (AIResponseCache.isCacheable(prompt, response.content)) {
        await aiCache.set(
          prompt, 
          selectedProvider.name, 
          response.model, 
          response.content,
          response.tokens || { input: 0, output: 0 },
          options
        );
      }
      
      return response;
    } catch (error) {
      Logger.error(`❌ Provider ${selectedProvider.name} failed, trying fallback...`, '');
      
      // Track failure analytics
      if (packageIntegration.analytics.isAvailable()) {
        packageIntegration.analytics.trackUsage('provider_failure', {
          provider: selectedProvider.name,
          context: context.type,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      
      return this.chatWithFallback(sanitizedMessages, optimizedContext, options, selectedProvider.name);
    }
  }

  /**
   * Calculate estimated cost for analytics
   */
  private calculateEstimatedCost(response: AIResponse): number {
    // Simple cost estimation - can be enhanced with actual provider pricing
    const inputCost = (response.tokens?.input || 0) * 0.00001; // $0.01 per 1K tokens
    const outputCost = (response.tokens?.output || 0) * 0.00003; // $0.03 per 1K tokens
    return inputCost + outputCost;
  }

  /**
   * Try fallback providers if primary fails
   */
  private async chatWithFallback(
    messages: any[], 
    context: TaskContext, 
    options: any, 
    failedProvider: string
  ): Promise<AIResponse> {
    const availableProviders = Array.from(this.providers.entries())
      .filter(([name]) => name !== failedProvider);

    for (const [name, provider] of availableProviders) {
      try {
        Logger.info(`🔄 Trying fallback provider: ${name}`);
        return await provider.chat(messages, options);
      } catch (error) {
        Logger.error(`❌ Fallback provider ${name} also failed`, '');
        continue;
      }
    }

    throw new Error('❌ All AI providers failed. Please check API keys and network connection.');
  }

  /**
   * Initialize unified API handlers from the extension's proven API system
   */
  private initializeUnifiedApiHandlers(): void {
    try {
      // Define provider configurations based on available API keys
      const providerConfigs: Array<{ name: string; settings: ProviderSettings }> = [];

      // OpenRouter (unified access to multiple models)
      if (process.env.OPENROUTER_API_KEY) {
        providerConfigs.push({
          name: 'openrouter',
          settings: {
            apiProvider: 'openrouter',
            openRouterApiKey: process.env.OPENROUTER_API_KEY,
            openRouterModelId: 'anthropic/claude-3.5-sonnet', // Default to high-quality model
            openRouterUseMiddleOutTransform: true
          }
        });
      }

      // Anthropic Claude
      if (process.env.ANTHROPIC_API_KEY) {
        providerConfigs.push({
          name: 'anthropic',
          settings: {
            apiProvider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY,
            apiModelId: 'claude-3-5-sonnet-20241022'
          }
        });
      }

      // Google Gemini
      if (process.env.GOOGLE_API_KEY) {
        providerConfigs.push({
          name: 'gemini',
          settings: {
            apiProvider: 'gemini',
            geminiApiKey: process.env.GOOGLE_API_KEY,
            geminiModelId: 'gemini-2.0-flash-exp'
          }
        });
      }

      // Groq
      if (process.env.GROQ_API_KEY) {
        providerConfigs.push({
          name: 'groq',
          settings: {
            apiProvider: 'groq',
            groqApiKey: process.env.GROQ_API_KEY,
            groqModelId: 'llama-3.1-70b-versatile'
          }
        });
      }

      // DeepSeek (free tier available)
      if (process.env.DEEPSEEK_API_KEY) {
        providerConfigs.push({
          name: 'deepseek',
          settings: {
            apiProvider: 'deepseek',
            deepSeekApiKey: process.env.DEEPSEEK_API_KEY,
            deepSeekModelId: 'deepseek-r1'
          }
        });
      }

      // Ollama (local, always free)
      providerConfigs.push({
        name: 'ollama',
        settings: {
          apiProvider: 'ollama',
          ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
          ollamaModelId: 'llama3.2:latest'
        }
      });

      // Initialize handlers
      for (const { name, settings } of providerConfigs) {
        try {
          const handler = buildApiHandler(settings);
          this.unifiedApiHandlers.set(name, handler);
          Logger.info(`✅ Initialized unified API handler: ${name}`);
        } catch (error) {
          Logger.warn(`⚠️ Failed to initialize ${name} handler: ${error instanceof Error ? error.message : String(error)}`, '');
        }
      }

      if (this.unifiedApiHandlers.size === 0) {
        Logger.warn('⚠️ No unified API handlers initialized. Falling back to legacy providers.', '');
      } else {
        Logger.info(`✅ Unified API initialized with ${this.unifiedApiHandlers.size} handlers`);
      }

    } catch (error) {
      Logger.error('Failed to initialize unified API handlers:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Cost-efficient chat using the new routing system and unified API
   */
  async chatCostEfficient(
    messages: any[],
    context: CostTaskContext,
    options: any = {},
    config?: CostOptimizationConfig
  ): Promise<AIResponse & { costInfo: { estimatedCost: number; tier: string; reasoning: string } }> {
    try {
      // 1. Get optimal model selection from cost-efficient router
      const selection = await costEfficientRouter.selectOptimalModel(context, config);
      
      Logger.info(`💰 Cost-efficient selection: ${selection.model} (${selection.tier}, $${selection.estimatedCost.toFixed(4)})`);
      Logger.debug(`🧠 Reasoning: ${selection.reasoning}`);

      // 2. Try unified API handlers first (more sophisticated)
      if (this.unifiedApiHandlers.size > 0) {
        return await this.executeWithUnifiedApi(messages, selection, context, options);
      }

      // 3. Fallback to legacy providers
      return await this.executeWithLegacyProviders(messages, selection, context, options);

    } catch (error) {
      Logger.error('Cost-efficient chat failed:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Execute request using unified API handlers
   */
  private async executeWithUnifiedApi(
    messages: any[],
    selection: { model: string; tier: string; estimatedCost: number; reasoning: string },
    context: CostTaskContext,
    options: any
  ): Promise<AIResponse & { costInfo: { estimatedCost: number; tier: string; reasoning: string } }> {
    // Map model to appropriate handler
    const handlerName = this.mapModelToHandler(selection.model);
    const handler = this.unifiedApiHandlers.get(handlerName);

    if (!handler) {
      throw new Error(`No handler available for model: ${selection.model}`);
    }

    try {
      // Convert to Anthropic message format (used by the unified API)
      const anthropicMessages = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      }));

      // Build system prompt
      const systemPrompt = this.buildTaskSystemPrompt(context);
      
      // Create async generator to collect response
      let fullContent = '';
      let usage = { inputTokens: 0, outputTokens: 0, totalCost: 0 };
      let modelUsed = selection.model;

      const stream = handler.createMessage(systemPrompt, anthropicMessages, {
        taskId: `recoder-${Date.now()}`,
        mode: 'cost-efficient'
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

      // Track actual usage and cost
      await costEfficientRouter.trackUsage(modelUsed, usage.totalCost, {
        input: usage.inputTokens,
        output: usage.outputTokens
      });

      return {
        content: fullContent,
        model: modelUsed,
        provider: handlerName,
        tokens: {
          input: usage.inputTokens,
          output: usage.outputTokens
        },
        finishReason: 'stop',
        costInfo: {
          estimatedCost: selection.estimatedCost,
          tier: selection.tier,
          reasoning: selection.reasoning
        }
      };

    } catch (error) {
      Logger.error(`Unified API handler ${handlerName} failed:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Execute request using legacy providers as fallback
   */
  private async executeWithLegacyProviders(
    messages: any[],
    selection: { model: string; tier: string; estimatedCost: number; reasoning: string },
    context: CostTaskContext,
    options: any
  ): Promise<AIResponse & { costInfo: { estimatedCost: number; tier: string; reasoning: string } }> {
    // Convert cost task context to legacy task context
    const legacyContext: TaskContext = {
      type: context.type,
      complexity: context.complexity,
      priority: context.priority,
      requirements: context.requirements
    };

    // Use existing chat method
    const response = await this.chat(messages, legacyContext, {
      ...options,
      model: selection.model
    });

    // Track usage (estimate cost for legacy providers)
    const estimatedCost = selection.estimatedCost;
    await costEfficientRouter.trackUsage(response.model, estimatedCost, response.tokens || { input: 0, output: 0 });

    return {
      ...response,
      costInfo: {
        estimatedCost: selection.estimatedCost,
        tier: selection.tier,
        reasoning: selection.reasoning
      }
    };
  }

  /**
   * Map model ID to appropriate handler name
   */
  private mapModelToHandler(modelId: string): string {
    if (modelId.startsWith('anthropic/')) return 'openrouter';
    if (modelId.startsWith('google/')) return 'openrouter';
    if (modelId.startsWith('deepseek/')) return 'openrouter';
    if (modelId.startsWith('qwen/')) return 'openrouter';
    if (modelId.startsWith('meta-llama/')) return 'openrouter';
    if (modelId.startsWith('mistralai/')) return 'openrouter';
    if (modelId.startsWith('groq/')) return 'groq';
    if (modelId.startsWith('ollama/')) return 'ollama';
    
    // Default to OpenRouter for unified access
    return 'openrouter';
  }

  /**
   * Build task-specific system prompt
   */
  private buildTaskSystemPrompt(context: CostTaskContext): string {
    const basePrompt = `You are Recoder, an AI that generates REAL, PRODUCTION-READY code. Never create mock implementations.

CORE PRINCIPLES:
1. Generate ACTUAL working code with real functionality
2. Include proper error handling and validation
3. Use real API integrations and database operations
4. Include comprehensive TypeScript types
5. Generate working implementations, not placeholders
6. Add proper security measures
7. Use environment variables for configuration`;

    const taskSpecific = {
      blockchain: `
BLOCKCHAIN SPECIALIZATION:
- Generate real smart contracts that compile and deploy
- Include actual token operations and DEX functionality
- Real wallet integration with proper transaction handling
- Solana/Ethereum mainnet-ready code`,
      web: `
WEB DEVELOPMENT SPECIALIZATION:
- Generate complete React/Next.js applications
- Real backend APIs with database connections
- Proper state management and routing
- Production-ready styling and responsiveness`,
      backend: `
BACKEND SPECIALIZATION:
- Real database schemas with migrations
- Production API endpoints with rate limiting
- Proper authentication (JWT, OAuth2)
- Real payment processing integration`,
      security: `
SECURITY SPECIALIZATION:
- Implement real security measures
- Input validation and XSS prevention
- SQL injection protection
- Proper secrets management`
    };

    return basePrompt + (taskSpecific[context.type as keyof typeof taskSpecific] || '');
  }

  /**
   * Enhanced chat using the unified API system with full cost optimization
   */
  async chatUnified(
    messages: any[],
    context: CostTaskContext,
    options: UnifiedAPIOptions = {}
  ): Promise<AIResponse & { costInfo?: any; usage?: any }> {
    try {
      // Convert messages to unified format
      const unifiedMessages: AIMessage[] = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      }));

      // Use unified API with cost optimization
      const result = await unifiedAPI.generateResponse(unifiedMessages, context, {
        ...options,
        costOptimized: true
      });

      Logger.info(`✅ Unified API: ${result.model} (${result.provider})`);
      if (result.costInfo) {
        Logger.info(`💰 Cost: $${result.costInfo.estimatedCost.toFixed(4)} (${result.costInfo.tier})`);
      }

      return {
        content: result.content,
        model: result.model,
        provider: result.provider,
        tokens: result.tokens,
        finishReason: result.finishReason,
        costInfo: result.costInfo,
        usage: result.usage
      };

    } catch (error) {
      Logger.error('Unified chat failed:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Stream responses using unified API
   */
  async *streamUnified(
    messages: any[],
    context: CostTaskContext,
    options: UnifiedAPIOptions = {}
  ): AsyncGenerator<{ type: string; content: string; usage?: any }> {
    const unifiedMessages: AIMessage[] = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }));

    yield* unifiedAPI.streamResponse(unifiedMessages, context, options);
  }

  /**
   * Get unified provider information
   */
  getUnifiedProviders(): Array<{
    name: string;
    models: string[];
    capabilities: string[];
    cost: 'free' | 'paid' | 'mixed';
    available: boolean;
  }> {
    const capabilities = unifiedAPI.getAllProviders();
    const available = unifiedAPI.getAvailableProviders();
    
    return capabilities.map(provider => ({
      ...provider,
      available: available.includes(provider.name)
    }));
  }

  /**
   * Get cost optimization statistics and recommendations
   */
  getCostOptimizationStats(): {
    dailyStats: any;
    recommendations: any;
    supportedModels: string[];
    unifiedProviders: string[];
  } {
    return {
      dailyStats: costEfficientRouter.getUsageStats(),
      recommendations: costEfficientRouter.getCostOptimizationRecommendations(),
      supportedModels: Array.from(this.unifiedApiHandlers.keys()),
      unifiedProviders: unifiedAPI.getAvailableProviders()
    };
  }

  /**
   * Generate production-ready code (not mock code!)
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
      temperature: 0.3, // Lower temperature for code generation
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
    // Parse the AI response to extract structured code output
    const files: Array<{ path: string; content: string; }> = [];
    let instructions = '';
    let tests = '';
    let deployment = '';

    // Extract code blocks and file structures from the response
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

    // Extract instructions, tests, and deployment info
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
   * Get available providers info with latest model rankings
   */
  getAvailableProviders(): Array<{
    name: string; 
    specialties: string[]; 
    available: boolean; 
    cost: string; 
    privacy: string;
    topModels?: ModelRanking[];
    performance?: {
      codingScore: number;
      costEfficiency: number;
      tokenCapacity: string;
    };
  }> {
    // Get provider diversity and performance data from rankings
    const providerDiversity = modelSelector.getProviderDiversity();
    const freeModels = modelSelector.getFreeModels();
    const performanceModels = modelSelector.getPerformanceOptimizedModels();
    
    const allProviders = [
      { 
        name: 'ollama', 
        specialties: ['code-generation', 'local-processing', 'privacy-first', 'offline-capable'], 
        available: false,
        cost: 'free',
        privacy: 'local'
      },
      { 
        name: 'claude', 
        specialties: ['blockchain', 'security', 'complex-reasoning', 'architecture'], 
        available: false,
        cost: 'paid',
        privacy: 'cloud'
      },
      { 
        name: 'groq', 
        specialties: ['react', 'nextjs', 'rapid-prototyping', 'fast-generation'], 
        available: false,
        cost: 'free/paid',
        privacy: 'cloud'
      },
      { 
        name: 'gemini', 
        specialties: ['multimodal', 'large-codebases', 'documentation', 'fast-generation'], 
        available: false,
        cost: 'free/paid',
        privacy: 'cloud'
      },
      { 
        name: 'mistral', 
        specialties: ['code-generation', 'multilingual', 'reasoning'], 
        available: false,
        cost: 'paid',
        privacy: 'cloud'
      },
      { 
        name: 'perplexity', 
        specialties: ['research', 'real-time-data', 'web-search'], 
        available: false,
        cost: 'paid',
        privacy: 'cloud'
      },
      { 
        name: 'cohere', 
        specialties: ['text-generation', 'classification', 'summarization'], 
        available: false,
        cost: 'paid',
        privacy: 'cloud'
      },
      { 
        name: 'kimi', 
        specialties: ['analysis', 'long-context', 'chinese-language', 'performance'], 
        available: false,
        cost: 'paid',
        privacy: 'cloud'
      },
      { 
        name: 'qwen', 
        specialties: ['code-generation', 'efficiency', 'instruction-following', 'free-tier'], 
        available: false,
        cost: 'free',
        privacy: 'cloud'
      },
      { 
        name: 'deepseek', 
        specialties: ['reasoning', 'step-by-step', 'cost-effective', 'problem-solving', 'free-tier'], 
        available: false,
        cost: 'free',
        privacy: 'cloud'
      },
      { 
        name: 'huggingface', 
        specialties: ['code-generation', 'text-generation', 'open-source-models', 'cost-effective'], 
        available: false,
        cost: 'free/paid',
        privacy: 'cloud'
      },
      { 
        name: 'openrouter', 
        specialties: ['multi-model-access', 'cost-optimization', 'model-variety', 'api-aggregation'], 
        available: false,
        cost: 'paid',
        privacy: 'cloud'
      },
      { 
        name: 'together', 
        specialties: ['open-source-models', 'fast-inference', 'code-generation', 'cost-effective'], 
        available: false,
        cost: 'paid',
        privacy: 'cloud'
      }
    ];

    return allProviders.map(p => {
      const providerModels = providerDiversity[p.name] || [];
      const topModel = providerModels[0]; // Best model for this provider
      
      return {
        ...p,
        available: this.providers.has(p.name),
        topModels: providerModels.slice(0, 3), // Top 3 models
        performance: topModel ? {
          codingScore: topModel.codingScore,
          costEfficiency: topModel.costEfficiency,
          tokenCapacity: topModel.tokenCapacity
        } : undefined
      };
    });
  }

  /**
   * Generate response using configured AI model (legacy method)
   */
  public async generateResponse(prompt: string, options: AIRequestOptions = {}): Promise<string> {
    try {
      const model = options.model || 'claude-3-sonnet-20240229';
      
      // For now, return a simulated response
      // In a real implementation, this would call the actual AI APIs
      
      Logger.debug(`Generating response with model: ${model}`);
      
      const responses = [
        "I understand you want to work on that. Let me help you get started with the implementation.",
        "That's a great idea! I can help you build that using modern best practices.",
        "I'll help you create that. Let me break down what we need to do step by step.",
        "Perfect! I can generate the code for that. Let me structure it properly for you.",
        "I can definitely help with that project. Let me create a solid foundation for you."
      ];
      
      // Simulate response based on prompt content
      let response = responses[Math.floor(Math.random() * responses.length)];
      
      if (prompt.toLowerCase().includes('react')) {
        response = "I'll help you create a React application with modern hooks, TypeScript, and best practices. Let me set up the component structure for you.";
      } else if (prompt.toLowerCase().includes('solana') || prompt.toLowerCase().includes('blockchain')) {
        response = "I'll help you build a Solana application with real on-chain functionality. This will include proper wallet integration and program interactions.";
      } else if (prompt.toLowerCase().includes('ai') || prompt.toLowerCase().includes('chatbot')) {
        response = "I'll help you create an AI-powered application with real language model integration and conversation management.";
      } else if (prompt.toLowerCase().includes('api') || prompt.toLowerCase().includes('backend')) {
        response = "I'll help you build a robust API with proper authentication, validation, and database integration.";
      }
      
      return response;
      
    } catch (error) {
      Logger.error(`AI generation failed: ${error}`, '');
      if (error && typeof error === 'object' && 'message' in error) {
        throw new Error(`Failed to generate AI response: ${(error as any).message}`);
      } else {
        throw new Error('Failed to generate AI response: Unknown error');
      }
    }
  }

  /**
   * Generate streaming response
   */
  public async generateStreamingResponse(
    prompt: string,
    options: AIRequestOptions = {},
    onChunk: (chunk: string) => void
  ): Promise<void> {
    try {
      const response = await this.generateResponse(prompt, options);
      
      // Simulate streaming by sending chunks
      const words = response.split(' ');
      for (let i = 0; i < words.length; i++) {
        const chunk = words[i] + (i < words.length - 1 ? ' ' : '');
        onChunk(chunk);
        
        // Simulate delay between chunks
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
    } catch (error) {
      Logger.error(`AI streaming failed: ${error}`, '');
      throw error;
    }
  }

  /**
   * Parse natural language for code generation intent
   */
  public async parseCodeIntent(input: string): Promise<{
    type: string;
    framework?: string;
    features: string[];
    complexity: 'simple' | 'medium' | 'complex';
    description: string;
  }> {
    const normalizedInput = input.toLowerCase();
    
    // Detect project type
    let type = 'web';
    if (normalizedInput.includes('solana') || normalizedInput.includes('blockchain') || normalizedInput.includes('smart contract')) {
      type = 'blockchain';
    } else if (normalizedInput.includes('ai') || normalizedInput.includes('chatbot') || normalizedInput.includes('machine learning')) {
      type = 'ai';
    } else if (normalizedInput.includes('mobile') || normalizedInput.includes('react native') || normalizedInput.includes('app store')) {
      type = 'mobile';
    } else if (normalizedInput.includes('api') || normalizedInput.includes('backend') || normalizedInput.includes('server')) {
      type = 'api';
    }

    // Detect framework
    let framework = '';
    if (normalizedInput.includes('react') || normalizedInput.includes('jsx')) {
      framework = 'react';
    } else if (normalizedInput.includes('vue')) {
      framework = 'vue';
    } else if (normalizedInput.includes('angular')) {
      framework = 'angular';
    } else if (normalizedInput.includes('svelte')) {
      framework = 'svelte';
    } else if (normalizedInput.includes('next')) {
      framework = 'nextjs';
    }

    // Detect features
    const features: string[] = [];
    if (normalizedInput.includes('auth') || normalizedInput.includes('login') || normalizedInput.includes('sign')) {
      features.push('authentication');
    }
    if (normalizedInput.includes('database') || normalizedInput.includes('db') || normalizedInput.includes('storage')) {
      features.push('database');
    }
    if (normalizedInput.includes('api') || normalizedInput.includes('rest') || normalizedInput.includes('graphql')) {
      features.push('api');
    }
    if (normalizedInput.includes('test') || normalizedInput.includes('testing')) {
      features.push('testing');
    }
    if (normalizedInput.includes('docker') || normalizedInput.includes('container')) {
      features.push('containerization');
    }
    if (normalizedInput.includes('deploy') || normalizedInput.includes('production')) {
      features.push('deployment');
    }

    // Determine complexity
    let complexity: 'simple' | 'medium' | 'complex' = 'medium';
    if (normalizedInput.includes('simple') || normalizedInput.includes('basic') || normalizedInput.includes('minimal')) {
      complexity = 'simple';
    } else if (normalizedInput.includes('complex') || normalizedInput.includes('advanced') || normalizedInput.includes('enterprise')) {
      complexity = 'complex';
    }

    return {
      type,
      framework,
      features,
      complexity,
      description: input
    };
  }

  /**
   * Get available AI models
   */
  public getAvailableModels(): string[] {
    return [
      'claude-4',
      'claude-3-opus',
      'claude-3-sonnet',
      'gpt-4',
      'gpt-4-turbo',
      'gpt-3.5-turbo',
      'gemini-pro',
      'gemini-ultra',
      'llama-70b',
      'mixtral-8x7b',
      'mistral-large-2407',
      'mistral-nemo',
      'llama-3.1-sonar-large-128k-online',
      'command-r-plus'
    ];
  }

  /**
   * Validate model availability
   */
  public isModelAvailable(model: string): boolean {
    return this.getAvailableModels().includes(model);
  }

  /**
   * Get model capabilities
   */
  public getModelCapabilities(model: string): {
    maxTokens: number;
    supportsCoding: boolean;
    supportsStreaming: boolean;
    cost: number;
  } {
    const capabilities = {
      'claude-4': { maxTokens: 100000, supportsCoding: true, supportsStreaming: true, cost: 0.03 },
      'claude-3-opus': { maxTokens: 200000, supportsCoding: true, supportsStreaming: true, cost: 0.015 },
      'claude-3-sonnet': { maxTokens: 200000, supportsCoding: true, supportsStreaming: true, cost: 0.003 },
      'gpt-4': { maxTokens: 8192, supportsCoding: true, supportsStreaming: true, cost: 0.03 },
      'gpt-4-turbo': { maxTokens: 128000, supportsCoding: true, supportsStreaming: true, cost: 0.01 },
      'gpt-3.5-turbo': { maxTokens: 16385, supportsCoding: true, supportsStreaming: true, cost: 0.001 },
      'gemini-pro': { maxTokens: 32768, supportsCoding: true, supportsStreaming: true, cost: 0.0005 },
      'gemini-ultra': { maxTokens: 32768, supportsCoding: true, supportsStreaming: true, cost: 0.002 },
      'llama-70b': { maxTokens: 4096, supportsCoding: true, supportsStreaming: true, cost: 0.0007 },
      'mixtral-8x7b': { maxTokens: 32768, supportsCoding: true, supportsStreaming: true, cost: 0.0006 },
      'mistral-large-2407': { maxTokens: 128000, supportsCoding: true, supportsStreaming: true, cost: 0.003 },
      'mistral-nemo': { maxTokens: 128000, supportsCoding: true, supportsStreaming: true, cost: 0.0003 },
      'llama-3.1-sonar-large-128k-online': { maxTokens: 127072, supportsCoding: false, supportsStreaming: true, cost: 0.001 },
      'command-r-plus': { maxTokens: 128000, supportsCoding: true, supportsStreaming: true, cost: 0.003 }
    };

    return capabilities[model as keyof typeof capabilities] || { maxTokens: 4096, supportsCoding: false, supportsStreaming: false, cost: 0.001 };
  }

  private loadCustomProviders(): CustomProvider[] {
    const customProviders: CustomProvider[] = [];
    
    try {
      const customConfig = process.env.RECODER_CUSTOM_PROVIDERS;
      if (customConfig) {
        const configs: CustomProviderConfig[] = JSON.parse(customConfig);
        for (const config of configs) {
          const provider = new CustomProvider(config);
          if (provider.isAvailable()) {
            customProviders.push(provider);
            Logger.info(`✅ Loaded custom provider: ${config.name}`);
          }
        }
      }
    } catch (error: any) {
      Logger.warn('Failed to load custom providers: ' + (error instanceof Error ? error.message : String(error)), '');
    }
    
    return customProviders;
  }

  public addCustomProvider(config: CustomProviderConfig): boolean {
    try {
      const provider = new CustomProvider(config);
      if (provider.isAvailable()) {
        this.providers.set(config.name, provider);
        Logger.info(`✅ Added custom provider: ${config.name}`);
        return true;
      }
    } catch (error: any) {
      Logger.error(`Failed to add custom provider ${config.name}: ` + (error instanceof Error ? error.message : String(error)), '');
    }
    return false;
  }

  /**
   * Estimate cost for request
   */
  public estimateCost(prompt: string, model: string, options: AIRequestOptions = {}): number {
    const capabilities = this.getModelCapabilities(model);
    const estimatedTokens = Math.ceil(prompt.length / 4); // Rough estimation
    const maxTokens = options.maxTokens || 1000;
    
    return ((estimatedTokens + maxTokens) / 1000) * capabilities.cost;
  }

  /**
   * Use the copied API folder directly (from extension)
   * This uses the exact same API system as the extension with 20+ providers
   */
  async chatWithExtensionAPI(
    messages: AIMessage[],
    provider: string = 'openrouter',
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
    } = {}
  ): Promise<AIResponse> {
    try {
      // Build provider settings for the copied API system
      const providerSettings: ProviderSettings = this.buildProviderSettings(provider, options);
      
      // Use buildApiHandler from the copied API folder
      const handler = buildApiHandler(providerSettings);
      
      // Build system prompt
      const systemPrompt = `You are Recoder, an AI that generates REAL, PRODUCTION-READY code. Never create mock implementations.

CORE PRINCIPLES:
1. Generate ACTUAL working code with real functionality
2. Include proper error handling and validation
3. Use real API integrations and database operations
4. Include comprehensive TypeScript types
5. Generate working implementations, not placeholders`;

      // Convert messages to the format expected by the API
      const apiMessages = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

      // Create stream and collect response
      let fullContent = '';
      let usage = { inputTokens: 0, outputTokens: 0, totalCost: 0 };
      let modelUsed = options.model || 'claude-3.5-sonnet';

      const stream = handler.createMessage(systemPrompt, apiMessages, {
        taskId: `cli-${Date.now()}`,
        mode: 'production-generation'
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

      Logger.info(`✅ Extension API: ${provider} (${modelUsed}) - Tokens: ${usage.inputTokens}→${usage.outputTokens}`);

      return {
        content: fullContent,
        model: modelUsed,
        provider: provider,
        tokens: {
          input: usage.inputTokens,
          output: usage.outputTokens
        },
        finishReason: 'stop'
      };

    } catch (error: any) {
      Logger.error(`Extension API call failed for ${provider}:`, error.message);
      throw new Error(`Extension API call failed: ${error.message}`);
    }
  }

  /**
   * Build provider settings for the extension's API system
   */
  private buildProviderSettings(provider: string, options: any): ProviderSettings {
    const settings: ProviderSettings = {
      apiProvider: provider
    };

    // Add provider-specific settings based on environment variables
    switch (provider) {
      case 'openrouter':
        settings.openRouterApiKey = process.env.OPENROUTER_API_KEY;
        settings.openRouterModelId = options.model || 'anthropic/claude-3.5-sonnet';
        break;
      
      case 'anthropic':
        settings.apiKey = process.env.ANTHROPIC_API_KEY;
        settings.apiModelId = options.model || 'claude-3-5-sonnet-20241022';
        break;
      
      case 'gemini':
        settings.geminiApiKey = process.env.GOOGLE_API_KEY;
        settings.geminiModelId = options.model || 'gemini-2.0-flash-exp';
        break;
      
      case 'groq':
        settings.groqApiKey = process.env.GROQ_API_KEY;
        settings.groqModelId = options.model || 'llama-3.1-70b-versatile';
        break;
      
      case 'deepseek':
        settings.deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
        settings.deepSeekModelId = options.model || 'deepseek-r1';
        break;
      
      case 'ollama':
        settings.ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        settings.ollamaModelId = options.model || 'llama3.2:latest';
        break;
      
      default:
        // For other providers, use generic settings
        settings.apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];
        settings.apiModelId = options.model;
    }

    // Add common settings
    if (options.temperature !== undefined) {
      settings.temperature = options.temperature;
    }
    if (options.maxTokens !== undefined) {
      settings.maxTokens = options.maxTokens;
    }

    return settings;
  }

  /**
   * Generate text using AI provider
   */
  async generateText(prompt: string, options: any = {}): Promise<string> {
    const messages = [{ role: 'user', content: prompt }];
    const context: TaskContext = {
      type: options.type || 'general',
      complexity: options.complexity || 'medium',
      priority: options.priority || 'balanced'
    };
    
    const response = await this.chat(messages, context, options);
    return response.content || '';
  }
}