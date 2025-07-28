/**
 * Enhanced Ollama Integration for Production Engine
 * Connects production engine to CLI's comprehensive Ollama system
 */

import { logger } from '../utils/logger';

export interface OllamaIntegrationResult {
  success: boolean;
  available: boolean;
  models: string[];
  version?: string;
  error?: string;
}

export class EnhancedOllamaIntegration {
  private cliPath: string;
  
  constructor() {
    // Path to CLI's Ollama system
    this.cliPath = process.env.CLI_PATH || '../packages/cli';
  }

  /**
   * Check if Ollama is available through CLI integration
   */
  async checkAvailability(): Promise<OllamaIntegrationResult> {
    try {
      // Try to import and use CLI's Ollama service
      const { ollamaService } = await import(`${this.cliPath}/src/services/ollama/ollama-service`);
      
      const status = await ollamaService.getStatus();
      
      return {
        success: true,
        available: status.isAvailable && status.isRunning,
        models: await this.getAvailableModels(),
        version: status.version
      };
    } catch (error: any) {
      logger.warn(`CLI Ollama integration not available: ${error.message}`);
      
      // Fallback to direct Ollama check
      return await this.directOllamaCheck();
    }
  }

  /**
   * Get available models through CLI integration
   */
  private async getAvailableModels(): Promise<string[]> {
    try {
      const { modelManager } = await import(`${this.cliPath}/src/services/ollama/model-manager`);
      const models = await modelManager.getInstalledModels();
      return models.map(m => m.name);
    } catch (error) {
      logger.warn('Could not get models from CLI integration');
      return [];
    }
  }

  /**
   * Direct Ollama availability check as fallback
   */
  private async directOllamaCheck(): Promise<OllamaIntegrationResult> {
    try {
      const axios = await import('axios');
      const baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      
      const response = await axios.default.get(`${baseURL}/api/tags`, { timeout: 5000 });
      const models = response.data.models?.map((m: any) => m.name) || [];
      
      return {
        success: true,
        available: true,
        models,
        version: 'unknown'
      };
    } catch (error: any) {
      return {
        success: false,
        available: false,
        models: [],
        error: error.message
      };
    }
  }

  /**
   * Setup Ollama through CLI's auto-installation system
   */
  async setupOllama(): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('🚀 Attempting to setup Ollama through CLI integration...');
      
      const { ollamaInstaller } = await import(`${this.cliPath}/src/services/ollama/installer`);
      
      const result = await ollamaInstaller.install({
        autoStart: true,
        downloadRecommendedModels: true,
        models: ['llama3:latest', 'codellama:latest']
      });

      if (result.success) {
        logger.info('✅ Ollama setup completed successfully');
        return {
          success: true,
          message: 'Ollama installed and configured with recommended models'
        };
      } else {
        return {
          success: false,
          message: result.error || 'Ollama installation failed'
        };
      }
    } catch (error: any) {
      logger.error(`Ollama setup failed: ${error.message}`);
      return {
        success: false,
        message: `Setup failed: ${error.message}. Please install Ollama manually from https://ollama.ai/`
      };
    }
  }

  /**
   * Get model recommendations for code generation
   */
  async getModelRecommendations(projectType: string): Promise<string[]> {
    try {
      const { recommendationEngine } = await import(`${this.cliPath}/src/services/ollama/recommendation-engine`);
      
      const recommendations = await recommendationEngine.getRecommendations({
        projectType,
        taskType: 'code_generation',
        complexity: 'medium',
        userPreferences: { preferLocal: true }
      });

      return recommendations.map(r => r.modelName);
    } catch (error) {
      logger.warn('Could not get model recommendations, using defaults');
      
      // Default recommendations based on project type
      const defaults: Record<string, string[]> = {
        web: ['codellama:latest', 'llama3:latest'],
        blockchain: ['llama3:latest', 'codellama:latest'],
        backend: ['codellama:latest', 'llama3:latest'],
        mobile: ['codellama:latest', 'llama3:latest'],
        ai: ['llama3:latest', 'codellama:latest']
      };

      return defaults[projectType] || ['llama3:latest'];
    }
  }

  /**
   * Enhanced code generation through CLI's Ollama system
   */
  async generateCodeWithCLI(prompt: string, options: {
    projectType: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{
    success: boolean;
    content: string;
    model: string;
    performance?: any;
    error?: string;
  }> {
    try {
      const { enhancedOllamaProvider } = await import(`${this.cliPath}/src/services/ollama/enhanced-ollama-provider`);
      
      // Get recommended model if not specified
      const model = options.model || (await this.getModelRecommendations(options.projectType))[0];
      
      const response = await enhancedOllamaProvider.complete(prompt, {
        model,
        maxTokens: options.maxTokens || 8000,
        temperature: options.temperature || 0.3,
        contextAware: true,
        smartModelSelection: true,
        optimizePerformance: true,
        responseFormat: 'code'
      });

      return {
        success: true,
        content: response.content,
        model: response.model,
        performance: response.performance
      };
    } catch (error: any) {
      logger.error(`Enhanced Ollama generation failed: ${error.message}`);
      return {
        success: false,
        content: '',
        model: options.model || 'unknown',
        error: error.message
      };
    }
  }

  /**
   * Get performance metrics from CLI integration
   */
  async getPerformanceMetrics(): Promise<any> {
    try {
      const { performanceOptimizer } = await import(`${this.cliPath}/src/services/ollama/performance-optimizer`);
      return await performanceOptimizer.getMetrics();
    } catch (error) {
      logger.warn('Could not get performance metrics from CLI integration');
      return null;
    }
  }
}

// Export singleton instance
export const enhancedOllamaIntegration = new EnhancedOllamaIntegration();