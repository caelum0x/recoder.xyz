"use strict";
/**
 * Debug Session Manager
 *
 * Manages debug sessions for projects, including:
 * - Starting/stopping debug adapters per language
 * - Managing breakpoints across files
 * - WebSocket communication with frontend
 * - Session state and cleanup
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugManager = void 0;
const events_1 = require("events");
const dockerode_1 = __importDefault(require("dockerode"));
const uuid_1 = require("uuid");
const dap_client_js_1 = require("./dap-client.js");
const index_js_1 = require("../errors/index.js");
// ==================== Debug Manager ====================
class DebugManager extends events_1.EventEmitter {
    docker;
    sessions = new Map();
    sessionsByProject = new Map();
    portPool = new Set();
    nextPort = 10000;
    maxPort = 10999;
    cleanupInterval = null;
    sessionTimeout = 30 * 60 * 1000; // 30 minutes
    constructor() {
        super();
        this.docker = new dockerode_1.default();
        this.startCleanupInterval();
    }
    startCleanupInterval() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupStaleSessions();
        }, 60000); // Check every minute
    }
    cleanupStaleSessions() {
        const now = Date.now();
        for (const [sessionId, session] of this.sessions) {
            const inactive = now - session.lastActivity.getTime();
            if (inactive > this.sessionTimeout) {
                console.log(`[DebugManager] Cleaning up stale session ${sessionId}`);
                this.terminateSession(sessionId).catch(err => {
                    console.warn(`[DebugManager] Failed to cleanup stale session ${sessionId}: ${err.message}`);
                });
            }
        }
    }
    allocatePort() {
        for (let port = this.nextPort; port <= this.maxPort; port++) {
            if (!this.portPool.has(port)) {
                this.portPool.add(port);
                this.nextPort = port + 1;
                if (this.nextPort > this.maxPort) {
                    this.nextPort = 10000;
                }
                return port;
            }
        }
        throw (0, index_js_1.createError)(index_js_1.ErrorCode.RESOURCE_EXHAUSTED, 'No available ports for debug session');
    }
    releasePort(port) {
        this.portPool.delete(port);
    }
    /**
     * Start a debug session for a project
     */
    async startSession(projectId, containerId, config) {
        const sessionId = (0, uuid_1.v4)();
        const port = this.allocatePort();
        console.log(`[DebugManager] Starting debug session ${sessionId} for project ${projectId}`);
        // Create DAP client
        const client = new dap_client_js_1.DAPClient(config.language);
        // Set up event forwarding
        this.setupClientEvents(sessionId, client);
        // Create session
        const session = {
            id: sessionId,
            projectId,
            containerId,
            language: config.language,
            client,
            port,
            state: 'initializing',
            config,
            breakpoints: new Map(),
            createdAt: new Date(),
            lastActivity: new Date(),
        };
        this.sessions.set(sessionId, session);
        // Track by project
        if (!this.sessionsByProject.has(projectId)) {
            this.sessionsByProject.set(projectId, new Set());
        }
        this.sessionsByProject.get(projectId).add(sessionId);
        try {
            // Start debug adapter in container
            await this.startDebugAdapter(session);
            // Initialize DAP connection
            await this.initializeSession(session);
            return session;
        }
        catch (err) {
            // Cleanup on failure
            await this.terminateSession(sessionId);
            throw err;
        }
    }
    setupClientEvents(sessionId, client) {
        client.on('event', (event) => {
            const session = this.sessions.get(sessionId);
            if (session) {
                session.lastActivity = new Date();
            }
            const debugEvent = {
                type: event.event,
                sessionId,
                body: event.body || {},
            };
            this.emit('debugEvent', debugEvent);
        });
        client.on('stopped', (body) => {
            const session = this.sessions.get(sessionId);
            if (session) {
                session.state = 'paused';
            }
        });
        client.on('continued', () => {
            const session = this.sessions.get(sessionId);
            if (session) {
                session.state = 'running';
            }
        });
        client.on('terminated', () => {
            const session = this.sessions.get(sessionId);
            if (session) {
                session.state = 'terminated';
            }
        });
        client.on('error', (err) => {
            console.error(`[DebugSession ${sessionId}] Error:`, err);
        });
    }
    async startDebugAdapter(session) {
        const { language, config, port, containerId } = session;
        const adapterConfig = dap_client_js_1.DEBUG_ADAPTER_CONFIGS[language];
        let command;
        let args;
        switch (language) {
            case 'javascript':
            case 'typescript':
                // Node.js with inspector
                command = 'node';
                args = [`--inspect-brk=0.0.0.0:${port}`];
                if (language === 'typescript') {
                    args.push('-r', 'ts-node/register');
                }
                args.push(config.program);
                if (config.args) {
                    args.push(...config.args);
                }
                break;
            case 'python':
                // Python with debugpy
                command = 'python3';
                args = [
                    '-m', 'debugpy',
                    '--listen', `0.0.0.0:${port}`,
                    '--wait-for-client',
                ];
                if (config.stopOnEntry) {
                    args.push('--stop-on-entry');
                }
                args.push(config.program);
                if (config.args) {
                    args.push(...config.args);
                }
                break;
            case 'go':
                // Go with Delve
                command = 'dlv';
                args = [
                    'debug',
                    '--headless',
                    `--listen=:${port}`,
                    '--api-version=2',
                    '--accept-multiclient',
                ];
                args.push('--', config.program);
                if (config.args) {
                    args.push(...config.args);
                }
                break;
            case 'rust':
                // Rust with lldb-vscode (CodeLLDB)
                // First compile with debug symbols
                await this.execInContainer(containerId, ['cargo', 'build']);
                command = 'lldb-vscode';
                args = [];
                break;
            default:
                throw (0, index_js_1.createError)(index_js_1.ErrorCode.VALIDATION_ERROR, `Unsupported debug language: ${language}`);
        }
        // Execute debug command in container
        const container = this.docker.getContainer(containerId);
        const exec = await container.exec({
            Cmd: [command, ...args],
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: false,
            WorkingDir: config.cwd || '/workspace',
            Env: config.env ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`) : undefined,
        });
        // Start the exec and capture output
        const stream = await exec.start({ hijack: true, stdin: true });
        // Wait for debug adapter to be ready
        await this.waitForDebugAdapter(session, stream);
    }
    async waitForDebugAdapter(session, stream) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject((0, index_js_1.createError)(index_js_1.ErrorCode.TIMEOUT, 'Debug adapter failed to start within timeout'));
            }, 30000);
            let output = '';
            const checkReady = () => {
                switch (session.language) {
                    case 'javascript':
                    case 'typescript':
                        return output.includes('Debugger listening on');
                    case 'python':
                        return output.includes('Debugpy') || output.includes('Waiting for debugger');
                    case 'go':
                        return output.includes('API server listening');
                    default:
                        return true;
                }
            };
            stream.on('data', (data) => {
                const chunk = data.toString();
                output += chunk;
                console.log(`[Debug ${session.id}] ${chunk}`);
                if (checkReady()) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            stream.on('error', (err) => {
                clearTimeout(timeout);
                reject((0, index_js_1.createError)(index_js_1.ErrorCode.SPAWN_ERROR, `Debug adapter error: ${err.message}`));
            });
        });
    }
    async initializeSession(session) {
        const { client, language, config, port, containerId } = session;
        // Get container IP
        const container = this.docker.getContainer(containerId);
        const info = await container.inspect();
        const containerIP = info.NetworkSettings.IPAddress || '127.0.0.1';
        // Connect to debug adapter
        await client.connect(containerIP, port);
        // Initialize DAP session
        const capabilities = await client.initialize({
            adapterID: language,
        });
        console.log(`[DebugManager] Session ${session.id} initialized with capabilities:`, Object.keys(capabilities));
        // Attach to the running process
        if (language === 'javascript' || language === 'typescript') {
            await client.attach({
                port,
                host: containerIP,
            });
        }
        else if (language === 'python') {
            await client.attach({
                host: containerIP,
                port,
            });
        }
        else if (language === 'go') {
            await client.attach({
                host: containerIP,
                port,
                mode: 'remote',
            });
        }
        else if (language === 'rust') {
            await client.launch({
                program: config.program,
                args: config.args,
                cwd: config.cwd,
                stopOnEntry: config.stopOnEntry,
            });
        }
        // Configuration done
        await client.configurationDone();
        session.state = 'configured';
    }
    async execInContainer(containerId, cmd) {
        const container = this.docker.getContainer(containerId);
        const exec = await container.exec({
            Cmd: cmd,
            AttachStdout: true,
            AttachStderr: true,
        });
        const stream = await exec.start({ hijack: false });
        return new Promise((resolve, reject) => {
            let output = '';
            stream.on('data', (data) => {
                output += data.toString();
            });
            stream.on('end', () => resolve(output));
            stream.on('error', reject);
        });
    }
    /**
     * Terminate a debug session
     */
    async terminateSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }
        console.log(`[DebugManager] Terminating session ${sessionId}`);
        try {
            if (session.client.isConnected) {
                await session.client.disconnect();
            }
        }
        catch (err) {
            // Ignore disconnect errors
        }
        session.client.destroy();
        this.releasePort(session.port);
        // Remove from tracking
        this.sessions.delete(sessionId);
        const projectSessions = this.sessionsByProject.get(session.projectId);
        if (projectSessions) {
            projectSessions.delete(sessionId);
            if (projectSessions.size === 0) {
                this.sessionsByProject.delete(session.projectId);
            }
        }
        this.emit('sessionTerminated', sessionId);
    }
    /**
     * Terminate all sessions for a project
     */
    async terminateProjectSessions(projectId) {
        const sessions = this.sessionsByProject.get(projectId);
        if (!sessions)
            return;
        const promises = Array.from(sessions).map(sessionId => this.terminateSession(sessionId));
        await Promise.all(promises);
    }
    /**
     * Get session by ID
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * Get all sessions for a project
     */
    getProjectSessions(projectId) {
        const sessionIds = this.sessionsByProject.get(projectId);
        if (!sessionIds)
            return [];
        return Array.from(sessionIds)
            .map(id => this.sessions.get(id))
            .filter((s) => s !== undefined);
    }
    // ==================== Debug Operations ====================
    /**
     * Set breakpoints for a file
     */
    async setBreakpoints(sessionId, filePath, breakpoints) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
        }
        session.lastActivity = new Date();
        const source = {
            path: filePath,
            name: filePath.split('/').pop(),
        };
        const verified = await session.client.setBreakpoints(source, breakpoints);
        // Store breakpoints
        session.breakpoints.set(filePath, {
            path: filePath,
            breakpoints,
            verified,
        });
        return verified;
    }
    /**
     * Clear all breakpoints for a file
     */
    async clearBreakpoints(sessionId, filePath) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
        }
        session.lastActivity = new Date();
        const source = {
            path: filePath,
            name: filePath.split('/').pop(),
        };
        await session.client.setBreakpoints(source, []);
        session.breakpoints.delete(filePath);
    }
    /**
     * Continue execution
     */
    async continue(sessionId, threadId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
        }
        session.lastActivity = new Date();
        // Get first thread if not specified
        if (threadId === undefined) {
            const threads = await session.client.threads();
            if (threads.length === 0) {
                throw (0, index_js_1.createError)(index_js_1.ErrorCode.DAP_ERROR, 'No threads available');
            }
            threadId = threads[0].id;
        }
        await session.client.continue(threadId);
        session.state = 'running';
    }
    /**
     * Step over (next)
     */
    async stepOver(sessionId, threadId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
        }
        session.lastActivity = new Date();
        if (threadId === undefined) {
            const threads = await session.client.threads();
            threadId = threads[0]?.id ?? 1;
        }
        await session.client.next(threadId);
    }
    /**
     * Step into
     */
    async stepInto(sessionId, threadId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
        }
        session.lastActivity = new Date();
        if (threadId === undefined) {
            const threads = await session.client.threads();
            threadId = threads[0]?.id ?? 1;
        }
        await session.client.stepIn(threadId);
    }
    /**
     * Step out
     */
    async stepOut(sessionId, threadId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
        }
        session.lastActivity = new Date();
        if (threadId === undefined) {
            const threads = await session.client.threads();
            threadId = threads[0]?.id ?? 1;
        }
        await session.client.stepOut(threadId);
    }
    /**
     * Pause execution
     */
    async pause(sessionId, threadId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
        }
        session.lastActivity = new Date();
        if (threadId === undefined) {
            const threads = await session.client.threads();
            threadId = threads[0]?.id ?? 1;
        }
        await session.client.pause(threadId);
        session.state = 'paused';
    }
    /**
     * Restart debug session
     */
    async restart(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
        }
        session.lastActivity = new Date();
        await session.client.restart();
        session.state = 'running';
    }
    /**
     * Get threads
     */
    async getThreads(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
        }
        session.lastActivity = new Date();
        return session.client.threads();
    }
    /**
     * Get stack trace
     */
    async getStackTrace(sessionId, threadId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
        }
        session.lastActivity = new Date();
        const result = await session.client.stackTrace(threadId);
        return result.stackFrames;
    }
    /**
     * Get scopes for a stack frame
     */
    async getScopes(sessionId, frameId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
        }
        session.lastActivity = new Date();
        return session.client.scopes(frameId);
    }
    /**
     * Get variables
     */
    async getVariables(sessionId, variablesReference) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
        }
        session.lastActivity = new Date();
        return session.client.variables(variablesReference);
    }
    /**
     * Evaluate expression
     */
    async evaluate(sessionId, expression, frameId, context) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
        }
        session.lastActivity = new Date();
        return session.client.evaluate(expression, frameId, context);
    }
    /**
     * Set variable value
     */
    async setVariable(sessionId, variablesReference, name, value) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
        }
        session.lastActivity = new Date();
        return session.client.setVariable(variablesReference, name, value);
    }
    /**
     * Get session capabilities
     */
    getCapabilities(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
        }
        return session.client.getCapabilities();
    }
    /**
     * Get debug manager stats
     */
    getStats() {
        const sessionsByLanguage = {};
        for (const session of this.sessions.values()) {
            sessionsByLanguage[session.language] = (sessionsByLanguage[session.language] || 0) + 1;
        }
        return {
            activeSessions: this.sessions.size,
            sessionsByLanguage,
            portPoolSize: this.portPool.size,
        };
    }
    /**
     * Cleanup all sessions
     */
    async shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        const promises = Array.from(this.sessions.keys()).map(sessionId => this.terminateSession(sessionId));
        await Promise.all(promises);
    }
}
// Export singleton instance
exports.debugManager = new DebugManager();
