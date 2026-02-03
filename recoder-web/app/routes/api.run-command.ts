/**
 * Run Command API - Execute shell commands in Docker sandbox
 *
 * POST /api/run-command
 * Request body:
 *   - command: string (required) - The command to execute
 *   - projectId: string (required) - The project/container to execute in
 *   - cwd: string (optional) - Working directory (default: /workspace)
 *   - timeout: number (optional) - Timeout in ms (default: 60000)
 *   - background: boolean (optional) - Run in background (default: false)
 *   - stream: boolean (optional) - Stream output (default: false)
 *
 * Response:
 *   - success: boolean
 *   - output: string (stdout)
 *   - error: string (stderr if any)
 *   - exitCode: number
 *   - message: string
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';

interface RunCommandRequest {
  command: string;
  projectId: string;
  cwd?: string;
  timeout?: number;
  background?: boolean;
  stream?: boolean;
}

interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  message?: string;
  background?: boolean;
  ready?: boolean;
  port?: number;
  fileNotFound?: boolean;
}

// Get docker backend URL
function getDockerBackendUrl(): string {
  return process.env.VITE_DOCKER_BACKEND_URL || 'http://localhost:3100';
}

// Get session token from cookies
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
 * Execute command via docker-backend with streaming support
 */
async function executeCommandWithStreaming(
  projectId: string,
  command: string,
  options: {
    cwd?: string;
    timeout?: number;
    background?: boolean;
    token?: string | null;
  }
): Promise<ReadableStream<Uint8Array>> {
  const dockerUrl = getDockerBackendUrl();
  const { cwd = '/workspace', timeout = 60000, background = false, token } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${dockerUrl}/api/exec/${projectId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        command,
        cwd,
        background,
      }),
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

      // Create error stream
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                success: false,
                error: errorMessage,
                exitCode: 1,
                message: 'Command execution failed',
              })
            )
          );
          controller.close();
        },
      });
    }

    // If response body is a stream, return it for streaming
    if (response.body) {
      // For streaming, transform the response into SSE format
      const reader = response.body.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      return new ReadableStream({
        async start(controller) {
          try {
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                // Flush any remaining buffer
                if (buffer.trim()) {
                  controller.enqueue(encoder.encode(`data: ${buffer}\n\n`));
                }
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
                break;
              }

              buffer += decoder.decode(value, { stream: true });

              // Send each line as an SSE event
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep last incomplete line in buffer

              for (const line of lines) {
                if (line.trim()) {
                  controller.enqueue(encoder.encode(`data: ${line}\n\n`));
                }
              }
            }
          } catch (error) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Stream error' })}\n\n`
              )
            );
            controller.close();
          }
        },
      });
    }

    // Fallback: parse JSON response
    const result = await response.json();
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify(result)));
        controller.close();
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);

    const encoder = new TextEncoder();
    let errorMessage = 'Unknown error';

    if (error instanceof DOMException && error.name === 'AbortError') {
      errorMessage = `Command timed out after ${timeout}ms`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              success: false,
              error: errorMessage,
              exitCode: 124, // Standard timeout exit code
              message: 'Command execution failed',
            })
          )
        );
        controller.close();
      },
    });
  }
}

/**
 * Execute command via docker-backend (non-streaming)
 */
async function executeCommand(
  projectId: string,
  command: string,
  options: {
    cwd?: string;
    timeout?: number;
    background?: boolean;
    token?: string | null;
  }
): Promise<CommandResult> {
  const dockerUrl = getDockerBackendUrl();
  const { cwd = '/workspace', timeout = 60000, background = false, token } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${dockerUrl}/api/exec/${projectId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        command,
        cwd,
        background,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;
      let exitCode = 1;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || `HTTP ${response.status}`;
        exitCode = errorJson.exitCode ?? 1;
      } catch {
        errorMessage = errorText || `HTTP ${response.status}`;
      }

      return {
        success: false,
        error: errorMessage,
        exitCode,
        message: 'Command execution failed',
      };
    }

    const result = (await response.json()) as CommandResult;

    return {
      success: result.success ?? true,
      output: result.output || '',
      error: result.error,
      exitCode: result.exitCode ?? 0,
      message: result.success ? 'Command executed successfully' : 'Command failed',
      background: result.background,
      ready: result.ready,
      port: result.port,
      fileNotFound: result.fileNotFound,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        success: false,
        error: `Command timed out after ${timeout}ms`,
        exitCode: 124, // Standard timeout exit code
        message: 'Command execution timed out',
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      exitCode: 1,
      message: 'Command execution failed',
    };
  }
}

/**
 * POST /api/run-command - Execute a command in Docker sandbox
 */
export async function action({ request }: ActionFunctionArgs) {
  // Verify user authentication
  const session = await verifySession(request);

  if (!session?.user) {
    return json(
      {
        success: false,
        error: 'Authentication required',
        message: 'Please log in to execute commands',
      } as CommandResult,
      { status: 401 }
    );
  }

  // Parse request body
  let body: RunCommandRequest;
  try {
    body = (await request.json()) as RunCommandRequest;
  } catch {
    return json(
      {
        success: false,
        error: 'Invalid JSON in request body',
      } as CommandResult,
      { status: 400 }
    );
  }

  const { command, projectId, cwd = '/workspace', timeout = 60000, background = false, stream = false } = body;

  // Validate required fields
  if (!command || typeof command !== 'string') {
    return json(
      {
        success: false,
        error: 'Command is required',
      } as CommandResult,
      { status: 400 }
    );
  }

  if (!projectId || typeof projectId !== 'string') {
    return json(
      {
        success: false,
        error: 'Project ID is required',
      } as CommandResult,
      { status: 400 }
    );
  }

  // Get auth token for docker-backend
  const token = getSessionToken(request);

  console.log(`[run-command] User: ${session.user.email}, Project: ${projectId}, Command: ${command.substring(0, 100)}`);

  // Handle streaming response
  if (stream) {
    const streamResponse = await executeCommandWithStreaming(projectId, command, {
      cwd,
      timeout,
      background,
      token,
    });

    return new Response(streamResponse, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  // Non-streaming response
  const result = await executeCommand(projectId, command, {
    cwd,
    timeout,
    background,
    token,
  });

  return json(result, {
    status: result.success ? 200 : 500,
  });
}

/**
 * GET /api/run-command - Return API info
 */
export async function loader() {
  return json({
    name: 'run-command',
    description: 'Execute shell commands in Docker sandbox',
    methods: ['POST'],
    parameters: {
      command: {
        type: 'string',
        required: true,
        description: 'The shell command to execute',
      },
      projectId: {
        type: 'string',
        required: true,
        description: 'The project/container ID to execute in',
      },
      cwd: {
        type: 'string',
        required: false,
        default: '/workspace',
        description: 'Working directory for command execution',
      },
      timeout: {
        type: 'number',
        required: false,
        default: 60000,
        description: 'Timeout in milliseconds',
      },
      background: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Run command in background (for dev servers)',
      },
      stream: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Stream output using Server-Sent Events',
      },
    },
    response: {
      success: 'boolean - Whether the command succeeded',
      output: 'string - Command stdout',
      error: 'string - Command stderr or error message',
      exitCode: 'number - Command exit code',
      message: 'string - Human-readable status message',
    },
  });
}
