/**
 * @module agent-terminal-registry
 *
 * Per-terminal agent discovery and session tracking for the A2A system.
 *
 * Problem: When 2 Claude Code + 1 Codex are connected, the A2A system
 * sees them all as "claude_code" or "codex" with no way to distinguish
 * which specific terminal instance is which. Messages go to "claude code"
 * but can't target "claude code terminal #2" specifically.
 *
 * Solution: Each CLI terminal registers with a unique session ID that
 * combines the agent type + a random suffix (e.g. "claude_code_abc123").
 * The registry tracks all active terminal sessions, their capabilities,
 * workspace context, and push callback URLs.
 *
 * This enables:
 *   - Knowing exactly how many Claude Code and Codex instances are online
 *   - Routing tasks to a specific terminal by session ID
 *   - Broadcasting to all terminals of a given type
 *   - Push notifications via callback URLs (or Zrok tunnels for remote)
 *   - Workspace-aware routing (send task to the terminal working on project X)
 */

import { createLogger } from '../logger';
import { getA2AEventBus, A2AEventType } from './a2a-event-bus';

const logger = createLogger('a2a-terminal-registry');

// ── Types ───────────────────────────────────────────────────────────

export type AgentType = 'claude_code' | 'codex' | 'opencode' | 'recoder-code' | 'windsurf' | string;

export interface TerminalSession {
  /** Unique session ID: e.g. "claude_code_abc123" */
  sessionId: string;
  /** Agent type: "claude_code", "codex", "opencode", etc. */
  agentType: AgentType;
  /** Human-readable name: "Claude Code #1" */
  displayName: string;
  /** Callback URL for push notifications */
  callbackUrl?: string;
  /** Which project/workspace this terminal is working on */
  projectId?: string;
  workspaceDir?: string;
  /** Capabilities this terminal supports */
  capabilities: string[];
  /** Connection metadata */
  connectedAt: string;
  lastHeartbeatAt: string;
  /** Version of the CLI tool */
  version?: string;
  /** Machine/hostname info for debugging */
  hostname?: string;
  /** Is this a remote terminal (needs Zrok tunnel)? */
  isRemote: boolean;
}

// ── Registry ────────────────────────────────────────────────────────

const terminals = new Map<string, TerminalSession>();

/**
 * Register a terminal session.
 * Called when a Claude Code, Codex, or other CLI connects.
 */
export function registerTerminal(input: {
  agentType: AgentType;
  sessionId?: string;
  displayName?: string;
  callbackUrl?: string;
  projectId?: string;
  workspaceDir?: string;
  capabilities?: string[];
  version?: string;
  hostname?: string;
}): TerminalSession {
  const sessionId = input.sessionId || `${input.agentType}_${randomSuffix()}`;
  const existing = terminals.get(sessionId);
  if (existing) {
    // Update existing session
    existing.lastHeartbeatAt = new Date().toISOString();
    if (input.callbackUrl) existing.callbackUrl = input.callbackUrl;
    if (input.projectId) existing.projectId = input.projectId;
    if (input.workspaceDir) existing.workspaceDir = input.workspaceDir;
    return existing;
  }

  const count = countByType(input.agentType);
  const session: TerminalSession = {
    sessionId,
    agentType: input.agentType,
    displayName: input.displayName || `${formatAgentType(input.agentType)} #${count + 1}`,
    callbackUrl: input.callbackUrl,
    projectId: input.projectId,
    workspaceDir: input.workspaceDir,
    capabilities: input.capabilities || ['chat', 'edit', 'shell'],
    connectedAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    version: input.version,
    hostname: input.hostname,
    isRemote: isRemoteUrl(input.callbackUrl),
  };

  terminals.set(sessionId, session);

  logger.info(
    { sessionId, agentType: input.agentType, displayName: session.displayName },
    'Terminal registered',
  );

  // Emit event
  try {
    getA2AEventBus().publish({
      id: `term_online_${sessionId}_${Date.now()}`,
      type: A2AEventType.AgentOnline,
      timestamp: new Date().toISOString(),
      data: { session },
    });
  } catch { /* best effort */ }

  return session;
}

/**
 * Deregister a terminal session.
 */
export function deregisterTerminal(sessionId: string): void {
  const session = terminals.get(sessionId);
  if (!session) return;

  terminals.delete(sessionId);

  logger.info({ sessionId, agentType: session.agentType }, 'Terminal deregistered');

  try {
    getA2AEventBus().publish({
      id: `term_offline_${sessionId}_${Date.now()}`,
      type: A2AEventType.AgentOffline,
      timestamp: new Date().toISOString(),
      data: { session },
    });
  } catch { /* best effort */ }
}

/**
 * Update heartbeat for a terminal.
 */
export function heartbeat(sessionId: string, meta?: { projectId?: string; workspaceDir?: string }): boolean {
  const session = terminals.get(sessionId);
  if (!session) return false;

  session.lastHeartbeatAt = new Date().toISOString();
  if (meta?.projectId) session.projectId = meta.projectId;
  if (meta?.workspaceDir) session.workspaceDir = meta.workspaceDir;
  return true;
}

// ── Queries ─────────────────────────────────────────────────────────

/** Get a terminal by session ID. */
export function getTerminal(sessionId: string): TerminalSession | undefined {
  return terminals.get(sessionId);
}

/** List all active terminals. */
export function listTerminals(): TerminalSession[] {
  return Array.from(terminals.values());
}

/** List terminals of a specific agent type. */
export function listByType(agentType: AgentType): TerminalSession[] {
  return Array.from(terminals.values()).filter((t) => t.agentType === agentType);
}

/** Count terminals of a specific agent type. */
export function countByType(agentType: AgentType): number {
  let count = 0;
  for (const t of terminals.values()) {
    if (t.agentType === agentType) count++;
  }
  return count;
}

/** List terminals working on a specific project. */
export function listByProject(projectId: string): TerminalSession[] {
  return Array.from(terminals.values()).filter((t) => t.projectId === projectId);
}

/** Get a summary of all connected terminals by type. */
export function getSummary(): Record<string, { count: number; sessions: string[] }> {
  const summary: Record<string, { count: number; sessions: string[] }> = {};

  for (const t of terminals.values()) {
    if (!summary[t.agentType]) {
      summary[t.agentType] = { count: 0, sessions: [] };
    }
    summary[t.agentType].count++;
    summary[t.agentType].sessions.push(t.sessionId);
  }

  return summary;
}

/**
 * Push a notification to a specific terminal.
 */
export async function pushToTerminal(
  sessionId: string,
  event: { type: string; data: unknown },
): Promise<boolean> {
  const session = terminals.get(sessionId);
  if (!session?.callbackUrl) return false;

  try {
    const res = await fetch(session.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Broadcast to all terminals of a given type.
 */
export async function broadcastToType(
  agentType: AgentType,
  event: { type: string; data: unknown },
): Promise<{ sent: number; failed: number }> {
  const targets = listByType(agentType);
  let sent = 0;
  let failed = 0;

  await Promise.all(
    targets.map(async (t) => {
      const ok = await pushToTerminal(t.sessionId, event);
      if (ok) sent++;
      else failed++;
    }),
  );

  return { sent, failed };
}

/**
 * Clean up stale terminals (no heartbeat in the timeout window).
 */
export function sweepStale(timeoutMs = 90_000): string[] {
  const now = Date.now();
  const removed: string[] = [];

  for (const [sessionId, session] of terminals) {
    const lastBeat = new Date(session.lastHeartbeatAt).getTime();
    if (now - lastBeat > timeoutMs) {
      terminals.delete(sessionId);
      removed.push(sessionId);
    }
  }

  if (removed.length > 0) {
    logger.info({ removed }, `Swept ${removed.length} stale terminal(s)`);
  }

  return removed;
}

// ── Helpers ─────────────────────────────────────────────────────────

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

function formatAgentType(type: string): string {
  const names: Record<string, string> = {
    claude_code: 'Claude Code',
    codex: 'Codex',
    opencode: 'OpenCode',
    'recoder-code': 'Recoder Code',
    windsurf: 'Windsurf',
  };
  return names[type] || type;
}

function isRemoteUrl(url?: string): boolean {
  if (!url) return false;
  return !url.includes('localhost') && !url.includes('127.0.0.1') && !url.includes('host.docker.internal');
}
