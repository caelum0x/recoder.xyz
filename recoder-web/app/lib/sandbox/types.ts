/**
 * Sandbox Types
 * Copied from open-lovable - Defines base types and abstract class for sandbox providers
 */

import { z } from 'zod';

// =============================================================================
// Schemas
// =============================================================================

export const SandboxProviderTypeSchema = z.enum(['e2b', 'vercel', 'docker', 'local']);

export const SandboxFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  lastModified: z.number().optional(),
});

export const SandboxInfoSchema = z.object({
  sandboxId: z.string(),
  url: z.string(),
  provider: SandboxProviderTypeSchema,
  createdAt: z.coerce.date(),
  lastAccessed: z.coerce.date().optional(),
});

export const CommandResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
  success: z.boolean(),
});

export const SandboxProviderConfigSchema = z.object({
  e2b: z.object({
    apiKey: z.string(),
    timeoutMs: z.number().optional(),
    template: z.string().optional(),
  }).optional(),
  vercel: z.object({
    teamId: z.string().optional(),
    projectId: z.string().optional(),
    token: z.string().optional(),
    authMethod: z.enum(['oidc', 'pat']).optional(),
  }).optional(),
  docker: z.object({
    endpoint: z.string().optional(),
    authToken: z.string().optional(),
    containerId: z.string().optional(),
  }).optional(),
});

export const SandboxStatusSchema = z.enum([
  'idle',
  'creating',
  'ready',
  'running',
  'error',
  'terminated',
]);

// =============================================================================
// Types
// =============================================================================

export type SandboxProviderType = z.infer<typeof SandboxProviderTypeSchema>;
export type SandboxFile = z.infer<typeof SandboxFileSchema>;
export type SandboxInfo = z.infer<typeof SandboxInfoSchema>;
export type CommandResult = z.infer<typeof CommandResultSchema>;
export type SandboxProviderConfig = z.infer<typeof SandboxProviderConfigSchema>;
export type SandboxStatus = z.infer<typeof SandboxStatusSchema>;

// =============================================================================
// Abstract Base Class
// =============================================================================

/**
 * Abstract base class for sandbox providers
 * All sandbox implementations must extend this class
 */
export abstract class SandboxProvider {
  protected config: SandboxProviderConfig;
  protected sandbox: unknown = null;
  protected sandboxInfo: SandboxInfo | null = null;
  protected existingFiles: Set<string> = new Set();

  constructor(config: SandboxProviderConfig = {}) {
    this.config = config;
  }

  /**
   * Create a new sandbox instance
   */
  abstract createSandbox(): Promise<SandboxInfo>;

  /**
   * Run a shell command in the sandbox
   */
  abstract runCommand(command: string): Promise<CommandResult>;

  /**
   * Write a file to the sandbox
   */
  abstract writeFile(path: string, content: string): Promise<void>;

  /**
   * Write multiple files to the sandbox
   */
  abstract writeFiles(files: SandboxFile[]): Promise<void>;

  /**
   * Read a file from the sandbox
   */
  abstract readFile(path: string): Promise<string>;

  /**
   * List files in a directory
   */
  abstract listFiles(directory?: string): Promise<string[]>;

  /**
   * Install npm packages
   */
  abstract installPackages(packages: string[]): Promise<CommandResult>;

  /**
   * Get the sandbox URL
   */
  abstract getSandboxUrl(): string | null;

  /**
   * Get sandbox info
   */
  abstract getSandboxInfo(): SandboxInfo | null;

  /**
   * Terminate the sandbox
   */
  abstract terminate(): Promise<void>;

  /**
   * Check if sandbox is alive
   */
  abstract isAlive(): boolean;

  /**
   * Get the set of tracked files
   */
  getTrackedFiles(): Set<string> {
    return new Set(this.existingFiles);
  }

  /**
   * Check if a file exists in the sandbox
   */
  hasFile(path: string): boolean {
    return this.existingFiles.has(path);
  }

  /**
   * Clear tracked files
   */
  clearTrackedFiles(): void {
    this.existingFiles.clear();
  }

  // Optional methods that providers can override

  /**
   * Set up a Vite React app in the sandbox
   */
  async setupViteApp(): Promise<void> {
    throw new Error('setupViteApp not implemented for this provider');
  }

  /**
   * Restart the Vite dev server
   */
  async restartViteServer(): Promise<void> {
    throw new Error('restartViteServer not implemented for this provider');
  }

  /**
   * Get Vite logs
   */
  async getViteLogs(): Promise<string> {
    throw new Error('getViteLogs not implemented for this provider');
  }

  /**
   * Attempt to reconnect to an existing sandbox
   */
  async reconnect(_sandboxId: string): Promise<boolean> {
    return false;
  }
}

// =============================================================================
// Utility Types
// =============================================================================

export interface SandboxCreateOptions {
  provider?: SandboxProviderType;
  template?: string;
  timeoutMs?: number;
  autoSetup?: boolean;
}

export interface SandboxWriteOptions {
  createDirs?: boolean;
  overwrite?: boolean;
}

export interface SandboxCommandOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}
