"use strict";
/**
 * @module codex-connector-runtime.service
 *
 * Runtime service that spawns and manages Codex CLI processes.
 *
 * Codex operates as a JSON-RPC App Server via `codex --jsonrpc` over stdio.
 * Methods: tasks/send, tasks/get, tasks/cancel, approvals/respond.
 *
 * This service:
 * 1. **Spawns** the `codex --jsonrpc` child process.
 * 2. **Communicates** via JSON-RPC 2.0 over stdin/stdout.
 * 3. **Matches** pending requests to responses by JSON-RPC `id`.
 * 4. **Executes** tasks via tasks/send, collects results via tasks/get.
 * 5. **Handles** approval requests from Codex, forwarding to the policy system.
 * 6. **Manages** process lifecycle: start, stop, restart, health checks.
 * 7. **Handles** errors: process crash, timeout, stderr.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodexConnectorRuntime = void 0;
exports.getCodexConnectorIdentity = getCodexConnectorIdentity;
exports.getCodexConnectorRuntime = getCodexConnectorRuntime;
exports.resetCodexConnectorRuntime = resetCodexConnectorRuntime;
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const events_1 = require("events");
const a2a_1 = require("@recoder/shared/a2a");
const agent_registry_service_1 = require("./agent-registry.service");
const a2a_event_bus_1 = require("./a2a-event-bus");
const task_stream_payload_1 = require("./task-stream-payload");
// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
    command: process.env.CODEX_COMMAND || 'codex',
    args: (process.env.CODEX_ARGS || '--jsonrpc').split(','),
    env: {},
    cwd: process.env.CODEX_CWD || undefined,
    requestTimeoutMs: Number(process.env.CODEX_CONNECTOR_REQUEST_TIMEOUT_MS || 120_000),
    startupTimeoutMs: Number(process.env.CODEX_CONNECTOR_STARTUP_TIMEOUT_MS || 30_000),
    maxRestartAttempts: Number(process.env.CODEX_CONNECTOR_MAX_RESTART_ATTEMPTS || 3),
    restartDelayMs: Number(process.env.CODEX_CONNECTOR_RESTART_DELAY_MS || 2_000),
    autoRestart: process.env.CODEX_CONNECTOR_AUTO_RESTART !== 'false',
};
// ---------------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------------
const CODEX_CONNECTOR_IDENTITY = {
    id: 'codex-connector',
    name: 'OpenAI Codex CLI Connector',
    platform: 'codex',
};
function getCodexConnectorIdentity() {
    return { ...CODEX_CONNECTOR_IDENTITY };
}
// ---------------------------------------------------------------------------
// CodexConnectorRuntime
// ---------------------------------------------------------------------------
class CodexConnectorRuntime extends events_1.EventEmitter {
    config;
    process = null;
    status = 'stopped';
    pendingRequests = new Map();
    requestIdCounter = 0;
    buffer = '';
    startedAt = null;
    lastActivity = null;
    restartCount = 0;
    lastError = null;
    stderrBuffer = [];
    activeTasks = new Set();
    taskContexts = new Map();
    constructor(config) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------
    getState() {
        return {
            status: this.status,
            pid: this.process?.pid ?? null,
            startedAt: this.startedAt,
            lastActivity: this.lastActivity,
            restartCount: this.restartCount,
            error: this.lastError,
            pendingRequests: this.pendingRequests.size,
            activeTasks: this.activeTasks.size,
        };
    }
    isRunning() {
        return this.status === 'running';
    }
    async start() {
        if (this.status === 'running' || this.status === 'starting') {
            return;
        }
        this.status = 'starting';
        this.lastError = null;
        this.emit('status', this.status);
        try {
            await this.spawnProcess();
            this.status = 'running';
            this.startedAt = new Date().toISOString();
            this.lastActivity = this.startedAt;
            this.emit('status', this.status);
            this.emit('audit', (0, a2a_1.createAuditEvent)({
                id: `evt_${(0, crypto_1.randomUUID)()}`,
                event_type: a2a_1.AuditEventTypeEnum.ConnectorAttached,
                actor: { kind: a2a_1.AuditActorKindEnum.System, id: 'codex-connector-runtime' },
                target: { kind: a2a_1.AuditTargetKindEnum.Connector, id: 'codex-cli' },
                severity: a2a_1.AuditSeverityEnum.Info,
                trace_id: `trace_${(0, crypto_1.randomUUID)()}`,
                workspace_id: 'system',
                metadata: { message: 'Codex CLI connector started' },
            }));
            this.registerWithRegistry();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.lastError = message;
            this.status = 'error';
            this.emit('status', this.status);
            this.emit('error', err);
            this.killProcess();
            throw err;
        }
    }
    async stop() {
        if (this.status === 'stopped' || this.status === 'stopping') {
            return;
        }
        this.status = 'stopping';
        this.emit('status', this.status);
        this.rejectAllPending('Codex connector is stopping');
        this.killProcess();
        this.emit('audit', (0, a2a_1.createAuditEvent)({
            id: `evt_${(0, crypto_1.randomUUID)()}`,
            event_type: a2a_1.AuditEventTypeEnum.ConnectorDetached,
            actor: { kind: a2a_1.AuditActorKindEnum.System, id: 'codex-connector-runtime' },
            target: { kind: a2a_1.AuditTargetKindEnum.Connector, id: 'codex-cli' },
            severity: a2a_1.AuditSeverityEnum.Info,
            trace_id: `trace_${(0, crypto_1.randomUUID)()}`,
            workspace_id: 'system',
            metadata: { message: 'Codex CLI connector stopped' },
        }));
        this.status = 'stopped';
        this.startedAt = null;
        this.activeTasks.clear();
        this.emit('status', this.status);
    }
    async restart() {
        await this.stop();
        this.restartCount++;
        await this.start();
    }
    getHealth() {
        const uptime = this.startedAt
            ? Date.now() - new Date(this.startedAt).getTime()
            : null;
        return {
            healthy: this.status === 'running',
            status: this.status,
            pid: this.process?.pid ?? null,
            uptime,
        };
    }
    /** Send a task to Codex via tasks/send. */
    async executeTask(input) {
        if (!this.isRunning()) {
            return { taskId: input.taskId, success: false, error: 'Codex connector is not running' };
        }
        this.activeTasks.add(input.taskId);
        this.taskContexts.set(input.taskId, {
            workspaceId: input.workspaceId,
            threadId: input.threadId,
        });
        this.lastActivity = new Date().toISOString();
        const effectivePrompt = input.instructionBundle?.agent_specific_prompt || input.prompt;
        try {
            const codexTask = {
                id: input.taskId,
                sessionId: `recoder-session-${Date.now()}`,
                message: {
                    role: 'user',
                    parts: [{ text: effectivePrompt }],
                },
                artifacts: input.artifacts?.map((a) => ({
                    filename: a.filename,
                    content: a.content,
                })),
            };
            const result = await this.sendJsonRpc('tasks/send', codexTask);
            const resultObj = result;
            const resultText = typeof resultObj?.result === 'string'
                ? resultObj.result
                : typeof resultObj?.message === 'string'
                    ? resultObj.message
                    : JSON.stringify(result);
            this.publishTaskStream(input.taskId, resultText, true);
            this.activeTasks.delete(input.taskId);
            this.taskContexts.delete(input.taskId);
            return {
                taskId: input.taskId,
                success: true,
                resultText,
                raw: result,
            };
        }
        catch (err) {
            this.activeTasks.delete(input.taskId);
            this.taskContexts.delete(input.taskId);
            const message = err instanceof Error ? err.message : String(err);
            this.publishTaskStream(input.taskId, message, true);
            this.emit('audit', (0, a2a_1.createAuditEvent)({
                id: `evt_${(0, crypto_1.randomUUID)()}`,
                event_type: a2a_1.AuditEventTypeEnum.ConnectorError,
                actor: { kind: a2a_1.AuditActorKindEnum.System, id: 'codex-connector-runtime' },
                target: { kind: a2a_1.AuditTargetKindEnum.Connector, id: 'codex-cli' },
                severity: a2a_1.AuditSeverityEnum.Error,
                trace_id: `trace_${(0, crypto_1.randomUUID)()}`,
                workspace_id: 'system',
                task_id: input.taskId,
                metadata: { message },
            }));
            return { taskId: input.taskId, success: false, error: message };
        }
    }
    /** Get task status from Codex via tasks/get. */
    async getTaskStatus(taskId) {
        return this.sendJsonRpc('tasks/get', { id: taskId });
    }
    /** Cancel a task via tasks/cancel. */
    async cancelTask(taskId) {
        this.activeTasks.delete(taskId);
        this.taskContexts.delete(taskId);
        return this.sendJsonRpc('tasks/cancel', { id: taskId });
    }
    /** Respond to an approval request via approvals/respond. */
    async respondToApproval(approvalId, approved, reason) {
        return this.sendJsonRpc('approvals/respond', {
            id: approvalId,
            approved,
            reason,
        });
    }
    // -------------------------------------------------------------------------
    // Process management
    // -------------------------------------------------------------------------
    spawnProcess() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Codex process startup timed out'));
            }, this.config.startupTimeoutMs);
            try {
                const env = { ...process.env, ...this.config.env };
                this.process = (0, child_process_1.spawn)(this.config.command, this.config.args, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env,
                    cwd: this.config.cwd,
                });
                this.process.stdout?.on('data', (chunk) => {
                    this.handleStdout(chunk.toString());
                });
                this.process.stderr?.on('data', (chunk) => {
                    const line = chunk.toString().trim();
                    if (line) {
                        this.stderrBuffer.push(line);
                        if (this.stderrBuffer.length > 100)
                            this.stderrBuffer.shift();
                        this.emit('stderr', line);
                    }
                });
                this.process.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
                this.process.on('exit', (code, signal) => {
                    this.handleProcessExit(code, signal);
                });
                // Codex in JSON-RPC mode is ready once the process is spawned
                // (no handshake required — it accepts JSON-RPC on stdin immediately)
                this.process.once('spawn', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            }
            catch (err) {
                clearTimeout(timeout);
                reject(err);
            }
        });
    }
    handleStdout(data) {
        this.buffer += data;
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const msg = JSON.parse(trimmed);
                // Check if this is a response to a pending request
                if (msg.id != null && this.pendingRequests.has(String(msg.id))) {
                    const pending = this.pendingRequests.get(String(msg.id));
                    this.pendingRequests.delete(String(msg.id));
                    clearTimeout(pending.timer);
                    if (msg.error) {
                        pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
                    }
                    else {
                        pending.resolve(msg.result);
                    }
                }
                // Check if this is an approval request notification from Codex
                if (msg.method === 'approvals/request') {
                    this.emit('approval-request', {
                        taskId: msg.params?.taskId,
                        approvalId: msg.params?.id,
                        action: msg.params?.action,
                        description: msg.params?.description,
                        details: msg.params,
                    });
                }
                // Emit generic message events for streaming
                if (msg.method === 'tasks/update') {
                    this.emit('task-update', msg.params);
                    const taskId = this.resolveTaskId(msg.params);
                    if (taskId) {
                        this.publishTaskStream(taskId, (0, task_stream_payload_1.extractTaskStreamChunk)(msg.params));
                    }
                }
            }
            catch {
                // Not JSON — ignore
            }
        }
    }
    handleProcessExit(code, signal) {
        const wasRunning = this.status === 'running';
        this.status = 'stopped';
        this.process = null;
        this.rejectAllPending(`Codex process exited (code=${code}, signal=${signal})`);
        this.emit('exit', { code, signal });
        if (wasRunning && this.config.autoRestart && this.restartCount < this.config.maxRestartAttempts) {
            setTimeout(() => {
                this.restart().catch((err) => {
                    this.lastError = err instanceof Error ? err.message : String(err);
                    this.status = 'error';
                    this.emit('error', err);
                });
            }, this.config.restartDelayMs);
        }
    }
    killProcess() {
        if (this.process) {
            try {
                this.process.stdin?.end();
                this.process.kill('SIGTERM');
            }
            catch {
                // Process may already be dead
            }
            this.process = null;
        }
    }
    // -------------------------------------------------------------------------
    // JSON-RPC communication
    // -------------------------------------------------------------------------
    sendJsonRpc(method, params) {
        return new Promise((resolve, reject) => {
            if (!this.process?.stdin?.writable) {
                reject(new Error('Codex process stdin is not writable'));
                return;
            }
            const id = String(++this.requestIdCounter);
            const msg = JSON.stringify({
                jsonrpc: '2.0',
                id,
                method,
                params,
            });
            const timer = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Codex JSON-RPC request timed out (method=${method})`));
            }, this.config.requestTimeoutMs);
            this.pendingRequests.set(id, { resolve, reject, method, createdAt: Date.now(), timer });
            this.process.stdin.write(msg + '\n', (err) => {
                if (err) {
                    this.pendingRequests.delete(id);
                    clearTimeout(timer);
                    reject(err);
                }
            });
        });
    }
    rejectAllPending(reason) {
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(new Error(reason));
        }
        this.pendingRequests.clear();
    }
    // -------------------------------------------------------------------------
    // Agent registry integration
    // -------------------------------------------------------------------------
    registerWithRegistry() {
        try {
            const registry = (0, agent_registry_service_1.getAgentRegistryService)();
            registry.selfRegister({
                agentId: CODEX_CONNECTOR_IDENTITY.id,
                name: CODEX_CONNECTOR_IDENTITY.name,
                platform: 'codex',
                description: 'OpenAI Codex CLI agent via JSON-RPC over stdio',
                version: '1.0.0',
                tags: ['code-generation', 'task-lifecycle', 'implementation'],
            });
        }
        catch {
            // Registry may not be available — non-fatal
        }
    }
    resolveTaskId(payload) {
        if (payload && typeof payload === 'object') {
            const taskId = payload.taskId;
            if (typeof taskId === 'string' && taskId.trim().length > 0)
                return taskId;
            const id = payload.id;
            if (typeof id === 'string' && id.trim().length > 0)
                return id;
            const taskIdSnake = payload.task_id;
            if (typeof taskIdSnake === 'string' && taskIdSnake.trim().length > 0)
                return taskIdSnake;
        }
        if (this.activeTasks.size === 1) {
            return Array.from(this.activeTasks)[0] ?? null;
        }
        return null;
    }
    publishTaskStream(taskId, chunk, done = false) {
        if (!taskId || (!chunk && !done))
            return;
        const context = this.taskContexts.get(taskId);
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `evt_${(0, crypto_1.randomUUID)()}`,
            type: a2a_event_bus_1.A2AEventType.TaskStream,
            timestamp: new Date().toISOString(),
            taskId,
            workspaceId: context?.workspaceId,
            data: {
                agentId: CODEX_CONNECTOR_IDENTITY.id,
                chunk,
                done,
            },
        });
    }
}
exports.CodexConnectorRuntime = CodexConnectorRuntime;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let instance = null;
function getCodexConnectorRuntime(config) {
    if (!instance) {
        instance = new CodexConnectorRuntime(config);
    }
    return instance;
}
function resetCodexConnectorRuntime() {
    if (instance) {
        instance.stop().catch(() => { });
        instance.removeAllListeners();
        instance = null;
    }
}
