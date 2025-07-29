/**
 * Unified Backend AI Service for Production Engine
 * 
 * Integrates the extension's proven API system with the production engine,
 * providing enterprise-grade AI routing with comprehensive validation and monitoring.
 */

import { buildApiHandler, type ApiHandler } from '../api';
import { logger } from '../utils/logger';
import type { ProviderSettings } from '../api/providers/types';

export interface BackendAIOptions {
  preferredProvider?: string;
  maxTokens?: number;
  temperature?: number;
  priority?: 'cost' | 'quality' | 'speed';
  validationLevel?: 'basic' | 'standard' | 'strict';
  includeMetrics?: boolean;
}

export interface BackendAIResponse {
  content: string;
  model: string;
  provider: string;
  tokens: {
    input: number;
    output: number;
  };
  cost?: number;
  validationResults?: {
    realFunctionality: boolean;
    securityScore: number;
    qualityScore: number;
    issues: string[];
  };
  metrics?: {
    generationTime: number;
    processingTime: number;
    totalTime: number;
  };
}

export interface ProductionContext {
  type: 'web' | 'blockchain' | 'backend' | 'mobile' | 'ai' | 'payments' | 'security';
  complexity: 'low' | 'medium' | 'high';
  environment: 'development' | 'staging' | 'production';
  requirements: {
    realCode: boolean;
    includeTests: boolean;
    includeDocs: boolean;
    securityAudit: boolean;
    performanceOptimized: boolean;
  };
}

export class UnifiedBackendAI {
  private handlers: Map<string, ApiHandler> = new Map();
  private initialized = false;
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalCost: 0,
    averageResponseTime: 0
  };

  constructor() {
    this.initializeHandlers();
  }

  /**
   * Initialize enterprise-grade API handlers
   */
  private async initializeHandlers(): Promise<void> {
    if (this.initialized) return;

    try {
      const configs = this.buildProductionProviderConfigs();
      
      for (const [name, settings] of configs) {
        try {
          const handler = buildApiHandler(settings);
          this.handlers.set(name, handler);
          logger.info(`✅ Production engine initialized ${name} handler`);
        } catch (error) {
          logger.warn(`⚠️ Failed to initialize ${name}:`, error);
        }
      }

      logger.info(`🚀 Production engine AI initialized with ${this.handlers.size} handlers`);
      this.initialized = true;
      
    } catch (error) {
      logger.error('Failed to initialize production engine AI:', error);
    }
  }

  /**
   * Build production-grade provider configurations
   */
  private buildProductionProviderConfigs(): Map<string, ProviderSettings> {
    const configs = new Map<string, ProviderSettings>();

    // OpenRouter - unified access with enterprise SLA
    if (process.env.OPENROUTER_API_KEY) {
      configs.set('openrouter', {
        apiProvider: 'openrouter',
        openRouterApiKey: process.env.OPENROUTER_API_KEY,
        openRouterModelId: 'anthropic/claude-3.5-sonnet',
        openRouterUseMiddleOutTransform: true
      });
    }

    // Anthropic - premium quality for production
    if (process.env.ANTHROPIC_API_KEY) {
      configs.set('anthropic', {
        apiProvider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        apiModelId: 'claude-3-5-sonnet-20241022'
      });
    }

    // Gemini - cost-effective with high quality
    if (process.env.GOOGLE_API_KEY) {
      configs.set('gemini', {
        apiProvider: 'gemini',
        geminiApiKey: process.env.GOOGLE_API_KEY,
        geminiModelId: 'gemini-2.0-flash-exp'
      });
    }

    // Groq - high-speed processing
    if (process.env.GROQ_API_KEY) {
      configs.set('groq', {
        apiProvider: 'groq',
        groqApiKey: process.env.GROQ_API_KEY,
        groqModelId: 'llama-3.1-70b-versatile'
      });
    }

    // DeepSeek - cost-effective reasoning
    if (process.env.DEEPSEEK_API_KEY) {
      configs.set('deepseek', {
        apiProvider: 'deepseek',
        deepSeekApiKey: process.env.DEEPSEEK_API_KEY,
        deepSeekModelId: 'deepseek-r1'
      });
    }

    // Ollama - on-premises deployment
    if (process.env.OLLAMA_BASE_URL) {
      configs.set('ollama', {
        apiProvider: 'ollama',
        ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
        ollamaModelId: 'llama3.2:latest'
      });
    }

    return configs;
  }

  /**
   * Generate production-ready code with comprehensive validation
   */
  async generateProductionCode(
    prompt: string,
    context: ProductionContext,
    options: BackendAIOptions = {}
  ): Promise<BackendAIResponse> {
    await this.initializeHandlers();

    if (this.handlers.size === 0) {
      throw new Error('No AI providers available for production generation');
    }

    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // Select optimal provider for production use
      const providerName = this.selectProductionProvider(context, options);
      const handler = this.handlers.get(providerName);

      if (!handler) {
        throw new Error(`Provider ${providerName} not available`);
      }

      // Build production-grade messages
      const messages = this.buildProductionMessages(prompt, context, options);
      
      // Execute generation with monitoring
      let fullContent = '';
      let usage = { inputTokens: 0, outputTokens: 0, totalCost: 0 };
      let modelUsed = 'unknown';

      const generationStartTime = Date.now();

      const stream = handler.createMessage(messages.systemPrompt, messages.userMessages, {
        taskId: `production-${Date.now()}`,
        mode: 'production-generation'
      });

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullContent += chunk.text;
        } else if (chunk.type === 'usage') {
          usage = {
            inputTokens: chunk.inputTokens || 0,
            outputTokens: chunk.outputTokens || 0,
            totalCost: chunk.totalCost || 0
          };
        }
      }

      const generationTime = Date.now() - generationStartTime;
      const modelInfo = handler.getModel();
      modelUsed = modelInfo.id;

      // Validate generated code
      const validationStartTime = Date.now();
      const validationResults = await this.validateProductionCode(fullContent, context, options);
      const validationTime = Date.now() - validationStartTime;

      const totalTime = Date.now() - startTime;

      // Update metrics
      this.metrics.successfulRequests++;
      this.metrics.totalCost += usage.totalCost;
      this.metrics.averageResponseTime = (this.metrics.averageResponseTime + totalTime) / 2;

      // Log production metrics
      logger.info(`✅ Production generation completed`, {
        provider: providerName,
        model: modelUsed,
        tokens: `${usage.inputTokens}→${usage.outputTokens}`,
        cost: `$${usage.totalCost.toFixed(4)}`,
        timing: `${totalTime}ms total (${generationTime}ms gen, ${validationTime}ms val)`,
        validation: `Real: ${validationResults.realFunctionality}, Security: ${validationResults.securityScore}/10`
      });

      const response: BackendAIResponse = {
        content: fullContent,
        model: modelUsed,
        provider: providerName,
        tokens: {
          input: usage.inputTokens,
          output: usage.outputTokens
        },
        cost: usage.totalCost,
        validationResults,
        metrics: options.includeMetrics ? {
          generationTime,
          processingTime: validationTime,
          totalTime
        } : undefined
      };

      return response;

    } catch (error) {
      this.metrics.failedRequests++;
      logger.error('Production generation failed:', error);
      throw error;
    }
  }

  /**
   * Select optimal provider for production use
   */
  private selectProductionProvider(context: ProductionContext, options: BackendAIOptions): string {
    if (options.preferredProvider && this.handlers.has(options.preferredProvider)) {
      return options.preferredProvider;
    }

    // Production-grade provider selection
    const productionPreferences = {
      'blockchain': ['anthropic', 'openrouter', 'deepseek', 'gemini', 'groq'],
      'payments': ['anthropic', 'openrouter', 'gemini', 'deepseek', 'groq'],
      'security': ['anthropic', 'openrouter', 'deepseek', 'gemini', 'groq'],
      'backend': ['openrouter', 'anthropic', 'deepseek', 'gemini', 'groq'],
      'web': ['openrouter', 'gemini', 'anthropic', 'groq', 'deepseek'],
      'mobile': ['openrouter', 'gemini', 'anthropic', 'groq', 'deepseek'],
      'ai': ['anthropic', 'openrouter', 'deepseek', 'gemini', 'groq']
    };

    // Adjust for environment
    const preferences = productionPreferences[context.type] || productionPreferences.backend;
    
    // For production environment, prioritize enterprise providers
    if (context.environment === 'production') {
      const enterpriseOrder = ['anthropic', 'openrouter', 'gemini', 'deepseek', 'groq'];
      const availableEnterprise = enterpriseOrder.filter(p => this.handlers.has(p));
      if (availableEnterprise.length > 0) {
        return availableEnterprise[0];
      }
    }

    // Find first available provider from preferences
    for (const provider of preferences) {
      if (this.handlers.has(provider)) {
        return provider;
      }
    }

    // Fallback to any available provider
    return Array.from(this.handlers.keys())[0];
  }

  /**
   * Build production-grade messages
   */
  private buildProductionMessages(
    prompt: string,
    context: ProductionContext,
    options: BackendAIOptions
  ): {
    systemPrompt: string;
    userMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } {
    const systemPrompt = `You are Recoder Production Engine, an enterprise-grade AI that generates REAL, PRODUCTION-READY code. Never create mock implementations.

PRODUCTION REQUIREMENTS:
1. Generate ACTUAL working code with real functionality
2. Include comprehensive error handling and validation
3. Use real API integrations and database operations
4. Include detailed TypeScript types and interfaces
5. Generate working implementations, not placeholders
6. Add enterprise-grade security measures
7. Use environment variables for configuration
8. Include performance optimizations
9. Add proper logging and monitoring
10. Follow industry best practices and compliance standards

ENVIRONMENT: ${context.environment.toUpperCase()}
PROJECT TYPE: ${context.type.toUpperCase()}
COMPLEXITY: ${context.complexity.toUpperCase()}

${context.requirements.realCode ? '✅ REAL CODE ONLY - No mock implementations allowed' : ''}
${context.requirements.includeTests ? '✅ INCLUDE COMPREHENSIVE TESTS - Unit, integration, and e2e tests' : ''}
${context.requirements.includeDocs ? '✅ INCLUDE DOCUMENTATION - API docs, README, and code comments' : ''}
${context.requirements.securityAudit ? '✅ SECURITY AUDIT - Include security analysis and recommendations' : ''}
${context.requirements.performanceOptimized ? '✅ PERFORMANCE OPTIMIZED - Include performance benchmarks and optimizations' : ''}

VALIDATION LEVEL: ${options.validationLevel || 'standard'}`;

    const userMessages = [
      {
        role: 'user' as const,
        content: `${prompt}

DELIVERY REQUIREMENTS:
- Complete, production-ready implementation
- Real database operations and API integrations
- Comprehensive error handling
- Security best practices
- Performance optimizations
- ${context.requirements.includeTests ? 'Full test coverage' : 'Basic testing'}
- ${context.requirements.includeDocs ? 'Complete documentation' : 'Code comments'}
- Deployment instructions for ${context.environment}

Please structure your response as:

## Overview
[Brief project overview and architecture]

## Implementation
\`\`\`typescript
[Complete, production-ready code]
\`\`\`

## Database Schema
[Database models and migrations if applicable]

## API Documentation
[API endpoints and usage if applicable]

## Security Considerations
[Security measures and recommendations]

## Performance Notes
[Performance optimizations and benchmarks]

## Deployment
[Production deployment instructions]

## Testing
[Testing strategy and test cases]`
      }
    ];

    return { systemPrompt, userMessages };
  }

  /**
   * Validate production code quality
   */
  private async validateProductionCode(
    code: string,
    context: ProductionContext,
    options: BackendAIOptions
  ): Promise<{
    realFunctionality: boolean;
    securityScore: number;
    qualityScore: number;
    issues: string[];
  }> {
    const issues: string[] = [];
    let realFunctionality = true;
    let securityScore = 10;
    let qualityScore = 10;

    // Check for mock implementations
    const mockIndicators = [
      'TODO:',
      'placeholder',
      'mock implementation',
      'not implemented',
      'throw new Error("Not implemented")',
      'console.log("mock")',
      'fake data',
      '// mock'
    ];

    const lowerCode = code.toLowerCase();
    for (const indicator of mockIndicators) {
      if (lowerCode.includes(indicator.toLowerCase())) {
        realFunctionality = false;
        issues.push(`Mock implementation detected: ${indicator}`);
        qualityScore -= 2;
      }
    }

    // Security checks
    const securityIssues = [
      { pattern: /password\s*=\s*["'][^"']+["']/gi, issue: 'Hardcoded password detected', severity: 3 },
      { pattern: /api[_-]?key\s*=\s*["'][^"']+["']/gi, issue: 'Hardcoded API key detected', severity: 3 },
      { pattern: /eval\s*\(/gi, issue: 'Dangerous eval() usage', severity: 2 },
      { pattern: /innerHTML\s*=/gi, issue: 'Potential XSS vulnerability with innerHTML', severity: 2 },
      { pattern: /document\.write\s*\(/gi, issue: 'Dangerous document.write usage', severity: 2 },
      { pattern: /sql\s*=\s*["'][^"']*\+/gi, issue: 'Potential SQL injection vulnerability', severity: 3 }
    ];

    for (const check of securityIssues) {
      if (check.pattern.test(code)) {
        issues.push(check.issue);
        securityScore -= check.severity;
      }
    }

    // Quality checks
    const qualityChecks = [
      { pattern: /catch\s*\(\s*\w+\s*\)\s*\{\s*\}/gi, issue: 'Empty catch blocks detected', severity: 1 },
      { pattern: /console\.log\(/gi, issue: 'Console.log statements should be removed for production', severity: 1 },
      { pattern: /debugger;/gi, issue: 'Debugger statements should be removed', severity: 1 }
    ];

    for (const check of qualityChecks) {
      if (check.pattern.test(code)) {
        issues.push(check.issue);
        qualityScore -= check.severity;
      }
    }

    // Ensure scores don't go below 0
    securityScore = Math.max(0, securityScore);
    qualityScore = Math.max(0, qualityScore);

    // Additional validation for high-security contexts
    if (context.requirements.securityAudit && securityScore < 8) {
      issues.push('Code failed security audit requirements');
    }

    return {
      realFunctionality,
      securityScore,
      qualityScore,
      issues
    };
  }

  /**
   * Get production metrics and status
   */
  getProductionMetrics(): {
    handlers: string[];
    metrics: typeof this.metrics;
    status: 'healthy' | 'degraded' | 'unhealthy';
  } {
    const successRate = this.metrics.totalRequests > 0 
      ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 
      : 100;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (successRate < 95) status = 'degraded';
    if (successRate < 85) status = 'unhealthy';

    return {
      handlers: Array.from(this.handlers.keys()),
      metrics: {
        ...this.metrics,
        successRate: parseFloat(successRate.toFixed(2))
      },
      status
    };
  }

  /**
   * Test all handlers for health check
   */
  async healthCheck(): Promise<{ [handler: string]: boolean }> {
    await this.initializeHandlers();
    
    const results: { [handler: string]: boolean } = {};
    
    for (const [name, handler] of this.handlers) {
      try {
        const testMessages = [{
          role: 'user' as const,
          content: 'Respond with "OK" to confirm connectivity'
        }];

        const stream = handler.createMessage('You are a health check assistant.', testMessages, {
          taskId: `health-${Date.now()}`,
          mode: 'health-check'
        });

        let hasResponse = false;
        for await (const chunk of stream) {
          if (chunk.type === 'text' && chunk.text.length > 0) {
            hasResponse = true;
            break;
          }
        }

        results[name] = hasResponse;
        logger.info(`${hasResponse ? '✅' : '❌'} ${name} health check`);
        
      } catch (error) {
        results[name] = false;
        logger.error(`❌ ${name} health check failed:`, error);
      }
    }

    return results;
  }
}

// Export singleton for production engine usage
export const unifiedBackendAI = new UnifiedBackendAI();
export default unifiedBackendAI;