/**
 * Plugin lifecycle management for the Craft Code extensibility framework
 */
import { EventEmitter } from 'events';
import { Plugin, PluginContext, PluginManifest, PluginError, PluginErrorCode, PluginAnalytics, PluginSecurity } from './types';
export declare class PluginLifecycleManager extends EventEmitter {
    private pluginDirectory;
    private config;
    private plugins;
    private activePlugins;
    private dependencyGraph;
    private analytics;
    private sandbox;
    constructor(pluginDirectory: string, config: LifecycleConfig);
    /**
     * Load and register a plugin from directory or package
     */
    loadPlugin(pluginPath: string): Promise<void>;
    /**
     * Activate a loaded plugin
     */
    activatePlugin(pluginId: string): Promise<void>;
    /**
     * Deactivate an active plugin
     */
    deactivatePlugin(pluginId: string): Promise<void>;
    /**
     * Unload a plugin completely
     */
    unloadPlugin(pluginId: string): Promise<void>;
    /**
     * Reload a plugin (unload and load again)
     */
    reloadPlugin(pluginId: string): Promise<void>;
    /**
     * Get plugin information
     */
    getPlugin(pluginId: string): LoadedPlugin | undefined;
    /**
     * List all loaded plugins
     */
    getPlugins(): LoadedPlugin[];
    /**
     * List active plugins
     */
    getActivePlugins(): LoadedPlugin[];
    /**
     * Get plugin analytics
     */
    getAnalytics(pluginId: string): PluginAnalytics | undefined;
    /**
     * Update plugin configuration
     */
    updatePluginConfig(pluginId: string, config: Record<string, any>): Promise<void>;
    /**
     * Handle plugin events
     */
    handlePluginEvent(pluginId: string, event: string, data?: any): Promise<any>;
    /**
     * Shutdown all plugins
     */
    shutdown(): Promise<void>;
    private loadManifest;
    private loadSecurity;
    private validatePlugin;
    private loadPluginModule;
    private createPluginContext;
    private createPluginLogger;
    private createPluginStorage;
    private createPluginAPI;
    private createWorkspaceAPI;
    private createPluginUI;
    private initializeAnalytics;
    private updateAnalytics;
    private activateDependencies;
    private getDependentPlugins;
    private buildDependencyGraph;
    private validateConfiguration;
    private cleanupPlugin;
    private handlePluginError;
    private isVersionCompatible;
    private setupCleanupHandlers;
}
export interface LoadedPlugin {
    id: string;
    path: string;
    manifest: PluginManifest;
    security: PluginSecurity;
    plugin: Plugin;
    context: PluginContext;
    state: PluginState;
    loadedAt: Date;
    activatedAt?: Date;
    deactivatedAt?: Date;
    error?: any;
    analytics: PluginAnalytics;
}
export declare enum PluginState {
    LOADING = "loading",
    LOADED = "loaded",
    ACTIVATING = "activating",
    ACTIVE = "active",
    DEACTIVATING = "deactivating",
    ERROR = "error",
    UNLOADING = "unloading"
}
export interface LifecycleConfig {
    appVersion: string;
    dataDirectory: string;
    allowedPermissions: string[];
    sandboxConfig: {
        enabled: boolean;
        timeout: number;
        memoryLimit: number;
        networkAccess: boolean;
    };
    cleanupStorageOnUnload: boolean;
}
export { PluginError, PluginErrorCode };
//# sourceMappingURL=lifecycle.d.ts.map