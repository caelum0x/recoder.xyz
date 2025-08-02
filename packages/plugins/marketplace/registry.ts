/**
 * Plugin discovery and registry for the Craft Code marketplace
 */

import { EventEmitter } from 'events';
import {
  PluginMetadata,
  PluginCategory,
  PluginSearchOptions,
  PluginSearchResult, 
  PluginManifest,
  PluginUpdate
} from '../plugin-sdk/types';

export class PluginRegistry extends EventEmitter {
  private cache: Map<string, PluginMetadata> = new Map();
  private categoryIndex: Map<PluginCategory, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private authorIndex: Map<string, Set<string>> = new Map();
  private lastSync: Date | null = null;
  private syncInterval: NodeJS.Timer | null = null;

  constructor(
    private config: RegistryConfig,
    private storage: RegistryStorage
  ) {
    super();
    this.initializeIndices();
    this.setupAutoSync();
  }

  /**
   * Initialize the registry and load cached data
   */
  async initialize(): Promise<void> {
    try {
      await this.loadFromCache();
      await this.syncWithRemote();
    } catch (error) {
      console.error('Failed to initialize plugin registry:', error);
      throw error;
    }
  }

  /**
   * Search for plugins based on criteria
   */
  async search(options: PluginSearchOptions = {}): Promise<PluginSearchResult> {
    const {
      query,
      category,
      tags = [],
      author,
      pricing,
      sortBy = 'relevance',
      limit = 20,
      offset = 0
    } = options;

    try {
      let candidates = new Set<string>();

      // Start with all plugins if no specific filters
      if (!query && !category && tags.length === 0 && !author) {
        candidates = new Set(this.cache.keys());
      } else {
        // Apply filters
        if (category) {
          const categoryPlugins = this.categoryIndex.get(category);
          if (categoryPlugins) {
            candidates = new Set(categoryPlugins);
          }
        }

        if (tags.length > 0) {
          const tagPlugins = this.findPluginsByTags(tags);
          if (candidates.size === 0) {
            candidates = tagPlugins;
          } else {
            candidates = this.intersectSets(candidates, tagPlugins);
          }
        }

        if (author) {
          const authorPlugins = this.authorIndex.get(author);
          if (authorPlugins) {
            if (candidates.size === 0) {
              candidates = new Set(authorPlugins);
            } else {
              candidates = this.intersectSets(candidates, new Set(authorPlugins));
            }
          }
        }

        if (query) {
          const queryPlugins = this.searchByText(query);
          if (candidates.size === 0) {
            candidates = queryPlugins;
          } else {
            candidates = this.intersectSets(candidates, queryPlugins);
          }
        }
      }

      // Apply pricing filter
      if (pricing) {
        candidates = this.filterByPricing(candidates, pricing);
      }

      // Convert to metadata array
      let results = Array.from(candidates)
        .map(id => this.cache.get(id))
        .filter(Boolean) as PluginMetadata[];

      // Sort results
      results = this.sortResults(results, sortBy, query);

      // Apply pagination
      const total = results.length;
      const paginatedResults = results.slice(offset, offset + limit);

      return {
        plugins: paginatedResults,
        total,
        hasMore: offset + limit < total
      };
    } catch (error) {
      // Fix: error is unknown, so use type guard for .message
      console.error('Plugin search failed:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Get detailed information about a specific plugin
   */
  async getPlugin(pluginId: string): Promise<PluginMetadata | undefined> {
    try {
      // Try cache first
      let plugin = this.cache.get(pluginId);
      
      // Fix: plugin can be null, but return type is PluginMetadata | undefined
      if (!plugin) {
        const remotePlugin = await this.fetchPluginFromRemote(pluginId);
        plugin = remotePlugin === null ? undefined : remotePlugin;
        if (plugin) {
          await this.addToCache(plugin);
        }
      }
      return plugin;
    } catch (error) {
      console.error(`Failed to get plugin ${pluginId}:`, error);
      return undefined;
    }
  }

  /**
   * Get plugins by category
   */
  async getPluginsByCategory(category: PluginCategory, limit = 20): Promise<PluginMetadata[]> {
    const pluginIds = this.categoryIndex.get(category) || new Set();
    const plugins = Array.from(pluginIds)
      .map(id => this.cache.get(id))
      .filter(Boolean) as PluginMetadata[];

    return plugins
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, limit);
  }

  /**
   * Get trending plugins
   */
  async getTrendingPlugins(limit = 10): Promise<PluginMetadata[]> {
    const allPlugins = Array.from(this.cache.values());
    
    // Calculate trending score based on recent downloads and rating
    const trending = allPlugins
      .map(plugin => ({
        plugin,
        score: this.calculateTrendingScore(plugin)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.plugin);

    return trending;
  }

  /**
   * Get featured plugins
   */
  async getFeaturedPlugins(limit = 6): Promise<PluginMetadata[]> {
    const allPlugins = Array.from(this.cache.values());
    
    // Featured plugins are high-quality, well-maintained plugins
    const featured = allPlugins
      .filter(plugin => plugin.rating.average >= 4.0 && plugin.downloads > 1000)
      .sort((a, b) => b.rating.average - a.rating.average)
      .slice(0, limit);

    return featured;
  }

  /**
   * Get recently published plugins
   */
  async getRecentPlugins(limit = 10): Promise<PluginMetadata[]> {
    const allPlugins = Array.from(this.cache.values());
    
    return allPlugins
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get plugins by author
   */
  async getPluginsByAuthor(author: string): Promise<PluginMetadata[]> {
    const pluginIds = this.authorIndex.get(author) || new Set();
    const plugins = Array.from(pluginIds)
      .map(id => this.cache.get(id))
      .filter(Boolean) as PluginMetadata[];

    return plugins.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * Check for plugin updates
   */
  async checkForUpdates(installedPlugins: Array<{ id: string; version: string }>): Promise<PluginUpdate[]> {
    const updates: PluginUpdate[] = [];

    for (const installed of installedPlugins) {
      try {
        const latest = await this.getPlugin(installed.id);
        if (latest && this.isNewerVersion(latest.version, installed.version)) {
          const update: PluginUpdate = {
            currentVersion: installed.version,
            latestVersion: latest.version,
            changelog: await this.getChangelog(installed.id, latest.version),
            breaking: await this.hasBreakingChanges(installed.id, installed.version, latest.version),
            size: await this.getPackageSize(installed.id, latest.version),
            releaseDate: latest.updatedAt,
            downloadUrl: await this.getDownloadUrl(installed.id, latest.version)
          };
          updates.push(update);
        }
      } catch (error) {
        // Fix: error is unknown, so use type guard for .message
        console.error(`Failed to check updates for ${installed.id}:`, error instanceof Error ? error.message : String(error));
      }
    }

    return updates;
  }

  /**
   * Get plugin statistics
   */
  async getStatistics(): Promise<RegistryStatistics> {
    const plugins = Array.from(this.cache.values());
    const categories = Array.from(this.categoryIndex.keys());
    
    const stats: RegistryStatistics = {
      totalPlugins: plugins.length,
      totalDownloads: plugins.reduce((sum, p) => sum + p.downloads, 0),
      averageRating: plugins.reduce((sum, p) => sum + p.rating.average, 0) / plugins.length,
      categoryCounts: {},
      topAuthors: this.getTopAuthors(),
      recentActivity: await this.getRecentActivity()
    };

    // Count plugins by category
    for (const category of categories) {
      const count = this.categoryIndex.get(category)?.size || 0;
      stats.categoryCounts[category] = count;
    }

    return stats;
  }

  /**
   * Sync with remote registry
   */
  async syncWithRemote(): Promise<void> {
    try {
      const remotePlugins = await this.fetchFromRemote();
      
      // Update cache with remote data
      for (const plugin of remotePlugins) {
        await this.addToCache(plugin);
      }

      // Remove plugins that no longer exist remotely
      await this.cleanupStaleEntries(remotePlugins.map(p => p.id));

      this.lastSync = new Date();
      await this.storage.setLastSync(this.lastSync);

      this.emit('syncCompleted', {
        timestamp: this.lastSync,
        pluginCount: remotePlugins.length
      });

      console.log(`Registry synced: ${remotePlugins.length} plugins`);
    } catch (error) {
      // Fix: error is unknown, so use type guard for .message
      console.error('Failed to sync with remote registry:', error instanceof Error ? error.message : String(error));
      this.emit('syncFailed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Clear cache and reload from remote
   */
  async refresh(): Promise<void> {
    this.cache.clear();
    this.clearIndices();
    await this.syncWithRemote();
  }

  /**
   * Get cache status
   */
  getCacheStatus(): CacheStatus {
    return {
      size: this.cache.size,
      lastSync: this.lastSync,
      categories: this.categoryIndex.size,
      tags: this.tagIndex.size,
      authors: this.authorIndex.size
    };
  }

  // Private methods

  private initializeIndices(): void {
    // Initialize category index
    for (const category of Object.values(PluginCategory)) {
      this.categoryIndex.set(category, new Set());
    }
  }

  private async loadFromCache(): Promise<void> {
    try {
      const cached = await this.storage.getCachedPlugins();
      for (const plugin of cached) {
        await this.addToCache(plugin);
      }

      this.lastSync = await this.storage.getLastSync();
      console.log(`Loaded ${cached.length} plugins from cache`);
    } catch (error) {
      // Fix: error is unknown, so use type guard for .message
      console.warn('Failed to load from cache:', error instanceof Error ? error.message : String(error));
    }
  }

  private setupAutoSync(): void {
    if (this.config.autoSyncInterval > 0) {
      this.syncInterval = setInterval(async () => {
        try {
          await this.syncWithRemote();
        } catch (error) {
          // Fix: error is unknown, so use type guard for .message
          console.error('Auto-sync failed:', error instanceof Error ? error.message : String(error));
        }
      }, this.config.autoSyncInterval);
    }
  }

  private async addToCache(plugin: PluginMetadata): Promise<void> {
    this.cache.set(plugin.id, plugin);

    // Update indices
    this.updateCategoryIndex(plugin);
    this.updateTagIndex(plugin);
    this.updateAuthorIndex(plugin);

    // Persist to storage
    await this.storage.savePlugin(plugin);
  }

  private updateCategoryIndex(plugin: PluginMetadata): void {
    const categorySet = this.categoryIndex.get(plugin.category);
    if (categorySet) {
      categorySet.add(plugin.id);
    }
  }

  private updateTagIndex(plugin: PluginMetadata): void {
    for (const tag of plugin.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(plugin.id);
    }
  }

  private updateAuthorIndex(plugin: PluginMetadata): void {
    if (!this.authorIndex.has(plugin.author)) {
      this.authorIndex.set(plugin.author, new Set());
    }
    this.authorIndex.get(plugin.author)!.add(plugin.id);
  }

  private clearIndices(): void {
    this.categoryIndex.clear();
    this.tagIndex.clear();
    this.authorIndex.clear();
    this.initializeIndices();
  }

  private findPluginsByTags(tags: string[]): Set<string> {
    let result = new Set<string>();

    for (const tag of tags) {
      const tagPlugins = this.tagIndex.get(tag) || new Set();
      if (result.size === 0) {
        result = new Set(tagPlugins);
      } else {
        result = this.intersectSets(result, tagPlugins);
      }
    }

    return result;
  }

  private searchByText(query: string): Set<string> {
    const results = new Set<string>();
    const searchTerms = query.toLowerCase().split(/\s+/);

    for (const [id, plugin] of this.cache) {
      const searchText = [
        plugin.name,
        plugin.description,
        plugin.author,
        ...plugin.keywords,
        ...plugin.tags
      ].join(' ').toLowerCase();

      const matches = searchTerms.every(term => searchText.includes(term));
      if (matches) {
        results.add(id);
      }
    }

    return results;
  }

  private filterByPricing(candidates: Set<string>, pricing: 'free' | 'paid'): Set<string> {
    const filtered = new Set<string>();

    for (const id of candidates) {
      const plugin = this.cache.get(id);
      if (plugin) {
        const isFree = !plugin.pricing || plugin.pricing.type === 'free';
        if ((pricing === 'free' && isFree) || (pricing === 'paid' && !isFree)) {
          filtered.add(id);
        }
      }
    }

    return filtered;
  }

  private sortResults(results: PluginMetadata[], sortBy: string, query?: string): PluginMetadata[] {
    switch (sortBy) {
      case 'downloads':
        return results.sort((a, b) => b.downloads - a.downloads);
      
      case 'rating':
        return results.sort((a, b) => b.rating.average - a.rating.average);
      
      case 'updated':
        return results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      
      case 'relevance':
      default:
        if (query) {
          return this.sortByRelevance(results, query);
        }
        return results.sort((a, b) => b.downloads - a.downloads);
    }
  }

  private sortByRelevance(results: PluginMetadata[], query: string): PluginMetadata[] {
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    return results
      .map(plugin => ({
        plugin,
        score: this.calculateRelevanceScore(plugin, queryTerms)
      }))
      .sort((a, b) => b.score - a.score)
      .map(item => item.plugin);
  }

  private calculateRelevanceScore(plugin: PluginMetadata, queryTerms: string[]): number {
    let score = 0;
    const searchText = [
      plugin.name,
      plugin.description,
      plugin.author,
      ...plugin.keywords,
      ...plugin.tags
    ].join(' ').toLowerCase();

    for (const term of queryTerms) {
      // Exact matches in name get highest score
      if (plugin.name.toLowerCase().includes(term)) {
        score += 10;
      }
      
      // Matches in description
      if (plugin.description.toLowerCase().includes(term)) {
        score += 5;
      }
      
      // Matches in keywords/tags
      if (plugin.keywords.some(k => k.toLowerCase().includes(term)) ||
          plugin.tags.some(t => t.toLowerCase().includes(term))) {
        score += 3;
      }
      
      // General text matches
      if (searchText.includes(term)) {
        score += 1;
      }
    }

    // Boost score based on popularity
    score += Math.log10(plugin.downloads + 1);
    score += plugin.rating.average;

    return score;
  }

  private calculateTrendingScore(plugin: PluginMetadata): number {
    const daysSinceUpdate = (Date.now() - plugin.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(0, 30 - daysSinceUpdate) / 30;
    
    return (plugin.downloads * 0.6 + plugin.rating.average * 100) * (1 + recencyBoost);
  }

  private intersectSets<T>(setA: Set<T>, setB: Set<T>): Set<T> {
    return new Set([...setA].filter(x => setB.has(x)));
  }

  private isNewerVersion(latest: string, current: string): boolean {
    // Simple version comparison - in production, use semver
    return latest > current;
  }

  private async fetchFromRemote(): Promise<PluginMetadata[]> {
    const response = await fetch(`${this.config.registryUrl}/plugins`);
    if (!response.ok) {
      throw new Error(`Registry fetch failed: ${response.statusText}`);
    }
    return await response.json() as PluginMetadata[];
  }

  private async fetchPluginFromRemote(pluginId: string): Promise<PluginMetadata | null> {
    try {
      const response = await fetch(`${this.config.registryUrl}/plugins/${pluginId}`);
      if (!response.ok) {
        return null;
      }
      return await response.json() as PluginMetadata | null;
    } catch (error) {
      // Fix: error is unknown, so use type guard for .message
      console.error(`Failed to fetch plugin ${pluginId}:`, error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  private async getChangelog(pluginId: string, version: string): Promise<string> {
    try {
      const response = await fetch(`${this.config.registryUrl}/plugins/${pluginId}/changelog/${version}`);
      if (response.ok) {
        return await response.text();
      }
    } catch (error) {
      console.error(`Failed to get changelog for ${pluginId}@${version}:`, error);
    }
    return 'Changelog not available';
  }

  private async hasBreakingChanges(pluginId: string, fromVersion: string, toVersion: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.registryUrl}/plugins/${pluginId}/breaking-changes?from=${fromVersion}&to=${toVersion}`);
      if (response.ok) {
        // Fix: data is unknown, so cast to expected type
        const data = await response.json();
        return (data as { hasBreakingChanges: boolean }).hasBreakingChanges;
      }
    } catch (error) {
      console.error(`Failed to check breaking changes for ${pluginId}:`, error);
    }
    return false;
  }

  private async getPackageSize(pluginId: string, version: string): Promise<number> {
    try {
      const response = await fetch(`${this.config.registryUrl}/plugins/${pluginId}/size/${version}`);
      if (response.ok) {
        // Fix: data is unknown, so cast to expected type
        const data = await response.json();
        return (data as { size: number }).size;
      }
    } catch (error) {
      console.error(`Failed to get package size for ${pluginId}@${version}:`, error);
    }
    return 0;
  }

  private async getDownloadUrl(pluginId: string, version: string): Promise<string> {
    return `${this.config.registryUrl}/plugins/${pluginId}/download/${version}`;
  }

  private getTopAuthors(): Array<{ author: string; pluginCount: number }> {
    const authorCounts = new Map<string, number>();
    
    for (const [author, plugins] of this.authorIndex) {
      authorCounts.set(author, plugins.size);
    }
    
    return Array.from(authorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([author, pluginCount]) => ({ author, pluginCount }));
  }

  private async getRecentActivity(): Promise<RecentActivity[]> {
    // This would fetch recent activity from the registry
    return [];
  }

  private async cleanupStaleEntries(currentPluginIds: string[]): Promise<void> {
    const currentSet = new Set(currentPluginIds);
    const staleIds: string[] = [];

    for (const id of this.cache.keys()) {
      if (!currentSet.has(id)) {
        staleIds.push(id);
      }
    }

    for (const id of staleIds) {
      this.cache.delete(id);
      await this.storage.removePlugin(id);
    }

    console.log(`Cleaned up ${staleIds.length} stale entries`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.syncInterval) {
      // Fix: NodeJS.Timer type for clearInterval
      clearInterval(this.syncInterval as unknown as NodeJS.Timeout);
      this.syncInterval = null;
    }

    this.cache.clear();
    this.clearIndices();
  }
}

// Supporting interfaces

export interface RegistryConfig {
  registryUrl: string;
  autoSyncInterval: number; // milliseconds
  cacheTimeout: number; // milliseconds
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
  topAuthors: Array<{ author: string; pluginCount: number }>;
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