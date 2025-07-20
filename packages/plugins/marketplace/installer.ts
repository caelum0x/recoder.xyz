/**
 * Automated plugin installation and management for the Craft Code marketplace
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as tar from 'tar';
import * as semver from 'semver';
import {
  PluginMetadata,
  PluginManifest,
  PluginInstallOptions,
  PluginDependency,
  PluginError,
  PluginErrorCode
} from '../plugin-sdk/types';
import { PluginLifecycleManager } from '../plugin-sdk/lifecycle';

export class PluginInstaller extends EventEmitter {
  private installQueue: Map<string, InstallTask> = new Map();
  private activeInstalls: Map<string, InstallProgress> = new Map();
  private installedPlugins: Map<string, InstalledPlugin> = new Map();
  
  constructor(
    private config: InstallerConfig,
    private lifecycleManager: PluginLifecycleManager,
    private storage: InstallerStorage
  ) {
    super();
    this.loadInstalledPlugins();
  }

  /**
   * Install a plugin with dependencies
   */
  async installPlugin(
    pluginId: string,
    options: PluginInstallOptions = {}
  ): Promise<InstallResult> {
    const { version, force = false, skipDependencies = false, dev = false } = options;

    try {
      // Check if already installed
      const installed = this.installedPlugins.get(pluginId);
      if (installed && !force) {
        if (!version || semver.satisfies(installed.version, version)) {
          return {
            success: true,
            pluginId,
            version: installed.version,
            action: 'already_installed',
            dependencies: []
          };
        }
      }

      // Create install task
      const task: InstallTask = {
        id: this.generateTaskId(),
        pluginId,
        targetVersion: version,
        options,
        status: InstallStatus.QUEUED,
        createdAt: new Date(),
        dependencies: []
      };

      this.installQueue.set(task.id, task);
      
      // Start installation
      const result = await this.executeInstall(task);
      
      this.installQueue.delete(task.id);
      return result;

    } catch (error) {
      this.handleInstallError(pluginId, error);
      throw error;
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(
    pluginId: string,
    options: UninstallOptions = {}
  ): Promise<UninstallResult> {
    const { force = false, removeDependencies = false } = options;

    try {
      const installed = this.installedPlugins.get(pluginId);
      if (!installed) {
        throw new PluginError(
          `Plugin ${pluginId} is not installed`,
          pluginId,
          PluginErrorCode.RUNTIME_ERROR
        );
      }

      // Check for dependent plugins
      if (!force) {
        const dependents = await this.findDependentPlugins(pluginId);
        if (dependents.length > 0) {
          throw new PluginError(
            `Cannot uninstall ${pluginId}: required by ${dependents.join(', ')}`,
            pluginId,
            PluginErrorCode.RUNTIME_ERROR
          );
        }
      }

      this.emit('uninstallStarted', { pluginId });

      // Deactivate and unload plugin
      await this.lifecycleManager.deactivatePlugin(pluginId);
      await this.lifecycleManager.unloadPlugin(pluginId);

      // Remove plugin files
      const pluginDir = path.join(this.config.pluginsDirectory, pluginId);
      await fs.rmdir(pluginDir, { recursive: true });

      // Update installed plugins list
      this.installedPlugins.delete(pluginId);
      await this.storage.removeInstalledPlugin(pluginId);

      // Remove dependencies if requested
      const removedDependencies: string[] = [];
      if (removeDependencies) {
        for (const depId of installed.dependencies) {
          const canRemove = await this.canRemoveDependency(depId, pluginId);
          if (canRemove) {
            try {
              await this.uninstallPlugin(depId, { force: true });
              removedDependencies.push(depId);
            } catch (error) {
              console.warn(`Failed to remove dependency ${depId}:`, error);
            }
          }
        }
      }

      this.emit('uninstallCompleted', { 
        pluginId, 
        removedDependencies 
      });

      return {
        success: true,
        pluginId,
        removedDependencies
      };

    } catch (error) {
      this.emit('uninstallFailed', { pluginId, error: error.message });
      throw error;
    }
  }

  /**
   * Update a plugin to the latest version
   */
  async updatePlugin(
    pluginId: string,
    targetVersion?: string
  ): Promise<InstallResult> {
    const installed = this.installedPlugins.get(pluginId);
    if (!installed) {
      throw new PluginError(
        `Plugin ${pluginId} is not installed`,
        pluginId,
        PluginErrorCode.RUNTIME_ERROR
      );
    }

    // Install new version (this will replace the old one)
    return await this.installPlugin(pluginId, {
      version: targetVersion,
      force: true
    });
  }

  /**
   * Update all installed plugins
   */
  async updateAllPlugins(): Promise<UpdateAllResult> {
    const results: UpdateResult[] = [];
    const installed = Array.from(this.installedPlugins.values());

    for (const plugin of installed) {
      try {
        const metadata = await this.fetchPluginMetadata(plugin.id);
        if (metadata && semver.gt(metadata.version, plugin.version)) {
          const result = await this.updatePlugin(plugin.id);
          results.push({
            pluginId: plugin.id,
            success: result.success,
            fromVersion: plugin.version,
            toVersion: result.version,
            error: result.success ? undefined : 'Update failed'
          });
        } else {
          results.push({
            pluginId: plugin.id,
            success: true,
            fromVersion: plugin.version,
            toVersion: plugin.version,
            upToDate: true
          });
        }
      } catch (error) {
        results.push({
          pluginId: plugin.id,
          success: false,
          fromVersion: plugin.version,
          toVersion: plugin.version,
          error: error.message
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      total: results.length,
      successful,
      failed,
      results
    };
  }

  /**
   * Get installation progress
   */
  getInstallProgress(taskId: string): InstallProgress | null {
    return this.activeInstalls.get(taskId) || null;
  }

  /**
   * List all active installation tasks
   */
  getActiveInstalls(): InstallProgress[] {
    return Array.from(this.activeInstalls.values());
  }

  /**
   * List installed plugins
   */
  getInstalledPlugins(): InstalledPlugin[] {
    return Array.from(this.installedPlugins.values());
  }

  /**
   * Check if a plugin is installed
   */
  isPluginInstalled(pluginId: string): boolean {
    return this.installedPlugins.has(pluginId);
  }

  /**
   * Get installed plugin information
   */
  getInstalledPlugin(pluginId: string): InstalledPlugin | null {
    return this.installedPlugins.get(pluginId) || null;
  }

  /**
   * Cancel an active installation
   */
  async cancelInstall(taskId: string): Promise<void> {
    const progress = this.activeInstalls.get(taskId);
    if (progress) {
      progress.cancelled = true;
      progress.status = InstallStatus.CANCELLED;
      
      this.emit('installCancelled', { taskId, pluginId: progress.pluginId });
    }
  }

  /**
   * Verify plugin integrity
   */
  async verifyPlugin(pluginId: string): Promise<VerificationResult> {
    const installed = this.installedPlugins.get(pluginId);
    if (!installed) {
      return {
        valid: false,
        errors: ['Plugin not installed']
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check plugin directory exists
      const pluginDir = path.join(this.config.pluginsDirectory, pluginId);
      const exists = await fs.access(pluginDir).then(() => true).catch(() => false);
      if (!exists) {
        errors.push('Plugin directory not found');
        return { valid: false, errors, warnings };
      }

      // Verify manifest
      const manifestPath = path.join(pluginDir, 'package.json');
      const manifestExists = await fs.access(manifestPath).then(() => true).catch(() => false);
      if (!manifestExists) {
        errors.push('Plugin manifest missing');
      } else {
        try {
          const manifestContent = await fs.readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestContent) as PluginManifest;
          
          if (manifest.version !== installed.version) {
            warnings.push(`Version mismatch: expected ${installed.version}, found ${manifest.version}`);
          }
        } catch (error) {
          errors.push('Invalid manifest file');
        }
      }

      // Verify main entry point
      const mainPath = path.join(pluginDir, installed.main || 'index.js');
      const mainExists = await fs.access(mainPath).then(() => true).catch(() => false);
      if (!mainExists) {
        errors.push('Main entry point not found');
      }

      // Verify dependencies
      for (const depId of installed.dependencies) {
        if (!this.installedPlugins.has(depId)) {
          errors.push(`Missing dependency: ${depId}`);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      return {
        valid: false,
        errors: [`Verification failed: ${error.message}`]
      };
    }
  }

  /**
   * Clean up corrupted installations
   */
  async cleanup(): Promise<CleanupResult> {
    const results: CleanupResult = {
      removedPlugins: [],
      repairedPlugins: [],
      errors: []
    };

    for (const [pluginId, installed] of this.installedPlugins) {
      try {
        const verification = await this.verifyPlugin(pluginId);
        
        if (!verification.valid) {
          if (verification.errors.some(e => e.includes('not found'))) {
            // Plugin files missing - remove from installed list
            this.installedPlugins.delete(pluginId);
            await this.storage.removeInstalledPlugin(pluginId);
            results.removedPlugins.push(pluginId);
          } else {
            // Try to repair
            try {
              await this.repairPlugin(pluginId);
              results.repairedPlugins.push(pluginId);
            } catch (repairError) {
              results.errors.push(`Failed to repair ${pluginId}: ${repairError.message}`);
            }
          }
        }
      } catch (error) {
        results.errors.push(`Failed to verify ${pluginId}: ${error.message}`);
      }
    }

    return results;
  }

  // Private methods

  private async executeInstall(task: InstallTask): Promise<InstallResult> {
    const progress: InstallProgress = {
      taskId: task.id,
      pluginId: task.pluginId,
      status: InstallStatus.DOWNLOADING,
      progress: 0,
      currentStep: 'Fetching plugin metadata',
      startedAt: new Date(),
      cancelled: false
    };

    this.activeInstalls.set(task.id, progress);
    this.emit('installStarted', { taskId: task.id, pluginId: task.pluginId });

    try {
      // Fetch plugin metadata
      const metadata = await this.fetchPluginMetadata(task.pluginId);
      if (!metadata) {
        throw new PluginError(
          `Plugin ${task.pluginId} not found`,
          task.pluginId,
          PluginErrorCode.RUNTIME_ERROR
        );
      }

      // Determine version to install
      const targetVersion = task.targetVersion || metadata.version;
      if (!semver.valid(targetVersion)) {
        throw new PluginError(
          `Invalid version: ${targetVersion}`,
          task.pluginId,
          PluginErrorCode.VERSION_INCOMPATIBLE
        );
      }

      progress.targetVersion = targetVersion;
      progress.progress = 10;

      // Resolve dependencies
      if (!task.options.skipDependencies) {
        progress.currentStep = 'Resolving dependencies';
        task.dependencies = await this.resolveDependencies(metadata);
        progress.progress = 20;

        // Install dependencies first
        for (let i = 0; i < task.dependencies.length; i++) {
          if (progress.cancelled) throw new Error('Installation cancelled');
          
          const dep = task.dependencies[i];
          progress.currentStep = `Installing dependency ${dep.name}`;
          
          if (!this.installedPlugins.has(dep.name)) {
            await this.installPlugin(dep.name, {
              version: dep.version,
              skipDependencies: false
            });
          }
          
          progress.progress = 20 + (i + 1) / task.dependencies.length * 30;
        }
      }

      // Download plugin
      progress.currentStep = 'Downloading plugin';
      progress.status = InstallStatus.DOWNLOADING;
      const packagePath = await this.downloadPlugin(task.pluginId, targetVersion, progress);
      progress.progress = 70;

      if (progress.cancelled) throw new Error('Installation cancelled');

      // Extract plugin
      progress.currentStep = 'Extracting plugin';
      progress.status = InstallStatus.EXTRACTING;
      const pluginDir = await this.extractPlugin(packagePath, task.pluginId);
      progress.progress = 80;

      // Validate plugin
      progress.currentStep = 'Validating plugin';
      await this.validatePluginInstallation(pluginDir, metadata);
      progress.progress = 90;

      // Register as installed
      progress.currentStep = 'Finalizing installation';
      await this.registerInstalledPlugin(task.pluginId, targetVersion, metadata, task.dependencies);
      
      // Load plugin
      await this.lifecycleManager.loadPlugin(pluginDir);

      progress.status = InstallStatus.COMPLETED;
      progress.progress = 100;
      progress.completedAt = new Date();

      this.emit('installCompleted', {
        taskId: task.id,
        pluginId: task.pluginId,
        version: targetVersion
      });

      return {
        success: true,
        pluginId: task.pluginId,
        version: targetVersion,
        action: 'installed',
        dependencies: task.dependencies.map(d => d.name)
      };

    } catch (error) {
      progress.status = InstallStatus.FAILED;
      progress.error = error.message;
      progress.completedAt = new Date();

      this.emit('installFailed', {
        taskId: task.id,
        pluginId: task.pluginId,
        error: error.message
      });

      throw error;
    } finally {
      this.activeInstalls.delete(task.id);
    }
  }

  private async fetchPluginMetadata(pluginId: string): Promise<PluginMetadata | null> {
    try {
      const response = await fetch(`${this.config.registryUrl}/plugins/${pluginId}`);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error(`Failed to fetch metadata for ${pluginId}:`, error);
      return null;
    }
  }

  private async resolveDependencies(metadata: PluginMetadata): Promise<PluginDependency[]> {
    const dependencies: PluginDependency[] = [];
    
    if (metadata.dependencies) {
      for (const [name, version] of Object.entries(metadata.dependencies)) {
        dependencies.push({
          name,
          version,
          type: 'plugin',
          optional: false
        });
      }
    }

    return dependencies;
  }

  private async downloadPlugin(
    pluginId: string, 
    version: string, 
    progress: InstallProgress
  ): Promise<string> {
    const downloadUrl = `${this.config.registryUrl}/plugins/${pluginId}/download/${version}`;
    const packagePath = path.join(this.config.tempDirectory, `${pluginId}-${version}.tgz`);

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    const totalSize = parseInt(response.headers.get('content-length') || '0');
    let downloadedSize = 0;

    const fileStream = await fs.open(packagePath, 'w');
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error('Failed to get response reader');
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (progress.cancelled) {
          throw new Error('Download cancelled');
        }

        await fileStream.write(value);
        downloadedSize += value.length;

        if (totalSize > 0) {
          const downloadProgress = (downloadedSize / totalSize) * 20; // 20% of total progress
          progress.progress = 50 + downloadProgress;
        }
      }
    } finally {
      await fileStream.close();
      reader.releaseLock();
    }

    return packagePath;
  }

  private async extractPlugin(packagePath: string, pluginId: string): Promise<string> {
    const pluginDir = path.join(this.config.pluginsDirectory, pluginId);
    
    // Remove existing directory if it exists
    try {
      await fs.rmdir(pluginDir, { recursive: true });
    } catch (error) {
      // Directory might not exist
    }

    // Create plugin directory
    await fs.mkdir(pluginDir, { recursive: true });

    // Extract tarball
    await tar.extract({
      file: packagePath,
      cwd: pluginDir,
      strip: 1 // Remove the top-level directory from the archive
    });

    // Clean up package file
    try {
      await fs.unlink(packagePath);
    } catch (error) {
      console.warn(`Failed to clean up package file ${packagePath}:`, error);
    }

    return pluginDir;
  }

  private async validatePluginInstallation(
    pluginDir: string, 
    metadata: PluginMetadata
  ): Promise<void> {
    // Check that required files exist
    const manifestPath = path.join(pluginDir, 'package.json');
    const manifestExists = await fs.access(manifestPath).then(() => true).catch(() => false);
    
    if (!manifestExists) {
      throw new Error('Plugin manifest (package.json) not found');
    }

    // Validate manifest
    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent) as PluginManifest;

    if (!manifest.craftCodePlugin) {
      throw new Error('Invalid plugin: missing craftCodePlugin section in manifest');
    }

    // Check main entry point
    const mainPath = path.join(pluginDir, manifest.main);
    const mainExists = await fs.access(mainPath).then(() => true).catch(() => false);
    
    if (!mainExists) {
      throw new Error(`Main entry point not found: ${manifest.main}`);
    }
  }

  private async registerInstalledPlugin(
    pluginId: string,
    version: string,
    metadata: PluginMetadata,
    dependencies: PluginDependency[]
  ): Promise<void> {
    const installed: InstalledPlugin = {
      id: pluginId,
      version,
      name: metadata.name,
      author: metadata.author,
      description: metadata.description,
      main: 'index.js', // Would be read from manifest
      dependencies: dependencies.map(d => d.name),
      installedAt: new Date(),
      size: 0 // Would be calculated
    };

    this.installedPlugins.set(pluginId, installed);
    await this.storage.saveInstalledPlugin(installed);
  }

  private async findDependentPlugins(pluginId: string): Promise<string[]> {
    const dependents: string[] = [];
    
    for (const [id, plugin] of this.installedPlugins) {
      if (plugin.dependencies.includes(pluginId)) {
        dependents.push(id);
      }
    }
    
    return dependents;
  }

  private async canRemoveDependency(dependencyId: string, requesterPluginId: string): Promise<boolean> {
    const dependents = await this.findDependentPlugins(dependencyId);
    return dependents.length === 1 && dependents[0] === requesterPluginId;
  }

  private async repairPlugin(pluginId: string): Promise<void> {
    // Attempt to reinstall the plugin
    const installed = this.installedPlugins.get(pluginId);
    if (installed) {
      await this.installPlugin(pluginId, {
        version: installed.version,
        force: true
      });
    }
  }

  private async loadInstalledPlugins(): Promise<void> {
    try {
      const installed = await this.storage.getInstalledPlugins();
      for (const plugin of installed) {
        this.installedPlugins.set(plugin.id, plugin);
      }
      console.log(`Loaded ${installed.length} installed plugins`);
    } catch (error) {
      console.error('Failed to load installed plugins:', error);
    }
  }

  private generateTaskId(): string {
    return `install_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleInstallError(pluginId: string, error: any): void {
    console.error(`Installation failed for ${pluginId}:`, error);
    this.emit('installError', { pluginId, error: error.message });
  }
}

// Supporting interfaces and types

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
  progress: number; // 0-100
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

export enum InstallStatus {
  QUEUED = 'queued',
  DOWNLOADING = 'downloading',
  EXTRACTING = 'extracting',
  INSTALLING = 'installing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
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