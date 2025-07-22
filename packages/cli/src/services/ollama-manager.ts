/**
 * Ollama Local Model Manager
 * Handles auto-installation, management, and optimization of local AI models
 */

import { Logger } from '@recoder/shared';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export interface LocalModelConfig {
  name: string;
  size: string;
  description: string;
  strengths: string[];
  downloadSize: number; // MB
  ramRequired: number; // MB
  recommended: boolean;
}

export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  modelsInstalled: string[];
  availableModels: LocalModelConfig[];
}

export class OllamaManager {
  private ollamaHost = 'http://localhost:11434';
  private configDir: string;
  private modelsConfig: LocalModelConfig[];

  constructor() {
    this.configDir = path.join(os.homedir(), '.recoder', 'ollama');
    this.initializeModelsConfig();
  }

  private initializeModelsConfig(): void {
    this.modelsConfig = [
      {
        name: 'qwen2.5-coder:7b',
        size: '4.2GB',
        description: 'Qwen2.5 Coder 7B - Excellent for code generation and debugging',
        strengths: ['code-generation', 'debugging', 'code-review', 'refactoring'],
        downloadSize: 4200,
        ramRequired: 8000,
        recommended: true
      },
      {
        name: 'deepseek-coder-v2:16b',
        size: '9.1GB',
        description: 'DeepSeek Coder V2 16B - Advanced coding capabilities',
        strengths: ['complex-coding', 'architecture', 'algorithms', 'documentation'],
        downloadSize: 9100,
        ramRequired: 16000,
        recommended: false
      },
      {
        name: 'codellama:7b',
        size: '3.8GB',
        description: 'Code Llama 7B - General-purpose coding model',
        strengths: ['general-coding', 'python', 'javascript', 'explanation'],
        downloadSize: 3800,
        ramRequired: 8000,
        recommended: true
      },
      {
        name: 'phi3.5:3.8b',
        size: '2.2GB',
        description: 'Phi-3.5 3.8B - Lightweight, fast model for simple tasks',
        strengths: ['simple-coding', 'chat', 'quick-responses', 'mobile-friendly'],
        downloadSize: 2200,
        ramRequired: 4000,
        recommended: true
      },
      {
        name: 'llama3.1:8b',
        size: '4.7GB',
        description: 'Llama 3.1 8B - General-purpose with good coding abilities',
        strengths: ['general-purpose', 'reasoning', 'chat', 'coding'],
        downloadSize: 4700,
        ramRequired: 10000,
        recommended: false
      }
    ];
  }

  async getStatus(): Promise<OllamaStatus> {
    const installed = await this.isOllamaInstalled();
    const running = installed ? await this.isOllamaRunning() : false;
    const version = installed ? await this.getOllamaVersion() : undefined;
    const modelsInstalled = running ? await this.getInstalledModels() : [];

    return {
      installed,
      running,
      version,
      modelsInstalled,
      availableModels: this.modelsConfig
    };
  }

  async autoSetup(): Promise<{ success: boolean; message: string }> {
    try {
      Logger.info('🚀 Starting Ollama auto-setup...');

      // Step 1: Install Ollama if not present
      if (!await this.isOllamaInstalled()) {
        Logger.info('📥 Installing Ollama...');
        const installResult = await this.installOllama();
        if (!installResult.success) {
          return installResult;
        }
      }

      // Step 2: Start Ollama service
      if (!await this.isOllamaRunning()) {
        Logger.info('🔄 Starting Ollama service...');
        await this.startOllama();
        
        // Wait for service to be ready
        await this.waitForOllama(30000);
      }

      // Step 3: Install recommended models
      const systemInfo = this.getSystemInfo();
      const recommendedModel = this.selectRecommendedModel(systemInfo);
      
      Logger.info(`💾 Installing recommended model: ${recommendedModel.name}`);
      const modelResult = await this.installModel(recommendedModel.name);
      
      if (!modelResult.success) {
        return { 
          success: false, 
          message: `Ollama installed but failed to install model: ${modelResult.message}` 
        };
      }

      return { 
        success: true, 
        message: `Ollama successfully set up with ${recommendedModel.name}` 
      };
    } catch (error) {
      Logger.error('Ollama setup failed:', error);
      return { 
        success: false, 
        message: `Setup failed: ${error.message}` 
      };
    }
  }

  async installOllama(): Promise<{ success: boolean; message: string }> {
    try {
      const platform = os.platform();
      
      if (platform === 'darwin') {
        // macOS installation
        Logger.info('Installing Ollama for macOS...');
        await execAsync('curl -fsSL https://ollama.com/install.sh | sh');
      } else if (platform === 'linux') {
        // Linux installation
        Logger.info('Installing Ollama for Linux...');
        await execAsync('curl -fsSL https://ollama.com/install.sh | sh');
      } else if (platform === 'win32') {
        // Windows installation
        Logger.info('Please install Ollama manually from https://ollama.com/download');
        return { 
          success: false, 
          message: 'Windows installation requires manual setup. Please visit https://ollama.com/download' 
        };
      } else {
        return { 
          success: false, 
          message: `Unsupported platform: ${platform}` 
        };
      }

      // Verify installation
      await new Promise(resolve => setTimeout(resolve, 5000));
      const installed = await this.isOllamaInstalled();
      
      if (!installed) {
        return { 
          success: false, 
          message: 'Installation completed but Ollama not found in PATH' 
        };
      }

      return { success: true, message: 'Ollama installed successfully' };
    } catch (error) {
      return { 
        success: false, 
        message: `Installation failed: ${error.message}` 
      };
    }
  }

  async startOllama(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ollama = spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore'
      });

      ollama.unref(); // Allow parent to exit

      // Give it a moment to start
      setTimeout(() => {
        resolve();
      }, 3000);
    });
  }

  async installModel(modelName: string): Promise<{ success: boolean; message: string; progress?: number }> {
    try {
      Logger.info(`📦 Installing model: ${modelName}`);

      return new Promise((resolve, reject) => {
        const ollama = spawn('ollama', ['pull', modelName]);
        
        let output = '';
        let lastProgress = 0;

        ollama.stdout.on('data', (data) => {
          output += data.toString();
          
          // Parse download progress
          const progressMatch = data.toString().match(/(\d+)%/);
          if (progressMatch) {
            const progress = parseInt(progressMatch[1]);
            if (progress > lastProgress + 10) { // Log every 10%
              Logger.info(`📥 Downloading ${modelName}: ${progress}%`);
              lastProgress = progress;
            }
          }
        });

        ollama.stderr.on('data', (data) => {
          output += data.toString();
        });

        ollama.on('close', (code) => {
          if (code === 0) {
            Logger.info(`✅ Model ${modelName} installed successfully`);
            resolve({ success: true, message: 'Model installed successfully' });
          } else {
            Logger.error(`❌ Failed to install ${modelName}: ${output}`);
            resolve({ 
              success: false, 
              message: `Installation failed with code ${code}: ${output}` 
            });
          }
        });
      });
    } catch (error) {
      return { 
        success: false, 
        message: `Failed to install model: ${error.message}` 
      };
    }
  }

  async removeModel(modelName: string): Promise<{ success: boolean; message: string }> {
    try {
      await execAsync(`ollama rm ${modelName}`);
      Logger.info(`🗑️ Removed model: ${modelName}`);
      return { success: true, message: 'Model removed successfully' };
    } catch (error) {
      return { 
        success: false, 
        message: `Failed to remove model: ${error.message}` 
      };
    }
  }

  async chat(modelName: string, prompt: string): Promise<string> {
    try {
      const response = await axios.post(`${this.ollamaHost}/api/generate`, {
        model: modelName,
        prompt,
        stream: false
      });

      return response.data.response;
    } catch (error) {
      throw new Error(`Ollama chat failed: ${error.message}`);
    }
  }

  async getModelInfo(modelName: string): Promise<any> {
    try {
      const response = await axios.post(`${this.ollamaHost}/api/show`, {
        name: modelName
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get model info: ${error.message}`);
    }
  }

  // Private helper methods
  private async isOllamaInstalled(): boolean {
    try {
      await execAsync('ollama --version');
      return true;
    } catch {
      return false;
    }
  }

  private async isOllamaRunning(): boolean {
    try {
      const response = await axios.get(`${this.ollamaHost}/api/version`, {
        timeout: 2000
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  private async getOllamaVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('ollama --version');
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }

  private async getInstalledModels(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.ollamaHost}/api/tags`);
      return response.data.models?.map((model: any) => model.name) || [];
    } catch {
      return [];
    }
  }

  private async waitForOllama(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (await this.isOllamaRunning()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return false;
  }

  private getSystemInfo(): { ram: number; platform: string; arch: string } {
    return {
      ram: os.totalmem() / (1024 * 1024), // Convert to MB
      platform: os.platform(),
      arch: os.arch()
    };
  }

  private selectRecommendedModel(systemInfo: { ram: number }): LocalModelConfig {
    // Select model based on available RAM
    if (systemInfo.ram >= 16000) {
      // 16GB+ RAM - can run larger models
      return this.modelsConfig.find(m => m.name === 'qwen2.5-coder:7b') || this.modelsConfig[0];
    } else if (systemInfo.ram >= 8000) {
      // 8GB RAM - medium models
      return this.modelsConfig.find(m => m.name === 'codellama:7b') || this.modelsConfig[0];
    } else {
      // Less than 8GB RAM - lightweight models
      return this.modelsConfig.find(m => m.name === 'phi3.5:3.8b') || this.modelsConfig[0];
    }
  }

  async optimizeForHardware(): Promise<{ success: boolean; recommendations: string[] }> {
    const systemInfo = this.getSystemInfo();
    const recommendations: string[] = [];

    if (systemInfo.ram < 8000) {
      recommendations.push('Consider using phi3.5:3.8b for better performance on low-RAM systems');
    }

    if (systemInfo.platform === 'darwin' && systemInfo.arch === 'arm64') {
      recommendations.push('Apple Silicon detected - models will run efficiently with Metal acceleration');
    }

    if (systemInfo.ram >= 32000) {
      recommendations.push('High RAM detected - consider installing deepseek-coder-v2:16b for advanced capabilities');
    }

    return { success: true, recommendations };
  }

  async getUsageStats(): Promise<{
    totalModels: number;
    diskUsage: number;
    mostUsedModel: string;
    recommendations: string[];
  }> {
    const status = await this.getStatus();
    const recommendations = [];

    if (status.modelsInstalled.length === 0) {
      recommendations.push('No models installed. Run "recoder ollama install" to get started');
    }

    if (status.modelsInstalled.length > 3) {
      recommendations.push('Multiple models detected. Consider removing unused models to save disk space');
    }

    return {
      totalModels: status.modelsInstalled.length,
      diskUsage: status.modelsInstalled.length * 4000, // Rough estimate
      mostUsedModel: status.modelsInstalled[0] || 'none',
      recommendations
    };
  }
}

// Export singleton instance
export const OllamaManager_Instance = new OllamaManager();