"use strict";
/**
 * Unified Configuration System for Recoder.xyz Ecosystem
 *
 * Provides consistent configuration across CLI, Web Platform, and VS Code Extension
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailableProviders = exports.isConfigured = exports.getDefaultConfigPath = exports.extensionConfig = exports.webConfig = exports.cliConfig = exports.UnifiedConfigManager = void 0;
const tslib_1 = require("tslib");
const os = tslib_1.__importStar(require("os"));
const path = tslib_1.__importStar(require("path"));
const fs = tslib_1.__importStar(require("fs"));
class UnifiedConfigManager {
    constructor(platform) {
        this.platform = platform;
        this.configPath = this.getConfigPath();
        this.config = this.loadConfig();
    }
    static getInstance(platform) {
        if (!UnifiedConfigManager.instance) {
            UnifiedConfigManager.instance = new UnifiedConfigManager(platform);
        }
        return UnifiedConfigManager.instance;
    }
    /**
     * Get the configuration file path based on platform
     */
    getConfigPath() {
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
    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const configData = fs.readFileSync(this.configPath, 'utf8');
                const existingConfig = JSON.parse(configData);
                // Merge with defaults to ensure all properties exist
                return this.mergeWithDefaults(existingConfig);
            }
        }
        catch (error) {
            console.warn('Failed to load config, using defaults:', error);
        }
        return this.getDefaultConfig();
    }
    /**
     * Get default configuration
     */
    getDefaultConfig() {
        return {
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            aiProviders: {
                claude: {
                    enabled: !!process.env.ANTHROPIC_API_KEY,
                    apiKey: process.env.ANTHROPIC_API_KEY,
                    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
                    useCases: ['complex-logic', 'architecture', 'security', 'code-review'],
                    priority: 1
                },
                groq: {
                    enabled: !!process.env.GROQ_API_KEY,
                    apiKey: process.env.GROQ_API_KEY,
                    models: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant'],
                    useCases: ['fast-generation', 'api-endpoints', 'prototyping', 'react'],
                    priority: 2
                },
                gemini: {
                    enabled: !!process.env.GOOGLE_API_KEY,
                    apiKey: process.env.GOOGLE_API_KEY,
                    models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro'],
                    useCases: ['large-codebases', 'multimodal', 'documentation', 'analysis'],
                    priority: 3
                },
                ollama: {
                    enabled: !!process.env.OLLAMA_BASE_URL || fs.existsSync('/usr/local/bin/ollama'),
                    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
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
            web: {
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
                trustedDomains: ['recoder.xyz', 'api.recoder.xyz', 'web.recoder.xyz'],
                maxTokenUsage: 1000000
            }
        };
    }
    /**
     * Merge existing config with defaults
     */
    mergeWithDefaults(existingConfig) {
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
            web: {
                ...defaults.web,
                ...existingConfig.web
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
    saveConfig() {
        try {
            this.config.lastUpdated = new Date().toISOString();
            const configData = JSON.stringify(this.config, null, 2);
            fs.writeFileSync(this.configPath, configData, 'utf8');
        }
        catch (error) {
            console.error('Failed to save config:', error);
            throw new Error('Unable to save configuration');
        }
    }
    /**
     * Get the full configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Get AI provider configuration
     */
    getAIProviders() {
        return { ...this.config.aiProviders };
    }
    /**
     * Get enabled AI providers sorted by priority
     */
    getEnabledProviders() {
        return Object.entries(this.config.aiProviders)
            .filter(([_, config]) => config.enabled)
            .sort(([_, a], [__, b]) => a.priority - b.priority)
            .map(([name, config]) => ({ name, config }));
    }
    /**
     * Update AI provider configuration
     */
    updateAIProvider(provider, config) {
        if (this.config.aiProviders[provider]) {
            this.config.aiProviders[provider] = {
                ...this.config.aiProviders[provider],
                ...config
            };
            this.saveConfig();
        }
    }
    /**
     * Set API key for a provider
     */
    setAPIKey(provider, apiKey) {
        this.updateAIProvider(provider, { apiKey, enabled: true });
    }
    /**
     * Get platform-specific configuration
     */
    getPlatformConfig() {
        return this.config[this.platform];
    }
    /**
     * Update platform-specific configuration
     */
    updatePlatformConfig(updates) {
        this.config[this.platform] = {
            ...this.config[this.platform],
            ...updates
        };
        this.saveConfig();
    }
    /**
     * Get project defaults
     */
    getProjectDefaults() {
        return { ...this.config.projectDefaults };
    }
    /**
     * Update project defaults
     */
    updateProjectDefaults(updates) {
        this.config.projectDefaults = {
            ...this.config.projectDefaults,
            ...updates
        };
        this.saveConfig();
    }
    /**
     * Check if a feature is enabled
     */
    isFeatureEnabled(feature) {
        return this.config.features[feature];
    }
    /**
     * Enable/disable a feature
     */
    setFeature(feature, enabled) {
        this.config.features[feature] = enabled;
        this.saveConfig();
    }
    /**
     * Get security settings
     */
    getSecurityConfig() {
        return { ...this.config.security };
    }
    /**
     * Validate configuration
     */
    validateConfig() {
        const errors = [];
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
    resetConfig() {
        this.config = this.getDefaultConfig();
        this.saveConfig();
    }
    /**
     * Export configuration for sharing
     */
    exportConfig(includeSecrets = false) {
        const exportConfig = { ...this.config };
        if (!includeSecrets) {
            // Remove sensitive information
            Object.keys(exportConfig.aiProviders).forEach(provider => {
                const providerConfig = exportConfig.aiProviders[provider];
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
    importConfig(configString) {
        try {
            const importedConfig = JSON.parse(configString);
            this.config = this.mergeWithDefaults(importedConfig);
            this.saveConfig();
        }
        catch (error) {
            throw new Error('Invalid configuration format');
        }
    }
}
exports.UnifiedConfigManager = UnifiedConfigManager;
// Export singleton instances for each platform
const cliConfig = () => UnifiedConfigManager.getInstance('cli');
exports.cliConfig = cliConfig;
const webConfig = () => UnifiedConfigManager.getInstance('web');
exports.webConfig = webConfig;
const extensionConfig = () => UnifiedConfigManager.getInstance('extension');
exports.extensionConfig = extensionConfig;
// Utility functions
const getDefaultConfigPath = () => {
    return path.join(os.homedir(), '.recoder', 'config.json');
};
exports.getDefaultConfigPath = getDefaultConfigPath;
const isConfigured = () => {
    return fs.existsSync((0, exports.getDefaultConfigPath)());
};
exports.isConfigured = isConfigured;
const getAvailableProviders = () => {
    return ['claude', 'groq', 'gemini', 'ollama'];
};
exports.getAvailableProviders = getAvailableProviders;
exports.default = UnifiedConfigManager;
//# sourceMappingURL=unified-config.js.map