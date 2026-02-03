/**
 * Sandbox Provider Interfaces
 * Abstract interfaces that all sandbox providers must implement
 */

import type {
  BatchFileOperationResult,
  CommandOptions,
  CommandResult,
  FileOperationResult,
  HealthCheckResult,
  PreviewInfo,
  ProviderConfig,
  SandboxCleanupResult,
  SandboxConfig,
  SandboxConnectOptions,
  SandboxFile,
  SandboxInfo,
  SandboxProviderType,
  SandboxTerminationOptions,
} from './types';

/**
 * Abstract interface for sandbox providers
 * This interface defines the contract that all sandbox providers must implement
 */
export interface ISandboxProvider {
  /**
   * Provider type identifier
   */
  readonly providerType: SandboxProviderType;

  /**
   * Initialize the provider with configuration
   */
  initialize(config: ProviderConfig): Promise<void>;

  /**
   * Create a new sandbox instance
   */
  create(config: SandboxConfig): Promise<ISandbox>;

  /**
   * Connect to an existing sandbox
   */
  connect(sandboxId: string, options?: SandboxConnectOptions): Promise<ISandbox>;

  /**
   * Resume a stopped sandbox
   */
  resume(sandboxId: string, options?: SandboxConnectOptions): Promise<ISandbox>;

  /**
   * List all sandboxes
   */
  list(): Promise<SandboxInfo[]>;

  /**
   * Terminate a sandbox
   */
  terminate(sandboxId: string, options?: SandboxTerminationOptions): Promise<SandboxCleanupResult>;

  /**
   * Get sandbox information
   */
  getInfo(sandboxId: string): Promise<SandboxInfo>;

  /**
   * Check if provider is available and configured
   */
  isAvailable(): Promise<boolean>;

  /**
   * Perform a health check on the provider
   */
  healthCheck(): Promise<HealthCheckResult>;
}

/**
 * Interface for sandbox instances
 */
export interface ISandbox {
  /**
   * Sandbox unique identifier
   */
  readonly id: string;

  /**
   * Project ID associated with this sandbox
   */
  readonly projectId: string;

  /**
   * Provider type that created this sandbox
   */
  readonly providerType: SandboxProviderType;

  /**
   * Get sandbox information
   */
  getInfo(): Promise<SandboxInfo>;

  /**
   * Execute a command in the sandbox
   */
  executeCommand(command: string, options?: CommandOptions): Promise<CommandResult>;

  /**
   * Write a single file to the sandbox
   */
  writeFile(file: SandboxFile): Promise<FileOperationResult>;

  /**
   * Write multiple files to the sandbox
   */
  writeFiles(files: SandboxFile[]): Promise<BatchFileOperationResult>;

  /**
   * Read a file from the sandbox
   */
  readFile(path: string): Promise<string>;

  /**
   * List files in a directory
   */
  listFiles(path: string): Promise<string[]>;

  /**
   * Delete a file from the sandbox
   */
  deleteFile(path: string): Promise<FileOperationResult>;

  /**
   * Check if a file exists
   */
  fileExists(path: string): Promise<boolean>;

  /**
   * Get file information
   */
  getFileInfo(path: string): Promise<{
    exists: boolean;
    size?: number;
    modified?: Date;
    isDirectory?: boolean;
  }>;

  /**
   * Set environment variables
   */
  setEnvironmentVariables(env: Record<string, string>): Promise<void>;

  /**
   * Get current environment variables
   */
  getEnvironmentVariables(): Promise<Record<string, string>>;

  /**
   * Terminate the sandbox
   */
  terminate(options?: SandboxTerminationOptions): Promise<SandboxCleanupResult>;

  /**
   * Keep the sandbox alive (heartbeat)
   */
  keepAlive(): Promise<void>;

  /**
   * Get the host address for the specified sandbox port
   * This allows external access to services running inside the sandbox
   */
  getHost(port: number): string;

  /**
   * Get preview information for the specified sandbox port
   * Returns URL and authentication token (if applicable) for accessing the port
   */
  getPreviewInfo(port: number): Promise<PreviewInfo>;

  /**
   * Get the native provider instance for advanced operations
   * This allows access to provider-specific features when needed
   */
  getNativeInstance(): unknown;
}

/**
 * Base abstract class for sandbox providers
 * Provides common functionality and enforces interface implementation
 */
export abstract class BaseSandboxProvider implements ISandboxProvider {
  protected config?: ProviderConfig;
  protected initialized = false;

  abstract readonly providerType: SandboxProviderType;

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    await this.doInitialize(config);
    this.initialized = true;
  }

  protected abstract doInitialize(config: ProviderConfig): Promise<void>;

  abstract create(config: SandboxConfig): Promise<ISandbox>;
  abstract connect(sandboxId: string, options?: SandboxConnectOptions): Promise<ISandbox>;
  abstract resume(sandboxId: string, options?: SandboxConnectOptions): Promise<ISandbox>;
  abstract list(): Promise<SandboxInfo[]>;
  abstract terminate(
    sandboxId: string,
    options?: SandboxTerminationOptions
  ): Promise<SandboxCleanupResult>;
  abstract getInfo(sandboxId: string): Promise<SandboxInfo>;
  abstract isAvailable(): Promise<boolean>;
  abstract healthCheck(): Promise<HealthCheckResult>;

  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`Provider ${this.providerType} is not initialized`);
    }
  }
}

/**
 * Base abstract class for sandbox instances
 */
export abstract class BaseSandbox implements ISandbox {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly providerType: SandboxProviderType
  ) {}

  abstract getInfo(): Promise<SandboxInfo>;
  abstract executeCommand(command: string, options?: CommandOptions): Promise<CommandResult>;
  abstract writeFile(file: SandboxFile): Promise<FileOperationResult>;
  abstract writeFiles(files: SandboxFile[]): Promise<BatchFileOperationResult>;
  abstract readFile(path: string): Promise<string>;
  abstract listFiles(path: string): Promise<string[]>;
  abstract deleteFile(path: string): Promise<FileOperationResult>;
  abstract fileExists(path: string): Promise<boolean>;
  abstract getFileInfo(path: string): Promise<{
    exists: boolean;
    size?: number;
    modified?: Date;
    isDirectory?: boolean;
  }>;
  abstract setEnvironmentVariables(env: Record<string, string>): Promise<void>;
  abstract getEnvironmentVariables(): Promise<Record<string, string>>;
  abstract terminate(options?: SandboxTerminationOptions): Promise<SandboxCleanupResult>;
  abstract keepAlive(): Promise<void>;
  abstract getHost(port: number): string;
  abstract getPreviewInfo(port: number): Promise<PreviewInfo>;
  abstract getNativeInstance(): unknown;
}
