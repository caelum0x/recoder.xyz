/**
 * E2B Sandbox Provider
 * Cloud sandbox provider using E2B (e2b.dev) infrastructure
 */

import { BaseSandbox, BaseSandboxProvider, type ISandbox } from '../interfaces';
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
  SandboxTerminationOptions,
} from '../types';
import { SandboxError, SandboxErrorType, SandboxStatus } from '../types';
import { tryCatch, createSandboxLogger } from '../utils';
import { CONTAINER_TIMEOUTS } from '../config';

// E2B SDK types (dynamically imported)
type E2BSandboxType = {
  sandboxId: string;
  commands: {
    run: (
      command: string,
      options?: { onStderr?: (data: string) => void; timeoutMs?: number; cwd?: string }
    ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  };
  files: {
    write: (files: Array<{ path: string; data: string }>) => Promise<void>;
    read: (path: string) => Promise<string>;
    list: (path: string) => Promise<string[]>;
    remove: (path: string) => Promise<void>;
  };
  getHost: (port: number) => string;
  kill: () => Promise<void>;
};

type E2BModuleType = {
  default: {
    create: (
      template: string,
      options?: { timeoutMs?: number; envs?: Record<string, string> }
    ) => Promise<E2BSandboxType>;
    connect: (sandboxId: string) => Promise<E2BSandboxType>;
    resume: (sandboxId: string, options?: { timeoutMs?: number }) => Promise<E2BSandboxType>;
    list: (options?: { requestTimeoutMs?: number }) => AsyncIterable<{
      id: string;
      status: string;
      template?: string;
      createdAt?: string;
      lastActiveAt?: string;
      metadata?: Record<string, unknown>;
    }>;
    kill: (sandboxId: string, options?: { requestTimeoutMs?: number }) => Promise<void>;
  };
};

/**
 * E2B sandbox provider implementation
 */
export class E2BSandboxProvider extends BaseSandboxProvider {
  readonly providerType = 'e2b' as const;
  private E2B: E2BModuleType['default'] | null = null;
  private apiKey?: string;

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    this.apiKey = config.apiKey as string;

    // Dynamically import E2B SDK
    try {
      // @ts-ignore - e2b is an optional dependency
      const e2bModule = await import('e2b') as E2BModuleType;
      this.E2B = e2bModule.default;
    } catch (error) {
      console.warn('E2B SDK not available. E2B provider will not work.');
      // Don't throw - allow graceful degradation
    }
  }

  async create(config: SandboxConfig): Promise<ISandbox> {
    this.ensureInitialized();

    if (!this.E2B) {
      throw new SandboxError(
        SandboxErrorType.CONFIGURATION_ERROR,
        'E2B SDK is not available'
      );
    }

    const template = config.template || 'base';

    const [container, error] = await tryCatch(async () => {
      return await this.E2B!.create(template, {
        timeoutMs: config.timeoutMs,
        envs: config.env,
      });
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.CREATION_FAILED,
        `Failed to create E2B sandbox: ${error.message}`,
        undefined,
        error
      );
    }

    return new E2BSandbox(container.sandboxId, config.projectId, container);
  }

  async connect(sandboxId: string, options?: SandboxConnectOptions): Promise<ISandbox> {
    this.ensureInitialized();

    if (!this.E2B) {
      throw new SandboxError(
        SandboxErrorType.CONFIGURATION_ERROR,
        'E2B SDK is not available'
      );
    }

    const [container, error] = await tryCatch(async () => {
      return await this.E2B!.connect(sandboxId);
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.CONNECTION_FAILED,
        `Failed to connect to E2B sandbox: ${error.message}`,
        sandboxId,
        error
      );
    }

    // Extract projectId from metadata or use sandboxId
    const projectId = sandboxId;
    return new E2BSandbox(sandboxId, projectId, container);
  }

  async resume(sandboxId: string, options?: SandboxConnectOptions): Promise<ISandbox> {
    this.ensureInitialized();

    if (!this.E2B) {
      throw new SandboxError(
        SandboxErrorType.CONFIGURATION_ERROR,
        'E2B SDK is not available'
      );
    }

    const [container, error] = await tryCatch(async () => {
      return await this.E2B!.resume(sandboxId, {
        timeoutMs: options?.timeoutMs,
      });
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.CONNECTION_FAILED,
        `Failed to resume E2B sandbox: ${error.message}`,
        sandboxId,
        error
      );
    }

    const projectId = sandboxId;
    return new E2BSandbox(sandboxId, projectId, container);
  }

  async list(): Promise<SandboxInfo[]> {
    this.ensureInitialized();

    if (!this.E2B) {
      throw new SandboxError(
        SandboxErrorType.CONFIGURATION_ERROR,
        'E2B SDK is not available'
      );
    }

    const [paginator, error] = await tryCatch(async () => {
      return this.E2B!.list();
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.PROVIDER_ERROR,
        `Failed to list E2B sandboxes: ${error.message}`,
        undefined,
        error
      );
    }

    const sandboxes: SandboxInfo[] = [];
    try {
      for await (const sandbox of paginator) {
        sandboxes.push({
          id: sandbox.id,
          projectId: sandbox.id,
          status: this.mapE2BStatus(sandbox.status),
          template: sandbox.template || 'unknown',
          createdAt: new Date(sandbox.createdAt || Date.now()),
          lastActiveAt: sandbox.lastActiveAt ? new Date(sandbox.lastActiveAt) : undefined,
          metadata: sandbox.metadata,
        });
      }
    } catch (iterError) {
      // Handle iteration errors gracefully
      console.warn('Error iterating E2B sandboxes:', iterError);
    }

    return sandboxes;
  }

  async terminate(
    sandboxId: string,
    options?: SandboxTerminationOptions
  ): Promise<SandboxCleanupResult> {
    this.ensureInitialized();

    if (!this.E2B) {
      return {
        success: false,
        sandboxId,
        error: 'E2B SDK is not available',
      };
    }

    if (!sandboxId || sandboxId.startsWith('pending-')) {
      return {
        success: true,
        sandboxId,
        error: 'Placeholder container ID, no actual sandbox to terminate',
      };
    }

    const [, error] = await tryCatch(async () => {
      await this.E2B!.kill(sandboxId, {
        requestTimeoutMs: options?.timeoutMs || 30_000,
      });
    });

    if (error) {
      return {
        success: false,
        sandboxId,
        error: error.message || 'Unknown termination error',
      };
    }

    return {
      success: true,
      sandboxId,
    };
  }

  async getInfo(sandboxId: string): Promise<SandboxInfo> {
    this.ensureInitialized();

    const sandboxes = await this.list();
    const sandbox = sandboxes.find((s) => s.id === sandboxId);

    if (!sandbox) {
      throw new SandboxError(
        SandboxErrorType.PROVIDER_ERROR,
        `Sandbox ${sandboxId} not found`,
        sandboxId
      );
    }

    return sandbox;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.E2B) {
      return false;
    }

    try {
      // Try to list sandboxes to check if E2B is available
      await this.E2B.list({ requestTimeoutMs: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    const available = await this.isAvailable();

    return {
      healthy: available,
      latency: Date.now() - start,
      provider: 'e2b',
      error: available ? undefined : 'E2B is not available',
    };
  }

  private mapE2BStatus(status: string): SandboxStatus {
    switch (status) {
      case 'running':
        return SandboxStatus.RUNNING;
      case 'stopped':
        return SandboxStatus.STOPPED;
      case 'error':
        return SandboxStatus.ERROR;
      default:
        return SandboxStatus.RUNNING;
    }
  }
}

/**
 * E2B sandbox instance implementation
 */
export class E2BSandbox extends BaseSandbox {
  private container: E2BSandboxType;
  private logger = createSandboxLogger(this.id);

  constructor(id: string, projectId: string, container: E2BSandboxType) {
    super(id, projectId, 'e2b');
    this.container = container;
  }

  async getInfo(): Promise<SandboxInfo> {
    return {
      id: this.id,
      projectId: this.projectId,
      status: SandboxStatus.RUNNING,
      template: 'unknown',
      createdAt: new Date(),
    };
  }

  async executeCommand(command: string, options?: CommandOptions): Promise<CommandResult> {
    const startTime = Date.now();

    const [result, error] = await tryCatch(async () => {
      return await this.container.commands.run(command, {
        onStderr: options?.onStderr,
        timeoutMs: options?.timeoutMs,
        cwd: options?.workingDirectory,
      });
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.COMMAND_FAILED,
        `Command execution failed: ${error.message}`,
        this.id,
        error
      );
    }

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.exitCode || 0,
      duration: Date.now() - startTime,
    };
  }

  async writeFile(file: SandboxFile): Promise<FileOperationResult> {
    const [, error] = await tryCatch(async () => {
      await this.container.files.write([
        {
          path: file.path,
          data: file.content,
        },
      ]);
    });

    if (error) {
      return {
        success: false,
        path: file.path,
        error: error.message,
      };
    }

    return {
      success: true,
      path: file.path,
    };
  }

  async writeFiles(files: SandboxFile[]): Promise<BatchFileOperationResult> {
    const fileData = files.map((file) => ({
      path: file.path,
      data: file.content,
    }));

    const [, error] = await tryCatch(async () => {
      await this.container.files.write(fileData);
    });

    if (error) {
      return {
        success: false,
        results: files.map((file) => ({
          success: false,
          path: file.path,
          error: error.message,
        })),
        totalFiles: files.length,
        successCount: 0,
        errorCount: files.length,
      };
    }

    return {
      success: true,
      results: files.map((file) => ({
        success: true,
        path: file.path,
      })),
      totalFiles: files.length,
      successCount: files.length,
      errorCount: 0,
    };
  }

  async readFile(path: string): Promise<string> {
    const [content, error] = await tryCatch(async () => {
      return await this.container.files.read(path);
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.FILE_OPERATION_FAILED,
        `Failed to read file ${path}: ${error.message}`,
        this.id,
        error
      );
    }

    return content;
  }

  async listFiles(path: string): Promise<string[]> {
    const [files, error] = await tryCatch(async () => {
      return await this.container.files.list(path);
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.FILE_OPERATION_FAILED,
        `Failed to list files in ${path}: ${error.message}`,
        this.id,
        error
      );
    }

    return files || [];
  }

  async deleteFile(path: string): Promise<FileOperationResult> {
    const [, error] = await tryCatch(async () => {
      await this.container.files.remove(path);
    });

    if (error) {
      return {
        success: false,
        path,
        error: error.message,
      };
    }

    return {
      success: true,
      path,
    };
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      await this.container.files.read(path);
      return true;
    } catch {
      return false;
    }
  }

  async getFileInfo(path: string): Promise<{
    exists: boolean;
    size?: number;
    modified?: Date;
    isDirectory?: boolean;
  }> {
    const exists = await this.fileExists(path);
    return { exists };
  }

  async setEnvironmentVariables(_env: Record<string, string>): Promise<void> {
    throw new SandboxError(
      SandboxErrorType.PROVIDER_ERROR,
      'E2B does not support runtime environment variable changes',
      this.id
    );
  }

  async getEnvironmentVariables(): Promise<Record<string, string>> {
    return {};
  }

  async terminate(_options?: SandboxTerminationOptions): Promise<SandboxCleanupResult> {
    const [, error] = await tryCatch(async () => {
      await this.container.kill();
    });

    if (error) {
      return {
        success: false,
        sandboxId: this.id,
        error: error.message,
      };
    }

    return {
      success: true,
      sandboxId: this.id,
    };
  }

  async keepAlive(): Promise<void> {
    // E2B handles keep-alive automatically
  }

  getHost(port: number): string {
    return this.container.getHost(port);
  }

  async getPreviewInfo(port: number): Promise<PreviewInfo> {
    return {
      url: this.getHost(port),
    };
  }

  getNativeInstance(): unknown {
    return this.container;
  }
}
