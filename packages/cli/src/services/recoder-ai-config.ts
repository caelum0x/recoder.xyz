/**
 * Recoder AI Configuration Manager
 * 
 * Manages optimal AI provider configurations for different use cases,
 * including cost optimization, quality preferences, and environment-specific settings.
 */

import { Logger } from '../utils/logger';
import { costEfficientRouter, CostOptimizationConfig } from './cost-efficient-router';

export interface RecoderAISettings {
  // Cost Management
  maxDailyCost: number;
  preferFreeModels: boolean;
  budgetMode: boolean;
  costTrackingEnabled: boolean;

  // Quality Settings
  qualityThreshold: number;
  allowFallbacks: boolean;
  requireRealCode: boolean;

  // Performance Settings
  cacheEnabled: boolean;
  maxConcurrentRequests: number;
  requestTimeout: number;

  // Provider Preferences
  primaryProvider: string;
  fallbackProviders: string[];
  disabledProviders: string[];

  // Environment Specific
  environment: 'development' | 'production' | 'testing';
  enableLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  // Recoder Specific
  realCodeOnly: boolean;
  includeTests: boolean;
  includeDocs: boolean;
  generateDeployment: boolean;
}

export interface TaskTypeConfig {
  preferredModels: string[];
  qualityRequired: number;
  maxCostPerRequest: number;
  timeoutMs: number;
  specialInstructions: string[];
}

export class RecoderAIConfigManager {
  private static instance: RecoderAIConfigManager;
  private settings: RecoderAISettings;
  private taskConfigs: Map<string, TaskTypeConfig> = new Map();

  private constructor() {
    this.settings = this.loadSettings();
    this.initializeTaskConfigs();
    this.validateConfiguration();
  }

  public static getInstance(): RecoderAIConfigManager {
    if (!RecoderAIConfigManager.instance) {
      RecoderAIConfigManager.instance = new RecoderAIConfigManager();
    }
    return RecoderAIConfigManager.instance;
  }

  /**
   * Load settings from environment variables and defaults
   */
  private loadSettings(): RecoderAISettings {
    return {
      // Cost Management
      maxDailyCost: parseFloat(process.env.RECODER_MAX_DAILY_COST || '10.00'),
      preferFreeModels: process.env.RECODER_PREFER_FREE_MODELS !== 'false',
      budgetMode: process.env.RECODER_BUDGET_MODE === 'true',
      costTrackingEnabled: process.env.RECODER_COST_TRACKING !== 'false',

      // Quality Settings  
      qualityThreshold: parseFloat(process.env.RECODER_QUALITY_THRESHOLD || '7.5'),
      allowFallbacks: process.env.RECODER_ALLOW_FALLBACKS !== 'false',
      requireRealCode: process.env.RECODER_REQUIRE_REAL_CODE !== 'false',

      // Performance Settings
      cacheEnabled: process.env.RECODER_CACHE_ENABLED !== 'false',
      maxConcurrentRequests: parseInt(process.env.RECODER_MAX_CONCURRENT || '5'),
      requestTimeout: parseInt(process.env.RECODER_REQUEST_TIMEOUT || '60000'),

      // Provider Preferences
      primaryProvider: process.env.RECODER_PRIMARY_PROVIDER || 'openrouter',
      fallbackProviders: (process.env.RECODER_FALLBACK_PROVIDERS || 'ollama,gemini,groq').split(','),
      disabledProviders: (process.env.RECODER_DISABLED_PROVIDERS || '').split(',').filter(Boolean),

      // Environment Specific
      environment: (process.env.NODE_ENV as any) || 'development',
      enableLogging: process.env.RECODER_ENABLE_LOGGING !== 'false',
      logLevel: (process.env.RECODER_LOG_LEVEL as any) || 'info',

      // Recoder Specific
      realCodeOnly: process.env.RECODER_REAL_CODE_ONLY !== 'false',
      includeTests: process.env.RECODER_INCLUDE_TESTS === 'true',
      includeDocs: process.env.RECODER_INCLUDE_DOCS === 'true',
      generateDeployment: process.env.RECODER_GENERATE_DEPLOYMENT === 'true'
    };
  }

  /**
   * Initialize task-specific configurations
   */
  private initializeTaskConfigs(): void {
    // Blockchain Development - Requires highest quality and security
    this.taskConfigs.set('blockchain', {
      preferredModels: [
        'anthropic/claude-3.5-sonnet',    // Best for security analysis
        'deepseek/deepseek-r1',           // Free but high quality for reasoning
        'google/gemini-2.0-flash-exp',    // Good balance, free tier
        'meta-llama/llama-3.1-70b-instruct'
      ],
      qualityRequired: 9.0,
      maxCostPerRequest: 0.50,
      timeoutMs: 120000, // 2 minutes for complex smart contracts
      specialInstructions: [
        'Implement comprehensive security audits',
        'Include gas optimization strategies',
        'Add proper error handling for blockchain interactions',
        'Include real testnet deployment instructions'
      ]
    });

    // Web Development - Balance of speed and quality
    this.taskConfigs.set('web', {
      preferredModels: [
        'qwen/qwen-2.5-coder-32b-instruct', // Free coding specialist
        'google/gemini-2.0-flash-exp',       // Fast and free
        'meta-llama/llama-3.1-70b-instruct', // Good general coding
        'anthropic/claude-3.5-sonnet'        // Premium for complex components
      ],
      qualityRequired: 7.5,
      maxCostPerRequest: 0.25,
      timeoutMs: 60000,
      specialInstructions: [
        'Generate responsive, accessible components',
        'Include proper TypeScript types',
        'Add comprehensive error boundaries',
        'Implement proper state management patterns'
      ]
    });

    // Backend Development - Focus on reliability and performance
    this.taskConfigs.set('backend', {
      preferredModels: [
        'deepseek/deepseek-r1',              // Free, excellent for system design
        'qwen/qwen-2.5-coder-32b-instruct',  // Free coding specialist
        'anthropic/claude-3.5-sonnet',       // Premium for complex architecture
        'meta-llama/llama-3.1-70b-instruct'
      ],
      qualityRequired: 8.0,
      maxCostPerRequest: 0.30,
      timeoutMs: 90000,
      specialInstructions: [
        'Implement proper database migrations',
        'Add comprehensive input validation',
        'Include rate limiting and security middleware',
        'Generate realistic load testing scenarios'
      ]
    });

    // Mobile Development
    this.taskConfigs.set('mobile', {
      preferredModels: [
        'qwen/qwen-2.5-coder-32b-instruct',
        'google/gemini-2.0-flash-exp',
        'meta-llama/llama-3.1-70b-instruct',
        'anthropic/claude-3.5-sonnet'
      ],
      qualityRequired: 7.5,
      maxCostPerRequest: 0.25,
      timeoutMs: 60000,
      specialInstructions: [
        'Generate cross-platform compatible code',
        'Include proper platform-specific optimizations',
        'Add native module integrations where needed',
        'Implement proper offline functionality'
      ]
    });

    // Security - Highest quality required
    this.taskConfigs.set('security', {
      preferredModels: [
        'anthropic/claude-3.5-sonnet',    // Best for security analysis
        'deepseek/deepseek-r1',           // Good reasoning capabilities
        'google/gemini-2.0-pro',          // Google's premium model
        'meta-llama/llama-3.1-70b-instruct'
      ],
      qualityRequired: 9.5,
      maxCostPerRequest: 0.75,
      timeoutMs: 180000, // 3 minutes for thorough security analysis
      specialInstructions: [
        'Perform comprehensive vulnerability assessment',
        'Include OWASP Top 10 protection measures',
        'Add proper secrets management',
        'Generate security testing procedures'
      ]
    });

    // DevOps - Focus on automation and reliability
    this.taskConfigs.set('devops', {
      preferredModels: [
        'google/gemini-2.0-flash-exp',       // Good for automation scripts
        'qwen/qwen-2.5-coder-32b-instruct',  // Free, good for scripting
        'meta-llama/llama-3.1-70b-instruct',
        'anthropic/claude-3.5-sonnet'
      ],
      qualityRequired: 7.0,
      maxCostPerRequest: 0.20,
      timeoutMs: 60000,
      specialInstructions: [
        'Generate idempotent automation scripts',
        'Include proper error handling and rollback procedures',
        'Add comprehensive monitoring and alerting',
        'Implement infrastructure as code best practices'
      ]
    });

    // General Purpose - Cost-optimized
    this.taskConfigs.set('general', {
      preferredModels: [
        'ollama/llama3.2',                   // Local, free
        'google/gemini-2.0-flash-exp',       // Free tier
        'qwen/qwen-2.5-coder-32b-instruct',  // Free
        'meta-llama/llama-3.1-8b-instruct'   // Fast and cheap
      ],
      qualityRequired: 6.5,
      maxCostPerRequest: 0.10,
      timeoutMs: 30000,
      specialInstructions: [
        'Focus on clarity and maintainability',
        'Include basic error handling',
        'Add helpful comments and documentation'
      ]
    });
  }

  /**
   * Get optimized configuration for a specific task type
   */
  getTaskConfig(taskType: string): TaskTypeConfig {
    return this.taskConfigs.get(taskType) || this.taskConfigs.get('general')!;
  }

  /**
   * Get cost optimization configuration
   */
  getCostOptimizationConfig(): CostOptimizationConfig {
    return {
      maxDailyCost: this.settings.maxDailyCost,
      preferFreeModels: this.settings.preferFreeModels,
      allowFallbacks: this.settings.allowFallbacks,
      qualityThreshold: this.settings.qualityThreshold,
      budgetMode: this.settings.budgetMode
    };
  }

  /**
   * Get environment-appropriate model recommendations
   */
  getEnvironmentOptimizedModels(taskType: string): string[] {
    const taskConfig = this.getTaskConfig(taskType);
    
    switch (this.settings.environment) {
      case 'development':
        // Prioritize free/cheap models for development
        return taskConfig.preferredModels.filter(model => 
          model.includes('ollama/') || 
          model.includes('gemini-2.0-flash') ||
          model.includes('deepseek') ||
          model.includes('qwen')
        );

      case 'production':
        // Use best quality models for production
        return taskConfig.preferredModels;

      case 'testing':
        // Use fastest models for testing
        return [
          'google/gemini-2.0-flash-exp',
          'meta-llama/llama-3.1-8b-instruct',
          'ollama/llama3.2'
        ];

      default:
        return taskConfig.preferredModels;
    }
  }

  /**
   * Validate current configuration and provide recommendations
   */
  private validateConfiguration(): void {
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check API key availability
    const requiredKeys = [
      'OPENROUTER_API_KEY',
      'ANTHROPIC_API_KEY',
      'GOOGLE_API_KEY',
      'GROQ_API_KEY'
    ];

    const availableKeys = requiredKeys.filter(key => process.env[key]);
    
    if (availableKeys.length === 0) {
      warnings.push('No API keys configured. Only Ollama local models will be available.');
      recommendations.push('Configure OPENROUTER_API_KEY for access to all models through a single API');
    } else if (availableKeys.length === 1 && availableKeys[0] === 'OPENROUTER_API_KEY') {
      recommendations.push('Excellent! OpenRouter provides unified access to all models');
    }

    // Budget recommendations
    if (this.settings.maxDailyCost > 50) {
      recommendations.push('Consider enabling budget mode to prevent unexpected high costs');
    }

    if (!this.settings.preferFreeModels && this.settings.maxDailyCost < 5) {
      recommendations.push('Enable preferFreeModels=true to maximize cost efficiency with your budget');
    }

    // Quality vs Cost balance
    if (this.settings.qualityThreshold > 8.5 && this.settings.maxDailyCost < 10) {
      warnings.push('High quality threshold with low budget may result in limited model availability');
      recommendations.push('Consider lowering qualityThreshold to 7.5 or increasing maxDailyCost');
    }

    // Log findings
    if (warnings.length > 0) {
      Logger.warn('Configuration warnings:', warnings.join('; '));
    }
    
    if (recommendations.length > 0) {
      Logger.info('Configuration recommendations:', recommendations.join('; '));
    }

    Logger.info(`✅ Recoder AI configured: ${availableKeys.length} providers, $${this.settings.maxDailyCost} daily budget, quality threshold ${this.settings.qualityThreshold}`);
  }

  /**
   * Get current settings
   */
  getSettings(): RecoderAISettings {
    return { ...this.settings };
  }

  /**
   * Update settings dynamically
   */
  updateSettings(updates: Partial<RecoderAISettings>): void {
    this.settings = { ...this.settings, ...updates };
    Logger.info('Recoder AI settings updated:', Object.keys(updates).join(', '));
  }

  /**
   * Get optimization suggestions based on usage patterns
   */
  getOptimizationSuggestions(): {
    costOptimizations: string[];
    qualityImprovements: string[];
    performanceEnhancements: string[];
  } {
    const usage = costEfficientRouter.getUsageStats();
    const recommendations = costEfficientRouter.getCostOptimizationRecommendations();

    const costOptimizations: string[] = [];
    const qualityImprovements: string[] = [];
    const performanceEnhancements: string[] = [];

    // Cost optimizations
    if (usage.dailyCost > this.settings.maxDailyCost * 0.8) {
      costOptimizations.push('Daily cost approaching limit - consider enabling budget mode');
    }

    if (recommendations.freeModelUsage < 50) {
      costOptimizations.push(`Increase free model usage from ${recommendations.freeModelUsage.toFixed(1)}% to reduce costs`);
    }

    if (usage.averageCostPerRequest > 0.10) {
      costOptimizations.push('High average cost per request - review model selection strategy');
    }

    // Quality improvements
    if (this.settings.qualityThreshold < 8.0) {
      qualityImprovements.push('Consider increasing quality threshold for better output');
    }

    if (!this.settings.includeTests) {
      qualityImprovements.push('Enable test generation for higher code quality');
    }

    // Performance enhancements
    if (!this.settings.cacheEnabled) {
      performanceEnhancements.push('Enable caching to improve response times and reduce costs');
    }

    if (this.settings.maxConcurrentRequests < 3) {
      performanceEnhancements.push('Increase concurrent requests for better throughput');
    }

    return {
      costOptimizations,
      qualityImprovements,
      performanceEnhancements
    };
  }

  /**
   * Generate optimal .env configuration
   */
  generateOptimalEnvConfig(): string {
    return `# Recoder.xyz AI Configuration
# Generated by RecoderAIConfigManager

# === COST MANAGEMENT ===
RECODER_MAX_DAILY_COST=${this.settings.maxDailyCost}
RECODER_PREFER_FREE_MODELS=${this.settings.preferFreeModels}
RECODER_BUDGET_MODE=${this.settings.budgetMode}
RECODER_COST_TRACKING=${this.settings.costTrackingEnabled}

# === QUALITY SETTINGS ===
RECODER_QUALITY_THRESHOLD=${this.settings.qualityThreshold}
RECODER_ALLOW_FALLBACKS=${this.settings.allowFallbacks}
RECODER_REQUIRE_REAL_CODE=${this.settings.requireRealCode}

# === API KEYS (Required) ===
# OpenRouter provides unified access to all models (RECOMMENDED)
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Individual provider keys (optional if using OpenRouter)
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_API_KEY=your_google_api_key_here
GROQ_API_KEY=your_groq_api_key_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Local Ollama (free, private)
OLLAMA_BASE_URL=http://localhost:11434

# === PERFORMANCE ===
RECODER_CACHE_ENABLED=${this.settings.cacheEnabled}
RECODER_MAX_CONCURRENT=${this.settings.maxConcurrentRequests}
RECODER_REQUEST_TIMEOUT=${this.settings.requestTimeout}

# === RECODER SPECIFIC ===
RECODER_REAL_CODE_ONLY=${this.settings.realCodeOnly}
RECODER_INCLUDE_TESTS=${this.settings.includeTests}
RECODER_INCLUDE_DOCS=${this.settings.includeDocs}
RECODER_GENERATE_DEPLOYMENT=${this.settings.generateDeployment}

# === LOGGING ===
RECODER_ENABLE_LOGGING=${this.settings.enableLogging}
RECODER_LOG_LEVEL=${this.settings.logLevel}

# === PROVIDER PREFERENCES ===
RECODER_PRIMARY_PROVIDER=${this.settings.primaryProvider}
RECODER_FALLBACK_PROVIDERS=${this.settings.fallbackProviders.join(',')}
${this.settings.disabledProviders.length > 0 ? `RECODER_DISABLED_PROVIDERS=${this.settings.disabledProviders.join(',')}` : '# RECODER_DISABLED_PROVIDERS='}
`;
  }
}

// Export singleton instance
export const recoderAIConfig = RecoderAIConfigManager.getInstance();