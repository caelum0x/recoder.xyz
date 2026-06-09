/**
 * Unified Configuration System for Recoder.xyz Ecosystem
 * 
 * Provides consistent configuration across CLI, Spaces, and VS Code Extension
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export interface RecoderAIProvider {
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  models: string[];
  useCases: string[];
  priority: number;
}

export interface RecoderConfig {
  // Core settings
  version: string;
  lastUpdated: string;
  userId?: string;
  
  // AI Providers
  aiProviders: {
    claude: RecoderAIProvider;
    groq: RecoderAIProvider;
    gemini: RecoderAIProvider;
    ollama: RecoderAIProvider;
  };
  
  // Default provider selection
  defaultProvider: string;
  intelligentRouting: boolean;
  
  // Quality & Validation
  qualityValidation: boolean;
  realCodeOnly: boolean;
  vulnerabilityScanning: boolean;
  
  // Project settings
  projectDefaults: {
    language: string;
    framework?: string;
    includeTests: boolean;
    includeDocs: boolean;
    deploymentTarget?: string;
  };
  
  // Platform-specific settings
  cli: {
    outputFormat: 'json' | 'yaml' | 'text';
    verboseLogging: boolean;
    autoUpdate: boolean;
    telemetry: boolean;
  };
  
  spaces: {
    theme: 'light' | 'dark' | 'auto';
    autoSave: boolean;
    showPreview: boolean;
  };
  
  extension: {
    autoActivate: boolean;
    showInlineHints: boolean;
    ghostMode: boolean;
    keybindings: Record<string, string>;
  };
  
  // Advanced features
  features: {
    sessionSharing: boolean;
    crossPlatformSync: boolean;
    agentMarketplace: boolean;
    collaborativeEditing: boolean;
  };
  
  // Security settings
  security: {
    encryptApiKeys: boolean;
    allowRemoteExecution: boolean;
    trustedDomains: string[];
    maxTokenUsage?: number;
  };
}

export class UnifiedConfigManager {
  private static instance: UnifiedConfigManager;
  private config: RecoderConfig;
  private configPath: string;
  private platform: 'cli' | 'web' | 'extension';

  private constructor(platform: 'cli' | 'web' | 'extension') {
    this.platform = platform;
    this.configPath = this.getConfigPath();
    this.config = this.loadConfig();
  }

  static getInstance(platform: 'cli' | 'web' | 'extension'): UnifiedConfigManager {
    if (!UnifiedConfigManager.instance) {
      UnifiedConfigManager.instance = new UnifiedConfigManager(platform);
    }
    return UnifiedConfigManager.instance;
  }

  /**
   * Get the configuration file path based on platform
   */
  private getConfigPath(): string {
    const homeDir = os.homedir();
    const configDir = path.join(homeDir, '.recoder');
    
    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    return path.join(configDir, 'config.json');
  }

  /**
   * Load configuration from file or create default
   */
  private loadConfig(): RecoderConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const existingConfig = JSON.parse(configData);
        
        // Merge with defaults to ensure all properties exist
        return this.mergeWithDefaults(existingConfig);
      }
    } catch (error) {
      console.warn('Failed to load config, using defaults:', error);
    }
    
    return this.getDefaultConfig();
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): RecoderConfig {
    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      
      aiProviders: {
        claude: {
          enabled: !!process.env['ANTHROPIC_API_KEY'],
          apiKey: process.env['ANTHROPIC_API_KEY'],
          models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
          useCases: ['complex-logic', 'architecture', 'security', 'code-review'],
          priority: 1
        },
        groq: {
          enabled: !!process.env['GROQ_API_KEY'],
          apiKey: process.env['GROQ_API_KEY'],
          models: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant'],
          useCases: ['fast-generation', 'api-endpoints', 'prototyping', 'react'],
          priority: 2
        },
        gemini: {
          enabled: !!process.env['GOOGLE_API_KEY'],
          apiKey: process.env['GOOGLE_API_KEY'],
          models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro'],
          useCases: ['large-codebases', 'multimodal', 'documentation', 'analysis'],
          priority: 3
        },
        ollama: {
          enabled: !!process.env['OLLAMA_BASE_URL'] || fs.existsSync('/usr/local/bin/ollama'),
          baseUrl: process.env['OLLAMA_BASE_URL'] || 'http://localhost:11434',
          models: ['llama3.2', 'codellama', 'deepseek-coder'],
          useCases: ['offline', 'privacy', 'local-development', 'custom-models'],
          priority: 4
        }
      },
      
      defaultProvider: 'claude',
      intelligentRouting: true,
      
      qualityValidation: true,
      realCodeOnly: true,
      vulnerabilityScanning: true,
      
      projectDefaults: {
        language: 'typescript',
        includeTests: true,
        includeDocs: false
      },
      
      cli: {
        outputFormat: 'text',
        verboseLogging: false,
        autoUpdate: true,
        telemetry: true
      },
      
      spaces: {
        theme: 'auto',
        autoSave: true,
        showPreview: true
      },
      
      extension: {
        autoActivate: true,
        showInlineHints: true,
        ghostMode: true,
        keybindings: {
          'focusInput': 'cmd+shift+a',
          'generateCode': 'cmd+shift+g',
          'explainCode': 'cmd+shift+e'
        }
      },
      
      features: {
        sessionSharing: false,
        crossPlatformSync: false,
        agentMarketplace: true,
        collaborativeEditing: false
      },
      
      security: {
        encryptApiKeys: true,
        allowRemoteExecution: false,
        trustedDomains: ['recoder.xyz', 'api.recoder.xyz', 'agents.recoder.xyz', 'pm.recoder.xyz', 'agency.recoder.xyz'],
        maxTokenUsage: 1000000
      }
    };
  }

  /**
   * Merge existing config with defaults
   */
  private mergeWithDefaults(existingConfig: Partial<RecoderConfig>): RecoderConfig {
    const defaults = this.getDefaultConfig();
    
    return {
      ...defaults,
      ...existingConfig,
      aiProviders: {
        ...defaults.aiProviders,
        ...existingConfig.aiProviders
      },
      projectDefaults: {
        ...defaults.projectDefaults,
        ...existingConfig.projectDefaults
      },
      cli: {
        ...defaults.cli,
        ...existingConfig.cli
      },
      spaces: {
        ...defaults.spaces,
        ...existingConfig.spaces
      },
      extension: {
        ...defaults.extension,
        ...existingConfig.extension
      },
      features: {
        ...defaults.features,
        ...existingConfig.features
      },
      security: {
        ...defaults.security,
        ...existingConfig.security
      }
    };
  }

  /**
   * Save configuration to file
   */
  saveConfig(): void {
    try {
      this.config.lastUpdated = new Date().toISOString();
      const configData = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(this.configPath, configData, 'utf8');
    } catch (error) {
      console.error('Failed to save config:', error);
      throw new Error('Unable to save configuration');
    }
  }

  /**
   * Get the full configuration
   */
  getConfig(): RecoderConfig {
    return { ...this.config };
  }

  /**
   * Get AI provider configuration
   */
  getAIProviders(): Record<string, RecoderAIProvider> {
    return { ...this.config.aiProviders };
  }

  /**
   * Get enabled AI providers sorted by priority
   */
  getEnabledProviders(): Array<{ name: string; config: RecoderAIProvider }> {
    return Object.entries(this.config.aiProviders)
      .filter(([_, config]) => config.enabled)
      .sort(([_, a], [__, b]) => a.priority - b.priority)
      .map(([name, config]) => ({ name, config }));
  }

  /**
   * Update AI provider configuration
   */
  updateAIProvider(provider: string, config: Partial<RecoderAIProvider>): void {
    if (this.config.aiProviders[provider as keyof typeof this.config.aiProviders]) {
      this.config.aiProviders[provider as keyof typeof this.config.aiProviders] = {
        ...this.config.aiProviders[provider as keyof typeof this.config.aiProviders],
        ...config
      };
      this.saveConfig();
    }
  }

  /**
   * Set API key for a provider
   */
  setAPIKey(provider: string, apiKey: string): void {
    this.updateAIProvider(provider, { apiKey, enabled: true });
  }

  /**
   * Get platform-specific configuration
   */
  getPlatformConfig(): RecoderConfig['cli'] | RecoderConfig['web'] | RecoderConfig['extension'] {
    return this.config[this.platform];
  }

  /**
   * Update platform-specific configuration
   */
  updatePlatformConfig(updates: Partial<RecoderConfig['cli'] | RecoderConfig['web'] | RecoderConfig['extension']>): void {
    this.config[this.platform] = {
      ...this.config[this.platform],
      ...updates
    } as any;
    this.saveConfig();
  }

  /**
   * Get project defaults
   */
  getProjectDefaults(): RecoderConfig['projectDefaults'] {
    return { ...this.config.projectDefaults };
  }

  /**
   * Update project defaults
   */
  updateProjectDefaults(updates: Partial<RecoderConfig['projectDefaults']>): void {
    this.config.projectDefaults = {
      ...this.config.projectDefaults,
      ...updates
    };
    this.saveConfig();
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(feature: keyof RecoderConfig['features']): boolean {
    return this.config.features[feature];
  }

  /**
   * Enable/disable a feature
   */
  setFeature(feature: keyof RecoderConfig['features'], enabled: boolean): void {
    this.config.features[feature] = enabled;
    this.saveConfig();
  }

  /**
   * Get security settings
   */
  getSecurityConfig(): RecoderConfig['security'] {
    return { ...this.config.security };
  }

  /**
   * Validate configuration
   */
  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if at least one AI provider is enabled
    const enabledProviders = this.getEnabledProviders();
    if (enabledProviders.length === 0) {
      errors.push('At least one AI provider must be enabled');
    }

    // Validate API keys for enabled providers
    enabledProviders.forEach(({ name, config }) => {
      if (name !== 'ollama' && !config.apiKey) {
        errors.push(`API key required for ${name}`);
      }
    });

    // Validate Ollama configuration
    const ollamaConfig = this.config.aiProviders.ollama;
    if (ollamaConfig.enabled && !ollamaConfig.baseUrl) {
      errors.push('Ollama base URL is required when Ollama is enabled');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = this.getDefaultConfig();
    this.saveConfig();
  }

  /**
   * Export configuration for sharing
   */
  exportConfig(includeSecrets = false): string {
    const exportConfig = { ...this.config };
    
    if (!includeSecrets) {
      // Remove sensitive information
      Object.keys(exportConfig.aiProviders).forEach(provider => {
        const providerConfig = exportConfig.aiProviders[provider as keyof typeof exportConfig.aiProviders];
        if (providerConfig.apiKey) {
          providerConfig.apiKey = '***REDACTED***';
        }
      });
    }
    
    return JSON.stringify(exportConfig, null, 2);
  }

  /**
   * Import configuration from string
   */
  importConfig(configString: string): void {
    try {
      const importedConfig = JSON.parse(configString);
      this.config = this.mergeWithDefaults(importedConfig);
      this.saveConfig();
    } catch (error) {
      throw new Error('Invalid configuration format');
    }
  }
}

// Export singleton instances for each platform
export const cliConfig = () => UnifiedConfigManager.getInstance('cli');
export const webConfig = () => UnifiedConfigManager.getInstance('web');
export const extensionConfig = () => UnifiedConfigManager.getInstance('extension');

// Utility functions
export const getDefaultConfigPath = (): string => {
  return path.join(os.homedir(), '.recoder', 'config.json');
};

export const isConfigured = (): boolean => {
  return fs.existsSync(getDefaultConfigPath());
};

export const getAvailableProviders = (): string[] => {
  return ['claude', 'groq', 'gemini', 'ollama'];
};

export default UnifiedConfigManager;
