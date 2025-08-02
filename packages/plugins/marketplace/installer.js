"use strict";
/**
 * Automated plugin installation and management for the Craft Code marketplace
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstallStatus = exports.PluginInstaller = void 0;
const events_1 = require("events");
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const tar = __importStar(require("tar"));
const semver = __importStar(require("semver"));
const types_1 = require("../plugin-sdk/types");
class PluginInstaller extends events_1.EventEmitter {
    constructor(config, lifecycleManager, storage) {
        super();
        this.config = config;
        this.lifecycleManager = lifecycleManager;
        this.storage = storage;
        this.installQueue = new Map();
        this.activeInstalls = new Map();
        this.installedPlugins = new Map();
        this.loadInstalledPlugins();
    }
    /**
     * Install a plugin with dependencies
     */
    async installPlugin(pluginId, options = {}) {
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
            const task = {
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
        }
        catch (error) {
            this.handleInstallError(pluginId, error);
            throw error;
        }
    }
    /**
     * Uninstall a plugin
     */
    async uninstallPlugin(pluginId, options = {}) {
        const { force = false, removeDependencies = false } = options;
        try {
            const installed = this.installedPlugins.get(pluginId);
            if (!installed) {
                throw new types_1.PluginError(`Plugin ${pluginId} is not installed`, pluginId, types_1.PluginErrorCode.RUNTIME_ERROR);
            }
            // Check for dependent plugins
            if (!force) {
                const dependents = await this.findDependentPlugins(pluginId);
                if (dependents.length > 0) {
                    throw new types_1.PluginError(`Cannot uninstall ${pluginId}: required by ${dependents.join(', ')}`, pluginId, types_1.PluginErrorCode.RUNTIME_ERROR);
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
            const removedDependencies = [];
            if (removeDependencies) {
                for (const depId of installed.dependencies) {
                    const canRemove = await this.canRemoveDependency(depId, pluginId);
                    if (canRemove) {
                        try {
                            await this.uninstallPlugin(depId, { force: true });
                            removedDependencies.push(depId);
                        }
                        catch (error) {
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
        }
        catch (error) {
            this.emit('uninstallFailed', { pluginId, error: error.message });
            throw error;
        }
    }
    /**
     * Update a plugin to the latest version
     */
    async updatePlugin(pluginId, targetVersion) {
        const installed = this.installedPlugins.get(pluginId);
        if (!installed) {
            throw new types_1.PluginError(`Plugin ${pluginId} is not installed`, pluginId, types_1.PluginErrorCode.RUNTIME_ERROR);
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
    async updateAllPlugins() {
        const results = [];
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
                }
                else {
                    results.push({
                        pluginId: plugin.id,
                        success: true,
                        fromVersion: plugin.version,
                        toVersion: plugin.version,
                        upToDate: true
                    });
                }
            }
            catch (error) {
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
    getInstallProgress(taskId) {
        return this.activeInstalls.get(taskId) || null;
    }
    /**
     * List all active installation tasks
     */
    getActiveInstalls() {
        return Array.from(this.activeInstalls.values());
    }
    /**
     * List installed plugins
     */
    getInstalledPlugins() {
        return Array.from(this.installedPlugins.values());
    }
    /**
     * Check if a plugin is installed
     */
    isPluginInstalled(pluginId) {
        return this.installedPlugins.has(pluginId);
    }
    /**
     * Get installed plugin information
     */
    getInstalledPlugin(pluginId) {
        return this.installedPlugins.get(pluginId) || null;
    }
    /**
     * Cancel an active installation
     */
    async cancelInstall(taskId) {
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
    async verifyPlugin(pluginId) {
        const installed = this.installedPlugins.get(pluginId);
        if (!installed) {
            return {
                valid: false,
                errors: ['Plugin not installed']
            };
        }
        const errors = [];
        const warnings = [];
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
            }
            else {
                try {
                    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
                    const manifest = JSON.parse(manifestContent);
                    if (manifest.version !== installed.version) {
                        warnings.push(`Version mismatch: expected ${installed.version}, found ${manifest.version}`);
                    }
                }
                catch (error) {
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
        }
        catch (error) {
            return {
                valid: false,
                errors: [`Verification failed: ${error.message}`]
            };
        }
    }
    /**
     * Clean up corrupted installations
     */
    async cleanup() {
        const results = {
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
                    }
                    else {
                        // Try to repair
                        try {
                            await this.repairPlugin(pluginId);
                            results.repairedPlugins.push(pluginId);
                        }
                        catch (repairError) {
                            results.errors.push(`Failed to repair ${pluginId}: ${repairError.message}`);
                        }
                    }
                }
            }
            catch (error) {
                results.errors.push(`Failed to verify ${pluginId}: ${error.message}`);
            }
        }
        return results;
    }
    // Private methods
    async executeInstall(task) {
        const progress = {
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
                throw new types_1.PluginError(`Plugin ${task.pluginId} not found`, task.pluginId, types_1.PluginErrorCode.RUNTIME_ERROR);
            }
            // Determine version to install
            const targetVersion = task.targetVersion || metadata.version;
            if (!semver.valid(targetVersion)) {
                throw new types_1.PluginError(`Invalid version: ${targetVersion}`, task.pluginId, types_1.PluginErrorCode.VERSION_INCOMPATIBLE);
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
                    if (progress.cancelled)
                        throw new Error('Installation cancelled');
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
            if (progress.cancelled)
                throw new Error('Installation cancelled');
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
        }
        catch (error) {
            progress.status = InstallStatus.FAILED;
            progress.error = error.message;
            progress.completedAt = new Date();
            this.emit('installFailed', {
                taskId: task.id,
                pluginId: task.pluginId,
                error: error.message
            });
            throw error;
        }
        finally {
            this.activeInstalls.delete(task.id);
        }
    }
    async fetchPluginMetadata(pluginId) {
        try {
            const response = await fetch(`${this.config.registryUrl}/plugins/${pluginId}`);
            if (!response.ok) {
                return null;
            }
            return await response.json();
        }
        catch (error) {
            console.error(`Failed to fetch metadata for ${pluginId}:`, error);
            return null;
        }
    }
    async resolveDependencies(metadata) {
        const dependencies = [];
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
    async downloadPlugin(pluginId, version, progress) {
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
                if (done)
                    break;
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
        }
        finally {
            await fileStream.close();
            reader.releaseLock();
        }
        return packagePath;
    }
    async extractPlugin(packagePath, pluginId) {
        const pluginDir = path.join(this.config.pluginsDirectory, pluginId);
        // Remove existing directory if it exists
        try {
            await fs.rmdir(pluginDir, { recursive: true });
        }
        catch (error) {
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
        }
        catch (error) {
            console.warn(`Failed to clean up package file ${packagePath}:`, error);
        }
        return pluginDir;
    }
    async validatePluginInstallation(pluginDir, metadata) {
        // Check that required files exist
        const manifestPath = path.join(pluginDir, 'package.json');
        const manifestExists = await fs.access(manifestPath).then(() => true).catch(() => false);
        if (!manifestExists) {
            throw new Error('Plugin manifest (package.json) not found');
        }
        // Validate manifest
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent);
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
    async registerInstalledPlugin(pluginId, version, metadata, dependencies) {
        const installed = {
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
    async findDependentPlugins(pluginId) {
        const dependents = [];
        for (const [id, plugin] of this.installedPlugins) {
            if (plugin.dependencies.includes(pluginId)) {
                dependents.push(id);
            }
        }
        return dependents;
    }
    async canRemoveDependency(dependencyId, requesterPluginId) {
        const dependents = await this.findDependentPlugins(dependencyId);
        return dependents.length === 1 && dependents[0] === requesterPluginId;
    }
    async repairPlugin(pluginId) {
        // Attempt to reinstall the plugin
        const installed = this.installedPlugins.get(pluginId);
        if (installed) {
            await this.installPlugin(pluginId, {
                version: installed.version,
                force: true
            });
        }
    }
    async loadInstalledPlugins() {
        try {
            const installed = await this.storage.getInstalledPlugins();
            for (const plugin of installed) {
                this.installedPlugins.set(plugin.id, plugin);
            }
            console.log(`Loaded ${installed.length} installed plugins`);
        }
        catch (error) {
            console.error('Failed to load installed plugins:', error);
        }
    }
    generateTaskId() {
        return `install_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    handleInstallError(pluginId, error) {
        console.error(`Installation failed for ${pluginId}:`, error);
        this.emit('installError', { pluginId, error: error.message });
    }
}
exports.PluginInstaller = PluginInstaller;
var InstallStatus;
(function (InstallStatus) {
    InstallStatus["QUEUED"] = "queued";
    InstallStatus["DOWNLOADING"] = "downloading";
    InstallStatus["EXTRACTING"] = "extracting";
    InstallStatus["INSTALLING"] = "installing";
    InstallStatus["COMPLETED"] = "completed";
    InstallStatus["FAILED"] = "failed";
    InstallStatus["CANCELLED"] = "cancelled";
})(InstallStatus || (exports.InstallStatus = InstallStatus = {}));
//# sourceMappingURL=installer.js.map