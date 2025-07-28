/**
 * AI Hub Service for Production Engine
 * Orchestrates multiple AI providers for REAL code generation
 */

import { logger } from '../utils/logger';
import axios, { AxiosInstance } from 'axios';
import { enhancedOllamaIntegration } from './enhanced-ollama-integration';

export interface AIProvider {
  name: string;
  generateCode(prompt: string, options: any): Promise<string>;
  isAvailable(): Promise<boolean>;
}

export interface GenerationOptions {
  type: 'web' | 'blockchain' | 'backend' | 'mobile' | 'ai' | 'payments';
  complexity: 'low' | 'medium' | 'high';
  maxTokens: number;
  temperature?: number;
}

export class AIHubService {
  private providers: Map<string, AIProvider> = new Map();
  private initialized: boolean = false;

  constructor() {
    this.initializeProviders().catch(error => {
      logger.error('Failed to initialize AI providers:', error);
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initializeProviders();
    }
  }

  private async initializeProviders() {
    // Initialize AI providers based on available API keys
    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.set('claude', new ClaudeProvider());
    }
    if (process.env.GROQ_API_KEY) {
      this.providers.set('groq', new GroqProvider());
    }
    if (process.env.GOOGLE_API_KEY) {
      this.providers.set('gemini', new GeminiProvider());
    }
    if (process.env.OPENAI_API_KEY) {
      this.providers.set('openai', new OpenAIProvider());
    }
    
    // Always try to initialize Ollama for local AI capability
    const ollamaProvider = new OllamaProvider();
    if (await ollamaProvider.isAvailable()) {
      this.providers.set('ollama', ollamaProvider);
      logger.info('✅ Ollama local AI provider available');
    } else {
      logger.info('🔄 Ollama not available, will attempt auto-installation if needed');
      // Still add it to providers list for potential auto-installation
      this.providers.set('ollama', ollamaProvider);
    }

    logger.info(`Initialized ${this.providers.size} AI providers`);
    
    // If no cloud providers available, prioritize Ollama setup
    const cloudProviders = ['claude', 'groq', 'gemini', 'openai'].filter(name => this.providers.has(name));
    if (cloudProviders.length === 0) {
      logger.info('🏠 No cloud AI providers configured, using local Ollama for code generation');
      await this.ensureOllamaReady();
    }
    
    this.initialized = true;
  }

  private async ensureOllamaReady(): Promise<void> {
    try {
      logger.info('🚀 Checking Ollama availability through enhanced integration...');
      
      const ollamaStatus = await enhancedOllamaIntegration.checkAvailability();
      
      if (ollamaStatus.available) {
        logger.info(`✅ Ollama ready with ${ollamaStatus.models.length} models: ${ollamaStatus.models.join(', ')}`);
      } else if (ollamaStatus.success) {
        logger.info('🔄 Ollama installed but not running, attempting setup...');
        const setupResult = await enhancedOllamaIntegration.setupOllama();
        
        if (setupResult.success) {
          logger.info(`✅ ${setupResult.message}`);
        } else {
          logger.warn(`⚠️ ${setupResult.message}`);
        }
      } else {
        logger.info('💡 To use local AI:');
        logger.info('   1. Install Ollama from https://ollama.ai/');
        logger.info('   2. Run: ollama pull llama3:latest');
        logger.info('   3. Run: ollama pull codellama:latest');
      }
    } catch (error: any) {
      logger.warn(`Ollama setup check failed: ${error.message}`);
    }
  }

  async generateWithBestModel(prompt: string, options: GenerationOptions): Promise<string> {
    await this.ensureInitialized();
    const bestProvider = this.selectBestProvider(options.type, options.complexity);
    
    try {
      const result = await bestProvider.generateCode(prompt, options);
      logger.info(`Code generated successfully using ${bestProvider.name}`);
      return result;
    } catch (error) {
      logger.warn(`Primary provider ${bestProvider.name} failed, trying fallback`);
      
      // Try fallback providers
      for (const [name, provider] of this.providers) {
        if (provider !== bestProvider && await provider.isAvailable()) {
          try {
            const result = await provider.generateCode(prompt, options);
            logger.info(`Code generated using fallback provider ${name}`);
            return result;
          } catch (fallbackError) {
            logger.warn(`Fallback provider ${name} also failed`);
          }
        }
      }
      
      throw new Error('All AI providers failed to generate code');
    }
  }

  private selectBestProvider(type: string, complexity: string): AIProvider {
    // Smart provider selection based on task type and complexity
    const providerPriority = {
      blockchain: ['claude', 'gemini', 'groq', 'openai'],
      web: ['groq', 'claude', 'gemini', 'openai'],
      backend: ['claude', 'groq', 'gemini', 'openai'],
      mobile: ['groq', 'gemini', 'claude', 'openai'],
      ai: ['claude', 'gemini', 'openai', 'groq'],
      payments: ['claude', 'groq', 'gemini', 'openai']
    };

    const priorities = providerPriority[type] || ['claude', 'groq', 'gemini', 'openai'];
    
    for (const providerName of priorities) {
      const provider = this.providers.get(providerName);
      if (provider) {
        return provider;
      }
    }

    // Return first available provider as fallback
    const firstProvider = this.providers.values().next().value;
    if (!firstProvider) {
      throw new Error('No AI providers available');
    }
    
    return firstProvider;
  }

  async getAvailableProviders(): Promise<string[]> {
    await this.ensureInitialized();
    const available = [];
    for (const [name, provider] of this.providers) {
      if (await provider.isAvailable()) {
        available.push(name);
      }
    }
    return available;
  }
}

// Real Provider implementations
class ClaudeProvider implements AIProvider {
  name = 'claude';
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.anthropic.com/v1',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      timeout: 60000
    });
  }

  async generateCode(prompt: string, options: any): Promise<string> {
    try {
      const messages = [
        {
          role: 'user',
          content: `Generate REAL, PRODUCTION-READY code for: ${prompt}

Requirements:
- Must be fully functional, not placeholder code  
- Include actual database operations with proper CRUD
- Real API endpoints with authentication and error handling
- Proper error handling and validation
- Include comments explaining the implementation

Context: ${JSON.stringify(options, null, 2)}`
        }
      ];

      const response = await this.client.post('/messages', {
        model: options.model || 'claude-3-sonnet-20240229',
        max_tokens: options.maxTokens || 8000,
        messages,
        temperature: 0.3
      });

      const content = response.data.content[0].text;
      logger.info(`Claude generated ${content.length} characters of code`);
      return content;
    } catch (error: any) {
      logger.error(`Claude API error: ${error.message}`);
      throw new Error(`Claude code generation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.ANTHROPIC_API_KEY;
  }
}

class GroqProvider implements AIProvider {
  name = 'groq';
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.groq.com/openai/v1',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY || ''}`
      },
      timeout: 60000
    });
  }

  async generateCode(prompt: string, options: any): Promise<string> {
    try {
      const messages = [
        {
          role: 'system',
          content: 'You are a senior software engineer who generates REAL, PRODUCTION-READY code. Never use placeholder or mock implementations. All code must be fully functional.'
        },
        {
          role: 'user',
          content: `Generate REAL, WORKING code for: ${prompt}

Requirements:
- Must be fully functional with real implementations
- Include actual React components with proper hooks and state management
- Real API calls with proper error handling
- Proper TypeScript types and interfaces
- Include styling and responsive design

Context: ${JSON.stringify(options, null, 2)}`
        }
      ];

      const response = await this.client.post('/chat/completions', {
        model: options.model || 'llama3-70b-8192',
        messages,
        max_tokens: options.maxTokens || 8000,
        temperature: 0.3
      });

      const content = response.data.choices[0].message.content;
      logger.info(`Groq generated ${content.length} characters of code`);
      return content;
    } catch (error: any) {
      logger.error(`Groq API error: ${error.message}`);
      throw new Error(`Groq code generation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.GROQ_API_KEY;
  }
}

class GeminiProvider implements AIProvider {
  name = 'gemini';
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      params: {
        key: process.env.GOOGLE_API_KEY || ''
      },
      timeout: 60000
    });
  }

  async generateCode(prompt: string, options: any): Promise<string> {
    try {
      const contents = [
        {
          role: 'user',
          parts: [{
            text: `Generate REAL, PRODUCTION-READY code for: ${prompt}

Requirements:
- Must be fully functional, not placeholder code
- Include actual database operations and API integrations  
- Real authentication and authorization
- Proper error handling and validation
- Include comprehensive documentation and tests

Context: ${JSON.stringify(options, null, 2)}`
          }]
        }
      ];

      const response = await this.client.post('/models/gemini-pro:generateContent', {
        contents,
        generationConfig: {
          maxOutputTokens: options.maxTokens || 8000,
          temperature: 0.3
        }
      });

      const content = response.data.candidates[0].content.parts[0].text;
      logger.info(`Gemini generated ${content.length} characters of code`);
      return content;
    } catch (error: any) {
      logger.error(`Gemini API error: ${error.message}`);
      throw new Error(`Gemini code generation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.GOOGLE_API_KEY;
  }
}

class OpenAIProvider implements AIProvider {
  name = 'openai';
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.openai.com/v1',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`
      },
      timeout: 60000
    });
  }

  async generateCode(prompt: string, options: any): Promise<string> {
    try {
      const messages = [
        {
          role: 'system',
          content: 'You are a senior software engineer who generates REAL, PRODUCTION-READY code. Never use placeholder or mock implementations. All code must be fully functional and deployable.'
        },
        {
          role: 'user',
          content: `Generate REAL, WORKING code for: ${prompt}

Requirements:
- Must be fully functional, not placeholder code
- Include actual implementations with real logic
- Proper error handling and validation
- Include tests and documentation
- Production-ready code quality

Context: ${JSON.stringify(options, null, 2)}`
        }
      ];

      const response = await this.client.post('/chat/completions', {
        model: options.model || 'gpt-4',
        messages,
        max_tokens: options.maxTokens || 8000,
        temperature: 0.3
      });

      const content = response.data.choices[0].message.content;
      logger.info(`OpenAI generated ${content.length} characters of code`);
      return content;
    } catch (error: any) {
      logger.error(`OpenAI API error: ${error.message}`);
      throw new Error(`OpenAI code generation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.OPENAI_API_KEY;
  }
}

class OllamaProvider implements AIProvider {
  name = 'ollama';
  private client: AxiosInstance;

  constructor() {
    const baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 120000 // Longer timeout for local model generation
    });
  }

  async generateCode(prompt: string, options: any): Promise<string> {
    try {
      // Try enhanced CLI integration first
      const enhancedResult = await enhancedOllamaIntegration.generateCodeWithCLI(prompt, {
        projectType: options.type || 'web',
        model: options.model,
        maxTokens: options.maxTokens || 8000,
        temperature: options.temperature || 0.3
      });

      if (enhancedResult.success) {
        logger.info(`Enhanced Ollama (${enhancedResult.model}) generated ${enhancedResult.content.length} characters of code`);
        return enhancedResult.content;
      }

      logger.warn('Enhanced integration failed, falling back to direct Ollama API');
      
      // Fallback to direct Ollama API
      const model = options.model || 'llama3:latest';
      
      // Check if model is available
      try {
        await this.client.post('/api/generate', {
          model,
          prompt: 'test',
          stream: false,
          options: { num_predict: 1 }
        });
      } catch (modelError: any) {
        if (modelError.response?.status === 404) {
          logger.info(`Model ${model} not found, attempting to pull...`);
          await this.pullModel(model);
        } else {
          throw modelError;
        }
      }

      const systemPrompt = `You are a senior software engineer who generates REAL, PRODUCTION-READY code. Never use placeholder or mock implementations. All code must be fully functional and deployable.

Generate REAL, WORKING code for: ${prompt}

Requirements:
- Must be fully functional, not placeholder code
- Include actual implementations with real logic
- Proper error handling and validation
- Include comments explaining the implementation
- Production-ready code quality

Context: ${JSON.stringify(options, null, 2)}`;

      const response = await this.client.post('/api/generate', {
        model,
        prompt: systemPrompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: options.maxTokens || 8000,
          top_p: 0.9,
          top_k: 40
        }
      });

      const content = response.data.response;
      logger.info(`Ollama (${model}) generated ${content.length} characters of code`);
      return content;
    } catch (error: any) {
      logger.error(`Ollama code generation failed: ${error.message}`);
      throw new Error(`Ollama code generation failed: ${error.response?.data?.error || error.message}`);
    }
  }

  private async pullModel(model: string): Promise<void> {
    try {
      logger.info(`Pulling Ollama model: ${model}`);
      const response = await this.client.post('/api/pull', {
        name: model,
        stream: false
      });
      logger.info(`Successfully pulled model: ${model}`);
    } catch (error: any) {
      logger.error(`Failed to pull model ${model}: ${error.message}`);
      throw new Error(`Failed to pull Ollama model ${model}: ${error.message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // First try enhanced integration
      const enhancedStatus = await enhancedOllamaIntegration.checkAvailability();
      if (enhancedStatus.success && enhancedStatus.available) {
        return true;
      }

      // Fallback to direct check
      const baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const response = await axios.get(`${baseURL}/api/tags`, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}