/**
 * Sandbox creation step for deployment workflow
 * Creates a sandbox environment for building and deploying the project
 */

import type { DeploymentContext, SandboxResult } from '../../types';
import { DEPLOYMENT_CONFIG } from '../../utils/common';
import { CommonErrors } from '../../utils/errors';

/**
 * Sandbox provider types
 */
export type SandboxProvider = 'e2b' | 'daytona' | 'local' | 'mock';

/**
 * Sandbox interface
 */
export interface ISandbox {
  id: string;
  provider: SandboxProvider;
  status: 'creating' | 'ready' | 'running' | 'terminated' | 'error';

  /** Execute command in sandbox */
  executeCommand(command: string, options?: {
    timeoutMs?: number;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
  }): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;

  /** Write files to sandbox */
  writeFiles(files: { path: string; content: string; isBinary?: boolean }[]): Promise<{
    success: boolean;
    successCount: number;
    errorCount: number;
    totalFiles: number;
    results: { path?: string; success: boolean; error?: string }[];
  }>;

  /** Read file from sandbox */
  readFile(path: string): Promise<string>;

  /** Terminate sandbox */
  terminate(): Promise<void>;
}

/**
 * Mock sandbox implementation for local development
 */
class MockSandbox implements ISandbox {
  id: string;
  provider: SandboxProvider = 'mock';
  status: ISandbox['status'] = 'ready';
  private files: Map<string, string> = new Map();

  constructor(id: string) {
    this.id = id;
  }

  async executeCommand(
    command: string,
    options?: { timeoutMs?: number; onStdout?: (data: string) => void; onStderr?: (data: string) => void }
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    // Simulate command execution
    const stdout = `Mock execution of: ${command}\nCompleted successfully.`;
    const stderr = '';

    if (options?.onStdout) {
      options.onStdout(stdout);
    }

    // Simulate some common commands
    if (command.includes('bun install')) {
      return { exitCode: 0, stdout: 'Mock: Dependencies installed', stderr: '' };
    }
    if (command.includes('bun run build')) {
      return { exitCode: 0, stdout: 'Mock: Build completed', stderr: '' };
    }
    if (command.includes('wrangler deploy')) {
      return {
        exitCode: 0,
        stdout: `Mock: Deployed to https://mock-worker.workers.dev`,
        stderr: ''
      };
    }
    if (command.includes('ls')) {
      return { exitCode: 0, stdout: 'package.json\nindex.ts', stderr: '' };
    }

    return { exitCode: 0, stdout, stderr };
  }

  async writeFiles(
    files: { path: string; content: string; isBinary?: boolean }[]
  ): Promise<{
    success: boolean;
    successCount: number;
    errorCount: number;
    totalFiles: number;
    results: { path?: string; success: boolean; error?: string }[];
  }> {
    const results = files.map(file => {
      this.files.set(file.path, file.content);
      return { path: file.path, success: true };
    });

    return {
      success: true,
      successCount: files.length,
      errorCount: 0,
      totalFiles: files.length,
      results
    };
  }

  async readFile(path: string): Promise<string> {
    return this.files.get(path) || '';
  }

  async terminate(): Promise<void> {
    this.status = 'terminated';
    this.files.clear();
  }
}

/**
 * Sandbox registry for managing created sandboxes
 */
class SandboxRegistry {
  private sandboxes: Map<string, ISandbox> = new Map();

  register(sandbox: ISandbox): void {
    this.sandboxes.set(sandbox.id, sandbox);
  }

  get(id: string): ISandbox | undefined {
    return this.sandboxes.get(id);
  }

  remove(id: string): void {
    this.sandboxes.delete(id);
  }

  getAll(): ISandbox[] {
    return Array.from(this.sandboxes.values());
  }
}

// Global sandbox registry
const sandboxRegistry = new SandboxRegistry();

/**
 * Get default sandbox provider from environment
 */
function getDefaultProvider(env: DeploymentContext['env']): SandboxProvider {
  const configuredProvider = env.SANDBOX_BUILDER_DEFAULT_PROVIDER?.toLowerCase();

  if (configuredProvider === 'e2b' && env.E2B_API_KEY) {
    return 'e2b';
  }
  if (configuredProvider === 'daytona' && env.DAYTONA_API_KEY) {
    return 'daytona';
  }

  // Default to mock for local development
  return 'mock';
}

/**
 * Create a new sandbox instance
 */
async function createSandboxInstance(
  provider: SandboxProvider,
  template: string,
  _env: DeploymentContext['env'],
  logger: DeploymentContext['logger']
): Promise<ISandbox> {
  const sandboxId = `sandbox_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  logger.info('Creating sandbox instance', {
    provider,
    template,
    sandboxId
  });

  switch (provider) {
    case 'e2b':
      // In production, this would use the E2B SDK
      logger.info('E2B sandbox creation not implemented, using mock');
      return new MockSandbox(sandboxId);

    case 'daytona':
      // In production, this would use the Daytona SDK
      logger.info('Daytona sandbox creation not implemented, using mock');
      return new MockSandbox(sandboxId);

    case 'local':
      // In production, this would create a local Docker container
      logger.info('Local sandbox creation not implemented, using mock');
      return new MockSandbox(sandboxId);

    case 'mock':
    default:
      return new MockSandbox(sandboxId);
  }
}

/**
 * Connect to an existing sandbox
 */
export async function connectToSandbox(sandboxId: string): Promise<ISandbox> {
  // First check the registry
  const existingSandbox = sandboxRegistry.get(sandboxId);
  if (existingSandbox) {
    return existingSandbox;
  }

  // If not in registry, create a new mock sandbox with the given ID
  // In production, this would reconnect to an actual sandbox
  const sandbox = new MockSandbox(sandboxId);
  sandboxRegistry.register(sandbox);
  return sandbox;
}

/**
 * Terminate a sandbox
 */
export async function terminateSandbox(
  sandboxId: string,
  logger?: DeploymentContext['logger']
): Promise<boolean> {
  const sandbox = sandboxRegistry.get(sandboxId);

  if (!sandbox) {
    logger?.warn('Sandbox not found for termination', { sandboxId });
    return true; // Already terminated or doesn't exist
  }

  try {
    await sandbox.terminate();
    sandboxRegistry.remove(sandboxId);
    logger?.info('Sandbox terminated successfully', { sandboxId });
    return true;
  } catch (error) {
    logger?.error('Failed to terminate sandbox', {
      sandboxId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Create deployment sandbox step
 */
export async function createSandbox(context: DeploymentContext): Promise<SandboxResult> {
  const { env, logger, state } = context;

  // Get deployment config from validation step
  const validationResult = state.stepResults.validation;
  if (!validationResult?.data?.deploymentConfig) {
    throw CommonErrors.invalidRequest('Deployment configuration not found from validation step');
  }

  const { template, timeout } = validationResult.data.deploymentConfig;

  logger.info('Creating deployment sandbox', {
    template,
    timeout
  });

  // Get sandbox provider
  const provider = getDefaultProvider(env);

  logger.info('Sandbox configuration resolved', {
    provider,
    template,
    timeout
  });

  // Create sandbox instance
  const sandbox = await createSandboxInstance(provider, template, env, logger);

  // Register sandbox for later access
  sandboxRegistry.register(sandbox);

  logger.info('Sandbox created successfully', {
    sandboxId: sandbox.id,
    provider,
    template
  });

  return {
    success: true,
    duration: 0, // Will be set by workflow
    data: {
      sandboxId: sandbox.id,
      sandboxInfo: {
        provider,
        template,
        createdAt: new Date().toISOString()
      },
      provider
    }
  };
}

// Export sandbox registry for testing and debugging
export { sandboxRegistry, MockSandbox };
