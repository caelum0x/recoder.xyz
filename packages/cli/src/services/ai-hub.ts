/**
 * AI Hub - Multi-Provider AI Orchestration with Real API Integrations
 */

import chalk from 'chalk';
import axios, { AxiosInstance } from 'axios';
import { Logger } from '../utils/logger';

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

// Claude/Anthropic Provider
class AnthropicProvider implements AIProvider {
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
class GroqProvider implements AIProvider {
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
class GeminiProvider implements AIProvider {
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

export class AIHub {
  private providers: Map<string, AIProvider> = new Map();
  private providerPreferences: Map<string, string[]> = new Map();
  private static instance: AIHub;

  private constructor() {
    this.initializeProviders();
    this.setupProviderPreferences();
  }

  public static getInstance(): AIHub {
    if (!AIHub.instance) {
      AIHub.instance = new AIHub();
    }
    return AIHub.instance;
  }

  private initializeProviders(): void {
    // Initialize all AI providers
    const providers = [
      new AnthropicProvider(),
      new GroqProvider(),
      new GeminiProvider()
    ];

    for (const provider of providers) {
      if (provider.isAvailable()) {
        this.providers.set(provider.name, provider);
        Logger.info(`✅ Initialized ${provider.name} provider`);
      } else {
        Logger.warn(`⚠️ ${provider.name} provider not available (missing API key)`);
      }
    }

    if (this.providers.size === 0) {
      Logger.error('❌ No AI providers available. Please configure API keys in environment variables:');
      Logger.error('   ANTHROPIC_API_KEY - for Claude');
      Logger.error('   GROQ_API_KEY - for Groq/Llama');
      Logger.error('   GOOGLE_API_KEY - for Gemini');
    }
  }

  private setupProviderPreferences(): void {
    // Define task-specific provider preferences
    this.providerPreferences.set('blockchain', ['claude', 'groq', 'gemini']);
    this.providerPreferences.set('web', ['groq', 'claude', 'gemini']);
    this.providerPreferences.set('mobile', ['groq', 'claude', 'gemini']);
    this.providerPreferences.set('backend', ['groq', 'claude', 'gemini']);
    this.providerPreferences.set('security', ['claude', 'gemini', 'groq']);
    this.providerPreferences.set('devops', ['claude', 'groq', 'gemini']);
    this.providerPreferences.set('general', ['groq', 'claude', 'gemini']);
  }

  /**
   * Smart model selection based on task context
   */
  selectBestProvider(context: TaskContext): AIProvider {
    const preferences = this.providerPreferences.get(context.type) || ['groq', 'claude'];
    
    // Find the first available provider from preferences
    for (const providerName of preferences) {
      const provider = this.providers.get(providerName);
      if (provider) {
        Logger.debug(`🎯 Selected ${providerName} for ${context.type} task`);
        return provider;
      }
    }

    // Fallback to any available provider
    const fallback = Array.from(this.providers.values())[0];
    if (fallback) {
      Logger.warn(`⚠️ Using fallback provider ${fallback.name} for ${context.type} task`);
      return fallback;
    }

    throw new Error('❌ No AI providers available. Please configure API keys.');
  }

  /**
   * Chat with AI using smart provider selection
   */
  async chat(
    messages: any[], 
    context: TaskContext, 
    options: any = {}
  ): Promise<AIResponse> {
    const provider = this.selectBestProvider(context);
    
    try {
      const response = await provider.chat(messages, options);
      Logger.info(`✅ ${provider.name} responded with ${response.tokens?.output || 0} tokens`);
      return response;
    } catch (error) {
      Logger.error(`❌ Provider ${provider.name} failed, trying fallback...`);
      return this.chatWithFallback(messages, context, options, provider.name);
    }
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
        Logger.error(`❌ Fallback provider ${name} also failed`);
        continue;
      }
    }

    throw new Error('❌ All AI providers failed. Please check API keys and network connection.');
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

    return basePrompt + (specializations[context.type] || '');
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
   * Get available providers info
   */
  getAvailableProviders(): Array<{name: string; specialties: string[]; available: boolean}> {
    const allProviders = [
      { name: 'claude', specialties: ['blockchain', 'security', 'complex-reasoning'], available: false },
      { name: 'groq', specialties: ['react', 'nextjs', 'rapid-prototyping'], available: false },
      { name: 'gemini', specialties: ['multimodal', 'large-codebases', 'documentation'], available: false }
    ];

    return allProviders.map(p => ({
      ...p,
      available: this.providers.has(p.name)
    }));
  }

  /**
   * Generate response using configured AI model (legacy method)
   */
  public async generateResponse(prompt: string, options: AIRequestOptions = {}): Promise<string> {
    try {
      const config = ConfigManager.getChatConfig();
      const model = options.model || config.model;
      
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
      Logger.error(`AI generation failed: ${error}`);
      throw new Error(`Failed to generate AI response: ${error.message}`);
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
      Logger.error(`AI streaming failed: ${error}`);
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
      'mixtral-8x7b'
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
      'mixtral-8x7b': { maxTokens: 32768, supportsCoding: true, supportsStreaming: true, cost: 0.0006 }
    };

    return capabilities[model] || { maxTokens: 4096, supportsCoding: false, supportsStreaming: false, cost: 0.001 };
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
}