"use strict";
/**
 * Debug Adapter Protocol (DAP) Client
 *
 * Implements the DAP specification for communicating with debug adapters.
 * Supports Node.js (node-debug2), Python (debugpy), Go (delve), and Rust (lldb-vscode).
 *
 * @see https://microsoft.github.io/debug-adapter-protocol/
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAPClient = exports.DEBUG_ADAPTER_CONFIGS = void 0;
const events_1 = require("events");
const child_process_1 = require("child_process");
const net_1 = __importDefault(require("net"));
const index_js_1 = require("../errors/index.js");
// Debug adapter configurations per language
exports.DEBUG_ADAPTER_CONFIGS = {
    javascript: {
        language: 'javascript',
        command: 'node',
        args: ['--inspect-brk=0'],
        launchType: 'attach',
        defaultPort: 9229,
    },
    typescript: {
        language: 'typescript',
        command: 'node',
        args: ['--inspect-brk=0', '-r', 'ts-node/register'],
        launchType: 'attach',
        defaultPort: 9229,
    },
    python: {
        language: 'python',
        command: 'python3',
        args: ['-m', 'debugpy', '--listen', '0.0.0.0:5678', '--wait-for-client'],
        launchType: 'attach',
        defaultPort: 5678,
    },
    go: {
        language: 'go',
        command: 'dlv',
        args: ['debug', '--headless', '--listen=:2345', '--api-version=2', '--accept-multiclient'],
        launchType: 'attach',
        defaultPort: 2345,
    },
    rust: {
        language: 'rust',
        command: 'lldb-vscode',
        args: [],
        launchType: 'launch',
        defaultPort: 0,
    },
};
// ==================== DAP Client Implementation ====================
class DAPClient extends events_1.EventEmitter {
    socket = null;
    process = null;
    buffer = '';
    seq = 1;
    pendingRequests = new Map();
    capabilities = {};
    connected = false;
    initialized = false;
    language;
    config;
    constructor(language) {
        super();
        this.language = language;
        this.config = exports.DEBUG_ADAPTER_CONFIGS[language];
        if (!this.config) {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.VALIDATION_ERROR, `Unsupported debug language: ${language}`);
        }
    }
    get isConnected() {
        return this.connected;
    }
    get isInitialized() {
        return this.initialized;
    }
    getCapabilities() {
        return { ...this.capabilities };
    }
    // Connect to a debug adapter via TCP
    async connect(host, port, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const socket = new net_1.default.Socket();
            const timeoutId = setTimeout(() => {
                socket.destroy();
                reject((0, index_js_1.createError)(index_js_1.ErrorCode.TIMEOUT, `Connection to debug adapter timed out after ${timeout}ms`));
            }, timeout);
            socket.on('connect', () => {
                clearTimeout(timeoutId);
                this.socket = socket;
                this.connected = true;
                this.setupSocketHandlers();
                console.log(`[DAP] Connected to debug adapter at ${host}:${port}`);
                resolve();
            });
            socket.on('error', (err) => {
                clearTimeout(timeoutId);
                reject((0, index_js_1.createError)(index_js_1.ErrorCode.CONNECTION_ERROR, `Failed to connect to debug adapter: ${err.message}`));
            });
            socket.connect(port, host);
        });
    }
    // Start debug adapter as a child process
    async spawn(cwd, env) {
        const { command, args } = this.config;
        return new Promise((resolve, reject) => {
            try {
                const processEnv = { ...process.env, ...env };
                this.process = (0, child_process_1.spawn)(command, args, {
                    cwd,
                    env: processEnv,
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
                this.process.on('error', (err) => {
                    reject((0, index_js_1.createError)(index_js_1.ErrorCode.SPAWN_ERROR, `Failed to spawn debug adapter: ${err.message}`));
                });
                this.process.on('exit', (code) => {
                    console.log(`[DAP] Debug adapter process exited with code ${code}`);
                    this.cleanup();
                });
                if (this.process.stdout) {
                    this.process.stdout.on('data', (data) => {
                        this.handleData(data.toString());
                    });
                }
                if (this.process.stderr) {
                    this.process.stderr.on('data', (data) => {
                        console.error(`[DAP stderr] ${data.toString()}`);
                        // Extract port from stderr for Node.js inspector
                        const portMatch = data.toString().match(/Debugger listening on ws:\/\/.*:(\d+)/);
                        if (portMatch) {
                            this.emit('inspectorReady', parseInt(portMatch[1], 10));
                        }
                    });
                }
                this.connected = true;
                resolve();
            }
            catch (err) {
                reject((0, index_js_1.createError)(index_js_1.ErrorCode.SPAWN_ERROR, err.message));
            }
        });
    }
    setupSocketHandlers() {
        if (!this.socket)
            return;
        this.socket.on('data', (data) => {
            this.handleData(data.toString());
        });
        this.socket.on('close', () => {
            console.log('[DAP] Socket closed');
            this.cleanup();
        });
        this.socket.on('error', (err) => {
            console.error(`[DAP] Socket error: ${err.message}`);
            this.emit('error', err);
        });
    }
    handleData(data) {
        this.buffer += data;
        // DAP uses Content-Length headers similar to LSP
        while (true) {
            const headerEnd = this.buffer.indexOf('\r\n\r\n');
            if (headerEnd === -1)
                break;
            const header = this.buffer.slice(0, headerEnd);
            const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
            if (!contentLengthMatch) {
                console.error('[DAP] Missing Content-Length header');
                this.buffer = this.buffer.slice(headerEnd + 4);
                continue;
            }
            const contentLength = parseInt(contentLengthMatch[1], 10);
            const messageStart = headerEnd + 4;
            const messageEnd = messageStart + contentLength;
            if (this.buffer.length < messageEnd)
                break;
            const content = this.buffer.slice(messageStart, messageEnd);
            this.buffer = this.buffer.slice(messageEnd);
            try {
                const message = JSON.parse(content);
                this.handleMessage(message);
            }
            catch (err) {
                console.error('[DAP] Failed to parse message:', err);
            }
        }
    }
    handleMessage(message) {
        switch (message.type) {
            case 'response':
                this.handleResponse(message);
                break;
            case 'event':
                this.handleEvent(message);
                break;
            case 'request':
                this.handleReverseRequest(message);
                break;
        }
    }
    handleResponse(response) {
        const pending = this.pendingRequests.get(response.request_seq);
        if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(response.request_seq);
            if (response.success) {
                pending.resolve(response);
            }
            else {
                pending.reject((0, index_js_1.createError)(index_js_1.ErrorCode.DAP_ERROR, response.message || 'DAP request failed'));
            }
        }
    }
    handleEvent(event) {
        console.log(`[DAP] Event: ${event.event}`, event.body);
        this.emit('event', event);
        this.emit(event.event, event.body);
        // Handle specific events
        switch (event.event) {
            case 'initialized':
                this.initialized = true;
                break;
            case 'terminated':
                this.cleanup();
                break;
            case 'exited':
                this.cleanup();
                break;
        }
    }
    handleReverseRequest(request) {
        // Handle reverse requests from the debug adapter
        console.log(`[DAP] Reverse request: ${request.command}`, request.arguments);
        this.emit('reverseRequest', request);
    }
    // Send a DAP request
    async sendRequest(command, args, timeout = 10000) {
        const seq = this.seq++;
        const request = {
            seq,
            type: 'request',
            command,
            arguments: args,
        };
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(seq);
                reject((0, index_js_1.createError)(index_js_1.ErrorCode.TIMEOUT, `DAP request '${command}' timed out after ${timeout}ms`));
            }, timeout);
            this.pendingRequests.set(seq, {
                resolve: (response) => resolve(response.body),
                reject,
                timeout: timeoutId,
            });
            this.send(request);
        });
    }
    send(message) {
        const content = JSON.stringify(message);
        const header = `Content-Length: ${Buffer.byteLength(content, 'utf8')}\r\n\r\n`;
        const data = header + content;
        if (this.socket) {
            this.socket.write(data);
        }
        else if (this.process?.stdin) {
            this.process.stdin.write(data);
        }
        else {
            throw (0, index_js_1.createError)(index_js_1.ErrorCode.CONNECTION_ERROR, 'No connection to debug adapter');
        }
    }
    // ==================== DAP Protocol Methods ====================
    async initialize(args) {
        const response = await this.sendRequest('initialize', {
            clientID: 'recoder',
            clientName: 'Recoder.xyz',
            adapterID: this.language,
            locale: 'en-US',
            linesStartAt1: true,
            columnsStartAt1: true,
            pathFormat: 'path',
            supportsVariableType: true,
            supportsVariablePaging: true,
            supportsRunInTerminalRequest: true,
            supportsMemoryReferences: true,
            supportsProgressReporting: true,
            supportsInvalidatedEvent: true,
            supportsMemoryEvent: true,
            supportsArgsCanBeInterpretedByShell: true,
            ...args,
        });
        this.capabilities = response;
        return response;
    }
    async configurationDone() {
        await this.sendRequest('configurationDone');
    }
    async launch(args) {
        await this.sendRequest('launch', args);
    }
    async attach(args) {
        await this.sendRequest('attach', args);
    }
    async disconnect(restart = false) {
        try {
            await this.sendRequest('disconnect', { restart }, 5000);
        }
        catch (err) {
            // Ignore disconnect errors
        }
        this.cleanup();
    }
    async terminate(restart = false) {
        await this.sendRequest('terminate', { restart });
    }
    async setBreakpoints(source, breakpoints) {
        const response = await this.sendRequest('setBreakpoints', {
            source,
            breakpoints,
            sourceModified: false,
        });
        return response.breakpoints;
    }
    async setFunctionBreakpoints(breakpoints) {
        const response = await this.sendRequest('setFunctionBreakpoints', {
            breakpoints,
        });
        return response.breakpoints;
    }
    async setExceptionBreakpoints(filters, filterOptions) {
        const response = await this.sendRequest('setExceptionBreakpoints', {
            filters,
            filterOptions,
        });
        return response.breakpoints;
    }
    async continue(threadId) {
        return this.sendRequest('continue', { threadId });
    }
    async next(threadId, granularity) {
        await this.sendRequest('next', { threadId, granularity });
    }
    async stepIn(threadId, targetId, granularity) {
        await this.sendRequest('stepIn', { threadId, targetId, granularity });
    }
    async stepOut(threadId, granularity) {
        await this.sendRequest('stepOut', { threadId, granularity });
    }
    async stepBack(threadId, granularity) {
        await this.sendRequest('stepBack', { threadId, granularity });
    }
    async pause(threadId) {
        await this.sendRequest('pause', { threadId });
    }
    async threads() {
        const response = await this.sendRequest('threads');
        return response.threads;
    }
    async stackTrace(threadId, startFrame = 0, levels = 20) {
        return this.sendRequest('stackTrace', { threadId, startFrame, levels });
    }
    async scopes(frameId) {
        const response = await this.sendRequest('scopes', { frameId });
        return response.scopes;
    }
    async variables(variablesReference, filter, start, count) {
        const response = await this.sendRequest('variables', {
            variablesReference,
            filter,
            start,
            count,
        });
        return response.variables;
    }
    async setVariable(variablesReference, name, value) {
        return this.sendRequest('setVariable', { variablesReference, name, value });
    }
    async evaluate(expression, frameId, context) {
        return this.sendRequest('evaluate', { expression, frameId, context });
    }
    async completions(frameId, text, column, line) {
        const response = await this.sendRequest('completions', {
            frameId,
            text,
            column,
            line,
        });
        return response.targets;
    }
    async source(sourceReference, source) {
        return this.sendRequest('source', { sourceReference, source });
    }
    async loadedSources() {
        const response = await this.sendRequest('loadedSources');
        return response.sources;
    }
    async restart(args) {
        await this.sendRequest('restart', args);
    }
    cleanup() {
        this.connected = false;
        this.initialized = false;
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
        // Reject all pending requests
        for (const [seq, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject((0, index_js_1.createError)(index_js_1.ErrorCode.CONNECTION_ERROR, 'Debug session terminated'));
        }
        this.pendingRequests.clear();
        this.emit('terminated');
    }
    destroy() {
        this.cleanup();
        this.removeAllListeners();
    }
}
exports.DAPClient = DAPClient;
