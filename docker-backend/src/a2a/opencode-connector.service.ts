/**
 * @module opencode-connector
 *
 * OpenCode connector runtime for deep coding sessions.
 *
 * OpenCode provides a durable coding runtime with:
 *   - Persistent session state across prompts
 *   - Built-in file edit, bash, grep, glob tools
 *   - Streaming LLM responses with tool execution
 *   - Git-aware patching and snapshot support
 *
 * This connector wraps OpenCode's HTTP API so docker-backend can use it
 * as a backend coding runtime for "Deep Coding Mode" tasks.
 *
 * Architecture:
 *   docker-backend → HTTP → opencode server (in sandbox) → LLM + tools → workspace
 *
 * The opencode server runs inside the Daytona sandbox alongside the user's project.
 * docker-backend sends prompts and receives streaming events over HTTP.
 */

import { createLogger } from '../logger';

const logger = createLogger('opencode-connector');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenCodeSession {
  id: string;
  projectId: string;
  sandboxId: string;
  serverUrl: string;
  createdAt: string;
  lastPromptAt?: string;
  status: 'starting' | 'ready' | 'busy' | 'disposed';
}

export interface PromptResult {
  messageId: string;
  parts: Array<{
    type: 'text' | 'tool-call' | 'tool-result' | 'file' | 'patch' | 'step-start' | 'step-finish';
    content: string;
    metadata?: Record<string, unknown>;
  }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cost?: number;
  };
  error?: string;
}

export type StreamEvent =
  | { type: 'text-delta'; content: string }
  | { type: 'tool-call'; toolName: string; args: Record<string, unknown> }
  | { type: 'tool-result'; toolName: string; output: string; success: boolean }
  | { type: 'step-start'; title: string }
  | { type: 'step-finish'; title: string; durationMs: number }
  | { type: 'finish'; usage?: PromptResult['usage'] }
  | { type: 'error'; message: string };

// ---------------------------------------------------------------------------
// Session registry
// ---------------------------------------------------------------------------

const activeSessions = new Map<string, OpenCodeSession>();

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Start an OpenCode session in a Daytona sandbox.
 *
 * This installs opencode (if not present) and starts the HTTP server
 * inside the sandbox, then returns a session handle.
 */
export async function startSession(params: {
  projectId: string;
  sandboxId: string;
  sandboxExecUrl: string;
  daytonaApiKey: string;
  model?: string;
  provider?: string;
  apiKey?: string;
}): Promise<OpenCodeSession> {
  const { projectId, sandboxId, sandboxExecUrl, daytonaApiKey } = params;

  // Check for existing session
  const existing = activeSessions.get(projectId);
  if (existing && existing.status === 'ready') {
    return existing;
  }

  const session: OpenCodeSession = {
    id: `oc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    projectId,
    sandboxId,
    serverUrl: '', // Set after server starts
    createdAt: new Date().toISOString(),
    status: 'starting',
  };

  activeSessions.set(projectId, session);

  try {
    const headers = {
      Authorization: `Bearer ${daytonaApiKey}`,
      'Content-Type': 'application/json',
    };

    // Install opencode if not present
    const installCmd = 'command -v opencode || npm install -g opencode@latest 2>/dev/null || npx opencode --version';
    await fetch(sandboxExecUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ command: installCmd }),
      signal: AbortSignal.timeout(60_000),
    });

    // Start opencode server in background on port 3333
    const envVars = [
      params.apiKey ? `OPENAI_API_KEY=${params.apiKey}` : '',
      params.apiKey ? `ANTHROPIC_API_KEY=${params.apiKey}` : '',
      params.provider === 'openrouter' && params.apiKey ? `OPENROUTER_API_KEY=${params.apiKey}` : '',
    ].filter(Boolean).join(' ');

    const startCmd = `${envVars} nohup opencode server --port 3333 --dir /home/daytona > /tmp/opencode-server.log 2>&1 &`;
    await fetch(sandboxExecUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ command: `sh -c "${startCmd}"` }),
      signal: AbortSignal.timeout(15_000),
    });

    // Wait for server to be ready (up to 30s)
    const serverUrl = `http://localhost:3333`;
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const checkResult = await fetch(sandboxExecUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ command: `curl -sf ${serverUrl}/path 2>/dev/null && echo READY || echo WAITING` }),
          signal: AbortSignal.timeout(5_000),
        });
        const data = await checkResult.json() as { result?: string; stdout?: string };
        const output = data.result ?? data.stdout ?? '';
        if (output.includes('READY')) {
          ready = true;
          break;
        }
      } catch { /* retry */ }
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!ready) {
      session.status = 'disposed';
      throw new Error('OpenCode server failed to start within 30s');
    }

    session.serverUrl = serverUrl;
    session.status = 'ready';
    activeSessions.set(projectId, session);

    logger.info({ projectId, sandboxId, sessionId: session.id }, 'OpenCode session started');
    return session;
  } catch (err) {
    session.status = 'disposed';
    activeSessions.delete(projectId);
    logger.error({ err, projectId }, 'Failed to start OpenCode session');
    throw err;
  }
}

/**
 * Send a prompt to an OpenCode session and collect the full response.
 *
 * For streaming, use sendPromptStreaming() instead.
 */
export async function sendPrompt(params: {
  projectId: string;
  prompt: string;
  sandboxExecUrl: string;
  daytonaApiKey: string;
  agent?: string;
}): Promise<PromptResult> {
  const session = activeSessions.get(params.projectId);
  if (!session || session.status !== 'ready') {
    throw new Error(`No ready OpenCode session for project ${params.projectId}`);
  }

  session.status = 'busy';
  session.lastPromptAt = new Date().toISOString();

  const headers = {
    Authorization: `Bearer ${params.daytonaApiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    // Create a session in opencode if none exists, then send the message
    // First, list sessions to find or create one
    const listResult = await fetch(params.sandboxExecUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        command: `curl -sf ${session.serverUrl}/session 2>/dev/null || echo '[]'`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const listData = await listResult.json() as { result?: string; stdout?: string };
    const sessions = JSON.parse(listData.result ?? listData.stdout ?? '[]');

    let sessionId: string;
    if (Array.isArray(sessions) && sessions.length > 0) {
      sessionId = sessions[0].id;
    } else {
      // Create a new session
      const createResult = await fetch(params.sandboxExecUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          command: `curl -sf -X POST ${session.serverUrl}/session -H 'Content-Type: application/json' -d '{}' 2>/dev/null`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const createData = await createResult.json() as { result?: string; stdout?: string };
      const created = JSON.parse(createData.result ?? createData.stdout ?? '{}');
      sessionId = created.id;
    }

    // Send the prompt
    const promptBody = JSON.stringify({
      agent: params.agent ?? 'build',
      parts: [{ type: 'text', text: params.prompt }],
    });

    const promptResult = await fetch(params.sandboxExecUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        command: `curl -sf -X POST '${session.serverUrl}/session/${sessionId}/message' -H 'Content-Type: application/json' -d '${promptBody.replace(/'/g, "'\\''")}'`,
      }),
      signal: AbortSignal.timeout(300_000), // 5 min for complex tasks
    });

    const resultData = await promptResult.json() as { result?: string; stdout?: string };
    const rawOutput = resultData.result ?? resultData.stdout ?? '';

    // Parse the response
    let parsed: any;
    try {
      parsed = JSON.parse(rawOutput);
    } catch {
      parsed = { parts: [{ type: 'text', content: rawOutput }] };
    }

    const parts = (parsed.parts ?? []).map((p: any) => ({
      type: p.type ?? 'text',
      content: p.text ?? p.output ?? p.content ?? JSON.stringify(p),
      metadata: p.metadata,
    }));

    session.status = 'ready';

    return {
      messageId: parsed.info?.id ?? `msg_${Date.now()}`,
      parts,
      usage: parsed.info?.usage ? {
        inputTokens: parsed.info.usage.tokens?.input ?? 0,
        outputTokens: parsed.info.usage.tokens?.output ?? 0,
        cost: parsed.info.usage.cost,
      } : undefined,
    };
  } catch (err) {
    session.status = 'ready';
    logger.error({ err, projectId: params.projectId }, 'OpenCode prompt failed');
    throw err;
  }
}

/**
 * Get the current state of an OpenCode session.
 */
export function getSession(projectId: string): OpenCodeSession | undefined {
  return activeSessions.get(projectId);
}

/**
 * Dispose an OpenCode session (stop the server).
 */
export async function disposeSession(params: {
  projectId: string;
  sandboxExecUrl: string;
  daytonaApiKey: string;
}): Promise<void> {
  const session = activeSessions.get(params.projectId);
  if (!session) return;

  try {
    await fetch(params.sandboxExecUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.daytonaApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        command: `curl -sf -X POST ${session.serverUrl}/instance/dispose 2>/dev/null; pkill -f 'opencode server' 2>/dev/null || true`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Best effort
  }

  activeSessions.delete(params.projectId);
  logger.info({ projectId: params.projectId }, 'OpenCode session disposed');
}

/**
 * List all active sessions.
 */
export function listSessions(): OpenCodeSession[] {
  return Array.from(activeSessions.values());
}
