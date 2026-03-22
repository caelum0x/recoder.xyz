/**
 * Docker Sandbox Provider
 * Primary sandbox provider for recoder-web using the docker-backend service
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
const logger = createScopedLogger('DockerProviderService');

// Docker backend URL from environment
const getDockerUrl = (): string => {
  let url = 'https://docker.recoder.xyz';
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DOCKER_BACKEND_URL) {
    url = import.meta.env.VITE_DOCKER_BACKEND_URL;
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && url.includes('localhost')) {
    url = 'https://docker.recoder.xyz';
  }
  return url;
};

/**
 * Get session token for authentication
 */
function getSessionToken(): string | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  const cookieNames = [
    '__Secure-recoder.session_token',
    'recoder.session_token',
    '__Secure-session_token',
    'session_token',
    'recoder_session_token',
  ];

  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split('=');
    const value = valueParts.join('=');
    if (cookieNames.includes(name) && value) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

/**
 * Get headers with authentication
 */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = getSessionToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Make authenticated fetch request to docker-backend
 */
async function dockerFetch<T>(
  endpoint: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<T> {
  const { timeout = 30000, ...fetchOptions } = options;
  const url = endpoint.startsWith('http') ? endpoint : `${getDockerUrl()}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...getAuthHeaders(),
        ...(fetchOptions.headers || {}),
      },
      credentials: 'include',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as Record<string, any>;
      throw new Error(errorData.error?.message || `Request failed with status ${response.status}`);
    }

    const data = (await response.json()) as Record<string, any>;
    return (data.data ?? data) as T;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`);
    }

    throw error;
  }
}

/**
 * Docker sandbox provider implementation
 */
export class DockerSandboxProvider extends BaseSandboxProvider {
  readonly providerType = 'docker' as const;
  private dockerUrl: string = '';

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    this.dockerUrl = (config.apiUrl as string) || getDockerUrl();

    // Validate that docker-backend is available
    if (!(await this.isAvailable())) {
      logger.warn('Docker backend is not available. Some features may not work.');
    }
  }

  async create(config: SandboxConfig): Promise<ISandbox> {
    this.ensureInitialized();

    // For Docker provider, the projectId is the sandbox ID
    // Docker containers are created on-demand by the docker-backend
    const sandboxId = config.projectId;

    // Ensure container exists/is started
    const [, error] = await tryCatch(async () => {
      await dockerFetch(`/api/container/${sandboxId}/start`, {
        method: 'POST',
        body: JSON.stringify({
          template: config.template,
          env: config.env,
          resources: config.resources,
        }),
        timeout: config.timeoutMs || CONTAINER_TIMEOUTS.API_DEFAULT,
      });
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.CREATION_FAILED,
        `Failed to create Docker sandbox: ${error.message}`,
        sandboxId,
        error
      );
    }

    return new DockerSandbox(sandboxId, sandboxId, this.dockerUrl);
  }

  async connect(sandboxId: string, options?: SandboxConnectOptions): Promise<ISandbox> {
    this.ensureInitialized();

    // Verify container exists
    const [, error] = await tryCatch(async () => {
      await dockerFetch(`/api/container/${sandboxId}/status`, {
        timeout: options?.timeoutMs || CONTAINER_TIMEOUTS.HEALTH_CHECK,
      });
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.CONNECTION_FAILED,
        `Failed to connect to Docker sandbox: ${error.message}`,
        sandboxId,
        error
      );
    }

    return new DockerSandbox(sandboxId, sandboxId, this.dockerUrl);
  }

  async resume(sandboxId: string, options?: SandboxConnectOptions): Promise<ISandbox> {
    this.ensureInitialized();

    // Start stopped container
    const [, error] = await tryCatch(async () => {
      await dockerFetch(`/api/container/${sandboxId}/start`, {
        method: 'POST',
        timeout: options?.timeoutMs || CONTAINER_TIMEOUTS.API_DEFAULT,
      });
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.CONNECTION_FAILED,
        `Failed to resume Docker sandbox: ${error.message}`,
        sandboxId,
        error
      );
    }

    return new DockerSandbox(sandboxId, sandboxId, this.dockerUrl);
  }

  async list(): Promise<SandboxInfo[]> {
    this.ensureInitialized();

    const [containers, error] = await tryCatch(async () => {
      return await dockerFetch<Array<{
        id: string;
        status: string;
        createdAt?: string;
        lastActiveAt?: string;
      }>>('/api/containers', {
        timeout: CONTAINER_TIMEOUTS.API_DEFAULT,
      });
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.PROVIDER_ERROR,
        `Failed to list Docker sandboxes: ${error.message}`,
        undefined,
        error
      );
    }

    return (containers || []).map((container) => ({
      id: container.id,
      projectId: container.id,
      status: this.mapDockerStatus(container.status),
      createdAt: new Date(container.createdAt || Date.now()),
      lastActiveAt: container.lastActiveAt ? new Date(container.lastActiveAt) : undefined,
    }));
  }

  async terminate(
    sandboxId: string,
    options?: SandboxTerminationOptions
  ): Promise<SandboxCleanupResult> {
    this.ensureInitialized();

    const [, error] = await tryCatch(async () => {
      await dockerFetch(`/api/container/${sandboxId}/stop`, {
        method: 'POST',
        timeout: options?.timeoutMs || CONTAINER_TIMEOUTS.API_DEFAULT,
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

    const [status, error] = await tryCatch(async () => {
      return await dockerFetch<{
        id: string;
        status: string;
        createdAt?: string;
        lastActiveAt?: string;
      }>(`/api/container/${sandboxId}/status`, {
        timeout: CONTAINER_TIMEOUTS.HEALTH_CHECK,
      });
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.PROVIDER_ERROR,
        `Sandbox ${sandboxId} not found: ${error.message}`,
        sandboxId,
        error
      );
    }

    return {
      id: status.id || sandboxId,
      projectId: sandboxId,
      status: this.mapDockerStatus(status.status),
      createdAt: new Date(status.createdAt || Date.now()),
      lastActiveAt: status.lastActiveAt ? new Date(status.lastActiveAt) : undefined,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await dockerFetch('/health', {
        timeout: CONTAINER_TIMEOUTS.HEALTH_CHECK,
      });
      return true;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await dockerFetch('/health', {
        timeout: CONTAINER_TIMEOUTS.HEALTH_CHECK,
      });
      return {
        healthy: true,
        latency: Date.now() - start,
        provider: 'docker',
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - start,
        provider: 'docker',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private mapDockerStatus(status: string): SandboxStatus {
    switch (status?.toLowerCase()) {
      case 'running':
      case 'started':
        return SandboxStatus.RUNNING;
      case 'stopped':
      case 'exited':
        return SandboxStatus.STOPPED;
      case 'creating':
      case 'starting':
        return SandboxStatus.CREATING;
      case 'error':
      case 'dead':
        return SandboxStatus.ERROR;
      default:
        return SandboxStatus.RUNNING;
    }
  }
}

/**
 * Docker sandbox instance implementation
 */
export class DockerSandbox extends BaseSandbox {
  private logger = createSandboxLogger(this.id);
  private dockerUrl: string;
  private envVars: Record<string, string> = {};

  constructor(id: string, projectId: string, dockerUrl: string) {
    super(id, projectId, 'docker');
    this.dockerUrl = dockerUrl;
  }

  async getInfo(): Promise<SandboxInfo> {
    const [status, error] = await tryCatch(async () => {
      return await dockerFetch<{
        id: string;
        status: string;
        createdAt?: string;
        lastActiveAt?: string;
      }>(`/api/container/${this.projectId}/status`, {
        timeout: CONTAINER_TIMEOUTS.HEALTH_CHECK,
      });
    });

    if (error) {
      return {
        id: this.id,
        projectId: this.projectId,
        status: SandboxStatus.ERROR,
        createdAt: new Date(),
      };
    }

    return {
      id: this.id,
      projectId: this.projectId,
      status: this.mapDockerStatus(status.status),
      createdAt: new Date(status.createdAt || Date.now()),
      lastActiveAt: status.lastActiveAt ? new Date(status.lastActiveAt) : undefined,
    };
  }

  private mapDockerStatus(status: string): SandboxStatus {
    switch (status?.toLowerCase()) {
      case 'running':
      case 'started':
        return SandboxStatus.RUNNING;
      case 'stopped':
      case 'exited':
        return SandboxStatus.STOPPED;
      case 'creating':
      case 'starting':
        return SandboxStatus.CREATING;
      case 'error':
      case 'dead':
        return SandboxStatus.ERROR;
      default:
        return SandboxStatus.RUNNING;
    }
  }

  async executeCommand(command: string, options?: CommandOptions): Promise<CommandResult> {
    const startTime = Date.now();

    const [result, error] = await tryCatch(async () => {
      return await dockerFetch<{
        stdout: string;
        stderr: string;
        exitCode: number;
      }>(`/api/shell/${this.projectId}`, {
        method: 'POST',
        body: JSON.stringify({
          command,
          cwd: options?.workingDirectory,
          env: { ...this.envVars, ...options?.env },
        }),
        timeout: options?.timeoutMs || CONTAINER_TIMEOUTS.COMMAND_DEFAULT,
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
      exitCode: result.exitCode ?? 0,
      duration: Date.now() - startTime,
    };
  }

  async writeFile(file: SandboxFile): Promise<FileOperationResult> {
    const [, error] = await tryCatch(async () => {
      await dockerFetch(`/api/file/${this.projectId}`, {
        method: 'POST',
        body: JSON.stringify({
          path: file.path,
          content: file.content,
        }),
        timeout: CONTAINER_TIMEOUTS.FILE_OPERATION,
      });
    });

    if (error) {
      this.logger.error(`Failed to write file ${file.path}: ${error.message}`);
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
    const results: FileOperationResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Write files in parallel with concurrency limit
    const concurrency = 10;
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((file) => this.writeFile(file))
      );

      for (const result of batchResults) {
        results.push(result);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      }
    }

    return {
      success: errorCount === 0,
      results,
      totalFiles: files.length,
      successCount,
      errorCount,
    };
  }

  async readFile(path: string): Promise<string> {
    const [result, error] = await tryCatch(async () => {
      return await dockerFetch<{ content: string } | string>(
        `/api/file/${this.projectId}?path=${encodeURIComponent(path)}`,
        { timeout: CONTAINER_TIMEOUTS.FILE_OPERATION }
      );
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.FILE_OPERATION_FAILED,
        `Failed to read file ${path}: ${error.message}`,
        this.id,
        error
      );
    }

    return typeof result === 'string' ? result : result.content;
  }

  async listFiles(path: string): Promise<string[]> {
    const [result, error] = await tryCatch(async () => {
      return await dockerFetch<{
        files: Array<{ path: string; type: string }>;
      }>(`/api/files/${this.projectId}?path=${encodeURIComponent(path)}`, {
        timeout: CONTAINER_TIMEOUTS.FILE_OPERATION,
      });
    });

    if (error) {
      throw new SandboxError(
        SandboxErrorType.FILE_OPERATION_FAILED,
        `Failed to list files in ${path}: ${error.message}`,
        this.id,
        error
      );
    }

    return (result.files || []).map((f) => f.path);
  }

  async deleteFile(path: string): Promise<FileOperationResult> {
    const [, error] = await tryCatch(async () => {
      await dockerFetch(`/api/file/${this.projectId}`, {
        method: 'DELETE',
        body: JSON.stringify({ path }),
        timeout: CONTAINER_TIMEOUTS.FILE_OPERATION,
      });
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
      await this.readFile(path);
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

  async setEnvironmentVariables(env: Record<string, string>): Promise<void> {
    this.envVars = { ...this.envVars, ...env };
  }

  async getEnvironmentVariables(): Promise<Record<string, string>> {
    return { ...this.envVars };
  }

  async terminate(options?: SandboxTerminationOptions): Promise<SandboxCleanupResult> {
    const [, error] = await tryCatch(async () => {
      await dockerFetch(`/api/container/${this.projectId}/stop`, {
        method: 'POST',
        timeout: options?.timeoutMs || CONTAINER_TIMEOUTS.API_DEFAULT,
      });
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
    // Send a ping to keep the container alive
    await tryCatch(async () => {
      await dockerFetch(`/api/container/${this.projectId}/ping`, {
        method: 'POST',
        timeout: CONTAINER_TIMEOUTS.HEALTH_CHECK,
      });
    });
  }

  getHost(port: number): string {
    // Docker preview URL format
    const dockerUrl = this.dockerUrl || getDockerUrl();
    const baseUrl = dockerUrl.replace(/^http/, '');
    return `http${baseUrl}/preview/${this.projectId}/${port}`;
  }

  async getPreviewInfo(port: number): Promise<PreviewInfo> {
    // Docker backend handles preview URLs directly
    const [previewInfo, error] = await tryCatch(async () => {
      return await dockerFetch<{ url: string; token?: string }>(
        `/api/preview/${this.projectId}/${port}`,
        { timeout: CONTAINER_TIMEOUTS.HEALTH_CHECK }
      );
    });

    if (error) {
      // Fallback to constructed URL
      return {
        url: this.getHost(port),
      };
    }

    return {
      url: previewInfo.url,
      token: previewInfo.token,
    };
  }

  getNativeInstance(): unknown {
    // Docker sandbox doesn't have a native instance
    // Return context information instead
    return {
      id: this.id,
      projectId: this.projectId,
      dockerUrl: this.dockerUrl,
    };
  }
}
