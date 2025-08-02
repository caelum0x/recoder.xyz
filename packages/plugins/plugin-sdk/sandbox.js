"use strict";
/**
 * Secure plugin execution sandbox for the Craft Code extensibility framework
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
exports.SandboxState = exports.PluginSandbox = void 0;
const worker_threads_1 = require("worker_threads");
const vm_1 = require("vm");
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const types_1 = require("./types");
class PluginSandbox {
    constructor(config) {
        this.config = config;
        this.workers = new Map();
        this.contexts = new Map();
        this.resourceMonitor = new ResourceMonitor();
        this.setupMonitoring();
    }
    /**
     * Create a sandbox context for a plugin
     */
    async createContext(plugin) {
        const context = {
            id: plugin.id,
            worker: null,
            vmContext: null,
            resourceUsage: {
                memoryMB: 0,
                cpuPercent: 0,
                networkRequests: 0,
                fileOperations: 0,
                startTime: Date.now()
            },
            security: plugin.security,
            config: plugin.security.sandboxConfig,
            state: SandboxState.CREATING
        };
        try {
            if (this.shouldUseWorkerThread(plugin.security)) {
                context.worker = await this.createWorker(plugin);
                context.state = SandboxState.WORKER;
            }
            else {
                context.vmContext = await this.createVMContext(plugin);
                context.state = SandboxState.VM;
            }
            this.contexts.set(plugin.id, context);
            this.resourceMonitor.addContext(context);
            return context;
        }
        catch (error) {
            context.state = SandboxState.ERROR;
            throw new types_1.PluginError(`Failed to create sandbox context: ${error.message}`, plugin.id, types_1.PluginErrorCode.SANDBOX_VIOLATION, error);
        }
    }
    /**
     * Execute code in plugin sandbox
     */
    async execute(plugin, code) {
        const context = this.contexts.get(plugin.id);
        if (!context) {
            throw new types_1.PluginError('Sandbox context not found', plugin.id, types_1.PluginErrorCode.SANDBOX_VIOLATION);
        }
        const startTime = Date.now();
        const timeout = context.config.timeoutMs;
        try {
            let result;
            if (context.worker) {
                result = await this.executeInWorker(context, code, timeout);
            }
            else if (context.vmContext) {
                result = await this.executeInVM(context, code, timeout);
            }
            else {
                // Direct execution with monitoring
                result = await this.executeWithMonitoring(context, code, timeout);
            }
            // Update resource usage
            context.resourceUsage.executionTime = Date.now() - startTime;
            this.resourceMonitor.updateUsage(context);
            return result;
        }
        catch (error) {
            this.handleSandboxError(plugin.id, error);
            throw error;
        }
    }
    /**
     * Destroy sandbox context
     */
    async destroyContext(plugin) {
        const context = this.contexts.get(plugin.id);
        if (!context)
            return;
        try {
            if (context.worker) {
                await context.worker.terminate();
            }
            this.resourceMonitor.removeContext(context);
            this.contexts.delete(plugin.id);
            this.workers.delete(plugin.id);
            context.state = SandboxState.DESTROYED;
        }
        catch (error) {
            console.error(`Error destroying sandbox context for ${plugin.id}:`, error);
        }
    }
    /**
     * Cleanup all sandbox contexts
     */
    async cleanup() {
        const cleanupPromises = Array.from(this.contexts.keys()).map(async (pluginId) => {
            const context = this.contexts.get(pluginId);
            if (context?.worker) {
                try {
                    await context.worker.terminate();
                }
                catch (error) {
                    console.error(`Error terminating worker for ${pluginId}:`, error);
                }
            }
        });
        await Promise.allSettled(cleanupPromises);
        this.contexts.clear();
        this.workers.clear();
        this.resourceMonitor.cleanup();
    }
    /**
     * Get resource usage for a plugin
     */
    getResourceUsage(pluginId) {
        const context = this.contexts.get(pluginId);
        return context?.resourceUsage || null;
    }
    /**
     * Check if plugin is within resource limits
     */
    isWithinLimits(pluginId) {
        const context = this.contexts.get(pluginId);
        if (!context)
            return false;
        const usage = context.resourceUsage;
        const limits = context.config;
        return (usage.memoryMB <= limits.memoryLimitMB &&
            usage.cpuPercent <= limits.cpuLimitPercent);
    }
    // Private methods
    shouldUseWorkerThread(security) {
        // Use worker threads for plugins that need network/file access
        return (security.sandboxConfig.allowNetworkAccess ||
            security.sandboxConfig.allowFileSystemAccess ||
            security.sandboxConfig.allowShellAccess);
    }
    async createWorker(plugin) {
        const workerScript = await this.generateWorkerScript(plugin);
        const workerPath = path.join(__dirname, 'sandbox-worker.js');
        // Write worker script to temporary file
        await fs.writeFile(workerPath, workerScript);
        const worker = new worker_threads_1.Worker(workerPath, {
            workerData: {
                pluginId: plugin.id,
                security: plugin.security,
                config: plugin.context.config
            }
        });
        // Set up worker communication
        worker.on('error', (error) => {
            this.handleSandboxError(plugin.id, error);
        });
        worker.on('exit', (code) => {
            if (code !== 0) {
                this.handleSandboxError(plugin.id, new Error(`Worker exited with code ${code}`));
            }
        });
        return worker;
    }
    async createVMContext(plugin) {
        const sandbox = this.createSecureSandbox(plugin);
        const context = (0, vm_1.createContext)(sandbox);
        // Initialize plugin environment
        const initScript = new vm_1.Script(`
      const plugin = require('${plugin.path}');
      global.__plugin = plugin;
    `);
        (0, vm_1.runInContext)(initScript, context);
        return context;
    }
    createSecureSandbox(plugin) {
        const security = plugin.security;
        const sandbox = {
            console: this.createSecureConsole(plugin.id),
            Buffer,
            process: this.createSecureProcess(security),
            require: this.createSecureRequire(plugin.path, security),
            setTimeout,
            setInterval,
            clearTimeout,
            clearInterval,
            setImmediate,
            clearImmediate
        };
        // Add allowed globals based on security config
        if (security.sandboxConfig.allowNetworkAccess) {
            sandbox.fetch = this.createSecureFetch(security);
        }
        if (security.sandboxConfig.allowFileSystemAccess) {
            sandbox.fs = this.createSecureFS(security);
        }
        return sandbox;
    }
    createSecureConsole(pluginId) {
        return {
            log: (...args) => console.log(`[${pluginId}]`, ...args),
            error: (...args) => console.error(`[${pluginId}]`, ...args),
            warn: (...args) => console.warn(`[${pluginId}]`, ...args),
            info: (...args) => console.info(`[${pluginId}]`, ...args),
            debug: (...args) => console.debug(`[${pluginId}]`, ...args)
        };
    }
    createSecureProcess(security) {
        return {
            env: {}, // Empty environment for security
            argv: [],
            version: process.version,
            platform: process.platform,
            arch: process.arch,
            pid: process.pid,
            cwd: () => process.cwd(),
            exit: security.sandboxConfig.allowShellAccess ? process.exit : undefined,
            nextTick: process.nextTick
        };
    }
    createSecureRequire(pluginPath, security) {
        const allowedModules = [
            'path', 'util', 'crypto', 'url', 'querystring', 'events',
            'stream', 'buffer', 'string_decoder', 'timers'
        ];
        if (security.sandboxConfig.allowNetworkAccess) {
            allowedModules.push('http', 'https', 'net', 'tls', 'dns');
        }
        if (security.sandboxConfig.allowFileSystemAccess) {
            allowedModules.push('fs', 'os');
        }
        return ((moduleId) => {
            // Allow relative requires from plugin directory
            if (moduleId.startsWith('.')) {
                return require(path.resolve(pluginPath, moduleId));
            }
            // Check allowed modules
            if (!allowedModules.includes(moduleId)) {
                throw new Error(`Module '${moduleId}' is not allowed in sandbox`);
            }
            return require(moduleId);
        });
    }
    createSecureFetch(security) {
        return async (input, init) => {
            const url = typeof input === 'string' ? input : input.toString();
            // Check allowed domains
            if (security.trustedDomains) {
                const urlObj = new URL(url);
                const allowed = security.trustedDomains.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`));
                if (!allowed) {
                    throw new Error(`Network access to ${urlObj.hostname} is not allowed`);
                }
            }
            return fetch(input, init);
        };
    }
    createSecureFS(security) {
        const fs = require('fs');
        const allowedPaths = security.sandboxConfig.allowedPaths || [];
        const isPathAllowed = (filePath) => {
            const resolved = path.resolve(filePath);
            return allowedPaths.some(allowedPath => resolved.startsWith(path.resolve(allowedPath)));
        };
        return new Proxy(fs, {
            get(target, prop) {
                const original = target[prop];
                if (typeof original !== 'function')
                    return original;
                return new Proxy(original, {
                    apply(fn, thisArg, args) {
                        // Check path access for file operations
                        const filePath = args[0];
                        if (typeof filePath === 'string' && !isPathAllowed(filePath)) {
                            throw new Error(`File access to ${filePath} is not allowed`);
                        }
                        return fn.apply(thisArg, args);
                    }
                });
            }
        });
    }
    async executeInWorker(context, code, timeout) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Execution timeout'));
            }, timeout);
            if (!context.worker) {
                clearTimeout(timer);
                reject(new Error('Worker not available'));
                return;
            }
            context.worker.postMessage({
                type: 'execute',
                code: code.toString()
            });
            context.worker.once('message', (result) => {
                clearTimeout(timer);
                if (result.error) {
                    reject(new Error(result.error));
                }
                else {
                    resolve(result.data);
                }
            });
            context.worker.once('error', (error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }
    async executeInVM(context, code, timeout) {
        const script = new vm_1.Script(`
      (async () => {
        ${code.toString()}
        return await (${code.toString()})();
      })()
    `);
        const result = (0, vm_1.runInContext)(script, context.vmContext, { timeout });
        return await result;
    }
    async executeWithMonitoring(context, code, timeout) {
        const timer = setTimeout(() => {
            throw new Error('Execution timeout');
        }, timeout);
        try {
            const result = await code();
            clearTimeout(timer);
            return result;
        }
        catch (error) {
            clearTimeout(timer);
            throw error;
        }
    }
    async generateWorkerScript(plugin) {
        return `
      const { parentPort, workerData } = require('worker_threads');
      const plugin = require('${plugin.path}');
      
      parentPort.on('message', async (message) => {
        try {
          if (message.type === 'execute') {
            const fn = eval(\`(\${message.code})\`);
            const result = await fn();
            parentPort.postMessage({ data: result });
          }
        } catch (error) {
          parentPort.postMessage({ error: error.message });
        }
      });
    `;
    }
    setupMonitoring() {
        // Set up periodic resource monitoring
        setInterval(() => {
            this.resourceMonitor.updateAll();
            this.checkResourceLimits();
        }, 1000);
    }
    checkResourceLimits() {
        for (const [pluginId, context] of this.contexts) {
            if (!this.isWithinLimits(pluginId)) {
                this.handleResourceViolation(pluginId, context);
            }
        }
    }
    handleResourceViolation(pluginId, context) {
        console.warn(`Resource limit violation for plugin ${pluginId}:`, context.resourceUsage);
        // Optionally terminate the plugin
        if (context.worker) {
            context.worker.terminate();
        }
    }
    handleSandboxError(pluginId, error) {
        console.error(`Sandbox error for plugin ${pluginId}:`, error);
    }
}
exports.PluginSandbox = PluginSandbox;
// Supporting classes and interfaces
class ResourceMonitor {
    constructor() {
        this.contexts = new Map();
    }
    addContext(context) {
        this.contexts.set(context.id, context);
    }
    removeContext(context) {
        this.contexts.delete(context.id);
    }
    updateUsage(context) {
        // Update memory and CPU usage
        if (context.worker) {
            context.worker.getHeapSnapshot?.();
        }
        // This would integrate with system monitoring tools
        // For now, using placeholder values
        context.resourceUsage.memoryMB = process.memoryUsage().heapUsed / 1024 / 1024;
        context.resourceUsage.cpuPercent = process.cpuUsage().user / 1000000;
    }
    updateAll() {
        for (const context of this.contexts.values()) {
            this.updateUsage(context);
        }
    }
    cleanup() {
        this.contexts.clear();
    }
}
var SandboxState;
(function (SandboxState) {
    SandboxState["CREATING"] = "creating";
    SandboxState["WORKER"] = "worker";
    SandboxState["VM"] = "vm";
    SandboxState["RUNNING"] = "running";
    SandboxState["ERROR"] = "error";
    SandboxState["DESTROYED"] = "destroyed";
})(SandboxState || (exports.SandboxState = SandboxState = {}));
//# sourceMappingURL=sandbox.js.map