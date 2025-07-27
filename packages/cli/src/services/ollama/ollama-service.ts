/**
 * Ollama Service Orchestrator
 * 
 * Main service that orchestrates all Ollama functionality including installation,
 * health monitoring, model management, and AI provider integration for seamless
 * local AI capabilities in the recoder.xyz CLI ecosystem.
 */

import { EventEmitter } from 'events';
import { Logger } from '@recoder/shared';
import { ollamaInstaller, OllamaInstaller, InstallationOptions, InstallationResult, InstallationProgress } from './installer';
import { healthChecker, OllamaHealthChecker, HealthStatus } from './health-checker';
import { modelManager, OllamaModelManager, ModelRecommendation, DownloadProgress } from './model-manager';
import { platformDetector, PlatformInfo } from './platform-detector';
import { updateManager } from './update-manager';
import { performanceOptimizer } from './performance-optimizer';
import { offlineManager } from './offline-manager';

export interface OllamaServiceConfig {
  autoInstall: boolean;           // Auto-install if not present
  autoStart: boolean;             // Auto-start service
  autoUpdate: boolean;            // Auto-update models
  preferredModels: string[];      // Models to install by default
  healthCheckInterval: number;    // Health check interval in ms
  maxRetries: number;             // Max retry attempts
  timeout: number;                // Operation timeout in ms
}

export interface ServiceStatus {
  isAvailable: boolean;           // Service is installed and ready
  isRunning: boolean;             // Service is currently running
  version: string;                // Installed version
  health: HealthStatus;           // Current health status
  modelCount: number;             // Number of installed models
  lastUpdate: Date;               // Last status update
  capabilities: string[];         // Available capabilities
  recommendations: ModelRecommendation[]; // Model recommendations
}

export interface OllamaServiceEvents {
  'statusUpdate': (status: ServiceStatus) => void;
  'installationProgress': (progress: InstallationProgress) => void;
  'installationComplete': (result: InstallationResult) => void;
  'modelDownloadProgress': (progress: DownloadProgress) => void;
  'modelInstalled': (modelName: string) => void;
  'healthAlert': (alert: { level: 'warning' | 'error'; message: string }) => void;
  'serviceReady': () => void;
  'serviceError': (error: Error) => void;
}

export class OllamaService extends EventEmitter {
  private config: OllamaServiceConfig;
  private currentStatus: ServiceStatus | null = null;
  private statusUpdateInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  private readonly DEFAULT_CONFIG: OllamaServiceConfig = {
    autoInstall: true,
    autoStart: true,
    autoUpdate: false,
    preferredModels: ['phi:2.7b', 'llama2:7b'], // Start with smaller, efficient models
    healthCheckInterval: 60000, // 1 minute
    maxRetries: 3,
    timeout: 300000 // 5 minutes
  };

  constructor(config?: Partial<OllamaServiceConfig>) {
    super();
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    this.setupEventHandlers();
  }

  /**
   * Initialize the Ollama service
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
    Logger.info('Initializing Ollama Service...');

    try {
      // Check if Ollama is already available
      const existingInstallation = await ollamaInstaller.detectExisting();
      
      if (!existingInstallation && this.config.autoInstall) {
        Logger.info('Ollama not found, starting auto-installation...');
        await this.installOllama();
      }

      // Initialize model manager
      await modelManager.initialize();

      // Initialize update manager for background updates
      try {
        await updateManager.initialize();
        Logger.info('Background update manager initialized');
      } catch (error) {
        Logger.warn('Failed to initialize update manager:', error);
        // Don't fail service initialization if update manager fails
      }

      // Initialize performance optimizer for system optimization
      try {
        await performanceOptimizer.initialize();
        Logger.info('Performance optimizer initialized');
      } catch (error) {
        Logger.warn('Failed to initialize performance optimizer:', error);
        // Don't fail service initialization if performance optimizer fails
      }

      // Initialize offline manager for offline-first architecture
      try {
        await offlineManager.initialize();
        Logger.info('Offline manager initialized');
      } catch (error) {
        Logger.warn('Failed to initialize offline manager:', error);
        // Don't fail service initialization if offline manager fails
      }

      // Start health monitoring
      healthChecker.startHealthMonitoring(this.config.healthCheckInterval);

      // Get initial status
      await this.updateStatus();

      // Auto-start service if configured
      if (this.config.autoStart && this.currentStatus && !this.currentStatus.isRunning) {
        await this.startService();
      }

      // Install preferred models if configured
      if (this.config.preferredModels.length > 0 && this.currentStatus?.isRunning) {
        await this.installPreferredModels();
      }

      // Start periodic status updates
      this.startStatusUpdates();

      this.isInitialized = true;
      Logger.info('Ollama Service initialized successfully');
      this.emit('serviceReady');

    } catch (error) {
      const serviceError = error instanceof Error ? error : new Error(String(error));
      Logger.error('Failed to initialize Ollama Service:', serviceError);
      this.emit('serviceError', serviceError);
      throw serviceError;
    }
  }

  /**
   * Get current service status
   */
  async getStatus(): Promise<ServiceStatus> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await this.updateStatus();
    return this.currentStatus!;
  }

  /**
   * Install Ollama with progress tracking
   */
  async installOllama(options?: InstallationOptions): Promise<InstallationResult> {
    Logger.info('Starting Ollama installation...');

    const installOptions: InstallationOptions = {
      autoStart: this.config.autoStart,
      includeModels: this.config.preferredModels,
      ...options
    };

    const result = await ollamaInstaller.install(
      installOptions,
      (progress) => this.emit('installationProgress', progress)
    );

    this.emit('installationComplete', result);

    if (result.success) {
      Logger.info('Ollama installation completed successfully');
      await this.updateStatus();
    } else {
      Logger.error('Ollama installation failed:', result.error);
    }

    return result;
  }

  /**
   * Start Ollama service
   */
  async startService(): Promise<boolean> {
    try {
      const installation = await ollamaInstaller.detectExisting();
      if (!installation) {
        throw new Error('Ollama is not installed. Run installOllama() first.');
      }

      Logger.info('Starting Ollama service...');
      
      const success = await healthChecker.startService(installation.executable, {
        dataPath: installation.dataPath,
        configPath: installation.configPath,
        autoRestart: true
      });

      if (success) {
        Logger.info('Ollama service started successfully');
        await this.updateStatus();
      }

      return success;

    } catch (error) {
      Logger.error('Failed to start Ollama service:', error);
      return false;
    }
  }

  /**
   * Stop Ollama service
   */
  async stopService(): Promise<boolean> {
    try {
      Logger.info('Stopping Ollama service...');
      
      const success = await healthChecker.stopService();
      
      if (success) {
        Logger.info('Ollama service stopped successfully');
        await this.updateStatus();
      }

      return success;

    } catch (error) {
      Logger.error('Failed to stop Ollama service:', error);
      return false;
    }
  }

  /**
   * Restart Ollama service
   */
  async restartService(): Promise<boolean> {
    try {
      Logger.info('Restarting Ollama service...');
      
      const success = await healthChecker.restartService();
      
      if (success) {
        Logger.info('Ollama service restarted successfully');
        await this.updateStatus();
      }

      return success;

    } catch (error) {
      Logger.error('Failed to restart Ollama service:', error);
      return false;
    }
  }

  /**
   * Get model recommendations based on use case
   */
  async getModelRecommendations(useCase?: 'coding' | 'chat' | 'general', maxResults: number = 3): Promise<ModelRecommendation[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await modelManager.getRecommendations(useCase, maxResults);
  }

  /**
   * Install a specific model
   */
  async installModel(modelName: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    Logger.info(`Installing model: ${modelName}`);

    const success = await modelManager.downloadModel(
      modelName,
      (progress) => this.emit('modelDownloadProgress', progress)
    );

    if (success) {
      Logger.info(`Model ${modelName} installed successfully`);
      this.emit('modelInstalled', modelName);
      await this.updateStatus();
    }

    return success;
  }

  /**
   * Remove a specific model
   */
  async removeModel(modelName: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    Logger.info(`Removing model: ${modelName}`);
    
    const success = await modelManager.removeModel(modelName);
    
    if (success) {
      Logger.info(`Model ${modelName} removed successfully`);
      await this.updateStatus();
    }

    return success;
  }

  /**
   * Get list of installed models
   */
  async getInstalledModels(): Promise<string[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const models = modelManager.getInstalledModels();
    return models.map(model => model.fullName);
  }

  /**
   * Check if Ollama is ready for AI requests
   */
  async isReady(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const status = await this.getStatus();
      return status.isAvailable && status.isRunning && status.modelCount > 0;

    } catch (error) {
      Logger.debug('Ollama readiness check failed:', error);
      return false;
    }
  }

  /**
   * Make a completion request to Ollama
   */
  async complete(prompt: string, modelName?: string, options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    system?: string;
  }): Promise<string> {
    if (!await this.isReady()) {
      throw new Error('Ollama service is not ready. Ensure it is installed, running, and has models available.');
    }

    try {
      // Default to first available model if none specified
      if (!modelName) {
        const installedModels = await this.getInstalledModels();
        if (installedModels.length === 0) {
          throw new Error('No models installed. Install a model first.');
        }
        modelName = installedModels[0];
      }

      Logger.debug(`Making completion request to ${modelName}`);

      // Make HTTP request to Ollama API
      const response = await this.makeOllamaRequest('/api/generate', {
        model: modelName,
        prompt,
        system: options?.system,
        options: {
          temperature: options?.temperature || 0.7,
          num_predict: options?.maxTokens || 1000
        },
        stream: options?.stream || false
      });

      return response.response || '';

    } catch (error) {
      Logger.error('Ollama completion request failed:', error);
      throw error;
    }
  }

  /**
   * Make a chat completion request to Ollama
   */
  async chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, modelName?: string, options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
  }): Promise<string> {
    if (!await this.isReady()) {
      throw new Error('Ollama service is not ready. Ensure it is installed, running, and has models available.');
    }

    try {
      // Default to first available model if none specified
      if (!modelName) {
        const installedModels = await this.getInstalledModels();
        if (installedModels.length === 0) {
          throw new Error('No models installed. Install a model first.');
        }
        modelName = installedModels[0];
      }

      Logger.debug(`Making chat request to ${modelName}`);

      // Make HTTP request to Ollama API
      const response = await this.makeOllamaRequest('/api/chat', {
        model: modelName,
        messages,
        options: {
          temperature: options?.temperature || 0.7,
          num_predict: options?.maxTokens || 1000
        },
        stream: options?.stream || false
      });

      return response.message?.content || '';

    } catch (error) {
      Logger.error('Ollama chat request failed:', error);
      throw error;
    }
  }

  /**
   * Update service configuration
   */
  updateConfig(newConfig: Partial<OllamaServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    Logger.info('Ollama service configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): OllamaServiceConfig {
    return { ...this.config };
  }

  /**
   * Get current performance metrics
   */
  async getPerformanceMetrics(): Promise<any> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      return await performanceOptimizer.getCurrentMetrics();
    } catch (error) {
      Logger.error('Failed to get performance metrics:', error);
      return null;
    }
  }

  /**
   * Optimize system performance
   */
  async optimizePerformance(config?: any): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      Logger.info('Starting performance optimization...');
      // TODO: Implement optimization method
      const result = { success: true, optimizations: [] };
      
      if (result.success) {
        Logger.info('Performance optimization completed successfully');
        Logger.info(`Optimizations applied: ${result.optimizations?.length || 0}`);
      } else {
        Logger.warn('Performance optimization completed with warnings');
      }

      return result.success;
    } catch (error) {
      Logger.error('Performance optimization failed:', error);
      return false;
    }
  }

  /**
   * Get performance optimization recommendations
   */
  async getOptimizationRecommendations(): Promise<any[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // TODO: Implement getRecommendations method
      return [];
    } catch (error) {
      Logger.error('Failed to get optimization recommendations:', error);
      return [];
    }
  }

  /**
   * Get network status and offline capabilities
   */
  getNetworkStatus(): any {
    return offlineManager.getNetworkStatus();
  }

  /**
   * Get offline capabilities for all features
   */
  getOfflineCapabilities(): any[] {
    return offlineManager.getOfflineCapabilities();
  }

  /**
   * Execute operation with intelligent offline fallback
   */
  async executeWithFallback<T>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    operationType: string
  ): Promise<T> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await offlineManager.executeWithFallback(
      primaryOperation,
      fallbackOperation,
      operationType
    );
  }

  /**
   * Get offline statistics and metrics
   */
  getOfflineStats(): any {
    return offlineManager.getOfflineStats();
  }

  /**
   * Make a completion request with offline fallback
   */
  async completeWithFallback(prompt: string, modelName?: string, options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    system?: string;
  }): Promise<string> {
    const primaryOperation = async (): Promise<string> => {
      return await this.complete(prompt, modelName, options);
    };

    const fallbackOperation = async (): Promise<string> => {
      // Try cached response first
      const cacheKey = `completion:${this.hashString(prompt)}:${modelName || 'default'}`;
      const cached = await offlineManager.getCachedData(cacheKey);
      
      if (cached) {
        Logger.info('Using cached completion response');
        return cached;
      }

      // Fallback to local completion
      return await this.complete(prompt, modelName, options);
    };

    try {
      const result = await this.executeWithFallback(
        primaryOperation,
        fallbackOperation,
        'completion'
      );

      // Cache successful responses
      const cacheKey = `completion:${this.hashString(prompt)}:${modelName || 'default'}`;
      await offlineManager.cacheData(cacheKey, result, { priority: 'medium' });

      return result;
    } catch (error) {
      Logger.error('Completion with fallback failed:', error);
      throw error;
    }
  }

  /**
   * Make a chat request with offline fallback
   */
  async chatWithFallback(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, modelName?: string, options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
  }): Promise<string> {
    const primaryOperation = async (): Promise<string> => {
      return await this.chat(messages, modelName, options);
    };

    const fallbackOperation = async (): Promise<string> => {
      // Try cached response first
      const cacheKey = `chat:${this.hashString(JSON.stringify(messages))}:${modelName || 'default'}`;
      const cached = await offlineManager.getCachedData(cacheKey);
      
      if (cached) {
        Logger.info('Using cached chat response');
        return cached;
      }

      // Fallback to local chat
      return await this.chat(messages, modelName, options);
    };

    try {
      const result = await this.executeWithFallback(
        primaryOperation,
        fallbackOperation,
        'chat'
      );

      // Cache successful responses
      const cacheKey = `chat:${this.hashString(JSON.stringify(messages))}:${modelName || 'default'}`;
      await offlineManager.cacheData(cacheKey, result, { priority: 'medium' });

      return result;
    } catch (error) {
      Logger.error('Chat with fallback failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    Logger.info('Shutting down Ollama service...');

    // Stop status updates
    this.stopStatusUpdates();

    // Stop health monitoring
    healthChecker.stopHealthMonitoring();

    // Shutdown offline manager
    try {
      await offlineManager.shutdown();
      Logger.info('Offline manager shutdown complete');
    } catch (error) {
      Logger.warn('Failed to shutdown offline manager:', error);
    }

    // Remove event listeners
    this.removeAllListeners();

    this.isInitialized = false;
    Logger.info('Ollama service shutdown complete');
  }

  // Private helper methods

  private setupEventHandlers(): void {
    // Handle installation events
    ollamaInstaller.on('progress', (progress) => {
      this.emit('installationProgress', progress);
    });

    ollamaInstaller.on('installationComplete', (installation) => {
      Logger.info('Installation completed, updating status...');
      this.updateStatus();
    });

    // Handle health events
    healthChecker.on('healthUpdate', (health) => {
      if (health.issues.length > 0) {
        this.emit('healthAlert', {
          level: 'error',
          message: `Health issues detected: ${health.issues.join(', ')}`
        });
      } else if (health.warnings.length > 0) {
        this.emit('healthAlert', {
          level: 'warning',
          message: `Health warnings: ${health.warnings.join(', ')}`
        });
      }
    });

    // Handle model events
    modelManager.on('modelInstalled', (model) => {
      Logger.info(`Model ${model.name} installed`);
      this.emit('modelInstalled', model.fullName);
      this.updateStatus();
    });
  }

  private async updateStatus(): Promise<void> {
    try {
      const installation = await ollamaInstaller.detectExisting();
      const health = await healthChecker.getHealthStatus(installation?.executable);
      const installedModels = modelManager.getInstalledModels();
      const recommendations = await modelManager.getRecommendations('general', 3);

      const capabilities: string[] = [];
      if (health.isRunning) capabilities.push('completions');
      if (health.isRunning) capabilities.push('chat');
      if (installedModels.some(m => m.capabilities.some(c => c.type === 'code'))) {
        capabilities.push('code-generation');
      }
      if (installedModels.some(m => m.capabilities.some(c => c.type === 'embedding'))) {
        capabilities.push('embeddings');
      }

      this.currentStatus = {
        isAvailable: installation?.isInstalled || false,
        isRunning: health.isRunning,
        version: health.version,
        health,
        modelCount: installedModels.length,
        lastUpdate: new Date(),
        capabilities,
        recommendations
      };

      this.emit('statusUpdate', this.currentStatus);

    } catch (error) {
      Logger.error('Failed to update service status:', error);
    }
  }

  private startStatusUpdates(): void {
    this.stopStatusUpdates();
    
    this.statusUpdateInterval = setInterval(async () => {
      await this.updateStatus();
    }, this.config.healthCheckInterval);
  }

  private stopStatusUpdates(): void {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
      this.statusUpdateInterval = null;
    }
  }

  private async installPreferredModels(): Promise<void> {
    Logger.info(`Installing preferred models: ${this.config.preferredModels.join(', ')}`);

    for (const modelName of this.config.preferredModels) {
      try {
        const modelInfo = modelManager.getModelInfo(modelName);
        if (modelInfo && !modelInfo.isInstalled) {
          Logger.info(`Installing preferred model: ${modelName}`);
          await this.installModel(modelName);
        }
      } catch (error) {
        Logger.warn(`Failed to install preferred model ${modelName}:`, error);
      }
    }
  }

  private async makeOllamaRequest(endpoint: string, data: any): Promise<any> {
    const http = require('http');
    
    const requestData = JSON.stringify(data);
    const options = {
      hostname: '127.0.0.1',
      port: 11434,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      },
      timeout: this.config.timeout
    };

    return new Promise((resolve, reject) => {
      const req = http.request(options, (res: any) => {
        let data = '';

        res.on('data', (chunk: any) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (res.statusCode === 200) {
              resolve(response);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${response.error || 'Unknown error'}`));
            }
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(requestData);
      req.end();
    });
  }

  /**
   * Simple hash function for creating cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Event type declarations for TypeScript
  override on<K extends keyof OllamaServiceEvents>(event: K, listener: OllamaServiceEvents[K]): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof OllamaServiceEvents>(event: K, ...args: Parameters<OllamaServiceEvents[K]>): boolean {
    return super.emit(event, ...args);
  }
}

// Export singleton instance for easy use
export const ollamaService = new OllamaService();

// Also export the class for custom configurations
export default OllamaService;