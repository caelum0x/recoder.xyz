/**
 * @module opencode-service-adapter
 *
 * Adapter that connects docker-backend to an opencode HTTP service.
 *
 * Two modes:
 *   1. Centralized: opencode runs as a shared service (e.g. docker container
 *      alongside docker-backend). All projects share one server, each gets
 *      its own session. Set OPENCODE_SERVICE_URL env var.
 *
 *   2. Per-sandbox: opencode runs inside each Daytona sandbox. docker-backend
 *      starts it on demand and talks to it through the sandbox exec proxy.
 *      This is the legacy path (opencode-connector.service.ts).
 *
 * This file implements mode 1 — the "opencode as a backend service" path
 * that recoder-web, recoder-agents, and the A2A layer all converge on.
 */

import { createLogger } from '../logger';

const logger = createLogger('opencode-service');

// ── Types (matching opencode's HTTP API shapes) ─────────────────────

export interface SessionInfo {
  id: string;
  title?: string;
  parentID?: string;
  version: number;
  time: { created: number; updated: number; archived?: number };
}

export interface MessagePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  [key: string]: unknown;
}

export interface MessageInfo {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant' | 'system';
  time: { created: number };
  [key: string]: unknown;
}

export interface MessageWithParts {
  info: MessageInfo;
  parts: MessagePart[];
}

export interface PromptInput {
  content: string;
  providerID?: string;
  modelID?: string;
  agent?: string;
  system?: string;
}

// ── HTTP client ─────────────────────────────────────────────────────

function getServiceUrl(): string {
  return process.env.OPENCODE_SERVICE_URL || 'http://localhost:4096';
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (password) {
    const username = process.env.OPENCODE_SERVER_USERNAME || 'opencode';
    headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }
  return headers;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: { directory?: string; timeoutMs?: number },
): Promise<T> {
  const baseUrl = getServiceUrl();
  const url = new URL(path, baseUrl);

  const headers = getAuthHeaders();
  if (opts?.directory) {
    headers['x-opencode-directory'] = encodeURIComponent(opts.directory);
    url.searchParams.set('directory', opts.directory);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 120_000);

  try {
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`opencode ${method} ${path} → ${res.status}: ${text}`);
    }

    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      return (await res.json()) as T;
    }
    return (await res.text()) as unknown as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Session management (per projectId) ──────────────────────────────

/** Map projectId → opencode sessionID */
const projectSessions = new Map<string, string>();

/**
 * Get or create an opencode session for a project.
 */
export async function getOrCreateSession(
  projectId: string,
  opts?: { directory?: string; title?: string },
): Promise<SessionInfo> {
  const existingId = projectSessions.get(projectId);

  if (existingId) {
    try {
      return await request<SessionInfo>('GET', `/session/${existingId}`, undefined, { directory: opts?.directory });
    } catch {
      projectSessions.delete(projectId);
    }
  }

  const session = await request<SessionInfo>('POST', '/session', {
    title: opts?.title ?? `Recoder project ${projectId}`,
  }, { directory: opts?.directory ?? '/workspace' });

  projectSessions.set(projectId, session.id);
  logger.info({ projectId, sessionId: session.id }, 'Created opencode session');
  return session;
}

/**
 * Send a prompt to the project's opencode session.
 */
export async function promptProject(
  projectId: string,
  input: PromptInput,
  opts?: { directory?: string },
): Promise<MessageWithParts> {
  const session = await getOrCreateSession(projectId, { directory: opts?.directory });

  logger.info({ projectId, sessionId: session.id, agent: input.agent }, 'Sending prompt');

  const result = await request<MessageWithParts>(
    'POST',
    `/session/${session.id}/message`,
    input,
    { directory: opts?.directory, timeoutMs: 300_000 },
  );

  logger.info({ projectId, sessionId: session.id, messageId: result.info.id }, 'Prompt completed');
  return result;
}

/**
 * Abort the project's active session.
 */
export async function abortProject(projectId: string): Promise<boolean> {
  const sessionId = projectSessions.get(projectId);
  if (!sessionId) return false;
  return request<boolean>('POST', `/session/${sessionId}/abort`);
}

/**
 * Get file diff from a specific message.
 */
export async function getProjectDiff(projectId: string, messageID: string): Promise<unknown[]> {
  const sessionId = projectSessions.get(projectId);
  if (!sessionId) return [];
  return request<unknown[]>('GET', `/session/${sessionId}/diff?messageID=${messageID}`);
}

/**
 * Get messages from the project session.
 */
export async function getProjectMessages(projectId: string): Promise<MessageWithParts[]> {
  const sessionId = projectSessions.get(projectId);
  if (!sessionId) return [];
  return request<MessageWithParts[]>('GET', `/session/${sessionId}/message`);
}

/**
 * Run shell command in the session context.
 */
export async function shellInProject(projectId: string, command: string): Promise<unknown> {
  const sessionId = projectSessions.get(projectId);
  if (!sessionId) throw new Error(`No opencode session for project ${projectId}`);
  return request<unknown>('POST', `/session/${sessionId}/shell`, { command }, { timeoutMs: 300_000 });
}

/**
 * Set BYOK provider credentials.
 */
export async function setProviderKey(providerID: string, token: string): Promise<boolean> {
  return request<boolean>('PUT', `/auth/${providerID}`, { type: 'api_key', token });
}

/**
 * Dispose a project session.
 */
export async function disposeProjectSession(projectId: string): Promise<void> {
  const sessionId = projectSessions.get(projectId);
  if (!sessionId) return;

  try {
    await request<boolean>('DELETE', `/session/${sessionId}`);
  } catch { /* best effort */ }

  projectSessions.delete(projectId);
  logger.info({ projectId }, 'Disposed opencode session');
}

/**
 * Check if the opencode service is reachable.
 */
export async function isServiceHealthy(): Promise<boolean> {
  try {
    await request<unknown>('GET', '/session', undefined, { timeoutMs: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all active project → session mappings.
 */
export function getActiveProjects(): Array<{ projectId: string; sessionId: string }> {
  return Array.from(projectSessions.entries()).map(([projectId, sessionId]) => ({ projectId, sessionId }));
}
