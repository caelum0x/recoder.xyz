"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTerminal = registerTerminal;
exports.deregisterTerminal = deregisterTerminal;
exports.heartbeat = heartbeat;
exports.getTerminal = getTerminal;
exports.listTerminals = listTerminals;
exports.listByType = listByType;
exports.countByType = countByType;
exports.listByProject = listByProject;
exports.getSummary = getSummary;
exports.pushToTerminal = pushToTerminal;
exports.broadcastToType = broadcastToType;
exports.sweepStale = sweepStale;
const logger_1 = require("../logger");
const a2a_event_bus_1 = require("./a2a-event-bus");
const logger = (0, logger_1.createLogger)('a2a-terminal-registry');
// ── Registry ────────────────────────────────────────────────────────
const terminals = new Map();
/**
 * Register a terminal session.
 * Called when a Claude Code, Codex, or other CLI connects.
 */
function registerTerminal(input) {
    const sessionId = input.sessionId || `${input.agentType}_${randomSuffix()}`;
    const existing = terminals.get(sessionId);
    if (existing) {
        // Update existing session
        existing.lastHeartbeatAt = new Date().toISOString();
        if (input.callbackUrl)
            existing.callbackUrl = input.callbackUrl;
        if (input.projectId)
            existing.projectId = input.projectId;
        if (input.workspaceDir)
            existing.workspaceDir = input.workspaceDir;
        return existing;
    }
    const count = countByType(input.agentType);
    const session = {
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
    logger.info({ sessionId, agentType: input.agentType, displayName: session.displayName }, 'Terminal registered');
    // Emit event
    try {
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `term_online_${sessionId}_${Date.now()}`,
            type: a2a_event_bus_1.A2AEventType.AgentOnline,
            timestamp: new Date().toISOString(),
            data: { session },
        });
    }
    catch { /* best effort */ }
    return session;
}
/**
 * Deregister a terminal session.
 */
function deregisterTerminal(sessionId) {
    const session = terminals.get(sessionId);
    if (!session)
        return;
    terminals.delete(sessionId);
    logger.info({ sessionId, agentType: session.agentType }, 'Terminal deregistered');
    try {
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `term_offline_${sessionId}_${Date.now()}`,
            type: a2a_event_bus_1.A2AEventType.AgentOffline,
            timestamp: new Date().toISOString(),
            data: { session },
        });
    }
    catch { /* best effort */ }
}
/**
 * Update heartbeat for a terminal.
 */
function heartbeat(sessionId, meta) {
    const session = terminals.get(sessionId);
    if (!session)
        return false;
    session.lastHeartbeatAt = new Date().toISOString();
    if (meta?.projectId)
        session.projectId = meta.projectId;
    if (meta?.workspaceDir)
        session.workspaceDir = meta.workspaceDir;
    return true;
}
// ── Queries ─────────────────────────────────────────────────────────
/** Get a terminal by session ID. */
function getTerminal(sessionId) {
    return terminals.get(sessionId);
}
/** List all active terminals. */
function listTerminals() {
    return Array.from(terminals.values());
}
/** List terminals of a specific agent type. */
function listByType(agentType) {
    return Array.from(terminals.values()).filter((t) => t.agentType === agentType);
}
/** Count terminals of a specific agent type. */
function countByType(agentType) {
    let count = 0;
    for (const t of terminals.values()) {
        if (t.agentType === agentType)
            count++;
    }
    return count;
}
/** List terminals working on a specific project. */
function listByProject(projectId) {
    return Array.from(terminals.values()).filter((t) => t.projectId === projectId);
}
/** Get a summary of all connected terminals by type. */
function getSummary() {
    const summary = {};
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
async function pushToTerminal(sessionId, event) {
    const session = terminals.get(sessionId);
    if (!session?.callbackUrl)
        return false;
    try {
        const res = await fetch(session.callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
            signal: AbortSignal.timeout(10_000),
        });
        return res.ok;
    }
    catch {
        return false;
    }
}
/**
 * Broadcast to all terminals of a given type.
 */
async function broadcastToType(agentType, event) {
    const targets = listByType(agentType);
    let sent = 0;
    let failed = 0;
    await Promise.all(targets.map(async (t) => {
        const ok = await pushToTerminal(t.sessionId, event);
        if (ok)
            sent++;
        else
            failed++;
    }));
    return { sent, failed };
}
/**
 * Clean up stale terminals (no heartbeat in the timeout window).
 */
function sweepStale(timeoutMs = 90_000) {
    const now = Date.now();
    const removed = [];
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
function randomSuffix() {
    return Math.random().toString(36).slice(2, 8);
}
function formatAgentType(type) {
    const names = {
        claude_code: 'Claude Code',
        codex: 'Codex',
        opencode: 'OpenCode',
        'recoder-code': 'Recoder Code',
        windsurf: 'Windsurf',
    };
    return names[type] || type;
}
function isRemoteUrl(url) {
    if (!url)
        return false;
    return !url.includes('localhost') && !url.includes('127.0.0.1') && !url.includes('host.docker.internal');
}
