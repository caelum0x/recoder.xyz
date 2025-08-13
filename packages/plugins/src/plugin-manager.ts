/**
 * Plugin Manager - Central orchestrator for the Recoder.xyz plugin system
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Logger } from '@recoder/shared';

import { 
  Plugin,
  PluginMetadata,
  PluginManifest,
  PluginInstallOptions,
  PluginSearchOptions,
  PluginSearchResult,
  PluginUpdate,
  PluginError,
  PluginErrorCode
} from '../plugin-sdk/types';

import { PluginLifecycleManager, LoadedPlugin, LifecycleConfig } from '../plugin-sdk/lifecycle';
import { PluginRegistry, RegistryConfig } from '../marketplace/registry';
import { PluginInstaller } from '../marketplace/installer';
import { PluginRatingSystem } from '../marketplace/rating-system';
import { PluginEventBus } from './event-bus';
import { PluginAnalyticsTracker } from './analytics-tracker';

export interface PluginManagerConfig {
  pluginsDirectory: string;
  dataDirectory: string;
  registryUrl: string;
  lifecycle: LifecycleConfig;
  registry: RegistryConfig;
  enableAnalytics: boolean;
  maxConcurrentInstalls: number;
}

export class PluginManager extends EventEmitter {
  private lifecycleManager: PluginLifecycleManager;
  private registry: PluginRegistry;
  private installer: PluginInstaller;
  private ratingSystem: PluginRatingSystem;
  private eventBus: PluginEventBus;
  private analyticsTracker?: PluginAnalyticsTracker;
  private installingPlugins: Set<string> = new Set();

  constructor(private config: PluginManagerConfig) {
    super();

    // Initialize core components
    this.lifecycleManager = new PluginLifecycleManager(
      config.pluginsDirectory,
      config.lifecycle
    );

    this.registry = new PluginRegistry(
      config.registry,
      this.createRegistryStorage()
    );

    this.installer = new PluginInstaller(
      {
        registryUrl: config.registryUrl,
        pluginsDirectory: config.pluginsDirectory,
        tempDirectory: path.join(config.dataDirectory, 'temp'),
        maxConcurrentInstalls: config.maxConcurrentInstalls,
        downloadTimeout: 30000
      },
      this.lifecycleManager,
      this.createInstallerStorage()
    );

    this.ratingSystem = new PluginRatingSystem(
      {
        requireUsage: false,
        maxRatingsPerWindow: 5,
        rateLimitWindow: 3600000, // 1 hour
        maxTitleLength: 100,
        maxCommentLength: 1000,
        cacheTimeout: 300000, // 5 minutes
        autoModeration: true
      },
      this.createRatingStorage(),
      this.createUserService()
    );
    this.eventBus = new PluginEventBus();

    if (config.enableAnalytics) {
      this.analyticsTracker = new PluginAnalyticsTracker();
    }

    this.setupEventHandlers();
  }

  /**
   * Initialize the plugin system
   */
  async initialize(): Promise<void> {
    try {
      Logger.info('Initializing plugin system...');

      // Initialize registry
      await this.registry.initialize();

      // Discover and load installed plugins
      await this.discoverInstalledPlugins();

      // Auto-activate enabled plugins
      await this.autoActivatePlugins();

      Logger.info('Plugin system initialized successfully');
      this.emit('initialized');
    } catch (error) {
      Logger.error('Failed to initialize plugin system:', error);
      throw error;
    }
  }

  // Plugin Discovery and Management

  /**
   * Search for plugins in the marketplace
   */
  async searchPlugins(options: PluginSearchOptions): Promise<PluginSearchResult> {
    return await this.registry.search(options);
  }

  /**
   * Get detailed information about a plugin
   */
  async getPluginInfo(pluginId: string): Promise<PluginMetadata | null> {
    const plugin = await this.registry.getPlugin(pluginId);
    return plugin ?? null;
  }

  /**
   * Get trending plugins
   */
  async getTrendingPlugins(limit = 10): Promise<PluginMetadata[]> {
    return await this.registry.getTrendingPlugins(limit);
  }

  /**
   * Get featured plugins
   */
  async getFeaturedPlugins(limit = 6): Promise<PluginMetadata[]> {
    return await this.registry.getFeaturedPlugins(limit);
  }

  // Plugin Installation and Updates

  /**
   * Install a plugin from the marketplace
   */
  async installPlugin(pluginId: string, options: PluginInstallOptions = {}): Promise<void> {
    if (this.installingPlugins.has(pluginId)) {
      throw new PluginError(
        `Plugin ${pluginId} is already being installed`,
        pluginId,
        PluginErrorCode.RUNTIME_ERROR
      );
    }

    try {
      this.installingPlugins.add(pluginId);
      this.emit('installStarted', { pluginId, options });

      // Get plugin metadata
      const metadata = await this.registry.getPlugin(pluginId) || null;
      if (!metadata) {
        throw new PluginError(
          `Plugin not found: ${pluginId}`,
          pluginId,
          PluginErrorCode.DEPENDENCY_NOT_FOUND
        );
      }

      // Install plugin
      await this.installer.installPlugin(pluginId, options);

      // Load the installed plugin
      const pluginPath = path.join(this.config.pluginsDirectory, pluginId);
      await this.lifecycleManager.loadPlugin(pluginPath);

      // Track analytics
      if (this.analyticsTracker) {
        this.analyticsTracker.trackInstall(pluginId);
      }

      this.emit('installCompleted', { pluginId, metadata });
      Logger.info(`Plugin installed successfully: ${pluginId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('installFailed', { pluginId, error: errorMessage });
      Logger.error(`Failed to install plugin ${pluginId}:`, error);
      throw error;
    } finally {
      this.installingPlugins.delete(pluginId);
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(pluginId: string): Promise<void> {
    try {
      this.emit('uninstallStarted', { pluginId });

      // Deactivate and unload plugin
      await this.lifecycleManager.unloadPlugin(pluginId);

      // Remove plugin files
      await this.installer.uninstallPlugin(pluginId);

      // Track analytics
      if (this.analyticsTracker) {
        this.analyticsTracker.trackUninstall(pluginId);
      }

      this.emit('uninstallCompleted', { pluginId });
      Logger.info(`Plugin uninstalled successfully: ${pluginId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('uninstallFailed', { pluginId, error: errorMessage });
      Logger.error(`Failed to uninstall plugin ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Update a plugin to the latest version
   */
  async updatePlugin(pluginId: string): Promise<void> {
    try {
      this.emit('updateStarted', { pluginId });

      // Check for available updates
      const plugin = this.lifecycleManager.getPlugin(pluginId);
      if (!plugin) {
        throw new PluginError(
          `Plugin not installed: ${pluginId}`,
          pluginId,
          PluginErrorCode.DEPENDENCY_NOT_FOUND
        );
      }

      const updates = await this.checkForUpdates([{
        id: pluginId,
        version: plugin.manifest.version
      }]);

      const update = updates.find(u => u.currentVersion === plugin.manifest.version);
      if (!update) {
        Logger.info(`Plugin ${pluginId} is already up to date`);
        return;
      }

      // Perform update
      const wasActive = plugin.state === 'active';
      
      // Deactivate and unload
      if (wasActive) {
        await this.lifecycleManager.deactivatePlugin(pluginId);
      }
      await this.lifecycleManager.unloadPlugin(pluginId);

      // Install new version
      await this.installer.updatePlugin(pluginId, update.latestVersion);

      // Reload plugin
      const pluginPath = path.join(this.config.pluginsDirectory, pluginId);
      await this.lifecycleManager.loadPlugin(pluginPath);

      // Reactivate if it was active
      if (wasActive) {
        await this.lifecycleManager.activatePlugin(pluginId);
      }

      // Track analytics
      if (this.analyticsTracker) {
        this.analyticsTracker.trackUpdate(pluginId, update.currentVersion, update.latestVersion);
      }

      this.emit('updateCompleted', { pluginId, update });
      Logger.info(`Plugin updated successfully: ${pluginId} (${update.currentVersion} → ${update.latestVersion})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('updateFailed', { pluginId, error: errorMessage });
      Logger.error(`Failed to update plugin ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Check for available updates
   */
  async checkForUpdates(installedPlugins?: Array<{ id: string; version: string }>): Promise<PluginUpdate[]> {
    if (!installedPlugins) {
      installedPlugins = this.getInstalledPlugins().map(p => ({
        id: p.id,
        version: p.manifest.version
      }));
    }

    return await this.registry.checkForUpdates(installedPlugins);
  }

  // Plugin Lifecycle Management

  /**
   * Activate a plugin
   */
  async activatePlugin(pluginId: string): Promise<void> {
    await this.lifecycleManager.activatePlugin(pluginId);
    
    if (this.analyticsTracker) {
      this.analyticsTracker.trackActivation(pluginId);
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivatePlugin(pluginId: string): Promise<void> {
    await this.lifecycleManager.deactivatePlugin(pluginId);
    
    if (this.analyticsTracker) {
      this.analyticsTracker.trackDeactivation(pluginId);
    }
  }

  /**
   * Reload a plugin
   */
  async reloadPlugin(pluginId: string): Promise<void> {
    await this.lifecycleManager.reloadPlugin(pluginId);
    
    if (this.analyticsTracker) {
      this.analyticsTracker.trackReload(pluginId);
    }
  }

  // Plugin Information and Status

  /**
   * Get list of installed plugins
   */
  getInstalledPlugins(): LoadedPlugin[] {
    return this.lifecycleManager.getPlugins();
  }

  /**
   * Get list of active plugins
   */
  getActivePlugins(): LoadedPlugin[] {
    return this.lifecycleManager.getActivePlugins();
  }

  /**
   * Get plugin by ID
   */
  getPlugin(pluginId: string): LoadedPlugin | undefined {
    return this.lifecycleManager.getPlugin(pluginId);
  }

  /**
   * Check if a plugin is installed
   */
  isPluginInstalled(pluginId: string): boolean {
    return this.lifecycleManager.getPlugin(pluginId) !== undefined;
  }

  /**
   * Check if a plugin is active
   */
  isPluginActive(pluginId: string): boolean {
    const plugin = this.lifecycleManager.getPlugin(pluginId);
    return plugin?.state === 'active' || false;
  }

  // Plugin Configuration

  /**
   * Update plugin configuration
   */
  async updatePluginConfig(pluginId: string, config: Record<string, any>): Promise<void> {
    await this.lifecycleManager.updatePluginConfig(pluginId, config);
  }

  /**
   * Get plugin configuration
   */
  getPluginConfig(pluginId: string): Record<string, any> | undefined {
    const plugin = this.lifecycleManager.getPlugin(pluginId);
    return plugin?.context.config;
  }

  // Event Handling

  /**
   * Handle plugin events
   */
  async handlePluginEvent(pluginId: string, event: string, data?: any): Promise<any> {
    return await this.lifecycleManager.handlePluginEvent(pluginId, event, data);
  }

  /**
   * Broadcast event to all active plugins
   */
  async broadcastEvent(event: string, data?: any): Promise<void> {
    const activePlugins = this.getActivePlugins();
    
    await Promise.all(
      activePlugins.map(async (plugin) => {
        try {
          await this.handlePluginEvent(plugin.id, event, data);
        } catch (error) {
          Logger.error(`Error handling event ${event} for plugin ${plugin.id}:`, error);
        }
      })
    );
  }

  // Ratings and Reviews

  /**
   * Rate a plugin
   */
  async ratePlugin(pluginId: string, rating: number, review?: string): Promise<void> {
    await this.ratingSystem.submitRating(pluginId, 'user-' + Date.now(), { 
      score: rating, 
      comment: review 
    });
  }

  /**
   * Get plugin ratings
   */
  async getPluginRatings(pluginId: string): Promise<any> {
    return await this.ratingSystem.getPluginRating(pluginId);
  }

  // Analytics and Statistics

  /**
   * Get plugin analytics
   */
  getPluginAnalytics(pluginId: string): any {
    return this.lifecycleManager.getAnalytics(pluginId);
  }

  /**
   * Get overall system statistics
   */
  async getSystemStatistics(): Promise<any> {
    const registryStats = await this.registry.getStatistics();
    const installedCount = this.getInstalledPlugins().length;
    const activeCount = this.getActivePlugins().length;

    return {
      registry: registryStats,
      installed: installedCount,
      active: activeCount,
      cacheStatus: this.registry.getCacheStatus()
    };
  }

  // Cleanup and Shutdown

  /**
   * Shutdown the plugin system
   */
  async shutdown(): Promise<void> {
    Logger.info('Shutting down plugin system...');

    // Shutdown all components
    await this.lifecycleManager.shutdown();
    await this.registry.cleanup();
    await this.installer.cleanup();

    if (this.analyticsTracker) {
      await this.analyticsTracker.flush();
    }

    Logger.info('Plugin system shutdown complete');
    this.emit('shutdown');
  }

  // Private Methods

  private async discoverInstalledPlugins(): Promise<void> {
    try {
      const entries = await fs.readdir(this.config.pluginsDirectory, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(this.config.pluginsDirectory, entry.name);
          try {
            await this.lifecycleManager.loadPlugin(pluginPath);
          } catch (error) {
            Logger.warn(`Failed to load plugin at ${pluginPath}:`, error);
          }
        }
      }
    } catch (error) {
      Logger.warn('Failed to discover installed plugins:', error);
    }
  }

  private async autoActivatePlugins(): Promise<void> {
    const plugins = this.getInstalledPlugins();
    
    for (const plugin of plugins) {
      // Check if plugin should be auto-activated based on configuration
      const autoActivate = plugin.manifest.craftCodePlugin.metadata.keywords?.includes('auto-activate');
      
      if (autoActivate) {
        try {
          await this.activatePlugin(plugin.id);
        } catch (error) {
          Logger.warn(`Failed to auto-activate plugin ${plugin.id}:`, error);
        }
      }
    }
  }

  private setupEventHandlers(): void {
    // Forward lifecycle events
    this.lifecycleManager.on('pluginLoaded', (event) => this.emit('pluginLoaded', event));
    this.lifecycleManager.on('pluginActivated', (event) => this.emit('pluginActivated', event));
    this.lifecycleManager.on('pluginDeactivated', (event) => this.emit('pluginDeactivated', event));
    this.lifecycleManager.on('pluginUnloaded', (event) => this.emit('pluginUnloaded', event));
    this.lifecycleManager.on('pluginError', (event) => this.emit('pluginError', event));

    // Forward registry events
    this.registry.on('syncCompleted', (event) => this.emit('registrySynced', event));
    this.registry.on('syncFailed', (event) => this.emit('registrySyncFailed', event));
  }

  private createRegistryStorage(): any {
    // Simple file-based storage implementation
    const storageDir = path.join(this.config.dataDirectory, 'registry');
    
    return {
      async getCachedPlugins(): Promise<PluginMetadata[]> {
        try {
          const cacheFile = path.join(storageDir, 'cache.json');
          const content = await fs.readFile(cacheFile, 'utf-8');
          return JSON.parse(content);
        } catch (error) {
          return [];
        }
      },

      async savePlugin(plugin: PluginMetadata): Promise<void> {
        const pluginFile = path.join(storageDir, `${plugin.id}.json`);
        await fs.mkdir(storageDir, { recursive: true });
        await fs.writeFile(pluginFile, JSON.stringify(plugin, null, 2));
      },

      async removePlugin(pluginId: string): Promise<void> {
        try {
          const pluginFile = path.join(storageDir, `${pluginId}.json`);
          await fs.unlink(pluginFile);
        } catch (error) {
          // Ignore if file doesn't exist
        }
      },

      async getLastSync(): Promise<Date | null> {
        try {
          const syncFile = path.join(storageDir, 'last-sync.txt');
          const content = await fs.readFile(syncFile, 'utf-8');
          return new Date(content);
        } catch (error) {
          return null;
        }
      },

      async setLastSync(date: Date): Promise<void> {
        const syncFile = path.join(storageDir, 'last-sync.txt');
        await fs.mkdir(storageDir, { recursive: true });
        await fs.writeFile(syncFile, date.toISOString());
      },

      async clear(): Promise<void> {
        try {
          await fs.rmdir(storageDir, { recursive: true });
        } catch (error) {
          // Ignore if directory doesn't exist
        }
      }
    };
  }

  private createRatingStorage(): any {
    const storageDir = path.join(this.config.dataDirectory, 'ratings');
    
    return {
      // Plugin ratings
      async savePluginRating(rating: any): Promise<void> {
        const ratingFile = path.join(storageDir, `${rating.pluginId}-rating.json`);
        await fs.mkdir(storageDir, { recursive: true });
        await fs.writeFile(ratingFile, JSON.stringify(rating, null, 2));
      },
      
      async getPluginRating(pluginId: string): Promise<any> {
        try {
          const ratingFile = path.join(storageDir, `${pluginId}-rating.json`);
          const content = await fs.readFile(ratingFile, 'utf-8');
          return JSON.parse(content);
        } catch (error) {
          return null;
        }
      },
      
      async getAllPluginRatings(): Promise<any[]> {
        try {
          const files = await fs.readdir(storageDir);
          const ratings = [];
          for (const file of files) {
            if (file.endsWith('-rating.json')) {
              try {
                const content = await fs.readFile(path.join(storageDir, file), 'utf-8');
                ratings.push(JSON.parse(content));
              } catch (error) {
                // Skip invalid files
              }
            }
          }
          return ratings;
        } catch (error) {
          return [];
        }
      },

      // User ratings - simplified implementations
      async saveUserRating(rating: any): Promise<void> {
        const userRatingFile = path.join(storageDir, `${rating.pluginId}-${rating.userId}.json`);
        await fs.mkdir(storageDir, { recursive: true });
        await fs.writeFile(userRatingFile, JSON.stringify(rating, null, 2));
      },

      async getUserRating(pluginId: string, userId: string): Promise<any> {
        try {
          const userRatingFile = path.join(storageDir, `${pluginId}-${userId}.json`);
          const content = await fs.readFile(userRatingFile, 'utf-8');
          return JSON.parse(content);
        } catch (error) {
          return null;
        }
      },

      async deleteUserRating(pluginId: string, userId: string): Promise<void> {
        try {
          const userRatingFile = path.join(storageDir, `${pluginId}-${userId}.json`);
          await fs.unlink(userRatingFile);
        } catch (error) {
          // Ignore if file doesn't exist
        }
      },

      async getAllUserRatings(): Promise<any[]> {
        return [];
      },

      async getRecentUserRatings(userId: string, windowMs: number): Promise<any[]> {
        return [];
      },

      // Reviews
      async getAllReviews(): Promise<any[]> {
        return [];
      },

      // Helpful votes
      async saveHelpfulVote(ratingId: string, userId: string, helpful: boolean): Promise<void> {},
      async updateHelpfulVote(ratingId: string, userId: string, helpful: boolean): Promise<void> {},
      async getHelpfulVote(ratingId: string, userId: string): Promise<any> { return null; },

      // Reports
      async saveReviewReport(report: any): Promise<void> {},
      async getReviewReports(): Promise<any[]> { return []; }
    };
  }

  private createUserService(): any {
    return {
      async hasUserUsedPlugin(userId: string, pluginId: string): Promise<boolean> {
        // Simple check - assume user has used plugin if they have it installed
        return this.isPluginInstalled(pluginId);
      },
      
      async isUserVerified(userId: string): Promise<boolean> {
        // For now, consider all users verified
        return true;
      },
      
      async getUserInfo(userId: string): Promise<any> {
        return {
          name: `User ${userId}`,
          avatar: undefined
        };
      }
    };
  }

  private createInstallerStorage(): any {
    const storageDir = path.join(this.config.dataDirectory, 'installer');
    
    return {
      async getInstalledPlugins(): Promise<any[]> {
        try {
          const installedFile = path.join(storageDir, 'installed.json');
          const content = await fs.readFile(installedFile, 'utf-8');
          return JSON.parse(content);
        } catch (error) {
          return [];
        }
      },

      async saveInstalledPlugin(plugin: any): Promise<void> {
        await fs.mkdir(storageDir, { recursive: true });
        const installedFile = path.join(storageDir, 'installed.json');
        
        let installed = [];
        try {
          const content = await fs.readFile(installedFile, 'utf-8');
          installed = JSON.parse(content);
        } catch (error) {
          // File doesn't exist yet
        }

        // Update or add plugin
        const index = installed.findIndex((p: any) => p.id === plugin.id);
        if (index >= 0) {
          installed[index] = plugin;
        } else {
          installed.push(plugin);
        }

        await fs.writeFile(installedFile, JSON.stringify(installed, null, 2));
      },

      async removeInstalledPlugin(pluginId: string): Promise<void> {
        const installedFile = path.join(storageDir, 'installed.json');
        
        try {
          const content = await fs.readFile(installedFile, 'utf-8');
          let installed = JSON.parse(content);
          installed = installed.filter((p: any) => p.id !== pluginId);
          await fs.writeFile(installedFile, JSON.stringify(installed, null, 2));
        } catch (error) {
          // File doesn't exist or other error
        }
      },

      async clear(): Promise<void> {
        try {
          await fs.rmdir(storageDir, { recursive: true });
        } catch (error) {
          // Ignore if directory doesn't exist
        }
      }
    };
  }
}