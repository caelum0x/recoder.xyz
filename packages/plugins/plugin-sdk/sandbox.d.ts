/**
 * Secure plugin execution sandbox for the Craft Code extensibility framework
 */
import { Worker } from 'worker_threads';
import { LoadedPlugin, PluginSecurity, SandboxConfig } from './types';
export declare class PluginSandbox {
    private config;
    private workers;
    private contexts;
    private resourceMonitor;
    constructor(config: SandboxConfig);
    /**
     * Create a sandbox context for a plugin
     */
    createContext(plugin: LoadedPlugin): Promise<SandboxContext>;
    /**
     * Execute code in plugin sandbox
     */
    execute<T>(plugin: LoadedPlugin, code: () => Promise<T>): Promise<T>;
    /**
     * Destroy sandbox context
     */
    destroyContext(plugin: LoadedPlugin): Promise<void>;
    /**
     * Cleanup all sandbox contexts
     */
    cleanup(): Promise<void>;
    /**
     * Get resource usage for a plugin
     */
    getResourceUsage(pluginId: string): ResourceUsage | null;
    /**
     * Check if plugin is within resource limits
     */
    isWithinLimits(pluginId: string): boolean;
    private shouldUseWorkerThread;
    private createWorker;
    private createVMContext;
    private createSecureSandbox;
    private createSecureConsole;
    private createSecureProcess;
    private createSecureRequire;
    private createSecureFetch;
    private createSecureFS;
    private executeInWorker;
    private executeInVM;
    private executeWithMonitoring;
    private generateWorkerScript;
    private setupMonitoring;
    private checkResourceLimits;
    private handleResourceViolation;
    private handleSandboxError;
}
interface SandboxContext {
    id: string;
    worker: Worker | null;
    vmContext: any;
    resourceUsage: ResourceUsage;
    security: PluginSecurity;
    config: SandboxConfig;
    state: SandboxState;
}
interface ResourceUsage {
    memoryMB: number;
    cpuPercent: number;
    networkRequests: number;
    fileOperations: number;
    startTime: number;
    executionTime?: number;
}
declare enum SandboxState {
    CREATING = "creating",
    WORKER = "worker",
    VM = "vm",
    RUNNING = "running",
    ERROR = "error",
    DESTROYED = "destroyed"
}
export { SandboxContext, ResourceUsage, SandboxState };
//# sourceMappingURL=sandbox.d.ts.map