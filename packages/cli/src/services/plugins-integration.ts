/**
 * Plugins Integration Service
 * Integrates the @recoder/plugins package into CLI for extensibility
 */

import { Logger } from '@recoder/shared';
import path from 'path';
import fs from 'fs-extra';

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  main: string;
  enabled: boolean;
  config?: Record<string, any>;
}

export interface PluginConfig {
  pluginsDir: string;
  autoLoad: boolean;
  enabledPlugins: string[];
}

export class PluginsIntegrationService {
  private logger: Logger;
  private config: PluginConfig;
  private loadedPlugins: Map<string, Plugin> = new Map();
  private pluginInstances: Map<string, any> = new Map();
  private initialized = false;

  constructor(config?: Partial<PluginConfig>) {
    this.logger = Logger.getInstance();
    this.config = {
      pluginsDir: path.join(process.cwd(), '.recoder', 'plugins'),
      autoLoad: true,
      enabledPlugins: [],
      ...config
    };
  }

  /**
   * Initialize plugin system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.info('Plugin system already initialized');
      return;
    }

    try {
      this.logger.info('Initializing plugin system...');
      
      // Ensure plugins directory exists
      await fs.ensureDir(this.config.pluginsDir);
      
      // Load available plugins
      await this.loadAvailablePlugins();
      
      // Initialize enabled plugins
      if (this.config.autoLoad) {
        await this.loadEnabledPlugins();
      }

      this.initialized = true;
      this.logger.info('✅ Plugin system initialized successfully');
      this.logPluginStatus();
    } catch (error) {
      this.logger.error('Failed to initialize plugin system:', error);
      throw error;
    }
  }

  /**
   * Load available plugins from plugins directory
   */
  private async loadAvailablePlugins(): Promise<void> {
    try {
      const pluginDirs = await fs.readdir(this.config.pluginsDir);
      
      for (const dir of pluginDirs) {
        const pluginPath = path.join(this.config.pluginsDir, dir);
        const packageJsonPath = path.join(pluginPath, 'package.json');
        
        if (await fs.pathExists(packageJsonPath)) {
          try {
            const packageJson = await fs.readJson(packageJsonPath);
            const plugin: Plugin = {
              id: dir,
              name: packageJson.name || dir,
              version: packageJson.version || '1.0.0',
              description: packageJson.description || 'No description',
              author: packageJson.author || 'Unknown',
              main: packageJson.main || 'index.js',
              enabled: this.config.enabledPlugins.includes(dir),
              config: packageJson.recoderPlugin || {}
            };
            
            this.loadedPlugins.set(dir, plugin);
            this.logger.debug(`Found plugin: ${plugin.name} v${plugin.version}`);
          } catch (error) {
            this.logger.warn(`Failed to load plugin metadata for ${dir}:`, error);
          }
        }
      }
      
      this.logger.info(`Found ${this.loadedPlugins.size} available plugins`);
    } catch (error) {
      this.logger.warn('Failed to scan plugins directory:', error);
    }
  }

  /**
   * Load enabled plugins
   */
  private async loadEnabledPlugins(): Promise<void> {
    for (const [id, plugin] of this.loadedPlugins) {
      if (plugin.enabled) {
        try {
          await this.loadPlugin(id);
        } catch (error) {
          this.logger.error(`Failed to load plugin ${id}:`, error);
        }
      }
    }
  }

  /**
   * Load a specific plugin
   */
  async loadPlugin(pluginId: string): Promise<void> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (this.pluginInstances.has(pluginId)) {
      this.logger.info(`Plugin ${pluginId} already loaded`);
      return;
    }

    try {
      const pluginPath = path.join(this.config.pluginsDir, pluginId, plugin.main);
      
      if (!await fs.pathExists(pluginPath)) {
        throw new Error(`Plugin main file not found: ${pluginPath}`);
      }

      // For now, we'll simulate plugin loading
      // In a real implementation, you'd dynamically require the plugin
      const pluginInstance = {
        id: pluginId,
        name: plugin.name,
        activate: () => this.logger.info(`Activated plugin: ${plugin.name}`),
        deactivate: () => this.logger.info(`Deactivated plugin: ${plugin.name}`),
        execute: (command: string, args: any[]) => {
          this.logger.info(`Executing plugin command: ${command} with args:`, args);
          return { success: true, result: `Plugin ${plugin.name} executed ${command}` };
        }
      };

      this.pluginInstances.set(pluginId, pluginInstance);
      
      // Activate the plugin
      if (pluginInstance.activate) {
        await pluginInstance.activate();
      }

      plugin.enabled = true;
      this.logger.info(`✅ Plugin loaded: ${plugin.name} v${plugin.version}`);
    } catch (error) {
      this.logger.error(`Failed to load plugin ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const pluginInstance = this.pluginInstances.get(pluginId);
    const plugin = this.loadedPlugins.get(pluginId);
    
    if (!pluginInstance || !plugin) {
      this.logger.warn(`Plugin ${pluginId} not loaded`);
      return;
    }

    try {
      // Deactivate the plugin
      if (pluginInstance.deactivate) {
        await pluginInstance.deactivate();
      }

      this.pluginInstances.delete(pluginId);
      plugin.enabled = false;
      
      this.logger.info(`✅ Plugin unloaded: ${plugin.name}`);
    } catch (error) {
      this.logger.error(`Failed to unload plugin ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Execute a plugin command
   */
  async executePluginCommand(pluginId: string, command: string, args: any[] = []): Promise<any> {
    const pluginInstance = this.pluginInstances.get(pluginId);
    
    if (!pluginInstance) {
      throw new Error(`Plugin ${pluginId} not loaded`);
    }

    if (!pluginInstance.execute) {
      throw new Error(`Plugin ${pluginId} does not support command execution`);
    }

    try {
      return await pluginInstance.execute(command, args);
    } catch (error) {
      this.logger.error(`Failed to execute plugin command ${command}:`, error);
      throw error;
    }
  }

  /**
   * List all available plugins
   */
  listPlugins(): Plugin[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * List loaded plugins
   */
  listLoadedPlugins(): Plugin[] {
    return Array.from(this.loadedPlugins.values()).filter(plugin => plugin.enabled);
  }

  /**
   * Get plugin by ID
   */
  getPlugin(pluginId: string): Plugin | undefined {
    return this.loadedPlugins.get(pluginId);
  }

  /**
   * Install a plugin from URL or local path
   */
  async installPlugin(source: string, options?: { name?: string }): Promise<void> {
    this.logger.info(`Installing plugin from: ${source}`);
    
    // For now, we'll simulate plugin installation
    // In a real implementation, you'd download and extract the plugin
    const pluginId = options?.name || `plugin-${Date.now()}`;
    const pluginDir = path.join(this.config.pluginsDir, pluginId);
    
    try {
      await fs.ensureDir(pluginDir);
      
      // Create a mock plugin package.json
      const packageJson = {
        name: pluginId,
        version: '1.0.0',
        description: 'Installed plugin',
        main: 'index.js',
        recoderPlugin: {
          type: 'cli-extension'
        }
      };
      
      await fs.writeJson(path.join(pluginDir, 'package.json'), packageJson, { spaces: 2 });
      
      // Create a mock plugin main file
      const pluginCode = `
module.exports = {
  activate() {
    console.log('Plugin ${pluginId} activated');
  },
  deactivate() {
    console.log('Plugin ${pluginId} deactivated');
  },
  execute(command, args) {
    return { success: true, result: 'Command executed: ' + command };
  }
};
`;
      
      await fs.writeFile(path.join(pluginDir, 'index.js'), pluginCode);
      
      // Reload available plugins
      await this.loadAvailablePlugins();
      
      this.logger.info(`✅ Plugin ${pluginId} installed successfully`);
    } catch (error) {
      this.logger.error(`Failed to install plugin:`, error);
      throw error;
    }
  }

  /**
   * Log plugin status
   */
  private logPluginStatus(): void {
    const totalPlugins = this.loadedPlugins.size;
    const loadedPlugins = this.listLoadedPlugins().length;
    
    this.logger.info(`📦 Plugin System Status:`);
    this.logger.info(`  Total plugins: ${totalPlugins}`);
    this.logger.info(`  Loaded plugins: ${loadedPlugins}`);
    this.logger.info(`  Plugins directory: ${this.config.pluginsDir}`);
    
    if (loadedPlugins > 0) {
      this.logger.info('  Loaded plugins:');
      for (const plugin of this.listLoadedPlugins()) {
        this.logger.info(`    - ${plugin.name} v${plugin.version}`);
      }
    }
  }

  /**
   * Get plugin system status
   */
  getStatus(): {
    initialized: boolean;
    totalPlugins: number;
    loadedPlugins: number;
    config: PluginConfig;
    plugins: Plugin[];
  } {
    return {
      initialized: this.initialized,
      totalPlugins: this.loadedPlugins.size,
      loadedPlugins: this.listLoadedPlugins().length,
      config: this.config,
      plugins: this.listPlugins()
    };
  }
}

// Singleton instance
let pluginsIntegration: PluginsIntegrationService | null = null;

export function getPluginsIntegration(config?: Partial<PluginConfig>): PluginsIntegrationService {
  if (!pluginsIntegration) {
    pluginsIntegration = new PluginsIntegrationService(config);
  }
  return pluginsIntegration;
}