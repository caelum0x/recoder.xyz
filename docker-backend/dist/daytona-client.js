"use strict";
/**
 * Daytona REST Client for docker-backend
 *
 * Communicates with the self-hosted Daytona API server via REST.
 * The Python backend uses the Daytona Python SDK; this module provides
 * equivalent functionality for the Express/TypeScript backend without
 * requiring an npm SDK dependency.
 *
 * Architecture:
 * - Sandbox lifecycle (create/get/list/start/stop/delete) goes through the
 *   Daytona API at http://localhost:3900/api
 * - Toolbox operations (exec, file I/O) go through the toolbox proxy URL,
 *   which is dynamically discovered from GET /api/config → proxyToolboxUrl.
 *   Toolbox endpoints use path format: {proxyToolboxUrl}/{sandboxId}/process/execute
 *
 * File operations use the native Toolbox filesystem API endpoints
 * (upload, download, mkdir, list, delete) with automatic fallback to
 * exec-based shell commands if the native endpoints fail or return 404.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DaytonaClient = void 0;
exports.getDaytonaClient = getDaytonaClient;
exports.isDaytonaConfigured = isDaytonaConfigured;
const logger_js_1 = require("./logger.js");
const logger = (0, logger_js_1.createLogger)('daytona-client');
// ──────────────────────────── Client ────────────────────────────
class DaytonaClient {
    baseUrl;
    apiKey;
    toolboxApiKey;
    target;
    defaultSnapshot;
    timeoutMs;
    _toolboxProxyUrl;
    constructor(config) {
        this.baseUrl = (config?.baseUrl || process.env.DAYTONA_SERVER_URL || 'http://localhost:3900/api').replace(/\/$/, '');
        this.apiKey = config?.apiKey || process.env.DAYTONA_API_KEY || '';
        // The daytona-proxy uses PROXY_API_KEY=super_secret_key (different from the API key)
        this.toolboxApiKey = config?.toolboxApiKey || process.env.DAYTONA_TOOLBOX_API_KEY || 'super_secret_key';
        this.target = config?.target || process.env.DAYTONA_TARGET || 'us';
        this.defaultSnapshot = config?.defaultSnapshot || process.env.DAYTONA_SNAPSHOT || 'daytonaio/sandbox:0.5.0-slim';
        this.timeoutMs = config?.timeoutMs || 30000;
        // Default toolbox URL to the internal proxy port to avoid SSL round-trip
        this._toolboxProxyUrl = config?.toolboxProxyUrl || process.env.DAYTONA_TOOLBOX_PROXY_URL || null;
        if (!this.apiKey) {
            logger.warn('DaytonaClient initialized without API key — sandbox operations will fail');
        }
        else {
            logger.info({ baseUrl: this.baseUrl, target: this.target }, 'DaytonaClient initialized');
        }
    }
    // ── Helpers ──
    get headers() {
        return {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        };
    }
    /** Headers for toolbox proxy requests (uses PROXY_API_KEY, not the Daytona API key). */
    get toolboxHeaders() {
        return {
            'Content-Type': 'application/json',
            ...(this.toolboxApiKey ? { Authorization: `Bearer ${this.toolboxApiKey}` } : {}),
        };
    }
    /**
     * Make an authenticated request to the Daytona API server.
     */
    async request(method, path, body, timeoutMs) {
        const url = `${this.baseUrl}${path}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs || this.timeoutMs);
        try {
            const response = await fetch(url, {
                method,
                headers: this.headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`Daytona API ${method} ${path} failed: ${response.status} ${response.statusText} — ${text}`);
            }
            // Some endpoints return empty body with 200
            const contentLength = response.headers.get('content-length');
            if (response.status === 204 || contentLength === '0') {
                return undefined;
            }
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                return (await response.json());
            }
            // Return raw text for non-JSON responses
            return (await response.text());
        }
        finally {
            clearTimeout(timeout);
        }
    }
    /**
     * Make an authenticated request to the Daytona toolbox proxy.
     * Toolbox endpoints handle exec, file I/O, LSP, etc.
     */
    async toolboxRequest(method, sandboxId, path, body, timeoutMs) {
        const toolboxBase = await this.getToolboxProxyUrl();
        // Path format: /api/toolbox/{sandboxId}/toolbox/{operation}
        const url = `${toolboxBase}/${sandboxId}/toolbox${path}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs || this.timeoutMs);
        try {
            const response = await fetch(url, {
                method,
                // Use Daytona API key (main API at port 3900)
                headers: this.headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`Daytona toolbox ${method} ${path} failed: ${response.status} ${response.statusText} — ${text}`);
            }
            const contentLength = response.headers.get('content-length');
            if (response.status === 204 || contentLength === '0') {
                return undefined;
            }
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                return (await response.json());
            }
            return (await response.text());
        }
        finally {
            clearTimeout(timeout);
        }
    }
    /**
     * Get the toolbox proxy URL, discovering it from the config API if needed.
     */
    async getToolboxProxyUrl() {
        if (this._toolboxProxyUrl) {
            return this._toolboxProxyUrl;
        }
        // Use the main Daytona API at port 3900 for toolbox operations.
        // The toolbox endpoint path is: /api/toolbox/{sandboxId}/toolbox/{operation}
        // (double "toolbox" is intentional — first is the proxy route, second is sandbox service prefix)
        // From inside Docker, use host.docker.internal to reach the host.
        const isDocker = require('fs').existsSync('/.dockerenv');
        this._toolboxProxyUrl = isDocker
            ? 'http://host.docker.internal:3900/api/toolbox'
            : `${this.baseUrl.replace(/\/api$/, '')}/api/toolbox`;
        logger.info({ toolboxProxyUrl: this._toolboxProxyUrl }, 'Using Daytona API toolbox URL');
        return this._toolboxProxyUrl;
    }
    // ── Health / Availability ──
    /**
     * Check if the Daytona API server is reachable and responsive.
     */
    async isAvailable() {
        try {
            await this.request('GET', '/sandbox', undefined, 5000);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Health check returning latency information.
     */
    async healthCheck() {
        const start = Date.now();
        try {
            await this.request('GET', '/sandbox', undefined, 5000);
            return { healthy: true, latencyMs: Date.now() - start };
        }
        catch (err) {
            return {
                healthy: false,
                latencyMs: Date.now() - start,
                error: err.message,
            };
        }
    }
    // ── Sandbox Lifecycle (via main API) ──
    /**
     * Create a new Daytona sandbox.
     */
    async createSandbox(options) {
        const payload = {
            snapshot: options?.snapshot || this.defaultSnapshot,
            target: options?.target || this.target,
            public: options?.public ?? true,
            env_vars: options?.envVars || {},
            labels: options?.labels || {},
            autoStopInterval: options?.autoStopInterval ?? 43200,
            autoArchiveInterval: options?.autoArchiveInterval ?? 43200,
            ...(options?.resources ? {
                resources: {
                    cpu: options.resources.cpu,
                    memory: options.resources.memory,
                    disk: options.resources.disk,
                },
            } : {}),
        };
        logger.info({ snapshot: payload.snapshot, target: payload.target }, 'Creating Daytona sandbox');
        // Sandbox creation can take time — use a longer timeout
        const sandbox = await this.request('POST', '/sandbox', payload, 120000);
        logger.info({ sandboxId: sandbox.id, state: sandbox.state }, 'Daytona sandbox created');
        return sandbox;
    }
    /**
     * Get sandbox info by ID.
     */
    async getSandbox(sandboxId) {
        return this.request('GET', `/sandbox/${sandboxId}`);
    }
    /**
     * List all sandboxes.
     */
    async listSandboxes() {
        return this.request('GET', '/sandbox');
    }
    /**
     * Start a stopped/archived sandbox.
     */
    async startSandbox(sandboxId) {
        await this.request('POST', `/sandbox/${sandboxId}/start`, undefined, 60000);
        logger.info({ sandboxId }, 'Daytona sandbox started');
    }
    /**
     * Stop a running sandbox.
     */
    async stopSandbox(sandboxId) {
        await this.request('POST', `/sandbox/${sandboxId}/stop`);
        logger.info({ sandboxId }, 'Daytona sandbox stopped');
    }
    /**
     * Delete a sandbox permanently.
     */
    async deleteSandbox(sandboxId) {
        await this.request('DELETE', `/sandbox/${sandboxId}`);
        logger.info({ sandboxId }, 'Daytona sandbox deleted');
    }
    // ── Command Execution (via toolbox proxy) ──
    /**
     * Execute a command in a sandbox.
     * Uses the toolbox proxy endpoint: POST /{sandboxId}/process/execute
     *
     * NOTE: The Daytona toolbox executes the command directly via exec() —
     * it does NOT run through a shell by default. This means shell operators
     * (&&, ||, >, |, etc.) won't work unless explicitly wrapped in `sh -c`.
     * This method automatically wraps the command in `sh -c "..."` to match
     * the behavior of the Python SDK.
     */
    async execCommand(sandboxId, command, options) {
        // Build the full command with optional cwd prefix
        let fullCommand = command;
        if (options?.cwd) {
            const safeCwd = options.cwd.replace(/'/g, "'\\''");
            fullCommand = `cd '${safeCwd}' 2>/dev/null || cd /home/daytona 2>/dev/null || true; ${command}`;
        }
        let execCmd;
        // Short commands: inline sh -c (fast, no temp file overhead)
        // Long commands: write to temp file then execute (avoids JSON.stringify mangling)
        if (fullCommand.length < 500) {
            execCmd = `sh -c ${JSON.stringify(fullCommand)}`;
        }
        else {
            // Encode command as base64 and decode in the sandbox to avoid any escaping issues
            const b64 = Buffer.from(fullCommand, 'utf-8').toString('base64');
            const tmpScript = `/tmp/_cmd_${Date.now()}.sh`;
            // printf the base64 (no shell escaping needed for base64 chars) then decode and run
            execCmd = `printf '%s' '${b64}' | base64 -d > ${tmpScript} && sh ${tmpScript}; __e=$?; rm -f ${tmpScript}; exit $__e`;
        }
        const payload = {
            command: execCmd,
            ...(options?.timeoutSecs ? { timeout: options.timeoutSecs } : {}),
        };
        const timeoutMs = options?.timeoutSecs
            ? options.timeoutSecs * 1000 + 5000 // extra 5s buffer
            : this.timeoutMs;
        const result = await this.toolboxRequest('POST', sandboxId, '/process/execute', payload, timeoutMs);
        return {
            output: result?.result || '',
            exitCode: result?.exitCode ?? result?.code ?? 0,
        };
    }
    // ── File Operations — Native Toolbox Filesystem API ──
    // These use the Daytona Toolbox filesystem endpoints directly,
    // which is more efficient and reliable than exec-based shell commands.
    // The exec-based methods are kept as fallbacks below.
    /**
     * Write a file to a sandbox using the native Toolbox filesystem API.
     * Falls back to exec-based upload if the native endpoint fails.
     */
    async uploadFile(sandboxId, filePath, content) {
        // Use exec-based upload directly — the native /filesystem/upload endpoint
        // returns 404 on our Daytona version (0.5.0). Exec-based write is reliable.
        await this.uploadFileExec(sandboxId, filePath, content);
    }
    /**
     * Read a file from a sandbox using the native Toolbox filesystem API.
     * Falls back to exec-based download if the native endpoint fails.
     */
    async downloadFile(sandboxId, filePath) {
        try {
            return await this.downloadFileNative(sandboxId, filePath);
        }
        catch (nativeErr) {
            logger.warn({ sandboxId: sandboxId.slice(0, 12), filePath, error: nativeErr.message }, 'Native filesystem download failed, falling back to exec-based download');
            return this.downloadFileExec(sandboxId, filePath);
        }
    }
    /**
     * List files in a sandbox directory using the native Toolbox filesystem API.
     * Falls back to exec-based listing if the native endpoint fails.
     */
    async listFiles(sandboxId, dirPath) {
        try {
            return await this.listFilesNative(sandboxId, dirPath);
        }
        catch (nativeErr) {
            logger.warn({ sandboxId: sandboxId.slice(0, 12), dirPath, error: nativeErr.message }, 'Native filesystem list failed, falling back to legacy /files/ endpoint');
            // Fallback to the old /files/ endpoint
            const encodedPath = encodeURIComponent(dirPath);
            return this.toolboxRequest('GET', sandboxId, `/files/?path=${encodedPath}`);
        }
    }
    /**
     * Delete a file in a sandbox using the native Toolbox filesystem API.
     * Falls back to exec-based delete if the native endpoint fails.
     */
    async deleteFile(sandboxId, filePath) {
        try {
            await this.deleteFileNative(sandboxId, filePath);
        }
        catch (nativeErr) {
            logger.warn({ sandboxId: sandboxId.slice(0, 12), filePath, error: nativeErr.message }, 'Native filesystem delete failed, falling back to exec-based delete');
            await this.deleteFileExec(sandboxId, filePath);
        }
    }
    // ── Native Toolbox Filesystem Methods ──
    /**
     * Upload a file via the Toolbox filesystem API.
     * POST /filesystem/upload with base64-encoded content.
     */
    async uploadFileNative(sandboxId, filePath, content) {
        const absPath = filePath.startsWith('/') ? filePath : `/home/daytona/${filePath}`;
        // Create parent directory first
        const dir = absPath.substring(0, absPath.lastIndexOf('/'));
        if (dir && dir !== '/home/daytona') {
            await this.createDirectoryNative(sandboxId, dir);
        }
        // Upload file content (base64-encoded to handle binary/special chars)
        await this.toolboxRequest('POST', sandboxId, '/filesystem/upload', {
            path: absPath,
            content: Buffer.from(content, 'utf-8').toString('base64'),
            encoding: 'base64',
        });
    }
    /**
     * Download a file via the Toolbox filesystem API.
     * GET /filesystem/download?path=...
     */
    async downloadFileNative(sandboxId, filePath) {
        const absPath = filePath.startsWith('/') ? filePath : `/home/daytona/${filePath}`;
        const toolboxBase = await this.getToolboxProxyUrl();
        const url = `${toolboxBase}/${sandboxId}/toolbox/filesystem/download?path=${encodeURIComponent(absPath)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: this.headers,
                signal: controller.signal,
            });
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`Daytona filesystem download failed: ${response.status} ${response.statusText} — ${text}`);
            }
            // The download endpoint may return raw file content (not JSON)
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const result = (await response.json());
                if (result.encoding === 'base64' && result.content) {
                    return Buffer.from(result.content, 'base64').toString('utf-8');
                }
                return result?.content || '';
            }
            // Raw text response — return directly
            return await response.text();
        }
        finally {
            clearTimeout(timeout);
        }
    }
    /**
     * Create a directory via the Toolbox filesystem API.
     * POST /filesystem/mkdir
     */
    async createDirectoryNative(sandboxId, dirPath) {
        const absPath = dirPath.startsWith('/') ? dirPath : `/home/daytona/${dirPath}`;
        await this.toolboxRequest('POST', sandboxId, '/filesystem/mkdir', {
            path: absPath,
            mode: '0755',
        });
    }
    /**
     * List directory contents via the Toolbox filesystem API.
     * GET /filesystem/list?path=...
     */
    async listFilesNative(sandboxId, dirPath) {
        const absPath = dirPath.startsWith('/') ? dirPath : `/home/daytona/${dirPath}`;
        const result = await this.toolboxRequest('GET', sandboxId, `/filesystem/list?path=${encodeURIComponent(absPath)}`);
        // Handle both array response and { entries: [...] } wrapper
        if (Array.isArray(result)) {
            return result;
        }
        if (result && 'entries' in result && Array.isArray(result.entries)) {
            return result.entries.map(e => ({
                name: e.name,
                isDir: e.isDir,
                size: e.size,
                modTime: e.modTime,
            }));
        }
        return [];
    }
    /**
     * Delete a file or directory via the Toolbox filesystem API.
     * DELETE /filesystem/delete?path=...
     */
    async deleteFileNative(sandboxId, filePath) {
        const absPath = filePath.startsWith('/') ? filePath : `/home/daytona/${filePath}`;
        await this.toolboxRequest('DELETE', sandboxId, `/filesystem/delete?path=${encodeURIComponent(absPath)}`);
    }
    // ── Exec-based File Operations (fallbacks) ──
    /**
     * Write a file to a sandbox using exec + base64 encoding.
     * Kept as fallback for when native filesystem API is unavailable.
     */
    /**
     * ROOT CAUSE FIX for file writes failing silently:
     *
     * Problem: execCommand() wraps commands in sh -c "echo '{base64_of_command}' | base64 -d | sh"
     * When the command contains 65KB+ of base64 file content, the outer echo argument
     * exceeds shell limits (~128KB), causing silent failure (exit 0, empty output).
     *
     * Fix: Call the Daytona /process/execute API directly with sh -c and the raw command.
     * The API passes the command string to exec(), which passes it to sh.
     * sh -c "printf '%s' '{b64}' | base64 -d > file" works because printf handles
     * the argument directly, and the command goes through the API's JSON body
     * (no size limit) not through shell argument parsing.
     *
     * For very large files (>50KB of content = ~68KB base64), we chunk the base64
     * into a temp file first, then decode in a separate call.
     */
    async uploadFileExec(sandboxId, filePath, content) {
        const safePath = filePath.replace(/'/g, "'\\''");
        const b64Content = Buffer.from(content, 'utf-8').toString('base64');
        // Helper: call Daytona API directly (no double-encoding via execCommand)
        const rawExec = async (cmd, timeoutSecs = 30) => {
            const shCmd = `sh -c ${JSON.stringify(cmd)}`;
            const result = await this.toolboxRequest('POST', sandboxId, '/process/execute', { command: shCmd, timeout: timeoutSecs }, timeoutSecs * 1000 + 5000);
            return {
                output: result?.result || '',
                exitCode: result?.exitCode ?? result?.code ?? 0,
            };
        };
        // Create parent directory
        const dir = filePath.substring(0, filePath.lastIndexOf('/'));
        if (dir) {
            await rawExec(`mkdir -p '${dir.replace(/'/g, "'\\''")}'`, 10);
        }
        // For files up to ~40KB base64 (fits in a single printf argument)
        const SINGLE_LIMIT = 40000;
        if (b64Content.length <= SINGLE_LIMIT) {
            const r = await rawExec(`printf '%s' '${b64Content}' | base64 -d > '${safePath}'`);
            if (r.exitCode !== 0) {
                throw new Error(`File write to ${filePath} failed (exit ${r.exitCode}): ${r.output}`);
            }
            return;
        }
        // Large files: write base64 chunks to temp file, then decode
        const tmpFile = `/tmp/_upload_${Date.now()}.b64`;
        const CHUNK = 40000;
        for (let i = 0; i < b64Content.length; i += CHUNK) {
            const chunk = b64Content.slice(i, i + CHUNK);
            const op = i === 0 ? '>' : '>>';
            const r = await rawExec(`printf '%s' '${chunk}' ${op} '${tmpFile}'`);
            if (r.exitCode !== 0) {
                throw new Error(`File write chunk failed at offset ${i} for ${filePath}: ${r.output}`);
            }
        }
        // Decode and move to target
        const r = await rawExec(`base64 -d < '${tmpFile}' > '${safePath}' && rm -f '${tmpFile}'`);
        if (r.exitCode !== 0) {
            throw new Error(`File decode failed for ${filePath} (exit ${r.exitCode}): ${r.output}`);
        }
    }
    /**
     * Read a file from a sandbox using exec + cat.
     * Kept as fallback for when native filesystem API is unavailable.
     */
    async downloadFileExec(sandboxId, filePath) {
        const result = await this.execCommand(sandboxId, `cat '${filePath.replace(/'/g, "'\\''")}'`, { timeoutSecs: 30 });
        if (result.exitCode !== 0) {
            throw new Error(`File read from ${filePath} failed (exit ${result.exitCode}): ${result.output}`);
        }
        return result.output;
    }
    /**
     * Delete a file in a sandbox using exec + rm.
     * Kept as fallback for when native filesystem API is unavailable.
     */
    async deleteFileExec(sandboxId, filePath) {
        const result = await this.execCommand(sandboxId, `rm -f '${filePath.replace(/'/g, "'\\''")}'`, { timeoutSecs: 10 });
        if (result.exitCode !== 0) {
            throw new Error(`File delete of ${filePath} failed (exit ${result.exitCode}): ${result.output}`);
        }
    }
    // ── Session / PTY Operations (via toolbox proxy) ──
    /**
     * Create a persistent session in a Daytona sandbox.
     * Sessions allow multiple commands to share state (cwd, env, etc.)
     * and support PTY-based terminal emulation.
     *
     * POST /{sandboxId}/toolbox/process/session
     */
    async createSession(sandboxId, sessionName) {
        const sessionId = sessionName || `session-${Date.now()}`;
        const result = await this.toolboxRequest('POST', sandboxId, '/process/session', { sessionId, name: sessionId });
        return result?.sessionId || result?.id || sessionId;
    }
    /**
     * Execute a command within an existing session.
     * The command inherits the session's cwd, env, and PTY state.
     *
     * POST /{sandboxId}/toolbox/process/session/{sessionId}/exec
     */
    async execInSession(sandboxId, sessionId, command) {
        try {
            const result = await this.toolboxRequest('POST', sandboxId, `/process/session/${sessionId}/exec`, { command });
            return { cmdId: result?.cmdId || result?.id || result?.commandId || '' };
        }
        catch (err) {
            const msg = err?.message || '';
            // Broken pipe = session died. Recreate and retry once.
            if (msg.includes('broken pipe') || msg.includes('session not found') || msg.includes('no such process')) {
                logger.warn({ sandboxId, sessionId, error: msg }, 'Session dead, recreating...');
                try {
                    await this.createSession(sandboxId, sessionId);
                    const retry = await this.toolboxRequest('POST', sandboxId, `/process/session/${sessionId}/exec`, { command });
                    return { cmdId: retry?.cmdId || retry?.id || retry?.commandId || '' };
                }
                catch (retryErr) {
                    throw new Error(`Session exec failed after recreate: ${retryErr.message}`);
                }
            }
            throw err;
        }
    }
    /**
     * Retrieve logs/output from a session or a specific command within a session.
     *
     * GET /{sandboxId}/toolbox/process/session/{sessionId}/logs
     * GET /{sandboxId}/toolbox/process/session/{sessionId}/command/{cmdId}/logs
     */
    async getSessionLogs(sandboxId, sessionId, cmdId) {
        const path = cmdId
            ? `/process/session/${sessionId}/command/${cmdId}/logs`
            : `/process/session/${sessionId}/logs`;
        const result = await this.toolboxRequest('GET', sandboxId, path);
        return result?.logs || result?.output || result?.result || '';
    }
    /**
     * Delete/destroy a session in a Daytona sandbox.
     *
     * DELETE /{sandboxId}/toolbox/process/session/{sessionId}
     */
    async deleteSession(sandboxId, sessionId) {
        try {
            await this.toolboxRequest('DELETE', sandboxId, `/process/session/${sessionId}`);
        }
        catch (err) {
            // Best-effort cleanup — session may already be gone
            logger.warn({ sandboxId: sandboxId.slice(0, 12), sessionId, error: err.message }, 'Failed to delete Daytona session (may already be cleaned up)');
        }
    }
    /**
     * Resize the PTY attached to a session.
     * Some Daytona versions support this on the session endpoint.
     *
     * POST /{sandboxId}/toolbox/process/session/{sessionId}/resize
     */
    async resizeSession(sandboxId, sessionId, cols, rows) {
        try {
            await this.toolboxRequest('POST', sandboxId, `/process/session/${sessionId}/resize`, {
                cols,
                rows,
            });
            return true;
        }
        catch {
            // Resize may not be supported — silently ignore
            return false;
        }
    }
    // ── Git Operations (native Daytona toolbox API) ──
    /**
     * Clone a git repository into a sandbox path.
     * POST /git/clone
     */
    async gitClone(sandboxId, url, path, options) {
        await this.toolboxRequest('POST', sandboxId, '/git/clone', { url, path, ...options }, 120000);
    }
    /**
     * Stage files in a git repository.
     * POST /git/add
     */
    async gitAdd(sandboxId, path, files) {
        await this.toolboxRequest('POST', sandboxId, '/git/add', { path, files });
    }
    /**
     * Create a git commit.
     * POST /git/commit
     */
    async gitCommit(sandboxId, path, message, author) {
        await this.toolboxRequest('POST', sandboxId, '/git/commit', { path, message, author });
    }
    /**
     * Push to a remote repository.
     * POST /git/push
     */
    async gitPush(sandboxId, path) {
        await this.toolboxRequest('POST', sandboxId, '/git/push', { path });
    }
    /**
     * Pull from a remote repository.
     * POST /git/pull
     */
    async gitPull(sandboxId, path) {
        await this.toolboxRequest('POST', sandboxId, '/git/pull', { path });
    }
    /**
     * List branches in a git repository.
     * GET /git/branches
     */
    async gitBranches(sandboxId, path) {
        const result = await this.toolboxRequest('GET', sandboxId, `/git/branches?path=${encodeURIComponent(path)}`);
        // Handle both array of strings and { branches: [...] } response formats
        if (Array.isArray(result)) {
            return result.map((b) => typeof b === 'string' ? b : b.name || String(b));
        }
        if (result && typeof result === 'object' && 'branches' in result) {
            return (result.branches || []).map((b) => typeof b === 'string' ? b : b.name || String(b));
        }
        return [];
    }
    /**
     * Create a new branch.
     * POST /git/branch/create
     */
    async gitBranchCreate(sandboxId, path, name) {
        await this.toolboxRequest('POST', sandboxId, '/git/branch/create', { path, name });
    }
    /**
     * Checkout a branch.
     * POST /git/branch/checkout
     */
    async gitBranchCheckout(sandboxId, path, name) {
        await this.toolboxRequest('POST', sandboxId, '/git/branch/checkout', { path, name });
    }
    /**
     * Get git status.
     * GET /git/status
     */
    async gitStatus(sandboxId, path) {
        return this.toolboxRequest('GET', sandboxId, `/git/status?path=${encodeURIComponent(path)}`);
    }
    // ── Preview URLs ──
    /**
     * Get the preview URL for a port exposed by a sandbox.
     * Uses the configured DNS pattern: https://{port}-{sandboxId}.sandbox.recoder.xyz
     */
    getPreviewUrl(sandboxId, port) {
        return `https://${port}-${sandboxId}.sandbox.recoder.xyz`;
    }
    // ── Convenience: Get or Start ──
    /**
     * Get a sandbox by ID. If stopped/archived, start it and wait for it to be ready.
     * Mirrors the Python backend's get_or_start_sandbox() behavior.
     */
    async getOrStartSandbox(sandboxId, maxWaitMs = 30000) {
        let sandbox = await this.getSandbox(sandboxId);
        const needsStart = ['stopped', 'archived', 'archiving'].includes(sandbox.state);
        if (needsStart) {
            logger.info({ sandboxId, state: sandbox.state }, 'Sandbox needs starting');
            await this.startSandbox(sandboxId);
        }
        // Wait for sandbox to reach running state (handles 'creating', 'starting', etc.)
        if (sandbox.state !== 'started' && sandbox.state !== 'running') {
            const deadline = Date.now() + maxWaitMs;
            while (Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                sandbox = await this.getSandbox(sandboxId);
                if (sandbox.state === 'started' || sandbox.state === 'running') {
                    break;
                }
                logger.info({ sandboxId, state: sandbox.state }, 'Waiting for sandbox to be ready...');
            }
            if (sandbox.state !== 'started' && sandbox.state !== 'running') {
                throw new Error(`Sandbox ${sandboxId} not ready within ${maxWaitMs}ms (state: ${sandbox.state})`);
            }
        }
        return sandbox;
    }
}
exports.DaytonaClient = DaytonaClient;
// ──────────────────────────── Singleton ────────────────────────────
let _instance = null;
/**
 * Get or create the singleton DaytonaClient instance.
 * Reads configuration from environment variables on first call.
 */
function getDaytonaClient() {
    if (!_instance) {
        _instance = new DaytonaClient();
    }
    return _instance;
}
/**
 * Check if Daytona integration is configured (API key present).
 */
function isDaytonaConfigured() {
    return !!(process.env.DAYTONA_API_KEY);
}
