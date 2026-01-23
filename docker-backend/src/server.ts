import express from 'express';
import expressWs from 'express-ws';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { v4 as uuid } from 'uuid';
import Docker from 'dockerode';
import { Duplex } from 'stream';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import http from 'http';
import { spawn, ChildProcess } from 'child_process';
import { mountFiles } from './fileMount.js';
import * as pty from 'node-pty';
import { WebSocketRPC } from './websocket-rpc.js';
import { devServerManager } from './dev-server.js';
import { ContainerLifecycleManager } from './container-lifecycle.js';
import { snapshotManager } from './snapshot-manager.js';
import { autoRestoreManager, parseAllErrors, hasBlockingErrors } from './auto-restore.js';
import { languageServerManager } from './language-server.js';
import { searchService } from './search.js';
import { fileWatcher } from './file-watcher.js';
import { sessionStore } from './session-store.js';
import { containerPool } from './container-pool.js';
import { mcpManager, PREINSTALLED_SERVERS, NPX_SERVERS } from './mcp-manager.js';
import { packageManagerService } from './package-manager.js';
import { secretsManager } from './secrets-manager.js';
import { gitOperations } from './git-operations.js';
import { syncManager, diffFileSets, getDetailedDiff, getDiffStats, generateUnifiedDiff } from './cli-sync/index.js';
import { lspServerManager, getConfigForExtension, LSP_SERVER_CONFIGS } from './lsp/index.js';
import { createCollaborationServer, getCollaborationStats, saveAllDocuments } from './collaboration/index.js';
import { replManager, REPL_CONFIGS, type ReplLanguage } from './repl-manager.js';
import {
  // Organization
  OrganizationRole,
  Permission,
  createOrganization,
  getOrganization,
  updateOrganization,
  deleteOrganization,
  listUserOrganizations,
  transferOwnership,
  // Teams
  createTeam,
  getTeam,
  updateTeam,
  deleteTeam,
  listTeams,
  addTeamMember,
  removeTeamMember,
  // Members
  listMembers,
  getMember,
  updateMemberRole,
  removeMember,
  // Invitations
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  listInvitations,
  resendInvitation,
  // Audit
  queryAuditLogs,
  getAuditStats,
  exportAuditLogs,
  calculateChanges,
  AuditAction,
  AuditResourceType,
  logOrganizationAction,
  logMemberAction,
  logTeamAction,
  logInvitationAction,
  // Billing
  getSubscription,
  getUsageSnapshot,
  updateSeats,
  upgradeTier,
  downgradeTier,
  cancelSubscription,
  reactivateSubscription,
  getInvoices,
  getInvoice,
  getUsageHistory,
  UsageMetric,
  SubscriptionTier,
  BillingCycle,
  enforceMemberLimit,
  type OrganizationSettings,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
  type CreateTeamInput,
  type UpdateTeamInput,
  type CreateInvitationInput,
  type AuditLogQuery,
  type SeatChangeRequest,
} from './enterprise/index.js';
import {
  createMobileApiRouter,
  initializeMobileApi,
  getMobileApiStats,
  pushNotificationService,
  syncManager as mobileSyncManager,
  type MobileApiDependencies,
} from './mobile/index.js';
import {
  AppError,
  ErrorCode,
  createError,
  globalErrorHandler,
  asyncHandler,
  sendError,
  sendSuccess,
  requestIdMiddleware,
  requestTimingMiddleware,
  sendWsError,
  closeWsWithError,
  logError,
  logWarning,
} from './errors/index.js';

dotenv.config();

// ==================== SECURITY: Authentication & Authorization ====================

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

// Helper to parse cookies from request headers (no need for cookie-parser dependency)
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  });
  return cookies;
}

// Get session token from request (Authorization header or cookies)
function getSessionTokenFromRequest(req: express.Request): string | null {
  // First try Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '');
  }

  // Then try cookies - Better Auth uses prefix.session_token format
  const cookies = parseCookies(req.headers.cookie);

  // Try various cookie names that Better Auth might use
  // With cookiePrefix: "recoder", the cookie is named "recoder.session_token"
  return cookies['recoder.session_token']
    || cookies['recoder_session_token']
    || cookies['session_token']
    || null;
}

// WebSocket authentication helper
// For WebSockets, token is passed via query string (?token=xxx) or cookies
async function authenticateWebSocket(
  ws: WebSocket,
  req: express.Request
): Promise<{ userId: string; sessionId: string } | null> {
  // Try query string first (standard for WebSockets)
  let token = req.query.token as string;

  // Fall back to cookies
  if (!token) {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies['recoder.session_token']
      || cookies['recoder_session_token']
      || cookies['session_token']
      || '';
  }

  if (!token) {
    // In migration mode, allow anonymous access with warning
    if (!REQUIRE_AUTH) {
      console.warn(`[Auth] WARNING: Anonymous WebSocket connection to ${req.path}`);
      return { userId: 'anonymous', sessionId: 'anon' };
    }
    ws.close(1008, 'Authentication required');
    return null;
  }

  const session = await verifySessionToken(token);
  if (!session) {
    // In migration mode, allow with warning
    if (!REQUIRE_AUTH) {
      console.warn(`[Auth] WARNING: Invalid token for WebSocket ${req.path}, allowing in migration mode`);
      return { userId: 'anonymous', sessionId: 'anon' };
    }
    ws.close(1008, 'Invalid or expired session');
    return null;
  }

  return session;
}

// Verify Better Auth session token with the main app API
// The token is the value of the 'recoder.session_token' cookie from Better Auth
async function verifySessionToken(token: string): Promise<{ userId: string; sessionId: string } | null> {
  if (!token) {
    return null;
  }

  try {
    // Use the existing Better Auth verify-token endpoint
    const response = await fetch(`${APP_API_URL}/api/auth/verify-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Pass internal service key if configured (for rate limit bypass)
        ...(INTERNAL_SERVICE_KEY ? { 'X-Internal-Service-Key': INTERNAL_SERVICE_KEY } : {}),
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      console.log(`[Auth] Better Auth session verification failed: ${response.status}`);
      return null;
    }

    const data = await response.json() as { success?: boolean; user?: { id: string; email?: string } };
    if (data.success && data.user?.id) {
      return { userId: data.user.id, sessionId: token.substring(0, 8) }; // Use token prefix as session ID
    }
    return null;
  } catch (error: any) {
    console.error(`[Auth] Error verifying Better Auth session: ${error.message}`);
    return null;
  }
}

// Check if user owns the project
async function checkProjectOwnership(userId: string, projectId: string): Promise<boolean> {
  if (!userId || !projectId || !INTERNAL_SERVICE_KEY) {
    return false;
  }

  try {
    const response = await fetch(`${APP_API_URL}/api/project/verify-ownership`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Key': INTERNAL_SERVICE_KEY,
      },
      body: JSON.stringify({ userId, projectId }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json() as { isOwner: boolean };
    return data.isOwner === true;
  } catch (error: any) {
    console.error(`[Auth] Error checking ownership: ${error.message}`);
    return false;
  }
}

// Authentication middleware - verifies user token
// During migration: allows requests from allowed origins without token (with warning)
// In strict mode (REQUIRE_AUTH=true): always requires token
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';

function authenticateRequest(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  // Get token from Authorization header OR cookies (for cross-origin with httpOnly cookies)
  const token = getSessionTokenFromRequest(req);
  const origin = req.headers.origin || '';

  // If no token provided
  if (!token) {
    // In development or if origin is allowed, permit without auth (migration mode)
    const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin) || origin === '' || origin.includes('localhost');

    if (!REQUIRE_AUTH && isAllowedOrigin) {
      // Migration mode: allow but log warning
      console.warn(`[Auth] WARNING: Request without auth token from ${origin || 'same-origin'} - ${req.method} ${req.path}`);
      req.userId = 'anonymous'; // Set anonymous user for audit logging
      return next();
    }

    return res.status(401).json({ error: 'Authentication required. Pass Better Auth session token in Authorization header.' });
  }

  // Verify the token
  verifySessionToken(token).then(session => {
    if (!session) {
      // Token invalid but from allowed origin - allow in migration mode
      const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin) || origin === '' || origin.includes('localhost');
      if (!REQUIRE_AUTH && isAllowedOrigin) {
        console.warn(`[Auth] WARNING: Invalid token from ${origin || 'same-origin'}, allowing in migration mode`);
        req.userId = 'anonymous';
        return next();
      }
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    req.userId = session.userId;
    req.sessionId = session.sessionId;
    next();
  }).catch(err => {
    console.error(`[Auth] Authentication error: ${err.message}`);
    // Allow in migration mode
    if (!REQUIRE_AUTH) {
      console.warn(`[Auth] WARNING: Auth service error, allowing in migration mode`);
      req.userId = 'anonymous';
      return next();
    }
    return res.status(500).json({ error: 'Authentication service error' });
  });
}

// Authorization middleware - verifies project ownership
// During migration: allows anonymous users to access projects (with warning)
function verifyProjectOwnership(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const projectId = req.params.projectId || req.body?.projectId;

  if (!projectId) {
    return res.status(400).json({ error: 'Project ID required' });
  }

  // In migration mode, allow anonymous users
  if (req.userId === 'anonymous' && !REQUIRE_AUTH) {
    console.warn(`[Auth] WARNING: Anonymous access to project ${projectId} - ${req.method} ${req.path}`);
    return next();
  }

  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  checkProjectOwnership(req.userId, projectId).then(isOwner => {
    if (!isOwner) {
      // In migration mode, allow but log
      if (!REQUIRE_AUTH) {
        console.warn(`[Auth] WARNING: User ${req.userId} accessing project ${projectId} without ownership verification`);
        return next();
      }
      console.log(`[Auth] Access denied: User ${req.userId} is not owner of project ${projectId}`);
      return res.status(403).json({ error: 'Access denied: You do not own this project' });
    }
    next();
  }).catch(err => {
    console.error(`[Auth] Authorization error: ${err.message}`);
    return res.status(500).json({ error: 'Authorization service error' });
  });
}

// Audit logging for security events
function auditLog(event: {
  userId?: string;
  action: string;
  projectId?: string;
  details?: Record<string, unknown>;
  ip?: string;
}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    type: 'AUDIT',
    ...event
  }));
}

// Input sanitization to prevent command injection
function sanitizePath(path: string): string {
  if (!path || typeof path !== 'string') return '';
  // Remove shell metacharacters and path traversal
  return path
    .replace(/\.\.\//g, '')  // No path traversal
    .replace(/[;&|`$(){}]/g, '')  // No shell metacharacters
    .replace(/[\r\n]/g, '')  // No newlines
    .replace(/^\/+/, '');  // No leading slashes (force relative to workspace)
}

function sanitizeCommand(cmd: string): string {
  if (!cmd || typeof cmd !== 'string') return '';
  // Only allow safe characters for commands
  // Note: This is restrictive - for shell commands, we should use execFile instead
  return cmd.replace(/[;&|`$\\]/g, '');
}

function sanitizeProjectId(projectId: string): string {
  if (!projectId || typeof projectId !== 'string') return '';
  // Project IDs should be alphanumeric with dashes/underscores
  return projectId.replace(/[^a-zA-Z0-9_-]/g, '');
}

// ==================== END SECURITY ====================

// ==================== PERFORMANCE: File Caching ====================
// LRU cache for frequently read files to reduce container exec calls

interface CacheEntry {
  content: string;
  timestamp: number;
  size: number;
}

class FileCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private maxAge: number;
  private currentSize = 0;

  // Performance metrics
  hits = 0;
  misses = 0;

  constructor(maxSizeBytes = 50 * 1024 * 1024, maxAgeMs = 30000) {  // 50MB cache, 30s TTL
    this.maxSize = maxSizeBytes;
    this.maxAge = maxAgeMs;

    // Periodic cleanup every 60 seconds
    setInterval(() => this.cleanup(), 60000);
  }

  private getKey(projectId: string, path: string): string {
    return `${projectId}:${path}`;
  }

  get(projectId: string, path: string): string | null {
    const key = this.getKey(projectId, path);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      this.currentSize -= entry.size;
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.content;
  }

  set(projectId: string, path: string, content: string): void {
    const key = this.getKey(projectId, path);
    const size = Buffer.byteLength(content, 'utf8');

    // Don't cache files larger than 1MB
    if (size > 1024 * 1024) return;

    // Remove old entry if exists
    const existing = this.cache.get(key);
    if (existing) {
      this.currentSize -= existing.size;
    }

    // Evict oldest entries if needed
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        const oldEntry = this.cache.get(oldestKey);
        if (oldEntry) {
          this.currentSize -= oldEntry.size;
        }
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      content,
      timestamp: Date.now(),
      size,
    });
    this.currentSize += size;
  }

  invalidate(projectId: string, path?: string): void {
    if (path) {
      const key = this.getKey(projectId, path);
      const entry = this.cache.get(key);
      if (entry) {
        this.currentSize -= entry.size;
        this.cache.delete(key);
      }
    } else {
      // Invalidate all files for project
      const prefix = `${projectId}:`;
      for (const [key, entry] of this.cache.entries()) {
        if (key.startsWith(prefix)) {
          this.currentSize -= entry.size;
          this.cache.delete(key);
        }
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.maxAge) {
        this.currentSize -= entry.size;
        this.cache.delete(key);
      }
    }
  }

  getStats(): { entries: number; sizeBytes: number; hitRate: number; hits: number; misses: number } {
    const total = this.hits + this.misses;
    return {
      entries: this.cache.size,
      sizeBytes: this.currentSize,
      hitRate: total > 0 ? Math.round((this.hits / total) * 100) : 0,
      hits: this.hits,
      misses: this.misses,
    };
  }
}

const fileCache = new FileCache();

// ==================== END FILE CACHING ====================

// Initialize Redis connection (non-blocking)
sessionStore.connect().catch(() => {
  console.log('[Server] Redis not available, using memory fallback for sessions');
});

// Initialize container pool (non-blocking) - pre-warms containers for faster project creation
const ENABLE_CONTAINER_POOL = process.env.ENABLE_CONTAINER_POOL !== 'false';

const docker = new Docker();

// App API URL for fetching user tokens
const APP_API_URL = process.env.APP_API_URL || 'https://recoder.xyz';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

// Fetch user's Claude Code OAuth token from app API
async function fetchClaudeCodeToken(userId: string): Promise<string | null> {
  if (!userId || !INTERNAL_SERVICE_KEY) {
    console.log(`[Claude Code] Missing userId or serviceKey - userId: ${!!userId}, key: ${!!INTERNAL_SERVICE_KEY}`);
    return null;
  }

  try {
    console.log(`[Claude Code] Fetching token for user ${userId} from ${APP_API_URL}`);
    const response = await fetch(`${APP_API_URL}/api/user/claude-code`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        serviceKey: INTERNAL_SERVICE_KEY,
      }),
    });

    if (!response.ok) {
      console.log(`[Claude Code] Failed to fetch token for user ${userId}: ${response.status}`);
      return null;
    }

    const data = await response.json() as { hasToken: boolean; token?: string };
    if (data.hasToken && data.token) {
      console.log(`[Claude Code] Token retrieved for user ${userId}`);
      return data.token;
    }

    console.log(`[Claude Code] No token found for user ${userId}`);
    return null;
  } catch (error: any) {
    console.error(`[Claude Code] Error fetching token: ${error.message}`);
    return null;
  }
}

// Fetch user's AI provider API keys (OpenAI, Gemini, etc.) from app API
interface AIProviderKeys {
  openai?: string;
  gemini?: string;
  anthropic?: string;
  [key: string]: string | undefined;
}

async function fetchAIProviderKeys(userId: string): Promise<AIProviderKeys> {
  if (!userId || !INTERNAL_SERVICE_KEY) {
    console.log(`[AI Provider Keys] Missing userId or serviceKey - userId: ${!!userId}, key: ${!!INTERNAL_SERVICE_KEY}`);
    return {};
  }

  try {
    console.log(`[AI Provider Keys] Fetching keys for user ${userId} from ${APP_API_URL}`);
    const response = await fetch(`${APP_API_URL}/api/user/ai-provider-keys`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        serviceKey: INTERNAL_SERVICE_KEY,
      }),
    });

    if (!response.ok) {
      console.log(`[AI Provider Keys] Failed to fetch keys for user ${userId}: ${response.status}`);
      return {};
    }

    const data = await response.json() as { keys: AIProviderKeys };
    const keyCount = Object.keys(data.keys || {}).length;
    console.log(`[AI Provider Keys] Retrieved ${keyCount} keys for user ${userId}`);
    return data.keys || {};
  } catch (error: any) {
    console.error(`[AI Provider Keys] Error fetching keys: ${error.message}`);
    return {};
  }
}

const { app } = expressWs(express());

// Trust proxy for rate limiting behind nginx
app.set('trust proxy', 1);

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many requests, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

const containerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // 10 container creates per minute
  message: { error: 'Container creation rate limited' },
});

// CORS - Strict origin allowlist (SECURITY FIX: no wildcard fallback)
const ALLOWED_ORIGINS = [
  'https://recoder.xyz',
  'https://www.recoder.xyz',
  'https://web.recoder.xyz',
  'https://docker.recoder.xyz', // Self-reference for same-origin API calls
  'http://localhost:3000',
  'http://localhost:5173'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or same-origin)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`[CORS] Blocked request from origin: ${origin}`);
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  // SECURITY FIX: Only set allowed origin, never wildcard
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use('/api/', apiLimiter);

// Add request ID and timing middleware for error tracking
app.use(requestIdMiddleware);
app.use(requestTimingMiddleware);

// Container registry: projectId -> containerId + port + ptyPort
// Added backgroundDev flag so we can auto-tail dev server logs into the PTY when users attach
const containers = new Map<string, { id: string; lastActive: number; port: number; ptyPort: number; backgroundDev?: boolean; userId?: string }>();

// Track containers being created to prevent race conditions
const creatingContainers = new Map<string, Promise<{ containerId: string; port: number; ptyPort: number }>>();

// Per-user container tracking for limits
const userContainers = new Map<string, Set<string>>(); // userId -> Set of projectIds
const MAX_CONTAINERS_PER_USER = Number(process.env.MAX_CONTAINERS_PER_USER) || 5;

/**
 * Get count of active containers for a user
 */
function getUserContainerCount(userId: string): number {
  const projectIds = userContainers.get(userId);
  if (!projectIds) return 0;

  // Only count containers that actually exist
  let count = 0;
  for (const projectId of projectIds) {
    if (containers.has(projectId)) {
      count++;
    } else {
      // Clean up stale reference
      projectIds.delete(projectId);
    }
  }
  return count;
}

/**
 * Register a container for a user
 */
function registerUserContainer(userId: string, projectId: string): void {
  if (!userContainers.has(userId)) {
    userContainers.set(userId, new Set());
  }
  userContainers.get(userId)!.add(projectId);
}

/**
 * Unregister a container for a user
 */
function unregisterUserContainer(userId: string, projectId: string): void {
  const projectIds = userContainers.get(userId);
  if (projectIds) {
    projectIds.delete(projectId);
    if (projectIds.size === 0) {
      userContainers.delete(userId);
    }
  }
}

const IMAGE_NAME = 'recoder-workspace:latest';
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 min
const MEMORY_LIMIT = 2 * 1024 * 1024 * 1024; // 2GB (1GB caused OOM with bun install + vite)
const CPU_QUOTA = 100000; // 100% of 1 CPU

// Track allocated ports to prevent race conditions
const allocatedPorts = new Set<number>();

// Port allocation - find free port by checking Docker + our tracking
async function allocatePort(): Promise<{ preview: number; pty: number }> {
  const dockerContainers = await docker.listContainers({ all: true });
  const usedPorts = new Set<number>(allocatedPorts);
  
  for (const c of dockerContainers) {
    for (const p of c.Ports || []) {
      if (p.PublicPort) {
        usedPorts.add(p.PublicPort);
        usedPorts.add(p.PublicPort + 1);
        usedPorts.add(p.PublicPort + 2);
        usedPorts.add(p.PublicPort + 3);
      }
    }
  }
  
  // Also add ports from our container registry
  for (const entry of containers.values()) {
    usedPorts.add(entry.port);
    usedPorts.add(entry.port + 1);
    usedPorts.add(entry.port + 2);
    usedPorts.add(entry.ptyPort);
  }
  
  // Find first free port in range 10000-20000
  for (let port = 10000; port < 20000; port += 4) {
    if (!usedPorts.has(port) && !usedPorts.has(port + 1) && !usedPorts.has(port + 2) && !usedPorts.has(port + 3)) {
      allocatedPorts.add(port);
      allocatedPorts.add(port + 1);
      allocatedPorts.add(port + 2);
      allocatedPorts.add(port + 3);
      return { preview: port, pty: port + 3 };
    }
  }
  throw new Error('No free ports available');
}

// Release ports when container is removed
function releasePorts(port: number, ptyPort: number) {
  allocatedPorts.delete(port);
  allocatedPorts.delete(port + 1);
  allocatedPorts.delete(port + 2);
  allocatedPorts.delete(ptyPort);
}

// Initialize container pool with shared port management
// NOTE: Actual initialization happens in startupSequence() below to avoid race with cleanup

/**
 * Execute a command inside a container and return stdout
 */
async function execInContainer(containerId: string, cmd: string): Promise<string> {
  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ['/bin/bash', '-c', cmd],
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({});
  const chunks: Buffer[] = [];

  const output = await new Promise<string>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => {
      const raw = Buffer.concat(chunks);
      let result = '';
      let i = 0;
      while (i < raw.length) {
        if (i + 8 <= raw.length) {
          const size = raw.readUInt32BE(i + 4);
          if (i + 8 + size <= raw.length) {
            result += raw.slice(i + 8, i + 8 + size).toString();
            i += 8 + size;
            continue;
          }
        }
        result += raw.slice(i).toString();
        break;
      }
      resolve(result.trim());
    });
    stream.on('error', reject);
  });

  // Check exit code after command completes
  const inspection = await exec.inspect();
  if (inspection.ExitCode !== 0 && inspection.ExitCode !== null) {
    throw new Error(`Command failed with exit code ${inspection.ExitCode}: ${output}`);
  }

  return output;
}

/**
 * Ensure a container is running (auto-restart if stopped)
 * Returns true if container is running, false if it needs to be recreated
 */
async function ensureContainerRunning(
  entry: { id: string; lastActive: number; port: number; ptyPort: number; backgroundDev?: boolean; userId?: string },
  projectId: string
): Promise<{ running: boolean; restarted: boolean; error?: string }> {
  try {
    const container = docker.getContainer(entry.id);
    const info = await container.inspect();

    if (info.State.Running) {
      // Container is already running
      return { running: true, restarted: false };
    }

    if (info.State.Status === 'exited' || info.State.Status === 'stopped') {
      // Container is stopped, try to restart it
      console.log(`🔄 [Container] Restarting stopped container for ${projectId}: ${entry.id.slice(0, 12)}`);
      await container.start();
      console.log(`✅ [Container] Successfully restarted container for ${projectId}`);
      return { running: true, restarted: true };
    }

    if (info.State.Status === 'paused') {
      // Container is paused, unpause it
      console.log(`▶️ [Container] Unpausing container for ${projectId}: ${entry.id.slice(0, 12)}`);
      await container.unpause();
      return { running: true, restarted: true };
    }

    // Container is in some other state (created, dead, etc.)
    console.log(`⚠️ [Container] Container ${entry.id.slice(0, 12)} is in state: ${info.State.Status}`);
    return { running: false, restarted: false, error: `Container in unexpected state: ${info.State.Status}` };
  } catch (error: any) {
    // Container doesn't exist or other error
    console.error(`❌ [Container] Error checking container ${entry.id.slice(0, 12)}:`, error.message);

    // If container not found, remove from registry so it can be recreated
    if (error.statusCode === 404) {
      console.log(`🗑️ [Container] Removing stale container entry for ${projectId}`);
      if (entry.userId) {
        unregisterUserContainer(entry.userId, projectId);
      }
      containers.delete(projectId);
      releasePorts(entry.port, entry.ptyPort);
    }

    return { running: false, restarted: false, error: error.message };
  }
}

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', containers: containers.size });
});

// Pool stats endpoint
app.get('/api/pool/stats', (_, res) => {
  if (!ENABLE_CONTAINER_POOL) {
    return res.json({ enabled: false });
  }
  const stats = containerPool.getStats();
  res.json({ enabled: true, ...stats });
});

// Pool detailed metrics endpoint (PERFORMANCE monitoring)
app.get('/api/pool/metrics', (_, res) => {
  if (!ENABLE_CONTAINER_POOL) {
    return res.json({ enabled: false });
  }
  const metrics = containerPool.getMetrics();
  res.json({ enabled: true, ...metrics });
});

// File cache stats endpoint (PERFORMANCE monitoring)
app.get('/api/cache/stats', (_, res) => {
  const stats = fileCache.getStats();
  res.json(stats);
});

// Create or get container for project (SECURED: requires auth + ownership)
app.post('/api/container', containerLimiter, authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const { projectId } = req.body;
    const userId = req.userId!; // Guaranteed by authenticateRequest middleware

    // Audit log
    auditLog({
      userId,
      action: 'CONTAINER_CREATE',
      projectId,
      ip: req.ip,
    });

    if (!projectId) return res.status(400).json({ error: 'projectId required' });

    // Check per-user container limit (skip if this project already has a container)
    const existingContainer = containers.get(projectId);
    if (!existingContainer) {
      const currentCount = getUserContainerCount(userId);
      if (currentCount >= MAX_CONTAINERS_PER_USER) {
        console.log(`[Limit] User ${userId} at container limit (${currentCount}/${MAX_CONTAINERS_PER_USER})`);
        return res.status(429).json({
          error: `Container limit reached. You have ${currentCount} active containers. Maximum allowed: ${MAX_CONTAINERS_PER_USER}. Please close unused projects.`,
          code: 'CONTAINER_LIMIT_REACHED',
          current: currentCount,
          max: MAX_CONTAINERS_PER_USER
        });
      }
    }

    // Fetch user's Claude Code token and AI provider keys
    const claudeCodeToken = await fetchClaudeCodeToken(userId);
    const aiProviderKeys = await fetchAIProviderKeys(userId);

    // Return existing container (after ensuring it's running)
    const existing = existingContainer;
    if (existing) {
      existing.lastActive = Date.now();

      // Check if container is actually running, restart if needed
      const containerStatus = await ensureContainerRunning(existing, projectId);

      if (containerStatus.running) {
        if (containerStatus.restarted) {
          console.log(`🔄 Restarted and reusing container: ${existing.id.slice(0, 12)} for ${projectId}`);
        } else {
          console.log(`♻️ Reusing existing container: ${existing.id.slice(0, 12)} for ${projectId}`);
        }
        return res.json({ containerId: existing.id, reused: true, port: existing.port, ptyPort: existing.ptyPort });
      }

      // Container couldn't be restarted, will be recreated below
      console.log(`⚠️ Container ${existing.id.slice(0, 12)} couldn't be restarted, creating new one`);
    }

    // 🔒 RACE CONDITION FIX: Check if container is already being created
    const inProgress = creatingContainers.get(projectId);
    if (inProgress) {
      console.log(`⏳ Waiting for in-progress container creation: ${projectId}`);
      try {
        const result = await inProgress;
        console.log(`✅ Joined completed container creation: ${result.containerId.slice(0, 12)} for ${projectId}`);
        return res.json({ containerId: result.containerId, reused: true, port: result.port, ptyPort: result.ptyPort });
      } catch (err: any) {
        // Creation failed, let this request retry
        console.error(`❌ In-progress container creation failed: ${err.message}`);
        return res.status(500).json({ error: err.message });
      }
    }

    // Create the container creation promise and store it
    const creationPromise = (async () => {
      let hostPort: number | undefined;
      let ptyPort: number | undefined;
      let containerId: string | undefined;
      let fromPool = false;

      try {
        // 🚀 TRY POOL FIRST - instant container acquisition
        if (ENABLE_CONTAINER_POOL) {
          const pooled = await containerPool.acquire();
          if (pooled) {
            console.log(`🚀 [Pool] Acquired pre-warmed container ${pooled.id.slice(0, 12)} for ${projectId}`);

            // 🔧 FIX: Ensure pooled container is actually running before using it
            const pooledEntry = { id: pooled.id, lastActive: Date.now(), port: pooled.port, ptyPort: pooled.ptyPort };
            const pooledStatus = await ensureContainerRunning(pooledEntry, projectId);

            if (!pooledStatus.running) {
              console.log(`⚠️ [Pool] Pooled container ${pooled.id.slice(0, 12)} not running, will create fresh container`);
              // Return the container to pool or discard it
              releasePorts(pooled.port, pooled.ptyPort);
              // Continue to create a fresh container below
            } else {
              containerId = pooled.id;
              hostPort = pooled.port;
              ptyPort = pooled.ptyPort;
              fromPool = true;
              if (pooledStatus.restarted) {
                console.log(`🔄 [Pool] Restarted pooled container ${pooled.id.slice(0, 12)} for ${projectId}`);
              }

              // Inject project-specific env vars into pooled container
              const containerInstance = docker.getContainer(containerId);
            const exec = await containerInstance.exec({
              Cmd: ['sh', '-c', `export RECODER_PROJECT_ID=${projectId}`],
              AttachStdout: false,
              AttachStderr: false,
            });
            await exec.start({ Detach: true });

            // Inject Claude Code token if available
            if (claudeCodeToken) {
              const tokenExec = await containerInstance.exec({
                Cmd: ['sh', '-c', `export CLAUDE_CODE_OAUTH_TOKEN=${claudeCodeToken}`],
                AttachStdout: false,
                AttachStderr: false,
              });
              await tokenExec.start({ Detach: true });
              console.log(`[Claude Code] Injecting OAuth token into pooled container for project ${projectId}`);
            }

            // Inject AI provider API keys if available
            if (aiProviderKeys.openai) {
              const keyExec = await containerInstance.exec({
                Cmd: ['sh', '-c', `export OPENAI_API_KEY=${aiProviderKeys.openai}`],
                AttachStdout: false,
                AttachStderr: false,
              });
              await keyExec.start({ Detach: true });
              console.log(`[AI Tools] Injecting OpenAI API key into pooled container for project ${projectId}`);
            }
            if (aiProviderKeys.gemini) {
              const keyExec = await containerInstance.exec({
                Cmd: ['sh', '-c', `export GEMINI_API_KEY=${aiProviderKeys.gemini}`],
                AttachStdout: false,
                AttachStderr: false,
              });
              await keyExec.start({ Detach: true });
              console.log(`[AI Tools] Injecting Gemini API key into pooled container for project ${projectId}`);
            }
            if (aiProviderKeys.anthropic) {
              const keyExec = await containerInstance.exec({
                Cmd: ['sh', '-c', `export ANTHROPIC_API_KEY=${aiProviderKeys.anthropic}`],
                AttachStdout: false,
                AttachStderr: false,
              });
              await keyExec.start({ Detach: true });
              console.log(`[AI Tools] Injecting Anthropic API key into pooled container for project ${projectId}`);
            }
            } // Close: if (pooledStatus.running)
          } // Close: if (pooled)
        } // Close: if (ENABLE_CONTAINER_POOL)

        // FALLBACK: Create new container if pool empty
        if (!containerId) {
          // Allocate host ports for preview and PTY
          const ports = await allocatePort();
          hostPort = ports.preview;
          ptyPort = ports.pty;

          // Build environment variables for container
          const containerEnv = [
            'PTY_PORT=9999',
            'RECODER_CONTAINER=true',
            `RECODER_PROJECT_ID=${projectId}`,
            `DOCKER_BACKEND_URL=https://docker.recoder.xyz`,
          ];

          // Inject Claude Code OAuth token if user has one configured
          if (claudeCodeToken) {
            containerEnv.push(`CLAUDE_CODE_OAUTH_TOKEN=${claudeCodeToken}`);
            console.log(`[Claude Code] Injecting OAuth token into container for project ${projectId}`);
          }

          // Inject AI provider API keys (for Codex, Gemini CLI, OpenCode, etc.)
          if (aiProviderKeys.openai) {
            containerEnv.push(`OPENAI_API_KEY=${aiProviderKeys.openai}`);
            console.log(`[AI Tools] Injecting OpenAI API key for project ${projectId}`);
          }
          if (aiProviderKeys.gemini) {
            containerEnv.push(`GEMINI_API_KEY=${aiProviderKeys.gemini}`);
            console.log(`[AI Tools] Injecting Gemini API key for project ${projectId}`);
          }
          if (aiProviderKeys.anthropic) {
            containerEnv.push(`ANTHROPIC_API_KEY=${aiProviderKeys.anthropic}`);
            console.log(`[AI Tools] Injecting Anthropic API key for project ${projectId}`);
          }

          // Create new container with security sandbox and port mapping
          const container = await docker.createContainer({
            Image: IMAGE_NAME,
            Tty: true,
            OpenStdin: true,
            WorkingDir: '/workspace',
            Env: containerEnv,
            ExposedPorts: { '3000/tcp': {}, '5173/tcp': {}, '8080/tcp': {}, '9999/tcp': {} },
            HostConfig: {
              Memory: MEMORY_LIMIT,
              CpuPeriod: 100000,
              CpuQuota: CPU_QUOTA,
              NetworkMode: 'bridge',
              PortBindings: {
                '3000/tcp': [{ HostPort: String(hostPort) }],
                '5173/tcp': [{ HostPort: String(hostPort + 1) }],
                '8080/tcp': [{ HostPort: String(hostPort + 2) }],
                '9999/tcp': [{ HostPort: String(ptyPort) }],
              },
              // Named volume for node_modules persistence
              Binds: [
                `recoder-${projectId}-node_modules:/workspace/node_modules`,
                `recoder-pnpm-store:/pnpm-store`,
              ],
              // Security hardening options
              SecurityOpt: ['no-new-privileges', 'seccomp=unconfined'],
              CapDrop: ['ALL'],
              CapAdd: ['CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE', 'FOWNER', 'NET_BIND_SERVICE'],
              PidsLimit: 256,
              Ulimits: [
                { Name: 'nofile', Soft: 4096, Hard: 8192 },
                { Name: 'nproc', Soft: 128, Hard: 256 },
              ],
              Tmpfs: {
                '/tmp': 'rw,noexec,nosuid,size=512m',
              },
            },
          });

          const containerInstance = await container;
          await containerInstance.start();
          containerId = containerInstance.id;
        }

        // Register container with user tracking
        containers.set(projectId, { id: containerId, lastActive: Date.now(), port: hostPort!, ptyPort: ptyPort!, backgroundDev: false, userId });
        registerUserContainer(userId, projectId);

        console.log(`✅ Container ${fromPool ? '(from pool)' : 'created'}: ${containerId.slice(0, 12)} for ${projectId} (preview: ${hostPort}, pty: ${ptyPort}) [user: ${userId}]`);
        return { containerId, port: hostPort!, ptyPort: ptyPort!, fromPool };
      } catch (err) {
        // Cleanup allocated ports on failure (only if not from pool)
        if (!fromPool && hostPort !== undefined && ptyPort !== undefined) {
          releasePorts(hostPort, ptyPort);
        }
        throw err;
      } finally {
        // Remove from in-progress map
        creatingContainers.delete(projectId);
      }
    })();

    // Store the creation promise
    creatingContainers.set(projectId, creationPromise);

    // Wait for creation to complete and return result
    const result = await creationPromise;
    res.json({ 
      containerId: result.containerId, 
      reused: false, 
      fromPool: result.fromPool,
      port: result.port, 
      ptyPort: result.ptyPort 
    });
  } catch (err: any) {
    console.error('❌ Container create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Stop container (SECURED)
app.delete('/api/container/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  try {
    auditLog({
      userId: req.userId,
      action: 'CONTAINER_DELETE',
      projectId,
      ip: req.ip,
    });

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const container = docker.getContainer(entry.id);
    await container.stop().catch(() => {});
    await container.remove().catch(() => {});
    releasePorts(entry.port, entry.ptyPort);
    if (entry.userId) {
      unregisterUserContainer(entry.userId, projectId);
    }
    containers.delete(projectId);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mount local files/folders into container (SECURED)
app.post('/api/mount/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  try {
    const { files } = req.body;
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });
    if (!files?.length) return res.status(400).json({ error: 'files array required' });

    auditLog({
      userId: req.userId,
      action: 'FILE_MOUNT',
      projectId,
      details: { fileCount: files.length },
      ip: req.ip,
    });

    entry.lastActive = Date.now();
    const mounted = await mountFiles(entry.id, files);
    res.json({ mounted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Write file to container (SECURED)
app.post('/api/file/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const rawPath = req.body?.path;
  const safePath = sanitizePath(rawPath);

  console.log('📝 File write request:', projectId, safePath);
  try {
    const { content } = req.body;

    if (!safePath) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    auditLog({
      userId: req.userId,
      action: 'FILE_WRITE',
      projectId,
      details: { path: safePath },
      ip: req.ip,
    });

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    // Ensure container is running before file operations
    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({ error: 'Container not running', canRetry: true });
    }

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);

    // Helper to wait for exec stream with timeout (exec streams may emit 'close' instead of 'end')
    const waitForExecStream = (stream: any, timeoutMs = 10000): Promise<void> => {
      return Promise.race([
        new Promise<void>((resolve) => {
          stream.on('end', resolve);
          stream.on('close', resolve);
          stream.on('error', resolve); // Don't fail, just continue
        }),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
      ]);
    };

    // Create directory if needed (using sanitized path)
    const dir = safePath.substring(0, safePath.lastIndexOf('/'));
    if (dir) {
      // Use array-based exec to avoid shell injection
      const mkdirExec = await container.exec({
        Cmd: ['mkdir', '-p', `/workspace/${dir}`],
        AttachStdout: true,
        AttachStderr: true,
      });
      const mkdirStream = await mkdirExec.start({});
      await waitForExecStream(mkdirStream, 5000);
    }

    // Write file using base64 to handle special chars (sanitized path)
    const b64 = Buffer.from(content).toString('base64');
    const fullPath = `/workspace/${safePath}`;

    // Use sh -c but with properly escaped path
    const writeExec = await container.exec({
      Cmd: ['sh', '-c', `echo '${b64}' | base64 -d > '${fullPath.replace(/'/g, "'\\''")}'`],
      AttachStdout: true,
      AttachStderr: true,
    });
    const writeStream = await writeExec.start({});
    // Wait for file write with timeout (exec streams may not emit 'end')
    await waitForExecStream(writeStream, 10000);

    // Force filesystem sync to ensure file is written to disk
    const syncExec = await container.exec({
      Cmd: ['sync'],
      AttachStdout: true,
      AttachStderr: true,
    });
    const syncStream = await syncExec.start({});
    await waitForExecStream(syncStream, 5000);

    // Verify file exists before returning success
    const verifyExec = await container.exec({
      Cmd: ['test', '-f', fullPath],
      AttachStdout: true,
      AttachStderr: true,
    });
    const verifyStream = await verifyExec.start({});
    await waitForExecStream(verifyStream, 5000);
    const verifyResult = await verifyExec.inspect();
    if (verifyResult.ExitCode !== 0) {
      console.error('❌ File verification failed:', fullPath);
      return res.status(500).json({ error: 'File write verification failed' });
    }

    console.log('✅ File write complete:', projectId, safePath);

    // PERFORMANCE: Invalidate cache on write
    fileCache.invalidate(projectId, safePath);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Batch write multiple files at once (SECURED)
app.post('/api/files/:projectId/batch', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  try {
    const { files } = req.body; // Array of { path, content }
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    auditLog({
      userId: req.userId,
      action: 'FILE_BATCH_WRITE',
      projectId,
      details: { fileCount: files?.length || 0 },
      ip: req.ip,
    });

    // Ensure container is running before file operations
    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({ error: 'Container not running', canRetry: true });
    }

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);

    // Sanitize all paths and collect directories
    const dirs = new Set<string>();
    const sanitizedFiles = files.map((file: { path: string; content: string }) => {
      const safePath = sanitizePath(file.path);
      const dir = safePath.substring(0, safePath.lastIndexOf('/'));
      if (dir) dirs.add(dir);
      return { path: safePath, content: file.content };
    }).filter((f: { path: string }) => f.path); // Remove invalid paths

    // Helper to wait for exec stream with timeout (exec streams may emit 'close' instead of 'end')
    const waitForExecStream = (stream: any, timeoutMs = 10000): Promise<void> => {
      return Promise.race([
        new Promise<void>((resolve) => {
          stream.on('end', resolve);
          stream.on('close', resolve);
          stream.on('error', resolve);
        }),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
      ]);
    };

    // Create all directories first using array-based exec
    if (dirs.size > 0) {
      const mkdirExec = await container.exec({
        Cmd: ['mkdir', '-p', ...Array.from(dirs).map(d => `/workspace/${d}`)],
        AttachStdout: true,
        AttachStderr: true,
      });
      const mkdirStream = await mkdirExec.start({});
      await waitForExecStream(mkdirStream, 5000);
    }

    // Write files in parallel batches of 10 (with sanitized paths)
    const batchSize = 10;
    for (let i = 0; i < sanitizedFiles.length; i += batchSize) {
      const batch = sanitizedFiles.slice(i, i + batchSize);
      await Promise.all(batch.map(async (file: { path: string; content: string }) => {
        const b64 = Buffer.from(file.content).toString('base64');
        const fullPath = `/workspace/${file.path}`;
        const writeExec = await container.exec({
          Cmd: ['sh', '-c', `echo '${b64}' | base64 -d > '${fullPath.replace(/'/g, "'\\''")}'`],
          AttachStdout: true,
          AttachStderr: true,
        });
        const writeStream = await writeExec.start({});
        await waitForExecStream(writeStream, 10000);
      }));
    }

    // PERFORMANCE: Invalidate cache for all written files
    for (const file of sanitizedFiles) {
      fileCache.invalidate(projectId, file.path);
    }

    res.json({ success: true, count: sanitizedFiles.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Read file from container (SECURED)
// PERFORMANCE: Uses LRU cache for frequently read files
app.get('/api/file/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  try {
    const rawPath = req.query.path as string;
    const safePath = sanitizePath(rawPath);
    const skipCache = req.query.skipCache === 'true';  // Allow cache bypass

    if (!safePath) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    // PERFORMANCE: Check cache first (unless explicitly skipped)
    if (!skipCache) {
      const cached = fileCache.get(projectId, safePath);
      if (cached !== null) {
        return res.json({ content: cached, cached: true });
      }
    }

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    // Ensure container is running
    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({ error: 'Container not running', canRetry: true });
    }

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);

    // Use array-based exec to prevent injection
    const catExec = await container.exec({
      Cmd: ['cat', `/workspace/${safePath}`],
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await catExec.start({});
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', resolve);
    });

    // Parse Docker multiplexed stream
    const raw = Buffer.concat(chunks);
    let content = '';
    let i = 0;
    while (i < raw.length) {
      if (i + 8 <= raw.length) {
        const size = raw.readUInt32BE(i + 4);
        if (i + 8 + size <= raw.length) {
          content += raw.slice(i + 8, i + 8 + size).toString();
          i += 8 + size;
        } else break;
      } else break;
    }

    // PERFORMANCE: Cache the result for future reads
    fileCache.set(projectId, safePath, content);

    res.json({ content, cached: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete file or folder (SECURED)
app.delete('/api/file/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  try {
    const rawPath = req.body?.path;
    const safePath = sanitizePath(rawPath);

    if (!safePath) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    auditLog({
      userId: req.userId,
      action: 'FILE_DELETE',
      projectId,
      details: { path: safePath },
      ip: req.ip,
    });

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);

    // Create snapshot before delete
    await snapshotManager.createSnapshot(entry.id, projectId, `Before delete: ${safePath}`, 'auto');

    // Delete file or folder using array-based exec
    const rmExec = await container.exec({
      Cmd: ['rm', '-rf', `/workspace/${safePath}`],
      AttachStdout: true,
      AttachStderr: true,
    });
    await rmExec.start({});

    // PERFORMANCE: Invalidate cache on delete
    fileCache.invalidate(projectId, safePath);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Rename/move file or folder (SECURED)
app.put('/api/file/:projectId/rename', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  try {
    const safeOldPath = sanitizePath(req.body?.oldPath);
    const safeNewPath = sanitizePath(req.body?.newPath);

    if (!safeOldPath || !safeNewPath) {
      return res.status(400).json({ error: 'Invalid file paths' });
    }

    auditLog({
      userId: req.userId,
      action: 'FILE_RENAME',
      projectId,
      details: { oldPath: safeOldPath, newPath: safeNewPath },
      ip: req.ip,
    });

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);

    // Create snapshot before rename
    await snapshotManager.createSnapshot(entry.id, projectId, `Before rename: ${safeOldPath}`, 'auto');

    // Create parent directory if needed
    const dir = safeNewPath.substring(0, safeNewPath.lastIndexOf('/'));
    if (dir) {
      const mkdirExec = await container.exec({
        Cmd: ['mkdir', '-p', `/workspace/${dir}`],
        AttachStdout: true,
        AttachStderr: true,
      });
      await mkdirExec.start({});
    }

    // Move/rename using array-based exec
    const mvExec = await container.exec({
      Cmd: ['mv', `/workspace/${safeOldPath}`, `/workspace/${safeNewPath}`],
      AttachStdout: true,
      AttachStderr: true,
    });
    await mvExec.start({});

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create folder (SECURED)
app.post('/api/folder/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  try {
    const safePath = sanitizePath(req.body?.path);

    if (!safePath) {
      return res.status(400).json({ error: 'Invalid folder path' });
    }

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);

    // Use array-based exec to prevent injection
    const mkdirExec = await container.exec({
      Cmd: ['mkdir', '-p', `/workspace/${safePath}`],
      AttachStdout: true,
      AttachStderr: true,
    });
    await mkdirExec.start({});

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List files in container (SECURED)
app.get('/api/files/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  try {
    const rawPath = (req.query.path as string) || '/workspace';
    const safePath = rawPath === '/workspace' ? '/workspace' : `/workspace/${sanitizePath(rawPath)}`;

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);

    // Use array-based exec for find command
    const findExec = await container.exec({
      Cmd: ['find', safePath, '-maxdepth', '2', '(', '-type', 'f', '-o', '-type', 'd', ')'],
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await findExec.start({});
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', resolve);
    });

    // Parse Docker multiplexed stream
    const raw = Buffer.concat(chunks);
    let output = '';
    let i = 0;
    while (i < raw.length) {
      if (i + 8 <= raw.length) {
        const size = raw.readUInt32BE(i + 4);
        if (i + 8 + size <= raw.length) {
          output += raw.slice(i + 8, i + 8 + size).toString();
          i += 8 + size;
        } else break;
      } else break;
    }

    res.json({ files: output.split('\n').filter(Boolean) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Execute command in container
app.post('/api/exec/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    let { command, cwd = '/workspace', background = false } = req.body;
    const projectId = sanitizeProjectId(req.params.projectId);

    // Audit log ALL command executions - this is critical for security
    auditLog({
      userId: req.userId,
      action: 'COMMAND_EXEC',
      projectId,
      details: {
        command: command?.substring(0, 500), // Truncate for logging
        cwd,
        background,
      },
      ip: req.ip,
    });

    // Validate command exists
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'Command is required' });
    }

    // Block dangerous commands that could escape container or cause harm
    const blockedPatterns = [
      /docker\s/i,           // Docker commands
      /nsenter/i,            // Namespace escape
      /\/proc\/1/,           // PID 1 access
      /chroot/i,             // Chroot escape
      /mount\s/i,            // Mount commands
      /umount/i,             // Unmount
      /mkfs/i,               // Filesystem creation
      /dd\s+if=/i,           // Disk operations
      />\s*\/dev\/sd/i,      // Writing to block devices (sda, sdb, etc.)
      />\s*\/dev\/hd/i,      // Writing to IDE devices (hda, hdb, etc.)
      />\s*\/dev\/vd/i,      // Writing to virtual devices (vda, vdb, etc.)
      />\s*\/dev\/xvd/i,     // Writing to Xen devices
      /curl.*\|\s*sh/i,      // Piped shell scripts
      /wget.*\|\s*sh/i,      // Piped shell scripts
      /rm\s+-rf\s+\//,       // Root deletion
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(command)) {
        auditLog({
          userId: req.userId,
          action: 'BLOCKED_COMMAND',
          projectId,
          details: { command: command.substring(0, 500), pattern: pattern.toString() },
          ip: req.ip,
        });
        return res.status(403).json({ error: 'Command blocked for security reasons' });
      }
    }

    // Sanitize cwd - ensure it's a valid absolute path
    if (!cwd || typeof cwd !== 'string') cwd = '/workspace';
    cwd = cwd.trim();
    if (!cwd.startsWith('/')) cwd = `/workspace/${cwd}`;
    // Remove duplicate /workspace if present
    cwd = cwd.replace(/\/workspace\/workspace/, '/workspace');

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    // Ensure container is running before exec
    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({
        error: 'Container not running',
        message: containerStatus.error || 'Container could not be started',
        canRetry: true
      });
    }

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);

    // For background commands (like dev servers), start and return immediately
    if (background) {
      // Kill any existing dev server first (exit code 143 is expected and OK)
      await execCommand(container, `pkill -f "npm run dev|vite|next dev" || true`, true).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Use nohup to keep process running in background
      // Ensure cwd exists before cd
      await execCommand(container, `mkdir -p "${cwd}"`);

      // Start the dev server using setsid for proper daemonization
      // NOTE: No & at the end! Docker exec Detach: true handles backgrounding
      // BROWSER=none prevents Vite from trying to open xdg-open (which doesn't exist in Docker)
      const startScript = `cd "${cwd}" && BROWSER=none exec setsid ${command} > /tmp/dev.log 2>&1 < /dev/null`;

      const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', startScript],
        AttachStdout: false,
        AttachStderr: false,
        Tty: false,
      });

      await exec.start({ Detach: true });
      console.log('📝 Dev server started in background');

      // Wait a moment for process to initialize
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if npm/vite process is actually running
      try {
        const psCheck = await execCommand(container, `ps aux | grep -E "npm|vite|node" | grep -v grep || echo "No dev server process"`);
        console.log('🔍 Process check after 3s:', psCheck);

        if (psCheck.includes('No dev server process')) {
          console.error('❌ Dev server process not found!');
          // Read the logs to see what went wrong
          const errorLogs = await execCommand(container, `cat /tmp/dev.log 2>&1 || echo "No logs"`);
          console.error('💥 Dev server logs:', errorLogs);
        } else {
          console.log('✅ Dev server process is running');
        }
      } catch (e) {
        console.error('Could not check process status:', e);
      }

      console.log('📝 Dev server process started, performing health check...');

      // 🔧 FIX: Wait for dev server to actually respond (up to 30 seconds)
      const portsToCheck = [entry.port + 1, entry.port, entry.port + 2]; // Vite (5173), Next.js (3000), Other (8080)
      const healthCheck = await waitForDevServer(portsToCheck, 30000);

      if (healthCheck.ready) {
        console.log(`✅ Dev server verified on port ${healthCheck.port}`);
        // mark that this project has a background dev server (so terminal can auto-tail)
        const currentEntry = containers.get(req.params.projectId);
        if (currentEntry) currentEntry.backgroundDev = true;
        return res.json({
          output: 'Started in background',
          background: true,
          ready: true,
          port: healthCheck.port
        });
      } else {
        console.warn('⚠️ Dev server started but not responding yet. May need more time to build.');

        // Check process status even if HTTP not ready
        const psOutput = await execCommand(container, `ps aux | grep -E "vite|next|node" | grep -v grep || echo "No processes found"`).catch(() => 'Error checking processes');
        console.log(`📊 Dev server processes:\n${psOutput}`);

        // mark that a background dev server was started (logs will be in /tmp/dev.log)
        const currentEntry = containers.get(req.params.projectId);
        if (currentEntry) currentEntry.backgroundDev = true;

         return res.json({
           output: 'Started in background (building...)',
           background: true,
           ready: false,
           processes: psOutput
         });
       }
     }

    const output = await execCommand(container, `cd "${cwd}" && ${command}`);
    res.json({ output, success: true, exitCode: 0 });
  } catch (err: any) {
    const errMsg = err.message || '';

    // Handle "file not found" errors gracefully - return 200 with empty output
    // This is expected for new projects when AI tries to read package.json
    if (errMsg.includes('No such file or directory') ||
        errMsg.includes('not found') ||
        errMsg.includes('ENOENT')) {
      console.log('📁 File not found (expected for new projects):', errMsg);
      return res.json({
        output: `[File not found]\n${errMsg}`,
        fileNotFound: true,
        success: true,
        exitCode: 0
      });
    }

    // Extract exit code from error message if present
    const exitCodeMatch = errMsg.match(/exit code (\d+)/);
    const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 1;

    console.error('❌ Command execution failed:', errMsg);
    res.status(500).json({
      error: errMsg,
      success: false,
      exitCode,
      output: errMsg
    });
  }
});

// Read dev server logs
app.get('/api/logs/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const tail = Math.min(parseInt(req.query.tail as string) || 100, 1000); // Cap at 1000 lines
    const logs = await devServerManager.getLogs(entry.id, projectId, tail);

    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get parsed build errors for frontend
app.get('/api/errors/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();

    // Get recent logs
    const tail = Math.min(parseInt(req.query.tail as string) || 200, 1000); // Cap at 1000 lines
    const logs = await devServerManager.getLogs(entry.id, projectId, tail);

    // Parse errors from logs
    const errors = parseAllErrors(logs);
    const blocking = hasBlockingErrors(logs);

    // Get dev server status
    const devStatus = devServerManager.getStatus(projectId);

    // Auto-restore on blocking errors (if enabled)
    let autoRestoreResult = null;
    if (blocking && req.query.autoRestore !== 'false') {
      const { hasError } = autoRestoreManager.detectErrors(logs);
      if (hasError && autoRestoreManager.shouldRestore(projectId)) {
        console.log(`[AutoRestore] Blocking errors detected for ${projectId}, attempting restore...`);
        autoRestoreResult = await autoRestoreManager.attemptRestore(entry.id, projectId);
        if (autoRestoreResult.success) {
          console.log(`[AutoRestore] Successfully restored to ${autoRestoreResult.restoredTo}`);
        }
      }
    } else if (!blocking && errors.length === 0) {
      // Reset error count when build succeeds
      autoRestoreManager.resetErrors(projectId);
    }

    res.json({
      errors,
      hasBlockingErrors: blocking,
      devServerStatus: devStatus?.status === 'running' ? 'running' : (blocking ? 'crashed' : 'idle'),
      errorCount: errors.length,
      lastLogTimestamp: Date.now(),
      autoRestore: autoRestoreResult,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manually trigger auto-restore
app.post('/api/auto-restore/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();

    // Force restore (bypass cooldown check)
    const { force = false, snapshotId } = req.body;

    auditLog({
      userId: req.userId,
      action: 'AUTO_RESTORE',
      projectId,
      details: { force, snapshotId },
      ip: req.ip,
    });

    if (snapshotId) {
      // Sanitize snapshot ID
      const safeSnapshotId = snapshotId.replace(/[^a-zA-Z0-9_-]/g, '');
      // Restore to specific snapshot
      const snapshot = await snapshotManager.restoreSnapshot(entry.id, projectId, safeSnapshotId);
      res.json({ success: true, restoredTo: safeSnapshotId, snapshot });
    } else {
      // Auto-restore to last working snapshot
      const result = await autoRestoreManager.attemptRestore(entry.id, projectId);
      res.json(result);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start dev server in background
app.post('/api/dev-server/start', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  try {
    const { projectId, framework = 'vite' } = req.body;
    const safeProjectId = sanitizeProjectId(projectId);

    // Verify ownership
    const isOwner = await checkProjectOwnership(req.userId!, safeProjectId);
    if (!isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const entry = containers.get(safeProjectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const ports = [entry.port + 1, entry.port, entry.port + 2]; // Vite, Next.js, Other

    auditLog({
      userId: req.userId,
      action: 'DEV_SERVER_START',
      projectId: safeProjectId,
      details: { framework },
      ip: req.ip,
    });

    const result = await devServerManager.start(entry.id, safeProjectId, framework, ports);
    entry.backgroundDev = true;

    res.json(result);
  } catch (err: any) {
    console.error('❌ Dev server start failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Stop dev server
app.post('/api/dev-server/stop', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  try {
    const { projectId } = req.body;
    const safeProjectId = sanitizeProjectId(projectId);

    // Verify ownership
    const isOwner = await checkProjectOwnership(req.userId!, safeProjectId);
    if (!isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const entry = containers.get(safeProjectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    auditLog({
      userId: req.userId,
      action: 'DEV_SERVER_STOP',
      projectId: safeProjectId,
      ip: req.ip,
    });

    const success = await devServerManager.stop(entry.id, safeProjectId);
    entry.backgroundDev = false;

    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Restart dev server
app.post('/api/dev-server/restart', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  try {
    const { projectId } = req.body;
    const safeProjectId = sanitizeProjectId(projectId);

    // Verify ownership
    const isOwner = await checkProjectOwnership(req.userId!, safeProjectId);
    if (!isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const entry = containers.get(safeProjectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const ports = [entry.port + 1, entry.port, entry.port + 2];

    auditLog({
      userId: req.userId,
      action: 'DEV_SERVER_RESTART',
      projectId: safeProjectId,
      ip: req.ip,
    });

    const result = await devServerManager.restart(entry.id, safeProjectId, ports);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get dev server status
app.get('/api/dev-server/status/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const status = devServerManager.getStatus(projectId);
    const isRunning = devServerManager.isRunning(projectId);

    res.json({ status, isRunning, backgroundDev: entry.backgroundDev });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Configure auto-restore (admin only - requires auth)
app.post('/api/auto-restore/config', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  try {
    const { enabled, maxRetries, cooldownMs } = req.body;

    auditLog({
      userId: req.userId,
      action: 'AUTO_RESTORE_CONFIG',
      details: { enabled, maxRetries, cooldownMs },
      ip: req.ip,
    });

    autoRestoreManager.configure({ enabled, maxRetries, cooldownMs });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Snapshot API - Git-based project state management
// ============================================================

// Create a snapshot (save current state)
app.post('/api/snapshot/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { message = 'Manual snapshot', author = 'user' } = req.body;

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    auditLog({
      userId: req.userId,
      action: 'SNAPSHOT_CREATE',
      projectId,
      details: { message },
      ip: req.ip,
    });

    entry.lastActive = Date.now();
    const snapshot = await snapshotManager.createSnapshot(entry.id, projectId, message, author);

    res.json(snapshot);
  } catch (err: any) {
    console.error('❌ Snapshot create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List all snapshots
app.get('/api/snapshots/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const snapshots = await snapshotManager.listSnapshots(entry.id, limit);

    res.json({ snapshots });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get current snapshot (HEAD)
app.get('/api/snapshot/:projectId/current', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const snapshot = await snapshotManager.getCurrentSnapshot(entry.id);

    res.json({ snapshot });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Restore to a specific snapshot
app.post('/api/snapshot/:projectId/restore', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { snapshotId } = req.body;

    if (!snapshotId) {
      return res.status(400).json({ error: 'snapshotId required' });
    }

    // Sanitize snapshot ID
    const safeSnapshotId = snapshotId.replace(/[^a-zA-Z0-9_-]/g, '');

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    auditLog({
      userId: req.userId,
      action: 'SNAPSHOT_RESTORE',
      projectId,
      details: { snapshotId: safeSnapshotId },
      ip: req.ip,
    });

    entry.lastActive = Date.now();
    await snapshotManager.restoreSnapshot(entry.id, projectId, safeSnapshotId);

    res.json({ success: true, restoredTo: safeSnapshotId });
  } catch (err: any) {
    console.error('❌ Snapshot restore error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get diff between snapshots
app.get('/api/snapshot/:projectId/diff', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { from, to = 'HEAD' } = req.query;

    if (!from) {
      return res.status(400).json({ error: 'from snapshot required' });
    }

    // Sanitize snapshot IDs
    const safeFrom = (from as string).replace(/[^a-zA-Z0-9_-]/g, '');
    const safeTo = (to as string).replace(/[^a-zA-Z0-9_-]/g, '');

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const diff = await snapshotManager.getDiff(entry.id, safeFrom, safeTo);

    res.json(diff);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get file diff between snapshots
app.get('/api/snapshot/:projectId/file-diff', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { path, from, to = 'HEAD' } = req.query;

    if (!path || !from) {
      return res.status(400).json({ error: 'path and from snapshot required' });
    }

    const safePath = sanitizePath(path as string);
    const safeFrom = (from as string).replace(/[^a-zA-Z0-9_-]/g, '');
    const safeTo = (to as string).replace(/[^a-zA-Z0-9_-]/g, '');

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const diff = await snapshotManager.getFileDiff(
      entry.id,
      safePath,
      safeFrom,
      safeTo
    );

    res.json({ diff });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get file content at a specific snapshot
app.get('/api/snapshot/:projectId/file', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { path, snapshotId } = req.query;

    if (!path || !snapshotId) {
      return res.status(400).json({ error: 'path and snapshotId required' });
    }

    const safePath = sanitizePath(path as string);
    const safeSnapshotId = (snapshotId as string).replace(/[^a-zA-Z0-9_-]/g, '');

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const content = await snapshotManager.getFileAtSnapshot(
      entry.id,
      safePath,
      safeSnapshotId
    );

    if (content === null) {
      return res.status(404).json({ error: 'File not found at snapshot' });
    }

    res.json({ content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Check for unsaved changes
app.get('/api/snapshot/:projectId/status', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const hasChanges = await snapshotManager.hasUnsavedChanges(entry.id);
    const current = await snapshotManager.getCurrentSnapshot(entry.id);

    res.json({ hasChanges, current });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Enable/disable auto-save
app.post('/api/snapshot/:projectId/auto-save', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { enabled, intervalMs = 5 * 60 * 1000 } = req.body;

    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    auditLog({
      userId: req.userId,
      action: 'AUTO_SAVE_CONFIG',
      projectId,
      details: { enabled, intervalMs },
      ip: req.ip,
    });

    if (enabled) {
      snapshotManager.startAutoSave(entry.id, projectId, intervalMs);
    } else {
      snapshotManager.stopAutoSave(projectId);
    }

    res.json({ success: true, autoSaveEnabled: enabled });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Compress snapshots (git gc)
app.post('/api/snapshot/:projectId/compress', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const result = await snapshotManager.compress(entry.id);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Prune old snapshots
app.post('/api/snapshot/:projectId/prune', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { keepCount = 50 } = req.body;
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    auditLog({
      userId: req.userId,
      action: 'SNAPSHOT_PRUNE',
      projectId,
      details: { keepCount },
      ip: req.ip,
    });

    const pruned = await snapshotManager.pruneOldSnapshots(entry.id, keepCount);
    res.json({ success: true, prunedCount: pruned });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get snapshot stats
app.get('/api/snapshot/:projectId/stats', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const stats = await snapshotManager.getStats(entry.id);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Keep-alive / reset timer endpoint
app.post('/api/keep-alive/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    lifecycleManager.resetTimer(projectId);

    const timeRemaining = lifecycleManager.getIdleTimeRemaining(projectId);
    res.json({ success: true, timeRemaining });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: Wait for PTY server to be ready (with retries)
async function waitForPtyServer(port: number, maxRetries = 10, delayMs = 500): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to establish a test connection
      const testWs = new WebSocket(`ws://127.0.0.1:${port}`);
      await new Promise((resolve, reject) => {
        testWs.on('open', () => {
          testWs.close();
          resolve(true);
        });
        testWs.on('error', reject);
        setTimeout(() => reject(new Error('Timeout')), 1000);
      });
      return true; // PTY server is ready
    } catch {
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  return false;
}

// Helper: Wait for dev server to be ready (HTTP health check)
async function waitForDevServer(ports: number[], maxWaitMs = 60000): Promise<{ ready: boolean; port?: number }> {
  const startTime = Date.now();
  const checkInterval = 1000; // Check every 1 second

  console.log(`🔍 Waiting for dev server on ports: ${ports.join(', ')}`);

  while (Date.now() - startTime < maxWaitMs) {
    // Check all ports in parallel
    for (const port of ports) {
      try {
        const isReady = await new Promise<boolean>((resolve) => {
          const req = http.get(`http://127.0.0.1:${port}`, { timeout: 2000 }, (res) => {
            // Any response (even 404) means server is up
            resolve(res.statusCode !== undefined && res.statusCode < 500);
          });
          req.on('error', () => resolve(false));
          req.on('timeout', () => { req.destroy(); resolve(false); });
        });

        if (isReady) {
          console.log(`✅ Dev server responding on port ${port}`);
          return { ready: true, port };
        }
      } catch {
        // Continue checking
      }
    }

    // Log progress every 5 seconds
    const elapsed = Date.now() - startTime;
    if (elapsed % 5000 < checkInterval) {
      console.log(`⏳ Still waiting for dev server... (${Math.round(elapsed / 1000)}s elapsed)`);
    }

    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  console.log(`⏱️ Dev server health check timeout after ${maxWaitMs}ms`);
  return { ready: false };
}

// Terminal WebSocket - Proxy to container's PTY server
// Each terminal gets its own independent session with RPC support
const terminalSessions = new Map<string, { pty: pty.IPty; projectId: string; rpc: WebSocketRPC }>();

// Initialize Container Lifecycle Manager
const lifecycleManager = new ContainerLifecycleManager(containers);
lifecycleManager.setCleanupHandler(async (projectId, containerId) => {
  try {
    const container = docker.getContainer(containerId);
    await container.stop().catch(() => {});
    await container.remove().catch(() => {});
    const entry = containers.get(projectId);
    if (entry) {
      releasePorts(entry.port, entry.ptyPort);
      if (entry.userId) {
        unregisterUserContainer(entry.userId, projectId);
      }
      containers.delete(projectId);
    }
    console.log(`[Lifecycle] Cleaned up container for ${projectId}`);
  } catch (error: any) {
    console.error(`[Lifecycle] Cleanup error: ${error.message}`);
  }
});

app.ws('/terminal/:projectId', async (ws, req) => {
  const { projectId } = req.params;
  const terminalId = req.query.terminalId as string || `term-${Date.now()}`;

  // Authenticate WebSocket connection
  const authSession = await authenticateWebSocket(ws, req);
  if (!authSession) return; // Connection closed by auth helper

  let entry = containers.get(projectId);
  
  // Try to recover container from Docker if not in memory (after backend restart)
  if (!entry) {
    console.log(`⚠️ [Terminal] Container not in memory for ${projectId}, attempting recovery...`);
    try {
      const allContainers = await docker.listContainers({ all: false });
      for (const containerInfo of allContainers) {
        const volumes = Object.keys(containerInfo.Mounts?.reduce((acc: any, m: any) => {
          if (m.Name) acc[m.Name] = true;
          return acc;
        }, {}) || {});
        
        if (volumes.some(v => v.includes(`recoder-${projectId}`))) {
          const ports = containerInfo.Ports || [];
          let basePort = 0;
          let ptyPort = 0;
          
          for (const p of ports) {
            if (p.PrivatePort === 3000 && p.PublicPort) basePort = p.PublicPort;
            if (p.PrivatePort === 5173 && p.PublicPort && !basePort) basePort = p.PublicPort - 1;
            if (p.PrivatePort === 9999 && p.PublicPort) ptyPort = p.PublicPort;
          }
          
          if (basePort > 0) {
            entry = {
              id: containerInfo.Id,
              lastActive: Date.now(),
              port: basePort,
              ptyPort: ptyPort || basePort + 3,
              backgroundDev: false
            };
            containers.set(projectId, entry);
            console.log(`🔄 [Terminal] Recovered container for ${projectId}: ${containerInfo.Id.slice(0, 12)}`);
            break;
          }
        }
      }
    } catch (err) {
      console.error(`❌ [Terminal] Recovery failed for ${projectId}:`, err);
    }
  }
  
  if (!entry) {
    ws.close(1008, 'Container not found');
    return;
  }

  entry.lastActive = Date.now();
  lifecycleManager.resetTimer(projectId);

  // Initialize WebSocket RPC for this connection
  const rpc = new WebSocketRPC(ws as any);

  // Check if this terminal session already exists
  let session = terminalSessions.get(terminalId);
  
  if (!session) {
    // Create new independent PTY session via docker exec
    const container = docker.getContainer(entry.id);
    
    // Create exec instance for interactive shell
    const exec = await container.exec({
      Cmd: ['/bin/bash'],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    });

    const stream = await exec.start({ hijack: true, stdin: true }) as Duplex;
    
    console.log(`✅ Terminal session created: ${terminalId} for ${projectId}`);

    // Send initial prompt setup
    stream.write('cd /workspace && clear\n');

    // Handle data from container to client
    stream.on('data', (data: Buffer) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    });

    stream.on('error', (err: Error) => {
      console.error(`Terminal ${terminalId} error:`, err.message);
    });

    stream.on('end', () => {
      console.log(`Terminal ${terminalId} stream ended`);
      terminalSessions.delete(terminalId);
      if (ws.readyState === ws.OPEN) {
        ws.close(1000);
      }
    });

    // Save terminal session to Redis for persistence
    sessionStore.saveTerminalSession({
      projectId,
      terminalId,
      createdAt: Date.now(),
      lastActive: Date.now(),
      history: [],
      cwd: '/workspace',
      env: {},
    }).catch(() => {});

    // Register RPC handlers for this terminal session
    rpc.register('terminal.resize', async ({ cols, rows }) => {
      // Docker exec doesn't support resize directly, but we acknowledge
      console.log(`[RPC] Terminal resize: ${cols}x${rows}`);
      return { success: true };
    });

    rpc.register('terminal.clear', async () => {
      stream.write('\x1bc'); // Clear screen ANSI escape
      return { success: true };
    });

    rpc.register('terminal.kill', async () => {
      stream.write('\x03'); // Send Ctrl+C
      return { success: true };
    });

    rpc.register('terminal.saveHistory', async ({ command }) => {
      // Save command to container's bash history
      await execInContainer(entry.id, `echo "${command.replace(/"/g, '\\"')}" >> ~/.bash_history`);
      // Also save to Redis for persistence
      sessionStore.addCommandToHistory(projectId, terminalId, command).catch(() => {});
      return { success: true };
    });

    rpc.register('terminal.getHistory', async () => {
      // Try Redis first, fallback to container
      const redisSession = await sessionStore.getTerminalSession(projectId, terminalId);
      if (redisSession?.history?.length) {
        return { history: redisSession.history };
      }
      // Fallback to container's bash history
      const history = await execInContainer(entry.id, 'tail -n 100 ~/.bash_history || echo ""');
      return { history: history.split('\n').filter(Boolean) };
    });

    rpc.register('resetTimer', async () => {
      lifecycleManager.resetTimer(projectId);
      sessionStore.updateTerminalActivity(projectId, terminalId).catch(() => {});
      return { success: true };
    });

    // Store session with stream and RPC reference
    session = { pty: stream as any, projectId, rpc };
    terminalSessions.set(terminalId, session);

    // Handle data from client to container
    ws.on('message', async (data: Buffer | string) => {
      entry.lastActive = Date.now();
      lifecycleManager.resetTimer(projectId);

      // Check if it's an RPC message
      if (typeof data === 'string') {
        const handled = await rpc.handleMessage(data);
        if (handled) return;
      }

      // Otherwise, write to terminal
      stream.write(data);
    });

    ws.on('close', () => {
      console.log(`Terminal ${terminalId} WebSocket closed`);
      // Don't destroy session immediately - allow reconnection
      setTimeout(() => {
        const s = terminalSessions.get(terminalId);
        if (s) {
          stream.end();
          terminalSessions.delete(terminalId);
        }
      }, 5000); // 5 second grace period for reconnection
    });
  } else {
    // Reconnect to existing session
    console.log(`♻️ Reconnecting to terminal session: ${terminalId}`);
    const stream = session.pty as unknown as Duplex;
    
    // Update RPC reference for reconnected session
    session.rpc = rpc;

    // Re-register RPC handlers
    rpc.register('terminal.resize', async ({ cols, rows }) => {
      console.log(`[RPC] Terminal resize: ${cols}x${rows}`);
      return { success: true };
    });

    rpc.register('terminal.clear', async () => {
      stream.write('\x1bc');
      return { success: true };
    });

    rpc.register('terminal.kill', async () => {
      stream.write('\x03');
      return { success: true };
    });

    rpc.register('resetTimer', async () => {
      lifecycleManager.resetTimer(projectId);
      return { success: true };
    });
    
    stream.on('data', (data: Buffer) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    });

    ws.on('message', async (data: Buffer | string) => {
      entry.lastActive = Date.now();
      lifecycleManager.resetTimer(projectId);

      if (typeof data === 'string') {
        const handled = await rpc.handleMessage(data);
        if (handled) return;
      }

      stream.write(data);
    });

    ws.on('close', () => {
      console.log(`Terminal ${terminalId} WebSocket closed (reconnectable)`);
    });
  }
});

// WebSocket endpoint for file watching (CLI integration)
// Used by recoder-code CLI to sync file changes with web editor
app.ws('/watch/:projectId', async (ws, req) => {
  const { projectId } = req.params;

  // Authenticate WebSocket connection
  const authSession = await authenticateWebSocket(ws, req);
  if (!authSession) return;

  const entry = containers.get(projectId);

  if (!entry) {
    ws.close(1008, 'Container not found');
    return;
  }

  console.log(`[FileWatch] WebSocket connected for ${projectId} [user: ${authSession.userId}]`);

  // Start file watcher for this project
  fileWatcher.startWatching(entry.id, projectId);

  // Listen for file changes and forward to client
  const changeHandler = ({ projectId: pid, changes }: any) => {
    if (pid === projectId && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'file-changes', changes }));
    }
  };

  fileWatcher.on('changes', changeHandler);

  ws.on('close', () => {
    fileWatcher.removeListener('changes', changeHandler);
    fileWatcher.stopWatching(projectId);
    console.log(`[FileWatch] WebSocket closed for ${projectId}`);
  });

  ws.on('error', (err) => {
    console.error(`[FileWatch] Error for ${projectId}:`, err.message);
  });
});

// NOTE: LSP and Database Explorer APIs have been removed
// LSP: Requires proper architecture with TCP-based communication
// Database: Requires rewrite with proper database drivers (SQL injection risk)
// These will be re-implemented in a future phase with proper security

// Search in files
app.post('/api/search/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { query, options } = req.body;

    // Sanitize search query
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    let entry = containers.get(projectId);

    // Try to recover container from Docker if not in memory
    if (!entry) {
      console.log(`⚠️ [Search] Container not in memory for ${projectId}, attempting recovery...`);
      const allContainers = await docker.listContainers({ all: false });
      for (const containerInfo of allContainers) {
        const volumes = Object.keys(containerInfo.Mounts?.reduce((acc: any, m: any) => {
          if (m.Name) acc[m.Name] = true;
          return acc;
        }, {}) || {});
        if (volumes.some(v => v.includes(`recoder-${projectId}`))) {
          const ports = containerInfo.Ports || [];
          let basePort = 0;
          for (const p of ports) {
            if (p.PrivatePort === 3000 && p.PublicPort) basePort = p.PublicPort;
            if (p.PrivatePort === 5173 && p.PublicPort && !basePort) basePort = p.PublicPort - 1;
          }
          if (basePort > 0) {
            entry = { id: containerInfo.Id, lastActive: Date.now(), port: basePort, ptyPort: basePort + 3, backgroundDev: false };
            containers.set(projectId, entry);
            console.log(`🔄 [Search] Recovered container for ${projectId}`);
            break;
          }
        }
      }
    }

    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    const results = await searchService.search(entry.id, query, options);
    res.json({ results, total: results.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Replace in files
app.post('/api/replace/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { searchQuery, replaceText, files } = req.body;

    // Validate inputs
    if (!searchQuery || typeof searchQuery !== 'string') {
      return res.status(400).json({ error: 'searchQuery is required' });
    }

    const entry = containers.get(projectId);

    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'SEARCH_REPLACE',
      projectId,
      details: { searchQuery: searchQuery.substring(0, 100), fileCount: files?.length },
      ip: req.ip,
    });

    const result = await searchService.replace(entry.id, searchQuery, replaceText, files);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== Package Manager API ====================

// Get installed packages
app.get('/api/packages/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const manager = req.query.manager as string;

    if (!manager || !['npm', 'bun', 'pip', 'cargo', 'go', 'composer', 'gem'].includes(manager)) {
      return res.status(400).json({ error: 'Valid package manager required (npm, bun, pip, cargo, go, composer, gem)' });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    // Ensure container is running
    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({ error: 'Container not running', canRetry: true });
    }

    entry.lastActive = Date.now();

    const packages = await packageManagerService.getPackages(entry.id, manager as any);
    res.json({ packages, manager });
  } catch (err: any) {
    console.error('[PackageManager] Get packages error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Search package registry
app.post('/api/packages/:projectId/search', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const { query, manager } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!manager || !['npm', 'bun', 'pip', 'cargo', 'go', 'composer', 'gem'].includes(manager)) {
      return res.status(400).json({ error: 'Valid package manager required' });
    }

    const results = await packageManagerService.searchPackages(manager as any, query);
    res.json({ results });
  } catch (err: any) {
    console.error('[PackageManager] Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Install a package
app.post('/api/packages/:projectId/install', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { packageName, manager, isDev } = req.body;

    if (!packageName || typeof packageName !== 'string') {
      return res.status(400).json({ error: 'Package name is required' });
    }

    if (!manager || !['npm', 'bun', 'pip', 'cargo', 'go', 'composer', 'gem'].includes(manager)) {
      return res.status(400).json({ error: 'Valid package manager required' });
    }

    // Sanitize package name to prevent command injection
    const safePackageName = packageName.replace(/[;&|`$(){}]/g, '').trim();
    if (!safePackageName) {
      return res.status(400).json({ error: 'Invalid package name' });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'PACKAGE_INSTALL',
      projectId,
      details: { packageName: safePackageName, manager, isDev },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await packageManagerService.installPackage(entry.id, manager as any, safePackageName, isDev === true);

    if (result.success) {
      res.json({ success: true, output: result.output });
    } else {
      res.status(400).json({ error: result.error || 'Install failed' });
    }
  } catch (err: any) {
    console.error('[PackageManager] Install error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Uninstall a package
app.post('/api/packages/:projectId/uninstall', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { packageName, manager } = req.body;

    if (!packageName || typeof packageName !== 'string') {
      return res.status(400).json({ error: 'Package name is required' });
    }

    if (!manager || !['npm', 'bun', 'pip', 'cargo', 'go', 'composer', 'gem'].includes(manager)) {
      return res.status(400).json({ error: 'Valid package manager required' });
    }

    const safePackageName = packageName.replace(/[;&|`$(){}]/g, '').trim();
    if (!safePackageName) {
      return res.status(400).json({ error: 'Invalid package name' });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'PACKAGE_UNINSTALL',
      projectId,
      details: { packageName: safePackageName, manager },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await packageManagerService.uninstallPackage(entry.id, manager as any, safePackageName);

    if (result.success) {
      res.json({ success: true, output: result.output });
    } else {
      res.status(400).json({ error: result.error || 'Uninstall failed' });
    }
  } catch (err: any) {
    console.error('[PackageManager] Uninstall error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update a package
app.post('/api/packages/:projectId/update', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { packageName, manager } = req.body;

    if (!packageName || typeof packageName !== 'string') {
      return res.status(400).json({ error: 'Package name is required' });
    }

    if (!manager || !['npm', 'bun', 'pip', 'cargo', 'go', 'composer', 'gem'].includes(manager)) {
      return res.status(400).json({ error: 'Valid package manager required' });
    }

    const safePackageName = packageName.replace(/[;&|`$(){}]/g, '').trim();
    if (!safePackageName) {
      return res.status(400).json({ error: 'Invalid package name' });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'PACKAGE_UPDATE',
      projectId,
      details: { packageName: safePackageName, manager },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await packageManagerService.updatePackage(entry.id, manager as any, safePackageName);

    if (result.success) {
      res.json({ success: true, output: result.output });
    } else {
      res.status(400).json({ error: result.error || 'Update failed' });
    }
  } catch (err: any) {
    console.error('[PackageManager] Update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== End Package Manager API ====================

// ==================== Secrets/Environment Variables API ====================

// Get secrets for an environment
app.get('/api/secrets/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const environment = (req.query.environment as string) || 'development';

    if (!['development', 'production', 'test', 'local'].includes(environment)) {
      return res.status(400).json({ error: 'Invalid environment' });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    // Ensure container is running
    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({ error: 'Container not running', canRetry: true });
    }

    entry.lastActive = Date.now();

    const secrets = await secretsManager.getSecrets(entry.id, environment);
    res.json({ secrets, environment });
  } catch (err: any) {
    console.error('[Secrets] Get secrets error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Set a secret
app.post('/api/secrets/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { key, value, environment = 'development' } = req.body;

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Key is required' });
    }

    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }

    if (!['development', 'production', 'test', 'local'].includes(environment)) {
      return res.status(400).json({ error: 'Invalid environment' });
    }

    // Sanitize key
    const safeKey = key.replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
    if (!safeKey || safeKey.length > 128) {
      return res.status(400).json({ error: 'Invalid key name' });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'SECRET_SET',
      projectId,
      details: { key: safeKey, environment },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await secretsManager.setSecret(entry.id, safeKey, String(value), environment);

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error || 'Failed to set secret' });
    }
  } catch (err: any) {
    console.error('[Secrets] Set secret error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a secret
app.delete('/api/secrets/:projectId/:key', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const key = decodeURIComponent(req.params.key);
    const environment = (req.query.environment as string) || 'development';

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Key is required' });
    }

    if (!['development', 'production', 'test', 'local'].includes(environment)) {
      return res.status(400).json({ error: 'Invalid environment' });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'SECRET_DELETE',
      projectId,
      details: { key, environment },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await secretsManager.deleteSecret(entry.id, key, environment);

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error || 'Failed to delete secret' });
    }
  } catch (err: any) {
    console.error('[Secrets] Delete secret error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== End Secrets API ====================

// ==================== Git Operations API ====================

// Get git status
app.get('/api/git/:projectId/status', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    entry.lastActive = Date.now();

    const status = await gitOperations.getStatus(entry.id);
    res.json(status);
  } catch (err: any) {
    console.error('[Git] Status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get branches
app.get('/api/git/:projectId/branches', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    entry.lastActive = Date.now();

    const branches = await gitOperations.getBranches(entry.id);
    res.json({ branches });
  } catch (err: any) {
    console.error('[Git] Branches error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create branch
app.post('/api/git/:projectId/branch', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { name, checkout } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Branch name required' });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_CREATE_BRANCH',
      projectId,
      details: { name },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await gitOperations.createBranch(entry.id, name, checkout !== false);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Create branch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Checkout branch
app.post('/api/git/:projectId/checkout', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { branch } = req.body;

    if (!branch || typeof branch !== 'string') {
      return res.status(400).json({ error: 'Branch name required' });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_CHECKOUT',
      projectId,
      details: { branch },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await gitOperations.checkoutBranch(entry.id, branch);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete branch
app.delete('/api/git/:projectId/branch/:name', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const branchName = decodeURIComponent(req.params.name);
    const force = req.query.force === 'true';

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_DELETE_BRANCH',
      projectId,
      details: { branch: branchName, force },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await gitOperations.deleteBranch(entry.id, branchName, force);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Delete branch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get commit history
app.get('/api/git/:projectId/log', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const branch = req.query.branch as string | undefined;

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    entry.lastActive = Date.now();

    const commits = await gitOperations.getCommitHistory(entry.id, limit, branch);
    res.json({ commits });
  } catch (err: any) {
    console.error('[Git] Log error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get file diff
app.get('/api/git/:projectId/diff/:file(*)', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const filePath = decodeURIComponent(req.params.file);
    const staged = req.query.staged === 'true';

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    entry.lastActive = Date.now();

    const diff = await gitOperations.getFileDiff(entry.id, filePath, staged);
    res.json({ diff });
  } catch (err: any) {
    console.error('[Git] Diff error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stage files
app.post('/api/git/:projectId/stage', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { files } = req.body;

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    entry.lastActive = Date.now();

    const result = await gitOperations.stageFiles(entry.id, files || []);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Stage error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Unstage files
app.post('/api/git/:projectId/unstage', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { files } = req.body;

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    entry.lastActive = Date.now();

    const result = await gitOperations.unstageFiles(entry.id, files || []);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Unstage error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Commit
app.post('/api/git/:projectId/commit', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { message } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Commit message required' });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_COMMIT',
      projectId,
      details: { message: message.substring(0, 100) },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await gitOperations.commit(entry.id, message);
    if (result.success) {
      res.json({ success: true, hash: result.hash });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Commit error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Discard changes
app.post('/api/git/:projectId/discard', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { files } = req.body;

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_DISCARD',
      projectId,
      details: { fileCount: files?.length || 'all' },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await gitOperations.discardChanges(entry.id, files || []);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Discard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Initialize git repo
app.post('/api/git/:projectId/init', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_INIT',
      projectId,
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await gitOperations.initRepo(entry.id);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Init error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== End Git API ====================

// ==================== LSP API ====================

// Start LSP servers for a project (auto-detect languages)
app.post('/api/lsp/:projectId/start', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const entry = containers.get(projectId);

    if (!entry) {
      return res.status(404).json({ error: 'Container not found. Start a project first.' });
    }

    auditLog({
      userId: req.userId,
      action: 'LSP_START',
      projectId,
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    // Auto-start LSP servers for detected languages
    await lspServerManager.autoStartForContainer(entry.id, projectId);

    const status = lspServerManager.getProjectStatus(projectId);
    res.json({
      success: true,
      servers: status,
      message: `Started ${status.length} LSP server(s)`,
    });
  } catch (err: any) {
    console.error('[LSP] Start error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stop LSP servers for a project
app.post('/api/lsp/:projectId/stop', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);

    await lspServerManager.stopAllForProject(projectId);

    auditLog({
      userId: req.userId,
      action: 'LSP_STOP',
      projectId,
      ip: req.ip,
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('[LSP] Stop error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get LSP server status for a project
app.get('/api/lsp/:projectId/status', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const status = lspServerManager.getProjectStatus(projectId);

    res.json({
      success: true,
      servers: status,
    });
  } catch (err: any) {
    console.error('[LSP] Status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get available LSP server configurations
app.get('/api/lsp/configs', authenticateRequest, (req: AuthenticatedRequest, res) => {
  res.json({
    success: true,
    configs: Object.values(LSP_SERVER_CONFIGS).map(c => ({
      languageId: c.languageId,
      name: c.name,
      extensions: c.fileExtensions,
    })),
  });
});

// Send LSP request (completion, hover, definition, etc.)
app.post('/api/lsp/:projectId/request', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { filePath, method, params } = req.body;

    if (!filePath || !method) {
      return res.status(400).json({ error: 'filePath and method are required' });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    entry.lastActive = Date.now();

    // Get file extension to find the right LSP server
    const ext = '.' + filePath.split('.').pop();
    const config = getConfigForExtension(ext);

    if (!config) {
      return res.status(400).json({ error: `No LSP server available for file type: ${ext}` });
    }

    // Get or create LSP client
    const client = await lspServerManager.getClient(projectId, config.languageId);

    if (!client) {
      // Try to start the server
      await lspServerManager.startServer(entry.id, projectId, config);
      const newClient = await lspServerManager.getClient(projectId, config.languageId);

      if (!newClient) {
        return res.status(503).json({ error: `LSP server for ${config.name} is not ready` });
      }
    }

    const lspClient = await lspServerManager.getClient(projectId, config.languageId);
    if (!lspClient) {
      return res.status(503).json({ error: 'LSP client not available' });
    }

    // Send the request
    const result = await lspClient.sendRequest(method, {
      textDocument: {
        uri: `file:///workspace/${filePath}`,
      },
      ...params,
    });

    res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    console.error('[LSP] Request error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Document sync notification (for when files change)
app.post('/api/lsp/:projectId/sync', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { filePath, content, version } = req.body;

    if (!filePath || content === undefined) {
      return res.status(400).json({ error: 'filePath and content are required' });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    entry.lastActive = Date.now();

    const ext = '.' + filePath.split('.').pop();
    const config = getConfigForExtension(ext);

    if (!config) {
      return res.json({ success: true, synced: false, reason: 'No LSP for file type' });
    }

    const client = await lspServerManager.getClient(projectId, config.languageId);

    if (!client || !client.isInitialized()) {
      return res.json({ success: true, synced: false, reason: 'LSP not initialized' });
    }

    // Send didOpen or didChange notification
    client.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: `file:///workspace/${filePath}`,
        languageId: config.languageId,
        version: version || 1,
        text: content,
      },
    });

    res.json({ success: true, synced: true });
  } catch (err: any) {
    console.error('[LSP] Sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get LSP manager statistics
app.get('/api/lsp/stats', authenticateRequest, (req: AuthenticatedRequest, res) => {
  const stats = lspServerManager.getStats();
  const clientStats = lspServerManager.getStats();

  res.json({
    success: true,
    stats: {
      ...stats,
      clients: clientStats,
    },
  });
});

// ==================== End LSP API ====================

// ==================== Collaboration API ====================

// Get collaboration statistics
app.get('/api/collab/stats', authenticateRequest, (req: AuthenticatedRequest, res) => {
  try {
    const stats = getCollaborationStats();
    res.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    console.error('[Collab] Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== End Collaboration API ====================

// File sync WebSocket (real-time)
app.ws('/sync/:projectId', async (ws, req) => {
  const { projectId } = req.params;

  // Authenticate WebSocket connection
  const authSession = await authenticateWebSocket(ws, req);
  if (!authSession) return;

  const entry = containers.get(projectId);
  if (!entry) {
    ws.close(1008, 'Container not found');
    return;
  }

  const container = docker.getContainer(entry.id);

  ws.on('message', async (data) => {
    try {
      entry.lastActive = Date.now();
      const msg = JSON.parse(data.toString());

      if (msg.action === 'write') {
        const dir = msg.path.substring(0, msg.path.lastIndexOf('/'));
        if (dir) await execCommand(container, `mkdir -p "${dir}"`);
        const b64 = Buffer.from(msg.content).toString('base64');
        await execCommand(container, `echo "${b64}" | base64 -d > "${msg.path}"`);
        ws.send(JSON.stringify({ action: 'written', path: msg.path }));
      }

      if (msg.action === 'read') {
        const content = await execCommand(container, `cat "${msg.path}" 2>/dev/null || echo ""`);
        ws.send(JSON.stringify({ action: 'content', path: msg.path, content }));
      }

      if (msg.action === 'delete') {
        await execCommand(container, `rm -rf "${msg.path}"`);
        ws.send(JSON.stringify({ action: 'deleted', path: msg.path }));
      }

      if (msg.action === 'list') {
        const output = await execCommand(container, `find "${msg.path || '/workspace'}" -maxdepth 3 2>/dev/null | head -500`);
        ws.send(JSON.stringify({ action: 'files', files: output.split('\n').filter(Boolean) }));
      }
    } catch (err: any) {
      ws.send(JSON.stringify({ action: 'error', error: err.message }));
    }
  });
});

// Helper: execute command in container
async function execCommand(container: Docker.Container, cmd: string, allowTermination = false): Promise<string> {
  const exec = await container.exec({
    Cmd: ['/bin/bash', '-c', cmd],
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({});
  const output = await new Promise<string>((resolve, reject) => {
    let out = '';
    stream.on('data', (chunk: Buffer) => {
      // Docker multiplexes stdout/stderr, skip header bytes
      out += chunk.slice(8).toString();
    });
    stream.on('end', () => resolve(out.trim()));
    stream.on('error', reject);
  });

  // Check exit code
  const inspection = await exec.inspect();

  // 🔧 FIX: Exit code 143 (SIGTERM) is OK if explicitly allowed
  // This is normal when killing background processes like dev servers
  if (inspection.ExitCode === 143 && allowTermination) {
    console.log('✅ Process terminated gracefully (exit code 143)');
    return output;
  }

  if (inspection.ExitCode !== 0 && inspection.ExitCode !== null) {
    throw new Error(`Command failed with exit code ${inspection.ExitCode}: ${output}`);
  }

  return output;
}

// ==================== REPL API ====================

// Start a REPL session for a language
app.post('/api/repl/:projectId/start', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const { language } = req.body as { language: ReplLanguage };

  if (!language || !REPL_CONFIGS[language]) {
    return res.status(400).json({
      error: 'Invalid language',
      validLanguages: Object.keys(REPL_CONFIGS),
    });
  }

  const entry = containers.get(projectId);
  if (!entry) {
    return res.status(404).json({ error: 'Container not found. Create a project first.' });
  }

  try {
    entry.lastActive = Date.now();

    const { sessionId, welcomeMessage } = await replManager.startSession(
      projectId,
      entry.id,
      language
    );

    auditLog({
      userId: req.userId,
      action: 'repl-start',
      projectId,
      details: { language, sessionId },
      ip: req.ip,
    });

    res.json({
      success: true,
      sessionId,
      language,
      welcomeMessage,
      config: {
        name: REPL_CONFIGS[language].name,
        prompt: REPL_CONFIGS[language].prompt.source,
      },
    });
  } catch (err: any) {
    console.error(`[REPL] Start error for ${projectId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Execute code in a REPL session
app.post('/api/repl/:projectId/execute', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const { language, code } = req.body as { language: ReplLanguage; code: string };

  if (!language || !REPL_CONFIGS[language]) {
    return res.status(400).json({ error: 'Invalid language' });
  }

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Code is required' });
  }

  const entry = containers.get(projectId);
  if (!entry) {
    return res.status(404).json({ error: 'Container not found' });
  }

  try {
    entry.lastActive = Date.now();

    const output = await replManager.executeCode(projectId, language, code);

    res.json({
      success: true,
      output,
      language,
    });
  } catch (err: any) {
    console.error(`[REPL] Execute error for ${projectId}:`, err.message);
    res.status(500).json({
      error: err.message,
      isError: true,
    });
  }
});

// Stop a REPL session
app.post('/api/repl/:projectId/stop', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const { language } = req.body as { language: ReplLanguage };

  if (!language || !REPL_CONFIGS[language]) {
    return res.status(400).json({ error: 'Invalid language' });
  }

  try {
    await replManager.stopSession(projectId, language);

    auditLog({
      userId: req.userId,
      action: 'repl-stop',
      projectId,
      details: { language },
      ip: req.ip,
    });

    res.json({ success: true, message: `${REPL_CONFIGS[language].name} REPL stopped` });
  } catch (err: any) {
    console.error(`[REPL] Stop error for ${projectId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get REPL session status
app.get('/api/repl/:projectId/status', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const language = req.query.language as ReplLanguage | undefined;

  const entry = containers.get(projectId);
  if (!entry) {
    return res.status(404).json({ error: 'Container not found' });
  }

  try {
    if (language) {
      const session = replManager.getSession(projectId, language);
      res.json({
        success: true,
        session: session ? {
          id: session.id,
          language: session.language,
          isRunning: true,
          startedAt: session.startedAt,
          lastActive: session.lastActive,
        } : null,
      });
    } else {
      // Get all sessions for the project
      const sessions = replManager.getProjectSessions(projectId);
      res.json({
        success: true,
        sessions: sessions.map(s => ({
          id: s.id,
          language: s.language,
          isRunning: true,
          startedAt: s.startedAt,
          lastActive: s.lastActive,
        })),
      });
    }
  } catch (err: any) {
    console.error(`[REPL] Status error for ${projectId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get available REPL languages for a project
app.get('/api/repl/:projectId/languages', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);

  const entry = containers.get(projectId);
  if (!entry) {
    return res.status(404).json({ error: 'Container not found' });
  }

  try {
    const available = await replManager.getAvailableLanguages(entry.id);

    res.json({
      success: true,
      languages: available.map(lang => ({
        id: lang,
        ...REPL_CONFIGS[lang],
        prompt: REPL_CONFIGS[lang].prompt.source,
        multilinePrompt: REPL_CONFIGS[lang].multilinePrompt.source,
      })),
    });
  } catch (err: any) {
    console.error(`[REPL] Languages error for ${projectId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Cleanup idle containers
setInterval(async () => {
  const now = Date.now();
  for (const [projectId, entry] of containers) {
    if (now - entry.lastActive > IDLE_TIMEOUT) {
      try {
        const container = docker.getContainer(entry.id);
        await container.stop().catch(() => {});
        await container.remove().catch(() => {});
        releasePorts(entry.port, entry.ptyPort);
        if (entry.userId) {
          unregisterUserContainer(entry.userId, projectId);
        }
        containers.delete(projectId);
        console.log(`Cleaned up idle container: ${projectId}`);
      } catch {}
    }
  }
}, 60000); // Check every minute

// Snapshot compression and cleanup - runs every 10 minutes
const lastCompression = new Map<string, number>();
setInterval(async () => {
  const now = Date.now();
  const COMPRESSION_INTERVAL = 10 * 60 * 1000; // 10 minutes

  for (const [projectId, entry] of containers) {
    const lastCompress = lastCompression.get(projectId) || 0;

    // Only compress if container has been active and hasn't been compressed recently
    if (now - lastCompress > COMPRESSION_INTERVAL && now - entry.lastActive < IDLE_TIMEOUT) {
      try {
        // Run git gc to compress snapshots
        await snapshotManager.compress(entry.id);

        // Prune old snapshots (keep last 50)
        await snapshotManager.pruneOldSnapshots(entry.id, 50);

        lastCompression.set(projectId, now);
        console.log(`[Snapshot] Compressed and pruned snapshots for ${projectId}`);
      } catch (err) {
        // Silently ignore errors - compression is best-effort
      }
    }
  }
}, 10 * 60 * 1000); // Run every 10 minutes

// Startup sequence - cleanup THEN pool initialization (in correct order)
async function startupSequence() {
  // Step 1: Cleanup old containers FIRST
  console.log('🧹 [Startup] Cleaning up old containers...');
  try {
    console.log('🧹 [Startup] Listing containers...');
    const allContainers = await docker.listContainers({ all: true });
    console.log(`🧹 [Startup] Found ${allContainers.length} total containers`);

    const recoderContainers = allContainers.filter(c => c.Image === IMAGE_NAME);
    console.log(`🧹 [Startup] Found ${recoderContainers.length} recoder containers to clean`);

    for (const c of recoderContainers) {
      try {
        console.log(`🧹 [Startup] Removing container ${c.Id.slice(0, 12)}...`);
        const container = docker.getContainer(c.Id);
        await container.stop().catch(() => {});
        await container.remove().catch(() => {});
        console.log(`🧹 [Startup] Removed ${c.Id.slice(0, 12)}`);
      } catch (err: any) {
        console.error(`🧹 [Startup] Failed to remove ${c.Id.slice(0, 12)}:`, err.message);
      }
    }
    console.log('✅ [Startup] Cleanup complete');
  } catch (e: any) {
    console.error('❌ [Startup] Cleanup failed:', e.message);
    console.error('❌ [Startup] Full error:', e);
  }

  // Step 2: THEN initialize container pool (after cleanup is done)
  if (ENABLE_CONTAINER_POOL) {
    console.log('🚀 [Startup] Initializing container pool...');
    containerPool.setPortManager(allocatePort, releasePorts);
    try {
      await containerPool.initialize();
      console.log('✅ [Startup] Container pool ready');
    } catch (err: any) {
      console.error('❌ [Startup] Container pool initialization failed:', err.message);
    }
  }
}

// NOTE: startupSequence() is called inside app.listen() callback below

// ==================== CLI-Web Sync API ====================

// Link CLI to a project
app.post('/api/sync/:projectId/link', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const { clientId, cliVersion } = req.body;

  if (!clientId) {
    return res.status(400).json({ error: 'clientId is required' });
  }

  try {
    const link = syncManager.linkProject({
      projectId: sanitizeProjectId(projectId),
      userId: req.userId || 'anonymous',
      clientId,
      cliVersion,
    });

    auditLog({
      userId: req.userId,
      action: 'cli-sync-link',
      projectId,
      details: { clientId, cliVersion },
      ip: req.ip,
    });

    res.json({
      success: true,
      link,
      message: 'CLI linked to project successfully',
    });
  } catch (error: any) {
    console.error(`[CLI Sync] Link error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Unlink CLI from a project
app.delete('/api/sync/:projectId/unlink', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;

  try {
    const unlinked = syncManager.unlinkProject(sanitizeProjectId(projectId));

    auditLog({
      userId: req.userId,
      action: 'cli-sync-unlink',
      projectId,
      ip: req.ip,
    });

    res.json({
      success: true,
      unlinked,
      message: unlinked ? 'CLI unlinked from project' : 'Project was not linked',
    });
  } catch (error: any) {
    console.error(`[CLI Sync] Unlink error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get sync status for a project
app.get('/api/sync/:projectId/status', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const sanitizedProjectId = sanitizeProjectId(projectId);

  try {
    const entry = containers.get(sanitizedProjectId);
    let remoteFiles: Record<string, string> = {};

    // Get files from container if running
    if (entry) {
      const container = docker.getContainer(entry.id);
      try {
        // Get file list
        const fileListOutput = await execCommand(
          container,
          `find /workspace -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/.next/*' 2>/dev/null | head -500`
        );

        const files = fileListOutput.split('\n').filter(Boolean);

        // Read each file
        for (const filePath of files) {
          try {
            const content = await execCommand(container, `cat "${filePath}" 2>/dev/null`);
            const relativePath = filePath.replace('/workspace/', '');
            remoteFiles[relativePath] = content;
          } catch {
            // Skip files that can't be read
          }
        }
      } catch (error) {
        console.error(`[CLI Sync] Error reading container files: ${error}`);
      }
    }

    const status = syncManager.getSyncStatus(sanitizedProjectId, remoteFiles);

    res.json({
      success: true,
      ...status,
      containerRunning: !!entry,
      fileCount: Object.keys(remoteFiles).length,
    });
  } catch (error: any) {
    console.error(`[CLI Sync] Status error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Push files from CLI to web
app.post('/api/sync/:projectId/push', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const { files, clientId } = req.body;
  const sanitizedProjectId = sanitizeProjectId(projectId);

  if (!files || typeof files !== 'object') {
    return res.status(400).json({ error: 'files object is required' });
  }

  try {
    const entry = containers.get(sanitizedProjectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found. Start the project first.' });
    }

    const container = docker.getContainer(entry.id);

    // Get current remote files for diff
    const remoteFiles: Record<string, string> = {};
    try {
      const fileListOutput = await execCommand(
        container,
        `find /workspace -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' 2>/dev/null | head -500`
      );
      const fileList = fileListOutput.split('\n').filter(Boolean);
      for (const filePath of fileList) {
        try {
          const content = await execCommand(container, `cat "${filePath}" 2>/dev/null`);
          remoteFiles[filePath.replace('/workspace/', '')] = content;
        } catch { /* skip */ }
      }
    } catch { /* continue */ }

    // Compute diff
    const diff = diffFileSets(files, remoteFiles);

    // Apply files
    const applied = { added: 0, modified: 0, deleted: 0 };

    // Write new and modified files
    for (const path of [...diff.added, ...diff.modified]) {
      const content = files[path];
      const fullPath = `/workspace/${sanitizePath(path)}`;
      const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));

      if (dir) {
        await execCommand(container, `mkdir -p "${dir}"`);
      }

      const b64 = Buffer.from(content).toString('base64');
      await execCommand(container, `echo "${b64}" | base64 -d > "${fullPath}"`);

      if (diff.added.includes(path)) {
        applied.added++;
        syncManager.handleCliFileChange({ projectId: sanitizedProjectId, clientId, path, content });
      } else {
        applied.modified++;
        syncManager.handleCliFileChange({ projectId: sanitizedProjectId, clientId, path, content });
      }
    }

    // Delete removed files
    for (const path of diff.deleted) {
      const fullPath = `/workspace/${sanitizePath(path)}`;
      await execCommand(container, `rm -f "${fullPath}"`);
      applied.deleted++;
      syncManager.handleCliFileChange({ projectId: sanitizedProjectId, clientId, path, content: undefined });
    }

    // Update sync state
    syncManager.updateRemoteState(sanitizedProjectId, files);

    auditLog({
      userId: req.userId,
      action: 'cli-sync-push',
      projectId,
      details: { applied, totalFiles: Object.keys(files).length },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    res.json({
      success: true,
      applied,
      totalFiles: Object.keys(files).length,
      message: `Pushed ${applied.added} new, ${applied.modified} modified, ${applied.deleted} deleted files`,
    });
  } catch (error: any) {
    console.error(`[CLI Sync] Push error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Pull files from web to CLI
app.get('/api/sync/:projectId/pull', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const sanitizedProjectId = sanitizeProjectId(projectId);

  try {
    const entry = containers.get(sanitizedProjectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found. Start the project first.' });
    }

    const container = docker.getContainer(entry.id);
    const files: Record<string, string> = {};

    // Get file list
    const fileListOutput = await execCommand(
      container,
      `find /workspace -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/.next/*' -not -path '*/.vercel/*' 2>/dev/null | head -1000`
    );

    const fileList = fileListOutput.split('\n').filter(Boolean);

    // Read each file
    for (const filePath of fileList) {
      try {
        const content = await execCommand(container, `cat "${filePath}" 2>/dev/null`);
        const relativePath = filePath.replace('/workspace/', '');

        // Skip binary files (basic check)
        if (!content.includes('\x00')) {
          files[relativePath] = content;
        }
      } catch {
        // Skip files that can't be read
      }
    }

    auditLog({
      userId: req.userId,
      action: 'cli-sync-pull',
      projectId,
      details: { fileCount: Object.keys(files).length },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    res.json({
      success: true,
      files,
      fileCount: Object.keys(files).length,
    });
  } catch (error: any) {
    console.error(`[CLI Sync] Pull error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get diff between CLI files and web files
app.post('/api/sync/:projectId/diff', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const { localFiles } = req.body;
  const sanitizedProjectId = sanitizeProjectId(projectId);

  if (!localFiles || typeof localFiles !== 'object') {
    return res.status(400).json({ error: 'localFiles object is required' });
  }

  try {
    const entry = containers.get(sanitizedProjectId);
    const remoteFiles: Record<string, string> = {};

    if (entry) {
      const container = docker.getContainer(entry.id);

      // Get file list
      const fileListOutput = await execCommand(
        container,
        `find /workspace -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/.next/*' 2>/dev/null | head -500`
      );

      const fileList = fileListOutput.split('\n').filter(Boolean);

      // Read each file
      for (const filePath of fileList) {
        try {
          const content = await execCommand(container, `cat "${filePath}" 2>/dev/null`);
          remoteFiles[filePath.replace('/workspace/', '')] = content;
        } catch {
          // Skip files that can't be read
        }
      }
    }

    const diff = diffFileSets(localFiles, remoteFiles);
    const detailed = getDetailedDiff(localFiles, remoteFiles);
    const stats = getDiffStats(diff);

    // Generate unified diffs for modified files (limit to first 10)
    const unifiedDiffs: Record<string, string> = {};
    const modifiedToShow = diff.modified.slice(0, 10);
    for (const path of modifiedToShow) {
      unifiedDiffs[path] = generateUnifiedDiff(path, localFiles[path], remoteFiles[path]);
    }

    res.json({
      success: true,
      diff,
      detailed,
      stats,
      unifiedDiffs,
      containerRunning: !!entry,
    });
  } catch (error: any) {
    console.error(`[CLI Sync] Diff error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// WebSocket endpoint for live sync
const cliSyncClients = new Map<string, Set<WebSocket>>();

app.ws('/cli-sync/:projectId', async (ws, req) => {
  const { projectId } = req.params;

  // Authenticate WebSocket connection
  const authSession = await authenticateWebSocket(ws, req);
  if (!authSession) return;

  const sanitizedProjectId = sanitizeProjectId(projectId);
  const clientId = (req.query.clientId as string) || uuid();

  // Register session with authenticated userId
  const session = syncManager.registerSession({
    projectId: sanitizedProjectId,
    userId: authSession.userId,
    clientId,
  });

  // Add to clients map
  if (!cliSyncClients.has(sanitizedProjectId)) {
    cliSyncClients.set(sanitizedProjectId, new Set());
  }
  cliSyncClients.get(sanitizedProjectId)!.add(ws);

  console.log(`[CLI Sync] Client ${clientId} connected for project ${sanitizedProjectId}`);

  // Send initial status
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    projectId: sanitizedProjectId,
    timestamp: new Date().toISOString(),
  }));

  ws.on('message', async (data) => {
    try {
      syncManager.updateSessionActivity(clientId);
      const msg = JSON.parse(data.toString());

      if (msg.type === 'file-change') {
        // CLI is reporting a file change
        syncManager.handleCliFileChange({
          projectId: sanitizedProjectId,
          clientId,
          path: msg.path,
          content: msg.content,
        });

        // Broadcast to other clients
        const clients = cliSyncClients.get(sanitizedProjectId);
        if (clients) {
          const broadcast = JSON.stringify({
            type: 'file-change',
            path: msg.path,
            content: msg.content,
            source: 'cli',
            timestamp: new Date().toISOString(),
          });
          for (const client of clients) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(broadcast);
            }
          }
        }

        ws.send(JSON.stringify({ type: 'ack', id: msg.id }));
      }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      }

      if (msg.type === 'get-status') {
        const status = syncManager.getSyncStatus(sanitizedProjectId);
        ws.send(JSON.stringify({ type: 'status', ...status }));
      }
    } catch (err: any) {
      ws.send(JSON.stringify({ type: 'error', error: err.message }));
    }
  });

  ws.on('close', () => {
    syncManager.closeSession(clientId);
    const clients = cliSyncClients.get(sanitizedProjectId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        cliSyncClients.delete(sanitizedProjectId);
      }
    }
    console.log(`[CLI Sync] Client ${clientId} disconnected from project ${sanitizedProjectId}`);
  });
});

// Forward sync events to WebSocket clients
syncManager.on('sync-event', (event) => {
  const clients = cliSyncClients.get(event.projectId);
  if (clients && clients.size > 0) {
    const message = JSON.stringify({ type: 'sync-event', ...event });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
});

// ==================== End CLI-Web Sync API ====================

// ==================== MCP Server Management ====================

// Get available MCP servers (marketplace catalog)
app.get('/api/mcp/catalog', authenticateRequest, (req: AuthenticatedRequest, res) => {
  const preinstalled = Object.entries(PREINSTALLED_SERVERS).map(([id, config]) => ({
    id,
    ...config,
    preinstalled: true,
    requiresApiKey: false,
  }));

  const npxServers = Object.entries(NPX_SERVERS).map(([id, config]) => ({
    id,
    ...config,
    preinstalled: false,
    requiresApiKey: !!config.env && Object.keys(config.env).length > 0,
    requiredEnvVars: config.env ? Object.keys(config.env) : [],
  }));

  res.json({ servers: [...preinstalled, ...npxServers] });
});

// Start an MCP server for a project
app.post('/api/mcp/:projectId/start', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const { serverId, config } = req.body;

  if (!serverId) {
    return res.status(400).json({ error: 'serverId is required' });
  }

  // Build server config
  let serverConfig;
  if (PREINSTALLED_SERVERS[serverId]) {
    // Use preinstalled config (instant startup)
    serverConfig = {
      id: serverId,
      ...PREINSTALLED_SERVERS[serverId],
      env: { ...config?.env },
    };
  } else if (NPX_SERVERS[serverId]) {
    // Use npx server config (requires download on first use)
    const npxConfig = NPX_SERVERS[serverId];
    serverConfig = {
      id: serverId,
      ...npxConfig,
      env: { ...npxConfig.env, ...config?.env },
    };
  } else if (config) {
    // Custom server config
    serverConfig = {
      id: serverId,
      name: config.name || serverId,
      command: config.command,
      args: config.args || [],
      env: config.env,
    };
  } else {
    return res.status(400).json({ error: 'Invalid server configuration' });
  }

  try {
    const result = await mcpManager.startServer(projectId, serverConfig);
    if (result.success) {
      auditLog({
        userId: req.userId,
        action: 'mcp_start',
        projectId,
        details: { serverId },
      });
      res.json({ success: true, tools: result.tools });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    console.error(`[MCP] Error starting server:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Stop an MCP server
app.post('/api/mcp/:projectId/stop', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const { serverId } = req.body;

  if (!serverId) {
    return res.status(400).json({ error: 'serverId is required' });
  }

  try {
    await mcpManager.stopServer(projectId, serverId);
    auditLog({
      userId: req.userId,
      action: 'mcp_stop',
      projectId,
      details: { serverId },
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stop all MCP servers for a project
app.post('/api/mcp/:projectId/stop-all', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;

  try {
    await mcpManager.stopAllServers(projectId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get running MCP servers for a project
app.get('/api/mcp/:projectId/servers', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;

  try {
    const servers = mcpManager.getServers(projectId);
    res.json({ servers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all tools from running MCP servers
app.get('/api/mcp/:projectId/tools', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;

  try {
    const tools = mcpManager.getAllTools(projectId);
    res.json({ tools });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Call a tool on an MCP server
app.post('/api/mcp/:projectId/call', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const { serverId, toolName, args } = req.body;

  if (!serverId || !toolName) {
    return res.status(400).json({ error: 'serverId and toolName are required' });
  }

  try {
    const result = await mcpManager.callTool(projectId, serverId, toolName, args || {});
    auditLog({
      userId: req.userId,
      action: 'mcp_tool_call',
      projectId,
      details: { serverId, toolName },
    });
    res.json({ success: true, result });
  } catch (error: any) {
    console.error(`[MCP] Tool call error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== END MCP ====================

// ==================== TUNNEL DEPLOYMENT ====================
// In-memory store for active tunnels with process reference
interface TunnelInfo {
  projectId: string;
  publicUrl: string;
  localPort: number;
  status: 'starting' | 'active' | 'stopped' | 'error';
  process?: ChildProcess;
  createdAt: number;
  error?: string;
}

const activeTunnels = new Map<string, TunnelInfo>();

/**
 * Start a cloudflared quick tunnel
 * Returns a promise that resolves with the public URL
 */
async function startCloudflaredTunnel(localUrl: string): Promise<{ publicUrl: string; process: ChildProcess }> {
  return new Promise((resolve, reject) => {
    console.log(`[Tunnel] Starting cloudflared tunnel for ${localUrl}`);

    // Try to find cloudflared in common locations
    const cloudflaredPaths = [
      'cloudflared',  // In PATH
      '/usr/local/bin/cloudflared',
      '/opt/homebrew/bin/cloudflared',
      '/usr/bin/cloudflared',
    ];

    // Check if cloudflared is available
    const which = spawn('which', ['cloudflared']);
    let cloudflaredPath = 'cloudflared';

    which.stdout.on('data', (data) => {
      cloudflaredPath = data.toString().trim();
    });

    which.on('close', (code) => {
      // Start the tunnel
      const tunnelProcess = spawn(cloudflaredPath, ['tunnel', '--url', localUrl], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let publicUrl = '';
      let output = '';
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          tunnelProcess.kill();
          reject(new Error('Tunnel startup timed out after 30 seconds'));
        }
      }, 30000);

      // cloudflared outputs the URL to stderr
      tunnelProcess.stderr.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`[Tunnel] cloudflared: ${text.trim()}`);

        // Look for the trycloudflare.com URL
        const urlMatch = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (urlMatch && !resolved) {
          publicUrl = urlMatch[0];
          resolved = true;
          clearTimeout(timeout);
          console.log(`[Tunnel] Got public URL: ${publicUrl}`);
          resolve({ publicUrl, process: tunnelProcess });
        }
      });

      tunnelProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`[Tunnel] cloudflared stdout: ${text.trim()}`);

        // Sometimes URL appears in stdout
        const urlMatch = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (urlMatch && !resolved) {
          publicUrl = urlMatch[0];
          resolved = true;
          clearTimeout(timeout);
          console.log(`[Tunnel] Got public URL: ${publicUrl}`);
          resolve({ publicUrl, process: tunnelProcess });
        }
      });

      tunnelProcess.on('error', (err) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          console.error('[Tunnel] cloudflared error:', err);
          reject(new Error(`Failed to start cloudflared: ${err.message}`));
        }
      });

      tunnelProcess.on('close', (exitCode) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          console.error(`[Tunnel] cloudflared exited with code ${exitCode}`);
          reject(new Error(`cloudflared exited with code ${exitCode}. Output: ${output.slice(-500)}`));
        }
      });
    });
  });
}

// Start a tunnel to expose container's dev server to the internet
app.post('/api/tunnel/start', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  const { projectId, localPort = 5173, useCloudflared = true } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  const entry = containers.get(projectId);
  if (!entry) {
    return res.status(404).json({ error: 'Container not found. Start a project first.' });
  }

  // Check if tunnel already exists and is active
  const existing = activeTunnels.get(projectId);
  if (existing && existing.status === 'active') {
    return res.json({
      success: true,
      url: existing.publicUrl,
      expiresAt: existing.createdAt + (60 * 60 * 1000), // 1 hour
      type: 'cloudflared',
    });
  }

  // If a tunnel is starting, return pending status
  if (existing && existing.status === 'starting') {
    return res.json({
      success: true,
      status: 'starting',
      message: 'Tunnel is being created, please wait...',
    });
  }

  try {
    // Get the local URL to tunnel
    // The preview URL proxies to the container's dev server
    const BACKEND_URL = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 3100}`;
    const localUrl = `${BACKEND_URL}/preview/${projectId}`;

    // Mark as starting
    activeTunnels.set(projectId, {
      projectId,
      publicUrl: '',
      localPort,
      status: 'starting',
      createdAt: Date.now(),
    });

    if (useCloudflared) {
      // Try to use cloudflared for a true public tunnel
      try {
        const { publicUrl, process: tunnelProcess } = await startCloudflaredTunnel(localUrl);

        activeTunnels.set(projectId, {
          projectId,
          publicUrl,
          localPort,
          status: 'active',
          process: tunnelProcess,
          createdAt: Date.now(),
        });

        console.log(`[Tunnel] Started cloudflared tunnel for ${projectId}: ${publicUrl}`);

        auditLog({
          userId: req.userId,
          action: 'tunnel_start',
          projectId,
          details: { publicUrl, type: 'cloudflared' },
        });

        return res.json({
          success: true,
          url: publicUrl,
          expiresAt: Date.now() + (60 * 60 * 1000),
          type: 'cloudflared',
          message: 'Your project is now publicly accessible via Cloudflare tunnel',
        });
      } catch (cloudflaredError: any) {
        console.warn(`[Tunnel] cloudflared failed, falling back to preview URL:`, cloudflaredError.message);
        // Fall through to preview URL fallback
      }
    }

    // Fallback to preview URL (internal access only)
    const publicUrl = localUrl;

    activeTunnels.set(projectId, {
      projectId,
      publicUrl,
      localPort,
      status: 'active',
      createdAt: Date.now(),
    });

    console.log(`[Tunnel] Started preview tunnel for ${projectId}: ${publicUrl}`);

    auditLog({
      userId: req.userId,
      action: 'tunnel_start',
      projectId,
      details: { publicUrl, type: 'preview' },
    });

    res.json({
      success: true,
      url: publicUrl,
      expiresAt: Date.now() + (60 * 60 * 1000),
      type: 'preview',
      message: 'Your project is accessible at this URL (use cloudflared for public access)',
    });
  } catch (error: any) {
    console.error(`[Tunnel] Failed to start tunnel for ${projectId}:`, error);

    activeTunnels.set(projectId, {
      projectId,
      publicUrl: '',
      localPort,
      status: 'error',
      error: error.message,
      createdAt: Date.now(),
    });

    res.status(500).json({
      success: false,
      error: `Failed to start tunnel: ${error.message}`,
    });
  }
});

// Stop a tunnel
app.post('/api/tunnel/stop', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  const tunnel = activeTunnels.get(projectId);
  if (tunnel) {
    // Kill the cloudflared process if it exists
    if (tunnel.process) {
      try {
        tunnel.process.kill('SIGTERM');
        console.log(`[Tunnel] Killed cloudflared process for ${projectId}`);
      } catch (err) {
        console.warn(`[Tunnel] Failed to kill cloudflared process:`, err);
      }
    }

    tunnel.status = 'stopped';
    activeTunnels.delete(projectId);
    console.log(`[Tunnel] Stopped tunnel for ${projectId}`);
  }

  auditLog({
    userId: req.userId,
    action: 'tunnel_stop',
    projectId,
  });

  res.json({ success: true, message: 'Tunnel stopped' });
});

// Get tunnel status
app.get('/api/tunnel/status/:projectId', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;

  const tunnel = activeTunnels.get(projectId);

  res.json({
    success: true,
    tunnel: tunnel ? {
      publicUrl: tunnel.publicUrl,
      status: tunnel.status,
      createdAt: tunnel.createdAt,
      expiresAt: tunnel.createdAt + (60 * 60 * 1000),
      error: tunnel.error,
    } : null,
  });
});

// ==================== END TUNNEL ====================

// ==================== URL CLONING ====================
import { cloneWebsite } from './url-cloner.js';

// Clone a website and write files to container
app.post('/api/clone-url/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const entry = containers.get(projectId);
  if (!entry) {
    return res.status(404).json({ error: 'Container not found. Start a project first.' });
  }

  try {
    console.log(`[Clone URL] Starting clone of ${url} for project ${projectId}`);

    // Clone the website
    const website = await cloneWebsite(url);

    // Write files to the container
    const container = docker.getContainer(entry.id);

    for (const [filePath, content] of Object.entries(website.files)) {
      // Create directory if needed
      const dir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : null;
      if (dir) {
        try {
          const mkdirExec = await container.exec({
            Cmd: ['mkdir', '-p', `/workspace/${dir}`],
            AttachStdout: true,
            AttachStderr: true,
          });
          await mkdirExec.start({ Detach: false });
        } catch (e) {
          // Directory might already exist
        }
      }

      // Write file using base64 to handle special characters
      const base64Content = Buffer.from(content).toString('base64');
      const writeExec = await container.exec({
        Cmd: ['sh', '-c', `echo '${base64Content}' | base64 -d > /workspace/${filePath}`],
        AttachStdout: true,
        AttachStderr: true,
      });
      await writeExec.start({ Detach: false });
    }

    console.log(`[Clone URL] Successfully cloned ${url} - ${Object.keys(website.files).length} files written`);

    auditLog({
      userId: req.userId,
      action: 'clone_url',
      projectId,
      details: { url, title: website.title, fileCount: Object.keys(website.files).length },
    });

    res.json({
      success: true,
      title: website.title,
      url: website.url,
      files: Object.keys(website.files),
      fileCount: Object.keys(website.files).length,
      assetCount: website.assetCount,
    });
  } catch (error: any) {
    console.error(`[Clone URL] Error:`, error);
    res.status(500).json({ error: error.message || 'Failed to clone website' });
  }
});

// ==================== END URL CLONING ====================

// ==================== BROWSER AUTOMATION ====================
import {
  browserLaunch,
  browserClick,
  browserType,
  browserScreenshot,
  browserExtract,
  browserExecute,
  browserScroll,
  browserNavigate,
  browserClose,
  hasSession,
  getActiveSessions,
} from './browser-automation.js';

// Browser automation endpoint
app.post('/api/browser/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const { action, url, selector, text, script, direction } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'action is required' });
  }

  try {
    let result;

    switch (action) {
      case 'launch':
        if (!url) {
          return res.status(400).json({ error: 'url is required for launch action' });
        }
        result = await browserLaunch(projectId, url);
        break;

      case 'click':
        if (!selector) {
          return res.status(400).json({ error: 'selector is required for click action' });
        }
        result = await browserClick(projectId, selector);
        break;

      case 'type':
        if (!selector || text === undefined) {
          return res.status(400).json({ error: 'selector and text are required for type action' });
        }
        result = await browserType(projectId, selector, text);
        break;

      case 'screenshot':
        result = await browserScreenshot(projectId);
        break;

      case 'extract':
        if (!selector) {
          return res.status(400).json({ error: 'selector is required for extract action' });
        }
        result = await browserExtract(projectId, selector);
        break;

      case 'execute':
        if (!script) {
          return res.status(400).json({ error: 'script is required for execute action' });
        }
        result = await browserExecute(projectId, script);
        break;

      case 'scroll_up':
        result = await browserScroll(projectId, 'up');
        break;

      case 'scroll_down':
        result = await browserScroll(projectId, 'down');
        break;

      case 'navigate':
        if (!url) {
          return res.status(400).json({ error: 'url is required for navigate action' });
        }
        result = await browserNavigate(projectId, url);
        break;

      case 'close':
        result = await browserClose(projectId);
        break;

      case 'status':
        result = {
          success: true,
          hasSession: hasSession(projectId),
          activeSessions: getActiveSessions(),
        };
        break;

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    auditLog({
      userId: req.userId,
      action: `browser_${action}`,
      projectId,
      details: { url, selector },
    });

    res.json(result);
  } catch (error: any) {
    console.error(`[Browser] Error:`, error);
    res.status(500).json({ success: false, error: error.message || 'Browser automation failed' });
  }
});

// ==================== END BROWSER AUTOMATION ====================

// ==================== CODE INDEX (Semantic Search) ====================
import {
  indexWorkspace,
  searchCode,
  getIndexStats,
  getIndexingProgress,
  clearIndex,
  isIndexed,
} from './code-index.js';

// Index workspace
app.post('/api/code-index/:projectId/index', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const { openaiApiKey } = req.body;

  if (!openaiApiKey) {
    return res.status(400).json({ error: 'openaiApiKey is required' });
  }

  const entry = containers.get(projectId);
  if (!entry) {
    return res.status(404).json({ error: 'Container not found. Start a project first.' });
  }

  try {
    console.log(`[CodeIndex] Starting index for ${projectId}`);

    // Get workspace path from container
    const workspacePath = '/workspace'; // Standard path in containers

    // Run indexing (this may take a while for large codebases)
    const result = await indexWorkspace(projectId, workspacePath, openaiApiKey);

    auditLog({
      userId: req.userId,
      action: 'code_index',
      projectId,
      details: { filesIndexed: result.filesIndexed, blocksIndexed: result.blocksIndexed },
    });

    res.json(result);
  } catch (error: any) {
    console.error(`[CodeIndex] Error:`, error);
    res.status(500).json({ success: false, error: error.message || 'Indexing failed' });
  }
});

// Search code
app.post('/api/code-index/:projectId/search', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const { query, openaiApiKey, maxResults, directoryPrefix } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }

  if (!openaiApiKey) {
    return res.status(400).json({ error: 'openaiApiKey is required' });
  }

  try {
    const result = await searchCode(projectId, query, openaiApiKey, maxResults || 10, directoryPrefix);

    auditLog({
      userId: req.userId,
      action: 'code_search',
      projectId,
      details: { query, resultsCount: result.results?.length || 0 },
    });

    res.json(result);
  } catch (error: any) {
    console.error(`[CodeIndex] Search error:`, error);
    res.status(500).json({ success: false, error: error.message || 'Search failed' });
  }
});

// Get index status
app.get('/api/code-index/:projectId/status', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;

  try {
    const stats = getIndexStats(projectId);
    const progress = getIndexingProgress(projectId);

    res.json({
      success: true,
      stats,
      indexing: progress,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to get status' });
  }
});

// Clear index
app.delete('/api/code-index/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;

  try {
    clearIndex(projectId);

    auditLog({
      userId: req.userId,
      action: 'code_index_clear',
      projectId,
    });

    res.json({ success: true, message: 'Index cleared' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to clear index' });
  }
});

// ==================== END CODE INDEX ====================

// ==================== DATABASE EXPLORER ====================
import {
  connectionManager,
  queryExecutor,
  schemaInspector,
  type ConnectionParams,
} from './database/index.js';

// Rate limit for database operations
const databaseLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: { error: 'Too many database requests, please try again later' },
});

// Connect to a database
app.post('/api/database/:projectId/connect', databaseLimiter, authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const params = req.body as ConnectionParams;

  if (!params || !params.type) {
    return res.status(400).json({ error: 'Database connection parameters required' });
  }

  // Validate database type
  if (params.type !== 'postgresql' && params.type !== 'sqlite') {
    return res.status(400).json({ error: 'Unsupported database type. Use postgresql or sqlite.' });
  }

  try {
    // Get workspace path for SQLite path validation
    const entry = containers.get(projectId);
    const basePath = entry ? '/workspace' : '/tmp';

    const result = await connectionManager.connect(projectId, params, basePath);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    auditLog({
      userId: req.userId,
      action: 'database_connect',
      projectId,
      details: { type: params.type, connectionId: result.connectionId },
    });

    console.log(`[Database] Connected ${params.type} for project ${projectId}: ${result.connectionId}`);

    res.json({
      success: true,
      connectionId: result.connectionId,
      type: params.type,
    });
  } catch (error: any) {
    console.error('[Database] Connect error:', error);
    res.status(500).json({ success: false, error: 'Failed to connect to database' });
  }
});

// Disconnect from a database
app.delete('/api/database/:projectId/disconnect/:connectionId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId, connectionId } = req.params;

  if (!connectionId) {
    return res.status(400).json({ error: 'Connection ID required' });
  }

  try {
    const result = await connectionManager.disconnect(connectionId, projectId);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    auditLog({
      userId: req.userId,
      action: 'database_disconnect',
      projectId,
      details: { connectionId },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List active connections for a project
app.get('/api/database/:projectId/connections', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;

  try {
    const connections = connectionManager.getProjectConnections(projectId);

    res.json({
      success: true,
      connections: connections.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        createdAt: c.createdAt,
        lastUsed: c.lastUsed,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List tables in a database
app.get('/api/database/:projectId/tables', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const { connectionId, schema } = req.query;

  if (!connectionId || typeof connectionId !== 'string') {
    return res.status(400).json({ error: 'Connection ID required' });
  }

  try {
    const result = await schemaInspector.getSchemaOverview(
      connectionId,
      projectId,
      typeof schema === 'string' ? schema : undefined
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      data: result.data,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get table schema details
app.get('/api/database/:projectId/schema/:table', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId, table } = req.params;
  const { connectionId, schema } = req.query;

  if (!connectionId || typeof connectionId !== 'string') {
    return res.status(400).json({ error: 'Connection ID required' });
  }

  if (!table) {
    return res.status(400).json({ error: 'Table name required' });
  }

  try {
    const result = await schemaInspector.getTableDetails(
      connectionId,
      projectId,
      table,
      typeof schema === 'string' ? schema : undefined
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      data: result.data,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Preview table data (limited rows)
app.get('/api/database/:projectId/preview/:table', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId, table } = req.params;
  const { connectionId, schema, limit } = req.query;

  if (!connectionId || typeof connectionId !== 'string') {
    return res.status(400).json({ error: 'Connection ID required' });
  }

  if (!table) {
    return res.status(400).json({ error: 'Table name required' });
  }

  try {
    const result = await schemaInspector.previewTable(
      connectionId,
      projectId,
      table,
      typeof schema === 'string' ? schema : undefined,
      typeof limit === 'string' ? parseInt(limit, 10) : 100
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      rows: result.rows,
      columns: result.columns,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Execute a parameterized query
// SECURITY: Only accepts parameterized queries with bound values
app.post('/api/database/:projectId/query', databaseLimiter, authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const { connectionId, query, params = [], timeout, limit } = req.body;

  if (!connectionId || typeof connectionId !== 'string') {
    return res.status(400).json({ error: 'Connection ID required' });
  }

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query is required' });
  }

  // SECURITY: Ensure params is an array (for parameterized queries)
  if (!Array.isArray(params)) {
    return res.status(400).json({ error: 'Query params must be an array for parameterized queries' });
  }

  try {
    const result = await queryExecutor.execute({
      connectionId,
      projectId,
      query,
      params,
      timeout: typeof timeout === 'number' ? timeout : undefined,
      limit: typeof limit === 'number' ? limit : undefined,
    });

    auditLog({
      userId: req.userId,
      action: 'database_query',
      projectId,
      details: {
        connectionId,
        queryLength: query.length,
        paramsCount: params.length,
        success: result.success,
        rowCount: result.rowCount,
      },
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        executionTime: result.executionTime,
      });
    }

    res.json({
      success: true,
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields,
      executionTime: result.executionTime,
      truncated: result.truncated,
    });
  } catch (error: any) {
    console.error('[Database] Query error:', error);
    res.status(500).json({ success: false, error: 'Query execution failed' });
  }
});

// List available schemas (PostgreSQL only)
app.get('/api/database/:projectId/schemas', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const { connectionId } = req.query;

  if (!connectionId || typeof connectionId !== 'string') {
    return res.status(400).json({ error: 'Connection ID required' });
  }

  try {
    const result = await schemaInspector.listSchemas(connectionId, projectId);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      schemas: result.schemas,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get database connection statistics
app.get('/api/database/stats', authenticateRequest, (req: AuthenticatedRequest, res) => {
  try {
    const connectionStats = connectionManager.getStats();
    const queryStats = queryExecutor.getStats();

    res.json({
      success: true,
      connections: connectionStats,
      queries: queryStats,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== END DATABASE EXPLORER ====================

// ==================== DEBUG ADAPTER PROTOCOL (DAP) ====================

import {
  debugManager,
  type DebugLanguage,
  type DebugConfig,
  type SourceBreakpoint,
  type DebugEvent,
} from './debug/index.js';

// Track debug event WebSocket clients per project
const debugEventClients = new Map<string, Set<WebSocket>>();

// Forward debug events to WebSocket clients
debugManager.on('debugEvent', (event: DebugEvent) => {
  const session = debugManager.getSession(event.sessionId);
  if (!session) return;

  const clients = debugEventClients.get(session.projectId);
  if (clients && clients.size > 0) {
    const message = JSON.stringify({
      type: 'debug-event',
      event: event.type,
      sessionId: event.sessionId,
      body: event.body,
      timestamp: new Date().toISOString(),
    });

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
});

// Start debug session
app.post('/api/debug/:projectId/start', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { language, program, args, cwd, env, stopOnEntry } = req.body;

    // Validate required fields
    if (!language || typeof language !== 'string') {
      return res.status(400).json({ error: 'language is required (javascript, typescript, python, go, rust)' });
    }

    if (!program || typeof program !== 'string') {
      return res.status(400).json({ error: 'program is required (path to file to debug)' });
    }

    const validLanguages: DebugLanguage[] = ['javascript', 'typescript', 'python', 'go', 'rust'];
    if (!validLanguages.includes(language as DebugLanguage)) {
      return res.status(400).json({ error: `Invalid language. Must be one of: ${validLanguages.join(', ')}` });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found. Start a project first.' });
    }

    auditLog({
      userId: req.userId,
      action: 'DEBUG_START',
      projectId,
      details: { language, program },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const config: DebugConfig = {
      language: language as DebugLanguage,
      program: sanitizePath(program),
      args: Array.isArray(args) ? args.map(String) : undefined,
      cwd: cwd ? sanitizePath(cwd) : '/workspace',
      env: env && typeof env === 'object' ? env : undefined,
      stopOnEntry: Boolean(stopOnEntry),
    };

    const session = await debugManager.startSession(projectId, entry.id, config);

    res.json({
      success: true,
      sessionId: session.id,
      language: session.language,
      state: session.state,
      port: session.port,
    });
  } catch (err: any) {
    console.error('[Debug] Start error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stop debug session
app.post('/api/debug/:projectId/stop', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { sessionId } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = debugManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Debug session not found' });
    }

    if (session.projectId !== projectId) {
      return res.status(403).json({ error: 'Session does not belong to this project' });
    }

    auditLog({
      userId: req.userId,
      action: 'DEBUG_STOP',
      projectId,
      details: { sessionId },
      ip: req.ip,
    });

    await debugManager.terminateSession(sessionId);

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Debug] Stop error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Restart debug session
app.post('/api/debug/:projectId/restart', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { sessionId } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = debugManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Debug session not found' });
    }

    if (session.projectId !== projectId) {
      return res.status(403).json({ error: 'Session does not belong to this project' });
    }

    auditLog({
      userId: req.userId,
      action: 'DEBUG_RESTART',
      projectId,
      details: { sessionId },
      ip: req.ip,
    });

    await debugManager.restart(sessionId);

    res.json({
      success: true,
      session: {
        id: session.id,
        language: session.language,
        state: session.state,
      },
    });
  } catch (err: any) {
    console.error('[Debug] Restart error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List debug sessions for a project
app.get('/api/debug/:projectId/sessions', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const sessions = debugManager.getProjectSessions(projectId);

    res.json({
      success: true,
      sessions: sessions.map(s => ({
        id: s.id,
        language: s.language,
        state: s.state,
        program: s.config.program,
        createdAt: s.createdAt.toISOString(),
        lastActivity: s.lastActivity.toISOString(),
      })),
    });
  } catch (err: any) {
    console.error('[Debug] Sessions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Set breakpoints
app.post('/api/debug/:projectId/breakpoints', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { sessionId, filePath, breakpoints } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'filePath is required' });
    }

    if (!Array.isArray(breakpoints)) {
      return res.status(400).json({ error: 'breakpoints must be an array' });
    }

    const session = debugManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Debug session not found' });
    }

    if (session.projectId !== projectId) {
      return res.status(403).json({ error: 'Session does not belong to this project' });
    }

    // Validate breakpoint format
    const sourceBreakpoints: SourceBreakpoint[] = breakpoints.map((bp: any) => {
      if (typeof bp.line !== 'number') {
        throw new Error('Each breakpoint must have a line number');
      }
      return {
        line: bp.line,
        column: typeof bp.column === 'number' ? bp.column : undefined,
        condition: typeof bp.condition === 'string' ? bp.condition : undefined,
        hitCondition: typeof bp.hitCondition === 'string' ? bp.hitCondition : undefined,
        logMessage: typeof bp.logMessage === 'string' ? bp.logMessage : undefined,
      };
    });

    const verified = await debugManager.setBreakpoints(sessionId, sanitizePath(filePath), sourceBreakpoints);

    res.json({
      success: true,
      breakpoints: verified,
    });
  } catch (err: any) {
    console.error('[Debug] Breakpoints error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Clear breakpoints
app.delete('/api/debug/:projectId/breakpoints', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { sessionId, filePath } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'filePath is required' });
    }

    const session = debugManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Debug session not found' });
    }

    if (session.projectId !== projectId) {
      return res.status(403).json({ error: 'Session does not belong to this project' });
    }

    await debugManager.clearBreakpoints(sessionId, sanitizePath(filePath));

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Debug] Clear breakpoints error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Continue execution
app.post('/api/debug/:projectId/continue', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { sessionId, threadId } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = debugManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Debug session not found' });
    }

    if (session.projectId !== projectId) {
      return res.status(403).json({ error: 'Session does not belong to this project' });
    }

    await debugManager.continue(sessionId, typeof threadId === 'number' ? threadId : undefined);

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Debug] Continue error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Step over
app.post('/api/debug/:projectId/stepOver', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { sessionId, threadId } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = debugManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Debug session not found' });
    }

    if (session.projectId !== projectId) {
      return res.status(403).json({ error: 'Session does not belong to this project' });
    }

    await debugManager.stepOver(sessionId, typeof threadId === 'number' ? threadId : undefined);

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Debug] Step over error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Step into
app.post('/api/debug/:projectId/stepInto', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { sessionId, threadId } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = debugManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Debug session not found' });
    }

    if (session.projectId !== projectId) {
      return res.status(403).json({ error: 'Session does not belong to this project' });
    }

    await debugManager.stepInto(sessionId, typeof threadId === 'number' ? threadId : undefined);

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Debug] Step into error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Step out
app.post('/api/debug/:projectId/stepOut', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { sessionId, threadId } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = debugManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Debug session not found' });
    }

    if (session.projectId !== projectId) {
      return res.status(403).json({ error: 'Session does not belong to this project' });
    }

    await debugManager.stepOut(sessionId, typeof threadId === 'number' ? threadId : undefined);

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Debug] Step out error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Pause execution
app.post('/api/debug/:projectId/pause', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { sessionId, threadId } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = debugManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Debug session not found' });
    }

    if (session.projectId !== projectId) {
      return res.status(403).json({ error: 'Session does not belong to this project' });
    }

    await debugManager.pause(sessionId, typeof threadId === 'number' ? threadId : undefined);

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Debug] Pause error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get threads
app.get('/api/debug/:projectId/threads', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId query parameter is required' });
    }

    const session = debugManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Debug session not found' });
    }

    if (session.projectId !== projectId) {
      return res.status(403).json({ error: 'Session does not belong to this project' });
    }

    const threads = await debugManager.getThreads(sessionId);

    res.json({
      success: true,
      threads,
    });
  } catch (err: any) {
    console.error('[Debug] Threads error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get stack trace
app.get('/api/debug/:projectId/stacktrace', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { sessionId, threadId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId query parameter is required' });
    }

    if (!threadId || isNaN(Number(threadId))) {
      return res.status(400).json({ error: 'threadId query parameter is required (number)' });
    }

    const session = debugManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Debug session not found' });
    }

    if (session.projectId !== projectId) {
      return res.status(403).json({ error: 'Session does not belong to this project' });
    }

    const stackFrames = await debugManager.getStackTrace(sessionId, Number(threadId));

    res.json({
      success: true,
      stackFrames,
    });
  } catch (err: any) {
    console.error('[Debug] Stack trace error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get scopes
app.get('/api/debug/:projectId/scopes', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { sessionId, frameId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId query parameter is required' });
    }

    if (!frameId || isNaN(Number(frameId))) {
      return res.status(400).json({ error: 'frameId query parameter is required (number)' });
    }

    const session = debugManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Debug session not found' });
    }

    if (session.projectId !== projectId) {
      return res.status(403).json({ error: 'Session does not belong to this project' });
    }

    const scopes = await debugManager.getScopes(sessionId, Number(frameId));

    res.json({
      success: true,
      scopes,
    });
  } catch (err: any) {
    console.error('[Debug] Scopes error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get variables
app.get('/api/debug/:projectId/variables', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { sessionId, variablesReference } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId query parameter is required' });
    }

    if (!variablesReference || isNaN(Number(variablesReference))) {
      return res.status(400).json({ error: 'variablesReference query parameter is required (number)' });
    }

    const session = debugManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Debug session not found' });
    }

    if (session.projectId !== projectId) {
      return res.status(403).json({ error: 'Session does not belong to this project' });
    }

    const variables = await debugManager.getVariables(sessionId, Number(variablesReference));

    res.json({
      success: true,
      variables,
    });
  } catch (err: any) {
    console.error('[Debug] Variables error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Evaluate expression
app.post('/api/debug/:projectId/evaluate', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { sessionId, expression, frameId, context } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!expression || typeof expression !== 'string') {
      return res.status(400).json({ error: 'expression is required' });
    }

    const session = debugManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Debug session not found' });
    }

    if (session.projectId !== projectId) {
      return res.status(403).json({ error: 'Session does not belong to this project' });
    }

    const validContexts = ['watch', 'repl', 'hover'];
    const evalContext = validContexts.includes(context) ? context : 'repl';

    const result = await debugManager.evaluate(
      sessionId,
      expression,
      typeof frameId === 'number' ? frameId : undefined,
      evalContext as 'watch' | 'repl' | 'hover'
    );

    res.json({
      success: true,
      result: result.result,
      type: result.type,
      variablesReference: result.variablesReference,
    });
  } catch (err: any) {
    console.error('[Debug] Evaluate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get debug manager stats
app.get('/api/debug/stats', authenticateRequest, (req: AuthenticatedRequest, res) => {
  try {
    const stats = debugManager.getStats();
    res.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    console.error('[Debug] Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// WebSocket endpoint for real-time debug events
app.ws('/api/debug/:projectId/events', async (ws, req) => {
  // Authenticate WebSocket connection
  const authSession = await authenticateWebSocket(ws, req);
  if (!authSession) return;

  const projectId = sanitizeProjectId(req.params.projectId);
  const entry = containers.get(projectId);

  if (!entry) {
    ws.close(1008, 'Container not found');
    return;
  }

  console.log(`[Debug] WebSocket connected for ${projectId} [user: ${authSession.userId}]`);

  // Add client to event listeners
  if (!debugEventClients.has(projectId)) {
    debugEventClients.set(projectId, new Set());
  }
  debugEventClients.get(projectId)!.add(ws as any);

  // Send current sessions info
  const sessions = debugManager.getProjectSessions(projectId);
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'sessions',
      sessions: sessions.map(s => ({
        id: s.id,
        language: s.language,
        state: s.state,
        program: s.config.program,
      })),
    }));
  }

  // Handle incoming messages (e.g., subscribe to specific session)
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'ping':
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          break;

        case 'subscribe':
          // Client wants to subscribe to a specific session
          // Already subscribed to all project events
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'subscribed', sessionId: message.sessionId }));
          }
          break;
      }
    } catch (err) {
      console.error('[Debug WS] Message parse error:', err);
    }
  });

  ws.on('close', () => {
    const clients = debugEventClients.get(projectId);
    if (clients) {
      clients.delete(ws as any);
      if (clients.size === 0) {
        debugEventClients.delete(projectId);
      }
    }
    console.log(`[Debug] WebSocket disconnected for ${projectId}`);
  });

  ws.on('error', (err) => {
    console.error(`[Debug WS] Error for ${projectId}:`, err.message);
  });
});

// ==================== END DEBUG ADAPTER PROTOCOL ====================

// Import and setup preview proxy
import { setupPreviewProxy } from './preview';
setupPreviewProxy(app as any, containers);

// File Watch WebSocket - notifies frontend of file changes from CLI tools
const fileWatchClients = new Map<string, Set<WebSocket>>();

app.ws('/watch/:projectId', async (ws, req) => {
  const { projectId } = req.params;

  // Authenticate WebSocket connection
  const authSession = await authenticateWebSocket(ws, req);
  if (!authSession) return;

  const entry = containers.get(projectId);

  if (!entry) {
    ws.close(1008, 'Container not found');
    return;
  }

  // Add client to watch list
  if (!fileWatchClients.has(projectId)) {
    fileWatchClients.set(projectId, new Set());
  }
  fileWatchClients.get(projectId)!.add(ws as any);

  // Start file watcher for this project if not already running
  fileWatcher.startWatching(entry.id, projectId);

  console.log(`[FileWatch] Client connected for ${projectId} [user: ${authSession.userId}]`);

  ws.on('close', () => {
    const clients = fileWatchClients.get(projectId);
    if (clients) {
      clients.delete(ws as any);
      if (clients.size === 0) {
        fileWatcher.stopWatching(projectId);
        fileWatchClients.delete(projectId);
      }
    }
    console.log(`[FileWatch] Client disconnected for ${projectId}`);
  });
});

// Forward file watcher events to WebSocket clients
fileWatcher.on('changes', ({ projectId, changes }) => {
  const clients = fileWatchClients.get(projectId);
  if (clients && clients.size > 0) {
    const message = JSON.stringify({ type: 'file-changes', changes });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
});

// ==================== MOBILE API ENDPOINTS ====================

// Mobile API dependencies - connect to existing services
const mobileApiDependencies: MobileApiDependencies = {
  // Fetch projects for a user
  fetchUserProjects: async (userId, options) => {
    // In production, this would query the database via the main app API
    // For now, we return an empty list as projects are managed by the main app
    console.log(`[Mobile] Fetching projects for user ${userId}`, options);
    try {
      const response = await fetch(`${APP_API_URL}/api/projects`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(INTERNAL_SERVICE_KEY ? { 'X-Internal-Service-Key': INTERNAL_SERVICE_KEY } : {}),
          'X-User-Id': userId,
        },
      });

      if (!response.ok) {
        console.log(`[Mobile] Failed to fetch projects: ${response.status}`);
        return { projects: [], total: 0 };
      }

      const data = await response.json() as { projects: Record<string, unknown>[]; total: number };
      return { projects: data.projects || [], total: data.total || 0 };
    } catch (error) {
      console.error(`[Mobile] Error fetching projects:`, error);
      return { projects: [], total: 0 };
    }
  },

  // Fetch single project details
  fetchProjectDetail: async (userId, projectId) => {
    console.log(`[Mobile] Fetching project detail for ${projectId}`);
    try {
      const response = await fetch(`${APP_API_URL}/api/projects/${projectId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(INTERNAL_SERVICE_KEY ? { 'X-Internal-Service-Key': INTERNAL_SERVICE_KEY } : {}),
          'X-User-Id': userId,
        },
      });

      if (!response.ok) {
        console.log(`[Mobile] Failed to fetch project detail: ${response.status}`);
        return null;
      }

      const data = await response.json() as Record<string, unknown>;
      return data;
    } catch (error) {
      console.error(`[Mobile] Error fetching project detail:`, error);
      return null;
    }
  },

  // Fetch project files
  fetchProjectFiles: async (userId, projectId, path) => {
    console.log(`[Mobile] Fetching files for project ${projectId}, path: ${path || '/'}`);
    const entry = containers.get(projectId);
    if (!entry) {
      return [];
    }

    try {
      const targetPath = path ? `/workspace/${path}` : '/workspace';
      const result = await execInContainer(
        entry.id,
        `find ${targetPath} -maxdepth 1 -type f -o -type d 2>/dev/null | head -500`
      );

      const files = result.split('\n').filter(Boolean).map(filePath => {
        const isDirectory = !filePath.includes('.');
        const name = filePath.split('/').pop() || '';
        return {
          path: filePath.replace('/workspace/', ''),
          name,
          type: isDirectory ? 'directory' : 'file',
          modifiedAt: Date.now(),
        };
      });

      return files;
    } catch (error) {
      console.error(`[Mobile] Error fetching files:`, error);
      return [];
    }
  },

  // Check project ownership
  checkProjectOwnership: async (userId, projectId) => {
    return checkProjectOwnership(userId, projectId);
  },

  // Get container for project
  getContainer: (projectId) => {
    const entry = containers.get(projectId);
    if (!entry) {
      return undefined;
    }
    return { id: entry.id, port: entry.port };
  },

  // Execute command in container
  execInContainer: async (containerId, command) => {
    return execInContainer(containerId, command);
  },
};

// Initialize mobile API
const mobileApiConfig = {
  fcmServerKey: process.env.FCM_SERVER_KEY,
  apnsConfig: process.env.APNS_KEY_ID ? {
    keyId: process.env.APNS_KEY_ID,
    teamId: process.env.APNS_TEAM_ID || '',
    bundleId: process.env.APNS_BUNDLE_ID || '',
    key: process.env.APNS_KEY || '',
  } : undefined,
};

initializeMobileApi(mobileApiConfig);

// Create and mount mobile API router
const mobileRouter = createMobileApiRouter(mobileApiDependencies);
app.use('/api/mobile', mobileRouter);

console.log('[Mobile] API endpoints mounted at /api/mobile');

// Mobile API stats endpoint
app.get('/api/mobile/stats', authenticateRequest, (req: AuthenticatedRequest, res) => {
  try {
    const stats = getMobileApiStats();
    res.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    console.error('[Mobile] Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== END MOBILE API ENDPOINTS ====================

// ==================== Enterprise Organization API ====================

/**
 * Helper to build audit actor from request
 */
function buildAuditActor(req: AuthenticatedRequest): { id: string; type: 'user'; email?: string; ipAddress?: string; userAgent?: string } {
  return {
    id: req.userId || 'anonymous',
    type: 'user' as const,
    ipAddress: req.ip || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
  };
}

// List organizations for current user
app.get('/api/organizations', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const organizations = listUserOrganizations(userId);
  sendSuccess(res, { organizations });
}));

// Create organization
app.post('/api/organizations', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { name, slug, settings } = req.body as CreateOrganizationInput;

  const organization = createOrganization({
    name,
    slug,
    ownerId: userId,
    settings,
  });

  // Log audit event
  logOrganizationAction(
    organization.id,
    AuditAction.ORG_CREATED,
    buildAuditActor(req),
    organization.name
  );

  sendSuccess(res, { organization }, { statusCode: 201 });
}));

// Get organization by ID
app.get('/api/organizations/:orgId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const organization = getOrganization(orgId, userId);

  sendSuccess(res, { organization });
}));

// Update organization
app.put('/api/organizations/:orgId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const input = req.body as UpdateOrganizationInput;

  const oldOrg = getOrganization(orgId, userId);
  const organization = updateOrganization(orgId, userId, input);

  // Log audit event
  logOrganizationAction(
    organization.id,
    AuditAction.ORG_UPDATED,
    buildAuditActor(req),
    organization.name,
    [
      ...(input.name && input.name !== oldOrg.name ? [{ field: 'name', oldValue: oldOrg.name, newValue: input.name }] : []),
      ...(input.slug && input.slug !== oldOrg.slug ? [{ field: 'slug', oldValue: oldOrg.slug, newValue: input.slug }] : []),
    ]
  );

  sendSuccess(res, { organization });
}));

// Delete organization
app.delete('/api/organizations/:orgId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const org = getOrganization(orgId, userId);

  deleteOrganization(orgId, userId);

  // Log audit event
  logOrganizationAction(
    orgId,
    AuditAction.ORG_DELETED,
    buildAuditActor(req),
    org.name
  );

  sendSuccess(res, { message: 'Organization deleted' });
}));

// Transfer organization ownership
app.post('/api/organizations/:orgId/transfer', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const { newOwnerId } = req.body as { newOwnerId: string };

  if (!newOwnerId) {
    return sendError(res, ErrorCode.MISSING_REQUIRED_FIELD, { message: 'newOwnerId is required' });
  }

  transferOwnership(orgId, userId, newOwnerId);

  // Log audit event
  logOrganizationAction(
    orgId,
    AuditAction.ORG_OWNERSHIP_TRANSFERRED,
    buildAuditActor(req),
    undefined,
    [{ field: 'ownerId', oldValue: userId, newValue: newOwnerId }]
  );

  sendSuccess(res, { message: 'Ownership transferred successfully' });
}));

// Get organization settings
app.get('/api/organizations/:orgId/settings', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const organization = getOrganization(orgId, userId);

  sendSuccess(res, { settings: organization.settings });
}));

// Update organization settings
app.put('/api/organizations/:orgId/settings', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const newSettings = req.body as Partial<OrganizationSettings>;

  const oldOrg = getOrganization(orgId, userId);
  const organization = updateOrganization(orgId, userId, { settings: newSettings });

  // Log audit event for settings change
  logOrganizationAction(
    organization.id,
    AuditAction.ORG_SETTINGS_UPDATED,
    buildAuditActor(req),
    organization.name,
    calculateChanges(oldOrg.settings as Record<string, unknown>, organization.settings as Record<string, unknown>)
  );

  sendSuccess(res, { settings: organization.settings });
}));

// Get organization activity log
app.get('/api/organizations/:orgId/activity', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const { limit, offset, actions, actorIds, startDate, endDate } = req.query;

  // Parse query parameters
  const query: Omit<AuditLogQuery, 'orgId'> = {
    limit: limit ? parseInt(limit as string, 10) : 50,
    offset: offset ? parseInt(offset as string, 10) : 0,
    sortOrder: 'desc',
  };

  if (actions) {
    query.actions = (actions as string).split(',') as AuditAction[];
  }
  if (actorIds) {
    query.actorIds = (actorIds as string).split(',');
  }
  if (startDate) {
    query.startDate = new Date(startDate as string);
  }
  if (endDate) {
    query.endDate = new Date(endDate as string);
  }

  const result = queryAuditLogs(orgId, userId, query);

  sendSuccess(res, {
    activity: result.entries,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    hasMore: result.hasMore,
  });
}));

// ==================== Teams API ====================

// List teams in organization
app.get('/api/organizations/:orgId/teams', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const teams = listTeams(orgId, userId);

  sendSuccess(res, { teams });
}));

// Create team
app.post('/api/organizations/:orgId/teams', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const input = req.body as CreateTeamInput;

  const team = createTeam(orgId, userId, input);

  // Log audit event
  logTeamAction(
    orgId,
    AuditAction.TEAM_CREATED,
    buildAuditActor(req),
    team.id,
    team.name
  );

  sendSuccess(res, { team }, { statusCode: 201 });
}));

// Get team
app.get('/api/organizations/:orgId/teams/:teamId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { teamId } = req.params;
  const team = getTeam(teamId, userId);

  sendSuccess(res, { team });
}));

// Update team
app.put('/api/organizations/:orgId/teams/:teamId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId, teamId } = req.params;
  const input = req.body as UpdateTeamInput;

  const oldTeam = getTeam(teamId, userId);
  const team = updateTeam(teamId, userId, input);

  // Log audit event
  logTeamAction(
    orgId,
    AuditAction.TEAM_UPDATED,
    buildAuditActor(req),
    team.id,
    team.name,
    [
      ...(input.name && input.name !== oldTeam.name ? [{ field: 'name', oldValue: oldTeam.name, newValue: input.name }] : []),
      ...(input.description !== undefined && input.description !== oldTeam.description ? [{ field: 'description', oldValue: oldTeam.description, newValue: input.description }] : []),
    ]
  );

  sendSuccess(res, { team });
}));

// Delete team
app.delete('/api/organizations/:orgId/teams/:teamId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId, teamId } = req.params;
  const team = getTeam(teamId, userId);

  deleteTeam(teamId, userId);

  // Log audit event
  logTeamAction(
    orgId,
    AuditAction.TEAM_DELETED,
    buildAuditActor(req),
    teamId,
    team.name
  );

  sendSuccess(res, { message: 'Team deleted' });
}));

// Add member to team
app.post('/api/organizations/:orgId/teams/:teamId/members', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId, teamId } = req.params;
  const { targetUserId, role } = req.body as { targetUserId: string; role?: 'lead' | 'member' };

  if (!targetUserId) {
    return sendError(res, ErrorCode.MISSING_REQUIRED_FIELD, { message: 'targetUserId is required' });
  }

  const team = addTeamMember(teamId, userId, targetUserId, role);

  // Log audit event
  logTeamAction(
    orgId,
    AuditAction.TEAM_MEMBER_ADDED,
    buildAuditActor(req),
    teamId,
    team.name,
    undefined,
    { targetUserId, role: role || 'member' }
  );

  sendSuccess(res, { team });
}));

// Remove member from team
app.delete('/api/organizations/:orgId/teams/:teamId/members/:targetUserId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId, teamId, targetUserId } = req.params;
  const team = removeTeamMember(teamId, userId, targetUserId);

  // Log audit event
  logTeamAction(
    orgId,
    AuditAction.TEAM_MEMBER_REMOVED,
    buildAuditActor(req),
    teamId,
    team.name,
    undefined,
    { targetUserId }
  );

  sendSuccess(res, { team });
}));

// ==================== Members API ====================

// List organization members
app.get('/api/organizations/:orgId/members', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const members = listMembers(orgId, userId);

  sendSuccess(res, { members });
}));

// Get specific member
app.get('/api/organizations/:orgId/members/:targetUserId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId, targetUserId } = req.params;
  const member = getMember(orgId, userId, targetUserId);

  sendSuccess(res, { member });
}));

// Update member role
app.put('/api/organizations/:orgId/members/:targetUserId/role', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId, targetUserId } = req.params;
  const { role } = req.body as { role: OrganizationRole };

  if (!role || !Object.values(OrganizationRole).includes(role)) {
    return sendError(res, ErrorCode.INVALID_INPUT, { message: 'Invalid role' });
  }

  const oldMember = getMember(orgId, userId, targetUserId);
  const member = updateMemberRole(orgId, userId, targetUserId, role);

  // Log audit event
  logMemberAction(
    orgId,
    AuditAction.MEMBER_ROLE_CHANGED,
    buildAuditActor(req),
    member.id,
    member.email,
    [{ field: 'role', oldValue: oldMember.role, newValue: role }]
  );

  sendSuccess(res, { member });
}));

// Remove member from organization
app.delete('/api/organizations/:orgId/members/:targetUserId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId, targetUserId } = req.params;
  const member = getMember(orgId, userId, targetUserId);

  removeMember(orgId, userId, targetUserId);

  // Log audit event
  logMemberAction(
    orgId,
    AuditAction.MEMBER_REMOVED,
    buildAuditActor(req),
    member.id,
    member.email
  );

  sendSuccess(res, { message: 'Member removed' });
}));

// ==================== Invitations API ====================

// List invitations
app.get('/api/organizations/:orgId/invitations', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const { status } = req.query as { status?: 'pending' | 'accepted' | 'expired' | 'revoked' };

  const invitations = listInvitations(orgId, userId, status);

  sendSuccess(res, { invitations });
}));

// Create invitation
app.post('/api/organizations/:orgId/invitations', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const input = req.body as CreateInvitationInput;

  // Check member limits before creating invitation
  enforceMemberLimit(orgId, 1);

  const invitation = createInvitation(orgId, userId, input);

  // Log audit event
  logInvitationAction(
    orgId,
    AuditAction.INVITATION_CREATED,
    buildAuditActor(req),
    invitation.id,
    invitation.email,
    { role: input.role, teamIds: input.teamIds }
  );

  sendSuccess(res, { invitation }, { statusCode: 201 });
}));

// Accept invitation (public endpoint - uses token)
app.post('/api/invitations/:token/accept', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { token } = req.params;
  const { email, displayName } = req.body as { email: string; displayName?: string };

  if (!email) {
    return sendError(res, ErrorCode.MISSING_REQUIRED_FIELD, { message: 'email is required' });
  }

  const member = acceptInvitation(token, userId, email, displayName);

  // Log audit event
  logMemberAction(
    member.orgId,
    AuditAction.MEMBER_JOINED,
    buildAuditActor(req),
    member.id,
    member.email
  );

  sendSuccess(res, { member });
}));

// Revoke invitation
app.delete('/api/organizations/:orgId/invitations/:invitationId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId, invitationId } = req.params;

  revokeInvitation(orgId, userId, invitationId);

  // Log audit event
  logInvitationAction(
    orgId,
    AuditAction.INVITATION_REVOKED,
    buildAuditActor(req),
    invitationId
  );

  sendSuccess(res, { message: 'Invitation revoked' });
}));

// Resend invitation
app.post('/api/organizations/:orgId/invitations/:invitationId/resend', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId, invitationId } = req.params;

  const invitation = resendInvitation(orgId, userId, invitationId);

  // Log audit event
  logInvitationAction(
    orgId,
    AuditAction.INVITATION_RESENT,
    buildAuditActor(req),
    invitation.id,
    invitation.email
  );

  sendSuccess(res, { invitation });
}));

// ==================== Audit Log API ====================

// Query audit logs
app.get('/api/organizations/:orgId/audit-log', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const {
    startDate,
    endDate,
    actions,
    actorIds,
    resourceTypes,
    severity,
    success,
    searchText,
    limit,
    offset,
    sortOrder,
  } = req.query as Record<string, string | undefined>;

  const query: Omit<AuditLogQuery, 'orgId'> = {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    actions: actions ? (actions.split(',') as AuditAction[]) : undefined,
    actorIds: actorIds ? actorIds.split(',') : undefined,
    resourceTypes: resourceTypes ? (resourceTypes.split(',') as AuditResourceType[]) : undefined,
    severity: severity ? (severity.split(',') as any[]) : undefined,
    success: success !== undefined ? success === 'true' : undefined,
    searchText,
    limit: limit ? parseInt(limit, 10) : undefined,
    offset: offset ? parseInt(offset, 10) : undefined,
    sortOrder: sortOrder as 'asc' | 'desc' | undefined,
  };

  const result = queryAuditLogs(orgId, userId, query);

  sendSuccess(res, result);
}));

// Get audit stats
app.get('/api/organizations/:orgId/audit-log/stats', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

  const stats = getAuditStats(
    orgId,
    userId,
    startDate ? new Date(startDate) : undefined,
    endDate ? new Date(endDate) : undefined
  );

  sendSuccess(res, { stats });
}));

// Export audit logs
app.get('/api/organizations/:orgId/audit-log/export', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const { startDate, endDate, format } = req.query as { startDate: string; endDate: string; format?: 'json' | 'csv' };

  if (!startDate || !endDate) {
    return sendError(res, ErrorCode.MISSING_REQUIRED_FIELD, { message: 'startDate and endDate are required' });
  }

  const result = exportAuditLogs(
    orgId,
    userId,
    new Date(startDate),
    new Date(endDate),
    format || 'json'
  );

  res.setHeader('Content-Type', result.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.send(result.data);
}));

// ==================== Billing API ====================

// Get subscription
app.get('/api/organizations/:orgId/subscription', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const subscription = getSubscription(orgId, userId);

  sendSuccess(res, { subscription });
}));

// Get usage snapshot
app.get('/api/organizations/:orgId/usage', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const usage = getUsageSnapshot(orgId, userId);

  sendSuccess(res, { usage });
}));

// Get usage history for a metric
app.get('/api/organizations/:orgId/usage/history/:metric', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId, metric } = req.params;
  const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

  if (!Object.values(UsageMetric).includes(metric as UsageMetric)) {
    return sendError(res, ErrorCode.INVALID_INPUT, { message: 'Invalid metric' });
  }

  const history = getUsageHistory(
    orgId,
    userId,
    metric as UsageMetric,
    startDate ? new Date(startDate) : undefined,
    endDate ? new Date(endDate) : undefined
  );

  sendSuccess(res, { history });
}));

// Update seats
app.post('/api/organizations/:orgId/subscription/seats', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const seatChange = req.body as SeatChangeRequest;

  if (!seatChange.type || !['add', 'remove'].includes(seatChange.type)) {
    return sendError(res, ErrorCode.INVALID_INPUT, { message: 'type must be "add" or "remove"' });
  }
  if (!seatChange.count || seatChange.count < 1) {
    return sendError(res, ErrorCode.INVALID_INPUT, { message: 'count must be at least 1' });
  }

  const subscription = updateSeats(orgId, userId, seatChange);

  sendSuccess(res, { subscription });
}));

// Upgrade tier
app.post('/api/organizations/:orgId/subscription/upgrade', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const { tier, cycle } = req.body as { tier: SubscriptionTier; cycle?: BillingCycle };

  if (!tier || !Object.values(SubscriptionTier).includes(tier)) {
    return sendError(res, ErrorCode.INVALID_INPUT, { message: 'Invalid tier' });
  }

  const subscription = upgradeTier(orgId, userId, tier, cycle);

  sendSuccess(res, { subscription });
}));

// Downgrade tier
app.post('/api/organizations/:orgId/subscription/downgrade', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const { tier } = req.body as { tier: SubscriptionTier };

  if (!tier || !Object.values(SubscriptionTier).includes(tier)) {
    return sendError(res, ErrorCode.INVALID_INPUT, { message: 'Invalid tier' });
  }

  const subscription = downgradeTier(orgId, userId, tier);

  sendSuccess(res, { subscription });
}));

// Cancel subscription
app.post('/api/organizations/:orgId/subscription/cancel', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const { immediate } = req.body as { immediate?: boolean };

  const subscription = cancelSubscription(orgId, userId, immediate);

  sendSuccess(res, { subscription });
}));

// Reactivate subscription
app.post('/api/organizations/:orgId/subscription/reactivate', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;

  const subscription = reactivateSubscription(orgId, userId);

  sendSuccess(res, { subscription });
}));

// List invoices
app.get('/api/organizations/:orgId/invoices', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId } = req.params;
  const { status } = req.query as { status?: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible' };

  const invoices = getInvoices(orgId, userId, status);

  sendSuccess(res, { invoices });
}));

// Get specific invoice
app.get('/api/organizations/:orgId/invoices/:invoiceId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, ErrorCode.AUTH_REQUIRED);
  }

  const { orgId, invoiceId } = req.params;
  const invoice = getInvoice(orgId, userId, invoiceId);

  sendSuccess(res, { invoice });
}));

// ==================== End Enterprise Organization API ====================

// Global error handler - must be added after all routes
app.use(globalErrorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    type: 'UNHANDLED_REJECTION',
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  }));
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    type: 'UNCAUGHT_EXCEPTION',
    message: error.message,
    stack: error.stack,
  }));
  // Give time for logging before exit
  setTimeout(() => process.exit(1), 1000);
});

const PORT = process.env.PORT || 3100;

// Create HTTP server for both Express and Collaboration WebSocket
const server = http.createServer(app);

// Initialize Yjs collaboration WebSocket server
const collabWss = createCollaborationServer(server, '/collab');
console.log('🤝 Collaboration server ready on /collab');

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  try {
    // Save all collaboration documents
    console.log('💾 Saving collaboration documents...');
    await saveAllDocuments();

    // Shutdown LSP servers
    console.log('🛑 Shutting down LSP servers...');
    await lspServerManager.shutdown();

    // Shutdown debug sessions
    console.log('🐛 Shutting down debug sessions...');
    await debugManager.shutdown();

    // Close WebSocket server
    console.log('🔌 Closing collaboration WebSocket server...');
    collabWss.close();

    // Close HTTP server
    console.log('🌐 Closing HTTP server...');
    server.close(() => {
      console.log('✅ Graceful shutdown complete');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('⚠️ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, async () => {
  console.log(`🚀 Recoder Docker Backend running on port ${PORT}`);
  console.log(`📦 Image: ${IMAGE_NAME}`);
  console.log(`🌐 Preview URL: http://localhost:${PORT}/preview/{projectId}`);
  console.log(`🤝 Collaboration: ws://localhost:${PORT}/collab?projectId=XXX&file=YYY`);
  console.log(`🔤 LSP: POST /api/lsp/:projectId/start`);

  // Run startup sequence AFTER server is listening
  // This ensures cleanup happens first, then pool is initialized
  await startupSequence();
});
