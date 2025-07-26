/**
 * Unified Configuration System for Recoder.xyz Ecosystem
 *
 * Provides consistent configuration across CLI, Web Platform, and VS Code Extension
 */
export interface RecoderAIProvider {
    enabled: boolean;
    apiKey?: string;
    baseUrl?: string;
    models: string[];
    useCases: string[];
    priority: number;
}
export interface RecoderConfig {
    version: string;
    lastUpdated: string;
    userId?: string;
    aiProviders: {
        claude: RecoderAIProvider;
        groq: RecoderAIProvider;
        gemini: RecoderAIProvider;
        ollama: RecoderAIProvider;
    };
    defaultProvider: string;
    intelligentRouting: boolean;
    qualityValidation: boolean;
    realCodeOnly: boolean;
    vulnerabilityScanning: boolean;
    projectDefaults: {
        language: string;
        framework?: string;
        includeTests: boolean;
        includeDocs: boolean;
        deploymentTarget?: string;
    };
    cli: {
        outputFormat: 'json' | 'yaml' | 'text';
        verboseLogging: boolean;
        autoUpdate: boolean;
        telemetry: boolean;
    };
    web: {
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
    features: {
        sessionSharing: boolean;
        crossPlatformSync: boolean;
        agentMarketplace: boolean;
        collaborativeEditing: boolean;
    };
    security: {
        encryptApiKeys: boolean;
        allowRemoteExecution: boolean;
        trustedDomains: string[];
        maxTokenUsage?: number;
    };
}
export declare class UnifiedConfigManager {
    private static instance;
    private config;
    private configPath;
    private platform;
    private constructor();
    static getInstance(platform: 'cli' | 'web' | 'extension'): UnifiedConfigManager;
    /**
     * Get the configuration file path based on platform
     */
    private getConfigPath;
    /**
     * Load configuration from file or create default
     */
    private loadConfig;
    /**
     * Get default configuration
     */
    private getDefaultConfig;
    /**
     * Merge existing config with defaults
     */
    private mergeWithDefaults;
    /**
     * Save configuration to file
     */
    saveConfig(): void;
    /**
     * Get the full configuration
     */
    getConfig(): RecoderConfig;
    /**
     * Get AI provider configuration
     */
    getAIProviders(): Record<string, RecoderAIProvider>;
    /**
     * Get enabled AI providers sorted by priority
     */
    getEnabledProviders(): Array<{
        name: string;
        config: RecoderAIProvider;
    }>;
    /**
     * Update AI provider configuration
     */
    updateAIProvider(provider: string, config: Partial<RecoderAIProvider>): void;
    /**
     * Set API key for a provider
     */
    setAPIKey(provider: string, apiKey: string): void;
    /**
     * Get platform-specific configuration
     */
    getPlatformConfig(): RecoderConfig['cli'] | RecoderConfig['web'] | RecoderConfig['extension'];
    /**
     * Update platform-specific configuration
     */
    updatePlatformConfig(updates: Partial<RecoderConfig['cli'] | RecoderConfig['web'] | RecoderConfig['extension']>): void;
    /**
     * Get project defaults
     */
    getProjectDefaults(): RecoderConfig['projectDefaults'];
    /**
     * Update project defaults
     */
    updateProjectDefaults(updates: Partial<RecoderConfig['projectDefaults']>): void;
    /**
     * Check if a feature is enabled
     */
    isFeatureEnabled(feature: keyof RecoderConfig['features']): boolean;
    /**
     * Enable/disable a feature
     */
    setFeature(feature: keyof RecoderConfig['features'], enabled: boolean): void;
    /**
     * Get security settings
     */
    getSecurityConfig(): RecoderConfig['security'];
    /**
     * Validate configuration
     */
    validateConfig(): {
        isValid: boolean;
        errors: string[];
    };
    /**
     * Reset configuration to defaults
     */
    resetConfig(): void;
    /**
     * Export configuration for sharing
     */
    exportConfig(includeSecrets?: boolean): string;
    /**
     * Import configuration from string
     */
    importConfig(configString: string): void;
}
export declare const cliConfig: () => UnifiedConfigManager;
export declare const webConfig: () => UnifiedConfigManager;
export declare const extensionConfig: () => UnifiedConfigManager;
export declare const getDefaultConfigPath: () => string;
export declare const isConfigured: () => boolean;
export declare const getAvailableProviders: () => string[];
export default UnifiedConfigManager;
//# sourceMappingURL=unified-config.d.ts.map