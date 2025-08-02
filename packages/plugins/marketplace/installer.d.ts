/**
 * Automated plugin installation and management for the Craft Code marketplace
 */
import { EventEmitter } from 'events';
import { PluginInstallOptions, PluginDependency } from '../plugin-sdk/types';
import { PluginLifecycleManager } from '../plugin-sdk/lifecycle';
export declare class PluginInstaller extends EventEmitter {
    private config;
    private lifecycleManager;
    private storage;
    private installQueue;
    private activeInstalls;
    private installedPlugins;
    constructor(config: InstallerConfig, lifecycleManager: PluginLifecycleManager, storage: InstallerStorage);
    /**
     * Install a plugin with dependencies
     */
    installPlugin(pluginId: string, options?: PluginInstallOptions): Promise<InstallResult>;
    /**
     * Uninstall a plugin
     */
    uninstallPlugin(pluginId: string, options?: UninstallOptions): Promise<UninstallResult>;
    /**
     * Update a plugin to the latest version
     */
    updatePlugin(pluginId: string, targetVersion?: string): Promise<InstallResult>;
    /**
     * Update all installed plugins
     */
    updateAllPlugins(): Promise<UpdateAllResult>;
    /**
     * Get installation progress
     */
    getInstallProgress(taskId: string): InstallProgress | null;
    /**
     * List all active installation tasks
     */
    getActiveInstalls(): InstallProgress[];
    /**
     * List installed plugins
     */
    getInstalledPlugins(): InstalledPlugin[];
    /**
     * Check if a plugin is installed
     */
    isPluginInstalled(pluginId: string): boolean;
    /**
     * Get installed plugin information
     */
    getInstalledPlugin(pluginId: string): InstalledPlugin | null;
    /**
     * Cancel an active installation
     */
    cancelInstall(taskId: string): Promise<void>;
    /**
     * Verify plugin integrity
     */
    verifyPlugin(pluginId: string): Promise<VerificationResult>;
    /**
     * Clean up corrupted installations
     */
    cleanup(): Promise<CleanupResult>;
    private executeInstall;
    private fetchPluginMetadata;
    private resolveDependencies;
    private downloadPlugin;
    private extractPlugin;
    private validatePluginInstallation;
    private registerInstalledPlugin;
    private findDependentPlugins;
    private canRemoveDependency;
    private repairPlugin;
    private loadInstalledPlugins;
    private generateTaskId;
    private handleInstallError;
}
export interface InstallTask {
    id: string;
    pluginId: string;
    targetVersion?: string;
    options: PluginInstallOptions;
    status: InstallStatus;
    createdAt: Date;
    dependencies: PluginDependency[];
}
export interface InstallProgress {
    taskId: string;
    pluginId: string;
    targetVersion?: string;
    status: InstallStatus;
    progress: number;
    currentStep: string;
    startedAt: Date;
    completedAt?: Date;
    error?: string;
    cancelled: boolean;
}
export interface InstallResult {
    success: boolean;
    pluginId: string;
    version: string;
    action: 'installed' | 'updated' | 'already_installed';
    dependencies: string[];
    error?: string;
}
export interface UninstallOptions {
    force?: boolean;
    removeDependencies?: boolean;
}
export interface UninstallResult {
    success: boolean;
    pluginId: string;
    removedDependencies: string[];
    error?: string;
}
export interface UpdateResult {
    pluginId: string;
    success: boolean;
    fromVersion: string;
    toVersion: string;
    upToDate?: boolean;
    error?: string;
}
export interface UpdateAllResult {
    total: number;
    successful: number;
    failed: number;
    results: UpdateResult[];
}
export interface InstalledPlugin {
    id: string;
    version: string;
    name: string;
    author: string;
    description: string;
    main: string;
    dependencies: string[];
    installedAt: Date;
    size: number;
}
export interface VerificationResult {
    valid: boolean;
    errors: string[];
    warnings?: string[];
}
export interface CleanupResult {
    removedPlugins: string[];
    repairedPlugins: string[];
    errors: string[];
}
export declare enum InstallStatus {
    QUEUED = "queued",
    DOWNLOADING = "downloading",
    EXTRACTING = "extracting",
    INSTALLING = "installing",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}
export interface InstallerConfig {
    registryUrl: string;
    pluginsDirectory: string;
    tempDirectory: string;
    maxConcurrentInstalls: number;
    downloadTimeout: number;
}
export interface InstallerStorage {
    getInstalledPlugins(): Promise<InstalledPlugin[]>;
    saveInstalledPlugin(plugin: InstalledPlugin): Promise<void>;
    removeInstalledPlugin(pluginId: string): Promise<void>;
    clear(): Promise<void>;
}
//# sourceMappingURL=installer.d.ts.map