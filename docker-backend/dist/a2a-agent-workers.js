"use strict";
/**
 * @module a2a-agent-workers
 *
 * Wires internal Recoder agents (recoder_backend, recoder_web, recoder_pm,
 * recoder_agency) to the A2A agent bridge so they appear as connected agents
 * and can receive task assignments.
 *
 * Since these workers run inside the same docker-backend process, they register
 * directly with the AgentBridgeService singleton using a lightweight virtual
 * socket (EventEmitter that implements the subset of WebSocket the bridge needs).
 * This avoids authentication complexity and network overhead of connecting to self.
 *
 * Each agent listens for `task.assigned` messages and routes them to the
 * appropriate local service API endpoint. Results are sent back as
 * `task.complete` or `task.failed` messages.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAgentWorkers = startAgentWorkers;
exports.stopAgentWorkers = stopAgentWorkers;
exports.getActiveWorkerIds = getActiveWorkerIds;
const events_1 = require("events");
const logger_1 = require("./logger");
const agent_bridge_service_1 = require("./a2a/agent-bridge.service");
const logger = (0, logger_1.createLogger)('a2a-agent-workers');
const INTERNAL_AGENTS = [
    {
        agentId: 'recoder_backend',
        capabilities: ['execute', 'plan', 'review'],
        // Python backend runs on host via PM2, not in Docker
        baseUrl: process.env.RECODER_BACKEND_INTERNAL_URL || 'http://host.docker.internal:8000',
        taskEndpoint: '/v1/agent/start',
        // Backend expects FormData, not JSON
        method: 'POST',
        contentType: 'multipart/form-data',
        buildRequestBody: (task) => {
            const form = new FormData();
            form.append('prompt', task.prompt || '');
            if (task.taskId)
                form.append('thread_id', task.taskId);
            return form;
        },
    },
    {
        agentId: 'recoder_web',
        capabilities: ['execute', 'plan'],
        // recoder-web is a Docker container on the same network
        baseUrl: process.env.RECODER_WEB_INTERNAL_URL || 'http://recoder-web:5173',
        taskEndpoint: '/api/chat',
        buildRequestBody: (task) => ({
            message: task.prompt,
            context: task.context,
            taskId: task.taskId,
        }),
    },
    {
        agentId: 'recoder_pm',
        capabilities: ['plan', 'review'],
        // PM runs on host via PM2
        baseUrl: process.env.RECODER_PM_INTERNAL_URL || 'http://host.docker.internal:3004',
        taskEndpoint: '/api/a2a/task',
        buildRequestBody: (task) => ({
            prompt: task.prompt,
            context: task.context,
            taskId: task.taskId,
        }),
    },
    {
        agentId: 'recoder_agency',
        capabilities: ['execute', 'plan'],
        // Agency runs on host via PM2
        baseUrl: process.env.RECODER_AGENCY_INTERNAL_URL || 'http://host.docker.internal:3007',
        taskEndpoint: '/api/a2a/task',
        buildRequestBody: (task) => ({
            prompt: task.prompt,
            context: task.context,
            taskId: task.taskId,
        }),
    },
];
// ---------------------------------------------------------------------------
// Virtual WebSocket — a minimal EventEmitter that satisfies the bridge service
// ---------------------------------------------------------------------------
const WS_OPEN = 1; // WebSocket.OPEN
class VirtualSocket extends events_1.EventEmitter {
    readyState = WS_OPEN;
    _agentId;
    _onMessage = null;
    constructor(agentId) {
        super();
        this._agentId = agentId;
    }
    /**
     * Called by AgentBridgeService.sendToAgent — the bridge sends us messages
     * through this method. We parse them and dispatch to the handler.
     */
    send(data) {
        if (this._onMessage) {
            try {
                this._onMessage(data);
            }
            catch (err) {
                logger.error({ agentId: this._agentId, err }, 'virtual socket message handler error');
            }
        }
    }
    /** Register a handler for messages from the bridge */
    onBridgeMessage(handler) {
        this._onMessage = handler;
    }
    /** Simulate sending a message TO the bridge (from the agent) */
    sendToBridge(data) {
        this.emit('message', Buffer.from(data));
    }
    close(_code, _reason) {
        this.readyState = 3; // WebSocket.CLOSED
        this.emit('close');
    }
}
// ---------------------------------------------------------------------------
// Task execution
// ---------------------------------------------------------------------------
async function executeTask(config, task) {
    const url = `${config.baseUrl}${config.taskEndpoint}`;
    const body = config.buildRequestBody
        ? config.buildRequestBody(task)
        : { prompt: task.prompt, context: task.context, taskId: task.taskId };
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);
        const isFormData = body instanceof FormData;
        const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
        // Auth for service-to-service calls:
        // 1. Session token from the task requester's context (forwarded from the MCP bridge)
        // 2. Platform service account token from env (A2A_SERVICE_TOKEN)
        // 3. Internal service key as fallback
        const sessionToken = task.context?.sessionToken ||
            task.sessionToken ||
            process.env.A2A_SERVICE_TOKEN;
        if (sessionToken) {
            headers['Authorization'] = `Bearer ${sessionToken}`;
            if (isFormData) {
                // FormData needs headers set separately
                headers['Cookie'] = `recoder.session_token=${sessionToken}`;
            }
        }
        const internalKey = process.env.INTERNAL_SERVICE_KEY;
        if (internalKey) {
            headers['X-Internal-Service-Key'] = internalKey;
        }
        const response = await fetch(url, {
            method: config.method || 'POST',
            headers,
            body: isFormData ? body : JSON.stringify(body),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return {
                success: false,
                error: `HTTP ${response.status}: ${text.slice(0, 500)}`,
            };
        }
        const result = await response.json().catch(() => ({ ok: true }));
        return { success: true, result };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'unknown_error';
        // Log all failures to help debug A2A worker issues
        if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
            logger.warn({ agentId: config.agentId, url, error: message }, 'A2A worker: service not reachable');
        }
        else {
            logger.warn({ agentId: config.agentId, url, err: message }, 'task execution failed');
        }
        return { success: false, error: message };
    }
}
const activeWorkers = [];
let heartbeatTimer = null;
function wireAgent(config) {
    const bridge = (0, agent_bridge_service_1.getAgentBridgeService)();
    const socket = new VirtualSocket(config.agentId);
    // Register with the bridge as an internal agent
    // userId 'system' marks these as internal platform agents
    bridge.registerAgent(socket, config.agentId, 'system', config.capabilities, []);
    // Handle messages FROM the bridge (task assignments, pings, etc.)
    socket.onBridgeMessage((raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        }
        catch {
            return;
        }
        switch (msg.type) {
            case 'task.assigned': {
                const task = {
                    taskId: msg.taskId,
                    prompt: msg.prompt,
                    context: msg.context,
                    worktreeBranch: msg.worktreeBranch,
                };
                logger.info({ agentId: config.agentId, taskId: task.taskId }, 'agent received task assignment');
                // Report progress
                bridge.handleMessage(socket, JSON.stringify({
                    type: 'task.progress',
                    taskId: task.taskId,
                    progress: 0,
                    output: 'Task received, executing...',
                }));
                // Execute async — don't block the message handler
                executeTask(config, task)
                    .then((outcome) => {
                    if (outcome.success) {
                        bridge.handleMessage(socket, JSON.stringify({
                            type: 'task.complete',
                            taskId: task.taskId,
                            result: outcome.result,
                        }));
                        logger.info({ agentId: config.agentId, taskId: task.taskId }, 'agent completed task');
                    }
                    else {
                        bridge.handleMessage(socket, JSON.stringify({
                            type: 'task.failed',
                            taskId: task.taskId,
                            error: outcome.error,
                        }));
                        logger.warn({ agentId: config.agentId, taskId: task.taskId, error: outcome.error }, 'agent task failed');
                    }
                })
                    .catch((err) => {
                    bridge.handleMessage(socket, JSON.stringify({
                        type: 'task.failed',
                        taskId: task.taskId,
                        error: err instanceof Error ? err.message : 'unexpected_error',
                    }));
                });
                break;
            }
            case 'task.cancelled': {
                logger.info({ agentId: config.agentId, taskId: msg.taskId }, 'agent received task cancellation');
                // Currently no way to abort an in-flight fetch, but we acknowledge
                break;
            }
            case 'ping': {
                // Respond with heartbeat
                bridge.handleMessage(socket, JSON.stringify({ type: 'heartbeat' }));
                break;
            }
            case 'registered': {
                logger.debug({ agentId: config.agentId, workspaces: msg.workspaces }, 'agent registration confirmed');
                break;
            }
            default:
                logger.debug({ agentId: config.agentId, type: msg.type }, 'agent received unhandled message type');
        }
    });
    logger.info({ agentId: config.agentId, capabilities: config.capabilities, baseUrl: config.baseUrl }, 'internal agent worker wired to bridge');
    return { agentId: config.agentId, socket };
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Start all internal agent workers. Call once after the A2A bridge is
 * initialized (typically in the server.listen callback).
 *
 * Each agent registers with the AgentBridgeService and begins listening
 * for task assignments.
 */
function startAgentWorkers() {
    if (activeWorkers.length > 0) {
        logger.warn('agent workers already started, skipping');
        return;
    }
    for (const config of INTERNAL_AGENTS) {
        const handle = wireAgent(config);
        activeWorkers.push(handle);
    }
    // Periodic heartbeat — keeps agents alive in the bridge's heartbeat sweep
    heartbeatTimer = setInterval(() => {
        const bridge = (0, agent_bridge_service_1.getAgentBridgeService)();
        for (const worker of activeWorkers) {
            bridge.handleMessage(worker.socket, JSON.stringify({ type: 'heartbeat' }));
        }
    }, 30_000);
    logger.info({ count: activeWorkers.length, agents: activeWorkers.map((w) => w.agentId) }, 'all internal agent workers started');
}
/**
 * Stop all internal agent workers and unregister from the bridge.
 */
function stopAgentWorkers() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    const bridge = (0, agent_bridge_service_1.getAgentBridgeService)();
    for (const worker of activeWorkers) {
        bridge.unregisterAgent(worker.agentId);
        worker.socket.close();
    }
    const count = activeWorkers.length;
    activeWorkers.length = 0;
    logger.info({ count }, 'all internal agent workers stopped');
}
/**
 * Get the list of currently active internal agent worker IDs.
 */
function getActiveWorkerIds() {
    return activeWorkers.map((w) => w.agentId);
}
