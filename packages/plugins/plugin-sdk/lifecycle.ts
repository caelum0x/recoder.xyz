/**
 * Plugin lifecycle management for the Craft Code extensibility framework
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  Plugin,
  PluginContext,
  PluginMetadata,
  PluginManifest,
  PluginError,
  PluginErrorCode,
  PluginEvent,
  PluginAnalytics,
  PluginSecurity,
  PluginLogger,
  PluginStorage,
  PluginAPI,
  WorkspaceAPI,
  PluginUI
} from './types';
import { PluginSandbox } from './sandbox';

export class PluginLifecycleManager extends EventEmitter {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private activePlugins: Set<string> = new Set();
  private dependencyGraph: Map<string, string[]> = new Map();
  private analytics: Map<string, PluginAnalytics> = new Map();
  private sandbox: PluginSandbox;

  constructor(
    private pluginDirectory: string,
    private config: LifecycleConfig
  ) {
    super();
    this.sandbox = new PluginSandbox(config.sandboxConfig);
    this.setupCleanupHandlers();
  }

  /**
   * Load and register a plugin from directory or package
   */
  async loadPlugin(pluginPath: string): Promise<void> {
    try {
      const manifest = await this.loadManifest(pluginPath);
      const security = await this.loadSecurity(pluginPath);
      
      // Validate plugin
      await this.validatePlugin(manifest, security);
      
      // Load plugin module
      const pluginModule = await this.loadPluginModule(pluginPath, manifest);
      
      // Create plugin context
      const context = await this.createPluginContext(manifest.name, pluginModule.metadata);
      
      const loadedPlugin: LoadedPlugin = {
        id: manifest.name,
        path: pluginPath,
        manifest,
        security,
        plugin: pluginModule,
        context,
        state: PluginState.LOADED,
        loadedAt: new Date(),
        analytics: this.initializeAnalytics(manifest.name)
      };

      this.plugins.set(manifest.name, loadedPlugin);
      this.buildDependencyGraph();
      
      this.emit('pluginLoaded', {
        type: 'pluginLoaded',
        pluginId: manifest.name,
        timestamp: new Date()
      } as PluginEvent);

      console.log(`Plugin loaded: ${manifest.name}@${manifest.version}`);
    } catch (error) {
      this.handlePluginError(pluginPath, PluginErrorCode.ACTIVATION_FAILED, error);
      throw error;
    }
  }

  /**
   * Activate a loaded plugin
   */
  async activatePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new PluginError(`Plugin not found: ${pluginId}`, pluginId, PluginErrorCode.ACTIVATION_FAILED);
    }

    if (plugin.state === PluginState.ACTIVE) {
      return; // Already active
    }

    try {
      // Activate dependencies first
      await this.activateDependencies(pluginId);
      
      // Set up sandbox environment
      const sandboxContext = await this.sandbox.createContext(plugin);
      
      // Activate plugin in sandbox
      await this.sandbox.execute(plugin, async () => {
        await plugin.plugin.activate(plugin.context);
      });

      plugin.state = PluginState.ACTIVE;
      plugin.activatedAt = new Date();
      this.activePlugins.add(pluginId);
      
      // Update analytics
      this.updateAnalytics(pluginId, 'activation');
      
      this.emit('pluginActivated', {
        type: 'pluginActivated',
        pluginId,
        timestamp: new Date()
      } as PluginEvent);

      console.log(`Plugin activated: ${pluginId}`);
    } catch (error) {
      plugin.state = PluginState.ERROR;
      plugin.error = error;
      this.handlePluginError(pluginId, PluginErrorCode.ACTIVATION_FAILED, error);
      throw error;
    }
  }

  /**
   * Deactivate an active plugin
   */
  async deactivatePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new PluginError(`Plugin not found: ${pluginId}`, pluginId, PluginErrorCode.DEACTIVATION_FAILED);
    }

    if (plugin.state !== PluginState.ACTIVE) {
      return; // Not active
    }

    try {
      // Check for dependent plugins
      const dependents = this.getDependentPlugins(pluginId);
      if (dependents.length > 0) {
        throw new PluginError(
          `Cannot deactivate plugin ${pluginId}: required by ${dependents.join(', ')}`,
          pluginId,
          PluginErrorCode.DEACTIVATION_FAILED
        );
      }

      // Deactivate plugin in sandbox
      await this.sandbox.execute(plugin, async () => {
        if (plugin.plugin.deactivate) {
          await plugin.plugin.deactivate();
        }
      });

      plugin.state = PluginState.LOADED;
      plugin.deactivatedAt = new Date();
      this.activePlugins.delete(pluginId);
      
      // Update analytics
      this.updateAnalytics(pluginId, 'deactivation');
      
      // Clean up sandbox context
      await this.sandbox.destroyContext(plugin);

      this.emit('pluginDeactivated', {
        type: 'pluginDeactivated',
        pluginId,
        timestamp: new Date()
      } as PluginEvent);

      console.log(`Plugin deactivated: ${pluginId}`);
    } catch (error) {
      plugin.state = PluginState.ERROR;
      plugin.error = error;
      this.handlePluginError(pluginId, PluginErrorCode.DEACTIVATION_FAILED, error);
      throw error;
    }
  }

  /**
   * Unload a plugin completely
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return; // Already unloaded
    }

    try {
      // Deactivate if active
      if (plugin.state === PluginState.ACTIVE) {
        await this.deactivatePlugin(pluginId);
      }

      // Clean up resources
      await this.cleanupPlugin(plugin);
      
      this.plugins.delete(pluginId);
      this.dependencyGraph.delete(pluginId);
      this.analytics.delete(pluginId);

      this.emit('pluginUnloaded', {
        type: 'pluginUnloaded',
        pluginId,
        timestamp: new Date()
      } as PluginEvent);

      console.log(`Plugin unloaded: ${pluginId}`);
    } catch (error) {
      this.handlePluginError(pluginId, PluginErrorCode.DEACTIVATION_FAILED, error);
      throw error;
    }
  }

  /**
   * Reload a plugin (unload and load again)
   */
  async reloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new PluginError(`Plugin not found: ${pluginId}`, pluginId, PluginErrorCode.RUNTIME_ERROR);
    }

    const wasActive = plugin.state === PluginState.ACTIVE;
    const pluginPath = plugin.path;

    await this.unloadPlugin(pluginId);
    await this.loadPlugin(pluginPath);

    if (wasActive) {
      await this.activatePlugin(pluginId);
    }
  }

  /**
   * Get plugin information
   */
  getPlugin(pluginId: string): LoadedPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * List all loaded plugins
   */
  getPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * List active plugins
   */
  getActivePlugins(): LoadedPlugin[] {
    return Array.from(this.activePlugins)
      .map(id => this.plugins.get(id))
      .filter(Boolean) as LoadedPlugin[];
  }

  /**
   * Get plugin analytics
   */
  getAnalytics(pluginId: string): PluginAnalytics | undefined {
    return this.analytics.get(pluginId);
  }

  /**
   * Update plugin configuration
   */
  async updatePluginConfig(pluginId: string, config: Record<string, any>): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new PluginError(`Plugin not found: ${pluginId}`, pluginId, PluginErrorCode.CONFIGURATION_ERROR);
    }

    try {
      // Validate configuration
      await this.validateConfiguration(plugin, config);
      
      // Update context
      plugin.context.config = { ...plugin.context.config, ...config };
      
      // Notify plugin of configuration change
      if (plugin.plugin.onConfigChange && plugin.state === PluginState.ACTIVE) {
        await this.sandbox.execute(plugin, async () => {
          await plugin.plugin.onConfigChange!(config);
        });
      }

      this.emit('pluginConfigUpdated', {
        type: 'pluginConfigUpdated',
        pluginId,
        timestamp: new Date(),
        data: config
      } as PluginEvent);
    } catch (error) {
      this.handlePluginError(pluginId, PluginErrorCode.CONFIGURATION_ERROR, error);
      throw error;
    }
  }

  /**
   * Handle plugin events
   */
  async handlePluginEvent(pluginId: string, event: string, data?: any): Promise<any> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || plugin.state !== PluginState.ACTIVE) {
      return;
    }

    try {
      if (plugin.plugin.onCommand && event.startsWith('command:')) {
        const command = event.substring(8);
        return await this.sandbox.execute(plugin, async () => {
          return await plugin.plugin.onCommand!(command, data);
        });
      }

      // Handle other events based on plugin hooks
      const hookMap: Record<string, keyof Plugin> = {
        'project:open': 'onProjectOpen',
        'project:close': 'onProjectClose',
        'file:create': 'onFileCreate',
        'file:change': 'onFileChange',
        'file:delete': 'onFileDelete'
      };

      const hook = hookMap[event];
      if (hook && plugin.plugin[hook]) {
        return await this.sandbox.execute(plugin, async () => {
          return await (plugin.plugin[hook] as any)?.(data);
        });
      }
    } catch (error) {
      this.handlePluginError(pluginId, PluginErrorCode.RUNTIME_ERROR, error);
      throw error;
    }
  }

  /**
   * Shutdown all plugins
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down plugin system...');
    
    // Deactivate all active plugins
    const activePluginIds = Array.from(this.activePlugins);
    for (const pluginId of activePluginIds) {
      try {
        await this.deactivatePlugin(pluginId);
      } catch (error) {
        console.error(`Error deactivating plugin ${pluginId}:`, error);
      }
    }

    // Unload all plugins
    const pluginIds = Array.from(this.plugins.keys());
    for (const pluginId of pluginIds) {
      try {
        await this.unloadPlugin(pluginId);
      } catch (error) {
        console.error(`Error unloading plugin ${pluginId}:`, error);
      }
    }

    // Cleanup sandbox
    await this.sandbox.cleanup();
    
    console.log('Plugin system shutdown complete');
  }

  // Private methods

  private async loadManifest(pluginPath: string): Promise<PluginManifest> {
    const manifestPath = path.join(pluginPath, 'package.json');
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as PluginManifest;
      
      if (!manifest.craftCodePlugin) {
        throw new Error('Invalid plugin manifest: missing craftCodePlugin section');
      }
      
      return manifest;
    } catch (error) {
      throw new PluginError(
        `Failed to load plugin manifest: ${error.message}`,
        pluginPath,
        PluginErrorCode.INVALID_MANIFEST,
        error
      );
    }
  }

  private async loadSecurity(pluginPath: string): Promise<PluginSecurity> {
    const securityPath = path.join(pluginPath, 'security.json');
    try {
      const content = await fs.readFile(securityPath, 'utf-8');
      return JSON.parse(content) as PluginSecurity;
    } catch (error) {
      // Return default security config if file doesn't exist
      return {
        permissions: [],
        sandboxConfig: {
          allowNetworkAccess: false,
          allowFileSystemAccess: false,
          allowShellAccess: false,
          timeoutMs: 30000,
          memoryLimitMB: 100,
          cpuLimitPercent: 10
        },
        publisher: {
          id: 'unknown',
          verified: false,
          reputation: 0
        }
      };
    }
  }

  private async validatePlugin(manifest: PluginManifest, security: PluginSecurity): Promise<void> {
    // Validate manifest structure
    if (!manifest.name || !manifest.version || !manifest.main) {
      throw new Error('Invalid manifest: missing required fields');
    }

    // Validate engine compatibility
    const requiredVersion = manifest.craftCodePlugin.metadata.engines.craftCode;
    if (!this.isVersionCompatible(requiredVersion, this.config.appVersion)) {
      throw new Error(`Plugin requires Craft Code ${requiredVersion}, but running ${this.config.appVersion}`);
    }

    // Validate security permissions
    if (security.permissions.some(perm => !this.config.allowedPermissions.includes(perm))) {
      throw new Error('Plugin requests unauthorized permissions');
    }
  }

  private async loadPluginModule(pluginPath: string, manifest: PluginManifest): Promise<Plugin> {
    const mainPath = path.join(pluginPath, manifest.main);
    try {
      // Clear require cache to ensure fresh load
      delete require.cache[require.resolve(mainPath)];
      
      const module = require(mainPath);
      const plugin = module.default || module;
      
      if (!plugin || typeof plugin.activate !== 'function') {
        throw new Error('Plugin must export activate function');
      }
      
      return plugin;
    } catch (error) {
      throw new PluginError(
        `Failed to load plugin module: ${error.message}`,
        manifest.name,
        PluginErrorCode.ACTIVATION_FAILED,
        error
      );
    }
  }

  private async createPluginContext(pluginId: string, metadata: PluginMetadata): Promise<PluginContext> {
    const logger = this.createPluginLogger(pluginId);
    const storage = this.createPluginStorage(pluginId);
    const api = this.createPluginAPI(pluginId);
    const workspace = this.createWorkspaceAPI(pluginId);
    const ui = this.createPluginUI(pluginId);

    return {
      id: pluginId,
      version: metadata.version,
      config: {},
      logger,
      storage,
      api,
      workspace,
      ui,
      events: new EventEmitter()
    };
  }

  private createPluginLogger(pluginId: string): PluginLogger {
    return {
      debug: (message: string, ...args: any[]) => {
        console.debug(`[${pluginId}] ${message}`, ...args);
      },
      info: (message: string, ...args: any[]) => {
        console.info(`[${pluginId}] ${message}`, ...args);
      },
      warn: (message: string, ...args: any[]) => {
        console.warn(`[${pluginId}] ${message}`, ...args);
      },
      error: (message: string, ...args: any[]) => {
        console.error(`[${pluginId}] ${message}`, ...args);
      }
    };
  }

  private createPluginStorage(pluginId: string): PluginStorage {
    const storageDir = path.join(this.config.dataDirectory, 'plugins', pluginId);
    
    return {
      async get<T = any>(key: string): Promise<T | null> {
        try {
          const filePath = path.join(storageDir, `${key}.json`);
          const content = await fs.readFile(filePath, 'utf-8');
          return JSON.parse(content);
        } catch (error) {
          return null;
        }
      },
      
      async set<T = any>(key: string, value: T): Promise<void> {
        const filePath = path.join(storageDir, `${key}.json`);
        await fs.mkdir(storageDir, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(value, null, 2));
      },
      
      async delete(key: string): Promise<void> {
        try {
          const filePath = path.join(storageDir, `${key}.json`);
          await fs.unlink(filePath);
        } catch (error) {
          // Ignore if file doesn't exist
        }
      },
      
      async clear(): Promise<void> {
        try {
          await fs.rmdir(storageDir, { recursive: true });
        } catch (error) {
          // Ignore if directory doesn't exist
        }
      },
      
      async keys(): Promise<string[]> {
        try {
          const files = await fs.readdir(storageDir);
          return files
            .filter(file => file.endsWith('.json'))
            .map(file => file.slice(0, -5));
        } catch (error) {
          return [];
        }
      }
    };
  }

  private createPluginAPI(pluginId: string): PluginAPI {
    // Implementation would depend on specific API requirements
    return {} as PluginAPI;
  }

  private createWorkspaceAPI(pluginId: string): WorkspaceAPI {
    // Implementation would depend on workspace management
    return {} as WorkspaceAPI;
  }

  private createPluginUI(pluginId: string): PluginUI {
    // Implementation would depend on UI framework
    return {} as PluginUI;
  }

  private initializeAnalytics(pluginId: string): PluginAnalytics {
    return {
      activations: 0,
      deactivations: 0,
      errors: 0,
      lastUsed: new Date(),
      totalUsageTime: 0,
      commandsExecuted: 0,
      filesCreated: 0,
      apiCalls: 0
    };
  }

  private updateAnalytics(pluginId: string, event: string): void {
    const analytics = this.analytics.get(pluginId);
    if (!analytics) return;

    switch (event) {
      case 'activation':
        analytics.activations++;
        break;
      case 'deactivation':
        analytics.deactivations++;
        break;
      case 'error':
        analytics.errors++;
        break;
    }

    analytics.lastUsed = new Date();
  }

  private async activateDependencies(pluginId: string): Promise<void> {
    const dependencies = this.dependencyGraph.get(pluginId) || [];
    
    for (const depId of dependencies) {
      const dep = this.plugins.get(depId);
      if (!dep) {
        throw new PluginError(
          `Dependency not found: ${depId}`,
          pluginId,
          PluginErrorCode.DEPENDENCY_NOT_FOUND
        );
      }
      
      if (dep.state !== PluginState.ACTIVE) {
        await this.activatePlugin(depId);
      }
    }
  }

  private getDependentPlugins(pluginId: string): string[] {
    const dependents: string[] = [];
    
    for (const [pid, deps] of this.dependencyGraph) {
      if (deps.includes(pluginId) && this.activePlugins.has(pid)) {
        dependents.push(pid);
      }
    }
    
    return dependents;
  }

  private buildDependencyGraph(): void {
    this.dependencyGraph.clear();
    
    for (const [pluginId, plugin] of this.plugins) {
      const deps = Object.keys(plugin.manifest.craftCodePlugin.metadata.dependencies || {})
        .filter(dep => this.plugins.has(dep));
      
      this.dependencyGraph.set(pluginId, deps);
    }
  }

  private async validateConfiguration(plugin: LoadedPlugin, config: Record<string, any>): Promise<void> {
    const schema = plugin.manifest.craftCodePlugin.configuration?.schema;
    if (!schema) return;

    for (const [key, field] of Object.entries(schema)) {
      const value = config[key];
      
      if (field.required && (value === undefined || value === null)) {
        throw new Error(`Required configuration field missing: ${key}`);
      }
      
      if (value !== undefined && field.validation) {
        // Validate based on field type and validation rules
        // Implementation would depend on specific validation requirements
      }
    }
  }

  private async cleanupPlugin(plugin: LoadedPlugin): Promise<void> {
    // Clean up plugin resources
    await this.sandbox.destroyContext(plugin);
    
    // Clean up storage if configured
    if (this.config.cleanupStorageOnUnload) {
      await plugin.context.storage.clear();
    }
  }

  private handlePluginError(pluginId: string, code: PluginErrorCode, error: any): void {
    this.updateAnalytics(pluginId, 'error');
    
    this.emit('pluginError', {
      type: 'pluginError',
      pluginId,
      timestamp: new Date(),
      data: { code, error: error.message }
    } as PluginEvent);
    
    console.error(`Plugin error [${pluginId}]:`, error);
  }

  private isVersionCompatible(required: string, current: string): boolean {
    // Simple version comparison - in production, use semver
    return required <= current;
  }

  private setupCleanupHandlers(): void {
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception in plugin system:', error);
      this.shutdown();
    });
  }
}

// Supporting interfaces and enums

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

export enum PluginState {
  LOADING = 'loading',
  LOADED = 'loaded',
  ACTIVATING = 'activating',
  ACTIVE = 'active',
  DEACTIVATING = 'deactivating',
  ERROR = 'error',
  UNLOADING = 'unloading'
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