"use strict";
/**
 * Plugin lifecycle management for the Craft Code extensibility framework
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
exports.PluginErrorCode = exports.PluginError = exports.PluginState = exports.PluginLifecycleManager = void 0;
const events_1 = require("events");
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const types_1 = require("./types");
Object.defineProperty(exports, "PluginError", { enumerable: true, get: function () { return types_1.PluginError; } });
Object.defineProperty(exports, "PluginErrorCode", { enumerable: true, get: function () { return types_1.PluginErrorCode; } });
const sandbox_1 = require("./sandbox");
class PluginLifecycleManager extends events_1.EventEmitter {
    constructor(pluginDirectory, config) {
        super();
        this.pluginDirectory = pluginDirectory;
        this.config = config;
        this.plugins = new Map();
        this.activePlugins = new Set();
        this.dependencyGraph = new Map();
        this.analytics = new Map();
        this.sandbox = new sandbox_1.PluginSandbox(config.sandboxConfig);
        this.setupCleanupHandlers();
    }
    /**
     * Load and register a plugin from directory or package
     */
    async loadPlugin(pluginPath) {
        try {
            const manifest = await this.loadManifest(pluginPath);
            const security = await this.loadSecurity(pluginPath);
            // Validate plugin
            await this.validatePlugin(manifest, security);
            // Load plugin module
            const pluginModule = await this.loadPluginModule(pluginPath, manifest);
            // Create plugin context
            const context = await this.createPluginContext(manifest.name, pluginModule.metadata);
            const loadedPlugin = {
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
            });
            console.log(`Plugin loaded: ${manifest.name}@${manifest.version}`);
        }
        catch (error) {
            this.handlePluginError(pluginPath, types_1.PluginErrorCode.ACTIVATION_FAILED, error);
            throw error;
        }
    }
    /**
     * Activate a loaded plugin
     */
    async activatePlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            throw new types_1.PluginError(`Plugin not found: ${pluginId}`, pluginId, types_1.PluginErrorCode.ACTIVATION_FAILED);
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
            });
            console.log(`Plugin activated: ${pluginId}`);
        }
        catch (error) {
            plugin.state = PluginState.ERROR;
            plugin.error = error;
            this.handlePluginError(pluginId, types_1.PluginErrorCode.ACTIVATION_FAILED, error);
            throw error;
        }
    }
    /**
     * Deactivate an active plugin
     */
    async deactivatePlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            throw new types_1.PluginError(`Plugin not found: ${pluginId}`, pluginId, types_1.PluginErrorCode.DEACTIVATION_FAILED);
        }
        if (plugin.state !== PluginState.ACTIVE) {
            return; // Not active
        }
        try {
            // Check for dependent plugins
            const dependents = this.getDependentPlugins(pluginId);
            if (dependents.length > 0) {
                throw new types_1.PluginError(`Cannot deactivate plugin ${pluginId}: required by ${dependents.join(', ')}`, pluginId, types_1.PluginErrorCode.DEACTIVATION_FAILED);
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
            });
            console.log(`Plugin deactivated: ${pluginId}`);
        }
        catch (error) {
            plugin.state = PluginState.ERROR;
            plugin.error = error;
            this.handlePluginError(pluginId, types_1.PluginErrorCode.DEACTIVATION_FAILED, error);
            throw error;
        }
    }
    /**
     * Unload a plugin completely
     */
    async unloadPlugin(pluginId) {
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
            });
            console.log(`Plugin unloaded: ${pluginId}`);
        }
        catch (error) {
            this.handlePluginError(pluginId, types_1.PluginErrorCode.DEACTIVATION_FAILED, error);
            throw error;
        }
    }
    /**
     * Reload a plugin (unload and load again)
     */
    async reloadPlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            throw new types_1.PluginError(`Plugin not found: ${pluginId}`, pluginId, types_1.PluginErrorCode.RUNTIME_ERROR);
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
    getPlugin(pluginId) {
        return this.plugins.get(pluginId);
    }
    /**
     * List all loaded plugins
     */
    getPlugins() {
        return Array.from(this.plugins.values());
    }
    /**
     * List active plugins
     */
    getActivePlugins() {
        return Array.from(this.activePlugins)
            .map(id => this.plugins.get(id))
            .filter(Boolean);
    }
    /**
     * Get plugin analytics
     */
    getAnalytics(pluginId) {
        return this.analytics.get(pluginId);
    }
    /**
     * Update plugin configuration
     */
    async updatePluginConfig(pluginId, config) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            throw new types_1.PluginError(`Plugin not found: ${pluginId}`, pluginId, types_1.PluginErrorCode.CONFIGURATION_ERROR);
        }
        try {
            // Validate configuration
            await this.validateConfiguration(plugin, config);
            // Update context
            plugin.context.config = { ...plugin.context.config, ...config };
            // Notify plugin of configuration change
            if (plugin.plugin.onConfigChange && plugin.state === PluginState.ACTIVE) {
                await this.sandbox.execute(plugin, async () => {
                    await plugin.plugin.onConfigChange(config);
                });
            }
            this.emit('pluginConfigUpdated', {
                type: 'pluginConfigUpdated',
                pluginId,
                timestamp: new Date(),
                data: config
            });
        }
        catch (error) {
            this.handlePluginError(pluginId, types_1.PluginErrorCode.CONFIGURATION_ERROR, error);
            throw error;
        }
    }
    /**
     * Handle plugin events
     */
    async handlePluginEvent(pluginId, event, data) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin || plugin.state !== PluginState.ACTIVE) {
            return;
        }
        try {
            if (plugin.plugin.onCommand && event.startsWith('command:')) {
                const command = event.substring(8);
                return await this.sandbox.execute(plugin, async () => {
                    return await plugin.plugin.onCommand(command, data);
                });
            }
            // Handle other events based on plugin hooks
            const hookMap = {
                'project:open': 'onProjectOpen',
                'project:close': 'onProjectClose',
                'file:create': 'onFileCreate',
                'file:change': 'onFileChange',
                'file:delete': 'onFileDelete'
            };
            const hook = hookMap[event];
            if (hook && plugin.plugin[hook]) {
                return await this.sandbox.execute(plugin, async () => {
                    return await plugin.plugin[hook]?.(data);
                });
            }
        }
        catch (error) {
            this.handlePluginError(pluginId, types_1.PluginErrorCode.RUNTIME_ERROR, error);
            throw error;
        }
    }
    /**
     * Shutdown all plugins
     */
    async shutdown() {
        console.log('Shutting down plugin system...');
        // Deactivate all active plugins
        const activePluginIds = Array.from(this.activePlugins);
        for (const pluginId of activePluginIds) {
            try {
                await this.deactivatePlugin(pluginId);
            }
            catch (error) {
                console.error(`Error deactivating plugin ${pluginId}:`, error);
            }
        }
        // Unload all plugins
        const pluginIds = Array.from(this.plugins.keys());
        for (const pluginId of pluginIds) {
            try {
                await this.unloadPlugin(pluginId);
            }
            catch (error) {
                console.error(`Error unloading plugin ${pluginId}:`, error);
            }
        }
        // Cleanup sandbox
        await this.sandbox.cleanup();
        console.log('Plugin system shutdown complete');
    }
    // Private methods
    async loadManifest(pluginPath) {
        const manifestPath = path.join(pluginPath, 'package.json');
        try {
            const content = await fs.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(content);
            if (!manifest.craftCodePlugin) {
                throw new Error('Invalid plugin manifest: missing craftCodePlugin section');
            }
            return manifest;
        }
        catch (error) {
            throw new types_1.PluginError(`Failed to load plugin manifest: ${error.message}`, pluginPath, types_1.PluginErrorCode.INVALID_MANIFEST, error);
        }
    }
    async loadSecurity(pluginPath) {
        const securityPath = path.join(pluginPath, 'security.json');
        try {
            const content = await fs.readFile(securityPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
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
    async validatePlugin(manifest, security) {
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
    async loadPluginModule(pluginPath, manifest) {
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
        }
        catch (error) {
            throw new types_1.PluginError(`Failed to load plugin module: ${error.message}`, manifest.name, types_1.PluginErrorCode.ACTIVATION_FAILED, error);
        }
    }
    async createPluginContext(pluginId, metadata) {
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
            events: new events_1.EventEmitter()
        };
    }
    createPluginLogger(pluginId) {
        return {
            debug: (message, ...args) => {
                console.debug(`[${pluginId}] ${message}`, ...args);
            },
            info: (message, ...args) => {
                console.info(`[${pluginId}] ${message}`, ...args);
            },
            warn: (message, ...args) => {
                console.warn(`[${pluginId}] ${message}`, ...args);
            },
            error: (message, ...args) => {
                console.error(`[${pluginId}] ${message}`, ...args);
            }
        };
    }
    createPluginStorage(pluginId) {
        const storageDir = path.join(this.config.dataDirectory, 'plugins', pluginId);
        return {
            async get(key) {
                try {
                    const filePath = path.join(storageDir, `${key}.json`);
                    const content = await fs.readFile(filePath, 'utf-8');
                    return JSON.parse(content);
                }
                catch (error) {
                    return null;
                }
            },
            async set(key, value) {
                const filePath = path.join(storageDir, `${key}.json`);
                await fs.mkdir(storageDir, { recursive: true });
                await fs.writeFile(filePath, JSON.stringify(value, null, 2));
            },
            async delete(key) {
                try {
                    const filePath = path.join(storageDir, `${key}.json`);
                    await fs.unlink(filePath);
                }
                catch (error) {
                    // Ignore if file doesn't exist
                }
            },
            async clear() {
                try {
                    await fs.rmdir(storageDir, { recursive: true });
                }
                catch (error) {
                    // Ignore if directory doesn't exist
                }
            },
            async keys() {
                try {
                    const files = await fs.readdir(storageDir);
                    return files
                        .filter(file => file.endsWith('.json'))
                        .map(file => file.slice(0, -5));
                }
                catch (error) {
                    return [];
                }
            }
        };
    }
    createPluginAPI(pluginId) {
        // Implementation would depend on specific API requirements
        return {};
    }
    createWorkspaceAPI(pluginId) {
        // Implementation would depend on workspace management
        return {};
    }
    createPluginUI(pluginId) {
        // Implementation would depend on UI framework
        return {};
    }
    initializeAnalytics(pluginId) {
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
    updateAnalytics(pluginId, event) {
        const analytics = this.analytics.get(pluginId);
        if (!analytics)
            return;
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
    async activateDependencies(pluginId) {
        const dependencies = this.dependencyGraph.get(pluginId) || [];
        for (const depId of dependencies) {
            const dep = this.plugins.get(depId);
            if (!dep) {
                throw new types_1.PluginError(`Dependency not found: ${depId}`, pluginId, types_1.PluginErrorCode.DEPENDENCY_NOT_FOUND);
            }
            if (dep.state !== PluginState.ACTIVE) {
                await this.activatePlugin(depId);
            }
        }
    }
    getDependentPlugins(pluginId) {
        const dependents = [];
        for (const [pid, deps] of this.dependencyGraph) {
            if (deps.includes(pluginId) && this.activePlugins.has(pid)) {
                dependents.push(pid);
            }
        }
        return dependents;
    }
    buildDependencyGraph() {
        this.dependencyGraph.clear();
        for (const [pluginId, plugin] of this.plugins) {
            const deps = Object.keys(plugin.manifest.craftCodePlugin.metadata.dependencies || {})
                .filter(dep => this.plugins.has(dep));
            this.dependencyGraph.set(pluginId, deps);
        }
    }
    async validateConfiguration(plugin, config) {
        const schema = plugin.manifest.craftCodePlugin.configuration?.schema;
        if (!schema)
            return;
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
    async cleanupPlugin(plugin) {
        // Clean up plugin resources
        await this.sandbox.destroyContext(plugin);
        // Clean up storage if configured
        if (this.config.cleanupStorageOnUnload) {
            await plugin.context.storage.clear();
        }
    }
    handlePluginError(pluginId, code, error) {
        this.updateAnalytics(pluginId, 'error');
        this.emit('pluginError', {
            type: 'pluginError',
            pluginId,
            timestamp: new Date(),
            data: { code, error: error.message }
        });
        console.error(`Plugin error [${pluginId}]:`, error);
    }
    isVersionCompatible(required, current) {
        // Simple version comparison - in production, use semver
        return required <= current;
    }
    setupCleanupHandlers() {
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
        process.on('uncaughtException', (error) => {
            console.error('Uncaught exception in plugin system:', error);
            this.shutdown();
        });
    }
}
exports.PluginLifecycleManager = PluginLifecycleManager;
var PluginState;
(function (PluginState) {
    PluginState["LOADING"] = "loading";
    PluginState["LOADED"] = "loaded";
    PluginState["ACTIVATING"] = "activating";
    PluginState["ACTIVE"] = "active";
    PluginState["DEACTIVATING"] = "deactivating";
    PluginState["ERROR"] = "error";
    PluginState["UNLOADING"] = "unloading";
})(PluginState || (exports.PluginState = PluginState = {}));
//# sourceMappingURL=lifecycle.js.map