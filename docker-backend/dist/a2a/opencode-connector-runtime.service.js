"use strict";
/**
 * @module opencode-connector-runtime.service
 *
 * Experimental runtime service that executes OpenCode in non-interactive
 * JSON event mode. This spike keeps Recoder as the control plane while
 * delegating hard coding loops to `opencode run --format json`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpencodeConnectorRuntime = void 0;
exports.getOpencodeConnectorRuntime = getOpencodeConnectorRuntime;
exports.resetOpencodeConnectorRuntime = resetOpencodeConnectorRuntime;
exports.getOpencodeConnectorIdentity = getOpencodeConnectorIdentity;
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const events_1 = require("events");
const a2a_1 = require("@recoder/shared/a2a");
const agent_registry_service_1 = require("./agent-registry.service");
const a2a_event_bus_1 = require("./a2a-event-bus");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('opencode-connector-runtime');
const DEFAULT_CONFIG = {
    command: process.env.OPENCODE_COMMAND || 'opencode',
    args: (process.env.OPENCODE_ARGS || '').split(',').filter(Boolean),
    env: {},
    cwd: process.env.OPENCODE_CWD || undefined,
    requestTimeoutMs: Number(process.env.OPENCODE_CONNECTOR_REQUEST_TIMEOUT_MS || 15 * 60_000),
    startupTimeoutMs: Number(process.env.OPENCODE_CONNECTOR_STARTUP_TIMEOUT_MS || 30_000),
    defaultModel: process.env.OPENCODE_MODEL || undefined,
    defaultAgent: process.env.OPENCODE_AGENT || undefined,
    defaultVariant: process.env.OPENCODE_VARIANT || undefined,
};
const OPENCODE_CONNECTOR_IDENTITY = {
    id: 'opencode-connector',
    name: 'OpenCode Connector',
    platform: 'custom',
};
function isStringRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    return Object.values(value).every((entry) => typeof entry === 'string');
}
function getNestedText(value) {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const text = value.text;
    return typeof text === 'string' && text.trim().length > 0 ? text.trim() : undefined;
}
function stringifyError(value) {
    if (!value) {
        return undefined;
    }
    if (typeof value === 'string') {
        return value.trim() || undefined;
    }
    if (value instanceof Error) {
        return value.message;
    }
    if (typeof value === 'object') {
        const record = value;
        if (typeof record.message === 'string' && record.message.trim().length > 0) {
            return record.message.trim();
        }
        if (record.data && typeof record.data === 'object') {
            const nested = stringifyError(record.data);
            if (nested)
                return nested;
        }
        if (typeof record.name === 'string' && record.name.trim().length > 0) {
            return record.name.trim();
        }
    }
    return String(value);
}
function summarizeToolUse(part) {
    const tool = part.tool;
    if (typeof tool !== 'string' || tool.trim().length === 0) {
        return undefined;
    }
    const state = part.state;
    if (state && typeof state === 'object') {
        const status = state.status;
        if (typeof status === 'string' && status.trim().length > 0) {
            return `[tool:${tool}] ${status}`;
        }
    }
    return `[tool:${tool}]`;
}
function extractChunkFromEvent(event) {
    if (event.type === 'text') {
        return getNestedText(event.part);
    }
    if (event.type === 'reasoning') {
        const text = getNestedText(event.part);
        return text ? `[reasoning] ${text}` : undefined;
    }
    if (event.type === 'tool_use' && event.part && typeof event.part === 'object') {
        return summarizeToolUse(event.part);
    }
    if (event.type === 'error') {
        const message = stringifyError(event.error);
        return message ? `[error] ${message}` : undefined;
    }
    return undefined;
}
class OpencodeConnectorRuntime extends events_1.EventEmitter {
    config;
    status = 'stopped';
    startedAt = null;
    lastActivity = null;
    lastError = null;
    activeTaskIds = new Set();
    taskStatuses = new Map();
    taskProcesses = new Map();
    connectorId = 'opencode';
    platform = 'custom';
    constructor(config) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    get processRef() {
        return this.taskProcesses.values().next().value ?? null;
    }
    getPid() {
        return this.processRef?.pid ?? null;
    }
    getState() {
        return {
            status: this.status,
            pid: this.getPid(),
            startedAt: this.startedAt,
            lastActivity: this.lastActivity,
            error: this.lastError,
            activeTasks: this.activeTaskIds.size,
        };
    }
    isRunning() {
        return this.status === 'running';
    }
    getHealth() {
        const now = new Date().toISOString();
        return {
            status: this.status === 'running' ? 'healthy' : this.status === 'error' ? 'unhealthy' : 'unknown',
            pid: this.getPid(),
            uptime: this.startedAt ? Date.now() - new Date(this.startedAt).getTime() : 0,
            lastCheckedAt: now,
            message: this.lastError || undefined,
        };
    }
    async start() {
        if (this.status === 'running' || this.status === 'starting') {
            return;
        }
        this.status = 'starting';
        this.lastError = null;
        this.emit('status', this.status);
        try {
            await this.verifyCommand();
            this.status = 'running';
            this.startedAt = new Date().toISOString();
            this.lastActivity = this.startedAt;
            this.emit('status', this.status);
            this.emit('audit', (0, a2a_1.createAuditEvent)({
                id: `evt_${(0, crypto_1.randomUUID)()}`,
                event_type: a2a_1.AuditEventTypeEnum.ConnectorAttached,
                actor: { kind: a2a_1.AuditActorKindEnum.System, id: 'opencode-connector-runtime' },
                target: { kind: a2a_1.AuditTargetKindEnum.Connector, id: 'opencode-cli' },
                severity: a2a_1.AuditSeverityEnum.Info,
                trace_id: `trace_${(0, crypto_1.randomUUID)()}`,
                workspace_id: 'system',
                metadata: { message: 'OpenCode connector started' },
            }));
            this.registerWithRegistry();
        }
        catch (error) {
            this.lastError = error instanceof Error ? error.message : String(error);
            this.status = 'error';
            this.emit('status', this.status);
            this.emit('error', error);
            throw error;
        }
    }
    async stop() {
        if (this.status === 'stopped' || this.status === 'stopping') {
            return;
        }
        this.status = 'stopping';
        this.emit('status', this.status);
        for (const [taskId, proc] of this.taskProcesses) {
            const task = this.taskStatuses.get(taskId);
            if (task && task.status === 'running') {
                task.status = 'cancelled';
                task.error = 'Connector stopped while task was running';
            }
            try {
                proc.kill('SIGTERM');
            }
            catch {
                // Ignore dead child processes during shutdown.
            }
        }
        this.taskProcesses.clear();
        this.activeTaskIds.clear();
        this.emit('audit', (0, a2a_1.createAuditEvent)({
            id: `evt_${(0, crypto_1.randomUUID)()}`,
            event_type: a2a_1.AuditEventTypeEnum.ConnectorDetached,
            actor: { kind: a2a_1.AuditActorKindEnum.System, id: 'opencode-connector-runtime' },
            target: { kind: a2a_1.AuditTargetKindEnum.Connector, id: 'opencode-cli' },
            severity: a2a_1.AuditSeverityEnum.Info,
            trace_id: `trace_${(0, crypto_1.randomUUID)()}`,
            workspace_id: 'system',
            metadata: { message: 'OpenCode connector stopped' },
        }));
        this.status = 'stopped';
        this.startedAt = null;
        this.emit('status', this.status);
    }
    async restart() {
        await this.stop();
        await this.start();
    }
    async executeTask(input) {
        if (!this.isRunning()) {
            return { taskId: input.taskId, success: false, error: 'OpenCode connector is not running' };
        }
        const status = {
            taskId: input.taskId,
            status: 'running',
            startedAt: new Date().toISOString(),
            finishedAt: null,
            pid: null,
            sessionId: input.sessionId,
            cwd: input.cwd || this.config.cwd,
            model: input.model || this.config.defaultModel,
            workspaceId: input.workspaceId,
            threadId: input.threadId,
        };
        this.taskStatuses.set(input.taskId, status);
        this.activeTaskIds.add(input.taskId);
        this.lastActivity = status.startedAt;
        const rawEvents = [];
        const stderrLines = [];
        const textChunks = [];
        const errors = [];
        const args = this.buildRunArgs(input);
        const env = this.buildTaskEnv(input);
        const cwd = input.cwd || this.config.cwd;
        logger.info({ taskId: input.taskId, cwd, args }, 'Starting OpenCode task');
        try {
            return await new Promise((resolve) => {
                let settled = false;
                let stdoutBuffer = '';
                let exitCode = null;
                let exitSignal = null;
                let sessionId = input.sessionId;
                const settle = (result) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    clearTimeout(timeout);
                    this.taskProcesses.delete(input.taskId);
                    this.activeTaskIds.delete(input.taskId);
                    status.finishedAt = new Date().toISOString();
                    status.sessionId = sessionId;
                    status.resultText = result.resultText;
                    status.error = result.error;
                    resolve(result);
                };
                const child = (0, child_process_1.spawn)(this.config.command, args, {
                    stdio: ['ignore', 'pipe', 'pipe'],
                    env,
                    cwd,
                });
                this.taskProcesses.set(input.taskId, child);
                status.pid = child.pid ?? null;
                child.stdout?.on('data', (chunk) => {
                    stdoutBuffer += chunk.toString();
                    const lines = stdoutBuffer.split(/\r?\n/);
                    stdoutBuffer = lines.pop() || '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed)
                            continue;
                        let parsed = null;
                        try {
                            parsed = JSON.parse(trimmed);
                        }
                        catch {
                            continue;
                        }
                        rawEvents.push(parsed);
                        if (rawEvents.length > 200) {
                            rawEvents.shift();
                        }
                        if (typeof parsed.sessionID === 'string' && parsed.sessionID.trim().length > 0) {
                            sessionId = parsed.sessionID;
                            status.sessionId = parsed.sessionID;
                        }
                        const chunkText = extractChunkFromEvent(parsed);
                        if (!chunkText) {
                            continue;
                        }
                        if (parsed.type === 'text') {
                            textChunks.push(chunkText);
                        }
                        else if (parsed.type === 'error') {
                            errors.push(chunkText.replace(/^\[error\]\s*/, ''));
                        }
                        this.publishTaskStream(input.taskId, chunkText, false);
                    }
                });
                child.stderr?.on('data', (chunk) => {
                    const line = chunk.toString().trim();
                    if (!line)
                        return;
                    stderrLines.push(line);
                    if (stderrLines.length > 100) {
                        stderrLines.shift();
                    }
                    this.emit('stderr', line);
                });
                child.on('error', (error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    this.lastError = message;
                    status.status = 'failed';
                    this.publishTaskStream(input.taskId, `[error] ${message}`, true);
                    settle({
                        taskId: input.taskId,
                        success: false,
                        error: message,
                        sessionId,
                        raw: {
                            exitCode,
                            signal: exitSignal,
                            eventCount: rawEvents.length,
                            events: rawEvents,
                            stderr: stderrLines,
                        },
                    });
                });
                child.on('exit', (code, signal) => {
                    exitCode = code;
                    exitSignal = signal;
                    if (status.status === 'cancelled') {
                        const message = status.error || 'Task cancelled';
                        this.publishTaskStream(input.taskId, `[error] ${message}`, true);
                        settle({
                            taskId: input.taskId,
                            success: false,
                            error: message,
                            sessionId,
                            raw: {
                                exitCode,
                                signal: exitSignal,
                                eventCount: rawEvents.length,
                                events: rawEvents,
                                stderr: stderrLines,
                            },
                        });
                        return;
                    }
                    if (errors.length > 0) {
                        const message = errors.join('\n');
                        status.status = 'failed';
                        this.publishTaskStream(input.taskId, '', true);
                        settle({
                            taskId: input.taskId,
                            success: false,
                            error: message,
                            sessionId,
                            raw: {
                                exitCode,
                                signal: exitSignal,
                                eventCount: rawEvents.length,
                                events: rawEvents,
                                stderr: stderrLines,
                            },
                        });
                        return;
                    }
                    if (code !== 0) {
                        const message = stderrLines.join('\n').trim() || `OpenCode exited with code ${code ?? 'unknown'}`;
                        status.status = 'failed';
                        this.publishTaskStream(input.taskId, `[error] ${message}`, true);
                        settle({
                            taskId: input.taskId,
                            success: false,
                            error: message,
                            sessionId,
                            raw: {
                                exitCode,
                                signal: exitSignal,
                                eventCount: rawEvents.length,
                                events: rawEvents,
                                stderr: stderrLines,
                            },
                        });
                        return;
                    }
                    const resultText = textChunks.join('\n\n').trim();
                    status.status = 'completed';
                    this.publishTaskStream(input.taskId, '', true);
                    settle({
                        taskId: input.taskId,
                        success: true,
                        resultText,
                        sessionId,
                        raw: {
                            exitCode,
                            signal: exitSignal,
                            eventCount: rawEvents.length,
                            events: rawEvents,
                            stderr: stderrLines,
                        },
                    });
                });
                const timeout = setTimeout(() => {
                    const message = `OpenCode task timed out after ${this.config.requestTimeoutMs}ms`;
                    this.lastError = message;
                    status.status = 'failed';
                    status.error = message;
                    errors.push(message);
                    try {
                        child.kill('SIGTERM');
                    }
                    catch {
                        // Process already exited.
                    }
                }, this.config.requestTimeoutMs);
                if (typeof timeout === 'object' && 'unref' in timeout) {
                    timeout.unref();
                }
            });
        }
        catch (error) {
            this.activeTaskIds.delete(input.taskId);
            status.status = 'failed';
            status.finishedAt = new Date().toISOString();
            const message = error instanceof Error ? error.message : String(error);
            status.error = message;
            return {
                taskId: input.taskId,
                success: false,
                error: message,
                sessionId: status.sessionId,
                raw: {
                    exitCode: null,
                    signal: null,
                    eventCount: 0,
                    events: [],
                    stderr: [],
                },
            };
        }
    }
    async getTaskStatus(taskId) {
        const status = this.taskStatuses.get(taskId);
        if (!status) {
            return {
                taskId,
                status: 'unknown',
                startedAt: null,
                finishedAt: null,
                pid: null,
            };
        }
        return { ...status };
    }
    async cancelTask(taskId, reason) {
        const proc = this.taskProcesses.get(taskId);
        const status = this.taskStatuses.get(taskId);
        if (!proc || !status || status.status !== 'running') {
            return { taskId, cancelled: false, reason: 'Task is not running' };
        }
        status.status = 'cancelled';
        status.error = reason || 'Task cancelled';
        try {
            proc.kill('SIGTERM');
        }
        catch {
            return { taskId, cancelled: false, reason: 'Failed to stop task process' };
        }
        return { taskId, cancelled: true, reason: status.error };
    }
    async respondToApproval(approvalId, approved, reason) {
        return {
            approvalId,
            supported: false,
            approved,
            reason: reason || 'OpenCode spike runtime auto-rejects interactive permissions internally',
        };
    }
    buildRunArgs(input) {
        const args = [...this.config.args, 'run', '--format', 'json'];
        const model = input.model || this.config.defaultModel;
        const agent = input.agent || this.config.defaultAgent;
        const variant = input.variant || this.config.defaultVariant;
        const dir = input.cwd || this.config.cwd;
        if (input.sessionId) {
            args.push('--session', input.sessionId);
        }
        else if (input.continueSession) {
            args.push('--continue');
        }
        if (model) {
            args.push('--model', model);
        }
        if (agent) {
            args.push('--agent', agent);
        }
        if (variant) {
            args.push('--variant', variant);
        }
        if (dir) {
            args.push('--dir', dir);
        }
        args.push(input.prompt);
        return args;
    }
    buildTaskEnv(input) {
        const env = {
            ...process.env,
            ...this.config.env,
        };
        if (isStringRecord(input.env)) {
            Object.assign(env, input.env);
        }
        if (input.providerKeys?.openrouter) {
            env.OPENROUTER_API_KEY = input.providerKeys.openrouter;
        }
        if (input.providerKeys?.openai) {
            env.OPENAI_API_KEY = input.providerKeys.openai;
        }
        if (input.providerKeys?.anthropic) {
            env.ANTHROPIC_API_KEY = input.providerKeys.anthropic;
        }
        if (input.providerKeys?.gemini) {
            env.GEMINI_API_KEY = input.providerKeys.gemini;
        }
        return env;
    }
    publishTaskStream(taskId, chunk, done) {
        if (!taskId || (!chunk && !done)) {
            return;
        }
        const context = this.taskStatuses.get(taskId);
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `evt_${(0, crypto_1.randomUUID)()}`,
            type: a2a_event_bus_1.A2AEventType.TaskStream,
            timestamp: new Date().toISOString(),
            taskId,
            workspaceId: context?.workspaceId,
            data: {
                agentId: OPENCODE_CONNECTOR_IDENTITY.id,
                chunk,
                done,
            },
        });
    }
    verifyCommand() {
        return new Promise((resolve, reject) => {
            let settled = false;
            let stderr = '';
            let stdout = '';
            const child = (0, child_process_1.spawn)(this.config.command, ['--version'], {
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, ...this.config.env },
                cwd: this.config.cwd,
            });
            const settle = (handler) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeout);
                handler();
            };
            child.stdout?.on('data', (chunk) => {
                stdout += chunk.toString();
            });
            child.stderr?.on('data', (chunk) => {
                stderr += chunk.toString();
            });
            child.on('error', (error) => {
                settle(() => reject(error));
            });
            child.on('exit', (code) => {
                if (code === 0) {
                    settle(resolve);
                    return;
                }
                const output = stderr.trim() || stdout.trim();
                settle(() => reject(new Error(output
                    ? `OpenCode command check failed: ${output}`
                    : `OpenCode command exited with code ${code ?? 'unknown'}`)));
            });
            const timeout = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                }
                catch {
                    // Ignore if the command already exited.
                }
                settle(() => reject(new Error('OpenCode command verification timed out')));
            }, this.config.startupTimeoutMs);
            if (typeof timeout === 'object' && 'unref' in timeout) {
                timeout.unref();
            }
        });
    }
    registerWithRegistry() {
        try {
            const registry = (0, agent_registry_service_1.getAgentRegistryService)();
            registry.selfRegister({
                agentId: OPENCODE_CONNECTOR_IDENTITY.id,
                name: OPENCODE_CONNECTOR_IDENTITY.name,
                platform: OPENCODE_CONNECTOR_IDENTITY.platform,
                description: 'Experimental OpenCode connector via JSON event stream',
                version: '0.1.0',
                tags: ['code-generation', 'task-lifecycle', 'experimental', 'opencode'],
            });
        }
        catch (error) {
            logger.debug({ error }, 'Failed to self-register OpenCode connector');
        }
    }
}
exports.OpencodeConnectorRuntime = OpencodeConnectorRuntime;
let instance = null;
function getOpencodeConnectorRuntime(config) {
    if (!instance) {
        instance = new OpencodeConnectorRuntime(config);
    }
    return instance;
}
function resetOpencodeConnectorRuntime() {
    if (instance) {
        instance.stop().catch(() => { });
        instance.removeAllListeners();
        instance = null;
    }
}
function getOpencodeConnectorIdentity() {
    return { ...OPENCODE_CONNECTOR_IDENTITY };
}
