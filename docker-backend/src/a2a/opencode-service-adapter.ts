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
 * that Recoder Spaces, recoder-agents, and the A2A layer all converge on.
 *
 * Uses the shared @recoder/shared/opencode-client for the HTTP transport
 * so the implementation stays in sync across packages.
 */

import {
  createRecoderOpencodeClient,
  type RecoderOpencodeClient,
  type SessionInfo,
  type MessageWithParts,
  type PromptInput,
} from '@recoder/shared/opencode-client';
import { createLogger } from '../logger';

const logger = createLogger('opencode-service');

// Re-export types for consumers
export type { SessionInfo, MessageWithParts, PromptInput } from '@recoder/shared/opencode-client';

// ── Shared client singleton ─────────────────────────────────────────

let _client: RecoderOpencodeClient | undefined;

function getServiceUrl(): string {
  return process.env.OPENCODE_SERVICE_URL || 'http://localhost:4096';
}

function getClient(): RecoderOpencodeClient {
  if (!_client) {
    _client = createRecoderOpencodeClient({
      baseUrl: getServiceUrl(),
      password: process.env.OPENCODE_SERVER_PASSWORD,
      username: process.env.OPENCODE_SERVER_USERNAME,
    });
  }
  return _client;
}

/** Reset client (for tests or config changes). */
export function resetClient(): void {
  _client = undefined;
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
  const client = getClient();
  const existingId = projectSessions.get(projectId);

  if (existingId) {
    try {
      return await client.getSession(existingId, opts?.directory);
    } catch {
      projectSessions.delete(projectId);
    }
  }

  const session = await client.createSession({
    directory: opts?.directory ?? '/workspace',
    title: opts?.title ?? `Recoder project ${projectId}`,
  });

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
  const client = getClient();

  logger.info({ projectId, sessionId: session.id, agent: input.agent }, 'Sending prompt');

  const result = await client.prompt(session.id, input, opts?.directory);

  logger.info({ projectId, sessionId: session.id, messageId: result.info.id }, 'Prompt completed');
  return result;
}

/**
 * Abort the project's active session.
 */
export async function abortProject(projectId: string): Promise<boolean> {
  const sessionId = projectSessions.get(projectId);
  if (!sessionId) return false;
  return getClient().abortSession(sessionId);
}

/**
 * Get file diff from a specific message.
 */
export async function getProjectDiff(projectId: string, messageID: string): Promise<unknown[]> {
  const sessionId = projectSessions.get(projectId);
  if (!sessionId) return [];
  return getClient().getDiff(sessionId, messageID);
}

/**
 * Get messages from the project session.
 */
export async function getProjectMessages(projectId: string): Promise<MessageWithParts[]> {
  const sessionId = projectSessions.get(projectId);
  if (!sessionId) return [];
  return getClient().getMessages(sessionId);
}

/**
 * Run shell command in the session context.
 */
export async function shellInProject(projectId: string, command: string): Promise<unknown> {
  const sessionId = projectSessions.get(projectId);
  if (!sessionId) throw new Error(`No opencode session for project ${projectId}`);
  return getClient().shell(sessionId, { command });
}

/**
 * Set BYOK provider credentials.
 */
export async function setProviderKey(providerID: string, token: string): Promise<boolean> {
  return getClient().setAuth(providerID, { type: 'api_key', token });
}

/**
 * Dispose a project session.
 */
export async function disposeProjectSession(projectId: string): Promise<void> {
  const sessionId = projectSessions.get(projectId);
  if (!sessionId) return;

  try {
    await getClient().deleteSession(sessionId);
  } catch { /* best effort */ }

  projectSessions.delete(projectId);
  logger.info({ projectId }, 'Disposed opencode session');
}

/**
 * Check if the opencode service is reachable.
 */
export async function isServiceHealthy(): Promise<boolean> {
  return getClient().ping();
}

/**
 * Get all active project → session mappings.
 */
export function getActiveProjects(): Array<{ projectId: string; sessionId: string }> {
  return Array.from(projectSessions.entries()).map(([projectId, sessionId]) => ({ projectId, sessionId }));
}

/**
 * Clear the project → session map (for tests).
 */
export function clearProjectSessions(): void {
  projectSessions.clear();
}
