"use strict";
/**
 * Sandbox API Routes
 *
 * Endpoints for managing sandboxes via the public API:
 * - POST   /v1/sandboxes           - Create a new sandbox
 * - GET    /v1/sandboxes           - List sandboxes
 * - GET    /v1/sandboxes/:id       - Get sandbox details
 * - DELETE /v1/sandboxes/:id       - Delete a sandbox
 * - POST   /v1/sandboxes/:id/execute - Execute a command
 * - POST   /v1/sandboxes/:id/files - Write a file
 * - GET    /v1/sandboxes/:id/files - Read a file
 * - GET    /v1/sandboxes/:id/files/list - List files
 * - DELETE /v1/sandboxes/:id/files - Delete a file
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports._testing = exports.sandboxRouter = void 0;
exports.initSandboxRoutes = initSandboxRoutes;
const express_1 = require("express");
const uuid_1 = require("uuid");
const middleware_js_1 = require("../middleware.js");
const api_keys_js_1 = require("../api-keys.js");
const rate_limiter_js_1 = require("../rate-limiter.js");
const logger_js_1 = require("../../logger.js");
const persistence_js_1 = require("../../persistence.js");
// ==================== Helpers ====================
/** Validate a file/directory path for sandbox operations */
function isValidSandboxPath(p) {
    if (!p || typeof p !== 'string')
        return false;
    // Block null bytes
    if (p.includes('\0'))
        return false;
    // Block path traversal patterns (including encoded)
    if (p.includes('..'))
        return false;
    // Block absolute paths outside workspace
    if (p.startsWith('/') && !p.startsWith('/workspace'))
        return false;
    // Resolve and verify the path stays within /workspace
    const path = require('path');
    const base = '/workspace';
    const resolved = p.startsWith('/') ? path.resolve(p) : path.resolve(base, p);
    if (!resolved.startsWith(base + '/') && resolved !== base)
        return false;
    return true;
}
function loadSandboxesStore() {
    return (0, persistence_js_1.loadStore)('sandboxes', {
        sandboxes: [],
        sandboxesByApiKey: [],
    });
}
function buildSandboxesStoreData() {
    return {
        sandboxes: Array.from(sandboxes.entries()),
        sandboxesByApiKey: Array.from(sandboxesByApiKey.entries()).map(([keyId, sandboxSet]) => [keyId, Array.from(sandboxSet)]),
    };
}
function saveSandboxesStore(immediate) {
    const data = buildSandboxesStoreData();
    if (immediate) {
        (0, persistence_js_1.saveStore)('sandboxes', data);
    }
    else {
        (0, persistence_js_1.debouncedSave)('sandboxes', data);
    }
}
const _stored = loadSandboxesStore();
const sandboxes = new Map(_stored.sandboxes);
const sandboxesByApiKey = new Map(_stored.sandboxesByApiKey.map(([keyId, sandboxIds]) => [keyId, new Set(sandboxIds)]));
let deps = null;
const logger = (0, logger_js_1.createLogger)('public-api:sandboxes');
/**
 * Initialize sandbox routes with dependencies
 */
function initSandboxRoutes(dependencies) {
    deps = dependencies;
    logger.info('Sandbox routes initialized with dependencies');
}
// ==================== Helpers ====================
/**
 * Convert sandbox record to API response
 */
function toSandboxResponse(record) {
    return {
        id: record.id,
        name: record.name,
        state: record.state,
        template: record.template,
        previewUrl: record.previewUrl,
        terminalUrl: record.terminalUrl,
        createdAt: record.createdAt,
        lastActivityAt: record.lastActivityAt,
        expiresAt: record.expiresAt,
        resourceLimits: {
            memoryMB: record.resourceLimits.memoryMB,
            cpuShares: record.resourceLimits.cpuShares,
            diskMB: record.resourceLimits.diskMB,
        },
        metadata: record.metadata,
    };
}
/**
 * Get sandbox and validate ownership
 */
function getSandboxForApiKey(sandboxId, apiKeyId) {
    const sandbox = sandboxes.get(sandboxId);
    if (!sandbox) {
        return null;
    }
    if (sandbox.apiKeyId !== apiKeyId) {
        return null;
    }
    return sandbox;
}
/**
 * Update sandbox activity timestamp
 */
function updateActivity(sandbox) {
    sandbox.lastActivityAt = Date.now();
    saveSandboxesStore();
}
/**
 * Ensure a sandbox is running, starting it if stopped.
 * Returns true if sandbox is now running, false if it could not be started.
 */
async function ensureSandboxRunning(sandbox) {
    if (sandbox.state === 'running')
        return { ok: true };
    if (sandbox.state === 'creating' || sandbox.state === 'error' || sandbox.state === 'deleted') {
        return { ok: false, error: `Sandbox is in non-recoverable state: ${sandbox.state}` };
    }
    if (!sandbox.containerId || !deps)
        return { ok: false, error: 'No container or deps' };
    try {
        await deps.startContainer(sandbox.containerId);
        sandbox.state = 'running';
        updateActivity(sandbox);
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: err.message };
    }
}
// ==================== Auto-cleanup ====================
/**
 * Clean up expired sandboxes
 */
async function cleanupExpiredSandboxes() {
    const now = Date.now();
    for (const [id, sandbox] of sandboxes.entries()) {
        if (sandbox.expiresAt && sandbox.expiresAt < now && sandbox.state === 'running') {
            logger.info({ sandboxId: id }, 'Auto-stopping expired sandbox');
            try {
                if (deps && sandbox.containerId) {
                    await deps.stopContainer(sandbox.containerId);
                }
                sandbox.state = 'stopped';
                saveSandboxesStore();
            }
            catch (error) {
                logger.error({ err: error, sandboxId: id }, 'Failed to stop expired sandbox');
            }
        }
    }
}
// Run cleanup every minute
setInterval(cleanupExpiredSandboxes, 60000);
// ==================== Router ====================
const router = (0, express_1.Router)();
exports.sandboxRouter = router;
// ==================== POST /v1/sandboxes - Create Sandbox ====================
router.post('/', ...middleware_js_1.sandboxCreationMiddleware, (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    if (!deps) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Sandbox service not initialized',
        }, req.requestId);
        return;
    }
    const apiKey = req.apiKey;
    const body = req.body;
    // Generate IDs
    const sandboxId = (0, uuid_1.v4)();
    const name = body.name || `sandbox-${sandboxId.slice(0, 8)}`;
    // Get tier limits
    const maxDuration = (0, rate_limiter_js_1.getMaxSandboxDuration)(apiKey.tier);
    const maxFileSize = (0, rate_limiter_js_1.getMaxFileSize)(apiKey.tier);
    // Calculate expiration
    const timeoutSeconds = body.timeoutSeconds
        ? Math.min(body.timeoutSeconds, maxDuration)
        : maxDuration;
    const now = Date.now();
    // Create sandbox record
    const sandbox = {
        id: sandboxId,
        apiKeyId: apiKey.id,
        userId: apiKey.userId,
        name,
        state: 'creating',
        template: body.template || 'node',
        createdAt: now,
        lastActivityAt: now,
        expiresAt: now + (timeoutSeconds * 1000),
        resourceLimits: {
            memoryMB: body.resourceLimits?.memoryMB || 512,
            cpuShares: body.resourceLimits?.cpuShares || 512,
            diskMB: body.resourceLimits?.diskMB || 1024,
        },
        metadata: body.metadata,
    };
    // Store sandbox
    sandboxes.set(sandboxId, sandbox);
    // Track in API key
    (0, api_keys_js_1.addSandboxToKey)(apiKey.id, sandboxId);
    // Index by API key
    if (!sandboxesByApiKey.has(apiKey.id)) {
        sandboxesByApiKey.set(apiKey.id, new Set());
    }
    sandboxesByApiKey.get(apiKey.id).add(sandboxId);
    saveSandboxesStore();
    try {
        // Create container
        const { containerId, port } = await deps.createContainer({
            projectId: sandboxId,
            template: sandbox.template,
            env: body.env,
            resourceLimits: {
                memoryMB: sandbox.resourceLimits.memoryMB,
                cpuShares: sandbox.resourceLimits.cpuShares,
            },
        });
        sandbox.containerId = containerId;
        sandbox.port = port;
        sandbox.previewUrl = deps.getPreviewUrl(port);
        sandbox.terminalUrl = deps.getTerminalUrl(sandboxId);
        // Start container
        await deps.startContainer(containerId);
        // Write initial files if provided
        if (body.files && body.files.length > 0) {
            for (const file of body.files) {
                // Check file size
                if (Buffer.byteLength(file.content, 'utf8') > maxFileSize) {
                    throw new Error(`File ${file.path} exceeds maximum size of ${maxFileSize} bytes`);
                }
                await deps.writeFile(containerId, file.path, file.content);
            }
        }
        // Update state
        sandbox.state = 'running';
        saveSandboxesStore();
        logger.info({ sandboxId, apiKeyPrefix: apiKey.keyPrefix }, 'Created public API sandbox');
        (0, middleware_js_1.sendApiSuccess)(res, toSandboxResponse(sandbox), req.requestId, 201);
    }
    catch (error) {
        // Clean up on failure
        sandbox.state = 'error';
        saveSandboxesStore();
        logger.error({ err: error, sandboxId }, 'Failed to create public API sandbox');
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SANDBOX_CREATION_FAILED',
            message: `Failed to create sandbox: ${error.message}`,
        }, req.requestId);
    }
}));
// ==================== GET /v1/sandboxes - List Sandboxes ====================
router.get('/', ...middleware_js_1.standardMiddleware, (0, middleware_js_1.requireScope)('sandboxes:read', 'admin'), (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    const apiKey = req.apiKey;
    const { page = '1', pageSize = '20', state } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
    // Get sandboxes for this API key
    const apiKeySandboxIds = sandboxesByApiKey.get(apiKey.id) || new Set();
    let userSandboxes = Array.from(apiKeySandboxIds)
        .map(id => sandboxes.get(id))
        .filter((s) => s !== undefined);
    // Filter by state if specified
    if (state) {
        userSandboxes = userSandboxes.filter(s => s.state === state);
    }
    // Sort by creation date (newest first)
    userSandboxes.sort((a, b) => b.createdAt - a.createdAt);
    // Paginate
    const total = userSandboxes.length;
    const start = (pageNum - 1) * size;
    const paginatedSandboxes = userSandboxes.slice(start, start + size);
    const response = {
        sandboxes: paginatedSandboxes.map(toSandboxResponse),
        total,
        page: pageNum,
        pageSize: size,
        hasMore: start + size < total,
    };
    (0, middleware_js_1.sendApiSuccess)(res, response, req.requestId);
}));
// ==================== GET /v1/sandboxes/:id - Get Sandbox ====================
router.get('/:id', ...middleware_js_1.standardMiddleware, (0, middleware_js_1.requireScope)('sandboxes:read', 'admin'), (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    const { id } = req.params;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId);
    if (!sandbox) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SANDBOX_NOT_FOUND',
            message: 'Sandbox not found or access denied',
        }, req.requestId);
        return;
    }
    (0, middleware_js_1.sendApiSuccess)(res, toSandboxResponse(sandbox), req.requestId);
}));
// ==================== DELETE /v1/sandboxes/:id - Delete Sandbox ====================
router.delete('/:id', ...middleware_js_1.standardMiddleware, (0, middleware_js_1.requireScope)('sandboxes:write', 'admin'), (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    if (!deps) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Sandbox service not initialized',
        }, req.requestId);
        return;
    }
    const { id } = req.params;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId);
    if (!sandbox) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SANDBOX_NOT_FOUND',
            message: 'Sandbox not found or access denied',
        }, req.requestId);
        return;
    }
    try {
        // Stop and delete container if exists
        if (sandbox.containerId) {
            if (sandbox.state === 'running') {
                await deps.stopContainer(sandbox.containerId);
            }
            await deps.deleteContainer(sandbox.containerId);
        }
        // Remove from storage
        sandboxes.delete(id);
        (0, api_keys_js_1.removeSandboxFromKey)(req.apiKeyId, id);
        const apiKeySandboxes = sandboxesByApiKey.get(req.apiKeyId);
        if (apiKeySandboxes) {
            apiKeySandboxes.delete(id);
        }
        saveSandboxesStore(true);
        logger.info({ sandboxId: id }, 'Deleted public API sandbox');
        (0, middleware_js_1.sendApiSuccess)(res, { deleted: true, id }, req.requestId);
    }
    catch (error) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INTERNAL_ERROR',
            message: `Failed to delete sandbox: ${error.message}`,
        }, req.requestId);
    }
}));
// ==================== POST /v1/sandboxes/:id/execute - Execute Command ====================
router.post('/:id/execute', ...middleware_js_1.standardMiddleware, (0, middleware_js_1.requireScope)('execute:commands', 'admin'), (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    if (!deps) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Sandbox service not initialized',
        }, req.requestId);
        return;
    }
    const { id } = req.params;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId);
    if (!sandbox) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SANDBOX_NOT_FOUND',
            message: 'Sandbox not found or access denied',
        }, req.requestId);
        return;
    }
    if (sandbox.state !== 'running') {
        const start = await ensureSandboxRunning(sandbox);
        if (!start.ok) {
            (0, middleware_js_1.sendApiError)(res, {
                code: 'SANDBOX_NOT_RUNNING',
                message: `Sandbox is ${sandbox.state} and could not be started: ${start.error}`,
                details: { state: sandbox.state },
            }, req.requestId);
            return;
        }
    }
    if (!sandbox.containerId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INTERNAL_ERROR',
            message: 'Sandbox has no associated container',
        }, req.requestId);
        return;
    }
    const body = req.body;
    if (!body.command) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'MISSING_REQUIRED_FIELD',
            message: 'command is required',
        }, req.requestId);
        return;
    }
    // Enforce timeout limits
    const maxTimeout = (0, rate_limiter_js_1.getMaxCommandTimeout)(req.apiKey.tier) * 1000;
    const timeoutMs = body.timeoutMs
        ? Math.min(body.timeoutMs, maxTimeout)
        : maxTimeout;
    try {
        updateActivity(sandbox);
        const result = await deps.execInContainer(sandbox.containerId, body.command, {
            cwd: body.cwd,
            env: body.env,
            timeoutMs,
        });
        const response = {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            executionTimeMs: result.executionTimeMs,
            timedOut: result.timedOut,
            killed: result.killed,
        };
        (0, middleware_js_1.sendApiSuccess)(res, response, req.requestId);
    }
    catch (error) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'COMMAND_FAILED',
            message: `Command execution failed: ${error.message}`,
        }, req.requestId);
    }
}));
// ==================== POST /v1/sandboxes/:id/files - Write File ====================
router.post('/:id/files', ...middleware_js_1.standardMiddleware, (0, middleware_js_1.requireScope)('files:write', 'admin'), (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    if (!deps) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Sandbox service not initialized',
        }, req.requestId);
        return;
    }
    const { id } = req.params;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId);
    if (!sandbox) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SANDBOX_NOT_FOUND',
            message: 'Sandbox not found or access denied',
        }, req.requestId);
        return;
    }
    if (sandbox.state !== 'running') {
        const start = await ensureSandboxRunning(sandbox);
        if (!start.ok) {
            (0, middleware_js_1.sendApiError)(res, {
                code: 'SANDBOX_NOT_RUNNING',
                message: `Sandbox is ${sandbox.state} and could not be started: ${start.error}`,
            }, req.requestId);
            return;
        }
    }
    if (!sandbox.containerId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INTERNAL_ERROR',
            message: 'Sandbox has no associated container',
        }, req.requestId);
        return;
    }
    const body = req.body;
    if (!body.path || body.content === undefined) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'MISSING_REQUIRED_FIELD',
            message: 'path and content are required',
        }, req.requestId);
        return;
    }
    // Validate path
    if (body.path.includes('..') || body.path.startsWith('/')) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_FILE_PATH',
            message: 'Invalid file path. Use relative paths without ".."',
        }, req.requestId);
        return;
    }
    // Check file size
    const content = body.isBase64
        ? Buffer.from(body.content, 'base64').toString('utf8')
        : body.content;
    const maxSize = (0, rate_limiter_js_1.getMaxFileSize)(req.apiKey.tier);
    if (Buffer.byteLength(content, 'utf8') > maxSize) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'FILE_TOO_LARGE',
            message: `File exceeds maximum size of ${maxSize} bytes`,
        }, req.requestId);
        return;
    }
    try {
        updateActivity(sandbox);
        await deps.writeFile(sandbox.containerId, body.path, content);
        (0, middleware_js_1.sendApiSuccess)(res, {
            success: true,
            path: body.path,
        }, req.requestId);
    }
    catch (error) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'FILE_OPERATION_FAILED',
            message: `Failed to write file: ${error.message}`,
        }, req.requestId);
    }
}));
// ==================== GET /v1/sandboxes/:id/files - Read File ====================
router.get('/:id/files', ...middleware_js_1.standardMiddleware, (0, middleware_js_1.requireScope)('files:read', 'admin'), (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    if (!deps) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Sandbox service not initialized',
        }, req.requestId);
        return;
    }
    const { id } = req.params;
    const { path } = req.query;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId);
    if (!sandbox) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SANDBOX_NOT_FOUND',
            message: 'Sandbox not found or access denied',
        }, req.requestId);
        return;
    }
    if (sandbox.state !== 'running') {
        const start = await ensureSandboxRunning(sandbox);
        if (!start.ok) {
            (0, middleware_js_1.sendApiError)(res, {
                code: 'SANDBOX_NOT_RUNNING',
                message: `Sandbox is ${sandbox.state} and could not be started: ${start.error}`,
            }, req.requestId);
            return;
        }
    }
    if (!sandbox.containerId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INTERNAL_ERROR',
            message: 'Sandbox has no associated container',
        }, req.requestId);
        return;
    }
    if (!path) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'MISSING_REQUIRED_FIELD',
            message: 'path query parameter is required',
        }, req.requestId);
        return;
    }
    const filePath = path;
    // Validate path
    if (!isValidSandboxPath(filePath)) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_FILE_PATH',
            message: 'Invalid file path',
        }, req.requestId);
        return;
    }
    try {
        updateActivity(sandbox);
        const result = await deps.readFile(sandbox.containerId, filePath);
        // Determine if binary and potentially encode
        const isBinary = !result.mimeType.startsWith('text/') &&
            !['application/json', 'application/javascript', 'application/xml'].includes(result.mimeType);
        const response = {
            path: filePath,
            content: isBinary ? Buffer.from(result.content).toString('base64') : result.content,
            isBase64: isBinary,
            size: result.size,
            mimeType: result.mimeType,
        };
        (0, middleware_js_1.sendApiSuccess)(res, response, req.requestId);
    }
    catch (error) {
        const message = error.message;
        if (message.includes('not found') || message.includes('ENOENT')) {
            (0, middleware_js_1.sendApiError)(res, {
                code: 'FILE_NOT_FOUND',
                message: `File not found: ${filePath}`,
            }, req.requestId);
        }
        else {
            (0, middleware_js_1.sendApiError)(res, {
                code: 'FILE_OPERATION_FAILED',
                message: `Failed to read file: ${message}`,
            }, req.requestId);
        }
    }
}));
// ==================== GET /v1/sandboxes/:id/files/list - List Files ====================
router.get('/:id/files/list', ...middleware_js_1.standardMiddleware, (0, middleware_js_1.requireScope)('files:read', 'admin'), (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    if (!deps) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Sandbox service not initialized',
        }, req.requestId);
        return;
    }
    const { id } = req.params;
    const { path = '.' } = req.query;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId);
    if (!sandbox) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SANDBOX_NOT_FOUND',
            message: 'Sandbox not found or access denied',
        }, req.requestId);
        return;
    }
    if (sandbox.state !== 'running') {
        const start = await ensureSandboxRunning(sandbox);
        if (!start.ok) {
            (0, middleware_js_1.sendApiError)(res, {
                code: 'SANDBOX_NOT_RUNNING',
                message: `Sandbox is ${sandbox.state} and could not be started: ${start.error}`,
            }, req.requestId);
            return;
        }
    }
    if (!sandbox.containerId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INTERNAL_ERROR',
            message: 'Sandbox has no associated container',
        }, req.requestId);
        return;
    }
    const dirPath = path;
    // Validate path
    if (!isValidSandboxPath(dirPath)) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_FILE_PATH',
            message: 'Invalid directory path',
        }, req.requestId);
        return;
    }
    try {
        updateActivity(sandbox);
        const files = await deps.listFiles(sandbox.containerId, dirPath);
        (0, middleware_js_1.sendApiSuccess)(res, { path: dirPath, files }, req.requestId);
    }
    catch (error) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'FILE_OPERATION_FAILED',
            message: 'Failed to list files',
        }, req.requestId);
    }
}));
// ==================== DELETE /v1/sandboxes/:id/files - Delete File ====================
router.delete('/:id/files', ...middleware_js_1.standardMiddleware, (0, middleware_js_1.requireScope)('files:write', 'admin'), (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    if (!deps) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Sandbox service not initialized',
        }, req.requestId);
        return;
    }
    const { id } = req.params;
    const { path } = req.query;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId);
    if (!sandbox) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SANDBOX_NOT_FOUND',
            message: 'Sandbox not found or access denied',
        }, req.requestId);
        return;
    }
    if (sandbox.state !== 'running') {
        const start = await ensureSandboxRunning(sandbox);
        if (!start.ok) {
            (0, middleware_js_1.sendApiError)(res, {
                code: 'SANDBOX_NOT_RUNNING',
                message: `Sandbox is ${sandbox.state} and could not be started: ${start.error}`,
            }, req.requestId);
            return;
        }
    }
    if (!sandbox.containerId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INTERNAL_ERROR',
            message: 'Sandbox has no associated container',
        }, req.requestId);
        return;
    }
    if (!path) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'MISSING_REQUIRED_FIELD',
            message: 'path query parameter is required',
        }, req.requestId);
        return;
    }
    const filePath = path;
    // Validate path
    if (!isValidSandboxPath(filePath)) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_FILE_PATH',
            message: 'Invalid file path',
        }, req.requestId);
        return;
    }
    try {
        updateActivity(sandbox);
        await deps.deleteFile(sandbox.containerId, filePath);
        (0, middleware_js_1.sendApiSuccess)(res, { deleted: true, path: filePath }, req.requestId);
    }
    catch (error) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'FILE_OPERATION_FAILED',
            message: 'Failed to delete file',
        }, req.requestId);
    }
}));
// ==================== POST /v1/sandboxes/:id/files/batch - Batch Operations ====================
router.post('/:id/files/batch', ...middleware_js_1.standardMiddleware, (0, middleware_js_1.requireScope)('files:write', 'admin'), (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    if (!deps) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Sandbox service not initialized',
        }, req.requestId);
        return;
    }
    const { id } = req.params;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId);
    if (!sandbox) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'SANDBOX_NOT_FOUND',
            message: 'Sandbox not found or access denied',
        }, req.requestId);
        return;
    }
    if (sandbox.state !== 'running') {
        const start = await ensureSandboxRunning(sandbox);
        if (!start.ok) {
            (0, middleware_js_1.sendApiError)(res, {
                code: 'SANDBOX_NOT_RUNNING',
                message: `Sandbox is ${sandbox.state} and could not be started: ${start.error}`,
            }, req.requestId);
            return;
        }
    }
    if (!sandbox.containerId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INTERNAL_ERROR',
            message: 'Sandbox has no associated container',
        }, req.requestId);
        return;
    }
    const body = req.body;
    if (!body.operations || !Array.isArray(body.operations)) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'MISSING_REQUIRED_FIELD',
            message: 'operations array is required',
        }, req.requestId);
        return;
    }
    const maxSize = (0, rate_limiter_js_1.getMaxFileSize)(req.apiKey.tier);
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    for (const op of body.operations) {
        try {
            // Validate path
            if (!op.path || op.path.includes('..')) {
                results.push({
                    success: false,
                    path: op.path || 'unknown',
                    error: 'Invalid file path',
                });
                failureCount++;
                continue;
            }
            switch (op.type) {
                case 'write':
                    if (op.content === undefined) {
                        throw new Error('content is required for write operation');
                    }
                    const content = op.isBase64
                        ? Buffer.from(op.content, 'base64').toString('utf8')
                        : op.content;
                    if (Buffer.byteLength(content, 'utf8') > maxSize) {
                        throw new Error('File too large');
                    }
                    await deps.writeFile(sandbox.containerId, op.path, content);
                    break;
                case 'delete':
                    await deps.deleteFile(sandbox.containerId, op.path);
                    break;
                default:
                    throw new Error(`Unknown operation type: ${op.type}`);
            }
            results.push({ success: true, path: op.path });
            successCount++;
        }
        catch (error) {
            results.push({
                success: false,
                path: op.path,
                error: error.message,
            });
            failureCount++;
        }
    }
    updateActivity(sandbox);
    const response = {
        results,
        successCount,
        failureCount,
    };
    (0, middleware_js_1.sendApiSuccess)(res, response, req.requestId);
}));
exports._testing = {
    sandboxes,
    sandboxesByApiKey,
    clearAll: () => {
        sandboxes.clear();
        sandboxesByApiKey.clear();
        saveSandboxesStore(true);
    },
};
