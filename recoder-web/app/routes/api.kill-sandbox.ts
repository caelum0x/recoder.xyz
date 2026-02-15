/**
 * Kill Sandbox API - Stop and remove Docker container for a project
 *
 * POST /api/kill-sandbox
 * Request body:
 *   - projectId: string (required) - The project/container ID to stop
 *   - removeContainer: boolean (optional) - Whether to remove the container (default: true)
 *   - timeout: number (optional) - Timeout in ms for stop operation (default: 30000)
 *
 * Response:
 *   - success: boolean
 *   - sandboxKilled: boolean - Whether a sandbox was actually stopped
 *   - message: string - Human-readable status message
 *   - error: string (if failed) - Error message
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('KillSandbox');
import { DockerHttpError, createDockerAuthHeaders, dockerFetchJson, getDockerBackendUrl } from '~/lib/http/docker-server';

interface KillSandboxRequest {
  projectId: string;
  removeContainer?: boolean;
  timeout?: number;
}

interface KillSandboxResult {
  success: boolean;
  sandboxKilled: boolean;
  message: string;
  error?: string;
}

/**
 * Stop and optionally remove a Docker container via docker-backend
 */
async function killSandbox(
  request: Request,
  projectId: string,
  options: {
    removeContainer?: boolean;
    timeout?: number;
  }
): Promise<KillSandboxResult> {
  const dockerUrl = getDockerBackendUrl();
  const { timeout = 30000 } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const headers = createDockerAuthHeaders(request);

  try {
    // The docker-backend DELETE /api/container/:projectId endpoint
    // stops and removes the container.
    await dockerFetchJson<{ success?: boolean }>(
      `${dockerUrl}/api/container/${encodeURIComponent(projectId)}`,
      {
        method: 'DELETE',
        signal: controller.signal,
      },
      headers,
    );
    clearTimeout(timeoutId);

    return {
      success: true,
      sandboxKilled: true,
      message: 'Sandbox stopped and cleaned up successfully',
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof DockerHttpError) {
      // 404 means container not found - treat as success (nothing to kill).
      if (error.status === 404) {
        return {
          success: true,
          sandboxKilled: false,
          message: 'No active sandbox found for this project',
        };
      }

      const dockerPayload = error.payload as { error?: string } | null;
      return {
        success: false,
        sandboxKilled: false,
        error: dockerPayload?.error || error.message || `Failed to stop sandbox (HTTP ${error.status})`,
        message: 'Failed to stop sandbox',
      };
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        success: false,
        sandboxKilled: false,
        error: `Operation timed out after ${timeout}ms`,
        message: 'Sandbox stop operation timed out',
      };
    }

    // Network errors - docker-backend might be unreachable
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        success: false,
        sandboxKilled: false,
        error: 'Docker backend is unreachable',
        message: 'Failed to connect to sandbox service',
      };
    }

    return {
      success: false,
      sandboxKilled: false,
      error: 'Failed to stop sandbox',
      message: 'Failed to stop sandbox',
    };
  }
}

/**
 * POST /api/kill-sandbox - Stop and remove Docker container for a project
 */
export async function action({ request }: ActionFunctionArgs) {
  // Verify user authentication
  const session = await verifySession(request);

  if (!session?.user) {
    return json(
      {
        success: false,
        sandboxKilled: false,
        error: 'Authentication required',
        message: 'Please log in to manage sandboxes',
      } as KillSandboxResult,
      { status: 401 }
    );
  }

  // Parse request body
  let body: KillSandboxRequest;
  try {
    body = (await request.json()) as KillSandboxRequest;
  } catch {
    return json(
      {
        success: false,
        sandboxKilled: false,
        error: 'Invalid JSON in request body',
        message: 'Request parsing failed',
      } as KillSandboxResult,
      { status: 400 }
    );
  }

  const { projectId, removeContainer = true, timeout = 30000 } = body;

  // Validate required fields
  if (!projectId || typeof projectId !== 'string') {
    return json(
      {
        success: false,
        sandboxKilled: false,
        error: 'Project ID is required',
        message: 'Missing project identifier',
      } as KillSandboxResult,
      { status: 400 }
    );
  }

  // Sanitize project ID (basic validation)
  const sanitizedProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (sanitizedProjectId !== projectId) {
    return json(
      {
        success: false,
        sandboxKilled: false,
        error: 'Invalid project ID format',
        message: 'Project ID contains invalid characters',
      } as KillSandboxResult,
      { status: 400 }
    );
  }

  logger.info(`[kill-sandbox] User: ${session.user.email}, Project: ${projectId}, Remove: ${removeContainer}`);

  // Kill the sandbox
  const result = await killSandbox(request, projectId, {
    removeContainer,
    timeout,
  });

  if (result.sandboxKilled) {
    logger.info(`[kill-sandbox] Successfully stopped sandbox for project: ${projectId}`);
  } else if (result.success) {
    logger.info(`[kill-sandbox] No sandbox to kill for project: ${projectId}`);
  } else {
    logger.error(`[kill-sandbox] Failed to stop sandbox for project: ${projectId}`, result.error);
  }

  return json(result, {
    status: result.success ? 200 : 500,
  });
}

/**
 * GET /api/kill-sandbox - Return API info
 */
export async function loader() {
  return json({
    name: 'kill-sandbox',
    description: 'Stop and remove Docker container for a project',
    methods: ['POST'],
    parameters: {
      projectId: {
        type: 'string',
        required: true,
        description: 'The project/container ID to stop',
      },
      removeContainer: {
        type: 'boolean',
        required: false,
        default: true,
        description: 'Whether to remove the container after stopping (default: true)',
      },
      timeout: {
        type: 'number',
        required: false,
        default: 30000,
        description: 'Timeout in milliseconds for the stop operation',
      },
    },
    response: {
      success: 'boolean - Whether the operation succeeded',
      sandboxKilled: 'boolean - Whether a sandbox was actually stopped',
      message: 'string - Human-readable status message',
      error: 'string (optional) - Error message if operation failed',
    },
  });
}
