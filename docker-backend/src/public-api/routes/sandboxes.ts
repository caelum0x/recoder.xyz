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

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import type {
  SandboxCreateRequest,
  SandboxResponse,
  SandboxListResponse,
  SandboxState,
  FileWriteRequest,
  FileReadResponse,
  FileInfo,
  CommandExecuteRequest,
  CommandExecuteResponse,
  BatchFileOperationRequest,
  BatchFileOperationResponse,
} from '../types.js';
import {
  type AuthenticatedApiRequest,
  sendApiSuccess,
  sendApiError,
  asyncApiHandler,
  requireScope,
  requireFields,
  standardMiddleware,
  sandboxCreationMiddleware,
} from '../middleware.js';
import {
  addSandboxToKey,
  removeSandboxFromKey,
  getActiveSandboxIds,
} from '../api-keys.js';
import {
  getMaxFileSize,
  getMaxCommandTimeout,
  getMaxSandboxDuration,
} from '../rate-limiter.js';
import { createLogger } from '../../logger.js';
import { loadStore, saveStore, debouncedSave } from '../../persistence.js';

// ==================== Types ====================

/**
 * Sandbox storage (in-memory for now)
 * In production, use database
 */
interface SandboxRecord {
  id: string;
  apiKeyId: string;
  userId: string;
  name: string;
  state: SandboxState;
  template: string;
  containerId?: string;
  port?: number;
  previewUrl?: string;
  terminalUrl?: string;
  createdAt: number;
  lastActivityAt: number;
  expiresAt?: number;
  resourceLimits: {
    memoryMB: number;
    cpuShares: number;
    diskMB: number;
  };
  metadata?: Record<string, unknown>;
}

// ==================== Helpers ====================

/** Validate a file/directory path for sandbox operations */
function isValidSandboxPath(p: string): boolean {
  if (!p || typeof p !== 'string') return false;
  // Block null bytes
  if (p.includes('\0')) return false;
  // Block path traversal patterns (including encoded)
  if (p.includes('..')) return false;
  // Block absolute paths outside workspace
  if (p.startsWith('/') && !p.startsWith('/workspace')) return false;
  // Resolve and verify the path stays within /workspace
  const path = require('path');
  const base = '/workspace';
  const resolved = p.startsWith('/') ? path.resolve(p) : path.resolve(base, p);
  if (!resolved.startsWith(base + '/') && resolved !== base) return false;
  return true;
}

// ==================== Storage ====================

interface SandboxesStoreData {
  sandboxes: [string, SandboxRecord][];
  sandboxesByApiKey: [string, string[]][];
}

function loadSandboxesStore(): SandboxesStoreData {
  return loadStore<SandboxesStoreData>('sandboxes', {
    sandboxes: [],
    sandboxesByApiKey: [],
  });
}

function buildSandboxesStoreData(): SandboxesStoreData {
  return {
    sandboxes: Array.from(sandboxes.entries()),
    sandboxesByApiKey: Array.from(sandboxesByApiKey.entries()).map(
      ([keyId, sandboxSet]) => [keyId, Array.from(sandboxSet)]
    ),
  };
}

function saveSandboxesStore(immediate?: boolean): void {
  const data = buildSandboxesStoreData();
  if (immediate) {
    saveStore('sandboxes', data);
  } else {
    debouncedSave('sandboxes', data);
  }
}

const _stored = loadSandboxesStore();
const sandboxes = new Map<string, SandboxRecord>(_stored.sandboxes);
const sandboxesByApiKey = new Map<string, Set<string>>(
  _stored.sandboxesByApiKey.map(([keyId, sandboxIds]) => [keyId, new Set(sandboxIds)])
);

// ==================== Dependencies ====================

/**
 * Interface for container operations
 * These should be injected from the main server
 */
export interface SandboxDependencies {
  /** Create a container for the sandbox */
  createContainer: (options: {
    projectId: string;
    template: string;
    env?: Record<string, string>;
    resourceLimits?: {
      memoryMB?: number;
      cpuShares?: number;
    };
  }) => Promise<{ containerId: string; port: number }>;

  /** Start a container */
  startContainer: (containerId: string) => Promise<void>;

  /** Stop a container */
  stopContainer: (containerId: string) => Promise<void>;

  /** Delete a container */
  deleteContainer: (containerId: string) => Promise<void>;

  /** Execute command in container */
  execInContainer: (containerId: string, command: string, options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
  }) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    executionTimeMs: number;
    timedOut: boolean;
    killed: boolean;
  }>;

  /** Write file in container */
  writeFile: (containerId: string, path: string, content: string) => Promise<void>;

  /** Read file from container */
  readFile: (containerId: string, path: string) => Promise<{
    content: string;
    size: number;
    mimeType: string;
  }>;

  /** List files in container */
  listFiles: (containerId: string, path: string) => Promise<FileInfo[]>;

  /** Delete file in container */
  deleteFile: (containerId: string, path: string) => Promise<void>;

  /** Get preview URL */
  getPreviewUrl: (port: number) => string;

  /** Get terminal WebSocket URL */
  getTerminalUrl: (sandboxId: string) => string;
}

let deps: SandboxDependencies | null = null;
const logger = createLogger('public-api:sandboxes');

/**
 * Initialize sandbox routes with dependencies
 */
export function initSandboxRoutes(dependencies: SandboxDependencies): void {
  deps = dependencies;
  logger.info('Sandbox routes initialized with dependencies');
}

// ==================== Helpers ====================

/**
 * Convert sandbox record to API response
 */
function toSandboxResponse(record: SandboxRecord): SandboxResponse {
  return {
    id: record.id,
    name: record.name,
    state: record.state,
    template: record.template as any,
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
function getSandboxForApiKey(
  sandboxId: string,
  apiKeyId: string
): SandboxRecord | null {
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
function updateActivity(sandbox: SandboxRecord): void {
  sandbox.lastActivityAt = Date.now();
  saveSandboxesStore();
}

// ==================== Auto-cleanup ====================

/**
 * Clean up expired sandboxes
 */
async function cleanupExpiredSandboxes(): Promise<void> {
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
      } catch (error) {
        logger.error({ err: error, sandboxId: id }, 'Failed to stop expired sandbox');
      }
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredSandboxes, 60000);

// ==================== Router ====================

const router = Router();

// ==================== POST /v1/sandboxes - Create Sandbox ====================

router.post(
  '/',
  ...sandboxCreationMiddleware,
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    if (!deps) {
      sendApiError(res, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Sandbox service not initialized',
      }, req.requestId);
      return;
    }

    const apiKey = req.apiKey!;
    const body = req.body as SandboxCreateRequest;

    // Generate IDs
    const sandboxId = uuid();
    const name = body.name || `sandbox-${sandboxId.slice(0, 8)}`;

    // Get tier limits
    const maxDuration = getMaxSandboxDuration(apiKey.tier);
    const maxFileSize = getMaxFileSize(apiKey.tier);

    // Calculate expiration
    const timeoutSeconds = body.timeoutSeconds
      ? Math.min(body.timeoutSeconds, maxDuration)
      : maxDuration;

    const now = Date.now();

    // Create sandbox record
    const sandbox: SandboxRecord = {
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
    addSandboxToKey(apiKey.id, sandboxId);

    // Index by API key
    if (!sandboxesByApiKey.has(apiKey.id)) {
      sandboxesByApiKey.set(apiKey.id, new Set());
    }
    sandboxesByApiKey.get(apiKey.id)!.add(sandboxId);
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

      sendApiSuccess(res, toSandboxResponse(sandbox), req.requestId!, 201);
    } catch (error) {
      // Clean up on failure
      sandbox.state = 'error';
      saveSandboxesStore();

      logger.error({ err: error, sandboxId }, 'Failed to create public API sandbox');

      sendApiError(res, {
        code: 'SANDBOX_CREATION_FAILED',
        message: `Failed to create sandbox: ${(error as Error).message}`,
      }, req.requestId);
    }
  })
);

// ==================== GET /v1/sandboxes - List Sandboxes ====================

router.get(
  '/',
  ...standardMiddleware,
  requireScope('sandboxes:read', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const apiKey = req.apiKey!;
    const { page = '1', pageSize = '20', state } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize as string, 10) || 20));

    // Get sandboxes for this API key
    const apiKeySandboxIds = sandboxesByApiKey.get(apiKey.id) || new Set();
    let userSandboxes = Array.from(apiKeySandboxIds)
      .map(id => sandboxes.get(id))
      .filter((s): s is SandboxRecord => s !== undefined);

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

    const response: SandboxListResponse = {
      sandboxes: paginatedSandboxes.map(toSandboxResponse),
      total,
      page: pageNum,
      pageSize: size,
      hasMore: start + size < total,
    };

    sendApiSuccess(res, response, req.requestId!);
  })
);

// ==================== GET /v1/sandboxes/:id - Get Sandbox ====================

router.get(
  '/:id',
  ...standardMiddleware,
  requireScope('sandboxes:read', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const { id } = req.params;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId!);

    if (!sandbox) {
      sendApiError(res, {
        code: 'SANDBOX_NOT_FOUND',
        message: 'Sandbox not found or access denied',
      }, req.requestId);
      return;
    }

    sendApiSuccess(res, toSandboxResponse(sandbox), req.requestId!);
  })
);

// ==================== DELETE /v1/sandboxes/:id - Delete Sandbox ====================

router.delete(
  '/:id',
  ...standardMiddleware,
  requireScope('sandboxes:write', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    if (!deps) {
      sendApiError(res, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Sandbox service not initialized',
      }, req.requestId);
      return;
    }

    const { id } = req.params;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId!);

    if (!sandbox) {
      sendApiError(res, {
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
      removeSandboxFromKey(req.apiKeyId!, id);

      const apiKeySandboxes = sandboxesByApiKey.get(req.apiKeyId!);
      if (apiKeySandboxes) {
        apiKeySandboxes.delete(id);
      }
      saveSandboxesStore(true);

      logger.info({ sandboxId: id }, 'Deleted public API sandbox');

      sendApiSuccess(res, { deleted: true, id }, req.requestId!);
    } catch (error) {
      sendApiError(res, {
        code: 'INTERNAL_ERROR',
        message: `Failed to delete sandbox: ${(error as Error).message}`,
      }, req.requestId);
    }
  })
);

// ==================== POST /v1/sandboxes/:id/execute - Execute Command ====================

router.post(
  '/:id/execute',
  ...standardMiddleware,
  requireScope('execute:commands', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    if (!deps) {
      sendApiError(res, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Sandbox service not initialized',
      }, req.requestId);
      return;
    }

    const { id } = req.params;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId!);

    if (!sandbox) {
      sendApiError(res, {
        code: 'SANDBOX_NOT_FOUND',
        message: 'Sandbox not found or access denied',
      }, req.requestId);
      return;
    }

    if (sandbox.state !== 'running') {
      sendApiError(res, {
        code: 'SANDBOX_NOT_RUNNING',
        message: 'Sandbox is not running',
        details: { state: sandbox.state },
      }, req.requestId);
      return;
    }

    if (!sandbox.containerId) {
      sendApiError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Sandbox has no associated container',
      }, req.requestId);
      return;
    }

    const body = req.body as CommandExecuteRequest;

    if (!body.command) {
      sendApiError(res, {
        code: 'MISSING_REQUIRED_FIELD',
        message: 'command is required',
      }, req.requestId);
      return;
    }

    // Enforce timeout limits
    const maxTimeout = getMaxCommandTimeout(req.apiKey!.tier) * 1000;
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

      const response: CommandExecuteResponse = {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        executionTimeMs: result.executionTimeMs,
        timedOut: result.timedOut,
        killed: result.killed,
      };

      sendApiSuccess(res, response, req.requestId!);
    } catch (error) {
      sendApiError(res, {
        code: 'COMMAND_FAILED',
        message: `Command execution failed: ${(error as Error).message}`,
      }, req.requestId);
    }
  })
);

// ==================== POST /v1/sandboxes/:id/files - Write File ====================

router.post(
  '/:id/files',
  ...standardMiddleware,
  requireScope('files:write', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    if (!deps) {
      sendApiError(res, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Sandbox service not initialized',
      }, req.requestId);
      return;
    }

    const { id } = req.params;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId!);

    if (!sandbox) {
      sendApiError(res, {
        code: 'SANDBOX_NOT_FOUND',
        message: 'Sandbox not found or access denied',
      }, req.requestId);
      return;
    }

    if (sandbox.state !== 'running') {
      sendApiError(res, {
        code: 'SANDBOX_NOT_RUNNING',
        message: 'Sandbox is not running',
      }, req.requestId);
      return;
    }

    if (!sandbox.containerId) {
      sendApiError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Sandbox has no associated container',
      }, req.requestId);
      return;
    }

    const body = req.body as FileWriteRequest;

    if (!body.path || body.content === undefined) {
      sendApiError(res, {
        code: 'MISSING_REQUIRED_FIELD',
        message: 'path and content are required',
      }, req.requestId);
      return;
    }

    // Validate path
    if (body.path.includes('..') || body.path.startsWith('/')) {
      sendApiError(res, {
        code: 'INVALID_FILE_PATH',
        message: 'Invalid file path. Use relative paths without ".."',
      }, req.requestId);
      return;
    }

    // Check file size
    const content = body.isBase64
      ? Buffer.from(body.content, 'base64').toString('utf8')
      : body.content;

    const maxSize = getMaxFileSize(req.apiKey!.tier);
    if (Buffer.byteLength(content, 'utf8') > maxSize) {
      sendApiError(res, {
        code: 'FILE_TOO_LARGE',
        message: `File exceeds maximum size of ${maxSize} bytes`,
      }, req.requestId);
      return;
    }

    try {
      updateActivity(sandbox);
      await deps.writeFile(sandbox.containerId, body.path, content);

      sendApiSuccess(res, {
        success: true,
        path: body.path,
      }, req.requestId!);
    } catch (error) {
      sendApiError(res, {
        code: 'FILE_OPERATION_FAILED',
        message: `Failed to write file: ${(error as Error).message}`,
      }, req.requestId);
    }
  })
);

// ==================== GET /v1/sandboxes/:id/files - Read File ====================

router.get(
  '/:id/files',
  ...standardMiddleware,
  requireScope('files:read', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    if (!deps) {
      sendApiError(res, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Sandbox service not initialized',
      }, req.requestId);
      return;
    }

    const { id } = req.params;
    const { path } = req.query;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId!);

    if (!sandbox) {
      sendApiError(res, {
        code: 'SANDBOX_NOT_FOUND',
        message: 'Sandbox not found or access denied',
      }, req.requestId);
      return;
    }

    if (sandbox.state !== 'running') {
      sendApiError(res, {
        code: 'SANDBOX_NOT_RUNNING',
        message: 'Sandbox is not running',
      }, req.requestId);
      return;
    }

    if (!sandbox.containerId) {
      sendApiError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Sandbox has no associated container',
      }, req.requestId);
      return;
    }

    if (!path) {
      sendApiError(res, {
        code: 'MISSING_REQUIRED_FIELD',
        message: 'path query parameter is required',
      }, req.requestId);
      return;
    }

    const filePath = path as string;

    // Validate path
    if (!isValidSandboxPath(filePath)) {
      sendApiError(res, {
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

      const response: FileReadResponse = {
        path: filePath,
        content: isBinary ? Buffer.from(result.content).toString('base64') : result.content,
        isBase64: isBinary,
        size: result.size,
        mimeType: result.mimeType,
      };

      sendApiSuccess(res, response, req.requestId!);
    } catch (error) {
      const message = (error as Error).message;

      if (message.includes('not found') || message.includes('ENOENT')) {
        sendApiError(res, {
          code: 'FILE_NOT_FOUND',
          message: `File not found: ${filePath}`,
        }, req.requestId);
      } else {
        sendApiError(res, {
          code: 'FILE_OPERATION_FAILED',
          message: `Failed to read file: ${message}`,
        }, req.requestId);
      }
    }
  })
);

// ==================== GET /v1/sandboxes/:id/files/list - List Files ====================

router.get(
  '/:id/files/list',
  ...standardMiddleware,
  requireScope('files:read', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    if (!deps) {
      sendApiError(res, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Sandbox service not initialized',
      }, req.requestId);
      return;
    }

    const { id } = req.params;
    const { path = '.' } = req.query;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId!);

    if (!sandbox) {
      sendApiError(res, {
        code: 'SANDBOX_NOT_FOUND',
        message: 'Sandbox not found or access denied',
      }, req.requestId);
      return;
    }

    if (sandbox.state !== 'running') {
      sendApiError(res, {
        code: 'SANDBOX_NOT_RUNNING',
        message: 'Sandbox is not running',
      }, req.requestId);
      return;
    }

    if (!sandbox.containerId) {
      sendApiError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Sandbox has no associated container',
      }, req.requestId);
      return;
    }

    const dirPath = path as string;

    // Validate path
    if (!isValidSandboxPath(dirPath)) {
      sendApiError(res, {
        code: 'INVALID_FILE_PATH',
        message: 'Invalid directory path',
      }, req.requestId);
      return;
    }

    try {
      updateActivity(sandbox);
      const files = await deps.listFiles(sandbox.containerId, dirPath);

      sendApiSuccess(res, { path: dirPath, files }, req.requestId!);
    } catch (error) {
      sendApiError(res, {
        code: 'FILE_OPERATION_FAILED',
        message: 'Failed to list files',
      }, req.requestId);
    }
  })
);

// ==================== DELETE /v1/sandboxes/:id/files - Delete File ====================

router.delete(
  '/:id/files',
  ...standardMiddleware,
  requireScope('files:write', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    if (!deps) {
      sendApiError(res, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Sandbox service not initialized',
      }, req.requestId);
      return;
    }

    const { id } = req.params;
    const { path } = req.query;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId!);

    if (!sandbox) {
      sendApiError(res, {
        code: 'SANDBOX_NOT_FOUND',
        message: 'Sandbox not found or access denied',
      }, req.requestId);
      return;
    }

    if (sandbox.state !== 'running') {
      sendApiError(res, {
        code: 'SANDBOX_NOT_RUNNING',
        message: 'Sandbox is not running',
      }, req.requestId);
      return;
    }

    if (!sandbox.containerId) {
      sendApiError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Sandbox has no associated container',
      }, req.requestId);
      return;
    }

    if (!path) {
      sendApiError(res, {
        code: 'MISSING_REQUIRED_FIELD',
        message: 'path query parameter is required',
      }, req.requestId);
      return;
    }

    const filePath = path as string;

    // Validate path
    if (!isValidSandboxPath(filePath)) {
      sendApiError(res, {
        code: 'INVALID_FILE_PATH',
        message: 'Invalid file path',
      }, req.requestId);
      return;
    }

    try {
      updateActivity(sandbox);
      await deps.deleteFile(sandbox.containerId, filePath);

      sendApiSuccess(res, { deleted: true, path: filePath }, req.requestId!);
    } catch (error) {
      sendApiError(res, {
        code: 'FILE_OPERATION_FAILED',
        message: 'Failed to delete file',
      }, req.requestId);
    }
  })
);

// ==================== POST /v1/sandboxes/:id/files/batch - Batch Operations ====================

router.post(
  '/:id/files/batch',
  ...standardMiddleware,
  requireScope('files:write', 'admin'),
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    if (!deps) {
      sendApiError(res, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Sandbox service not initialized',
      }, req.requestId);
      return;
    }

    const { id } = req.params;
    const sandbox = getSandboxForApiKey(id, req.apiKeyId!);

    if (!sandbox) {
      sendApiError(res, {
        code: 'SANDBOX_NOT_FOUND',
        message: 'Sandbox not found or access denied',
      }, req.requestId);
      return;
    }

    if (sandbox.state !== 'running' || !sandbox.containerId) {
      sendApiError(res, {
        code: 'SANDBOX_NOT_RUNNING',
        message: 'Sandbox is not running',
      }, req.requestId);
      return;
    }

    const body = req.body as BatchFileOperationRequest;

    if (!body.operations || !Array.isArray(body.operations)) {
      sendApiError(res, {
        code: 'MISSING_REQUIRED_FIELD',
        message: 'operations array is required',
      }, req.requestId);
      return;
    }

    const maxSize = getMaxFileSize(req.apiKey!.tier);
    const results: BatchFileOperationResponse['results'] = [];
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
            await deps!.writeFile(sandbox.containerId!, op.path, content);
            break;

          case 'delete':
            await deps!.deleteFile(sandbox.containerId!, op.path);
            break;

          default:
            throw new Error(`Unknown operation type: ${op.type}`);
        }

        results.push({ success: true, path: op.path });
        successCount++;
      } catch (error) {
        results.push({
          success: false,
          path: op.path,
          error: (error as Error).message,
        });
        failureCount++;
      }
    }

    updateActivity(sandbox);

    const response: BatchFileOperationResponse = {
      results,
      successCount,
      failureCount,
    };

    sendApiSuccess(res, response, req.requestId!);
  })
);

// ==================== Exports ====================

export { router as sandboxRouter };

export const _testing = {
  sandboxes,
  sandboxesByApiKey,
  clearAll: () => {
    sandboxes.clear();
    sandboxesByApiKey.clear();
    saveSandboxesStore(true);
  },
};
