/**
 * Plugin discovery and registry for the Craft Code marketplace
 */
import { EventEmitter } from 'events';
import { PluginMetadata, PluginCategory, PluginSearchOptions, PluginSearchResult, PluginUpdate } from '../plugin-sdk/types';
export declare class PluginRegistry extends EventEmitter {
    private config;
    private storage;
    private cache;
    private categoryIndex;
    private tagIndex;
    private authorIndex;
    private lastSync;
    private syncInterval;
    constructor(config: RegistryConfig, storage: RegistryStorage);
    /**
     * Initialize the registry and load cached data
     */
    initialize(): Promise<void>;
    /**
     * Search for plugins based on criteria
     */
    search(options?: PluginSearchOptions): Promise<PluginSearchResult>;
    /**
     * Get detailed information about a specific plugin
     */
    getPlugin(pluginId: string): Promise<PluginMetadata | null>;
    /**
     * Get plugins by category
     */
    getPluginsByCategory(category: PluginCategory, limit?: number): Promise<PluginMetadata[]>;
    /**
     * Get trending plugins
     */
    getTrendingPlugins(limit?: number): Promise<PluginMetadata[]>;
    /**
     * Get featured plugins
     */
    getFeaturedPlugins(limit?: number): Promise<PluginMetadata[]>;
    /**
     * Get recently published plugins
     */
    getRecentPlugins(limit?: number): Promise<PluginMetadata[]>;
    /**
     * Get plugins by author
     */
    getPluginsByAuthor(author: string): Promise<PluginMetadata[]>;
    /**
     * Check for plugin updates
     */
    checkForUpdates(installedPlugins: Array<{
        id: string;
        version: string;
    }>): Promise<PluginUpdate[]>;
    /**
     * Get plugin statistics
     */
    getStatistics(): Promise<RegistryStatistics>;
    /**
     * Sync with remote registry
     */
    syncWithRemote(): Promise<void>;
    /**
     * Clear cache and reload from remote
     */
    refresh(): Promise<void>;
    /**
     * Get cache status
     */
    getCacheStatus(): CacheStatus;
    private initializeIndices;
    private loadFromCache;
    private setupAutoSync;
    private addToCache;
    private updateCategoryIndex;
    private updateTagIndex;
    private updateAuthorIndex;
    private clearIndices;
    private findPluginsByTags;
    private searchByText;
    private filterByPricing;
    private sortResults;
    private sortByRelevance;
    private calculateRelevanceScore;
    private calculateTrendingScore;
    private intersectSets;
    private isNewerVersion;
    private fetchFromRemote;
    private fetchPluginFromRemote;
    private getChangelog;
    private hasBreakingChanges;
    private getPackageSize;
    private getDownloadUrl;
    private getTopAuthors;
    private getRecentActivity;
    private cleanupStaleEntries;
    /**
     * Cleanup resources
     */
    cleanup(): Promise<void>;
}
export interface RegistryConfig {
    registryUrl: string;
    autoSyncInterval: number;
    cacheTimeout: number;
    maxCacheSize: number;
}
export interface RegistryStorage {
    getCachedPlugins(): Promise<PluginMetadata[]>;
    savePlugin(plugin: PluginMetadata): Promise<void>;
    removePlugin(pluginId: string): Promise<void>;
    getLastSync(): Promise<Date | null>;
    setLastSync(date: Date): Promise<void>;
    clear(): Promise<void>;
}
export interface RegistryStatistics {
    totalPlugins: number;
    totalDownloads: number;
    averageRating: number;
    categoryCounts: Record<string, number>;
    topAuthors: Array<{
        author: string;
        pluginCount: number;
    }>;
    recentActivity: RecentActivity[];
}
export interface RecentActivity {
    type: 'publish' | 'update' | 'download';
    pluginId: string;
    pluginName: string;
    timestamp: Date;
    details?: any;
}
export interface CacheStatus {
    size: number;
    lastSync: Date | null;
    categories: number;
    tags: number;
    authors: number;
}
//# sourceMappingURL=registry.d.ts.map