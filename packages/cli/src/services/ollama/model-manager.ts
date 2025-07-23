/**
 * Ollama Model Manager with Intelligent Recommendations
 * 
 * Advanced model management system with hardware-aware recommendations,
 * automatic downloads, version tracking, and performance optimization
 * for seamless model deployment across different system configurations.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import { Logger } from '@recoder/shared';
import { downloadManager } from './download-manager';
import { healthChecker } from './health-checker';
import { platformDetector, PlatformInfo } from './platform-detector';
import { recommendationEngine } from './recommendation-engine';
import { projectAnalyzer } from './project-analyzer';

export interface ModelInfo {
  name: string;
  tag: string;
  fullName: string;              // name:tag format
  description: string;
  size: number;                  // bytes
  parameters: string;            // e.g., "7B", "13B", "70B"
  architecture: string;          // e.g., "llama2", "codellama", "mistral"
  quantization?: string;         // e.g., "q4_0", "q8_0", "fp16"
  capabilities: ModelCapability[];
  requirements: ModelRequirements;
  popularity: number;            // 1-100 popularity score
  lastUpdated: Date;
  isInstalled: boolean;
  localSize?: number;            // actual size on disk
  downloadUrl?: string;
}

export interface ModelCapability {
  type: 'code' | 'chat' | 'instruct' | 'embedding' | 'vision' | 'function-calling';
  proficiency: 'basic' | 'good' | 'excellent';
  languages?: string[];          // for code models
  domains?: string[];            // specialized domains
}

export interface ModelRequirements {
  minRam: number;                // GB
  recommendedRam: number;        // GB  
  minVram?: number;              // GB for GPU acceleration
  minCpuCores: number;
  architecture: ('x64' | 'arm64' | 'apple_silicon')[];
  gpu?: 'required' | 'recommended' | 'optional';
  platforms: ('windows' | 'macos' | 'linux')[];
}

export interface ModelRecommendation {
  model: ModelInfo;
  score: number;                 // 0-100 recommendation score
  reasons: string[];
  warnings: string[];
  estimatedPerformance: {
    tokensPerSecond: number;
    memoryUsage: number;         // GB
    cpuUsage: number;            // percentage
  };
}

export interface DownloadProgress {
  modelName: string;
  stage: 'preparing' | 'downloading' | 'extracting' | 'verifying' | 'complete' | 'error';
  progress: number;              // 0-100
  downloaded: number;            // bytes
  total: number;                 // bytes
  speed: number;                 // bytes per second
  eta: number;                   // seconds
  error?: Error;
}

export interface SystemProfile {
  platform: PlatformInfo;
  totalRam: number;              // GB
  availableRam: number;          // GB
  cpuCores: number;
  cpuSpeed: number;              // GHz
  hasGpu: boolean;
  gpuMemory?: number;            // GB
  storageSpace: number;          // GB available
  networkSpeed: number;         // Mbps estimated
}

export class OllamaModelManager extends EventEmitter {
  private installedModels: Map<string, ModelInfo> = new Map();
  private availableModels: Map<string, ModelInfo> = new Map();
  private systemProfile: SystemProfile | null = null;
  private downloadQueue: string[] = [];
  private activeDownloads: Map<string, AbortController> = new Map();

  // Curated model catalog with metadata
  private readonly MODEL_CATALOG: ModelInfo[] = [
    {
      name: 'llama2',
      tag: '7b',
      fullName: 'llama2:7b',
      description: 'Meta\'s Llama 2 7B model - excellent for general conversation and basic coding',
      size: 3.8 * 1024 * 1024 * 1024, // 3.8GB
      parameters: '7B',
      architecture: 'llama2',
      quantization: 'q4_0',
      capabilities: [
        { type: 'chat', proficiency: 'excellent' },
        { type: 'code', proficiency: 'good', languages: ['python', 'javascript', 'bash'] },
        { type: 'instruct', proficiency: 'excellent' }
      ],
      requirements: {
        minRam: 8,
        recommendedRam: 16,
        minCpuCores: 4,
        architecture: ['x64', 'arm64', 'apple_silicon'],
        gpu: 'optional',
        platforms: ['windows', 'macos', 'linux']
      },
      popularity: 95,
      lastUpdated: new Date('2024-01-15'),
      isInstalled: false
    },
    {
      name: 'codellama',
      tag: '7b',
      fullName: 'codellama:7b',
      description: 'Code Llama 7B - specialized for code generation and understanding',
      size: 3.8 * 1024 * 1024 * 1024,
      parameters: '7B',
      architecture: 'codellama',
      quantization: 'q4_0',
      capabilities: [
        { type: 'code', proficiency: 'excellent', languages: ['python', 'javascript', 'typescript', 'go', 'rust', 'java', 'c++'] },
        { type: 'instruct', proficiency: 'good' },
        { type: 'function-calling', proficiency: 'good' }
      ],
      requirements: {
        minRam: 8,
        recommendedRam: 16,
        minCpuCores: 4,
        architecture: ['x64', 'arm64', 'apple_silicon'],
        gpu: 'recommended',
        platforms: ['windows', 'macos', 'linux']
      },
      popularity: 88,
      lastUpdated: new Date('2024-01-10'),
      isInstalled: false
    },
    {
      name: 'mistral',
      tag: '7b',
      fullName: 'mistral:7b',
      description: 'Mistral 7B - fast and efficient model with excellent instruction following',
      size: 4.1 * 1024 * 1024 * 1024,
      parameters: '7B',
      architecture: 'mistral',
      quantization: 'q4_0',
      capabilities: [
        { type: 'chat', proficiency: 'excellent' },
        { type: 'instruct', proficiency: 'excellent' },
        { type: 'code', proficiency: 'good', languages: ['python', 'javascript'] }
      ],
      requirements: {
        minRam: 8,
        recommendedRam: 12,
        minCpuCores: 4,
        architecture: ['x64', 'arm64', 'apple_silicon'],
        gpu: 'optional',
        platforms: ['windows', 'macos', 'linux']
      },
      popularity: 82,
      lastUpdated: new Date('2024-01-20'),
      isInstalled: false
    },
    {
      name: 'phi',
      tag: '2.7b',
      fullName: 'phi:2.7b',
      description: 'Microsoft Phi 2.7B - compact model optimized for resource-constrained environments',
      size: 1.6 * 1024 * 1024 * 1024,
      parameters: '2.7B',
      architecture: 'phi',
      quantization: 'q4_0',
      capabilities: [
        { type: 'chat', proficiency: 'good' },
        { type: 'code', proficiency: 'good', languages: ['python'] },
        { type: 'instruct', proficiency: 'good' }
      ],
      requirements: {
        minRam: 4,
        recommendedRam: 8,
        minCpuCores: 2,
        architecture: ['x64', 'arm64', 'apple_silicon'],
        gpu: 'optional',
        platforms: ['windows', 'macos', 'linux']
      },
      popularity: 75,
      lastUpdated: new Date('2024-01-25'),
      isInstalled: false
    },
    {
      name: 'llama2',
      tag: '13b',
      fullName: 'llama2:13b',
      description: 'Meta\'s Llama 2 13B model - more capable but requires more resources',
      size: 7.3 * 1024 * 1024 * 1024,
      parameters: '13B',
      architecture: 'llama2',
      quantization: 'q4_0',
      capabilities: [
        { type: 'chat', proficiency: 'excellent' },
        { type: 'code', proficiency: 'excellent', languages: ['python', 'javascript', 'typescript', 'go', 'rust'] },
        { type: 'instruct', proficiency: 'excellent' }
      ],
      requirements: {
        minRam: 16,
        recommendedRam: 32,
        minCpuCores: 6,
        architecture: ['x64', 'arm64', 'apple_silicon'],
        gpu: 'recommended',
        platforms: ['windows', 'macos', 'linux']
      },
      popularity: 78,
      lastUpdated: new Date('2024-01-15'),
      isInstalled: false
    }
  ];

  constructor() {
    super();
    this.initializeModelCatalog();
  }

  /**
   * Initialize model manager with system profiling
   */
  async initialize(): Promise<void> {
    Logger.info('Initializing Ollama Model Manager...');
    
    try {
      // Profile the system
      this.systemProfile = await this.profileSystem();
      Logger.info(`System profile: ${this.systemProfile.totalRam}GB RAM, ${this.systemProfile.cpuCores} cores, GPU: ${this.systemProfile.hasGpu}`);
      
      // Scan for installed models
      await this.scanInstalledModels();
      
      // Update model availability based on system capabilities
      await this.updateModelCompatibility();
      
      Logger.info(`Model manager initialized with ${this.installedModels.size} installed models`);
      this.emit('initialized', {
        systemProfile: this.systemProfile,
        installedCount: this.installedModels.size,
        availableCount: this.availableModels.size
      });
      
    } catch (error) {
      Logger.error('Failed to initialize model manager:', error);
      throw error;
    }
  }

  /**
   * Get intelligent model recommendations based on system and use case
   */
  async getRecommendations(useCase?: 'coding' | 'chat' | 'general', maxModels: number = 3): Promise<ModelRecommendation[]> {
    if (!this.systemProfile) {
      throw new Error('Model manager not initialized. Call initialize() first.');
    }

    try {
      // Initialize recommendation engine if not already done
      await recommendationEngine.initialize();

      // Create recommendation context
      const context = {
        useCase: useCase || 'general',
        complexity: 'medium' as const,
        priority: 'quality' as const,
        privacyLevel: 'internal' as const,
        budget: 'free-only' as const
      };

      // Get available models
      const availableModels = Array.from(this.availableModels.values());

      // Use intelligent recommendation engine
      const intelligentRecommendations = await recommendationEngine.getRecommendations(
        context,
        availableModels,
        maxModels
      );

      return intelligentRecommendations;

    } catch (error) {
      Logger.warn('Intelligent recommendations failed, falling back to basic scoring:', error);
      
      // Fallback to original recommendation logic
      const recommendations: ModelRecommendation[] = [];

      for (const model of this.availableModels.values()) {
        const score = this.calculateRecommendationScore(model, useCase);
        const reasons = this.generateRecommendationReasons(model, useCase);
        const warnings = this.generateWarnings(model);
        const performance = this.estimatePerformance(model);

        if (score > 0) {
          recommendations.push({
            model,
            score,
            reasons,
            warnings,
            estimatedPerformance: performance
          });
        }
      }

      // Sort by score and return top results
      return recommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, maxModels);
    }
  }

  /**
   * Download and install a model
   */
  async downloadModel(modelName: string, onProgress?: (progress: DownloadProgress) => void): Promise<boolean> {
    try {
      const model = this.availableModels.get(modelName);
      if (!model) {
        throw new Error(`Model ${modelName} not found in catalog`);
      }

      if (model.isInstalled) {
        Logger.info(`Model ${modelName} is already installed`);
        return true;
      }

      // Check if already downloading
      if (this.activeDownloads.has(modelName)) {
        throw new Error(`Model ${modelName} is already being downloaded`);
      }

      // Add to download queue
      this.downloadQueue.push(modelName);
      const abortController = new AbortController();
      this.activeDownloads.set(modelName, abortController);

      Logger.info(`Starting download of model ${modelName} (${this.formatBytes(model.size)})`);

      try {
        // Use Ollama's built-in pull command for downloading
        await this.executeOllamaCommand(['pull', modelName], {
          onProgress: (stage, progress, details) => {
            if (onProgress) {
              onProgress({
                modelName,
                stage: stage as any,
                progress,
                downloaded: Math.round((progress / 100) * model.size),
                total: model.size,
                speed: 0, // Ollama doesn't provide speed info
                eta: 0,   // Ollama doesn't provide ETA
              });
            }
          },
          abortSignal: abortController.signal
        });

        // Mark as installed
        model.isInstalled = true;
        model.localSize = await this.getModelLocalSize(modelName);
        this.installedModels.set(modelName, model);

        Logger.info(`Model ${modelName} downloaded and installed successfully`);
        this.emit('modelInstalled', model);

        return true;

      } catch (error) {
        Logger.error(`Failed to download model ${modelName}:`, error);
        
        if (onProgress) {
          onProgress({
            modelName,
            stage: 'error',
            progress: 0,
            downloaded: 0,
            total: model.size,
            speed: 0,
            eta: 0,
            error: error instanceof Error ? error : new Error(String(error))
          });
        }

        return false;
      }

    } finally {
      // Cleanup
      this.activeDownloads.delete(modelName);
      const queueIndex = this.downloadQueue.indexOf(modelName);
      if (queueIndex > -1) {
        this.downloadQueue.splice(queueIndex, 1);
      }
    }
  }

  /**
   * Remove an installed model
   */
  async removeModel(modelName: string): Promise<boolean> {
    try {
      const model = this.installedModels.get(modelName);
      if (!model) {
        Logger.warn(`Model ${modelName} is not installed`);
        return true;
      }

      Logger.info(`Removing model ${modelName}...`);

      // Use Ollama's built-in remove command
      await this.executeOllamaCommand(['rm', modelName]);

      // Update our tracking
      model.isInstalled = false;
      model.localSize = undefined;
      this.installedModels.delete(modelName);

      Logger.info(`Model ${modelName} removed successfully`);
      this.emit('modelRemoved', model);

      return true;

    } catch (error) {
      Logger.error(`Failed to remove model ${modelName}:`, error);
      return false;
    }
  }

  /**
   * Get list of installed models
   */
  getInstalledModels(): ModelInfo[] {
    return Array.from(this.installedModels.values());
  }

  /**
   * Get list of available models
   */
  getAvailableModels(): ModelInfo[] {
    return Array.from(this.availableModels.values());
  }

  /**
   * Get project-specific model recommendations
   */
  async getProjectRecommendations(projectPath?: string): Promise<ModelRecommendation[]> {
    try {
      // Initialize services
      await recommendationEngine.initialize();
      
      const targetPath = projectPath || process.cwd();
      
      // Analyze the project
      const projectAnalysis = await projectAnalyzer.analyzeProject(targetPath, {
        includeAIPatterns: true,
        maxFiles: 500
      });

      // Create enhanced context from project analysis
      const context = {
        useCase: this.inferUseCaseFromProject(projectAnalysis),
        language: projectAnalysis.languages.map(l => l.name),
        framework: projectAnalysis.frameworks.map(f => f.name),
        projectType: projectAnalysis.type,
        complexity: projectAnalysis.complexity.overall,
        priority: 'quality' as const,
        privacyLevel: 'internal' as const,
        budget: 'free-only' as const
      };

      Logger.info('Getting project-specific recommendations', {
        project: projectAnalysis.name,
        languages: context.language,
        frameworks: context.framework,
        complexity: context.complexity
      });

      // Get intelligent recommendations
      const availableModels = Array.from(this.availableModels.values());
      const recommendations = await recommendationEngine.getRecommendations(
        context,
        availableModels,
        5 // Get more recommendations for project-specific analysis
      );

      // Enhance recommendations with project-specific insights
      return recommendations.map(rec => ({
        ...rec,
        usageContext: [
          ...rec.usageContext,
          `${projectAnalysis.name} project`,
          ...projectAnalysis.languages.map(l => `${l.name} development`),
          ...projectAnalysis.frameworks.map(f => `${f.name} applications`)
        ]
      }));

    } catch (error) {
      Logger.error('Failed to get project recommendations:', error);
      
      // Fallback to general recommendations
      return await this.getRecommendations('coding', 3);
    }
  }

  /**
   * Get usage insights and analytics
   */
  async getUsageInsights(): Promise<{
    recommendations: any;
    systemOptimization: string[];
    userPreferences: any;
    projectAnalytics: any;
  }> {
    try {
      await recommendationEngine.initialize();
      
      const insights = recommendationEngine.getUsageInsights();
      const userPreferences = recommendationEngine.getUserPreferences();
      
      // Get current project analysis if available
      const currentProject = projectAnalyzer.getCachedAnalysis(process.cwd());
      
      return {
        recommendations: insights,
        systemOptimization: insights.systemOptimization,
        userPreferences,
        projectAnalytics: currentProject ? {
          name: currentProject.name,
          type: currentProject.type,
          complexity: currentProject.complexity.overall,
          languages: currentProject.languages.map(l => l.name),
          frameworks: currentProject.frameworks.map(f => f.name)
        } : null
      };
      
    } catch (error) {
      Logger.error('Failed to get usage insights:', error);
      return {
        recommendations: null,
        systemOptimization: [],
        userPreferences: null,
        projectAnalytics: null
      };
    }
  }

  /**
   * Get model information
   */
  getModelInfo(modelName: string): ModelInfo | null {
    return this.availableModels.get(modelName) || null;
  }

  /**
   * Check if model is compatible with current system
   */
  isModelCompatible(modelName: string): boolean {
    const model = this.availableModels.get(modelName);
    if (!model || !this.systemProfile) {
      return false;
    }

    return (
      this.systemProfile.totalRam >= model.requirements.minRam &&
      this.systemProfile.cpuCores >= model.requirements.minCpuCores &&
      model.requirements.architecture.includes(this.systemProfile.platform.arch) &&
      model.requirements.platforms.includes(this.systemProfile.platform.os)
    );
  }

  /**
   * Get system profile
   */
  getSystemProfile(): SystemProfile | null {
    return this.systemProfile;
  }

  /**
   * Cancel active download
   */
  async cancelDownload(modelName: string): Promise<boolean> {
    const abortController = this.activeDownloads.get(modelName);
    if (abortController) {
      abortController.abort();
      Logger.info(`Cancelled download of model ${modelName}`);
      return true;
    }
    return false;
  }

  /**
   * Get download queue status
   */
  getDownloadQueue(): string[] {
    return [...this.downloadQueue];
  }

  // Private helper methods

  private initializeModelCatalog(): void {
    for (const model of this.MODEL_CATALOG) {
      this.availableModels.set(model.fullName, { ...model });
    }
  }

  private async profileSystem(): Promise<SystemProfile> {
    const platform = await platformDetector.detectPlatform();
    const os = require('os');
    
    // Get basic system info
    const totalRam = Math.round(os.totalmem() / (1024 ** 3));
    const availableRam = Math.round(os.freemem() / (1024 ** 3));
    const cpuCores = os.cpus().length;
    const cpuSpeed = os.cpus()[0]?.speed ? os.cpus()[0].speed / 1000 : 2.5; // Convert MHz to GHz
    
    // Detect GPU
    const hasGpu = await this.detectGPU();
    const gpuMemory = hasGpu ? await this.getGPUMemory() : undefined;
    
    // Estimate available storage
    const storageSpace = await this.getAvailableStorage();
    
    // Estimate network speed (placeholder)
    const networkSpeed = 100; // Mbps - would need actual test

    return {
      platform,
      totalRam,
      availableRam,
      cpuCores,
      cpuSpeed,
      hasGpu,
      gpuMemory,
      storageSpace,
      networkSpeed
    };
  }

  private async scanInstalledModels(): Promise<void> {
    try {
      // Use Ollama's list command to get installed models
      const output = await this.executeOllamaCommand(['list']);
      const models = this.parseOllamaListOutput(output);
      
      for (const modelName of models) {
        const catalogModel = this.availableModels.get(modelName);
        if (catalogModel) {
          catalogModel.isInstalled = true;
          catalogModel.localSize = await this.getModelLocalSize(modelName);
          this.installedModels.set(modelName, catalogModel);
        }
      }
      
    } catch (error) {
      Logger.debug('Could not scan installed models:', error);
      // This is expected if Ollama is not installed yet
    }
  }

  private async updateModelCompatibility(): Promise<void> {
    if (!this.systemProfile) return;

    for (const [name, model] of this.availableModels.entries()) {
      const isCompatible = this.isModelCompatible(name);
      if (!isCompatible) {
        Logger.debug(`Model ${name} is not compatible with current system`);
      }
    }
  }

  private calculateRecommendationScore(model: ModelInfo, useCase?: string): number {
    if (!this.systemProfile) return 0;

    let score = 0;

    // Base popularity score (0-40 points)
    score += (model.popularity / 100) * 40;

    // System compatibility (0-30 points)
    if (this.systemProfile.totalRam >= model.requirements.recommendedRam) {
      score += 30;
    } else if (this.systemProfile.totalRam >= model.requirements.minRam) {
      score += 20;
    } else {
      return 0; // Not compatible
    }

    // Use case alignment (0-20 points)
    if (useCase) {
      const relevantCapabilities = model.capabilities.filter(cap => {
        if (useCase === 'coding') return cap.type === 'code' || cap.type === 'function-calling';
        if (useCase === 'chat') return cap.type === 'chat' || cap.type === 'instruct';
        return true; // general use case
      });

      if (relevantCapabilities.length > 0) {
        const avgProficiency = relevantCapabilities.reduce((sum, cap) => {
          const proficiencyScore = { basic: 1, good: 2, excellent: 3 }[cap.proficiency];
          return sum + proficiencyScore;
        }, 0) / relevantCapabilities.length;

        score += (avgProficiency / 3) * 20;
      }
    } else {
      score += 10; // Default bonus for general use
    }

    // Size efficiency (0-10 points)
    const sizeGB = model.size / (1024 ** 3);
    if (sizeGB < 2) score += 10;
    else if (sizeGB < 5) score += 8;
    else if (sizeGB < 10) score += 5;
    else score += 2;

    return Math.round(Math.min(score, 100));
  }

  private generateRecommendationReasons(model: ModelInfo, useCase?: string): string[] {
    const reasons: string[] = [];

    if (model.popularity >= 80) {
      reasons.push('Highly popular and well-tested model');
    }

    if (useCase === 'coding' && model.capabilities.some(cap => cap.type === 'code' && cap.proficiency === 'excellent')) {
      reasons.push('Excellent for code generation and understanding');
    }

    if (useCase === 'chat' && model.capabilities.some(cap => cap.type === 'chat' && cap.proficiency === 'excellent')) {
      reasons.push('Optimized for conversational interactions');
    }

    const sizeGB = model.size / (1024 ** 3);
    if (sizeGB < 3) {
      reasons.push('Compact size - quick to download and run');
    }

    if (this.systemProfile && this.systemProfile.totalRam >= model.requirements.recommendedRam) {
      reasons.push('Meets recommended system requirements');
    }

    if (model.quantization === 'q4_0') {
      reasons.push('Good balance of quality and performance');
    }

    return reasons;
  }

  private generateWarnings(model: ModelInfo): string[] {
    const warnings: string[] = [];

    if (!this.systemProfile) return warnings;

    if (this.systemProfile.totalRam < model.requirements.recommendedRam) {
      warnings.push(`Limited performance with ${this.systemProfile.totalRam}GB RAM (${model.requirements.recommendedRam}GB recommended)`);
    }

    if (this.systemProfile.cpuCores < model.requirements.minCpuCores) {
      warnings.push(`May run slowly with ${this.systemProfile.cpuCores} CPU cores (${model.requirements.minCpuCores} minimum)`);
    }

    const sizeGB = model.size / (1024 ** 3);
    if (this.systemProfile.storageSpace < sizeGB * 2) {
      warnings.push(`Low storage space - model requires ${sizeGB.toFixed(1)}GB`);
    }

    if (model.requirements.gpu === 'required' && !this.systemProfile.hasGpu) {
      warnings.push('GPU required but not detected');
    }

    return warnings;
  }

  private estimatePerformance(model: ModelInfo): { tokensPerSecond: number; memoryUsage: number; cpuUsage: number } {
    if (!this.systemProfile) {
      return { tokensPerSecond: 0, memoryUsage: 0, cpuUsage: 0 };
    }

    // Simple performance estimation based on model size and system specs
    const paramCount = parseFloat(model.parameters.replace('B', ''));
    const ramRatio = this.systemProfile.totalRam / model.requirements.recommendedRam;
    const coreRatio = this.systemProfile.cpuCores / model.requirements.minCpuCores;

    const baseTokensPerSecond = this.systemProfile.hasGpu ? 50 : 20;
    const tokensPerSecond = Math.round(baseTokensPerSecond * ramRatio * coreRatio / Math.sqrt(paramCount));

    const memoryUsage = Math.min(model.requirements.recommendedRam, this.systemProfile.totalRam * 0.8);
    const cpuUsage = Math.min(85, 60 + (paramCount * 5));

    return {
      tokensPerSecond: Math.max(1, tokensPerSecond),
      memoryUsage,
      cpuUsage
    };
  }

  private async executeOllamaCommand(args: string[], options?: {
    onProgress?: (stage: string, progress: number, details?: string) => void;
    abortSignal?: AbortSignal;
  }): Promise<string> {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      
      const process = spawn('ollama', args, {
        stdio: 'pipe',
        signal: options?.abortSignal
      });

      let output = '';
      let errorOutput = '';

      process.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        output += text;
        
        // Parse progress if callback provided
        if (options?.onProgress) {
          const progressMatch = text.match(/(\d+)%/);
          if (progressMatch) {
            const progress = parseInt(progressMatch[1]);
            options.onProgress('downloading', progress, text.trim());
          }
        }
      });

      process.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Ollama command failed with code ${code}: ${errorOutput}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  private parseOllamaListOutput(output: string): string[] {
    try {
      const lines = output.split('\n').filter(line => line.trim());
      const models: string[] = [];
      
      for (const line of lines) {
        // Skip header line
        if (line.includes('NAME') && line.includes('SIZE')) continue;
        
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 1 && parts[0]) {
          models.push(parts[0]);
        }
      }
      
      return models;
    } catch (error) {
      Logger.debug('Failed to parse Ollama list output:', error);
      return [];
    }
  }

  private async getModelLocalSize(modelName: string): Promise<number> {
    try {
      const output = await this.executeOllamaCommand(['show', modelName]);
      const sizeMatch = output.match(/Size:\s*(\d+(?:\.\d+)?)\s*([KMGT]?B)/);
      
      if (sizeMatch) {
        const size = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2];
        
        const multipliers: Record<string, number> = {
          'B': 1,
          'KB': 1024,
          'MB': 1024 ** 2,
          'GB': 1024 ** 3,
          'TB': 1024 ** 4
        };
        
        return size * (multipliers[unit] || 1);
      }
      
      return 0;
    } catch (error) {
      Logger.debug(`Could not get local size for model ${modelName}:`, error);
      return 0;
    }
  }

  private async detectGPU(): Promise<boolean> {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Check for NVIDIA GPU
      try {
        await execAsync('nvidia-smi');
        return true;
      } catch (error) {
        // Continue to check other GPU types
      }
      
      // Check for AMD GPU (Linux)
      if (process.platform === 'linux') {
        try {
          await execAsync('rocm-smi');
          return true;
        } catch (error) {
          // Continue
        }
      }
      
      // Check for Apple Metal (macOS)
      if (process.platform === 'darwin') {
        try {
          const { stdout } = await execAsync('system_profiler SPDisplaysDataType');
          return stdout.includes('Metal');
        } catch (error) {
          // Continue
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  private async getGPUMemory(): Promise<number | undefined> {
    // Placeholder - would implement GPU memory detection
    return undefined;
  }

  private async getAvailableStorage(): Promise<number> {
    try {
      const installPaths = platformDetector.getInstallationPaths(this.systemProfile!.platform);
      return await this.getAvailableSpace(installPaths.dataPath);
    } catch (error) {
      Logger.debug('Could not determine available storage:', error);
      return 100; // Default fallback
    }
  }

  private async getAvailableSpace(dirPath: string): Promise<number> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(`dir "${dirPath}" /-c`);
        const match = stdout.match(/(\d+) bytes free/);
        if (match) {
          return parseInt(match[1]) / (1024 ** 3); // Convert to GB
        }
      } else {
        const { stdout } = await execAsync(`df "${dirPath}"`);
        const lines = stdout.split('\n');
        if (lines[1]) {
          const parts = lines[1].split(/\s+/);
          const available = parseInt(parts[3]) * 1024; // Convert from KB to bytes
          return available / (1024 ** 3); // Convert to GB
        }
      }
      
      return 100; // Default fallback
    } catch (error) {
      Logger.debug(`Could not determine available space for ${dirPath}:`, error);
      return 100;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private inferUseCaseFromProject(projectAnalysis: any): 'coding' | 'chat' | 'general' | 'documentation' | 'analysis' | 'debugging' {
    // Check project type
    if (projectAnalysis.type === 'api' || projectAnalysis.type === 'web' || projectAnalysis.type === 'mobile') {
      return 'coding';
    }

    // Check for documentation projects
    const hasDocFiles = projectAnalysis.fileStructure.fileTypes['.md'] > 0 || 
                        projectAnalysis.fileStructure.fileTypes['.rst'] > 0;
    if (hasDocFiles && projectAnalysis.complexity.overall === 'simple') {
      return 'documentation';
    }

    // Check for data analysis projects
    const hasDataFiles = projectAnalysis.fileStructure.fileTypes['.ipynb'] > 0 ||
                         projectAnalysis.fileStructure.fileTypes['.csv'] > 0;
    const hasPython = projectAnalysis.languages.some((l: any) => l.name === 'python');
    if (hasDataFiles && hasPython) {
      return 'analysis';
    }

    // Default to coding for most projects with multiple languages
    if (projectAnalysis.languages.length > 0) {
      return 'coding';
    }

    return 'general';
  }
}

// Export singleton instance
export const modelManager = new OllamaModelManager();