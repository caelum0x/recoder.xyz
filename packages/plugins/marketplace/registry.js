"use strict";
/**
 * Plugin discovery and registry for the Craft Code marketplace
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginRegistry = void 0;
const events_1 = require("events");
const types_1 = require("../plugin-sdk/types");
class PluginRegistry extends events_1.EventEmitter {
    constructor(config, storage) {
        super();
        this.config = config;
        this.storage = storage;
        this.cache = new Map();
        this.categoryIndex = new Map();
        this.tagIndex = new Map();
        this.authorIndex = new Map();
        this.lastSync = null;
        this.syncInterval = null;
        this.initializeIndices();
        this.setupAutoSync();
    }
    /**
     * Initialize the registry and load cached data
     */
    async initialize() {
        try {
            await this.loadFromCache();
            await this.syncWithRemote();
        }
        catch (error) {
            console.error('Failed to initialize plugin registry:', error);
            throw error;
        }
    }
    /**
     * Search for plugins based on criteria
     */
    async search(options = {}) {
        const { query, category, tags = [], author, pricing, sortBy = 'relevance', limit = 20, offset = 0 } = options;
        try {
            let candidates = new Set();
            // Start with all plugins if no specific filters
            if (!query && !category && tags.length === 0 && !author) {
                candidates = new Set(this.cache.keys());
            }
            else {
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
                    }
                    else {
                        candidates = this.intersectSets(candidates, tagPlugins);
                    }
                }
                if (author) {
                    const authorPlugins = this.authorIndex.get(author);
                    if (authorPlugins) {
                        if (candidates.size === 0) {
                            candidates = new Set(authorPlugins);
                        }
                        else {
                            candidates = this.intersectSets(candidates, new Set(authorPlugins));
                        }
                    }
                }
                if (query) {
                    const queryPlugins = this.searchByText(query);
                    if (candidates.size === 0) {
                        candidates = queryPlugins;
                    }
                    else {
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
                .filter(Boolean);
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
        }
        catch (error) {
            console.error('Plugin search failed:', error);
            throw error;
        }
    }
    /**
     * Get detailed information about a specific plugin
     */
    async getPlugin(pluginId) {
        try {
            // Try cache first
            let plugin = this.cache.get(pluginId);
            if (!plugin) {
                // Fetch from remote if not in cache
                plugin = await this.fetchPluginFromRemote(pluginId);
                if (plugin) {
                    await this.addToCache(plugin);
                }
            }
            return plugin || null;
        }
        catch (error) {
            console.error(`Failed to get plugin ${pluginId}:`, error);
            return null;
        }
    }
    /**
     * Get plugins by category
     */
    async getPluginsByCategory(category, limit = 20) {
        const pluginIds = this.categoryIndex.get(category) || new Set();
        const plugins = Array.from(pluginIds)
            .map(id => this.cache.get(id))
            .filter(Boolean);
        return plugins
            .sort((a, b) => b.downloads - a.downloads)
            .slice(0, limit);
    }
    /**
     * Get trending plugins
     */
    async getTrendingPlugins(limit = 10) {
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
    async getFeaturedPlugins(limit = 6) {
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
    async getRecentPlugins(limit = 10) {
        const allPlugins = Array.from(this.cache.values());
        return allPlugins
            .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
            .slice(0, limit);
    }
    /**
     * Get plugins by author
     */
    async getPluginsByAuthor(author) {
        const pluginIds = this.authorIndex.get(author) || new Set();
        const plugins = Array.from(pluginIds)
            .map(id => this.cache.get(id))
            .filter(Boolean);
        return plugins.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
    /**
     * Check for plugin updates
     */
    async checkForUpdates(installedPlugins) {
        const updates = [];
        for (const installed of installedPlugins) {
            try {
                const latest = await this.getPlugin(installed.id);
                if (latest && this.isNewerVersion(latest.version, installed.version)) {
                    const update = {
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
            }
            catch (error) {
                console.error(`Failed to check updates for ${installed.id}:`, error);
            }
        }
        return updates;
    }
    /**
     * Get plugin statistics
     */
    async getStatistics() {
        const plugins = Array.from(this.cache.values());
        const categories = Array.from(this.categoryIndex.keys());
        const stats = {
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
    async syncWithRemote() {
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
        }
        catch (error) {
            console.error('Failed to sync with remote registry:', error);
            this.emit('syncFailed', { error: error.message });
            throw error;
        }
    }
    /**
     * Clear cache and reload from remote
     */
    async refresh() {
        this.cache.clear();
        this.clearIndices();
        await this.syncWithRemote();
    }
    /**
     * Get cache status
     */
    getCacheStatus() {
        return {
            size: this.cache.size,
            lastSync: this.lastSync,
            categories: this.categoryIndex.size,
            tags: this.tagIndex.size,
            authors: this.authorIndex.size
        };
    }
    // Private methods
    initializeIndices() {
        // Initialize category index
        for (const category of Object.values(types_1.PluginCategory)) {
            this.categoryIndex.set(category, new Set());
        }
    }
    async loadFromCache() {
        try {
            const cached = await this.storage.getCachedPlugins();
            for (const plugin of cached) {
                await this.addToCache(plugin);
            }
            this.lastSync = await this.storage.getLastSync();
            console.log(`Loaded ${cached.length} plugins from cache`);
        }
        catch (error) {
            console.warn('Failed to load from cache:', error);
        }
    }
    setupAutoSync() {
        if (this.config.autoSyncInterval > 0) {
            this.syncInterval = setInterval(async () => {
                try {
                    await this.syncWithRemote();
                }
                catch (error) {
                    console.error('Auto-sync failed:', error);
                }
            }, this.config.autoSyncInterval);
        }
    }
    async addToCache(plugin) {
        this.cache.set(plugin.id, plugin);
        // Update indices
        this.updateCategoryIndex(plugin);
        this.updateTagIndex(plugin);
        this.updateAuthorIndex(plugin);
        // Persist to storage
        await this.storage.savePlugin(plugin);
    }
    updateCategoryIndex(plugin) {
        const categorySet = this.categoryIndex.get(plugin.category);
        if (categorySet) {
            categorySet.add(plugin.id);
        }
    }
    updateTagIndex(plugin) {
        for (const tag of plugin.tags) {
            if (!this.tagIndex.has(tag)) {
                this.tagIndex.set(tag, new Set());
            }
            this.tagIndex.get(tag).add(plugin.id);
        }
    }
    updateAuthorIndex(plugin) {
        if (!this.authorIndex.has(plugin.author)) {
            this.authorIndex.set(plugin.author, new Set());
        }
        this.authorIndex.get(plugin.author).add(plugin.id);
    }
    clearIndices() {
        this.categoryIndex.clear();
        this.tagIndex.clear();
        this.authorIndex.clear();
        this.initializeIndices();
    }
    findPluginsByTags(tags) {
        let result = new Set();
        for (const tag of tags) {
            const tagPlugins = this.tagIndex.get(tag) || new Set();
            if (result.size === 0) {
                result = new Set(tagPlugins);
            }
            else {
                result = this.intersectSets(result, tagPlugins);
            }
        }
        return result;
    }
    searchByText(query) {
        const results = new Set();
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
    filterByPricing(candidates, pricing) {
        const filtered = new Set();
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
    sortResults(results, sortBy, query) {
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
    sortByRelevance(results, query) {
        const queryTerms = query.toLowerCase().split(/\s+/);
        return results
            .map(plugin => ({
            plugin,
            score: this.calculateRelevanceScore(plugin, queryTerms)
        }))
            .sort((a, b) => b.score - a.score)
            .map(item => item.plugin);
    }
    calculateRelevanceScore(plugin, queryTerms) {
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
    calculateTrendingScore(plugin) {
        const daysSinceUpdate = (Date.now() - plugin.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
        const recencyBoost = Math.max(0, 30 - daysSinceUpdate) / 30;
        return (plugin.downloads * 0.6 + plugin.rating.average * 100) * (1 + recencyBoost);
    }
    intersectSets(setA, setB) {
        return new Set([...setA].filter(x => setB.has(x)));
    }
    isNewerVersion(latest, current) {
        // Simple version comparison - in production, use semver
        return latest > current;
    }
    async fetchFromRemote() {
        const response = await fetch(`${this.config.registryUrl}/plugins`);
        if (!response.ok) {
            throw new Error(`Registry fetch failed: ${response.statusText}`);
        }
        return await response.json();
    }
    async fetchPluginFromRemote(pluginId) {
        try {
            const response = await fetch(`${this.config.registryUrl}/plugins/${pluginId}`);
            if (!response.ok) {
                return null;
            }
            return await response.json();
        }
        catch (error) {
            console.error(`Failed to fetch plugin ${pluginId}:`, error);
            return null;
        }
    }
    async getChangelog(pluginId, version) {
        try {
            const response = await fetch(`${this.config.registryUrl}/plugins/${pluginId}/changelog/${version}`);
            if (response.ok) {
                return await response.text();
            }
        }
        catch (error) {
            console.error(`Failed to get changelog for ${pluginId}@${version}:`, error);
        }
        return 'Changelog not available';
    }
    async hasBreakingChanges(pluginId, fromVersion, toVersion) {
        try {
            const response = await fetch(`${this.config.registryUrl}/plugins/${pluginId}/breaking-changes?from=${fromVersion}&to=${toVersion}`);
            if (response.ok) {
                const data = await response.json();
                return data.hasBreakingChanges;
            }
        }
        catch (error) {
            console.error(`Failed to check breaking changes for ${pluginId}:`, error);
        }
        return false;
    }
    async getPackageSize(pluginId, version) {
        try {
            const response = await fetch(`${this.config.registryUrl}/plugins/${pluginId}/size/${version}`);
            if (response.ok) {
                const data = await response.json();
                return data.size;
            }
        }
        catch (error) {
            console.error(`Failed to get package size for ${pluginId}@${version}:`, error);
        }
        return 0;
    }
    async getDownloadUrl(pluginId, version) {
        return `${this.config.registryUrl}/plugins/${pluginId}/download/${version}`;
    }
    getTopAuthors() {
        const authorCounts = new Map();
        for (const [author, plugins] of this.authorIndex) {
            authorCounts.set(author, plugins.size);
        }
        return Array.from(authorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([author, pluginCount]) => ({ author, pluginCount }));
    }
    async getRecentActivity() {
        // This would fetch recent activity from the registry
        return [];
    }
    async cleanupStaleEntries(currentPluginIds) {
        const currentSet = new Set(currentPluginIds);
        const staleIds = [];
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
    async cleanup() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.cache.clear();
        this.clearIndices();
    }
}
exports.PluginRegistry = PluginRegistry;
//# sourceMappingURL=registry.js.map