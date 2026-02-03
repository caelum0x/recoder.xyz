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

// Get docker backend URL
function getDockerBackendUrl(): string {
  return process.env.VITE_DOCKER_BACKEND_URL || 'http://localhost:3100';
}

// Get session token from cookies for authentication with docker-backend
function getSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
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
 * Stop and optionally remove a Docker container via docker-backend
 */
async function killSandbox(
  projectId: string,
  options: {
    removeContainer?: boolean;
    timeout?: number;
    token?: string | null;
  }
): Promise<KillSandboxResult> {
  const dockerUrl = getDockerBackendUrl();
  const { timeout = 30000, token } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    // The docker-backend DELETE /api/container/:projectId endpoint
    // stops and removes the container
    const response = await fetch(`${dockerUrl}/api/container/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || `HTTP ${response.status}`;
      } catch {
        errorMessage = errorText || `HTTP ${response.status}`;
      }

      // 404 means container not found - treat as success (nothing to kill)
      if (response.status === 404) {
        return {
          success: true,
          sandboxKilled: false,
          message: 'No active sandbox found for this project',
        };
      }

      return {
        success: false,
        sandboxKilled: false,
        error: errorMessage,
        message: 'Failed to stop sandbox',
      };
    }

    const result = await response.json() as { success?: boolean };

    return {
      success: true,
      sandboxKilled: true,
      message: 'Sandbox stopped and cleaned up successfully',
    };
  } catch (error) {
    clearTimeout(timeoutId);

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
      error: error instanceof Error ? error.message : 'Unknown error',
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

  // Get auth token for docker-backend
  const token = getSessionToken(request);

  console.log(`[kill-sandbox] User: ${session.user.email}, Project: ${projectId}, Remove: ${removeContainer}`);

  // Kill the sandbox
  const result = await killSandbox(projectId, {
    removeContainer,
    timeout,
    token,
  });

  if (result.sandboxKilled) {
    console.log(`[kill-sandbox] Successfully stopped sandbox for project: ${projectId}`);
  } else if (result.success) {
    console.log(`[kill-sandbox] No sandbox to kill for project: ${projectId}`);
  } else {
    console.error(`[kill-sandbox] Failed to stop sandbox for project: ${projectId}`, result.error);
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
