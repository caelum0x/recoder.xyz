/**
 * Sandbox Manager
 * Copied from open-lovable - Manages sandbox lifecycle and state
 */

import { atom, map } from 'nanostores';
import {
  SandboxProvider,
  type SandboxInfo,
  type SandboxStatus,
  type SandboxProviderType,
  type CommandResult,
  type SandboxFile,
} from './types';
import { SandboxFactory } from './factory';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('SandboxManager');

// =============================================================================
// Types
// =============================================================================

interface ManagedSandbox {
  sandboxId: string;
  provider: SandboxProvider;
  status: SandboxStatus;
  createdAt: Date;
  lastAccessed: Date;
  error?: string;
}

// =============================================================================
// State
// =============================================================================

export const sandboxesStore = map<Record<string, ManagedSandbox>>({});
export const activeSandboxId = atom<string | null>(null);
export const sandboxStatus = atom<SandboxStatus>('idle');
export const sandboxError = atom<string | null>(null);

// =============================================================================
// Sandbox Manager Class
// =============================================================================

class SandboxManager {
  private sandboxes: Map<string, ManagedSandbox> = new Map();
  private _activeSandboxId: string | null = null;

  /**
   * Get or create a sandbox provider for the given sandbox ID
   */
  async getOrCreateProvider(
    sandboxId: string,
    providerType?: SandboxProviderType
  ): Promise<SandboxProvider> {
    // Check if we already have this sandbox
    const existing = this.sandboxes.get(sandboxId);
    if (existing) {
      existing.lastAccessed = new Date();
      this.updateStore();
      return existing.provider;
    }

    // Try to reconnect to existing sandbox
    try {
      const provider = SandboxFactory.create(
        providerType,
        SandboxFactory.getConfigFromEnvironment()
      );

      // Try to reconnect
      const reconnected = await provider.reconnect(sandboxId);
      if (reconnected) {
        const managedSandbox: ManagedSandbox = {
          sandboxId,
          provider,
          status: 'ready',
          createdAt: new Date(),
          lastAccessed: new Date(),
        };

        this.sandboxes.set(sandboxId, managedSandbox);
        this._activeSandboxId = sandboxId;
        this.updateStore();
        return provider;
      }

      // Return the new provider - caller will need to create a new sandbox
      return provider;
    } catch (error) {
      logger.error(`[SandboxManager] Error reconnecting to sandbox ${sandboxId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new sandbox
   */
  async createSandbox(
    providerType?: SandboxProviderType,
    options?: { autoSetup?: boolean }
  ): Promise<SandboxInfo> {
    sandboxStatus.set('creating');
    sandboxError.set(null);

    try {
      const provider = SandboxFactory.create(
        providerType,
        SandboxFactory.getConfigFromEnvironment()
      );

      const sandboxInfo = await provider.createSandbox();

      const managedSandbox: ManagedSandbox = {
        sandboxId: sandboxInfo.sandboxId,
        provider,
        status: 'ready',
        createdAt: new Date(),
        lastAccessed: new Date(),
      };

      this.sandboxes.set(sandboxInfo.sandboxId, managedSandbox);
      this._activeSandboxId = sandboxInfo.sandboxId;

      // Auto-setup Vite app if requested
      if (options?.autoSetup) {
        await provider.setupViteApp();
      }

      sandboxStatus.set('ready');
      this.updateStore();

      return sandboxInfo;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to create sandbox';
      sandboxStatus.set('error');
      sandboxError.set(errorMsg);
      throw error;
    }
  }

  /**
   * Register an existing sandbox
   */
  registerSandbox(sandboxId: string, provider: SandboxProvider): void {
    const managedSandbox: ManagedSandbox = {
      sandboxId,
      provider,
      status: 'ready',
      createdAt: new Date(),
      lastAccessed: new Date(),
    };

    this.sandboxes.set(sandboxId, managedSandbox);
    this._activeSandboxId = sandboxId;
    sandboxStatus.set('ready');
    this.updateStore();
  }

  /**
   * Get the active sandbox provider
   */
  getActiveProvider(): SandboxProvider | null {
    if (!this._activeSandboxId) {
      return null;
    }

    const sandbox = this.sandboxes.get(this._activeSandboxId);
    if (sandbox) {
      sandbox.lastAccessed = new Date();
      this.updateStore();
      return sandbox.provider;
    }

    return null;
  }

  /**
   * Get a specific sandbox provider
   */
  getProvider(sandboxId: string): SandboxProvider | null {
    const sandbox = this.sandboxes.get(sandboxId);
    if (sandbox) {
      sandbox.lastAccessed = new Date();
      this.updateStore();
      return sandbox.provider;
    }
    return null;
  }

  /**
   * Get active sandbox ID
   */
  getActiveSandboxId(): string | null {
    return this._activeSandboxId;
  }

  /**
   * Set the active sandbox
   */
  setActiveSandbox(sandboxId: string): boolean {
    if (this.sandboxes.has(sandboxId)) {
      this._activeSandboxId = sandboxId;
      activeSandboxId.set(sandboxId);
      this.updateStore();
      return true;
    }
    return false;
  }

  /**
   * Get active sandbox info
   */
  getActiveSandboxInfo(): SandboxInfo | null {
    const provider = this.getActiveProvider();
    return provider?.getSandboxInfo() || null;
  }

  /**
   * Run command in active sandbox
   */
  async runCommand(command: string): Promise<CommandResult> {
    const provider = this.getActiveProvider();
    if (!provider) {
      throw new Error('No active sandbox');
    }
    return provider.runCommand(command);
  }

  /**
   * Write file in active sandbox
   */
  async writeFile(path: string, content: string): Promise<void> {
    const provider = this.getActiveProvider();
    if (!provider) {
      throw new Error('No active sandbox');
    }
    return provider.writeFile(path, content);
  }

  /**
   * Write multiple files in active sandbox
   */
  async writeFiles(files: SandboxFile[]): Promise<void> {
    const provider = this.getActiveProvider();
    if (!provider) {
      throw new Error('No active sandbox');
    }
    return provider.writeFiles(files);
  }

  /**
   * Read file from active sandbox
   */
  async readFile(path: string): Promise<string> {
    const provider = this.getActiveProvider();
    if (!provider) {
      throw new Error('No active sandbox');
    }
    return provider.readFile(path);
  }

  /**
   * List files in active sandbox
   */
  async listFiles(directory?: string): Promise<string[]> {
    const provider = this.getActiveProvider();
    if (!provider) {
      throw new Error('No active sandbox');
    }
    return provider.listFiles(directory);
  }

  /**
   * Install packages in active sandbox
   */
  async installPackages(packages: string[]): Promise<CommandResult> {
    const provider = this.getActiveProvider();
    if (!provider) {
      throw new Error('No active sandbox');
    }
    return provider.installPackages(packages);
  }

  /**
   * Restart Vite in active sandbox
   */
  async restartVite(): Promise<void> {
    const provider = this.getActiveProvider();
    if (!provider) {
      throw new Error('No active sandbox');
    }
    return provider.restartViteServer();
  }

  /**
   * Terminate a sandbox
   */
  async terminateSandbox(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (sandbox) {
      try {
        sandbox.status = 'terminated';
        await sandbox.provider.terminate();
      } catch (error) {
        logger.error(`[SandboxManager] Error terminating sandbox ${sandboxId}:`, error);
      }
      this.sandboxes.delete(sandboxId);

      if (this._activeSandboxId === sandboxId) {
        this._activeSandboxId = null;
        activeSandboxId.set(null);
        sandboxStatus.set('idle');
      }

      this.updateStore();
    }
  }

  /**
   * Terminate all sandboxes
   */
  async terminateAll(): Promise<void> {
    const promises = Array.from(this.sandboxes.values()).map((sandbox) =>
      sandbox.provider.terminate().catch((err) =>
        logger.error(`[SandboxManager] Error terminating sandbox ${sandbox.sandboxId}:`, err)
      )
    );

    await Promise.all(promises);
    this.sandboxes.clear();
    this._activeSandboxId = null;
    activeSandboxId.set(null);
    sandboxStatus.set('idle');
    this.updateStore();
  }

  /**
   * Clean up old sandboxes (older than maxAge milliseconds)
   */
  async cleanup(maxAge: number = 3600000): Promise<number> {
    const now = new Date();
    const toDelete: string[] = [];

    for (const [id, info] of this.sandboxes.entries()) {
      const age = now.getTime() - info.lastAccessed.getTime();
      if (age > maxAge) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      await this.terminateSandbox(id);
    }

    return toDelete.length;
  }

  /**
   * Get all sandbox IDs
   */
  getSandboxIds(): string[] {
    return Array.from(this.sandboxes.keys());
  }

  /**
   * Get sandbox count
   */
  getSandboxCount(): number {
    return this.sandboxes.size;
  }

  /**
   * Update the nanostore
   */
  private updateStore(): void {
    const storeData: Record<string, ManagedSandbox> = {};
    for (const [id, sandbox] of this.sandboxes.entries()) {
      storeData[id] = sandbox;
    }
    sandboxesStore.set(storeData);
    activeSandboxId.set(this._activeSandboxId);
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const sandboxManager = new SandboxManager();

// Type declaration for global
declare global {
  // eslint-disable-next-line no-var
  var sandboxManager: SandboxManager;
}

// Ensure global reference points to our singleton
if (typeof global !== 'undefined') {
  global.sandboxManager = sandboxManager;
}
