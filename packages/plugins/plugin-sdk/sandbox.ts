/**
 * Secure plugin execution sandbox for the Craft Code extensibility framework
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { createContext, runInContext, Script } from 'vm';
import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';
import {
  LoadedPlugin,
  PluginSecurity,
  SandboxConfig,
  PluginError,
  PluginErrorCode
} from './types';

export class PluginSandbox {
  private workers: Map<string, SandboxWorker> = new Map();
  private contexts: Map<string, SandboxContext> = new Map();
  private resourceMonitor: ResourceMonitor;

  constructor(private config: SandboxConfig) {
    this.resourceMonitor = new ResourceMonitor();
    this.setupMonitoring();
  }

  /**
   * Create a sandbox context for a plugin
   */
  async createContext(plugin: LoadedPlugin): Promise<SandboxContext> {
    const context: SandboxContext = {
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
      } else {
        context.vmContext = await this.createVMContext(plugin);
        context.state = SandboxState.VM;
      }

      this.contexts.set(plugin.id, context);
      this.resourceMonitor.addContext(context);

      return context;
    } catch (error) {
      context.state = SandboxState.ERROR;
      throw new PluginError(
        `Failed to create sandbox context: ${error.message}`,
        plugin.id,
        PluginErrorCode.SANDBOX_VIOLATION,
        error
      );
    }
  }

  /**
   * Execute code in plugin sandbox
   */
  async execute<T>(plugin: LoadedPlugin, code: () => Promise<T>): Promise<T> {
    const context = this.contexts.get(plugin.id);
    if (!context) {
      throw new PluginError(
        'Sandbox context not found',
        plugin.id,
        PluginErrorCode.SANDBOX_VIOLATION
      );
    }

    const startTime = Date.now();
    const timeout = context.config.timeoutMs;

    try {
      let result: T;

      if (context.worker) {
        result = await this.executeInWorker(context, code, timeout);
      } else if (context.vmContext) {
        result = await this.executeInVM(context, code, timeout);
      } else {
        // Direct execution with monitoring
        result = await this.executeWithMonitoring(context, code, timeout);
      }

      // Update resource usage
      context.resourceUsage.executionTime = Date.now() - startTime;
      this.resourceMonitor.updateUsage(context);

      return result;
    } catch (error) {
      this.handleSandboxError(plugin.id, error);
      throw error;
    }
  }

  /**
   * Destroy sandbox context
   */
  async destroyContext(plugin: LoadedPlugin): Promise<void> {
    const context = this.contexts.get(plugin.id);
    if (!context) return;

    try {
      if (context.worker) {
        await context.worker.terminate();
      }

      this.resourceMonitor.removeContext(context);
      this.contexts.delete(plugin.id);
      this.workers.delete(plugin.id);

      context.state = SandboxState.DESTROYED;
    } catch (error) {
      console.error(`Error destroying sandbox context for ${plugin.id}:`, error);
    }
  }

  /**
   * Cleanup all sandbox contexts
   */
  async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.contexts.keys()).map(async (pluginId) => {
      const context = this.contexts.get(pluginId);
      if (context?.worker) {
        try {
          await context.worker.terminate();
        } catch (error) {
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
  getResourceUsage(pluginId: string): ResourceUsage | null {
    const context = this.contexts.get(pluginId);
    return context?.resourceUsage || null;
  }

  /**
   * Check if plugin is within resource limits
   */
  isWithinLimits(pluginId: string): boolean {
    const context = this.contexts.get(pluginId);
    if (!context) return false;

    const usage = context.resourceUsage;
    const limits = context.config;

    return (
      usage.memoryMB <= limits.memoryLimitMB &&
      usage.cpuPercent <= limits.cpuLimitPercent
    );
  }

  // Private methods

  private shouldUseWorkerThread(security: PluginSecurity): boolean {
    // Use worker threads for plugins that need network/file access
    return (
      security.sandboxConfig.allowNetworkAccess ||
      security.sandboxConfig.allowFileSystemAccess ||
      security.sandboxConfig.allowShellAccess
    );
  }

  private async createWorker(plugin: LoadedPlugin): Promise<Worker> {
    const workerScript = await this.generateWorkerScript(plugin);
    const workerPath = path.join(__dirname, 'sandbox-worker.js');
    
    // Write worker script to temporary file
    await fs.writeFile(workerPath, workerScript);

    const worker = new Worker(workerPath, {
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

  private async createVMContext(plugin: LoadedPlugin): Promise<any> {
    const sandbox = this.createSecureSandbox(plugin);
    const context = createContext(sandbox);
    
    // Initialize plugin environment
    const initScript = new Script(`
      const plugin = require('${plugin.path}');
      global.__plugin = plugin;
    `);
    
    runInContext(initScript, context);
    
    return context;
  }

  private createSecureSandbox(plugin: LoadedPlugin): any {
    const security = plugin.security;
    const sandbox: any = {
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

  private createSecureConsole(pluginId: string): Console {
    return {
      log: (...args) => console.log(`[${pluginId}]`, ...args),
      error: (...args) => console.error(`[${pluginId}]`, ...args),
      warn: (...args) => console.warn(`[${pluginId}]`, ...args),
      info: (...args) => console.info(`[${pluginId}]`, ...args),
      debug: (...args) => console.debug(`[${pluginId}]`, ...args)
    } as Console;
  }

  private createSecureProcess(security: PluginSecurity): Partial<NodeJS.Process> {
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

  private createSecureRequire(pluginPath: string, security: PluginSecurity): NodeRequire {
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

    return ((moduleId: string) => {
      // Allow relative requires from plugin directory
      if (moduleId.startsWith('.')) {
        return require(path.resolve(pluginPath, moduleId));
      }

      // Check allowed modules
      if (!allowedModules.includes(moduleId)) {
        throw new Error(`Module '${moduleId}' is not allowed in sandbox`);
      }

      return require(moduleId);
    }) as NodeRequire;
  }

  private createSecureFetch(security: PluginSecurity): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      
      // Check allowed domains
      if (security.trustedDomains) {
        const urlObj = new URL(url);
        const allowed = security.trustedDomains.some(domain => 
          urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
        );
        
        if (!allowed) {
          throw new Error(`Network access to ${urlObj.hostname} is not allowed`);
        }
      }

      return fetch(input, init);
    };
  }

  private createSecureFS(security: PluginSecurity): any {
    const fs = require('fs');
    const allowedPaths = security.sandboxConfig.allowedPaths || [];

    const isPathAllowed = (filePath: string): boolean => {
      const resolved = path.resolve(filePath);
      return allowedPaths.some(allowedPath => 
        resolved.startsWith(path.resolve(allowedPath))
      );
    };

    return new Proxy(fs, {
      get(target, prop) {
        const original = target[prop];
        if (typeof original !== 'function') return original;

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

  private async executeInWorker<T>(
    context: SandboxContext,
    code: () => Promise<T>,
    timeout: number
  ): Promise<T> {
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
        } else {
          resolve(result.data);
        }
      });

      context.worker.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private async executeInVM<T>(
    context: SandboxContext,
    code: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    const script = new Script(`
      (async () => {
        ${code.toString()}
        return await (${code.toString()})();
      })()
    `);

    const result = runInContext(script, context.vmContext!, { timeout });
    return await result;
  }

  private async executeWithMonitoring<T>(
    context: SandboxContext,
    code: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    const timer = setTimeout(() => {
      throw new Error('Execution timeout');
    }, timeout);

    try {
      const result = await code();
      clearTimeout(timer);
      return result;
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }
  }

  private async generateWorkerScript(plugin: LoadedPlugin): Promise<string> {
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

  private setupMonitoring(): void {
    // Set up periodic resource monitoring
    setInterval(() => {
      this.resourceMonitor.updateAll();
      this.checkResourceLimits();
    }, 1000);
  }

  private checkResourceLimits(): void {
    for (const [pluginId, context] of this.contexts) {
      if (!this.isWithinLimits(pluginId)) {
        this.handleResourceViolation(pluginId, context);
      }
    }
  }

  private handleResourceViolation(pluginId: string, context: SandboxContext): void {
    console.warn(`Resource limit violation for plugin ${pluginId}:`, context.resourceUsage);
    
    // Optionally terminate the plugin
    if (context.worker) {
      context.worker.terminate();
    }
  }

  private handleSandboxError(pluginId: string, error: any): void {
    console.error(`Sandbox error for plugin ${pluginId}:`, error);
  }
}

// Supporting classes and interfaces

class ResourceMonitor {
  private contexts: Map<string, SandboxContext> = new Map();

  addContext(context: SandboxContext): void {
    this.contexts.set(context.id, context);
  }

  removeContext(context: SandboxContext): void {
    this.contexts.delete(context.id);
  }

  updateUsage(context: SandboxContext): void {
    // Update memory and CPU usage
    if (context.worker) {
      context.worker.getHeapSnapshot?.();
    }
    
    // This would integrate with system monitoring tools
    // For now, using placeholder values
    context.resourceUsage.memoryMB = process.memoryUsage().heapUsed / 1024 / 1024;
    context.resourceUsage.cpuPercent = process.cpuUsage().user / 1000000;
  }

  updateAll(): void {
    for (const context of this.contexts.values()) {
      this.updateUsage(context);
    }
  }

  cleanup(): void {
    this.contexts.clear();
  }
}

// Types and interfaces

interface SandboxContext {
  id: string;
  worker: Worker | null;
  vmContext: any;
  resourceUsage: ResourceUsage;
  security: PluginSecurity;
  config: SandboxConfig;
  state: SandboxState;
}

interface SandboxWorker extends Worker {
  pluginId: string;
}

interface ResourceUsage {
  memoryMB: number;
  cpuPercent: number;
  networkRequests: number;
  fileOperations: number;
  startTime: number;
  executionTime?: number;
}

enum SandboxState {
  CREATING = 'creating',
  WORKER = 'worker',
  VM = 'vm',
  RUNNING = 'running',
  ERROR = 'error',
  DESTROYED = 'destroyed'
}

export { SandboxContext, ResourceUsage, SandboxState };