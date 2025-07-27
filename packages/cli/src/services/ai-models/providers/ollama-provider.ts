/**
 * Ollama Local Model Provider - Privacy-first local AI models
 */

import axios, { AxiosInstance } from 'axios';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import { BaseModelProvider } from '../base-provider';
import { Logger } from '@recoder/shared';
import {
  ModelMetadata,
  ModelRequest,
  ModelResponse,
  StreamingResponse,
  ModelProvider,
  ModelType,
  ModelConfiguration,
  TokenUsage,
  ResponseMetadata,
  ModelCapabilities,
  ModelLimits,
  ModelSpecialization
} from '@recoder/shared/types/ai-models';

const execAsync = promisify(exec);

export interface OllamaConfig extends ModelConfiguration {
  host: string;
  port: number;
  autoInstall: boolean;
  modelPath?: string;
  gpu: boolean;
  quantization?: 'q4_0' | 'q4_1' | 'q5_0' | 'q5_1' | 'q8_0' | 'f16' | 'f32';
}

export class OllamaProvider extends BaseModelProvider {
  private client: AxiosInstance;
  protected override config: OllamaConfig;
  private installedModels: Set<string> = new Set();
  private modelDownloads: Map<string, { progress: number; status: string }> = new Map();

  constructor(config: OllamaConfig) {
    super(config);
    this.config = config;
    
    this.client = axios.create({
      baseURL: `http://${config.host}:${config.port}`,
      timeout: config.timeout || 120000, // Longer timeout for local models
      headers: {
        'Content-Type': 'application/json',
        ...config.customHeaders
      }
    });
  }

  async initialize(): Promise<void> {
    try {
      // Check if Ollama is installed and running
      const isRunning = await this.checkOllamaStatus();
      
      if (!isRunning && this.config.autoInstall) {
        await this.installAndStartOllama();
      }

      // Load available models
      const models = await this.loadAvailableModels();
      models.forEach(model => this.models.set(model.id, model));
      
      // Auto-install recommended models if enabled
      if (this.config.autoInstall) {
        await this.installRecommendedModels();
      }

      Logger.info('Ollama provider initialized', { 
        modelCount: models.length,
        models: models.map(m => m.id),
        installedModels: Array.from(this.installedModels)
      });
    } catch (error) {
      Logger.error('Failed to initialize Ollama provider', { error });
      throw error;
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/version');
      return response.status === 200;
    } catch (error) {
      Logger.error('Ollama config validation failed', { error });
      return false;
    }
  }

  async getAvailableModels(): Promise<ModelMetadata[]> {
    try {
      const response = await this.client.get('/api/tags');
      const installedModels = response.data.models || [];
      
      // Update installed models set
      this.installedModels.clear();
      installedModels.forEach((model: any) => {
        this.installedModels.add(model.name);
      });

      // Return all known models (installed + available for download)
      const allModels = await this.loadAvailableModels();
      
      return allModels.map(model => ({
        ...model,
        isAvailable: this.installedModels.has(model.id)
      }));
    } catch (error) {
      Logger.error('Failed to fetch Ollama models', { error });
      return [];
    }
  }

  getProvider(): ModelProvider {
    return ModelProvider.OLLAMA;
  }

  async sendRequest(request: ModelRequest): Promise<ModelResponse> {
    this.validateRequest(request);
    
    // Auto-install model if not available
    if (!this.installedModels.has(request.model)) {
      await this.installModel(request.model);
    }
    
    const startTime = Date.now();
    
    try {
      const payload = this.buildChatPayload(request);
      const response = await this.client.post('/api/chat', payload);
      
      return this.processResponse(response.data, request, startTime);
    } catch (error) {
      const modelError = this.handleApiError(error, request.model);
      
      return {
        id: request.id,
        model: request.model,
        content: '',
        finishReason: 'error',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        metadata: {
          model: request.model,
          provider: ModelProvider.OLLAMA,
          timestamp: new Date(),
          responseTime: Date.now() - startTime,
          requestId: request.id,
          cached: false,
          fallbackUsed: false
        },
        error: modelError,
        success: false
      };
    }
  }

  async* streamRequest(request: ModelRequest): AsyncGenerator<StreamingResponse, ModelResponse> {
    this.validateRequest(request);
    
    // Auto-install model if not available
    if (!this.installedModels.has(request.model)) {
      await this.installModel(request.model);
    }
    
    const startTime = Date.now();
    let fullContent = '';
    let totalTokens = 0;
    
    try {
      const payload = this.buildChatPayload(request, true);
      
      const response = await this.client.post('/api/chat', payload, {
        responseType: 'stream'
      });

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              
              if (parsed.message?.content) {
                const delta = parsed.message.content;
                fullContent += delta;
                
                yield {
                  id: request.id,
                  model: request.model,
                  delta,
                  finished: false,
                  metadata: {
                    timestamp: new Date(),
                    requestId: request.id
                  }
                };
              }

              if (parsed.done) {
                totalTokens = parsed.eval_count || this.estimateTokens([{ content: fullContent }]);
                return this.createFinalResponse(request, fullContent, totalTokens, startTime);
              }
            } catch (parseError) {
              Logger.warn('Failed to parse streaming chunk', { line, error: parseError });
            }
          }
        }
      }

      return this.createFinalResponse(request, fullContent, totalTokens, startTime);
    } catch (error) {
      const modelError = this.handleApiError(error, request.model);
      throw new Error(`Streaming failed: ${modelError.message}`);
    }
  }

  async installModel(modelName: string): Promise<void> {
    if (this.installedModels.has(modelName)) {
      return;
    }

    Logger.info('Installing Ollama model', { modelName });
    
    try {
      this.modelDownloads.set(modelName, { progress: 0, status: 'downloading' });
      this.emit('model-download-started', { model: modelName });

      const response = await this.client.post('/api/pull', {
        name: modelName,
        stream: true
      }, {
        responseType: 'stream',
        timeout: 600000 // 10 minute timeout for downloads
      });

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              
              if (parsed.status) {
                const progress = parsed.completed && parsed.total ? 
                  (parsed.completed / parsed.total) * 100 : 0;
                
                this.modelDownloads.set(modelName, { 
                  progress, 
                  status: parsed.status 
                });
                
                this.emit('model-download-progress', { 
                  model: modelName, 
                  progress, 
                  status: parsed.status 
                });
              }

              if (parsed.status === 'success') {
                this.installedModels.add(modelName);
                this.modelDownloads.delete(modelName);
                this.emit('model-download-completed', { model: modelName });
                
                // Update model availability
                const model = this.models.get(modelName);
                if (model) {
                  model.isAvailable = true;
                  this.models.set(modelName, model);
                }
                
                Logger.info('Ollama model installed successfully', { modelName });
                return;
              }
            } catch (parseError) {
              Logger.warn('Failed to parse download progress', { line, error: parseError });
            }
          }
        }
      }
    } catch (error) {
      this.modelDownloads.delete(modelName);
      this.emit('model-download-failed', { model: modelName, error });
      Logger.error('Failed to install Ollama model', { modelName, error });
      throw new Error(`Failed to install model ${modelName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async uninstallModel(modelName: string): Promise<void> {
    try {
      await this.client.delete('/api/delete', {
        data: { name: modelName }
      });
      
      this.installedModels.delete(modelName);
      
      // Update model availability
      const model = this.models.get(modelName);
      if (model) {
        model.isAvailable = false;
        this.models.set(modelName, model);
      }
      
      Logger.info('Ollama model uninstalled', { modelName });
      this.emit('model-uninstalled', { model: modelName });
    } catch (error) {
      Logger.error('Failed to uninstall Ollama model', { modelName, error });
      throw error;
    }
  }

  getDownloadProgress(modelName: string): { progress: number; status: string } | undefined {
    return this.modelDownloads.get(modelName);
  }

  private async checkOllamaStatus(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/version');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  private async installAndStartOllama(): Promise<void> {
    Logger.info('Installing Ollama...');
    
    try {
      // Check if Ollama is installed but not running
      try {
        await execAsync('ollama --version');
        // Ollama is installed, try to start it
        Logger.info('Starting Ollama service...');
        spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' });
        
        // Wait for service to start
        await this.waitForOllama();
        return;
      } catch (error) {
        // Ollama not installed, proceed with installation
      }

      // Install Ollama
      const platform = process.platform;
      
      if (platform === 'darwin') {
        // macOS
        await execAsync('curl -fsSL https://ollama.ai/install.sh | sh');
      } else if (platform === 'linux') {
        // Linux
        await execAsync('curl -fsSL https://ollama.ai/install.sh | sh');
      } else if (platform === 'win32') {
        // Windows - download installer
        Logger.warn('Please install Ollama manually from https://ollama.ai/download');
        throw new Error('Automatic Ollama installation not supported on Windows');
      }

      // Start Ollama service
      spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' });
      
      // Wait for service to start
      await this.waitForOllama();
      
      Logger.info('Ollama installed and started successfully');
    } catch (error) {
      Logger.error('Failed to install Ollama', { error });
      throw error;
    }
  }

  private async waitForOllama(maxAttempts: number = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      if (await this.checkOllamaStatus()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error('Ollama failed to start within timeout');
  }

  private async loadAvailableModels(): Promise<ModelMetadata[]> {
    // Define available local models with their capabilities
    const modelDefinitions = [
      // Code-focused models
      {
        id: 'codellama:7b',
        name: 'Code Llama 7B',
        displayName: 'Code Llama 7B',
        type: ModelType.CODE,
        specializations: [ModelSpecialization.PYTHON, ModelSpecialization.JAVASCRIPT, ModelSpecialization.CPP],
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          documentation: true,
          debugging: true,
          refactoring: true,
          security: false,
          translation: false,
          planning: false,
          analysis: true,
          chat: true,
          streaming: true,
          functionCalling: false,
          vision: false,
          reasoning: false
        },
        limits: {
          maxContextLength: 4096,
          maxOutputTokens: 2048
        },
        priority: 8,
        tags: ['code', 'local', 'meta', 'free']
      },
      {
        id: 'deepseek-coder:6.7b',
        name: 'DeepSeek Coder 6.7B',
        displayName: 'DeepSeek Coder 6.7B',
        type: ModelType.CODE,
        specializations: [ModelSpecialization.PYTHON, ModelSpecialization.JAVASCRIPT, ModelSpecialization.JAVA],
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          documentation: true,
          debugging: true,
          refactoring: true,
          security: true,
          translation: false,
          planning: false,
          analysis: true,
          chat: true,
          streaming: true,
          functionCalling: false,
          vision: false,
          reasoning: false
        },
        limits: {
          maxContextLength: 16384,
          maxOutputTokens: 4096
        },
        priority: 9,
        tags: ['code', 'local', 'deepseek', 'free']
      },
      {
        id: 'qwen2.5-coder:7b',
        name: 'Qwen2.5 Coder 7B',
        displayName: 'Qwen2.5 Coder 7B',
        type: ModelType.CODE,
        specializations: [ModelSpecialization.PYTHON, ModelSpecialization.JAVASCRIPT, ModelSpecialization.RUST],
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          documentation: true,
          debugging: true,
          refactoring: true,
          security: true,
          translation: false,
          planning: true,
          analysis: true,
          chat: true,
          streaming: true,
          functionCalling: false,
          vision: false,
          reasoning: true
        },
        limits: {
          maxContextLength: 32768,
          maxOutputTokens: 8192
        },
        priority: 9,
        tags: ['code', 'local', 'qwen', 'free']
      },
      // General purpose models
      {
        id: 'llama3.1:8b',
        name: 'Llama 3.1 8B',
        displayName: 'Llama 3.1 8B',
        type: ModelType.CHAT,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          documentation: true,
          debugging: true,
          refactoring: true,
          security: false,
          translation: true,
          planning: true,
          analysis: true,
          chat: true,
          streaming: true,
          functionCalling: false,
          vision: false,
          reasoning: true
        },
        limits: {
          maxContextLength: 8192,
          maxOutputTokens: 4096
        },
        priority: 7,
        tags: ['general', 'local', 'meta', 'free']
      },
      {
        id: 'phi3.5:3.8b',
        name: 'Phi-3.5 Mini',
        displayName: 'Phi-3.5 Mini (3.8B)',
        type: ModelType.CHAT,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          documentation: true,
          debugging: true,
          refactoring: true,
          security: false,
          translation: true,
          planning: true,
          analysis: true,
          chat: true,
          streaming: true,
          functionCalling: false,
          vision: false,
          reasoning: true
        },
        limits: {
          maxContextLength: 4096,
          maxOutputTokens: 2048
        },
        priority: 6,
        tags: ['general', 'local', 'microsoft', 'free', 'fast']
      },
      {
        id: 'granite-code:3b',
        name: 'Granite Code 3B',
        displayName: 'Granite Code 3B',
        type: ModelType.CODE,
        specializations: [ModelSpecialization.PYTHON, ModelSpecialization.JAVASCRIPT, ModelSpecialization.JAVA],
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          documentation: true,
          debugging: true,
          refactoring: true,
          security: true,
          translation: false,
          planning: false,
          analysis: true,
          chat: true,
          streaming: true,
          functionCalling: false,
          vision: false,
          reasoning: false
        },
        limits: {
          maxContextLength: 2048,
          maxOutputTokens: 1024
        },
        priority: 5,
        tags: ['code', 'local', 'ibm', 'free', 'fast']
      }
    ];

    return modelDefinitions.map(def => ({
      id: def.id,
      name: def.name,
      displayName: def.displayName,
      provider: ModelProvider.OLLAMA,
      type: def.type,
      version: '1.0',
      description: `Local ${def.displayName} model via Ollama`,
      capabilities: def.capabilities as ModelCapabilities,
      limits: def.limits as ModelLimits,
      specializations: def.specializations,
      isLocal: true,
      isAvailable: this.installedModels.has(def.id),
      priority: def.priority,
      tags: def.tags,
      releaseDate: new Date('2024-01-01')
    }));
  }

  private async installRecommendedModels(): Promise<void> {
    const recommendedModels = [
      'phi3.5:3.8b',        // Fast general purpose
      'qwen2.5-coder:7b',   // Best coding model
      'deepseek-coder:6.7b' // Alternative coding model
    ];

    for (const modelName of recommendedModels) {
      if (!this.installedModels.has(modelName)) {
        try {
          Logger.info('Auto-installing recommended model', { modelName });
          await this.installModel(modelName);
        } catch (error) {
          Logger.warn('Failed to auto-install recommended model', { modelName, error });
        }
      }
    }
  }

  private buildChatPayload(request: ModelRequest, stream: boolean = false): any {
    const payload: any = {
      model: request.model,
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      stream
    };

    const options = request.options;
    if (options.temperature !== undefined) payload.options = { 
      ...payload.options, 
      temperature: options.temperature 
    };
    if (options.topP !== undefined) payload.options = { 
      ...payload.options, 
      top_p: options.topP 
    };
    if (options.topK !== undefined) payload.options = { 
      ...payload.options, 
      top_k: options.topK 
    };

    return payload;
  }

  private processResponse(data: any, request: ModelRequest, startTime: number): ModelResponse {
    const content = data.message?.content || '';
    
    const estimatedInputTokens = this.estimateTokens(request.messages);
    const estimatedOutputTokens = this.estimateTokens([{ content }]);

    const tokenUsage: TokenUsage = {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      totalTokens: estimatedInputTokens + estimatedOutputTokens,
      cost: 0 // Local models are free
    };

    const metadata: ResponseMetadata = {
      model: request.model,
      provider: ModelProvider.OLLAMA,
      timestamp: new Date(),
      responseTime: Date.now() - startTime,
      requestId: request.id,
      cached: false,
      fallbackUsed: false
    };

    return {
      id: request.id,
      model: request.model,
      content,
      finishReason: data.done ? 'stop' : 'length',
      usage: tokenUsage,
      metadata,
      success: true
    };
  }

  private createFinalResponse(
    request: ModelRequest, 
    content: string, 
    totalTokens: number, 
    startTime: number
  ): ModelResponse {
    const estimatedInputTokens = this.estimateTokens(request.messages);
    const estimatedOutputTokens = totalTokens - estimatedInputTokens;

    const usage: TokenUsage = {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      totalTokens,
      cost: 0 // Local models are free
    };

    const metadata: ResponseMetadata = {
      model: request.model,
      provider: ModelProvider.OLLAMA,
      timestamp: new Date(),
      responseTime: Date.now() - startTime,
      requestId: request.id,
      cached: false,
      fallbackUsed: false
    };

    return {
      id: request.id,
      model: request.model,
      content,
      finishReason: 'stop',
      usage,
      metadata,
      success: true
    };
  }
}