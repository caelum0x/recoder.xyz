/**
 * Enhanced Ollama Provider with Auto-Installation
 * 
 * Advanced Ollama provider that integrates with the recoder.xyz AI hub,
 * providing seamless local AI capabilities with auto-installation,
 * intelligent model selection, and offline-first architecture.
 */

import { EventEmitter } from 'events';
import { Logger } from 'recoder-shared';
import { ollamaService, ModelRecommendation } from '../ollama';
import type { AIProvider, AIResponse, TaskContext, AIRequestOptions } from '../ai-hub';

export interface OllamaProviderConfig {
  autoInstall: boolean;              // Auto-install Ollama if not present
  autoStart: boolean;                // Auto-start service on initialization
  preferredModels: string[];         // Models to prioritize
  fallbackToCloud: boolean;          // Fallback to cloud providers if local fails
  maxRetries: number;                // Max retry attempts for requests
  timeout: number;                   // Request timeout in ms
  enableModelRecommendations: boolean; // Use intelligent model selection
}

export interface OllamaCapabilities {
  codeGeneration: boolean;
  codeReview: boolean;
  documentation: boolean;
  debugging: boolean;
  refactoring: boolean;
  security: boolean;
  translation: boolean;
  planning: boolean;
  analysis: boolean;
  chat: boolean;
  streaming: boolean;
  reasoning: boolean;
}

export class EnhancedOllamaProvider extends EventEmitter implements AIProvider {
  name = 'ollama';
  specialties = ['code-generation', 'local-processing', 'privacy-first', 'offline-capable', 'cost-free'];
  
  private config: OllamaProviderConfig;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private requestQueue: Array<{ resolve: Function; reject: Function; request: any }> = [];
  private isProcessingQueue = false;

  private readonly DEFAULT_CONFIG: OllamaProviderConfig = {
    autoInstall: true,
    autoStart: true,
    preferredModels: ['phi:2.7b', 'codellama:7b', 'llama2:7b'],
    fallbackToCloud: false,
    maxRetries: 3,
    timeout: 120000, // 2 minutes for local processing
    enableModelRecommendations: true
  };

  constructor(config?: Partial<OllamaProviderConfig>) {
    super();
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    this.setupEventHandlers();
  }

  /**
   * Check if Ollama provider is available
   */
  isAvailable(): boolean {
    return this.isInitialized;
  }

  /**
   * Initialize the Ollama provider
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.performInitialization();
    await this.initializationPromise;
  }

  private async performInitialization(): Promise<void> {
    Logger.info('Initializing Enhanced Ollama Provider...');

    try {
      // Configure Ollama service
      ollamaService.updateConfig({
        autoInstall: this.config.autoInstall,
        autoStart: this.config.autoStart,
        preferredModels: this.config.preferredModels
      });

      // Initialize Ollama service
      await ollamaService.initialize();

      // Check if service is ready
      const isReady = await ollamaService.isReady();
      
      if (!isReady && this.config.autoInstall) {
        Logger.info('Ollama not ready, installing and configuring...');
        
        // Install with preferred models
        const installResult = await ollamaService.installOllama({
          autoStart: this.config.autoStart,
          includeModels: this.config.preferredModels
        });

        if (!installResult.success) {
          throw new Error(`Ollama installation failed: ${installResult.error?.message}`);
        }

        // Start service if needed
        if (this.config.autoStart) {
          await ollamaService.startService();
        }
      }

      // Verify final readiness
      const finalCheck = await ollamaService.isReady();
      if (!finalCheck) {
        Logger.warn('Ollama provider initialized but service is not ready');
      }

      this.isInitialized = true;
      Logger.info('Enhanced Ollama Provider initialized successfully');
      this.emit('initialized');

      // Start processing any queued requests
      this.processRequestQueue();

    } catch (error) {
      const initError = error instanceof Error ? error : new Error(String(error));
      Logger.error('Failed to initialize Enhanced Ollama Provider:', initError);
      this.emit('error', initError);
      throw initError;
    }
  }

  /**
   * Main chat method for AI hub integration
   */
  async chat(messages: any[], options: AIRequestOptions = {}): Promise<AIResponse> {
    // Ensure provider is initialized
    if (!this.isInitialized) {
      return new Promise((resolve, reject) => {
        this.requestQueue.push({
          resolve: () => this.chat(messages, options).then(resolve).catch(reject),
          reject,
          request: { messages, options }
        });
        
        // Initialize if not already in progress
        this.initialize().catch(reject);
      });
    }

    const startTime = Date.now();
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.config.maxRetries) {
      try {
        // Check if service is ready
        const isReady = await ollamaService.isReady();
        if (!isReady) {
          throw new Error('Ollama service is not ready');
        }

        // Select best model for the task
        const selectedModel = await this.selectBestModel(messages, options);
        
        Logger.debug(`Using Ollama model: ${selectedModel} (attempt ${attempt + 1})`);

        // Make request to Ollama service
        const response = await this.makeOllamaRequest(messages, selectedModel, options);

        // Process and return response
        return {
          content: response,
          model: selectedModel,
          provider: 'ollama',
          tokens: {
            input: this.estimateTokens(messages),
            output: this.estimateTokens([{ content: response }])
          },
          finishReason: 'stop'
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        Logger.warn(`Ollama request attempt ${attempt} failed:`, lastError.message);

        if (attempt <= this.config.maxRetries) {
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All attempts failed
    const finalError = new Error(`Ollama provider failed after ${this.config.maxRetries + 1} attempts: ${lastError?.message}`);
    Logger.error('Ollama provider request failed:', finalError);
    this.emit('requestFailed', { error: finalError, messages, options });
    throw finalError;
  }

  /**
   * Get intelligent model recommendations
   */
  async getModelRecommendations(useCase?: 'coding' | 'chat' | 'general'): Promise<ModelRecommendation[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await ollamaService.getModelRecommendations(useCase);
  }

  /**
   * Install a specific model
   */
  async installModel(modelName: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    Logger.info(`Installing Ollama model: ${modelName}`);
    
    try {
      const success = await ollamaService.installModel(modelName);
      
      if (success) {
        Logger.info(`Model ${modelName} installed successfully`);
        this.emit('modelInstalled', modelName);
      }
      
      return success;
    } catch (error) {
      Logger.error(`Failed to install model ${modelName}:`, error);
      this.emit('modelInstallFailed', { modelName, error });
      return false;
    }
  }

  /**
   * Get list of installed models
   */
  async getInstalledModels(): Promise<string[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await ollamaService.getInstalledModels();
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    modelCount: number;
    capabilities: string[];
    health: any;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const status = await ollamaService.getStatus();
    
    return {
      isRunning: status.isRunning,
      modelCount: status.modelCount,
      capabilities: status.capabilities,
      health: status.health
    };
  }

  /**
   * Check if a specific capability is supported
   */
  async hasCapability(capability: keyof OllamaCapabilities): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const installedModels = await this.getInstalledModels();
    
    // Check if any installed model supports the capability
    for (const modelName of installedModels) {
      const capabilities = await this.getModelCapabilities(modelName);
      if (capabilities[capability]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Update provider configuration
   */
  updateConfig(newConfig: Partial<OllamaProviderConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update Ollama service config
    ollamaService.updateConfig({
      autoInstall: this.config.autoInstall,
      autoStart: this.config.autoStart,
      preferredModels: this.config.preferredModels
    });

    Logger.info('Enhanced Ollama Provider configuration updated');
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    Logger.info('Shutting down Enhanced Ollama Provider...');
    
    // Clear request queue
    this.requestQueue.forEach(({ reject }) => {
      reject(new Error('Provider shutting down'));
    });
    this.requestQueue = [];

    // Remove event listeners
    this.removeAllListeners();
    
    this.isInitialized = false;
    Logger.info('Enhanced Ollama Provider shutdown complete');
  }

  // Private helper methods

  private setupEventHandlers(): void {
    // Handle Ollama service events
    ollamaService.on('statusUpdate', (status) => {
      this.emit('statusUpdate', status);
    });

    ollamaService.on('modelInstalled', (modelName) => {
      this.emit('modelInstalled', modelName);
    });

    ollamaService.on('serviceError', (error) => {
      Logger.error('Ollama service error:', error);
      this.emit('serviceError', error);
    });

    ollamaService.on('healthAlert', (alert) => {
      this.emit('healthAlert', alert);
    });
  }

  private async selectBestModel(messages: any[], options: AIRequestOptions): Promise<string> {
    if (options.model) {
      // Use explicitly requested model
      const installedModels = await this.getInstalledModels();
      if (installedModels.includes(options.model)) {
        return options.model;
      }
      
      // Try to install the requested model
      Logger.info(`Requested model ${options.model} not installed, attempting installation...`);
      const installed = await this.installModel(options.model);
      if (installed) {
        return options.model;
      }
    }

    if (this.config.enableModelRecommendations) {
      // Use intelligent model selection
      const useCase = this.detectUseCase(messages);
      const recommendations = await this.getModelRecommendations(useCase);
      
      if (recommendations.length > 0) {
        const bestModel = recommendations[0].model.fullName;
        
        // Ensure the recommended model is installed
        const installedModels = await this.getInstalledModels();
        if (!installedModels.includes(bestModel)) {
          await this.installModel(bestModel);
        }
        
        return bestModel;
      }
    }

    // Fallback to first available model
    const installedModels = await this.getInstalledModels();
    if (installedModels.length > 0) {
      return installedModels[0];
    }

    // No models available, install a default one
    Logger.warn('No models available, installing default model...');
    const defaultModel = this.config.preferredModels[0] || 'phi:2.7b';
    await this.installModel(defaultModel);
    return defaultModel;
  }

  private detectUseCase(messages: any[]): 'coding' | 'chat' | 'general' {
    const content = messages.map(m => m.content?.toLowerCase() || '').join(' ');
    
    // Check for coding-related keywords
    const codingKeywords = [
      'code', 'function', 'variable', 'class', 'method', 'api', 'debug',
      'programming', 'javascript', 'python', 'typescript', 'react', 'node',
      'algorithm', 'database', 'sql', 'git', 'error', 'bug', 'refactor'
    ];

    const codingScore = codingKeywords.reduce((score, keyword) => {
      return score + (content.includes(keyword) ? 1 : 0);
    }, 0);

    if (codingScore >= 2) {
      return 'coding';
    }

    // Check for conversational patterns
    const chatKeywords = ['how', 'what', 'why', 'can you', 'please', 'help', 'explain'];
    const chatScore = chatKeywords.reduce((score, keyword) => {
      return score + (content.includes(keyword) ? 1 : 0);
    }, 0);

    if (chatScore >= 2) {
      return 'chat';
    }

    return 'general';
  }

  private async makeOllamaRequest(messages: any[], model: string, options: AIRequestOptions): Promise<string> {
    try {
      // Check if this is a chat completion or simple completion
      if (messages.length > 1 || messages[0].role !== 'user') {
        // Use chat completion
        return await ollamaService.chat(messages, model, {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          stream: options.stream
        });
      } else {
        // Use simple completion
        const prompt = messages[0].content;
        return await ollamaService.complete(prompt, model, {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          stream: options.stream,
          system: options.systemPrompt
        });
      }
    } catch (error) {
      Logger.error(`Ollama request failed for model ${model}:`, error);
      throw error;
    }
  }

  private async getModelCapabilities(modelName: string): Promise<OllamaCapabilities> {
    // This would be enhanced to get actual model capabilities
    // For now, return reasonable defaults based on model name
    const capabilities: OllamaCapabilities = {
      codeGeneration: modelName.includes('code') || modelName.includes('llama'),
      codeReview: modelName.includes('code') || modelName.includes('llama'),
      documentation: true,
      debugging: modelName.includes('code'),
      refactoring: modelName.includes('code'),
      security: modelName.includes('code'),
      translation: !modelName.includes('code'),
      planning: true,
      analysis: true,
      chat: true,
      streaming: true,
      reasoning: !modelName.includes('phi') // Smaller models have limited reasoning
    };

    return capabilities;
  }

  private estimateTokens(messages: Array<{ content: string }>): number {
    const totalContent = messages.map(m => m.content || '').join(' ');
    // Rough estimation: ~4 characters per token
    return Math.ceil(totalContent.length / 4);
  }

  private async processRequestQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    
    while (this.requestQueue.length > 0) {
      const { resolve } = this.requestQueue.shift()!;
      try {
        await resolve();
      } catch (error) {
        Logger.error('Error processing queued request:', error);
      }
    }

    this.isProcessingQueue = false;
  }
}

// Export singleton instance for easy integration
export const enhancedOllamaProvider = new EnhancedOllamaProvider();

// Export class for custom configurations
export default EnhancedOllamaProvider;