/**
 * Model Management System
 * Unified model downloading, installation, and optimization
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ollamaService, LocalModel } from './OllamaService';

export interface ModelInfo {
  id: string;
  name: string;
  displayName: string;
  provider: 'ollama' | 'lm-studio' | 'huggingface';
  size: string;
  sizeBytes: number;
  description: string;
  specialties: string[];
  performance: {
    speed: number; // tokens/sec estimate
    quality: number; // 1-10 rating
    memory: number; // RAM requirements in GB
  };
  requirements: {
    minRam: number;
    minStorage: number;
    gpuOptional: boolean;
    platforms: string[];
  };
  status: 'available' | 'downloading' | 'installed' | 'error' | 'paused';
  progress?: number;
  downloadSpeed?: number;
  estimatedTime?: number;
  lastUsed?: Date;
}

export interface DownloadProgress {
  modelId: string;
  progress: number;
  downloaded: number;
  total: number;
  speed: number; // bytes per second
  eta: number; // seconds remaining
  status: 'downloading' | 'paused' | 'completed' | 'error';
  error?: string;
}

export interface ModelRecommendation {
  model: ModelInfo;
  reason: string;
  confidence: number;
  userType: 'beginner' | 'developer' | 'professional';
  useCase: 'coding' | 'general' | 'reasoning' | 'multimodal';
}

export interface SystemRequirements {
  totalRam: number;
  availableRam: number;
  totalStorage: number;
  availableStorage: number;
  platform: string;
  hasGpu: boolean;
  gpuMemory?: number;
}

export class ModelManager extends EventEmitter {
  private static instance: ModelManager;
  private modelsDir: string;
  private configFile: string;
  private installedModels: Map<string, ModelInfo> = new Map();
  private downloadQueue: Map<string, DownloadProgress> = new Map();
  private systemReqs: SystemRequirements | null = null;

  // Comprehensive model catalog
  private readonly MODEL_CATALOG: ModelInfo[] = [
    // Coding Models
    {
      id: 'codellama:13b-instruct',
      name: 'codellama:13b-instruct',
      displayName: 'CodeLlama 13B Instruct',
      provider: 'ollama',
      size: '7.4GB',
      sizeBytes: 7400000000,
      description: 'Meta\'s specialized code generation model. Excellent for programming tasks.',
      specialties: ['Code Generation', 'Code Completion', 'Debugging', 'Code Explanation'],
      performance: {
        speed: 25,
        quality: 8.5,
        memory: 16
      },
      requirements: {
        minRam: 12,
        minStorage: 8,
        gpuOptional: true,
        platforms: ['darwin', 'linux', 'win32']
      },
      status: 'available'
    },
    {
      id: 'qwen2.5-coder:7b',
      name: 'qwen2.5-coder:7b',
      displayName: 'Qwen2.5 Coder 7B',
      provider: 'ollama',
      size: '4.4GB',
      sizeBytes: 4400000000,
      description: 'Alibaba\'s latest code-focused model with excellent performance.',
      specialties: ['Code Generation', 'Refactoring', 'Code Review', 'Bug Fixing'],
      performance: {
        speed: 35,
        quality: 9.0,
        memory: 8
      },
      requirements: {
        minRam: 8,
        minStorage: 5,
        gpuOptional: true,
        platforms: ['darwin', 'linux', 'win32']
      },
      status: 'available'
    },
    {
      id: 'deepseek-coder:6.7b-instruct',
      name: 'deepseek-coder:6.7b-instruct',
      displayName: 'DeepSeek Coder 6.7B',
      provider: 'ollama',
      size: '3.8GB',
      sizeBytes: 3800000000,
      description: 'Specialized coding model with strong debugging capabilities.',
      specialties: ['Code Generation', 'Bug Detection', 'Code Optimization', 'Algorithm Design'],
      performance: {
        speed: 40,
        quality: 8.8,
        memory: 8
      },
      requirements: {
        minRam: 6,
        minStorage: 4,
        gpuOptional: true,
        platforms: ['darwin', 'linux', 'win32']
      },
      status: 'available'
    },

    // General Purpose Models
    {
      id: 'mistral:7b-instruct',
      name: 'mistral:7b-instruct',
      displayName: 'Mistral 7B Instruct',
      provider: 'ollama',
      size: '4.1GB',
      sizeBytes: 4100000000,
      description: 'Versatile instruction-following model good for coding and general tasks.',
      specialties: ['General Coding', 'Text Generation', 'Question Answering', 'Reasoning'],
      performance: {
        speed: 30,
        quality: 8.0,
        memory: 8
      },
      requirements: {
        minRam: 8,
        minStorage: 5,
        gpuOptional: true,
        platforms: ['darwin', 'linux', 'win32']
      },
      status: 'available'
    },
    {
      id: 'llama3.2:3b',
      name: 'llama3.2:3b',
      displayName: 'Llama 3.2 3B',
      provider: 'ollama',
      size: '2.0GB',
      sizeBytes: 2000000000,
      description: 'Compact yet capable model, perfect for systems with limited RAM.',
      specialties: ['General Purpose', 'Chat', 'Light Coding', 'Educational'],
      performance: {
        speed: 60,
        quality: 7.5,
        memory: 4
      },
      requirements: {
        minRam: 4,
        minStorage: 3,
        gpuOptional: false,
        platforms: ['darwin', 'linux', 'win32']
      },
      status: 'available'
    },

    // Advanced Models
    {
      id: 'phi3:medium',
      name: 'phi3:medium',
      displayName: 'Phi-3 Medium 14B',
      provider: 'ollama',
      size: '7.9GB',
      sizeBytes: 7900000000,
      description: 'Microsoft\'s efficient model with strong reasoning capabilities.',
      specialties: ['Code Understanding', 'Complex Reasoning', 'Math', 'Science'],
      performance: {
        speed: 20,
        quality: 8.5,
        memory: 16
      },
      requirements: {
        minRam: 14,
        minStorage: 9,
        gpuOptional: true,
        platforms: ['darwin', 'linux', 'win32']
      },
      status: 'available'
    },
    {
      id: 'llama3.1:8b',
      name: 'llama3.1:8b',
      displayName: 'Llama 3.1 8B',
      provider: 'ollama',
      size: '4.7GB',
      sizeBytes: 4700000000,
      description: 'Latest Llama model with improved reasoning and coding abilities.',
      specialties: ['Advanced Coding', 'Complex Reasoning', 'Math', 'Analysis'],
      performance: {
        speed: 28,
        quality: 8.7,
        memory: 10
      },
      requirements: {
        minRam: 10,
        minStorage: 6,
        gpuOptional: true,
        platforms: ['darwin', 'linux', 'win32']
      },
      status: 'available'
    }
  ];

  constructor() {
    super();
    this.modelsDir = join(process.cwd(), '.recoder', 'models');
    this.configFile = join(this.modelsDir, 'config.json');
    this.ensureDirectories();
    this.loadConfiguration();
  }

  static getInstance(): ModelManager {
    if (!ModelManager.instance) {
      ModelManager.instance = new ModelManager();
    }
    return ModelManager.instance;
  }

  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.modelsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create models directory:', error);
    }
  }

  private async loadConfiguration(): Promise<void> {
    try {
      const config = await fs.readFile(this.configFile, 'utf8');
      const data = JSON.parse(config);
      
      if (data.installedModels) {
        data.installedModels.forEach((model: ModelInfo) => {
          this.installedModels.set(model.id, model);
        });
      }
    } catch (error) {
      // Config doesn't exist yet, will be created on first save
    }
  }

  private async saveConfiguration(): Promise<void> {
    try {
      const config = {
        installedModels: Array.from(this.installedModels.values()),
        lastUpdated: new Date().toISOString()
      };
      
      await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Failed to save configuration:', error);
    }
  }

  /**
   * Get system requirements and capabilities
   */
  async getSystemRequirements(): Promise<SystemRequirements> {
    if (!this.systemReqs) {
      const os = await import('os');
      
      this.systemReqs = {
        totalRam: os.totalmem() / (1024 * 1024 * 1024), // GB
        availableRam: os.freemem() / (1024 * 1024 * 1024), // GB
        totalStorage: 0, // Would need platform-specific implementation
        availableStorage: 0, // Would need platform-specific implementation
        platform: os.platform(),
        hasGpu: await this.detectGpu(),
        gpuMemory: undefined
      };
    }
    
    return this.systemReqs;
  }

  private async detectGpu(): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');
      const nvidia = spawn('nvidia-smi', [], { stdio: 'pipe' });
      
      return new Promise((resolve) => {
        nvidia.on('close', (code) => resolve(code === 0));
        nvidia.on('error', () => resolve(false));
      });
    } catch {
      return false;
    }
  }

  /**
   * Get personalized model recommendations
   */
  async getRecommendations(
    userType: 'beginner' | 'developer' | 'professional' = 'developer',
    useCase: 'coding' | 'general' | 'reasoning' | 'multimodal' = 'coding'
  ): Promise<ModelRecommendation[]> {
    const systemReqs = await this.getSystemRequirements();
    const recommendations: ModelRecommendation[] = [];
    
    for (const model of this.MODEL_CATALOG) {
      // Check system compatibility
      if (model.requirements.minRam > systemReqs.availableRam) {
        continue;
      }
      
      let confidence = 0.5;
      let reason = '';
      
      // Scoring based on user type
      if (userType === 'beginner') {
        if (model.requirements.minRam <= 8) {
          confidence += 0.3;
          reason += 'Easy to run on most systems. ';
        }
        if (model.performance.speed >= 30) {
          confidence += 0.2;
          reason += 'Fast responses for learning. ';
        }
      } else if (userType === 'professional') {
        if (model.performance.quality >= 8.5) {
          confidence += 0.3;
          reason += 'High quality for professional work. ';
        }
        if (model.specialties.includes('Code Generation')) {
          confidence += 0.2;
          reason += 'Excellent for code generation. ';
        }
      }
      
      // Scoring based on use case
      if (useCase === 'coding') {
        if (model.specialties.some(s => s.includes('Code'))) {
          confidence += 0.3;
          reason += 'Specialized for coding tasks. ';
        }
      }
      
      // Bonus for already installed models
      if (this.installedModels.has(model.id)) {
        confidence += 0.1;
        reason += 'Already installed and ready to use. ';
      }
      
      if (confidence >= 0.6) {
        recommendations.push({
          model,
          reason: reason.trim(),
          confidence,
          userType,
          useCase
        });
      }
    }
    
    // Sort by confidence score
    recommendations.sort((a, b) => b.confidence - a.confidence);
    
    return recommendations.slice(0, 5); // Top 5 recommendations
  }

  /**
   * Get all available models for download
   */
  getAvailableModels(): ModelInfo[] {
    return [...this.MODEL_CATALOG];
  }

  /**
   * Get installed models
   */
  getInstalledModels(): ModelInfo[] {
    return Array.from(this.installedModels.values());
  }

  /**
   * Download and install a model
   */
  async downloadModel(modelId: string): Promise<void> {
    const model = this.MODEL_CATALOG.find(m => m.id === modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found in catalog`);
    }

    // Check system requirements
    const systemReqs = await this.getSystemRequirements();
    if (model.requirements.minRam > systemReqs.availableRam) {
      throw new Error(`Insufficient RAM. Required: ${model.requirements.minRam}GB, Available: ${systemReqs.availableRam.toFixed(1)}GB`);
    }

    // Check if already downloading
    if (this.downloadQueue.has(modelId)) {
      throw new Error(`Model ${modelId} is already being downloaded`);
    }

    // Initialize download progress
    const progress: DownloadProgress = {
      modelId,
      progress: 0,
      downloaded: 0,
      total: model.sizeBytes,
      speed: 0,
      eta: 0,
      status: 'downloading'
    };
    
    this.downloadQueue.set(modelId, progress);
    this.emit('download-started', { modelId, model });

    try {
      if (model.provider === 'ollama') {
        await this.downloadOllamaModel(model, progress);
      } else {
        throw new Error(`Provider ${model.provider} not supported yet`);
      }
      
      // Mark as installed
      const installedModel = { ...model, status: 'installed' as const };
      this.installedModels.set(modelId, installedModel);
      await this.saveConfiguration();
      
      this.downloadQueue.delete(modelId);
      this.emit('download-completed', { modelId, model });
      
    } catch (error) {
      progress.status = 'error';
      progress.error = error.message;
      this.emit('download-error', { modelId, model, error: error.message });
      throw error;
    }
  }

  private async downloadOllamaModel(model: ModelInfo, progress: DownloadProgress): Promise<void> {
    return new Promise((resolve, reject) => {
      // Listen for Ollama download events
      const onProgress = (data: any) => {
        if (data.model === model.id) {
          progress.progress = data.progress || 0;
          progress.downloaded = data.completed || 0;
          progress.total = data.total || model.sizeBytes;
          
          // Update download queue
          this.downloadQueue.set(model.id, progress);
          this.emit('download-progress', progress);
        }
      };

      const onCompleted = (data: any) => {
        if (data.model === model.id) {
          progress.status = 'completed';
          progress.progress = 100;
          
          ollamaService.off('download-progress', onProgress);
          ollamaService.off('download-completed', onCompleted);
          ollamaService.off('download-error', onError);
          
          resolve();
        }
      };

      const onError = (data: any) => {
        if (data.model === model.id) {
          ollamaService.off('download-progress', onProgress);
          ollamaService.off('download-completed', onCompleted);
          ollamaService.off('download-error', onError);
          
          reject(new Error(data.error));
        }
      };

      // Setup event listeners
      ollamaService.on('download-progress', onProgress);
      ollamaService.on('download-completed', onCompleted);
      ollamaService.on('download-error', onError);

      // Start the download
      ollamaService.downloadModel(model.id).catch(reject);
    });
  }

  /**
   * Pause model download
   */
  async pauseDownload(modelId: string): Promise<void> {
    const progress = this.downloadQueue.get(modelId);
    if (!progress) {
      throw new Error(`No active download for model ${modelId}`);
    }

    progress.status = 'paused';
    this.downloadQueue.set(modelId, progress);
    this.emit('download-paused', { modelId });
  }

  /**
   * Resume model download
   */
  async resumeDownload(modelId: string): Promise<void> {
    const progress = this.downloadQueue.get(modelId);
    if (!progress) {
      throw new Error(`No paused download for model ${modelId}`);
    }

    if (progress.status !== 'paused') {
      throw new Error(`Model ${modelId} is not paused`);
    }

    progress.status = 'downloading';
    this.downloadQueue.set(modelId, progress);
    this.emit('download-resumed', { modelId });

    // Continue download based on provider
    await this.downloadModel(modelId);
  }

  /**
   * Cancel model download
   */
  async cancelDownload(modelId: string): Promise<void> {
    const progress = this.downloadQueue.get(modelId);
    if (!progress) {
      throw new Error(`No active download for model ${modelId}`);
    }

    this.downloadQueue.delete(modelId);
    this.emit('download-cancelled', { modelId });
  }

  /**
   * Remove installed model
   */
  async removeModel(modelId: string): Promise<void> {
    const model = this.installedModels.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} is not installed`);
    }

    if (model.provider === 'ollama') {
      // Remove from Ollama (would need ollama remove command)
      // For now, just remove from our tracking
    }

    this.installedModels.delete(modelId);
    await this.saveConfiguration();
    this.emit('model-removed', { modelId, model });
  }

  /**
   * Get download progress for all active downloads
   */
  getDownloadProgress(): DownloadProgress[] {
    return Array.from(this.downloadQueue.values());
  }

  /**
   * Get model usage statistics
   */
  async getModelStats(modelId: string): Promise<{
    timesUsed: number;
    totalTokens: number;
    avgResponseTime: number;
    lastUsed: Date | null;
  }> {
    // This would integrate with usage tracking
    // For now, return placeholder data
    return {
      timesUsed: 0,
      totalTokens: 0,
      avgResponseTime: 0,
      lastUsed: null
    };
  }

  /**
   * Optimize model performance
   */
  async optimizeModel(modelId: string): Promise<void> {
    const model = this.installedModels.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} is not installed`);
    }

    // Model-specific optimizations would go here
    // For example: quantization, GPU acceleration setup, etc.
    this.emit('model-optimized', { modelId, model });
  }

  /**
   * Check for model updates
   */
  async checkForUpdates(): Promise<{ modelId: string; hasUpdate: boolean; newVersion?: string }[]> {
    const updates = [];
    
    for (const [modelId, installedModel] of this.installedModels) {
      // Check if there's a newer version available
      // This would integrate with the model registry
      // For now, return no updates
      updates.push({
        modelId,
        hasUpdate: false
      });
    }
    
    return updates;
  }

  /**
   * Get storage usage by models
   */
  async getStorageUsage(): Promise<{
    totalUsed: number;
    modelBreakdown: { modelId: string; size: number }[];
  }> {
    let totalUsed = 0;
    const modelBreakdown = [];
    
    for (const [modelId, model] of this.installedModels) {
      totalUsed += model.sizeBytes;
      modelBreakdown.push({
        modelId,
        size: model.sizeBytes
      });
    }
    
    return { totalUsed, modelBreakdown };
  }
}

// Export singleton instance
export const modelManager = ModelManager.getInstance();