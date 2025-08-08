/**
 * Ollama Service Integration
 * Provides free local AI models for Recoder.xyz
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';

export interface LocalModel {
  name: string;
  displayName: string;
  description: string;
  size: string;
  speciality: string;
  performance: 'Good' | 'Very Good' | 'Excellent';
  downloadTime: string;
  status: 'available' | 'downloading' | 'installed' | 'error';
  progress?: number;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
}

export class OllamaService extends EventEmitter {
  private static instance: OllamaService;
  private ollamaProcess: ChildProcess | null = null;
  private isRunning: boolean = false;
  private baseUrl: string = 'http://localhost:11434';
  private modelsDir: string;

  // Recommended models for different use cases
  private readonly RECOMMENDED_MODELS: LocalModel[] = [
    {
      name: 'codellama:13b-instruct',
      displayName: 'CodeLlama 13B',
      description: 'Meta\'s specialized code generation model',
      size: '7.4GB',
      speciality: 'Code generation, completion, debugging',
      performance: 'Very Good',
      downloadTime: '15 minutes',
      status: 'available'
    },
    {
      name: 'qwen2.5-coder:7b',
      displayName: 'Qwen2.5 Coder',
      description: 'Alibaba\'s code-focused model',
      size: '4.4GB',
      speciality: 'Code completion, refactoring',
      performance: 'Excellent',
      downloadTime: '10 minutes',
      status: 'available'
    },
    {
      name: 'mistral:7b-instruct',
      displayName: 'Mistral 7B',
      description: 'Mistral\'s instruction-following model',
      size: '4.1GB',
      speciality: 'General coding, debugging',
      performance: 'Very Good',
      downloadTime: '8 minutes',
      status: 'available'
    },
    {
      name: 'deepseek-coder:6.7b-instruct',
      displayName: 'DeepSeek Coder',
      description: 'Specialized coding model from DeepSeek',
      size: '3.8GB',
      speciality: 'Code generation, bug fixing',
      performance: 'Excellent',
      downloadTime: '7 minutes',
      status: 'available'
    },
    {
      name: 'phi3:medium',
      displayName: 'Phi-3 Medium',
      description: 'Microsoft\'s efficient coding model',
      size: '7.9GB',
      speciality: 'Code understanding, explanations',
      performance: 'Good',
      downloadTime: '12 minutes',
      status: 'available'
    }
  ];

  constructor() {
    super();
    this.modelsDir = join(process.cwd(), '.recoder', 'models');
    this.ensureModelsDirectory();
  }

  static getInstance(): OllamaService {
    if (!OllamaService.instance) {
      OllamaService.instance = new OllamaService();
    }
    return OllamaService.instance;
  }

  private async ensureModelsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.modelsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create models directory:', error);
    }
  }

  /**
   * Check if Ollama is installed
   */
  async isOllamaInstalled(): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');
      const child = spawn('ollama', ['version'], { stdio: 'pipe' });
      
      return new Promise((resolve) => {
        child.on('close', (code) => {
          resolve(code === 0);
        });
        child.on('error', () => {
          resolve(false);
        });
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * Auto-install Ollama if not present
   */
  async autoInstallOllama(): Promise<boolean> {
    const isInstalled = await this.isOllamaInstalled();
    if (isInstalled) {
      this.emit('install-status', { status: 'already-installed' });
      return true;
    }

    this.emit('install-status', { status: 'installing', message: 'Installing Ollama...' });

    try {
      // Platform-specific installation
      const platform = process.platform;
      
      if (platform === 'darwin') {
        // macOS installation
        return await this.installOnMacOS();
      } else if (platform === 'linux') {
        // Linux installation
        return await this.installOnLinux();
      } else if (platform === 'win32') {
        // Windows installation
        return await this.installOnWindows();
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }
    } catch (error) {
      this.emit('install-status', { status: 'error', error: error.message });
      return false;
    }
  }

  private async installOnMacOS(): Promise<boolean> {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
      // Download and install Ollama for macOS
      const curl = spawn('curl', ['-fsSL', 'https://ollama.ai/install.sh']);
      const sh = spawn('sh', [], { stdio: ['pipe', 'pipe', 'pipe'] });
      
      curl.stdout.pipe(sh.stdin);
      
      sh.on('close', (code) => {
        if (code === 0) {
          this.emit('install-status', { status: 'completed' });
          resolve(true);
        } else {
          reject(new Error('Installation failed'));
        }
      });

      sh.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async installOnLinux(): Promise<boolean> {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
      const curl = spawn('curl', ['-fsSL', 'https://ollama.ai/install.sh']);
      const sh = spawn('sh', [], { stdio: ['pipe', 'pipe', 'pipe'] });
      
      curl.stdout.pipe(sh.stdin);
      
      sh.on('close', (code) => {
        if (code === 0) {
          this.emit('install-status', { status: 'completed' });
          resolve(true);
        } else {
          reject(new Error('Installation failed'));
        }
      });

      sh.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async installOnWindows(): Promise<boolean> {
    // For Windows, we'll provide download instructions
    this.emit('install-status', { 
      status: 'manual-install-required',
      message: 'Please download Ollama from https://ollama.ai/download and run the installer',
      downloadUrl: 'https://ollama.ai/download'
    });
    return false;
  }

  /**
   * Start Ollama server
   */
  async startOllama(): Promise<boolean> {
    if (this.isRunning) {
      return true;
    }

    try {
      const { spawn } = await import('child_process');
      this.ollamaProcess = spawn('ollama', ['serve'], {
        stdio: 'pipe',
        detached: false
      });

      this.ollamaProcess.on('spawn', () => {
        this.isRunning = true;
        this.emit('server-status', { status: 'running' });
      });

      this.ollamaProcess.on('error', (error) => {
        this.isRunning = false;
        this.emit('server-status', { status: 'error', error: error.message });
      });

      this.ollamaProcess.on('exit', (code) => {
        this.isRunning = false;
        this.emit('server-status', { status: 'stopped', code });
      });

      // Wait for server to be ready
      await this.waitForServer();
      return true;
    } catch (error) {
      this.emit('server-status', { status: 'error', error: error.message });
      return false;
    }
  }

  private async waitForServer(maxAttempts: number = 10): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`${this.baseUrl}/api/tags`);
        if (response.ok) {
          return;
        }
      } catch (error) {
        // Server not ready yet
      }
      
      // Wait 1 second before next attempt
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Ollama server failed to start within timeout');
  }

  /**
   * Get available models for download
   */
  getRecommendedModels(): LocalModel[] {
    return this.RECOMMENDED_MODELS.map(model => ({ ...model }));
  }

  /**
   * Get installed models
   */
  async getInstalledModels(): Promise<LocalModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error('Failed to fetch installed models');
      }

      const data = await response.json();
      return data.models?.map((model: any) => ({
        name: model.name,
        displayName: model.name,
        description: 'Installed local model',
        size: this.formatBytes(model.size || 0),
        speciality: 'General purpose',
        performance: 'Good',
        downloadTime: 'Already installed',
        status: 'installed'
      })) || [];
    } catch (error) {
      console.error('Failed to get installed models:', error);
      return [];
    }
  }

  /**
   * Download a model with progress tracking
   */
  async downloadModel(modelName: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start download: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      this.emit('download-started', { model: modelName });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            
            if (data.status) {
              this.emit('download-progress', {
                model: modelName,
                status: data.status,
                completed: data.completed || 0,
                total: data.total || 0,
                progress: data.total ? Math.round((data.completed / data.total) * 100) : 0
              });
            }
          } catch (error) {
            // Ignore JSON parse errors for partial chunks
          }
        }
      }

      this.emit('download-completed', { model: modelName });
    } catch (error) {
      this.emit('download-error', { model: modelName, error: error.message });
      throw error;
    }
  }

  /**
   * Generate text using a local model
   */
  async generate(model: string, prompt: string, options: any = {}): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature: options.temperature || 0.7,
            max_tokens: options.max_tokens || 2048,
            ...options
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.response || '';
    } catch (error) {
      console.error('Ollama generation error:', error);
      throw error;
    }
  }

  /**
   * Generate streaming response
   */
  async generateStream(model: string, prompt: string, options: any = {}): Promise<AsyncIterable<string>> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
        options: {
          temperature: options.temperature || 0.7,
          max_tokens: options.max_tokens || 2048,
          ...options
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Streaming generation failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response reader');
    }

    return {
      async *[Symbol.asyncIterator]() {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n').filter(line => line.trim());

            for (const line of lines) {
              try {
                const data: OllamaResponse = JSON.parse(line);
                if (data.response) {
                  yield data.response;
                }
                if (data.done) {
                  return;
                }
              } catch (error) {
                // Ignore JSON parse errors for partial chunks
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    };
  }

  /**
   * Check model health and performance
   */
  async benchmarkModel(modelName: string): Promise<{
    responseTime: number;
    tokensPerSecond: number;
    quality: 'Good' | 'Very Good' | 'Excellent';
  }> {
    const testPrompt = "Write a simple Hello World function in JavaScript:";
    const startTime = Date.now();
    
    try {
      const response = await this.generate(modelName, testPrompt);
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // Rough estimation of tokens per second
      const estimatedTokens = response.length / 4; // ~4 chars per token
      const tokensPerSecond = Math.round((estimatedTokens / responseTime) * 1000);
      
      // Quality assessment based on response time and content
      let quality: 'Good' | 'Very Good' | 'Excellent' = 'Good';
      if (responseTime < 2000 && response.includes('function') && response.includes('Hello World')) {
        quality = 'Excellent';
      } else if (responseTime < 5000 && response.includes('Hello')) {
        quality = 'Very Good';
      }
      
      return {
        responseTime,
        tokensPerSecond,
        quality
      };
    } catch (error) {
      throw new Error(`Benchmark failed: ${error.message}`);
    }
  }

  /**
   * Get system health status
   */
  async getHealthStatus(): Promise<{
    serverRunning: boolean;
    installedModels: number;
    systemMemory: string;
    diskSpace: string;
    gpuAvailable: boolean;
  }> {
    const isServerRunning = await this.isServerRunning();
    const installedModels = await this.getInstalledModels();
    
    return {
      serverRunning: isServerRunning,
      installedModels: installedModels.length,
      systemMemory: this.getSystemMemory(),
      diskSpace: await this.getAvailableDiskSpace(),
      gpuAvailable: await this.isGPUAvailable()
    };
  }

  private async isServerRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  private getSystemMemory(): string {
    const totalMemory = require('os').totalmem();
    const freeMemory = require('os').freemem();
    return `${this.formatBytes(freeMemory)} free / ${this.formatBytes(totalMemory)} total`;
  }

  private async getAvailableDiskSpace(): Promise<string> {
    try {
      const stats = await fs.statfs(this.modelsDir);
      const availableBytes = stats.bavail * stats.bsize;
      return this.formatBytes(availableBytes);
    } catch (error) {
      return 'Unknown';
    }
  }

  private async isGPUAvailable(): Promise<boolean> {
    // Simple GPU detection - could be enhanced
    try {
      const { spawn } = await import('child_process');
      const nvidia = spawn('nvidia-smi', [], { stdio: 'pipe' });
      
      return new Promise((resolve) => {
        nvidia.on('close', (code) => {
          resolve(code === 0);
        });
        nvidia.on('error', () => {
          resolve(false);
        });
      });
    } catch (error) {
      return false;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Stop Ollama server
   */
  async stopOllama(): Promise<void> {
    if (this.ollamaProcess) {
      this.ollamaProcess.kill();
      this.ollamaProcess = null;
    }
    this.isRunning = false;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.stopOllama();
    this.removeAllListeners();
  }
}

// Export singleton instance
export const ollamaService = OllamaService.getInstance();