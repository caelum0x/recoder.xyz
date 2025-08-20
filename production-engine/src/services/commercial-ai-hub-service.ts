/**
 * Commercial AI Hub Service for Production Engine
 * Simplified service that uses OpenRouter instead of complex legacy integrations
 */

import { logger } from '../utils/logger';
import { openRouterService } from './openrouter-service';

export interface GenerationOptions {
  type?: string;
  complexity?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  temperature?: number;
}

export interface GenerationContext {
  type: 'web' | 'backend' | 'blockchain' | 'mobile' | 'ai' | 'payments';
  complexity: 'simple' | 'medium' | 'complex';
  requirements: {
    realCode: boolean;
    includeTests: boolean;
    includeDocs: boolean;
    securityAudit: boolean;
    performanceOptimized: boolean;
  };
}

export class CommercialAIHubService {
  
  constructor() {
    logger.info('🤖 Initializing Commercial AI Hub Service with OpenRouter...');
  }

  /**
   * Generate code using the best available model
   */
  async generateWithBestModel(
    prompt: string, 
    options: GenerationOptions = {}
  ): Promise<string> {
    try {
      logger.info(`Starting code generation with OpenRouter...`);
      
      // Use OpenRouter service directly
      const result = await openRouterService.generateCode(prompt, {
        projectType: options.type || 'web',
        maxTokens: options.maxTokens || 8000,
        temperature: options.temperature || 0.3
      });

      if (result.success) {
        logger.info(`Code generation successful with model: ${result.model}`);
        return result.content;
      } else {
        throw new Error(result.error || 'Code generation failed');
      }

    } catch (error: any) {
      logger.error(`Code generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get available AI providers
   */
  async getAvailableProviders(): Promise<string[]> {
    try {
      if (openRouterService.isConfigured()) {
        const models = openRouterService.getAvailableModels();
        return models.map(model => `${model.provider}/${model.id}`);
      }
      return ['openrouter-not-configured'];
    } catch (error: any) {
      logger.error(`Failed to get providers: ${error.message}`);
      return ['error-getting-providers'];
    }
  }

  /**
   * Health check for all AI services
   */
  async healthCheck(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    unified: Record<string, boolean>;
    legacy: Record<string, boolean>;
  }> {
    try {
      const openRouterHealth = await openRouterService.healthCheck();
      
      const unified = {
        openRouter: openRouterHealth.status === 'healthy',
        anthropic: openRouterHealth.apiKeyValid,
        google: openRouterHealth.modelsAvailable > 0,
        deepSeek: openRouterHealth.status !== 'unhealthy'
      };

      const legacy = {
        ollama: false, // Disabled in commercial version
        local: false   // Disabled in commercial version
      };

      const healthyCount = Object.values(unified).filter(Boolean).length;
      let overall: 'healthy' | 'degraded' | 'unhealthy' = 'unhealthy';
      
      if (healthyCount >= 3) {
        overall = 'healthy';
      } else if (healthyCount >= 1) {
        overall = 'degraded';
      }

      return { overall, unified, legacy };

    } catch (error: any) {
      logger.error(`Health check failed: ${error.message}`);
      return {
        overall: 'unhealthy',
        unified: { openRouter: false, anthropic: false, google: false, deepSeek: false },
        legacy: { ollama: false, local: false }
      };
    }
  }

  /**
   * Get performance metrics
   */
  getProductionMetrics(): {
    handlers: string[];
    activeProviders: number;
    totalRequests: number;
    averageLatency: number;
    errorRate: number;
  } {
    try {
      const models = openRouterService.getAvailableModels();
      
      return {
        handlers: models.map(m => m.id),
        activeProviders: models.length,
        totalRequests: 0, // Would be tracked in production
        averageLatency: 0,
        errorRate: 0
      };
    } catch (error) {
      return {
        handlers: [],
        activeProviders: 0,
        totalRequests: 0,
        averageLatency: 0,
        errorRate: 100
      };
    }
  }

  /**
   * Generate structured code with validation
   */
  async generateStructuredCode(
    context: GenerationContext,
    prompt: string,
    options: GenerationOptions = {}
  ): Promise<{
    code: string;
    files: Array<{ path: string; content: string; type: string }>;
    instructions: string;
    metadata: {
      provider: string;
      model: string;
      tokensUsed: number;
      generationTime: number;
    };
  }> {
    const startTime = Date.now();
    
    try {
      // Enhanced prompt for structured output
      const structuredPrompt = this.buildStructuredPrompt(context, prompt);
      
      const result = await openRouterService.generateCode(structuredPrompt, {
        projectType: context.type,
        maxTokens: options.maxTokens || 8000,
        temperature: options.temperature || 0.3
      });

      if (!result.success) {
        throw new Error(result.error || 'Generation failed');
      }

      // Parse the structured output
      const parsed = this.parseStructuredOutput(result.content);
      
      return {
        code: result.content,
        files: parsed.files,
        instructions: parsed.instructions,
        metadata: {
          provider: 'openrouter',
          model: result.model,
          tokensUsed: result.usage.totalTokens,
          generationTime: Date.now() - startTime
        }
      };

    } catch (error: any) {
      logger.error(`Structured code generation failed: ${error.message}`);
      throw error;
    }
  }

  private buildStructuredPrompt(context: GenerationContext, userPrompt: string): string {
    const contextInfo = `
Project Type: ${context.type}
Complexity: ${context.complexity}
Requirements:
- Real Code: ${context.requirements.realCode}
- Include Tests: ${context.requirements.includeTests}
- Include Docs: ${context.requirements.includeDocs}
- Security Audit: ${context.requirements.securityAudit}
- Performance Optimized: ${context.requirements.performanceOptimized}
`;

    return `${contextInfo}

User Request: ${userPrompt}

Please generate production-ready code with the following structure:
1. Complete, working implementation
2. Proper error handling
3. Security best practices
4. Performance optimizations
5. Comprehensive documentation

Format your response with clear file separations using:
\`\`\`language file:path/filename
[code content]
\`\`\``;
  }

  private parseStructuredOutput(content: string): {
    files: Array<{ path: string; content: string; type: string }>;
    instructions: string;
  } {
    const files: Array<{ path: string; content: string; type: string }> = [];
    let instructions = '';

    // Extract code blocks
    const codeBlockRegex = /```(\w+)?\s*(?:file:(.+?))?\n([\s\S]*?)```/gi;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const [, language, filePath, codeContent] = match;
      
      if (filePath && codeContent) {
        files.push({
          path: filePath.trim(),
          content: codeContent.trim(),
          type: this.determineFileType(filePath)
        });
      }
    }

    // Extract instructions (text not in code blocks)
    const instructionsMatch = content.match(/(?:## Instructions|## Setup|## Usage)([\s\S]*?)(?=```|$)/i);
    if (instructionsMatch) {
      instructions = instructionsMatch[1].trim();
    } else {
      instructions = 'Run `npm install` and `npm start` to get started.';
    }

    return { files, instructions };
  }

  private determineFileType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    const typeMap: Record<string, string> = {
      'js': 'code',
      'jsx': 'code',
      'ts': 'code',
      'tsx': 'code',
      'py': 'code',
      'java': 'code',
      'go': 'code',
      'rs': 'code',
      'sol': 'code',
      'json': 'config',
      'yaml': 'config',
      'yml': 'config',
      'env': 'config',
      'md': 'documentation',
      'txt': 'documentation',
      'test.js': 'test',
      'test.ts': 'test',
      'spec.js': 'test',
      'spec.ts': 'test'
    };

    if (filePath.includes('test') || filePath.includes('spec')) {
      return 'test';
    }

    return typeMap[ext || ''] || 'code';
  }
}

// Export singleton instance
export const commercialAIHubService = new CommercialAIHubService();