/**
 * Daytona Sandbox Provider
 * Cloud sandbox provider using Daytona infrastructure
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
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('DaytonaProvider');

// Daytona SDK types (dynamically imported)
type DaytonaSandboxType = {
  id: string;
  state: string;
  snapshot?: string;
  createdAt?: string;
  updatedAt?: string;
  cpu: number;
  memory: number;
  disk: number;
  labels?: Record<string, string>;
  env?: Record<string, string>;
  process: {
    executeCommand: (
      command: string,
      cwd?: string,
      env?: Record<string, string>,
      timeoutSecs?: number
    ) => Promise<{
      result?: string;
      exitCode?: number;
      artifacts?: { stdout?: string };
    }>;
  };
  fs: {
    uploadFile: (buffer: Buffer, path: string) => Promise<void>;
    uploadFiles: (files: Array<{ source: Buffer; destination: string }>) => Promise<void>;
    downloadFile: (path: string) => Promise<Buffer>;
    listFiles: (path: string) => Promise<Array<{ name: string }>>;
    deleteFile: (path: string) => Promise<void>;
    getFileDetails: (path: string) => Promise<{
      size?: number;
      modTime?: string;
      isDir?: boolean;
    }>;
  };
  getPreviewLink: (port: number) => Promise<{ url?: string; token?: string }>;
  start: () => Promise<void>;
  delete: () => Promise<void>;
  refreshData: () => Promise<void>;
};

type DaytonaModuleType = {
  Daytona: new (config: { apiKey?: string }) => {
    create: (options: {
      snapshot?: string;
      envVars?: Record<string, string>;
      public?: boolean;
      autoDeleteInterval?: number;
      autoStopInterval?: number;
      autoArchiveInterval?: number;
      resources?: { cpu?: number; memory?: number; disk?: number };
    }) => Promise<DaytonaSandboxType>;
    get: (sandboxId: string) => Promise<DaytonaSandboxType>;
    findOne: (options: { id: string }) => Promise<DaytonaSandboxType | null>;
    list: () => Promise<DaytonaSandboxType[]>;
  };
};

/**
 * Daytona sandbox provider implementation
 */
export class DaytonaSandboxProvider extends BaseSandboxProvider {
  readonly providerType = 'daytona' as const;
  private client: DaytonaModuleType['Daytona'] extends new (...args: infer _) => infer R
    ? R
    : never = null as never;
  private apiKey?: string;
  private apiUrl?: string;

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    this.apiKey = config.apiKey as string;
    this.apiUrl = config.apiUrl as string;

    // Dynamically import Daytona SDK
    try {
      // @ts-ignore - @daytonaio/sdk is an optional dependency
      const daytonaModule = (await import('@daytonaio/sdk')) as DaytonaModuleType;
      this.client = new daytonaModule.Daytona({
        apiKey: this.apiKey,
      });
    } catch (error) {
      logger.warn('Daytona SDK not available. Daytona provider will not work.');
    }
  }

  async create(config: SandboxConfig): Promise<ISandbox> {
    this.ensureInitialized();

    if (!this.client) {
      throw new SandboxError(
        SandboxErrorType.CONFIGURATION_ERROR,
        'Daytona client not initialized'
      );
    }

    const [sandbox, error] = await tryCatch(async () => {
      return await this.client.create({
        snapshot: config.template,
        envVars: config.env,
        public: true,
        autoDeleteInterval: 0,
        autoStopInterval: config.timeoutMs ? Math.floor(config.timeoutMs / 60000) : 5,
        autoArchiveInterval: config.timeoutMs ? Math.floor(config.timeoutMs / 60000) + 5 : 15,
        ...(config.resources && {
          resources: {
            cpu: config.resources.cpu,
            memory: config.resources.memory,
            disk: config.resources.disk,
          },
        }),
      });
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.CREATION_FAILED,
        `Failed to create Daytona sandbox: ${error.message}`,
        undefined,
        error
      );
    }

    return new DaytonaSandbox(sandbox.id, config.projectId, sandbox);
  }

  async connect(sandboxId: string, _options?: SandboxConnectOptions): Promise<ISandbox> {
    this.ensureInitialized();

    if (!this.client) {
      throw new SandboxError(
        SandboxErrorType.CONFIGURATION_ERROR,
        'Daytona client not initialized'
      );
    }

    const [sandbox, error] = await tryCatch(async () => {
      return await this.client.get(sandboxId);
    });

    if (error || !sandbox) {
      throw new SandboxError(
        SandboxErrorType.CONNECTION_FAILED,
        `Failed to connect to Daytona sandbox: ${error?.message || 'Sandbox not found'}`,
        sandboxId,
        error
      );
    }

    return new DaytonaSandbox(sandbox.id, sandboxId, sandbox);
  }

  async resume(sandboxId: string, _options?: SandboxConnectOptions): Promise<ISandbox> {
    this.ensureInitialized();

    if (!this.client) {
      throw new SandboxError(
        SandboxErrorType.CONFIGURATION_ERROR,
        'Daytona client not initialized'
      );
    }

    const [sandbox, error] = await tryCatch(async () => {
      const sb = await this.client.findOne({ id: sandboxId });

      if (!sb) {
        throw new Error(`Sandbox with ID ${sandboxId} not found`);
      }

      // Check if sandbox is in a valid state for resuming
      if (
        sb.state === 'build_failed' ||
        sb.state === 'destroyed' ||
        sb.state === 'destroying'
      ) {
        throw new Error(`Sandbox is in invalid state: ${sb.state}`);
      }

      // Only try to start if the sandbox is not already running
      if (sb.state !== 'started') {
        await sb.start();
      }

      return sb;
    });

    if (error || !sandbox) {
      throw new SandboxError(
        SandboxErrorType.CONNECTION_FAILED,
        `Failed to resume Daytona sandbox: ${error?.message || 'Sandbox not found'}`,
        sandboxId,
        error
      );
    }

    return new DaytonaSandbox(sandbox.id, sandboxId, sandbox);
  }

  async list(): Promise<SandboxInfo[]> {
    this.ensureInitialized();

    if (!this.client) {
      throw new SandboxError(
        SandboxErrorType.CONFIGURATION_ERROR,
        'Daytona client not initialized'
      );
    }

    const [sandboxes, error] = await tryCatch(async () => {
      return await this.client.list();
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.PROVIDER_ERROR,
        `Failed to list Daytona sandboxes: ${error.message}`,
        undefined,
        error
      );
    }

    return sandboxes.map((sandbox) => ({
      id: sandbox.id,
      projectId: sandbox.id,
      status: this.mapDaytonaStatus(sandbox.state),
      template: sandbox.snapshot || 'unknown',
      createdAt: new Date(sandbox.createdAt || Date.now()),
      lastActiveAt: sandbox.updatedAt ? new Date(sandbox.updatedAt) : undefined,
      resources: {
        cpu: sandbox.cpu,
        memory: sandbox.memory,
        disk: sandbox.disk,
      },
      metadata: sandbox.labels || {},
    }));
  }

  async terminate(
    sandboxId: string,
    _options?: SandboxTerminationOptions
  ): Promise<SandboxCleanupResult> {
    this.ensureInitialized();

    if (!this.client) {
      return {
        success: false,
        sandboxId,
        error: 'Daytona client not initialized',
      };
    }

    const [, error] = await tryCatch(async () => {
      const sandbox = await this.client.findOne({ id: sandboxId });
      if (!sandbox) {
        throw new Error(`Sandbox with ID ${sandboxId} not found`);
      }
      await sandbox.delete();
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

    if (!this.client) {
      throw new SandboxError(
        SandboxErrorType.CONFIGURATION_ERROR,
        'Daytona client not initialized'
      );
    }

    const [sandbox, error] = await tryCatch(async () => {
      return await this.client.findOne({ id: sandboxId });
    });

    if (error || !sandbox) {
      throw new SandboxError(
        SandboxErrorType.PROVIDER_ERROR,
        `Sandbox ${sandboxId} not found: ${error?.message || 'Not found'}`,
        sandboxId,
        error ?? undefined
      );
    }

    return {
      id: sandbox.id,
      projectId: sandbox.id,
      status: this.mapDaytonaStatus(sandbox.state),
      template: sandbox.snapshot || 'unknown',
      createdAt: new Date(sandbox.createdAt || Date.now()),
      lastActiveAt: sandbox.updatedAt ? new Date(sandbox.updatedAt) : undefined,
      resources: {
        cpu: sandbox.cpu,
        memory: sandbox.memory,
        disk: sandbox.disk,
      },
      metadata: sandbox.labels || {},
    };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.client) return false;

    try {
      await this.client.list();
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
      provider: 'daytona',
      error: available ? undefined : 'Daytona is not available',
    };
  }

  private mapDaytonaStatus(status: string): SandboxStatus {
    switch (status) {
      case 'running':
      case 'active':
      case 'started':
        return SandboxStatus.RUNNING;
      case 'stopped':
      case 'inactive':
        return SandboxStatus.STOPPED;
      case 'creating':
        return SandboxStatus.CREATING;
      case 'error':
      case 'failed':
        return SandboxStatus.ERROR;
      default:
        return SandboxStatus.RUNNING;
    }
  }
}

/**
 * Daytona sandbox instance implementation
 */
export class DaytonaSandbox extends BaseSandbox {
  private sandbox: DaytonaSandboxType;
  private logger = createSandboxLogger(this.id);

  constructor(id: string, projectId: string, sandbox: DaytonaSandboxType) {
    super(id, projectId, 'daytona');
    this.sandbox = sandbox;
  }

  async getInfo(): Promise<SandboxInfo> {
    await this.sandbox.refreshData();

    return {
      id: this.sandbox.id,
      projectId: this.projectId,
      status: this.mapDaytonaStatus(this.sandbox.state),
      template: this.sandbox.snapshot || 'unknown',
      createdAt: new Date(this.sandbox.createdAt || Date.now()),
      lastActiveAt: this.sandbox.updatedAt ? new Date(this.sandbox.updatedAt) : undefined,
      resources: {
        cpu: this.sandbox.cpu,
        memory: this.sandbox.memory,
        disk: this.sandbox.disk,
      },
      metadata: this.sandbox.labels || {},
    };
  }

  private mapDaytonaStatus(status: string): SandboxStatus {
    switch (status) {
      case 'started':
      case 'running':
        return SandboxStatus.RUNNING;
      case 'stopped':
        return SandboxStatus.STOPPED;
      case 'creating':
        return SandboxStatus.CREATING;
      case 'error':
      case 'failed':
        return SandboxStatus.ERROR;
      default:
        return SandboxStatus.RUNNING;
    }
  }

  async executeCommand(command: string, options?: CommandOptions): Promise<CommandResult> {
    const startTime = Date.now();

    const [result, error] = await tryCatch(async () => {
      return await this.sandbox.process.executeCommand(
        command,
        options?.workingDirectory,
        options?.env,
        options?.timeoutMs ? Math.floor(options.timeoutMs / 1000) : undefined
      );
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
      stdout: result.artifacts?.stdout || result.result || '',
      stderr: '',
      exitCode: result.exitCode || 0,
      duration: Date.now() - startTime,
    };
  }

  async writeFile(file: SandboxFile): Promise<FileOperationResult> {
    const [, error] = await tryCatch(async () => {
      const buffer = Buffer.from(file.content, (file.encoding as BufferEncoding) || 'utf8');
      await this.sandbox.fs.uploadFile(buffer, file.path);
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
    const fileUploads = files.map((file) => ({
      source: Buffer.from(file.content),
      destination: file.path,
    }));

    const [, error] = await tryCatch(async () => {
      await this.sandbox.fs.uploadFiles(fileUploads);
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
      const buffer = await this.sandbox.fs.downloadFile(path);
      return buffer.toString('utf8');
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
      const fileInfos = await this.sandbox.fs.listFiles(path);
      return fileInfos.map((info) => info.name);
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
      await this.sandbox.fs.deleteFile(path);
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
      await this.sandbox.fs.getFileDetails(path);
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
    try {
      const fileInfo = await this.sandbox.fs.getFileDetails(path);
      return {
        exists: true,
        size: fileInfo.size,
        modified: fileInfo.modTime ? new Date(fileInfo.modTime) : undefined,
        isDirectory: fileInfo.isDir,
      };
    } catch {
      return { exists: false };
    }
  }

  async setEnvironmentVariables(_env: Record<string, string>): Promise<void> {
    throw new SandboxError(
      SandboxErrorType.PROVIDER_ERROR,
      'Daytona does not support runtime environment variable changes',
      this.id
    );
  }

  async getEnvironmentVariables(): Promise<Record<string, string>> {
    return this.sandbox.env || {};
  }

  async terminate(_options?: SandboxTerminationOptions): Promise<SandboxCleanupResult> {
    const [, error] = await tryCatch(async () => {
      await this.sandbox.delete();
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
    await this.sandbox.refreshData();
  }

  getHost(port: number): string {
    const sandboxId = this.sandbox.id || this.id;
    return `https://${port}-${sandboxId}.runner.daytona.work`;
  }

  async getPreviewInfo(port: number): Promise<PreviewInfo> {
    const [previewInfo, error] = await tryCatch(async () => {
      return await this.sandbox.getPreviewLink(port);
    });

    if (error) {
      return {
        url: this.getHost(port),
      };
    }

    return {
      url: previewInfo?.url || this.getHost(port),
      token: previewInfo?.token,
    };
  }

  getNativeInstance(): unknown {
    return this.sandbox;
  }
}
