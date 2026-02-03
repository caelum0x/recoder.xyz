/**
 * Sandbox Types and Interfaces
 * Core type definitions for the sandbox abstraction layer
 */

/**
 * Supported sandbox providers
 */
export type SandboxProviderType = 'docker' | 'e2b' | 'daytona';

/**
 * Sandbox status enumeration
 */
export enum SandboxStatus {
  CREATING = 'creating',
  RUNNING = 'running',
  STOPPED = 'stopped',
  ERROR = 'error',
  TERMINATED = 'terminated',
}

/**
 * File information for sandbox operations
 */
export interface SandboxFile {
  path: string;
  content: string;
  isBinary?: boolean;
  encoding?: 'utf8' | 'base64';
}

/**
 * Command execution result
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration?: number;
}

/**
 * Command execution options
 */
export interface CommandOptions {
  timeoutMs?: number;
  workingDirectory?: string;
  env?: Record<string, string>;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

/**
 * Sandbox configuration
 */
export interface SandboxConfig {
  template?: string;
  projectId: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  resources?: {
    memory?: number; // MB
    cpu?: number;
    disk?: number; // MB
  };
  network?: {
    enabled?: boolean;
    allowedDomains?: string[];
    blockedPorts?: number[];
  };
}

/**
 * Sandbox creation options
 */
export interface SandboxCreateOptions extends SandboxConfig {
  provider?: SandboxProviderType;
}

/**
 * Sandbox connection options
 */
export interface SandboxConnectOptions {
  timeoutMs?: number;
  retryCount?: number;
  maxRetries?: number;
}

/**
 * Sandbox information
 */
export interface SandboxInfo {
  id: string;
  status: SandboxStatus;
  template?: string;
  projectId: string;
  createdAt: Date;
  lastActiveAt?: Date;
  resources?: {
    memory: number;
    cpu: number;
    disk: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Sandbox termination options
 */
export interface SandboxTerminationOptions {
  timeoutMs?: number;
  retryCount?: number;
  maxRetries?: number;
  force?: boolean;
}

/**
 * Sandbox cleanup result
 */
export interface SandboxCleanupResult {
  success: boolean;
  sandboxId: string;
  error?: string;
}

/**
 * File system operation result
 */
export interface FileOperationResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Batch file operation result
 */
export interface BatchFileOperationResult {
  success: boolean;
  results: FileOperationResult[];
  totalFiles: number;
  successCount: number;
  errorCount: number;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  type: SandboxProviderType;
  apiKey?: string;
  apiUrl?: string;
  timeout?: number;
  retries?: number;
  [key: string]: unknown;
}

/**
 * Sandbox factory configuration
 */
export interface SandboxFactoryConfig {
  defaultProvider: SandboxProviderType;
  providers: {
    docker?: ProviderConfig;
    e2b?: ProviderConfig;
    daytona?: ProviderConfig;
  };
}

/**
 * Error types for sandbox operations
 */
export enum SandboxErrorType {
  CREATION_FAILED = 'creation_failed',
  CONNECTION_FAILED = 'connection_failed',
  COMMAND_FAILED = 'command_failed',
  FILE_OPERATION_FAILED = 'file_operation_failed',
  TERMINATION_FAILED = 'termination_failed',
  TIMEOUT = 'timeout',
  PROVIDER_ERROR = 'provider_error',
  CONFIGURATION_ERROR = 'configuration_error',
  HEALTH_CHECK_FAILED = 'health_check_failed',
}

/**
 * Sandbox operation error
 */
export class SandboxError extends Error {
  constructor(
    public type: SandboxErrorType,
    message: string,
    public sandboxId?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'SandboxError';
  }
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  delay: number;
  backoff: 'linear' | 'exponential';
  retryableErrors?: SandboxErrorType[];
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  latency: number;
  provider: SandboxProviderType;
  error?: string;
}

/**
 * Preview information for accessing sandbox ports
 */
export interface PreviewInfo {
  url: string;
  token?: string;
}
