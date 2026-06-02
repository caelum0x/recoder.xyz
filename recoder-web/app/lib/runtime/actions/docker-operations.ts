/**
 * Docker container operations - extracted from action-runner.ts
 * Provides primitives for file operations and command execution in Docker containers.
 */

import { DOCKER_URL, dockerFetch, withDockerCredentials } from '~/lib/services/docker-api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DockerOperations');

// Type definitions for API responses
export interface DockerHealthResponse {
  ok: boolean;
}

export interface DockerExecResponse {
  output?: string;
  error?: string;
  ready?: boolean;
  port?: number;
  background?: boolean;
  success?: boolean;
  exitCode?: number;
}

export interface DockerLogsResponse {
  logs: string;
}

export interface DockerHealthCheckResponse {
  daytona?: boolean;
  previewUrl?: string;
  ports: Array<{ port: number; responding: boolean; type: string; url?: string; signed?: boolean }>;
}

// Module-level state for docker availability check
let dockerAvailable: boolean | null = null;
let lastDockerCheck = 0;
const DOCKER_CHECK_INTERVAL = 60000;

/**
 * Check if Docker backend is available
 */
export async function checkDockerAvailable(forceCheck = false): Promise<boolean> {
  const now = Date.now();
  if (!forceCheck && dockerAvailable === true) return true;
  if (!forceCheck && dockerAvailable === false && (now - lastDockerCheck) < DOCKER_CHECK_INTERVAL) {
    return false;
  }

  if (!DOCKER_URL) return false;

  try {
    const res = await dockerFetch<DockerHealthResponse>('/health', { signal: AbortSignal.timeout(3000) });
    dockerAvailable = res.ok === true;
    lastDockerCheck = now;
  } catch {
    dockerAvailable = false;
    lastDockerCheck = now;
  }
  return dockerAvailable === true;
}

/**
 * Context for Docker operations - contains project-specific info
 */
export interface DockerContext {
  projectId: string;
  onContainerReady?: () => void;
}

/**
 * Create a Docker container for a project
 */
export async function ensureDockerReady(ctx: DockerContext): Promise<boolean> {
  if (!DOCKER_URL) {
    throw new Error('Docker backend not configured');
  }

  try {
    const { ensureContainerExists } = await import('~/lib/stores/workbench');
    const ready = await ensureContainerExists(ctx.projectId);
    if (!ready) {
      throw new Error('Container creation failed');
    }

    logger.info(`Docker container ready for project: ${ctx.projectId}`);
    if (ctx.onContainerReady) {
      ctx.onContainerReady();
    }
    return true;
  } catch (e) {
    logger.error('Failed to create Docker container:', e);
    throw e;
  }
}

/**
 * Write a file to the Docker container
 */
export async function dockerWriteFile(
  projectId: string,
  path: string,
  content: string
): Promise<void> {
  const fullPath = path.startsWith('/') ? path : `/workspace/${path}`;
  const res = await fetch(`${DOCKER_URL}/api/file/${projectId}`, withDockerCredentials({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: fullPath, content }),
  }));
  if (!res.ok) {
    const errData = await res.json() as { error?: string };
    throw new Error(errData.error || 'Docker write failed');
  }
}

/**
 * Execute a command in the Docker container
 */
export async function dockerExec(
  projectId: string,
  command: string,
  cwd: string = '',
  background: boolean = false
): Promise<string> {
  const workDir = cwd ? (cwd.startsWith('/') ? cwd : `/workspace/${cwd}`) : '/workspace';
  const res = await fetch(`${DOCKER_URL}/api/exec/${projectId}`, withDockerCredentials({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ command, cwd: workDir, background }),
  }));
  const data = await res.json() as DockerExecResponse;
  if (!res.ok) throw new Error(data.error || 'Docker exec failed');

  // Check if command failed based on success flag or exit code
  if (data.success === false || (data.exitCode !== undefined && data.exitCode !== 0)) {
    throw new Error(data.error || data.output || `Command failed with exit code ${data.exitCode}`);
  }

  // For background processes, log the ready status
  if (background && data.background) {
    if (data.ready) {
      logger.info(`✅ Dev server verified ready on port ${data.port}`);
    } else {
      logger.warn(`⚠️ Dev server started but not ready yet (may still be building)`);
    }
  }

  return data.output || '';
}

/**
 * Create a directory in the Docker container
 */
export async function dockerMkdir(projectId: string, path: string): Promise<void> {
  const fullPath = path.startsWith('/') ? path : `/workspace/${path}`;
  await dockerExec(projectId, `mkdir -p "${fullPath}"`);
}

/**
 * Read a file from the Docker container
 */
export async function dockerReadFile(projectId: string, path: string): Promise<string> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const res = await fetch(`${DOCKER_URL}/api/exec/${projectId}`, withDockerCredentials({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ command: `cat "/workspace${normalizedPath}"` }),
  }));
  if (!res.ok) {
    throw new Error('Docker read failed');
  }
  const data = await res.json() as DockerExecResponse;
  return data.output || '';
}

/**
 * Check if a file exists in the Docker container
 */
export async function dockerFileExists(projectId: string, path: string): Promise<boolean> {
  try {
    const filePath = path.startsWith('/') ? path : `/workspace/${path}`;
    const check = await dockerExec(projectId, `test -f "${filePath}" && echo "exists" || echo "missing"`);
    return check.includes('exists');
  } catch {
    return false;
  }
}

/**
 * Wait for a file to exist (useful when file is being created by another action)
 */
export async function waitForFile(
  projectId: string,
  path: string,
  timeoutMs: number = 5000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await dockerFileExists(projectId, path)) {
      return true;
    }
    await new Promise(r => setTimeout(r, 200));
  }

  return false;
}

// Auto-check Docker availability on module load (browser only)
if (typeof window !== 'undefined') {
  checkDockerAvailable();
}
