import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import expressWs from 'express-ws';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { v4 as uuid } from 'uuid';
import Docker from 'dockerode';
import { Duplex } from 'stream';
import WebSocket from 'ws';
import http from 'http';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { mountFiles } from './fileMount.js';
import { fastWriteFile, fastWriteFiles } from './fast-file-writer.js';
import * as pty from 'node-pty';
import { WebSocketRPC } from './websocket-rpc.js';
import { devServerManager, detectFrameworkFromContainer, getInstallCommand, getDevCommand, getExpectedPorts, setExpoPublicHostname } from './dev-server.js';
import { ContainerLifecycleManager } from './container-lifecycle.js';
import { snapshotManager } from './snapshot-manager.js';
import { contextCache, computeFileHash, computeFileHashes, type ContextDiff } from './context-cache.js';
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
import { getWsRateLimiter, getAllWsRateLimitStats } from './security/ws-rate-limiter.js';
import {
  abusePrevention,
  sendAlert,
  alertFromAbuseEvent,
  alertWsRateLimitExceeded,
  alertAuthFailure,
  alertSuspiciousRequest,
  alertSystemIssue,
  getAlerts,
  acknowledgeAlert,
  getAlertCounts,
} from './security/index.js';
import {
  validateProjectId,
  validateFilePath,
  validateBranchName,
  validateCommitMessage,
  validateCommitHash,
  validateDomainName,
  validatePositiveInt,
} from './public-api/validation.js';
import { syncManager, diffFileSets, getDetailedDiff, getDiffStats, generateUnifiedDiff } from './cli-sync/index.js';
import { lspServerManager, getConfigForExtension, LSP_SERVER_CONFIGS } from './lsp/index.js';
import { createCollaborationServer, getCollaborationStats, saveAllDocuments } from './collaboration/index.js';
import { replManager, REPL_CONFIGS, type ReplLanguage } from './repl-manager.js';
import { metricsCollector, metricsMiddleware } from './metrics.js';
import { sandboxRouter, initSandboxRoutes, type SandboxDependencies } from './public-api/routes/sandboxes.js';
import { projectRouter, initProjectRoutes, type ProjectDependencies } from './public-api/routes/projects.js';
import openclawKeysRouter from './public-api/routes/openclaw-keys.js';
import { identityRouter, setUserInfoProvider } from './public-api/routes/identity.js';
import { moltbookAuthRouter } from './public-api/routes/auth-moltbook.js';
import { appKeysRouter } from './public-api/routes/app-keys.js';
import { domainRouter } from './public-api/routes/domains.js';
import {
  fetchUserByokProviderKeys,
  buildInternalServiceHeaders,
  type AIProviderKeys,
} from './public-api/byok-provider-keys.js';
import { startSslRenewalScheduler } from './domain-manager.js';
import {
  createWebhookHandler as createPolarWebhookHandler,
  onWebhookEvent,
  getSubscriptionsByUserId,
  getActiveSubscriptionByUserId,
  getWebhookLogs,
} from './billing/polar-webhook.js';
import { getMetricsCollector as getMeteringCollector } from './metering/metrics-collector.js';
import { getUsageAggregator } from './metering/usage-aggregator.js';
import { getQuotaEnforcer, EnforcementAction } from './metering/quota-enforcer.js';
import { MetricType } from './metering/types.js';
import {
  createApiKey,
  listUserApiKeys,
  deleteApiKey,
  revokeApiKey,
  getUsage,
} from './public-api/api-keys.js';
import { healthMonitor, type HealthStatus } from './health-monitor.js';
import { resourceOptimizer } from './resource-optimizer.js';
import { templateManager } from './templates/index.js';
import { getProjectIdFromRequest, isStrictAuthMode } from './auth-utils.js';
import { type ContainerCreationEntry, withCreationTimeout, isCreationStale } from './container-creation.js';
import * as vercelDeploy from './deployment/vercel.js';
import * as netlifyDeploy from './deployment/netlify.js';
import * as cloudflareDeploy from './deployment/cloudflare.js';
import type { ProviderCredentials, DeploymentConfig } from './deployment/types.js';
import {
  authenticateApiKey,
  rateLimitMiddleware,
  sandboxLimitMiddleware,
  requireScope,
  requestLoggingMiddleware,
  asyncApiHandler,
  type AuthenticatedApiRequest,
} from './public-api/middleware.js';
import {
  initPortManager,
  findAvailablePort,
  reservePort,
  releasePort as releasePortFromManager,
  releasePortsByContainer,
  getContainerPort,
  getContainerByPort,
  allocatePortBlock,
  allocatePortBlockWithVerification,
  reassignPortForRestart,
  syncWithDocker as syncPortsWithDocker,
  getPortStats,
  createPortLabels,
  isPortAvailable,
  markPortBlockUnavailable,
  findAvailablePortWithVerification,
  BASE_PORT,
  MAX_PORT,
  PORTS_PER_CONTAINER,
  PROJECT_LABEL,
} from './port-manager.js';
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

// dotenv.config() is called at the top of this file before other imports

// ==================== Environment Validation ====================

function validateEnvironment() {
  const warnings: string[] = [];

  if (!process.env.API_KEY_HASH_SALT) {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ CRITICAL: API_KEY_HASH_SALT is required in production');
      process.exit(1);
    } else {
      process.env.API_KEY_HASH_SALT = 'dev-salt-' + Math.random().toString(36).slice(2);
      warnings.push('API_KEY_HASH_SALT not set - using random dev salt');
    }
  }

  if (!process.env.INTERNAL_SERVICE_KEY) {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ CRITICAL: INTERNAL_SERVICE_KEY is required in production');
      process.exit(1);
    } else {
      process.env.INTERNAL_SERVICE_KEY = 'dev-internal-key';
      warnings.push('INTERNAL_SERVICE_KEY not set - using dev default');
    }
  } else if (process.env.NODE_ENV === 'production') {
    const key = process.env.INTERNAL_SERVICE_KEY;
    if (key === 'dev-internal-key') {
      console.error('❌ CRITICAL: INTERNAL_SERVICE_KEY cannot use dev default in production');
      process.exit(1);
    }
    if (key.length < 32) {
      console.error('❌ CRITICAL: INTERNAL_SERVICE_KEY must be at least 32 characters in production');
      process.exit(1);
    }
    if (/^(changeme|placeholder|xxx|secret|password|test)/i.test(key)) {
      console.error('❌ CRITICAL: INTERNAL_SERVICE_KEY appears to be a placeholder value');
      process.exit(1);
    }
  }

  if (!process.env.POLAR_WEBHOOK_SECRET) {
    warnings.push('POLAR_WEBHOOK_SECRET not set - Polar.sh webhooks disabled');
  }

  if (!process.env.IDENTITY_TOKEN_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ CRITICAL: IDENTITY_TOKEN_SECRET is required in production');
      process.exit(1);
    } else {
      process.env.IDENTITY_TOKEN_SECRET = 'dev-identity-secret-' + Math.random().toString(36).slice(2);
      warnings.push('IDENTITY_TOKEN_SECRET not set - using random dev secret');
    }
  }

  if (warnings.length > 0) {
    console.warn('⚠️ Environment warnings:');
    warnings.forEach(w => console.warn(`  - ${w}`));
  }
}

function startupInfo(component: string, message: string, details?: Record<string, unknown>): void {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      type: 'STARTUP',
      component,
      message,
      details,
    }),
  );
}

// ==================== SECURITY: Authentication & Authorization ====================

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

const DEBUG_AUTH_LOGS = process.env.NODE_ENV !== 'production' && process.env.DEBUG_AUTH_LOGS === 'true';

function maskIdentifier(value?: string): string {
  if (!value) return 'unknown';
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function authDebug(message: string, meta?: Record<string, unknown>) {
  if (!DEBUG_AUTH_LOGS) return;
  if (meta) {
    console.debug(`[Auth] ${message}`, meta);
    return;
  }
  console.debug(`[Auth] ${message}`);
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
  // In production with useSecureCookies=true, cookies are prefixed with "__Secure-"
  // With cookiePrefix: "recoder", the cookie is named:
  //   - Development: "recoder.session_token"
  //   - Production: "__Secure-recoder.session_token"
  return cookies['__Secure-recoder.session_token']  // Production with Secure cookies
    || cookies['recoder.session_token']              // Development
    || cookies['__Secure-session_token']             // Production without prefix
    || cookies['recoder_session_token']              // Alternative format
    || cookies['session_token']                      // Fallback
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
    // In production with useSecureCookies=true, cookies are prefixed with "__Secure-"
    token = cookies['__Secure-recoder.session_token']  // Production with Secure cookies
      || cookies['recoder.session_token']              // Development
      || cookies['__Secure-session_token']             // Production without prefix
      || cookies['recoder_session_token']              // Alternative format
      || cookies['session_token']                      // Fallback
      || '';
  }

  if (!token) {
    // In migration mode, allow anonymous access with warning
    if (!STRICT_AUTH) {
      logWarning(ErrorCode.AUTH_REQUIRED, 'Anonymous WebSocket connection in migration mode', {
        path: req.path,
      });
      return { userId: 'anonymous', sessionId: 'anon' };
    }
    ws.close(1008, 'Authentication required');
    return null;
  }

  const session = await verifySessionToken(token);
  if (!session) {
    // In migration mode, allow with warning
    if (!STRICT_AUTH) {
      logWarning(ErrorCode.AUTH_INVALID_TOKEN, 'Invalid WebSocket token accepted in migration mode', {
        path: req.path,
      });
      return { userId: 'anonymous', sessionId: 'anon' };
    }
    ws.close(1008, 'Invalid or expired session');
    return null;
  }

  return session;
}

// Helper to add timeout to any promise
function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms)
    )
  ]);
}

// Auth cache - avoid repeated HTTP calls for the same session token
const authCache = new Map<string, { userId: string; sessionId: string; expiresAt: number }>();
const AUTH_CACHE_TTL = 60_000; // 60 seconds

// Ownership cache - avoid repeated HTTP calls for the same user+project
const ownershipCache = new Map<string, { isOwner: boolean; expiresAt: number }>();
const OWNERSHIP_CACHE_TTL = 120_000; // 2 minutes

// Verify Better Auth session token with the main app API
// The token is the value of the 'recoder.session_token' cookie from Better Auth
async function verifySessionToken(token: string): Promise<{ userId: string; sessionId: string } | null> {
  if (!token) {
    return null;
  }

  // Check cache first
  const cached = authCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return { userId: cached.userId, sessionId: cached.sessionId };
  }

  try {
    // Use AbortController for fetch timeout (5 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      // Use the existing Better Auth verify-token endpoint
      const pathname = '/api/auth/verify-token';
      const body = JSON.stringify({ token });
      const response = await fetch(`${APP_API_URL}${pathname}`, {
        method: 'POST',
        headers: buildInternalServiceHeaders({
          method: 'POST',
          pathname,
          body,
          serviceKey: INTERNAL_SERVICE_KEY,
        }),
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        authDebug('session verification failed', { status: response.status });
        return null;
      }

      const data = await response.json() as { success?: boolean; user?: { id: string; email?: string } };
      if (data.success && data.user?.id) {
        const result = { userId: data.user.id, sessionId: token.substring(0, 8) };
        // Cache the successful result
        authCache.set(token, { ...result, expiresAt: Date.now() + AUTH_CACHE_TTL });
        return result;
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logError({
        errorCode: ErrorCode.AUTH_SERVICE_ERROR,
        message: 'Better Auth session verification timed out',
        details: { timeoutMs: 5000 },
      });
    } else {
      logError({
        errorCode: ErrorCode.AUTH_SERVICE_ERROR,
        message: 'Error verifying Better Auth session',
        details: { error: error.message },
      });
    }
    return null;
  }
}

// Check if user owns the project
async function checkProjectOwnership(userId: string, projectId: string): Promise<boolean> {
  if (!userId || !projectId || !INTERNAL_SERVICE_KEY) {
    return false;
  }

  // Check cache first
  const cacheKey = `${userId}:${projectId}`;
  const cached = ownershipCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isOwner;
  }

  try {
    // Use AbortController for fetch timeout (5 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const pathname = '/api/project/verify-ownership';
      const body = JSON.stringify({ userId, projectId });
      const response = await fetch(`${APP_API_URL}${pathname}`, {
        method: 'POST',
        headers: buildInternalServiceHeaders({
          method: 'POST',
          pathname,
          body,
          serviceKey: INTERNAL_SERVICE_KEY,
        }),
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as { isOwner: boolean };
      const isOwner = data.isOwner === true;
      // Cache the result
      ownershipCache.set(cacheKey, { isOwner, expiresAt: Date.now() + OWNERSHIP_CACHE_TTL });
      return isOwner;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logError({
        errorCode: ErrorCode.AUTHZ_SERVICE_ERROR,
        message: 'Project ownership check timed out',
        details: { timeoutMs: 5000 },
      });
    } else {
      logError({
        errorCode: ErrorCode.AUTHZ_SERVICE_ERROR,
        message: 'Error checking project ownership',
        details: { error: error.message },
      });
    }
    return false;
  }
}

// Authentication middleware - verifies user token
// In strict mode (default in production): always requires token
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';
const STRICT_AUTH = isStrictAuthMode();

function authenticateRequest(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  // Get token from Authorization header OR cookies (for cross-origin with httpOnly cookies)
  const token = getSessionTokenFromRequest(req);
  const origin = req.headers.origin || '';

  // If no token provided
  if (!token) {
    // In development or if origin is allowed, permit without auth (migration mode)
    const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin) || origin === '' || origin.includes('localhost');

    if (!STRICT_AUTH && isAllowedOrigin) {
      // Migration mode: allow but log warning
      logWarning(ErrorCode.AUTH_REQUIRED, 'Request without auth token accepted in migration mode', {
        origin: origin || 'same-origin',
        method: req.method,
        path: req.path,
      });
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
      if (!STRICT_AUTH && isAllowedOrigin) {
        logWarning(ErrorCode.AUTH_INVALID_TOKEN, 'Invalid token accepted in migration mode', {
          origin: origin || 'same-origin',
          method: req.method,
          path: req.path,
        });
        req.userId = 'anonymous';
        return next();
      }
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    req.userId = session.userId;
    req.sessionId = session.sessionId;
    next();
  }).catch((err) => {
    logError({
      errorCode: ErrorCode.AUTH_SERVICE_ERROR,
      message: 'Authentication middleware error',
      details: { error: err.message },
    });
    // Allow in migration mode
    if (!STRICT_AUTH) {
      logWarning(ErrorCode.AUTH_SERVICE_ERROR, 'Auth service error accepted in migration mode', {
        method: req.method,
        path: req.path,
      });
      req.userId = 'anonymous';
      return next();
    }
    return res.status(500).json({ error: 'Authentication service error' });
  });
}

// Authorization middleware - verifies project ownership
// During migration: allows anonymous users to access projects (with warning)
function verifyProjectOwnership(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const projectId = getProjectIdFromRequest(req);

  if (!projectId) {
    return res.status(400).json({ error: 'Project ID required' });
  }

  // In migration mode, allow anonymous users
  if (req.userId === 'anonymous' && !STRICT_AUTH) {
    logWarning(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Anonymous project access accepted in migration mode', {
      projectId: maskIdentifier(projectId),
      method: req.method,
      path: req.path,
    });
    return next();
  }

  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  checkProjectOwnership(req.userId, projectId).then(isOwner => {
    if (!isOwner) {
      // In migration mode, allow but log
      if (!STRICT_AUTH) {
        logWarning(ErrorCode.AUTHZ_OWNERSHIP_CHECK_FAILED, 'Ownership check bypassed in migration mode', {
          userId: maskIdentifier(req.userId),
          projectId: maskIdentifier(projectId),
          method: req.method,
          path: req.path,
        });
        return next();
      }
      logWarning(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Project access denied', {
        userId: maskIdentifier(req.userId),
        projectId: maskIdentifier(projectId),
      });
      return res.status(403).json({ error: 'Access denied: You do not own this project' });
    }
    next();
  }).catch((err) => {
    logError({
      errorCode: ErrorCode.AUTHZ_SERVICE_ERROR,
      message: 'Authorization middleware error',
      details: { error: err.message },
    });
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
  let sanitized = path
    .replace(/\.\.\//g, '')  // No path traversal
    .replace(/[;&|`$(){}]/g, '')  // No shell metacharacters
    .replace(/[\r\n]/g, '')  // No newlines
    .replace(/^\/+/, '');  // No leading slashes (force relative to workspace)
  // Normalize accidental workspace prefix (avoids /workspace/workspace/...)
  if (sanitized.startsWith('workspace/')) {
    sanitized = sanitized.slice('workspace/'.length);
  }
  return sanitized;
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

/**
 * Get the primary programming language for a detected framework
 */
function getLanguageFromFramework(framework: string): string {
  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    'node': 'javascript',
    'vite': 'typescript',
    'next': 'typescript',
    'react': 'javascript',
    'vue': 'javascript',
    'svelte': 'javascript',
    'sveltekit': 'typescript',
    'angular': 'typescript',
    'nuxt': 'typescript',
    'expo': 'typescript',
    'node-server': 'javascript',
    
    // Python
    'python': 'python',
    'flask': 'python',
    'django': 'python',
    'fastapi': 'python',
    'streamlit': 'python',
    'gradio': 'python',
    
    // Rust
    'rust': 'rust',
    'rust-web': 'rust',
    
    // Go
    'go': 'go',
    'go-web': 'go',
    
    // Java
    'java': 'java',
    'java-spring': 'java',
    
    // Static
    'static': 'html',
  };
  
  return languageMap[framework] || 'unknown';
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

// ==================== WEBSOCKET KEEPALIVE ====================
// Ping/pong keepalive for WebSocket connections with connection tracking

interface WebSocketConnectionInfo {
  ws: WebSocket;
  projectId: string;
  endpoint: string;  // e.g., 'terminal', 'watch', 'sync', 'cli-sync'
  connectedAt: number;
  lastPongAt: number;
  userId?: string;
  pingInterval?: NodeJS.Timeout;
  pongTimeout?: NodeJS.Timeout;
}

class WebSocketKeepaliveManager {
  private connections = new Map<WebSocket, WebSocketConnectionInfo>();
  private pingIntervalMs: number;
  private pongTimeoutMs: number;

  // Statistics
  private totalConnections = 0;
  private totalDisconnections = 0;
  private totalPingsSent = 0;
  private totalPongsReceived = 0;
  private totalTimeouts = 0;

  constructor(pingIntervalMs = 30000, pongTimeoutMs = 60000) {
    this.pingIntervalMs = pingIntervalMs;
    this.pongTimeoutMs = pongTimeoutMs;
  }

  /**
   * Register a WebSocket connection for keepalive management
   */
  register(ws: WebSocket, projectId: string, endpoint: string, userId?: string): void {
    const now = Date.now();
    const info: WebSocketConnectionInfo = {
      ws,
      projectId,
      endpoint,
      connectedAt: now,
      lastPongAt: now,
      userId,
    };

    // Set up ping interval
    info.pingInterval = setInterval(() => this.sendPing(ws), this.pingIntervalMs);

    // Set up pong handler
    ws.on('pong', () => {
      const connInfo = this.connections.get(ws);
      if (connInfo) {
        connInfo.lastPongAt = Date.now();
        this.totalPongsReceived++;
        // Clear pong timeout if exists
        if (connInfo.pongTimeout) {
          clearTimeout(connInfo.pongTimeout);
          connInfo.pongTimeout = undefined;
        }
      }
    });

    // Handle close event
    ws.on('close', (code, reason) => {
      this.handleClose(ws, code, reason?.toString() || '');
    });

    this.connections.set(ws, info);
    this.totalConnections++;

    console.log(`[WS Keepalive] Registered ${endpoint}/${projectId} [user: ${userId || 'anonymous'}] (active: ${this.connections.size})`);
  }

  /**
   * Send ping to a WebSocket connection
   */
  private sendPing(ws: WebSocket): void {
    const info = this.connections.get(ws);
    if (!info || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      ws.ping();
      this.totalPingsSent++;

      // Set pong timeout
      info.pongTimeout = setTimeout(() => {
        this.handlePongTimeout(ws);
      }, this.pongTimeoutMs);
    } catch (err: any) {
      console.error(`[WS Keepalive] Ping error for ${info.endpoint}/${info.projectId}: ${err.message}`);
    }
  }

  /**
   * Handle pong timeout - close the connection
   */
  private handlePongTimeout(ws: WebSocket): void {
    const info = this.connections.get(ws);
    if (!info) return;

    this.totalTimeouts++;
    const uptime = Math.round((Date.now() - info.connectedAt) / 1000);
    console.log(`[WS Keepalive] Pong timeout for ${info.endpoint}/${info.projectId} after ${uptime}s uptime`);

    // Send connection hint before closing
    this.sendConnectionHint(ws, 'pong_timeout', 'No pong received within timeout period');

    // Close the connection
    try {
      ws.close(1001, 'Pong timeout');
    } catch (err) {
      // Connection may already be closed
    }
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(ws: WebSocket, code: number, reason: string): void {
    const info = this.connections.get(ws);
    if (!info) return;

    // Clear intervals and timeouts
    if (info.pingInterval) {
      clearInterval(info.pingInterval);
    }
    if (info.pongTimeout) {
      clearTimeout(info.pongTimeout);
    }

    const uptime = Math.round((Date.now() - info.connectedAt) / 1000);
    this.totalDisconnections++;

    console.log(`[WS Keepalive] Closed ${info.endpoint}/${info.projectId} [code: ${code}, reason: ${reason || 'none'}] uptime: ${uptime}s (active: ${this.connections.size - 1})`);

    this.connections.delete(ws);
  }

  /**
   * Send connection hint message to client before closing
   */
  private sendConnectionHint(ws: WebSocket, reason: string, details?: string): void {
    if (ws.readyState !== WebSocket.OPEN) return;

    try {
      const hint = {
        type: 'connection_hint',
        reason,
        details,
        reconnect: {
          recommended: true,
          delayMs: 1000,
          maxRetries: 5,
          backoffMultiplier: 2,
        },
        timestamp: new Date().toISOString(),
      };
      ws.send(JSON.stringify(hint));
    } catch (err: any) {
      // Ignore send errors when closing
    }
  }

  /**
   * Manually unregister a connection (e.g., on explicit close)
   */
  unregister(ws: WebSocket): void {
    const info = this.connections.get(ws);
    if (info) {
      if (info.pingInterval) {
        clearInterval(info.pingInterval);
      }
      if (info.pongTimeout) {
        clearTimeout(info.pongTimeout);
      }
      this.connections.delete(ws);
    }
  }

  /**
   * Send a connection hint and close gracefully
   */
  closeWithHint(ws: WebSocket, reason: string, details?: string, code = 1000): void {
    this.sendConnectionHint(ws, reason, details);
    try {
      ws.close(code, reason);
    } catch (err) {
      // Connection may already be closed
    }
  }

  /**
   * Get WebSocket statistics
   */
  getStats(): {
    activeConnections: number;
    byEndpoint: Record<string, number>;
    byProject: Record<string, number>;
    totalConnections: number;
    totalDisconnections: number;
    totalPingsSent: number;
    totalPongsReceived: number;
    totalTimeouts: number;
    connectionDetails: Array<{
      projectId: string;
      endpoint: string;
      userId?: string;
      uptimeSeconds: number;
      lastPongAgoSeconds: number;
    }>;
  } {
    const now = Date.now();
    const byEndpoint: Record<string, number> = {};
    const byProject: Record<string, number> = {};
    const connectionDetails: Array<{
      projectId: string;
      endpoint: string;
      userId?: string;
      uptimeSeconds: number;
      lastPongAgoSeconds: number;
    }> = [];

    for (const info of this.connections.values()) {
      // Count by endpoint
      byEndpoint[info.endpoint] = (byEndpoint[info.endpoint] || 0) + 1;

      // Count by project
      byProject[info.projectId] = (byProject[info.projectId] || 0) + 1;

      // Connection details
      connectionDetails.push({
        projectId: info.projectId,
        endpoint: info.endpoint,
        userId: info.userId,
        uptimeSeconds: Math.round((now - info.connectedAt) / 1000),
        lastPongAgoSeconds: Math.round((now - info.lastPongAt) / 1000),
      });
    }

    return {
      activeConnections: this.connections.size,
      byEndpoint,
      byProject,
      totalConnections: this.totalConnections,
      totalDisconnections: this.totalDisconnections,
      totalPingsSent: this.totalPingsSent,
      totalPongsReceived: this.totalPongsReceived,
      totalTimeouts: this.totalTimeouts,
      connectionDetails,
    };
  }

  /**
   * Shutdown all connections gracefully
   */
  shutdown(): void {
    console.log(`[WS Keepalive] Shutting down ${this.connections.size} connections...`);
    for (const [ws, info] of this.connections.entries()) {
      if (info.pingInterval) {
        clearInterval(info.pingInterval);
      }
      if (info.pongTimeout) {
        clearTimeout(info.pongTimeout);
      }
      this.sendConnectionHint(ws, 'server_shutdown', 'Server is shutting down');
      try {
        ws.close(1001, 'Server shutdown');
      } catch (err) {
        // Ignore close errors during shutdown
      }
    }
    this.connections.clear();
  }
}

// Initialize WebSocket keepalive manager
// Ping every 30 seconds, timeout after 60 seconds without pong
const wsKeepalive = new WebSocketKeepaliveManager(30000, 60000);

/**
 * Get WebSocket connection statistics
 * Can be used by other modules or exposed via API
 */
export function getWebSocketStats() {
  return wsKeepalive.getStats();
}

// ==================== END WEBSOCKET KEEPALIVE ====================

// Initialize Redis connection (non-blocking)
sessionStore.connect().catch(() => {
  console.warn('[Server] Redis not available, using memory fallback for sessions');
});

// Initialize container pool (non-blocking) - pre-warms containers for faster project creation
const ENABLE_CONTAINER_POOL = process.env.ENABLE_CONTAINER_POOL !== 'false';
// Always persist workspace volumes - files survive container restarts
const PERSIST_WORKSPACE = true;

const docker = new Docker();

// App API URL for fetching user tokens
const APP_API_URL = process.env.APP_API_URL || 'https://recoder.xyz';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

// Fetch user's Claude Code OAuth token from app API
async function fetchClaudeCodeToken(userId: string): Promise<string | null> {
  if (!userId || !INTERNAL_SERVICE_KEY) {
    authDebug('claude token fetch skipped: missing userId or service key');
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    authDebug('fetching claude token', { userId: maskIdentifier(userId) });
    const pathname = '/api/user/claude-code';
    const body = JSON.stringify({ userId });
    const response = await fetch(`${APP_API_URL}${pathname}`, {
      method: 'PUT',
      headers: buildInternalServiceHeaders({
        method: 'PUT',
        pathname,
        body,
        serviceKey: INTERNAL_SERVICE_KEY,
      }),
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      authDebug('claude token fetch failed', { userId: maskIdentifier(userId), status: response.status });
      return null;
    }

    const data = await response.json() as { hasToken: boolean; token?: string };
    if (data.hasToken && data.token) {
      authDebug('claude token present', { userId: maskIdentifier(userId) });
      return data.token;
    }

    authDebug('claude token absent', { userId: maskIdentifier(userId) });
    return null;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error(`[Claude Code] Fetch token timed out after 5s for user ${maskIdentifier(userId)}`);
    } else {
      console.error(`[Claude Code] Error fetching token for user ${maskIdentifier(userId)}: ${error.message}`);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchAIProviderKeys(userId: string): Promise<AIProviderKeys> {
  if (!userId || !INTERNAL_SERVICE_KEY) {
    authDebug('provider key fetch skipped: missing userId or service key');
    return {};
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    authDebug('fetching provider keys', { userId: maskIdentifier(userId) });
    const keys = await fetchUserByokProviderKeys({
      appApiUrl: APP_API_URL,
      userId,
      serviceKey: INTERNAL_SERVICE_KEY,
      signal: controller.signal,
    });
    const keyCount = Object.keys(keys || {}).length;
    authDebug('provider keys retrieved', { userId: maskIdentifier(userId), keyCount });
    return keys || {};
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error(`[AI Provider Keys] Fetch keys timed out after 5s for user ${maskIdentifier(userId)}`);
    } else {
      console.error(`[AI Provider Keys] Error fetching keys for user ${maskIdentifier(userId)}: ${error.message}`);
    }
    return {};
  } finally {
    clearTimeout(timeoutId);
  }
}

// Create base express app
const baseApp = express();

// Create HTTP server FIRST so express-ws can attach WebSocket upgrade handler
const server = http.createServer(baseApp);

// Initialize express-ws with the server so WebSocket routes work
const { app } = expressWs(baseApp, server);

function getTrustProxySetting(): boolean | number | string {
  const raw = (process.env.TRUST_PROXY || '').trim();
  if (!raw) {
    // Default for typical single reverse-proxy deployments (nginx/ingress).
    return 1;
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
  return raw;
}

const trustProxySetting = getTrustProxySetting();
app.set('trust proxy', trustProxySetting);
console.log(`[Server] trust proxy configured as: ${String(trustProxySetting)}`);

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 600, // 600 requests per minute (10 req/sec) — project restore can burst 200+ requests
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
  'http://localhost:5173',
  'http://localhost:3100'
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
// Tighter body-size limit for public API routes (2 MB vs 50 MB global)
app.use('/api/v1', express.json({ limit: '2mb' }));
app.use('/api/', apiLimiter);

// Security headers (lightweight, no Helmet dependency)
app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0'); // modern browsers use CSP instead
  res.removeHeader('X-Powered-By');
  next();
});

// Add request ID and timing middleware for error tracking
app.use(requestIdMiddleware);
app.use(requestTimingMiddleware);

// Add metrics collection middleware
app.use(metricsMiddleware(metricsCollector));

// Abuse prevention middleware — check IP blocklist on every request
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const ip = req.headers['x-forwarded-for']
    ? (Array.isArray(req.headers['x-forwarded-for'])
        ? req.headers['x-forwarded-for'][0]
        : req.headers['x-forwarded-for'].split(',')[0].trim())
    : req.ip || req.socket.remoteAddress || 'unknown';

  const blockCheck = abusePrevention.isBlocked({ ip, userAgent: req.headers['user-agent'] });
  if (blockCheck.blocked) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  next();
});

// Container registry: projectId -> containerId + port + ptyPort
// Added backgroundDev flag so we can auto-tail dev server logs into the PTY when users attach
const containers = new Map<string, { id: string; lastActive: number; port: number; ptyPort: number; backgroundDev?: boolean; userId?: string }>();

// Track containers being created to prevent race conditions
type ContainerCreationResult = { containerId: string; port: number; ptyPort: number; fromPool?: boolean };
const creatingContainers = new Map<string, ContainerCreationEntry<ContainerCreationResult>>();
const CONTAINER_CREATE_TIMEOUT_MS = Number(process.env.CONTAINER_CREATE_TIMEOUT_MS || 120000);

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

// Initialize port manager with Docker client
initPortManager(docker);

// Track allocated ports to prevent race conditions (kept for backward compatibility)
const allocatedPorts = new Set<number>();

/**
 * Port allocation using the new port manager
 * Uses lsof for system-level availability checking
 * Supports smart port allocation with fallback logic
 */
async function allocatePort(containerId?: string): Promise<{ preview: number; pty: number }> {
  // Use the new port manager with OS-level verification
  const ports = await allocatePortBlockWithVerification(containerId);

  // Also update local tracking for backward compatibility
  allocatedPorts.add(ports.preview);
  allocatedPorts.add(ports.preview + 1);
  allocatedPorts.add(ports.preview + 2);
  allocatedPorts.add(ports.pty);

  return ports;
}

/**
 * Release ports when container is removed
 * Uses the port manager and updates local tracking
 */
function releasePorts(port: number, ptyPort: number) {
  // Use the port manager
  releasePortFromManager(port);

  // Also update local tracking for backward compatibility
  allocatedPorts.delete(port);
  allocatedPorts.delete(port + 1);
  allocatedPorts.delete(port + 2);
  allocatedPorts.delete(ptyPort);
}

// Initialize container pool with shared port management
// NOTE: Actual initialization happens in startupSequence() below to avoid race with cleanup

/**
 * Run a host command and reject on non-zero exit.
 */
async function runHostCommand(cmd: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} ${args.join(' ')} failed with code ${code}: ${stderr.trim()}`));
    });
  });
}

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
      try { getMeteringCollector().untrackContainer(entry.id); } catch (_) {}
      try { healthMonitor.unregisterContainer(entry.id); } catch (_) {}
      try { resourceOptimizer.unregisterContainer(entry.id); } catch (_) {}
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

// ==================== CONTEXT CACHE ENDPOINTS (S8-3) ====================
// Server-side prompt/context caching for reduced latency and costs

// Get context cache stats
app.get('/api/context/cache/stats', (_, res) => {
  const stats = contextCache.getStats();
  res.json(stats);
});

// Create a new context cache for a project
app.post('/api/context/cache', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  try {
    const { projectId, files, systemPrompt } = req.body;

    if (!projectId || !files) {
      return res.status(400).json({ error: 'projectId and files are required' });
    }

    // Convert files object to Map
    const fileMap = new Map<string, string>(Object.entries(files));

    const cacheId = contextCache.createCache(projectId, fileMap, systemPrompt);

    res.json({
      success: true,
      cacheId,
      fileCount: fileMap.size,
      message: 'Context cached successfully',
    });
  } catch (error: any) {
    console.error('[ContextCache] Error creating cache:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get cached context by ID
app.get('/api/context/cache/:cacheId', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  try {
    const { cacheId } = req.params;
    const cache = contextCache.getCache(cacheId);

    if (!cache) {
      return res.status(404).json({ error: 'Cache not found or expired' });
    }

    // Return file list with hashes (not full content to save bandwidth)
    const files: Record<string, { hash: string; size: number }> = {};
    for (const [path, file] of cache.files) {
      files[path] = { hash: file.hash, size: file.size };
    }

    res.json({
      cacheId: cache.id,
      projectId: cache.projectId,
      files,
      fileCount: cache.files.size,
      totalSize: cache.totalSize,
      createdAt: cache.createdAt,
      lastAccessed: cache.lastAccessed,
      accessCount: cache.accessCount,
      hasSystemPrompt: !!cache.systemPromptHash,
    });
  } catch (error: any) {
    console.error('[ContextCache] Error getting cache:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get file hashes for a cached context (for client-side comparison)
app.get('/api/context/cache/:cacheId/hashes', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  try {
    const { cacheId } = req.params;
    const hashes = contextCache.getFileHashes(cacheId);

    if (!hashes) {
      return res.status(404).json({ error: 'Cache not found or expired' });
    }

    res.json({
      cacheId,
      hashes: Object.fromEntries(hashes),
    });
  } catch (error: any) {
    console.error('[ContextCache] Error getting hashes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Compute diff between client files and cached context
app.post('/api/context/cache/:cacheId/diff', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  try {
    const { cacheId } = req.params;
    const { files } = req.body;

    if (!files) {
      return res.status(400).json({ error: 'files are required' });
    }

    const fileMap = new Map<string, string>(Object.entries(files));
    const diff = contextCache.computeDiff(cacheId, fileMap);

    if (!diff) {
      return res.status(404).json({ error: 'Cache not found or expired' });
    }

    res.json({
      cacheId,
      changedFiles: Object.fromEntries(diff.changedFiles),
      deletedFiles: diff.deletedFiles,
      unchangedCount: diff.unchangedHashes.size,
      changedCount: diff.changedFiles.size,
      deletedCount: diff.deletedFiles.length,
    });
  } catch (error: any) {
    console.error('[ContextCache] Error computing diff:', error);
    res.status(500).json({ error: error.message });
  }
});

// Apply diff and get reconstructed context
app.post('/api/context/cache/:cacheId/apply', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  try {
    const { cacheId } = req.params;
    const { changedFiles, deletedFiles } = req.body;

    const diff: Partial<ContextDiff> = {
      changedFiles: changedFiles ? new Map(Object.entries(changedFiles)) : undefined,
      deletedFiles: deletedFiles || [],
    };

    const result = contextCache.applyDiff(cacheId, diff);

    if (!result) {
      return res.status(404).json({ error: 'Cache not found or expired' });
    }

    res.json({
      cacheId: result.cacheId,
      filesUpdated: result.filesUpdated,
      filesFromCache: result.filesFromCache,
      bytesSaved: result.bytesSaved,
      files: Object.fromEntries(result.reconstructedContext),
    });
  } catch (error: any) {
    console.error('[ContextCache] Error applying diff:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete cache for a specific project
app.delete('/api/context/cache/project/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const { projectId } = req.params;
    const deleted = contextCache.deleteProjectCaches(projectId);

    res.json({
      success: true,
      deletedCount: deleted,
    });
  } catch (error: any) {
    console.error('[ContextCache] Error deleting project caches:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a specific cache by ID
app.delete('/api/context/cache/:cacheId', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  try {
    const { cacheId } = req.params;
    const deleted = contextCache.deleteCache(cacheId);

    res.json({
      success: deleted,
      message: deleted ? 'Cache deleted' : 'Cache not found',
    });
  } catch (error: any) {
    console.error('[ContextCache] Error deleting cache:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get latest cache for a project
app.get('/api/context/cache/project/:projectId/latest', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const { projectId } = req.params;
    const cacheId = contextCache.getLatestCacheForProject(projectId);

    if (!cacheId) {
      return res.status(404).json({ error: 'No cache found for project' });
    }

    const cache = contextCache.getCache(cacheId);
    if (!cache) {
      return res.status(404).json({ error: 'Cache expired' });
    }

    // Return file hashes for client comparison
    const hashes: Record<string, string> = {};
    for (const [path, file] of cache.files) {
      hashes[path] = file.hash;
    }

    res.json({
      cacheId,
      projectId,
      hashes,
      fileCount: cache.files.size,
      totalSize: cache.totalSize,
      lastAccessed: cache.lastAccessed,
    });
  } catch (error: any) {
    console.error('[ContextCache] Error getting latest cache:', error);
    res.status(500).json({ error: error.message });
  }
});

// Compute file hash (utility endpoint for client)
app.post('/api/context/hash', (req, res) => {
  try {
    const { content } = req.body;

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content must be a string' });
    }

    const hash = computeFileHash(content);
    res.json({ hash });
  } catch (error: any) {
    console.error('[ContextCache] Error computing hash:', error);
    res.status(500).json({ error: error.message });
  }
});

// Compute hashes for multiple files
app.post('/api/context/hashes', (req, res) => {
  try {
    const { files } = req.body;

    if (!files || typeof files !== 'object') {
      return res.status(400).json({ error: 'files must be an object' });
    }

    const fileMap = new Map<string, string>(Object.entries(files));
    const hashes = computeFileHashes(fileMap);

    res.json({
      hashes: Object.fromEntries(hashes),
    });
  } catch (error: any) {
    console.error('[ContextCache] Error computing hashes:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== END CONTEXT CACHE ENDPOINTS ====================

// WebSocket stats endpoint (PERFORMANCE monitoring)
app.get('/api/websocket/stats', (_, res) => {
  const stats = wsKeepalive.getStats();
  res.json(stats);
});

// Port management stats endpoint (PERFORMANCE monitoring)
app.get('/api/ports/stats', (_, res) => {
  const stats = getPortStats();
  res.json({
    ...stats,
    basePort: BASE_PORT,
    maxPort: MAX_PORT,
    portsPerContainer: PORTS_PER_CONTAINER,
  });
});

// Check port availability endpoint
app.get('/api/ports/check/:port', async (req, res) => {
  const port = parseInt(req.params.port, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    return res.status(400).json({ error: 'Invalid port number' });
  }
  const available = await isPortAvailable(port);
  const assignedTo = getContainerByPort(port);
  res.json({ port, available, assignedTo: assignedTo?.slice(0, 12) });
});

// Get container port info endpoint
app.get('/api/ports/container/:containerId', (req, res) => {
  const containerId = req.params.containerId;
  const ports = getContainerPort(containerId);
  if (!ports) {
    return res.status(404).json({ error: 'Container not found or no ports assigned' });
  }
  res.json({ containerId: containerId.slice(0, 12), ...ports });
});

// ==================== COMPREHENSIVE METRICS ENDPOINT ====================
// Aggregates all metrics into a single endpoint for monitoring dashboards

app.get('/api/metrics', (_, res) => {
  // Get metrics from all sources
  const metricsSummary = metricsCollector.getSummary();
  const containerPoolStats = ENABLE_CONTAINER_POOL ? containerPool.getStats() : null;
  const containerPoolMetrics = ENABLE_CONTAINER_POOL ? containerPool.getMetrics() : null;
  const wsStats = wsKeepalive.getStats();
  const cacheStats = fileCache.getStats();
  const portStats = getPortStats();

  // Compile comprehensive metrics response
  const metrics = {
    timestamp: metricsSummary.timestamp,
    uptime: metricsSummary.uptime,
    uptimeHuman: metricsSummary.uptimeHuman,

    // Container Pool
    containerPool: containerPoolStats ? {
      enabled: true,
      size: containerPoolStats.total,
      available: containerPoolStats.ready,
      inUse: containerPoolStats.assigned,
      warming: containerPoolStats.warming,
      avgRecycleCount: containerPoolStats.avgRecycleCount,
      avgAgeMinutes: containerPoolStats.avgAgeMinutes,
      performance: containerPoolMetrics ? {
        poolHitRate: containerPoolMetrics.poolHitRate,
        avgAcquireTimeMs: containerPoolMetrics.avgAcquireTimeMs,
        avgWarmTimeMs: containerPoolMetrics.avgWarmTimeMs,
        totalAcquires: containerPoolMetrics.totalAcquires,
        poolHits: containerPoolMetrics.poolHits,
        poolMisses: containerPoolMetrics.poolMisses,
      } : null,
    } : { enabled: false },

    // Active containers (not from pool)
    activeContainers: {
      total: containers.size,
      byUser: userContainers.size,
    },

    // Port management
    ports: {
      usedCount: portStats.usedPortCount,
      containerCount: portStats.containerCount,
      range: portStats.portRange,
      portsPerContainer: PORTS_PER_CONTAINER,
    },

    // WebSocket connections
    websockets: {
      active: wsStats.activeConnections,
      byEndpoint: wsStats.byEndpoint,
      byProject: wsStats.byProject,
      totalConnections: wsStats.totalConnections,
      totalDisconnections: wsStats.totalDisconnections,
      totalTimeouts: wsStats.totalTimeouts,
    },

    // File operations (from metrics collector)
    fileOperations: metricsSummary.fileOperations,

    // File cache
    fileCache: {
      entries: cacheStats.entries,
      sizeBytes: cacheStats.sizeBytes,
      hitRate: cacheStats.hitRate,
      hits: cacheStats.hits,
      misses: cacheStats.misses,
    },

    // Memory usage
    memory: metricsSummary.memory,

    // Request metrics
    requests: metricsSummary.requests,

    // Errors
    errors: metricsSummary.errors,
  };

  res.json(metrics);
});

// Prometheus-compatible metrics endpoint
app.get('/api/metrics/prometheus', (_, res) => {
  // Get base metrics
  const prometheusMetrics = metricsCollector.getPrometheusFormat();

  // Add additional metrics from other sources
  const lines: string[] = [prometheusMetrics];

  // Container pool metrics
  if (ENABLE_CONTAINER_POOL) {
    const poolStats = containerPool.getStats();
    const poolMetrics = containerPool.getMetrics();

    lines.push('');
    lines.push('# HELP recoder_container_pool_size Total containers in pool');
    lines.push('# TYPE recoder_container_pool_size gauge');
    lines.push(`recoder_container_pool_size ${poolStats.total}`);

    lines.push('# HELP recoder_container_pool_ready Ready containers in pool');
    lines.push('# TYPE recoder_container_pool_ready gauge');
    lines.push(`recoder_container_pool_ready ${poolStats.ready}`);

    lines.push('# HELP recoder_container_pool_assigned Assigned containers from pool');
    lines.push('# TYPE recoder_container_pool_assigned gauge');
    lines.push(`recoder_container_pool_assigned ${poolStats.assigned}`);

    lines.push('# HELP recoder_container_pool_hit_rate Pool hit rate percentage');
    lines.push('# TYPE recoder_container_pool_hit_rate gauge');
    lines.push(`recoder_container_pool_hit_rate ${poolMetrics.poolHitRate}`);
  }

  // Active containers
  lines.push('');
  lines.push('# HELP recoder_active_containers Currently active containers');
  lines.push('# TYPE recoder_active_containers gauge');
  lines.push(`recoder_active_containers ${containers.size}`);

  // WebSocket connections
  const wsStats = wsKeepalive.getStats();
  lines.push('');
  lines.push('# HELP recoder_websocket_connections Active WebSocket connections');
  lines.push('# TYPE recoder_websocket_connections gauge');
  lines.push(`recoder_websocket_connections ${wsStats.activeConnections}`);

  for (const [endpoint, count] of Object.entries(wsStats.byEndpoint)) {
    lines.push(`recoder_websocket_connections_by_endpoint{endpoint="${endpoint}"} ${count}`);
  }

  // File cache
  const cacheStats = fileCache.getStats();
  lines.push('');
  lines.push('# HELP recoder_file_cache_entries Entries in file cache');
  lines.push('# TYPE recoder_file_cache_entries gauge');
  lines.push(`recoder_file_cache_entries ${cacheStats.entries}`);

  lines.push('# HELP recoder_file_cache_size_bytes File cache size in bytes');
  lines.push('# TYPE recoder_file_cache_size_bytes gauge');
  lines.push(`recoder_file_cache_size_bytes ${cacheStats.sizeBytes}`);

  lines.push('# HELP recoder_file_cache_hit_rate File cache hit rate percentage');
  lines.push('# TYPE recoder_file_cache_hit_rate gauge');
  lines.push(`recoder_file_cache_hit_rate ${cacheStats.hitRate}`);

  // Port management metrics
  const portStats = getPortStats();
  lines.push('');
  lines.push('# HELP recoder_ports_used Number of ports currently in use');
  lines.push('# TYPE recoder_ports_used gauge');
  lines.push(`recoder_ports_used ${portStats.usedPortCount}`);

  lines.push('# HELP recoder_ports_containers Containers with port assignments');
  lines.push('# TYPE recoder_ports_containers gauge');
  lines.push(`recoder_ports_containers ${portStats.containerCount}`);

  lines.push('# HELP recoder_ports_range_min Minimum port in allocation range');
  lines.push('# TYPE recoder_ports_range_min gauge');
  lines.push(`recoder_ports_range_min ${portStats.portRange.min}`);

  lines.push('# HELP recoder_ports_range_max Maximum port in allocation range');
  lines.push('# TYPE recoder_ports_range_max gauge');
  lines.push(`recoder_ports_range_max ${portStats.portRange.max}`);

  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(lines.join('\n'));
});

// ==================== END METRICS ENDPOINT ====================

// Create or get container for project (SECURED: requires auth + ownership)
app.post('/api/container', containerLimiter, authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const { projectId, framework, templateId } = req.body;
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

    // Check quota before creating container
    try {
      const quotaEnforcer = getQuotaEnforcer();
      const quotaCheck = quotaEnforcer.checkQuota(userId, MetricType.CONTAINER_HOURS);
      if (quotaCheck.action === EnforcementAction.BLOCK) {
        return res.status(429).json({
          error: 'Quota exceeded',
          message: `You have reached your sandbox limit. Please upgrade your plan or delete unused sandboxes.`,
          quotaType: 'sandboxes',
        });
      }
      if (quotaCheck.action === EnforcementAction.THROTTLE) {
        console.warn(`[Quota] User ${userId} approaching sandbox limit`);
      }
    } catch (_) { /* quota system may not be initialized */ }

    // Fetch user's Claude Code token and AI provider keys (in parallel)
    const createStartTime = Date.now();
    const [claudeCodeToken, aiProviderKeys] = await Promise.all([
      fetchClaudeCodeToken(userId),
      fetchAIProviderKeys(userId),
    ]);
    console.log(`⏱️ [Container] Fetched user credentials in ${Date.now() - createStartTime}ms for ${projectId}`);

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
        return res.json({
          containerId: existing.id,
          reused: true,
          port: existing.port,
          ptyPort: existing.ptyPort,
          // Additional port info for client convenience
          ports: {
            preview: existing.port,         // Port 3000 (Next.js, etc.)
            vite: existing.port + 1,        // Port 5173 (Vite)
            other: existing.port + 2,       // Port 8080 (other servers)
            pty: existing.ptyPort,          // PTY WebSocket
          },
          urls: {
            preview: `http://localhost:${existing.port}`,
            vite: `http://localhost:${existing.port + 1}`,
            pty: `ws://localhost:${existing.ptyPort}`,
          }
        });
      }

      // Container couldn't be restarted, will be recreated below
      console.log(`⚠️ Container ${existing.id.slice(0, 12)} couldn't be restarted, creating new one`);
    }

    // 🔒 RACE CONDITION FIX: Check if container is already being created
    const inProgress = creatingContainers.get(projectId);
    if (inProgress) {
      const ageMs = Date.now() - inProgress.startedAt;
      if (isCreationStale(inProgress, CONTAINER_CREATE_TIMEOUT_MS)) {
        console.warn(`⚠️ In-progress container creation stale (${ageMs}ms), dropping and retrying: ${projectId}`);
        creatingContainers.delete(projectId);
      } else {
        console.log(`⏳ Waiting for in-progress container creation: ${projectId}`);
        try {
          const result = await withCreationTimeout(inProgress.promise, CONTAINER_CREATE_TIMEOUT_MS - ageMs, () => {
            // Clear stale entry so a follow-up request can retry
            creatingContainers.delete(projectId);
          });
        console.log(`✅ Joined completed container creation: ${result.containerId.slice(0, 12)} for ${projectId}`);
        return res.json({
          containerId: result.containerId,
          reused: true,
          port: result.port,
          ptyPort: result.ptyPort,
          // Additional port info for client convenience
          ports: {
            preview: result.port,         // Port 3000 (Next.js, etc.)
            vite: result.port + 1,        // Port 5173 (Vite)
            other: result.port + 2,       // Port 8080 (other servers)
            pty: result.ptyPort,          // PTY WebSocket
          },
          urls: {
            preview: `http://localhost:${result.port}`,
            vite: `http://localhost:${result.port + 1}`,
            pty: `ws://localhost:${result.ptyPort}`,
          }
        });
        } catch (err: any) {
          // Creation failed or timed out, let this request retry
          console.error(`❌ In-progress container creation failed: ${err.message}`);
          return res.status(500).json({ error: err.message });
        }
      }
    }

    // Create the container creation promise and store it
    const creationPromise: Promise<ContainerCreationResult> = (async () => {
      const totalStart = Date.now();
      let hostPort: number | undefined;
      let ptyPort: number | undefined;
      let containerId: string | undefined;
      let fromPool = false;

      try {
        // 🚀 TRY POOL FIRST - instant container acquisition
        if (ENABLE_CONTAINER_POOL && !PERSIST_WORKSPACE) {
          const poolAcquireStart = Date.now();
          const pooled = await containerPool.acquire();
          if (pooled) {
            console.log(`🚀 [Pool] Acquired pre-warmed container ${pooled.id.slice(0, 12)} for ${projectId} (${Date.now() - poolAcquireStart}ms)`);

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

              // Inject ALL env vars into pooled container in a single exec call
              // (Previous approach used 5-7 sequential docker exec calls, each ~200-500ms)
              const envInjectStart = Date.now();
              const containerInstance = docker.getContainer(containerId);

              // Build a single shell script with all env vars
              const envLines: string[] = [
                `export RECODER_PROJECT_ID=${projectId}`,
                `export RECODER_CONTAINER=true`,
                `export DOCKER_BACKEND_URL=https://docker.recoder.xyz`,
                'export NODE_ENV=development',
                'export TERM=xterm-256color',
              ];

              if (claudeCodeToken) {
                envLines.push(`export CLAUDE_CODE_OAUTH_TOKEN=${claudeCodeToken}`);
              }
              if (aiProviderKeys.openai) {
                envLines.push(`export OPENAI_API_KEY=${aiProviderKeys.openai}`);
              }
              if (aiProviderKeys.gemini) {
                envLines.push(`export GEMINI_API_KEY=${aiProviderKeys.gemini}`);
              }
              if (aiProviderKeys.anthropic) {
                envLines.push(`export ANTHROPIC_API_KEY=${aiProviderKeys.anthropic}`);
              }

              // Framework-specific env vars
              const poolFw = (framework || templateId || '').toLowerCase();
              if (poolFw.includes('expo') || poolFw.includes('react-native')) {
                envLines.push(`export REACT_NATIVE_PACKAGER_HOSTNAME=${process.env.PUBLIC_HOSTNAME || 'localhost'}`);
                envLines.push('export EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0');
                envLines.push('export BROWSER=none');
                envLines.push('export CI=1');
              } else if (poolFw.includes('next')) {
                envLines.push('export NEXT_TELEMETRY_DISABLED=1');
              }

              // Write all env vars to profile file in ONE exec call
              const envScript = envLines.join('\\n');
              const envExec = await containerInstance.exec({
                Cmd: ['sh', '-c', `printf '${envScript}\\n' > /etc/profile.d/recoder-env.sh`],
                AttachStdout: false,
                AttachStderr: false,
              });
              await envExec.start({ Detach: true });
              console.log(`⏱️ [Pool] Injected ${envLines.length} env vars in ${Date.now() - envInjectStart}ms for ${projectId}`);
            } // Close: if (pooledStatus.running)
          } // Close: if (pooled)
        } // Close: if (ENABLE_CONTAINER_POOL)

        // FALLBACK: Create new container if pool empty
        if (!containerId) {
          const onDemandStart = Date.now();
          const MAX_ATTEMPTS = 3;
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
              authDebug('injecting claude token into container', { projectId: maskIdentifier(projectId) });
            }

            // Inject AI provider API keys (for Codex, Gemini CLI, OpenCode, etc.)
            if (aiProviderKeys.openai) {
              containerEnv.push(`OPENAI_API_KEY=${aiProviderKeys.openai}`);
              authDebug('injecting OpenAI key into container', { projectId: maskIdentifier(projectId) });
            }
            if (aiProviderKeys.gemini) {
              containerEnv.push(`GEMINI_API_KEY=${aiProviderKeys.gemini}`);
              authDebug('injecting Gemini key into container', { projectId: maskIdentifier(projectId) });
            }
            if (aiProviderKeys.anthropic) {
              containerEnv.push(`ANTHROPIC_API_KEY=${aiProviderKeys.anthropic}`);
              authDebug('injecting Anthropic key into container', { projectId: maskIdentifier(projectId) });
            }

            // Add common env vars for all projects
            containerEnv.push('NODE_ENV=development');
            containerEnv.push('TERM=xterm-256color');

            // Add framework-specific environment variables
            const fw = (framework || templateId || '').toLowerCase();
            if (fw.includes('expo') || fw.includes('react-native')) {
              containerEnv.push(`REACT_NATIVE_PACKAGER_HOSTNAME=${process.env.PUBLIC_HOSTNAME || 'localhost'}`);
              containerEnv.push('EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0');
              containerEnv.push('BROWSER=none');
              containerEnv.push('CI=1');
              console.log(`[Framework] Setting Expo/React Native env vars for project ${projectId}`);
            } else if (fw.includes('next')) {
              containerEnv.push('NEXT_TELEMETRY_DISABLED=1');
              console.log(`[Framework] Setting Next.js env vars for project ${projectId}`);
            }

            // Create new container with security sandbox and port mapping
            // Include port labels for recovery after crashes
            const portLabels = createPortLabels(hostPort!);
            const createStart = Date.now();

            // Add timeout for Docker API calls to prevent infinite hangs
            const DOCKER_API_TIMEOUT_MS = 60000;
            const dockerOpsPromise = (async () => {
              const container = await docker.createContainer({
                Image: IMAGE_NAME,
                Tty: true,
                OpenStdin: true,
                WorkingDir: '/workspace',
                Env: containerEnv,
                Labels: {
                  ...portLabels,
                  projectId: projectId,
                  userId: userId,
                  type: 'workspace',
                },
                ExposedPorts: { '3000/tcp': {}, '5173/tcp': {}, '8080/tcp': {}, '9999/tcp': {}, '8081/tcp': {}, '19006/tcp': {} },
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
                    '8081/tcp': [{ HostPort: String(hostPort + 4) }],
                    '19006/tcp': [{ HostPort: String(hostPort + 5) }],
                  },
                  // Named volumes for persistent workspace and node_modules
                  Binds: [
                    `recoder-${projectId}-workspace:/workspace`,
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
              const createDuration = Date.now() - createStart;
              const startStart = Date.now();
              await containerInstance.start();
              const startDuration = Date.now() - startStart;
              return { containerInstance, createDuration, startDuration };
            })();

            let dockerTimeoutId: NodeJS.Timeout;
            const dockerTimeout = new Promise<never>((_, reject) => {
              dockerTimeoutId = setTimeout(() => reject(new Error(`Docker API timed out after ${DOCKER_API_TIMEOUT_MS}ms`)), DOCKER_API_TIMEOUT_MS);
            });

            try {
              const dockerRaceResult = await Promise.race([dockerOpsPromise, dockerTimeout]);
              const { containerInstance: createdContainer, createDuration, startDuration } = dockerRaceResult;
              containerId = createdContainer.id;
              console.log(`⏱️ [Container] On-demand create=${createDuration}ms start=${startDuration}ms total=${Date.now() - onDemandStart}ms for ${projectId}`);
              break;
            } catch (err: any) {
              const errMsg = err?.message || String(err);
              const isPortConflict = /port is already allocated|Bind for 0\.0\.0\.0:\d+ failed/i.test(errMsg);
              releasePorts(hostPort!, ptyPort!);
              if (isPortConflict) {
                // Mark the conflicting block so the next attempt doesn't reuse it
                markPortBlockUnavailable(hostPort!);
              }
              if (isPortConflict && attempt < MAX_ATTEMPTS) {
                console.warn(`[Container] Port conflict detected, retrying with new ports (attempt ${attempt}/${MAX_ATTEMPTS})`);
                continue;
              }
              throw err;
            } finally {
              clearTimeout(dockerTimeoutId!);
            }
          }
        }

        if (!containerId || hostPort === undefined || ptyPort === undefined) {
          throw new Error('Container creation failed: missing container or ports');
        }

        const resolvedContainerId = containerId;
        const resolvedHostPort = hostPort;
        const resolvedPtyPort = ptyPort;

        // Register container with user tracking
        containers.set(projectId, { id: resolvedContainerId, lastActive: Date.now(), port: resolvedHostPort, ptyPort: resolvedPtyPort, backgroundDev: false, userId });
        registerUserContainer(userId, projectId);

        // Track container in metering system
        try {
          getMeteringCollector().trackContainer(resolvedContainerId, projectId, userId);
        } catch (_) { /* metering may not be initialized yet */ }

        // Register with health monitor
        try {
          healthMonitor.registerContainer(resolvedContainerId, {
            httpEndpoints: [{ name: 'preview', port: resolvedHostPort, path: '/' }],
            tcpPorts: [
              { name: 'preview-tcp', port: resolvedHostPort },
              { name: 'pty-tcp', port: resolvedPtyPort },
            ],
          });
        } catch (_) { /* health monitor may not accept this config format */ }

        // Register with resource optimizer
        try {
          resourceOptimizer.registerContainer(resolvedContainerId);
        } catch (_) { /* resource optimizer may not be initialized */ }

        console.log(`✅ Container ${fromPool ? '(from pool)' : 'created'}: ${resolvedContainerId.slice(0, 12)} for ${projectId} (preview: ${resolvedHostPort}, pty: ${resolvedPtyPort}) [user: ${userId}] [total: ${Date.now() - totalStart}ms]`);
        return { containerId: resolvedContainerId, port: resolvedHostPort, ptyPort: resolvedPtyPort, fromPool };
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
    const creationEntry: ContainerCreationEntry<ContainerCreationResult> = { promise: creationPromise, startedAt: Date.now() };
    if (Number.isFinite(CONTAINER_CREATE_TIMEOUT_MS) && CONTAINER_CREATE_TIMEOUT_MS > 0) {
      creationEntry.timeoutId = setTimeout(() => {
        const current = creatingContainers.get(projectId);
        if (current && current.promise === creationPromise) {
          console.error(`❌ Container creation timed out after ${CONTAINER_CREATE_TIMEOUT_MS}ms, clearing in-progress for ${projectId}`);
          creatingContainers.delete(projectId);
        }
      }, CONTAINER_CREATE_TIMEOUT_MS + 1000);
    }
    creatingContainers.set(projectId, creationEntry);

    // Wait for creation to complete and return result
    let result: ContainerCreationResult;
    try {
      result = await withCreationTimeout(creationPromise, CONTAINER_CREATE_TIMEOUT_MS, () => {
        creatingContainers.delete(projectId);
      });
    } finally {
      if (creationEntry.timeoutId) clearTimeout(creationEntry.timeoutId);
    }
    res.json({
      containerId: result.containerId,
      reused: false,
      fromPool: result.fromPool,
      port: result.port,
      ptyPort: result.ptyPort,
      // Additional port info for client convenience
      ports: {
        preview: result.port,         // Port 3000 (Next.js, etc.)
        vite: result.port + 1,        // Port 5173 (Vite)
        other: result.port + 2,       // Port 8080 (other servers)
        pty: result.ptyPort,          // PTY WebSocket
      },
      urls: {
        preview: `http://localhost:${result.port}`,
        vite: `http://localhost:${result.port + 1}`,
        pty: `ws://localhost:${result.ptyPort}`,
      }
    });
  } catch (err: any) {
    console.error('❌ Container create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List user's active containers sorted by lastActive (oldest first)
app.get('/api/containers', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const projectIds = userContainers.get(userId);

    if (!projectIds || projectIds.size === 0) {
      return res.json({ containers: [], count: 0, max: MAX_CONTAINERS_PER_USER });
    }

    const result: { projectId: string; lastActive: number }[] = [];
    for (const pid of projectIds) {
      const entry = containers.get(pid);
      if (entry) {
        result.push({ projectId: pid, lastActive: entry.lastActive });
      }
    }

    // Sort oldest first (ascending by lastActive)
    result.sort((a, b) => a.lastActive - b.lastActive);

    res.json({ containers: result, count: result.length, max: MAX_CONTAINERS_PER_USER });
  } catch (err: any) {
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

    // Untrack from metering before removal
    try { getMeteringCollector().untrackContainer(entry.id); } catch (_) {}
    try { healthMonitor.unregisterContainer(entry.id); } catch (_) {}
    try { resourceOptimizer.unregisterContainer(entry.id); } catch (_) {}

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
  const fileOpStartTime = Date.now();

  console.log('📝 File write request:', projectId, safePath);
  try {
    const { content } = req.body;

    if (!safePath) {
      metricsCollector.recordFileOperation({
        operation: 'write',
        projectId,
        success: false,
        durationMs: Date.now() - fileOpStartTime,
      });
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
    if (!entry) {
      metricsCollector.recordFileOperation({
        operation: 'write',
        projectId,
        success: false,
        durationMs: Date.now() - fileOpStartTime,
      });
      return res.status(404).json({ error: 'Container not found' });
    }

    // Ensure container is running before file operations
    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({ error: 'Container not running', canRetry: true });
    }

    entry.lastActive = Date.now();

    // FAST FILE WRITE: Use tar-based upload (10x faster than exec-based)
    // This avoids process spawning, shell parsing, and base64 encoding overhead
    try {
      await fastWriteFile(entry.id, safePath, content);
    } catch (tarError: any) {
      // Fallback to exec-based write if tar fails (e.g., permission issues)
      console.warn(`[FastWrite] tar-based write failed, falling back to exec: ${tarError.message}`);
      const container = docker.getContainer(entry.id);
      const b64 = Buffer.from(content).toString('base64');
      const fullPath = `/workspace/${safePath}`;
      const dir = safePath.substring(0, safePath.lastIndexOf('/'));
      const mkdirCmd = dir ? `mkdir -p '/workspace/${dir.replace(/'/g, "'\\''")}' && ` : '';
      const writeCmd = `${mkdirCmd}echo '${b64}' | base64 -d > '${fullPath.replace(/'/g, "'\\''")}'`;
      
      const writeExec = await container.exec({
        Cmd: ['sh', '-c', writeCmd],
        AttachStdout: true,
        AttachStderr: true,
      });
      const writeStream = await writeExec.start({});
      await new Promise<void>((resolve) => {
        writeStream.on('end', resolve);
        writeStream.on('close', resolve);
        setTimeout(resolve, 5000);
      });
    }

    console.log('✅ File write complete:', projectId, safePath, `(${Date.now() - fileOpStartTime}ms)`);

    // Tell FileWatcher to ignore this path on the next poll cycle
    // (prevents sending a change event back to the client that just wrote the file)
    fileWatcher.excludeWrittenPaths(projectId, [safePath]);

    // PERFORMANCE: Invalidate cache on write
    fileCache.invalidate(projectId, safePath);

    // Notify auto-restore that user made a file change (gives more retry attempts)
    devServerManager.onFileChange(projectId);

    // Record successful file operation
    metricsCollector.recordFileOperation({
      operation: 'write',
      projectId,
      success: true,
      durationMs: Date.now() - fileOpStartTime,
    });

    res.json({ success: true });
  } catch (err: any) {
    metricsCollector.recordFileOperation({
      operation: 'write',
      projectId,
      success: false,
      durationMs: Date.now() - fileOpStartTime,
    });
    res.status(500).json({ error: err.message });
  }
});

// Batch write multiple files at once (SECURED)
app.post('/api/files/:projectId/batch', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const batchOpStartTime = Date.now();
  try {
    const { files } = req.body; // Array of { path, content }
    const entry = containers.get(projectId);
    if (!entry) {
      metricsCollector.recordFileOperation({
        operation: 'batch_write',
        projectId,
        success: false,
        durationMs: Date.now() - batchOpStartTime,
        fileCount: files?.length || 0,
      });
      return res.status(404).json({ error: 'Container not found' });
    }

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

    // Sanitize all paths
    const sanitizedFiles = files.map((file: { path: string; content: string }) => {
      const safePath = sanitizePath(file.path);
      return { path: safePath, content: file.content };
    }).filter((f: { path: string }) => f.path); // Remove invalid paths

    const failedFiles: Array<{ path: string; error: string }> = [];

    // FAST BATCH WRITE: Use tar-based upload (10x faster than exec-based)
    // Single network round trip for all files
    try {
      await fastWriteFiles(entry.id, sanitizedFiles);
      console.log(`✅ Batch write complete: ${projectId} ${sanitizedFiles.length} files (${Date.now() - batchOpStartTime}ms)`);
    } catch (tarError: any) {
      // Fallback to exec-based write if tar fails
      console.warn(`[FastWrite] tar-based batch write failed, falling back to exec: ${tarError.message}`);
      const container = docker.getContainer(entry.id);
      
      // Create all directories first
      const dirs = new Set<string>();
      for (const file of sanitizedFiles) {
        const dir = file.path.substring(0, file.path.lastIndexOf('/'));
        if (dir) dirs.add(dir);
      }
      
      if (dirs.size > 0) {
        const mkdirExec = await container.exec({
          Cmd: ['mkdir', '-p', ...Array.from(dirs).map(d => `/workspace/${d}`)],
          AttachStdout: false,
          AttachStderr: false,
        });
        await mkdirExec.start({ Detach: true });
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Write files in parallel batches
      const batchSize = 10;
      for (let i = 0; i < sanitizedFiles.length; i += batchSize) {
        const batch = sanitizedFiles.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (file: { path: string; content: string }) => {
          try {
            const b64 = Buffer.from(file.content).toString('base64');
            const fullPath = `/workspace/${file.path}`;
            const writeExec = await container.exec({
              Cmd: ['sh', '-c', `echo '${b64}' | base64 -d > '${fullPath.replace(/'/g, "'\\''")}'`],
              AttachStdout: true,
              AttachStderr: true,
            });
            const writeStream = await writeExec.start({});
            await new Promise<void>((resolve) => {
              writeStream.on('end', resolve);
              writeStream.on('close', resolve);
              setTimeout(resolve, 10000);
            });
            return { path: file.path, success: true as const };
          } catch (err: any) {
            return { path: file.path, success: false as const, error: err?.message || 'Write failed' };
          }
        }));

        for (const result of results) {
          if (!result.success) {
            failedFiles.push({ path: result.path, error: result.error });
          }
        }
      }
    }

    // Tell FileWatcher to ignore these paths on the next poll cycle
    fileWatcher.excludeWrittenPaths(projectId, sanitizedFiles.map((f: { path: string }) => f.path));

    // PERFORMANCE: Invalidate cache for all written files
    for (const file of sanitizedFiles) {
      fileCache.invalidate(projectId, file.path);
    }

    // Notify auto-restore that user made file changes (gives more retry attempts)
    devServerManager.onFileChange(projectId);

    // Record successful batch write
    metricsCollector.recordFileOperation({
      operation: 'batch_write',
      projectId,
      success: failedFiles.length === 0,
      durationMs: Date.now() - batchOpStartTime,
      fileCount: sanitizedFiles.length,
    });

    res.json({ success: failedFiles.length === 0, count: sanitizedFiles.length, failedFiles });
  } catch (err: any) {
    metricsCollector.recordFileOperation({
      operation: 'batch_write',
      projectId,
      success: false,
      durationMs: Date.now() - batchOpStartTime,
    });
    res.status(500).json({ error: err.message });
  }
});

// Read file from container (SECURED)
// PERFORMANCE: Uses LRU cache for frequently read files
app.get('/api/file/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const readOpStartTime = Date.now();
  try {
    const rawPath = req.query.path as string;
    const safePath = sanitizePath(rawPath);
    const skipCache = req.query.skipCache === 'true';  // Allow cache bypass

    if (!safePath) {
      metricsCollector.recordFileOperation({
        operation: 'read',
        projectId,
        success: false,
        durationMs: Date.now() - readOpStartTime,
      });
      return res.status(400).json({ error: 'Invalid file path' });
    }

    // PERFORMANCE: Check cache first (unless explicitly skipped)
    if (!skipCache) {
      const cached = fileCache.get(projectId, safePath);
      if (cached !== null) {
        // Record cached read as successful
        metricsCollector.recordFileOperation({
          operation: 'read',
          projectId,
          success: true,
          durationMs: Date.now() - readOpStartTime,
        });
        return res.json({ content: cached, cached: true });
      }
    }

    const entry = containers.get(projectId);
    if (!entry) {
      metricsCollector.recordFileOperation({
        operation: 'read',
        projectId,
        success: false,
        durationMs: Date.now() - readOpStartTime,
      });
      return res.status(404).json({ error: 'Container not found' });
    }

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

// Read a single file from a container by projectId (used by api.chat for project config)
app.get('/api/files/read', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const filePath = req.query.path as string;
  // Backward compat: containerId was previously used to pass projectId
  const rawProjectId = (req.query.projectId as string) || (req.query.containerId as string);

  if (!filePath || !rawProjectId) {
    return res.status(400).json({ error: 'path and projectId query params required' });
  }

  try {
    const projectId = sanitizeProjectId(rawProjectId);
    // Find the container entry by projectId
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);
    const safePath = `/workspace/${sanitizePath(filePath)}`;

    const exec = await container.exec({
      Cmd: ['cat', safePath],
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({});
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

    res.json({ content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Workspace state - used to skip re-restoring files on refresh
app.get('/api/workspace-state/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const entry = containers.get(projectId);

  if (!entry) {
    return res.status(404).json({ hasFiles: false, fileCount: 0, hasPackageJson: false, devServerRunning: false });
  }

  try {
    const container = docker.getContainer(entry.id);

    const countExec = await container.exec({
      Cmd: ['/bin/bash', '-c', 'find /workspace -type f -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | wc -l'],
      AttachStdout: true,
      AttachStderr: true,
    });
    const countStream = await countExec.start({});
    const fileCountRaw = await new Promise<string>((resolve, reject) => {
      let out = '';
      countStream.on('data', (chunk: Buffer) => { out += chunk.slice(8).toString(); });
      countStream.on('end', () => resolve(out.trim()));
      countStream.on('error', reject);
    });
    const fileCount = Number(fileCountRaw) || 0;

    const pkgExec = await container.exec({
      Cmd: ['/bin/bash', '-c', 'test -f /workspace/package.json && echo "yes" || echo "no"'],
      AttachStdout: true,
      AttachStderr: true,
    });
    const pkgStream = await pkgExec.start({});
    const pkgRaw = await new Promise<string>((resolve, reject) => {
      let out = '';
      pkgStream.on('data', (chunk: Buffer) => { out += chunk.slice(8).toString(); });
      pkgStream.on('end', () => resolve(out.trim()));
      pkgStream.on('error', reject);
    });
    const hasPackageJson = pkgRaw.includes('yes');

    const candidatePorts = [entry.port + 1, entry.port, entry.port + 4, entry.port + 5, entry.port + 2];
    let devServerRunning = false;
    for (const port of candidatePorts) {
      try {
        const isReady = await new Promise<boolean>((resolve) => {
          const req = http.get(`http://127.0.0.1:${port}`, { timeout: 1500 }, (resp) => {
            resolve(resp.statusCode !== undefined && resp.statusCode < 500);
          });
          req.on('error', () => resolve(false));
          req.on('timeout', () => { req.destroy(); resolve(false); });
        });
        if (isReady) {
          devServerRunning = true;
          break;
        }
      } catch {}
    }

    return res.json({
      hasFiles: fileCount > 0,
      fileCount,
      hasPackageJson,
      devServerRunning,
    });
  } catch (error: any) {
    console.warn(`[WorkspaceState] Failed to inspect workspace for ${projectId}: ${error?.message || error}`);
    return res.status(500).json({ hasFiles: false, fileCount: 0, hasPackageJson: false, devServerRunning: false });
  }
});

// Type check a project workspace using tsc
app.post('/api/typecheck/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const entry = containers.get(projectId);
  if (!entry) return res.status(404).json({ error: 'Container not found' });

  try {
    const container = docker.getContainer(entry.id);
    entry.lastActive = Date.now();

    const tsconfig = await execCommand(
      container,
      'cd /workspace && (test -f tsconfig.app.json && echo "tsconfig.app.json" || (test -f tsconfig.json && echo "tsconfig.json" || echo ""))'
    );

    if (!tsconfig) {
      return res.json({ problems: [], summary: 'No TypeScript config found' });
    }

    const rawOutput = await execCommand(
      container,
      `cd /workspace && tsc --noEmit --pretty false -p ${tsconfig} 2>&1 || true`
    );

    const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
    const lines = stripAnsi(rawOutput).split('\n').map(l => l.trim()).filter(Boolean);

    const problems: Array<{
      file: string;
      line: number;
      column: number;
      message: string;
      severity: 'error' | 'warning';
      code?: string;
    }> = [];

    const tscRegex = /^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/i;
    for (const line of lines) {
      const match = line.match(tscRegex);
      if (!match) continue;
      const [, filePath, lineNum, colNum, severityRaw, code, message] = match;
      const relativeFile = filePath.replace(/^\/workspace\//, '');
      problems.push({
        file: relativeFile,
        line: Number(lineNum),
        column: Number(colNum),
        message: message.trim(),
        severity: severityRaw.toLowerCase() === 'warning' ? 'warning' : 'error',
        code,
      });
    }

    const bodyPaths = Array.isArray(req.body?.paths) ? req.body.paths : undefined;
    const paths = (bodyPaths?.map((p: string) => sanitizePath(p).replace(/^\/+/, '')).filter(Boolean) ?? undefined) as string[] | undefined;
    const filtered = paths && paths.length > 0
      ? problems.filter(p => paths.some(path => p.file === path || p.file.startsWith(`${path}/`)))
      : problems;

    return res.json({
      problems: filtered,
      summary: filtered.length > 0 ? `Found ${filtered.length} problem(s)` : 'No type errors found',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Typecheck failed' });
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

// Copy workspace from one project container to another (SECURED)
app.post('/api/workspace/copy', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  const sourceProjectId = sanitizeProjectId(req.body?.sourceProjectId || '');
  const targetProjectId = sanitizeProjectId(req.body?.targetProjectId || '');
  const includeGit = Boolean(req.body?.includeGit);
  const includeGitRemotes = includeGit && Boolean(req.body?.includeGitRemotes);
  const includeTriggers = Boolean(req.body?.includeTriggers);
  const includeEnvFiles = Boolean(req.body?.includeEnvFiles);
  const includeSecrets = Boolean(req.body?.includeSecrets);
  const includeDeployConfig = Boolean(req.body?.includeDeployConfig);
  const includeDomains = Boolean(req.body?.includeDomains);

  if (!sourceProjectId || !targetProjectId) {
    return res.status(400).json({ error: 'sourceProjectId and targetProjectId are required' });
  }
  if (sourceProjectId === targetProjectId) {
    return res.status(400).json({ error: 'sourceProjectId and targetProjectId must be different' });
  }

  try {
    // Enforce ownership for both projects when authenticated.
    if (req.userId && req.userId !== 'anonymous') {
      const [ownsSource, ownsTarget] = await Promise.all([
        checkProjectOwnership(req.userId, sourceProjectId),
        checkProjectOwnership(req.userId, targetProjectId),
      ]);

      if (!ownsSource || !ownsTarget) {
        if (STRICT_AUTH) {
          return res.status(403).json({ error: 'Access denied: You do not own one or both projects' });
        }
        logWarning(ErrorCode.AUTHZ_OWNERSHIP_CHECK_FAILED, 'Workspace copy ownership verification bypassed in migration mode', {
          userId: maskIdentifier(req.userId),
          sourceProjectId: maskIdentifier(sourceProjectId),
          targetProjectId: maskIdentifier(targetProjectId),
        });
      }
    } else if (STRICT_AUTH) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const sourceEntry = containers.get(sourceProjectId);
    const targetEntry = containers.get(targetProjectId);
    if (!sourceEntry) {
      return res.status(404).json({ error: 'Source container not found' });
    }
    if (!targetEntry) {
      return res.status(404).json({ error: 'Target container not found' });
    }

    const sourceStatus = await ensureContainerRunning(sourceEntry, sourceProjectId);
    const targetStatus = await ensureContainerRunning(targetEntry, targetProjectId);
    if (!sourceStatus.running) {
      return res.status(503).json({ error: 'Source container is not running', canRetry: true });
    }
    if (!targetStatus.running) {
      return res.status(503).json({ error: 'Target container is not running', canRetry: true });
    }

    sourceEntry.lastActive = Date.now();
    targetEntry.lastActive = Date.now();

    const sourceContainer = docker.getContainer(sourceEntry.id);
    const targetContainer = docker.getContainer(targetEntry.id);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'recoder-copy-'));
    const localTarPath = path.join(tempDir, 'workspace-copy.tar');
    const archivePathInSource = '/tmp/recoder-workspace-copy.tar';
    const tarExcludes: string[] = ["--exclude='node_modules'"];
    if (!includeGit) {
      tarExcludes.push("--exclude='.git'");
    }
    if (!includeEnvFiles) {
      tarExcludes.push("--exclude='.env'");
      tarExcludes.push("--exclude='.env.*'");
    }
    if (!includeSecrets) {
      tarExcludes.push("--exclude='*.pem'");
      tarExcludes.push("--exclude='*.key'");
      tarExcludes.push("--exclude='*.p12'");
      tarExcludes.push("--exclude='*.crt'");
      tarExcludes.push("--exclude='*.cer'");
      tarExcludes.push("--exclude='.npmrc'");
      tarExcludes.push("--exclude='id_rsa'");
      tarExcludes.push("--exclude='id_ed25519'");
    }
    if (!includeDeployConfig) {
      tarExcludes.push("--exclude='.vercel'");
      tarExcludes.push("--exclude='.netlify'");
      tarExcludes.push("--exclude='.firebase'");
      tarExcludes.push("--exclude='vercel.json'");
      tarExcludes.push("--exclude='netlify.toml'");
      tarExcludes.push("--exclude='render.yaml'");
      tarExcludes.push("--exclude='docker-compose*.yml'");
      tarExcludes.push("--exclude='docker-compose*.yaml'");
    }
    if (!includeDomains) {
      tarExcludes.push("--exclude='CNAME'");
    }

    try {
      // Create tar archive in source container, always excluding node_modules for speed/size.
      await execInContainer(
        sourceEntry.id,
        `cd /workspace && tar ${tarExcludes.join(' ')} -cf ${archivePathInSource} .`,
      );

      // Copy archive source-container -> host temp.
      await runHostCommand('docker', ['cp', `${sourceEntry.id}:${archivePathInSource}`, localTarPath]);

      // Clear target workspace before extracting copied archive.
      await execInContainer(
        targetEntry.id,
        `find /workspace -mindepth 1 -maxdepth 1 ! -name 'node_modules' -exec rm -rf {} +`,
      );

      // Copy archive host -> target container workspace.
      await targetContainer.putArchive(createReadStream(localTarPath), { path: '/workspace' });

      // By default, do not carry over git remotes from source project.
      if (includeGit && !includeGitRemotes) {
        await execInContainer(
          targetEntry.id,
          "cd /workspace && if [ -d .git ] && command -v git >/dev/null 2>&1; then for remote in $(git remote 2>/dev/null); do git remote remove \"$remote\" || true; done; fi",
        );
      }

      // Best-effort cleanup in source container.
      await execInContainer(
        sourceEntry.id,
        `rm -f ${archivePathInSource}`,
      ).catch(() => {});
    } finally {
      // Clean temporary host files.
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    // Invalidate project-level cache entries so copied files appear immediately.
    fileCache.invalidate(sourceProjectId);
    fileCache.invalidate(targetProjectId);

    auditLog({
      userId: req.userId,
      action: 'WORKSPACE_COPY',
      projectId: targetProjectId,
      details: {
        sourceProjectId,
        includeGit,
        includeGitRemotes,
        includeTriggers,
        includeEnvFiles,
        includeSecrets,
        includeDeployConfig,
        includeDomains,
      },
      ip: req.ip,
    });

    return res.json({
      success: true,
      sourceProjectId,
      targetProjectId,
      includeGit,
      includeGitRemotes,
      includeTriggers,
      includeEnvFiles,
      includeSecrets,
      includeDeployConfig,
      includeDomains,
    });
  } catch (err: any) {
    console.error(`[WorkspaceCopy] Failed ${sourceProjectId} -> ${targetProjectId}:`, err);
    return res.status(500).json({ error: err?.message || 'Workspace copy failed' });
  }
});

// Export project files as ZIP (SECURED)
// Returns file tree with content for export functionality
app.get('/api/export/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const exportStartTime = Date.now();

  try {
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
    const container = docker.getContainer(entry.id);

    // Get exclude patterns from query (comma-separated)
    const excludePatterns = (req.query.exclude as string)?.split(',') || [
      'node_modules',
      '.next',
      'dist',
      'build',
      '.git',
      '.cache',
      'coverage',
      '*.log',
    ];

    // Build find command with exclusions
    // Use find to get all files, excluding common build artifacts
    const excludeArgs: string[] = [];
    excludePatterns.forEach((pattern) => {
      excludeArgs.push('-not', '-path', `*/${pattern}/*`, '-not', '-name', pattern);
    });

    const findExec = await container.exec({
      Cmd: ['find', '/workspace', '-type', 'f', ...excludeArgs, '-size', '-1M'],
      AttachStdout: true,
      AttachStderr: true,
    });

    const findStream = await findExec.start({});
    const findChunks: Buffer[] = [];

    await new Promise<void>((resolve) => {
      findStream.on('data', (chunk: Buffer) => findChunks.push(chunk));
      findStream.on('end', resolve);
    });

    // Parse Docker multiplexed stream
    const rawFind = Buffer.concat(findChunks);
    let findOutput = '';
    let idx = 0;
    while (idx < rawFind.length) {
      if (idx + 8 <= rawFind.length) {
        const size = rawFind.readUInt32BE(idx + 4);
        if (idx + 8 + size <= rawFind.length) {
          findOutput += rawFind.slice(idx + 8, idx + 8 + size).toString();
          idx += 8 + size;
        } else break;
      } else break;
    }

    const filePaths = findOutput.split('\n').filter(Boolean);

    // Read file contents in batches
    const files: Array<{ path: string; content: string; type: 'file' }> = [];
    const failed: Array<{ path: string; error: string }> = [];

    // Process files in batches of 20
    const batchSize = 20;
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);

      const batchPromises = batch.map(async (fullPath) => {
        const relativePath = fullPath.replace('/workspace/', '');

        try {
          const catExec = await container.exec({
            Cmd: ['cat', fullPath],
            AttachStdout: true,
            AttachStderr: true,
          });
          const catStream = await catExec.start({});
          const catChunks: Buffer[] = [];

          await new Promise<void>((resolve) => {
            catStream.on('data', (chunk: Buffer) => catChunks.push(chunk));
            catStream.on('end', resolve);
          });

          // Parse Docker multiplexed stream
          const rawCat = Buffer.concat(catChunks);
          let content = '';
          let j = 0;
          while (j < rawCat.length) {
            if (j + 8 <= rawCat.length) {
              const size = rawCat.readUInt32BE(j + 4);
              if (j + 8 + size <= rawCat.length) {
                content += rawCat.slice(j + 8, j + 8 + size).toString();
                j += 8 + size;
              } else break;
            } else break;
          }

          // Skip binary files (check for null bytes)
          if (content.includes('\x00')) {
            return null;
          }

          return {
            path: '/' + relativePath,
            content,
            type: 'file' as const,
          };
        } catch (err: any) {
          failed.push({ path: relativePath, error: err.message });
          return null;
        }
      });

      const results = await Promise.all(batchPromises);
      files.push(...results.filter((f): f is NonNullable<typeof f> => f !== null));
    }

    const exportDuration = Date.now() - exportStartTime;
    console.log(`[export] Project ${projectId}: ${files.length} files exported in ${exportDuration}ms`);

    res.json({
      success: true,
      files,
      directories: [], // Could be added if needed
      failed,
      stats: {
        totalFiles: files.length,
        failedFiles: failed.length,
        durationMs: exportDuration,
      },
    });
  } catch (err: any) {
    console.error(`[export] Failed for project ${projectId}:`, err);
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
      const portsToCheck = [entry.port + 1, entry.port, entry.port + 4, entry.port + 5, entry.port + 2]; // Vite (5173), Next.js (3000), Expo (8081), Expo legacy (19006), Other (8080)
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
    const safeCommand = typeof req.body?.command === 'string' ? req.body.command.substring(0, 500) : '';
    const safeCwd = typeof req.body?.cwd === 'string' ? req.body.cwd : '/workspace';
    const isDockerUnavailable = /connect\s+econnrefused|enoent|socket hang up|no such container|container.*not found|is not running/i.test(errMsg);

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

    console.error('❌ Command execution failed:', {
      projectId: req.params.projectId,
      command: safeCommand,
      cwd: safeCwd,
      error: errMsg || 'Unknown error',
    });
    res.status(isDockerUnavailable ? 503 : 500).json({
      error: errMsg,
      success: false,
      exitCode,
      output: errMsg,
      canRetry: isDockerUnavailable
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
    const source = req.query.source as string | undefined;
    const logs = await devServerManager.getLogs(entry.id, projectId, tail, source);

    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get dev server logs with parsed errors - used by auto-fix feature
app.get('/api/logs/:projectId/parsed', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const tail = Math.min(parseInt(req.query.tail as string) || 100, 1000);
    const source = req.query.source as string | undefined;
    const logs = await devServerManager.getLogs(entry.id, projectId, tail, source);

    // Parse errors from logs
    const errors = parseAllErrors(logs);
    const blocking = hasBlockingErrors(logs);

    res.json({
      logs,
      errors,
      hasBlockingErrors: blocking,
      timestamp: Date.now(),
    });
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
      const restoreCheck = autoRestoreManager.shouldRestore(projectId);
      if (hasError && restoreCheck.allowed) {
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

    // Get retry state for frontend
    const retryState = autoRestoreManager.getState(projectId);

    res.json({
      errors,
      hasBlockingErrors: blocking,
      devServerStatus: devStatus?.status === 'running' ? 'running' : (blocking ? 'crashed' : 'idle'),
      errorCount: errors.length,
      lastLogTimestamp: Date.now(),
      autoRestore: autoRestoreResult,
      retryState: {
        errorCount: retryState.errorCount,
        maxRetries: retryState.maxRetries,
        canRetry: retryState.canRetry,
        nextRetryIn: retryState.nextRetryIn,
      },
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
      // Auto-restore to last working snapshot (force if requested)
      const result = await autoRestoreManager.attemptRestore(entry.id, projectId, force);
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
    const ports = [entry.port + 1, entry.port, entry.port + 4, entry.port + 5, entry.port + 2]; // Vite, Next.js, Expo, Expo legacy, Other

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
    const ports = [entry.port + 1, entry.port, entry.port + 4, entry.port + 5, entry.port + 2];

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
    const errorInfo = devServerManager.getErrorInfo(projectId);

    res.json({
      status,
      isRunning,
      backgroundDev: entry.backgroundDev,
      errors: errorInfo.hasErrors ? errorInfo.errors : undefined,
      retryState: errorInfo.retryState,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-detect framework from project files
app.get('/api/dev-server/detect-framework/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const entry = containers.get(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const framework = await detectFrameworkFromContainer(entry.id);
    const installCommand = getInstallCommand(framework);
    const devCommand = getDevCommand(framework);
    const ports = [entry.port + 1, entry.port, entry.port + 4, entry.port + 5, entry.port + 2];
    const expectedPorts = getExpectedPorts(framework, ports);

    res.json({
      framework,
      installCommand,
      devCommand,
      expectedPorts,
      language: getLanguageFromFramework(framework),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Force retry dev server after max retries reached
app.post('/api/dev-server/force-retry', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  try {
    const { projectId } = req.body;
    const safeProjectId = sanitizeProjectId(projectId);

    // Verify ownership
    const entry = containers.get(safeProjectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });
    if (entry.userId && entry.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const ports = [entry.port + 1, entry.port, entry.port + 4, entry.port + 5, entry.port + 2];

    auditLog({
      userId: req.userId,
      action: 'DEV_SERVER_FORCE_RETRY',
      projectId: safeProjectId,
      ip: req.ip,
    });

    const result = await devServerManager.forceRetry(entry.id, safeProjectId, ports);

    res.json(result);
  } catch (err: any) {
    console.error('Force retry failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Reset auto-restore state for a project (manual reset)
app.post('/api/dev-server/reset-errors', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  try {
    const { projectId } = req.body;
    const safeProjectId = sanitizeProjectId(projectId);

    // Verify ownership
    const entry = containers.get(safeProjectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });
    if (entry.userId && entry.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    auditLog({
      userId: req.userId,
      action: 'DEV_SERVER_RESET_ERRORS',
      projectId: safeProjectId,
      ip: req.ip,
    });

    autoRestoreManager.forceReset(safeProjectId);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Configure auto-restore (admin only - requires auth)
app.post('/api/auto-restore/config', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  try {
    const { enabled, maxRetries, baseCooldownMs, maxCooldownMs } = req.body;

    auditLog({
      userId: req.userId,
      action: 'AUTO_RESTORE_CONFIG',
      details: { enabled, maxRetries, baseCooldownMs, maxCooldownMs },
      ip: req.ip,
    });

    autoRestoreManager.configure({ enabled, maxRetries, baseCooldownMs, maxCooldownMs });
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

    // Check if project has Neon linked — capture DB timestamp
    let neonDbTimestamp: string | undefined;
    try {
      const links = integrationStore.getProjectLinks(projectId);
      if (links.neon?.projectId && req.userId) {
        const creds = integrationStore.getUserCredentials(req.userId);
        if (creds.neon?.apiKey) {
          neonDbTimestamp = new Date().toISOString();
          console.log(`[Snapshot] Capturing Neon DB timestamp: ${neonDbTimestamp} for ${projectId}`);
        }
      }
    } catch (err: any) {
      console.warn(`[Snapshot] Failed to capture DB timestamp: ${err.message}`);
    }

    entry.lastActive = Date.now();
    const snapshot = await snapshotManager.createSnapshot(entry.id, projectId, message, author, { neonDbTimestamp });

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

    // Restore Git files
    await snapshotManager.restoreSnapshot(entry.id, projectId, safeSnapshotId);

    // Check if snapshot has a Neon DB timestamp and restore DB state
    let dbRestored = false;
    try {
      const neonDbTimestamp = await snapshotManager.getSnapshotDbTimestamp(entry.id, safeSnapshotId);
      if (neonDbTimestamp && req.userId) {
        const links = integrationStore.getProjectLinks(projectId);
        const creds = integrationStore.getUserCredentials(req.userId);
        if (links.neon?.projectId && links.neon?.developmentBranchId && creds.neon?.apiKey) {
          console.log(`[Snapshot] Restoring Neon DB to ${neonDbTimestamp} for ${projectId}`);
          await neonClient.restoreBranch(
            creds.neon.apiKey,
            links.neon.projectId,
            links.neon.developmentBranchId,
            neonDbTimestamp,
          );
          dbRestored = true;
          console.log(`[Snapshot] Neon DB restored successfully for ${projectId}`);
        }
      }
    } catch (dbErr: any) {
      console.warn(`[Snapshot] DB restore failed (files still restored): ${dbErr.message}`);
    }

    res.json({ success: true, restoredTo: safeSnapshotId, dbRestored });
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
    // Untrack from metering before removal
    try { getMeteringCollector().untrackContainer(containerId); } catch (_) {}
    try { healthMonitor.unregisterContainer(containerId); } catch (_) {}
    try { resourceOptimizer.unregisterContainer(containerId); } catch (_) {}

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

// Debug: HTTP test route to verify routing works
app.get('/terminal-test/:projectId', (req, res) => {
  console.log(`🔌 [Terminal-Test] HTTP request for project: ${req.params.projectId}`);
  res.json({ status: 'ok', projectId: req.params.projectId });
});

// Log all upgrade attempts
app.use((req, res, next) => {
  if (req.headers.upgrade === 'websocket') {
    console.log(`🔌 [WebSocket] Upgrade request: ${req.method} ${req.url} from ${req.headers.origin || 'unknown'}`);
  }
  next();
});

app.ws('/terminal/:projectId', async (ws, req) => {
  const { projectId } = req.params;
  const terminalId = req.query.terminalId as string || `term-${Date.now()}`;

  console.log(`🔌 [Terminal] WebSocket connection attempt for project: ${projectId}, terminalId: ${terminalId}`);
  console.log(`🔌 [Terminal] Origin: ${req.headers.origin}, IP: ${req.ip}`);

  // Authenticate WebSocket connection
  console.log(`🔌 [Terminal] Authenticating...`);
  const authSession = await authenticateWebSocket(ws, req);
  if (!authSession) {
    console.log(`🔌 [Terminal] Auth FAILED for project: ${projectId}`);
    return; // Connection closed by auth helper
  }
  console.log(`🔌 [Terminal] Auth SUCCESS - userId: ${authSession.userId}`);

  // Register for WebSocket keepalive (ping/pong every 30s, timeout after 60s)
  wsKeepalive.register(ws as any, projectId, 'terminal', authSession.userId);

  // Register for WebSocket rate limiting
  const terminalRateLimiter = getWsRateLimiter('terminal');
  terminalRateLimiter.track(ws as any);

  let entry = containers.get(projectId);

  // Try to recover container from Docker if not in memory (after backend restart)
  if (!entry) {
    console.log(`⚠️ [Terminal] Container not in memory for ${projectId}, attempting recovery...`);
    try {
      // Add timeout to listContainers (10 seconds) to prevent blocking
      const allContainers = await withTimeout(
        docker.listContainers({ all: false }),
        10000,
        'docker.listContainers'
      );
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
    } catch (err: any) {
      console.error(`❌ [Terminal] Recovery failed for ${projectId}:`, err.message || err);
    }
  }

  if (!entry) {
    wsKeepalive.closeWithHint(ws as any, 'container_not_found', 'Container not found for this project', 1008);
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

    // Create exec instance for interactive shell with timeout (10 seconds)
    const exec = await withTimeout(
      container.exec({
        Cmd: ['/bin/bash'],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
      }),
      10000,
      'container.exec'
    );

    // Start exec with timeout (10 seconds)
    const stream = await withTimeout(
      exec.start({ hijack: true, stdin: true }),
      10000,
      'exec.start'
    ) as Duplex;
    
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
      // Rate limit check
      if (!terminalRateLimiter.allowMessage(ws as any)) {
        return; // Drop message silently
      }

      entry.lastActive = Date.now();
      lifecycleManager.resetTimer(projectId);

      // Handle JSON messages (ping/pong, RPC) before piping to terminal
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          // Respond to heartbeat pings from the client
          if (parsed.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            return;
          }
        } catch {
          // Not JSON — fall through to RPC check then terminal
        }
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

      // Handle JSON messages (ping/pong, RPC) before piping to terminal
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            return;
          }
        } catch {
          // Not JSON — fall through to RPC check then terminal
        }
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

// NOTE: FileWatch WebSocket endpoint moved to end of file (after preview proxy setup)
// to consolidate with the shared client management implementation

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
      const allContainers = await withTimeout(
        docker.listContainers({ all: false }),
        10000,
        'docker.listContainers'
      );
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

// ==================== Project Type Detection API ====================

// Detect project framework/type by inspecting container files
app.get('/api/project-type/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);

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
    const container = docker.getContainer(entry.id);

    // Helper to read a file from the container, returns null if not found
    async function readContainerFile(filePath: string): Promise<string | null> {
      try {
        return await execCommand(container, `cat ${filePath}`);
      } catch {
        return null;
      }
    }

    // Read key config files in parallel
    const [packageJsonRaw, appJsonRaw, requirementsTxt] = await Promise.all([
      readContainerFile('/workspace/package.json'),
      readContainerFile('/workspace/app.json'),
      readContainerFile('/workspace/requirements.txt'),
    ]);

    // Check for various config files (Next.js, Vite)
    const [nextConfigJs, nextConfigMjs, nextConfigTs, viteConfigTs, viteConfigJs] = await Promise.all([
      readContainerFile('/workspace/next.config.js'),
      readContainerFile('/workspace/next.config.mjs'),
      readContainerFile('/workspace/next.config.ts'),
      readContainerFile('/workspace/vite.config.ts'),
      readContainerFile('/workspace/vite.config.js'),
    ]);

    let type = 'unknown';
    let name = '';
    let version = '';

    // Parse package.json if it exists
    let packageJson: any = null;
    if (packageJsonRaw) {
      try {
        packageJson = JSON.parse(packageJsonRaw);
        name = packageJson.name || '';
        version = packageJson.version || '';
      } catch {
        // Invalid JSON, continue with detection
      }
    }

    const deps = packageJson?.dependencies || {};
    const devDeps = packageJson?.devDependencies || {};
    const allDeps = { ...deps, ...devDeps };

    // Detect Expo: has "expo" in dependencies + app.json with expo config
    if (deps['expo'] && appJsonRaw) {
      try {
        const appJson = JSON.parse(appJsonRaw);
        if (appJson.expo) {
          type = 'expo';
        }
      } catch {
        // If app.json isn't valid JSON but expo dep exists, still mark as expo
        if (deps['expo']) {
          type = 'expo';
        }
      }
    }

    // Detect Next.js: has "next" in dependencies or next.config file exists
    if (type === 'unknown' && (deps['next'] || nextConfigJs || nextConfigMjs || nextConfigTs)) {
      type = 'nextjs';
    }

    // Detect Vite + React
    if (type === 'unknown' && (allDeps['vite'] || viteConfigTs || viteConfigJs) && allDeps['react']) {
      type = 'vite-react';
    }

    // Detect Vite + Vue
    if (type === 'unknown' && (allDeps['vite'] || viteConfigTs || viteConfigJs) && allDeps['vue']) {
      type = 'vite-vue';
    }

    // Detect Express
    if (type === 'unknown' && deps['express']) {
      type = 'express';
    }

    // Detect Python frameworks from requirements.txt
    if (type === 'unknown' && requirementsTxt) {
      const reqLower = requirementsTxt.toLowerCase();
      if (reqLower.includes('flask')) {
        type = 'flask';
        name = name || 'flask-app';
      } else if (reqLower.includes('django')) {
        type = 'django';
        name = name || 'django-app';
      }
    }

    res.json({ type, name, version });
  } catch (err: any) {
    console.error(`[ProjectType] Detection failed for project ${req.params.projectId}:`, err);
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

    const branchValidation = validateBranchName(name, 'name');
    if (!branchValidation.valid) {
      return res.status(400).json({ error: branchValidation.error });
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

    const branchValidation = validateBranchName(branch, 'branch');
    if (!branchValidation.valid) {
      return res.status(400).json({ error: branchValidation.error });
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

    const branchValidation = validateBranchName(branchName, 'name');
    if (!branchValidation.valid) {
      return res.status(400).json({ error: branchValidation.error });
    }

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

    const msgValidation = validateCommitMessage(message);
    if (!msgValidation.valid) {
      return res.status(400).json({ error: msgValidation.error });
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

// Auto-commit: init git + stage all + commit (used after AI generates files)
app.post('/api/git/:projectId/auto-commit', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { message } = req.body;

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    entry.lastActive = Date.now();

    const result = await gitOperations.autoCommit(entry.id, message);

    if (result.error) {
      console.error('[Git] Auto-commit error:', result.error);
      return res.status(500).json({ error: result.error });
    }

    res.json(result);
  } catch (err: any) {
    console.error('[Git] Auto-commit error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Revert to a specific commit (checkout all files from that commit)
app.post('/api/git/:projectId/revert', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { commitHash } = req.body;

    const hashValidation = validateCommitHash(commitHash);
    if (!hashValidation.valid) {
      return res.status(400).json({ error: hashValidation.error });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_REVERT',
      projectId,
      details: { commitHash: commitHash.substring(0, 40) },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await gitOperations.revertToCommit(entry.id, commitHash);

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (err: any) {
    console.error('[Git] Revert error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Remote Git Operations ──

// Get remotes
app.get('/api/git/:projectId/remotes', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }
    entry.lastActive = Date.now();
    const remotes = await gitOperations.getRemotes(entry.id);
    res.json({ remotes });
  } catch (err: any) {
    console.error('[Git] Remotes error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Set remote
app.post('/api/git/:projectId/remote', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { name, url } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: 'name and url are required' });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_SET_REMOTE',
      projectId,
      details: { name, url: url.replace(/ghp_[a-zA-Z0-9]+/, 'ghp_***') },
      ip: req.ip,
    });

    entry.lastActive = Date.now();
    const result = await gitOperations.setRemote(entry.id, name, url);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Set remote error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete remote
app.delete('/api/git/:projectId/remote/:name', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const name = decodeURIComponent(req.params.name);

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_REMOVE_REMOTE',
      projectId,
      details: { name },
      ip: req.ip,
    });

    entry.lastActive = Date.now();
    const result = await gitOperations.removeRemote(entry.id, name);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Remove remote error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Push to remote
app.post('/api/git/:projectId/push', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { remote, branch, force, setUpstream, token } = req.body;

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_PUSH',
      projectId,
      details: { remote: remote || 'origin', branch, force: !!force },
      ip: req.ip,
    });

    entry.lastActive = Date.now();
    const result = await gitOperations.push(entry.id, remote || 'origin', branch, {
      force,
      setUpstream,
      token,
    });

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Push error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Pull from remote
app.post('/api/git/:projectId/pull', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { remote, branch, rebase, token } = req.body;

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_PULL',
      projectId,
      details: { remote: remote || 'origin', branch, rebase: !!rebase },
      ip: req.ip,
    });

    entry.lastActive = Date.now();
    const result = await gitOperations.pull(entry.id, remote || 'origin', branch, {
      rebase,
      token,
    });

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(result.conflicts ? 409 : 400).json({
        error: result.error,
        conflicts: result.conflicts,
      });
    }
  } catch (err: any) {
    console.error('[Git] Pull error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Fetch from remote (no merge)
app.post('/api/git/:projectId/fetch', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { remote, token } = req.body;

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    entry.lastActive = Date.now();
    const result = await gitOperations.fetchRemote(entry.id, remote || 'origin', { token });

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Clone a repository into the project's container
app.post('/api/git/:projectId/clone', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { url, branch, token, depth } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_CLONE',
      projectId,
      details: { url: url.replace(/ghp_[a-zA-Z0-9]+/, 'ghp_***'), branch },
      ip: req.ip,
    });

    entry.lastActive = Date.now();
    const result = await gitOperations.cloneRepo(entry.id, url, { branch, token, depth });

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Clone error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Enhanced Git Operations ──

// Get git state (merging, rebasing, cherry-picking, or clean)
app.get('/api/git/:projectId/state', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    entry.lastActive = Date.now();

    const state = await gitOperations.getGitState(entry.id);
    res.json(state);
  } catch (err: any) {
    console.error('[Git] State error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get conflict files
app.get('/api/git/:projectId/conflicts', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    entry.lastActive = Date.now();

    const conflicts = await gitOperations.getConflicts(entry.id);
    res.json(conflicts);
  } catch (err: any) {
    console.error('[Git] Conflicts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Merge branch into current
app.post('/api/git/:projectId/merge', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { branch, noFf, squash } = req.body;

    const branchValidation = validateBranchName(branch, 'branch');
    if (!branchValidation.valid) {
      return res.status(400).json({ error: branchValidation.error });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_MERGE',
      projectId,
      details: { branch, noFf: !!noFf, squash: !!squash },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await gitOperations.merge(entry.id, branch, { noFf, squash });
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(result.conflicts ? 409 : 400).json({
        error: result.error,
        conflicts: result.conflicts,
      });
    }
  } catch (err: any) {
    console.error('[Git] Merge error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Rebase current onto branch
app.post('/api/git/:projectId/rebase', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { branch } = req.body;

    const branchValidation = validateBranchName(branch, 'branch');
    if (!branchValidation.valid) {
      return res.status(400).json({ error: branchValidation.error });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_REBASE',
      projectId,
      details: { branch },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await gitOperations.rebase(entry.id, branch);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(result.conflicts ? 409 : 400).json({
        error: result.error,
        conflicts: result.conflicts,
      });
    }
  } catch (err: any) {
    console.error('[Git] Rebase error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Abort rebase
app.post('/api/git/:projectId/rebase-abort', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_REBASE_ABORT',
      projectId,
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await gitOperations.rebaseAbort(entry.id);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Rebase abort error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Continue rebase
app.post('/api/git/:projectId/rebase-continue', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_REBASE_CONTINUE',
      projectId,
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await gitOperations.rebaseContinue(entry.id);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(result.conflicts ? 409 : 400).json({
        error: result.error,
        conflicts: result.conflicts,
      });
    }
  } catch (err: any) {
    console.error('[Git] Rebase continue error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Rename branch
app.post('/api/git/:projectId/branch-rename', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { oldName, newName } = req.body;

    const oldValidation = validateBranchName(oldName, 'oldName');
    if (!oldValidation.valid) {
      return res.status(400).json({ error: oldValidation.error });
    }

    const newValidation = validateBranchName(newName, 'newName');
    if (!newValidation.valid) {
      return res.status(400).json({ error: newValidation.error });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_RENAME_BRANCH',
      projectId,
      details: { oldName, newName },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await gitOperations.renameBranch(entry.id, oldName, newName);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Branch rename error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Force push with lease (safe force push)
app.post('/api/git/:projectId/force-push', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { remote, branch, token } = req.body;

    if (!remote || !branch) {
      return res.status(400).json({ error: 'remote and branch are required' });
    }

    const branchValidation = validateBranchName(branch, 'branch');
    if (!branchValidation.valid) {
      return res.status(400).json({ error: branchValidation.error });
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    auditLog({
      userId: req.userId,
      action: 'GIT_FORCE_PUSH',
      projectId,
      details: { remote, branch },
      ip: req.ip,
    });

    entry.lastActive = Date.now();

    const result = await gitOperations.pushForceWithLease(entry.id, remote, branch, token);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err: any) {
    console.error('[Git] Force push error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== End Git API ====================

// ==================== Visual Editing API ====================

// Apply visual editing changes to source files
app.post('/api/visual-edit/:projectId/apply', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { changes } = req.body;

    if (!changes || !Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ error: 'changes array is required' });
    }

    // Validate each change
    for (const change of changes) {
      if (!change.filePath || typeof change.filePath !== 'string') {
        return res.status(400).json({ error: 'Each change must have a filePath' });
      }
      if (!change.lineNumber || typeof change.lineNumber !== 'number') {
        return res.status(400).json({ error: 'Each change must have a lineNumber' });
      }
      if (!change.styles || typeof change.styles !== 'object') {
        return res.status(400).json({ error: 'Each change must have a styles object' });
      }
    }

    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    entry.lastActive = Date.now();

    // Dynamically import visual editing transform (avoid loading babel unless needed)
    const { transformContent } = await import('./visual-editing-transform.js');

    // Helper: read file from container
    const readFileFromContainer = async (containerId: string, filePath: string): Promise<string> => {
      const container = docker.getContainer(containerId);
      const exec = await container.exec({
        Cmd: ['cat', filePath],
        AttachStdout: true,
        AttachStderr: true,
      });
      const stream = await exec.start({ hijack: true, stdin: false });
      return new Promise((resolve, reject) => {
        let content = '';
        stream.on('data', (chunk: Buffer) => { content += chunk.slice(8).toString(); });
        stream.on('end', () => resolve(content));
        stream.on('error', reject);
      });
    };

    // Helper: write file to container
    const writeFileToContainer = async (containerId: string, filePath: string, content: string): Promise<void> => {
      const container = docker.getContainer(containerId);
      const exec = await container.exec({
        Cmd: ['sh', '-c', `mkdir -p "$(dirname "${filePath}")" && cat > "${filePath}"`],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
      });
      const stream = await exec.start({ hijack: true, stdin: true });
      stream.write(content);
      stream.end();
    };

    // Group changes by file
    const changesByFile = new Map<string, typeof changes>();
    for (const change of changes) {
      const existing = changesByFile.get(change.filePath) || [];
      existing.push(change);
      changesByFile.set(change.filePath, existing);
    }

    const modifiedFiles: string[] = [];
    const errors: string[] = [];

    for (const [filePath, fileChanges] of changesByFile) {
      try {
        // Read file from container
        const content = await readFileFromContainer(entry.id, `/workspace/${filePath}`);

        // Transform the content
        const result = transformContent(content, fileChanges);

        if (result.success && result.content) {
          // Write back to container
          await writeFileToContainer(entry.id, `/workspace/${filePath}`, result.content);
          modifiedFiles.push(filePath);
        } else {
          errors.push(`${filePath}: ${result.error}`);
        }
      } catch (fileErr: any) {
        errors.push(`${filePath}: ${fileErr.message}`);
      }
    }

    if (modifiedFiles.length > 0) {
      res.json({
        success: true,
        modifiedFiles,
        errors: errors.length > 0 ? errors : undefined,
      });
    } else {
      res.status(400).json({
        success: false,
        error: errors.join('; ') || 'No files were modified',
      });
    }
  } catch (err: any) {
    console.error('[VisualEdit] Apply error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== End Visual Editing API ====================

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

  // Register for WebSocket keepalive (ping/pong every 30s, timeout after 60s)
  wsKeepalive.register(ws as any, projectId, 'sync', authSession.userId);

  // Register for WebSocket rate limiting
  const syncRateLimiter = getWsRateLimiter('sync');
  syncRateLimiter.track(ws as any);

  const entry = containers.get(projectId);
  if (!entry) {
    wsKeepalive.closeWithHint(ws as any, 'container_not_found', 'Container not found for this project', 1008);
    return;
  }

  const container = docker.getContainer(entry.id);

  ws.on('message', async (data) => {
    // Rate limit check
    if (!syncRateLimiter.allowMessage(ws as any)) {
      ws.send(JSON.stringify({ action: 'error', error: 'Rate limit exceeded' }));
      return;
    }

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
        // Untrack from metering before removal
        try { getMeteringCollector().untrackContainer(entry.id); } catch (_) {}
        try { healthMonitor.unregisterContainer(entry.id); } catch (_) {}
        try { resourceOptimizer.unregisterContainer(entry.id); } catch (_) {}

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
        const projectIdLabel = c.Labels?.projectId;
        const isRunning = c.State === 'running';
        // Keep any running container to avoid breaking active workspaces or pool warmups
        if (isRunning) {
          console.log(`🧹 [Startup] Keeping running container ${c.Id.slice(0, 12)}${projectIdLabel ? ` (${projectIdLabel})` : ''}`);
          continue;
        }
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

  // Step 1.5: Sync port manager with any remaining Docker containers
  console.log('🔌 [Startup] Syncing port manager with Docker...');
  try {
    await syncPortsWithDocker();
    const portStats = getPortStats();
    console.log(`✅ [Startup] Port manager synced: ${portStats.containerCount} containers, ${portStats.usedPortCount} ports in use`);
  } catch (e: any) {
    console.error('❌ [Startup] Port sync failed:', e.message);
  }

  // Step 1.6: Restore running project containers into in-memory registry
  console.log('📦 [Startup] Restoring running project containers...');
  try {
    const liveContainers = await docker.listContainers({ all: false });
    let restored = 0;

    const inferBasePort = (ports: number[]): number | undefined => {
      if (ports.length < 6) return undefined;
      const portSet = new Set(ports);
      const sorted = Array.from(portSet).sort((a, b) => a - b);
      for (const port of sorted) {
        let blockOk = true;
        for (let i = 0; i < 6; i++) {
          if (!portSet.has(port + i)) {
            blockOk = false;
            break;
          }
        }
        if (blockOk) return port;
      }
      return undefined;
    };

    for (const c of liveContainers) {
      if (c.Image !== IMAGE_NAME) continue;
      const projectId = c.Labels?.projectId;
      if (!projectId) continue;

      const assignedPortLabel = c.Labels?.assignedPort;
      let basePort: number | undefined;
      if (assignedPortLabel) {
        const parsed = parseInt(assignedPortLabel, 10);
        if (!isNaN(parsed)) basePort = parsed;
      }

      if (!basePort) {
        const publicPorts = (c.Ports || [])
          .map(p => p.PublicPort)
          .filter((p): p is number => typeof p === 'number');
        basePort = inferBasePort(publicPorts);
      }

      if (!basePort) continue;

      const userId = c.Labels?.userId;
      containers.set(projectId, {
        id: c.Id,
        lastActive: Date.now(),
        port: basePort,
        ptyPort: basePort + 3,
        backgroundDev: false,
        userId,
      });
      if (userId) registerUserContainer(userId, projectId);
      try { getMeteringCollector().trackContainer(c.Id, projectId, userId); } catch (_) {}
      try {
        healthMonitor.registerContainer(c.Id, {
          httpEndpoints: [{ name: 'preview', port: basePort, path: '/' }],
          tcpPorts: [
            { name: 'preview-tcp', port: basePort },
            { name: 'pty-tcp', port: basePort + 3 },
          ],
        });
      } catch (_) {}
      try { resourceOptimizer.registerContainer(c.Id); } catch (_) {}
      restored++;
    }

    console.log(`✅ [Startup] Restored ${restored} running project container(s)`);
  } catch (e: any) {
    console.error('❌ [Startup] Container restore failed:', e.message);
  }

  // Step 2: THEN initialize container pool (after cleanup is done)
  if (ENABLE_CONTAINER_POOL && !PERSIST_WORKSPACE) {
    console.log('🚀 [Startup] Initializing container pool...');
    containerPool.setPortManager(allocatePort, releasePorts);
    try {
      await containerPool.initialize();
      console.log('✅ [Startup] Container pool ready');
    } catch (err: any) {
      console.error('❌ [Startup] Container pool initialization failed:', err.message);
    }
  }

  // Step 3: Start health monitoring
  console.log('💊 [Startup] Starting health monitor...');
  try {
    healthMonitor.start();
    console.log('✅ [Startup] Health monitor started');
  } catch (err: any) {
    console.error('❌ [Startup] Health monitor failed to start:', err.message);
  }

  // Auto-restart unhealthy containers with cooldown and grace period
  const restartCooldowns = new Map<string, number>();
  const RESTART_COOLDOWN_MS = 120000; // 2 minutes between restarts
  const CONTAINER_GRACE_PERIOD_MS = 60000; // 1 minute grace period after creation
  
  healthMonitor.on('unhealthy', async (status: HealthStatus) => {
    const containerId = status.containerId;
    const failedChecks = status.checks.filter(c => !c.passed).map(c => c.message).join('; ');
    const reason = failedChecks || 'unknown';
    
    // Skip transient network errors during grace period
    const isTransientError = reason.includes('ECONNRESET') || reason.includes('ETIMEDOUT') || reason.includes('ECONNREFUSED');
    if (isTransientError && status.uptimeMs < CONTAINER_GRACE_PERIOD_MS) {
      console.log(`🏥 [Health] Container ${containerId.slice(0, 12)} has transient error but within grace period (${Math.round(status.uptimeMs/1000)}s), skipping restart`);
      return;
    }
    
    // Check cooldown
    const lastRestart = restartCooldowns.get(containerId);
    if (lastRestart && Date.now() - lastRestart < RESTART_COOLDOWN_MS) {
      const waitSecs = Math.round((RESTART_COOLDOWN_MS - (Date.now() - lastRestart)) / 1000);
      console.log(`🏥 [Health] Container ${containerId.slice(0, 12)} in restart cooldown (${waitSecs}s remaining), skipping`);
      return;
    }
    
    console.warn(`🏥 [Health] Container ${containerId.slice(0, 12)} unhealthy: ${reason}`);

    // Find the project using this container
    let projectId: string | null = null;
    for (const [pid, entry] of containers) {
      if (entry.id === containerId) {
        projectId = pid;
        break;
      }
    }

    if (!projectId) {
      console.warn(`🏥 [Health] Container ${containerId.slice(0, 12)} not in registry, skipping restart`);
      return;
    }

    try {
      const container = docker.getContainer(containerId);
      console.log(`🏥 [Health] Restarting container ${containerId.slice(0, 12)} for project ${projectId}...`);
      
      // Set cooldown BEFORE restart to prevent race conditions
      restartCooldowns.set(containerId, Date.now());
      
      await container.restart({ t: 5 }); // 5 second graceful timeout

      // Update last active time
      const entry = containers.get(projectId);
      if (entry) {
        entry.lastActive = Date.now();
      }

      console.log(`🏥 [Health] Container ${containerId.slice(0, 12)} restarted successfully`);

      // Re-launch dev server if it was running before the restart
      if (entry?.backgroundDev) {
        try {
          console.log(`🏥 [Health] Re-launching dev server for ${projectId} after container restart...`);
          const ports = [entry.port + 1, entry.port, entry.port + 4, entry.port + 5, entry.port + 2];
          await devServerManager.restart(entry.id, projectId, ports);
          console.log(`🏥 [Health] Dev server re-launched for ${projectId}`);
        } catch (devErr: any) {
          console.warn(`🏥 [Health] Failed to re-launch dev server for ${projectId}:`, devErr.message);
        }
      }
    } catch (err: any) {
      console.error(`🏥 [Health] Failed to restart container ${containerId.slice(0, 12)}:`, err.message);
    }
  });

  // Step 4: Start resource optimizer
  console.log('📊 [Startup] Starting resource optimizer...');
  try {
    resourceOptimizer.start();
    console.log('✅ [Startup] Resource optimizer started');
  } catch (err: any) {
    console.error('❌ [Startup] Resource optimizer failed to start:', err.message);
  }

  // Step 5: Initialize metering system (metrics collector -> usage aggregator -> quota enforcer)
  console.log('📊 [Startup] Initializing metering system...');
  try {
    const meteringCollector = getMeteringCollector(docker);
    const usageAggregator = getUsageAggregator();
    const quotaEnforcer = getQuotaEnforcer();

    // Wire metrics flush from collector into aggregator
    meteringCollector.onMetricsFlush((metrics) => {
      usageAggregator.ingestMetrics(metrics);
    });

    // Start collector and aggregator
    meteringCollector.start();
    usageAggregator.start();

    console.log('✅ [Startup] Metering system initialized (collector + aggregator + quota enforcer)');
  } catch (err: any) {
    console.error('❌ [Startup] Metering system failed to initialize:', err.message);
    // Non-fatal: server continues without metering
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

  // Register for WebSocket keepalive (ping/pong every 30s, timeout after 60s)
  wsKeepalive.register(ws as any, sanitizedProjectId, 'cli-sync', authSession.userId);

  // Register for WebSocket rate limiting
  const cliSyncRateLimiter = getWsRateLimiter('cli-sync');
  cliSyncRateLimiter.track(ws as any);

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
    // Rate limit check
    if (!cliSyncRateLimiter.allowMessage(ws as any)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' }));
      return;
    }

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

// ==================== EXPO GO QR CODE ====================

// Get Expo Metro URL and project info for QR code generation
app.get('/api/expo-url/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);

  try {
    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ isExpo: false, error: 'Container not found' });
    }

    // Ensure container is running
    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.json({ isExpo: false, error: 'Container not running' });
    }

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);

    // Check if this is an Expo project by looking for app.json with "expo" key
    let isExpo = false;
    try {
      const appJsonContent = await execCommand(container, 'cat /workspace/app.json 2>/dev/null || echo ""');
      if (appJsonContent.trim()) {
        try {
          const appJson = JSON.parse(appJsonContent.trim());
          isExpo = !!appJson.expo || !!appJson.name;
        } catch {
          // Not valid JSON, check for app.config.js/ts as fallback
        }
      }

      if (!isExpo) {
        // Also check for app.config.js or app.config.ts (Expo config file variants)
        const configCheck = await execCommand(container, 'ls /workspace/app.config.js /workspace/app.config.ts 2>/dev/null || echo ""');
        if (configCheck.trim()) {
          isExpo = true;
        }
      }

      if (!isExpo) {
        // Check package.json for expo dependency
        const pkgContent = await execCommand(container, 'cat /workspace/package.json 2>/dev/null || echo ""');
        if (pkgContent.trim()) {
          try {
            const pkg = JSON.parse(pkgContent.trim());
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            isExpo = !!deps['expo'];
          } catch {
            // Not valid JSON
          }
        }
      }
    } catch {
      // Commands failed, not an Expo project
    }

    if (!isExpo) {
      return res.json({ isExpo: false });
    }

    // Determine the hostname for Metro bundler URL
    const hostname = process.env.PUBLIC_HOSTNAME || req.hostname || (req.headers.host ? req.headers.host.split(':')[0] : 'localhost');

    // Expo port: container's assigned port + 4 (maps to container port 8081)
    const expoPort = entry.port + 4;

    // Check if Metro bundler is actually running
    let metroRunning = false;
    try {
      const psOutput = await execCommand(container, 'ps aux | grep -E "expo|metro" | grep -v grep || echo ""');
      metroRunning = psOutput.trim().length > 0;
    } catch {
      // Process check failed
    }

    const metroUrl = `exp://${hostname}:${expoPort}`;
    const webUrl = `http://${hostname}:${expoPort}`;

    // Check for tunnel URL in Expo dev logs
    let tunnelUrl: string | undefined;
    if (metroRunning) {
      try {
        const logContent = await execCommand(container, 'cat /tmp/expo-dev.log 2>/dev/null || echo ""');
        // Look for ngrok tunnel URL patterns in log output
        const tunnelMatch = logContent.match(/exp:\/\/[^\s]*ngrok[^\s]*/);
        if (tunnelMatch) {
          tunnelUrl = tunnelMatch[0];
        }
        // Also check for Expo's tunnel output format
        if (!tunnelUrl) {
          const tunnelMatch2 = logContent.match(/Tunnel ready at (exp:\/\/[^\s]+)/);
          if (tunnelMatch2) {
            tunnelUrl = tunnelMatch2[1];
          }
        }
      } catch {
        // Log read failed — non-critical
      }
    }

    // Parse Metro logs for build status
    let metroBuildStatus: 'idle' | 'building' | 'ready' | 'error' = 'idle';
    let metroError: string | undefined;

    if (metroRunning) {
      try {
        const logs = await execCommand(container, 'tail -30 /tmp/expo-dev.log 2>/dev/null || echo ""');
        if (logs.includes('error') || logs.includes('Error')) {
          metroBuildStatus = 'error';
          // Extract last error line
          const errorLines = logs.split('\n').filter(l => /error/i.test(l));
          metroError = errorLines[errorLines.length - 1]?.trim();
        } else if (logs.includes('Bundling') || logs.includes('Building')) {
          metroBuildStatus = 'building';
        } else if (logs.includes('Bundled') || logs.includes('Metro waiting') || logs.includes('started')) {
          metroBuildStatus = 'ready';
        } else {
          metroBuildStatus = 'ready'; // Default when running
        }
      } catch {
        metroBuildStatus = 'ready'; // Fallback
      }
    }

    res.json({
      isExpo: true,
      metroUrl,
      tunnelUrl,
      webUrl,
      metroRunning,
      metroBuildStatus,
      metroError,
      expoPort,
      hostname,
    });
  } catch (err: any) {
    console.error(`[Expo] Failed to get Expo URL for project ${projectId}:`, err);
    res.status(500).json({ isExpo: false, error: err.message });
  }
});

// Start Expo dev server in a specific mode (web, tunnel, or lan)
app.post('/api/expo-start/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const { mode = 'lan' } = req.body;

  if (!['web', 'tunnel', 'lan'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode. Must be "web", "tunnel", or "lan".' });
  }

  try {
    const entry = containers.get(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    // Ensure container is running
    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({
        error: 'Container not running',
        message: containerStatus.error || 'Container could not be started',
        canRetry: true,
      });
    }

    entry.lastActive = Date.now();
    const container = docker.getContainer(entry.id);

    // Determine the public hostname for REACT_NATIVE_PACKAGER_HOSTNAME
    const hostname = process.env.PUBLIC_HOSTNAME || req.hostname || (req.headers.host ? req.headers.host.split(':')[0] : 'localhost');

    // Kill any existing Expo/Metro process first
    await execCommand(container, 'pkill -f "expo start|metro" || true', true).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Build the start command based on mode
    let startCmd: string;
    switch (mode) {
      case 'web':
        startCmd = 'npx expo start --web --host 0.0.0.0 --port 8081';
        break;
      case 'tunnel':
        // Install @expo/ngrok if not already present, then start with tunnel
        startCmd = 'npx expo install @expo/ngrok@^4.1.0 2>/dev/null; npx expo start --tunnel --port 8081';
        break;
      case 'lan':
      default:
        startCmd = 'npx expo start --lan --host 0.0.0.0 --port 8081';
        break;
    }

    // Start Expo with the correct env vars
    const startScript = `cd /workspace && BROWSER=none REACT_NATIVE_PACKAGER_HOSTNAME=${hostname} exec setsid ${startCmd} > /tmp/expo-dev.log 2>&1 < /dev/null`;

    const exec = await container.exec({
      Cmd: ['/bin/bash', '-c', startScript],
      AttachStdout: false,
      AttachStderr: false,
      Tty: false,
    });

    await exec.start({ Detach: true });
    devServerManager.registerExternalServer(projectId, 'expo');
    console.log(`[Expo] Started Expo dev server in ${mode} mode for project ${projectId}`);

    // Wait for Expo to initialize
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check if process is running
    let running = false;
    try {
      const psCheck = await execCommand(container, 'ps aux | grep -E "expo|metro" | grep -v grep || echo ""');
      running = psCheck.trim().length > 0;
    } catch {
      // Process check failed
    }

    const expoPort = entry.port + 4;
    const metroUrl = `exp://${hostname}:${expoPort}`;
    const webUrl = `http://${hostname}:${expoPort}`;

    auditLog({
      userId: req.userId,
      action: 'EXPO_START',
      projectId,
      details: { mode, metroUrl },
    });

    res.json({
      success: true,
      mode,
      metroUrl,
      webUrl,
      running,
      message: running
        ? `Expo started in ${mode} mode`
        : 'Expo process started but may still be initializing. Check logs at /tmp/expo-dev.log',
    });
  } catch (err: any) {
    console.error(`[Expo] Failed to start Expo for project ${projectId}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== END EXPO GO QR CODE ====================

// ==================== EAS BUILD ====================

interface EasBuildInfo {
  buildId: string;
  projectId: string;
  platform: 'android' | 'ios';
  status: string;
  startedAt: string;
  completedAt?: string;
  artifactUrl?: string;
  error?: string;
  expoProjectUrl?: string;
  profile?: string;
  autoSubmit?: boolean;
  submitStatus?: 'pending' | 'submitting' | 'submitted' | 'failed';
  submitError?: string;
}

const easBuilds = new Map<string, EasBuildInfo>();

/** Sanitize a token for safe shell interpolation — only allow alphanumeric, underscores, hyphens, dots */
function sanitizeShellToken(token: string): string {
  return token.replace(/[^a-zA-Z0-9_\-\.]/g, '');
}

// POST /api/eas-build/:projectId - Trigger an EAS build
app.post('/api/eas-build/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { platform, expoToken, profile = 'preview', autoSubmit = false } = req.body;

  if (!platform || !['android', 'ios'].includes(platform)) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Invalid platform. Must be "android" or "ios".'));
  }
  if (!expoToken || typeof expoToken !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing expoToken.'));
  }

  const validProfiles = ['development', 'preview', 'production'];
  const safeProfile = validProfiles.includes(profile) ? profile : 'preview';

  const entry = containers.get(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    // Ensure eas-cli is available
    try {
      await execInContainer(entry.id, 'which eas || npm install -g eas-cli 2>&1');
    } catch {
      await execInContainer(entry.id, 'npm install -g eas-cli 2>&1');
    }

    // Ensure eas.json exists with build profiles
    try {
      await execInContainer(entry.id, 'cat /workspace/eas.json 2>/dev/null');
    } catch {
      const easConfig = JSON.stringify({
        cli: { version: ">= 3.0.0" },
        build: {
          development: {
            developmentClient: true,
            distribution: "internal",
          },
          preview: {
            distribution: "internal",
            ...(platform === 'android' ? { android: { buildType: "apk" } } : {}),
          },
          production: {}
        },
        submit: { production: {} }
      }, null, 2);
      await execInContainer(entry.id, `cat > /workspace/eas.json << 'EASEOF'\n${easConfig}\nEASEOF`);
    }

    // Run eas build
    console.log(`[EAS] Starting ${platform} build for project ${projectId} (profile: ${safeProfile})`);
    const safeToken = sanitizeShellToken(expoToken);
    const buildOutput = await execInContainer(
      entry.id,
      `cd /workspace && EXPO_TOKEN=${safeToken} eas build --platform ${platform} --profile ${safeProfile} --non-interactive --json --no-wait 2>&1`,
    );

    // Parse the JSON output from eas build
    // The output may contain non-JSON lines before the actual JSON array
    let buildData: any;
    try {
      const jsonMatch = buildOutput.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        buildData = JSON.parse(jsonMatch[0]);
        if (Array.isArray(buildData)) buildData = buildData[0];
      } else {
        // Try parsing the whole output as JSON
        buildData = JSON.parse(buildOutput);
        if (Array.isArray(buildData)) buildData = buildData[0];
      }
    } catch {
      console.error(`[EAS] Failed to parse build output:`, buildOutput);
      return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `EAS build submitted but failed to parse output. Raw: ${buildOutput.slice(0, 500)}`));
    }

    const buildId = buildData?.id || buildData?.buildId || `build-${Date.now()}`;
    const expoProjectUrl = buildData?.projectUrl || buildData?.project?.url || null;

    const buildInfo: EasBuildInfo = {
      buildId,
      projectId,
      platform: platform as 'android' | 'ios',
      status: buildData?.status || 'submitted',
      startedAt: new Date().toISOString(),
      expoProjectUrl,
      profile: safeProfile,
      autoSubmit: autoSubmit && safeProfile === 'production',
    };

    easBuilds.set(buildId, buildInfo);
    console.log(`[EAS] Build ${buildId} submitted for project ${projectId} (${platform}, profile: ${safeProfile})`);

    sendSuccess(res, {
      buildId,
      platform,
      status: buildInfo.status,
      expoProjectUrl,
      profile: safeProfile,
      autoSubmit: buildInfo.autoSubmit,
    });
  } catch (error: any) {
    console.error(`[EAS] Failed to start build for project ${projectId}:`, error.message);
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `EAS build failed: ${error.message}`));
  }
}));

// GET /api/eas-build/:projectId/:buildId - Check build status
app.get('/api/eas-build/:projectId/:buildId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId, buildId } = req.params;
  const expoToken = req.query.expoToken as string;

  const cached = easBuilds.get(buildId);
  if (!cached || cached.projectId !== projectId) {
    return sendError(res, createError(ErrorCode.NOT_FOUND, 'Build not found'));
  }

  // If terminal status, return cached
  const terminalStatuses = ['finished', 'errored', 'canceled'];
  if (terminalStatuses.includes(cached.status)) {
    return sendSuccess(res, cached);
  }

  // Poll EAS for updated status
  if (expoToken) {
    const entry = containers.get(projectId);
    if (entry) {
      try {
        const safeToken = sanitizeShellToken(expoToken);
        const statusOutput = await execInContainer(
          entry.id,
          `cd /workspace && EXPO_TOKEN=${safeToken} eas build:view ${cached.buildId} --json 2>&1`,
        );

        let statusData: any;
        try {
          const jsonMatch = statusOutput.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            statusData = JSON.parse(jsonMatch[0]);
          }
        } catch { /* ignore parse errors */ }

        if (statusData) {
          cached.status = statusData.status || cached.status;
          if (statusData.artifacts?.buildUrl) {
            cached.artifactUrl = statusData.artifacts.buildUrl;
          }
          if (statusData.error) {
            cached.error = typeof statusData.error === 'string' ? statusData.error : statusData.error?.message || 'Build error';
          }
          if (terminalStatuses.includes(cached.status)) {
            cached.completedAt = new Date().toISOString();
          }
          // Auto-submit to App Store / Play Store when build finishes
          if (cached.autoSubmit && cached.status === 'finished' && !cached.submitStatus) {
            cached.submitStatus = 'submitting';
            easBuilds.set(buildId, cached);
            // Fire and forget the submit
            (async () => {
              try {
                const safeTokenSubmit = sanitizeShellToken(expoToken);
                console.log(`[EAS] Auto-submitting ${cached.platform} build ${buildId} for project ${projectId}`);
                await execInContainer(
                  entry!.id,
                  `cd /workspace && EXPO_TOKEN=${safeTokenSubmit} eas submit --platform ${cached.platform} --latest --non-interactive --json 2>&1`,
                );
                cached.submitStatus = 'submitted';
                easBuilds.set(buildId, cached);
                console.log(`[EAS] Auto-submit completed for build ${buildId}`);
              } catch (submitErr: any) {
                cached.submitStatus = 'failed';
                cached.submitError = submitErr.message;
                easBuilds.set(buildId, cached);
                console.error(`[EAS] Auto-submit failed for build ${buildId}:`, submitErr.message);
              }
            })();
          }
          easBuilds.set(buildId, cached);
        }
      } catch (err: any) {
        console.warn(`[EAS] Failed to poll build status for ${buildId}:`, err.message);
      }
    }
  }

  sendSuccess(res, cached);
}));

// GET /api/eas-builds/:projectId - List builds for a project
app.get('/api/eas-builds/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;

  const projectBuilds = Array.from(easBuilds.values())
    .filter(b => b.projectId === projectId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 10);

  sendSuccess(res, projectBuilds);
}));

// ==================== END EAS BUILD ====================

// ==================== EAS UPDATE (OTA) ====================

interface EasUpdateInfo {
  updateId: string;       // update group ID
  projectId: string;
  branch: string;
  message: string;
  platforms: string[];     // ['android', 'ios']
  createdAt: string;
  runtimeVersion?: string;
}

const easUpdates = new Map<string, EasUpdateInfo>();

/** Sanitize a message for safe shell interpolation — strip shell metacharacters */
function sanitizeShellMessage(msg: string): string {
  return msg.replace(/["`$\\]/g, '');
}

// POST /api/eas-update/:projectId - Push an OTA update
app.post('/api/eas-update/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { expoToken, branch = 'preview', message = '' } = req.body;

  if (!expoToken || typeof expoToken !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing expoToken.'));
  }

  const entry = containers.get(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    // Ensure eas-cli is available
    try {
      await execInContainer(entry.id, 'which eas || npm install -g eas-cli 2>&1');
    } catch {
      await execInContainer(entry.id, 'npm install -g eas-cli 2>&1');
    }

    // Configure eas update (idempotent)
    const safeToken = sanitizeShellToken(expoToken);
    try {
      await execInContainer(entry.id, `cd /workspace && EXPO_TOKEN=${safeToken} eas update:configure --non-interactive 2>&1`);
    } catch {
      // Configure may fail if already configured, that's fine
    }

    // Run eas update
    const safeBranch = sanitizeShellToken(branch);
    const safeMessage = sanitizeShellMessage(message || 'Update');
    console.log(`[EAS Update] Pushing update for project ${projectId} on branch ${safeBranch}`);

    const updateOutput = await execInContainer(
      entry.id,
      `cd /workspace && EXPO_TOKEN=${safeToken} eas update --branch ${safeBranch} --message "${safeMessage}" --json --non-interactive 2>&1`,
    );

    // Parse JSON output
    let updateData: any;
    try {
      const jsonMatch = updateOutput.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        updateData = JSON.parse(jsonMatch[0]);
      } else {
        const objMatch = updateOutput.match(/\{[\s\S]*\}/);
        if (objMatch) {
          updateData = JSON.parse(objMatch[0]);
        }
      }
    } catch {
      console.error(`[EAS Update] Failed to parse update output:`, updateOutput);
      return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `EAS update pushed but failed to parse output. Raw: ${updateOutput.slice(0, 500)}`));
    }

    // Extract update group ID and platforms
    let updateId: string;
    let platforms: string[] = [];
    let runtimeVersion: string | undefined;

    if (Array.isArray(updateData)) {
      updateId = updateData[0]?.group || updateData[0]?.id || `update-${Date.now()}`;
      platforms = updateData.map((u: any) => u.platform).filter(Boolean);
      runtimeVersion = updateData[0]?.runtimeVersion;
    } else if (updateData) {
      updateId = updateData.group || updateData.id || `update-${Date.now()}`;
      platforms = updateData.platform ? [updateData.platform] : [];
      runtimeVersion = updateData.runtimeVersion;
    } else {
      updateId = `update-${Date.now()}`;
    }

    const updateInfo: EasUpdateInfo = {
      updateId,
      projectId,
      branch: safeBranch,
      message: safeMessage,
      platforms,
      createdAt: new Date().toISOString(),
      runtimeVersion,
    };

    easUpdates.set(updateId, updateInfo);
    console.log(`[EAS Update] Update ${updateId} pushed for project ${projectId} (branch: ${safeBranch})`);

    sendSuccess(res, {
      updateId,
      branch: safeBranch,
      message: safeMessage,
      platforms,
      createdAt: updateInfo.createdAt,
      runtimeVersion,
    });
  } catch (error: any) {
    console.error(`[EAS Update] Failed to push update for project ${projectId}:`, error.message);
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `EAS update failed: ${error.message}`));
  }
}));

// GET /api/eas-updates/:projectId - List update history
app.get('/api/eas-updates/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const expoToken = req.query.expoToken as string;
  const branch = (req.query.branch as string) || 'preview';

  const entry = containers.get(projectId);

  let remoteUpdates: any[] = [];

  if (expoToken && entry) {
    try {
      const safeToken = sanitizeShellToken(expoToken);
      const safeBranch = sanitizeShellToken(branch);
      const listOutput = await execInContainer(
        entry.id,
        `cd /workspace && EXPO_TOKEN=${safeToken} eas update:list --branch ${safeBranch} --json --non-interactive --limit 10 2>&1`,
      );

      try {
        const jsonMatch = listOutput.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          remoteUpdates = JSON.parse(jsonMatch[0]);
        } else {
          const objMatch = listOutput.match(/\{[\s\S]*\}/);
          if (objMatch) {
            const parsed = JSON.parse(objMatch[0]);
            // Some versions return { currentPage: [...] } or { updates: [...] }
            remoteUpdates = parsed.currentPage || parsed.updates || (Array.isArray(parsed) ? parsed : [parsed]);
          }
        }
      } catch {
        console.warn(`[EAS Update] Failed to parse update list output:`, listOutput.slice(0, 300));
      }
    } catch (err: any) {
      console.warn(`[EAS Update] Failed to list updates for project ${projectId}:`, err.message);
    }
  }

  // Merge with in-memory updates we triggered
  const localUpdates = Array.from(easUpdates.values())
    .filter(u => u.projectId === projectId && u.branch === branch)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Combine: remote updates take precedence, supplement with local
  const remoteIds = new Set(remoteUpdates.map((u: any) => u.group || u.id));
  const mergedLocal = localUpdates.filter(u => !remoteIds.has(u.updateId));

  sendSuccess(res, {
    remote: remoteUpdates,
    local: mergedLocal,
  });
}));

// POST /api/eas-update/:projectId/rollback - Rollback to previous update
app.post('/api/eas-update/:projectId/rollback', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { expoToken, branch = 'preview' } = req.body;

  if (!expoToken || typeof expoToken !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing expoToken.'));
  }

  const entry = containers.get(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    const safeToken = sanitizeShellToken(expoToken);
    const safeBranch = sanitizeShellToken(branch);
    console.log(`[EAS Update] Rolling back update on branch ${safeBranch} for project ${projectId}`);

    const rollbackOutput = await execInContainer(
      entry.id,
      `cd /workspace && EXPO_TOKEN=${safeToken} eas update:rollback --channel ${safeBranch} --json --non-interactive 2>&1`,
    );

    // Try to parse the output
    let rollbackData: any = null;
    try {
      const jsonMatch = rollbackOutput.match(/\{[\s\S]*\}/) || rollbackOutput.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        rollbackData = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Not parseable as JSON — might be a message or error
    }

    console.log(`[EAS Update] Rollback completed for project ${projectId} on branch ${safeBranch}`);

    sendSuccess(res, {
      branch: safeBranch,
      rolled_back: true,
      details: rollbackData,
      raw: rollbackData ? undefined : rollbackOutput.slice(0, 500),
    });
  } catch (error: any) {
    console.error(`[EAS Update] Rollback failed for project ${projectId}:`, error.message);
    // Could be that the command isn't available in this EAS CLI version
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `EAS update rollback failed: ${error.message}. This may require a newer version of eas-cli.`));
  }
}));

// ==================== END EAS UPDATE ====================

// ==================== EAS SHARE (Tier 2: Share Link) ====================

const easShares = new Map<string, { projectId: string; shareUrl: string; updateId: string; createdAt: string }>();

// POST /api/eas-share/:projectId - Push EAS Update to 'shared' branch for sharing
app.post('/api/eas-share/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { expoToken, message = 'Shared from Recoder' } = req.body;

  if (!expoToken || typeof expoToken !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing expoToken.'));
  }

  const entry = containers.get(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    const safeToken = sanitizeShellToken(expoToken);
    const safeMessage = sanitizeShellMessage(message);

    // Ensure eas-cli and update configuration
    try {
      await execInContainer(entry.id, 'which eas || npm install -g eas-cli 2>&1');
    } catch {
      await execInContainer(entry.id, 'npm install -g eas-cli 2>&1');
    }

    try {
      await execInContainer(entry.id, `cd /workspace && EXPO_TOKEN=${safeToken} eas update:configure --non-interactive 2>&1`);
    } catch { /* already configured */ }

    console.log(`[EAS Share] Pushing share update for project ${projectId}`);

    const updateOutput = await execInContainer(
      entry.id,
      `cd /workspace && EXPO_TOKEN=${safeToken} eas update --branch shared --message "${safeMessage}" --json --non-interactive 2>&1`,
    );

    let updateData: any;
    try {
      const jsonMatch = updateOutput.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        updateData = JSON.parse(jsonMatch[0]);
      } else {
        const objMatch = updateOutput.match(/\{[\s\S]*\}/);
        if (objMatch) {
          updateData = JSON.parse(objMatch[0]);
        }
      }
    } catch {
      console.error(`[EAS Share] Failed to parse output:`, updateOutput);
      return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Share update pushed but output parse failed. Raw: ${updateOutput.slice(0, 500)}`));
    }

    let updateId: string;
    if (Array.isArray(updateData)) {
      updateId = updateData[0]?.group || updateData[0]?.id || `share-${Date.now()}`;
    } else if (updateData) {
      updateId = updateData.group || updateData.id || `share-${Date.now()}`;
    } else {
      updateId = `share-${Date.now()}`;
    }

    // Construct a share URL (Expo Updates URL pattern)
    const shareUrl = `exp+recoder-expo-starter://expo-development-client/?url=https://u.expo.dev/update/${updateId}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}&bgcolor=1a1a2e&color=ffffff&format=svg`;

    easShares.set(projectId, { projectId, shareUrl, updateId, createdAt: new Date().toISOString() });
    console.log(`[EAS Share] Share link created for project ${projectId}: ${updateId}`);

    sendSuccess(res, { shareUrl, updateId, branch: 'shared', qrUrl });
  } catch (error: any) {
    console.error(`[EAS Share] Failed for project ${projectId}:`, error.message);
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `EAS share failed: ${error.message}`));
  }
}));

// GET /api/eas-share/:projectId - Get current share status
app.get('/api/eas-share/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;

  const share = easShares.get(projectId);
  if (share) {
    sendSuccess(res, { shared: true, shareUrl: share.shareUrl, updateId: share.updateId });
  } else {
    sendSuccess(res, { shared: false });
  }
}));

startupInfo('routes.eas-share', 'registered');

// ==================== END EAS SHARE ====================

// ==================== EAS SUBMIT ====================

// POST /api/eas-submit/:projectId - Submit build to App Store / Play Store
app.post('/api/eas-submit/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { expoToken, platform, buildId, profile = 'production' } = req.body;

  if (!expoToken || typeof expoToken !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing expoToken.'));
  }
  if (!platform || !['android', 'ios'].includes(platform)) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Invalid platform. Must be "android" or "ios".'));
  }

  const entry = containers.get(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    const safeToken = sanitizeShellToken(expoToken);

    // Ensure eas-cli is available
    try {
      await execInContainer(entry.id, 'which eas || npm install -g eas-cli 2>&1');
    } catch {
      await execInContainer(entry.id, 'npm install -g eas-cli 2>&1');
    }

    console.log(`[EAS Submit] Submitting ${platform} for project ${projectId}`);

    const submitCmd = buildId
      ? `cd /workspace && EXPO_TOKEN=${safeToken} eas submit --platform ${platform} --id ${sanitizeShellToken(buildId)} --non-interactive --json 2>&1`
      : `cd /workspace && EXPO_TOKEN=${safeToken} eas submit --platform ${platform} --latest --non-interactive --json 2>&1`;

    const submitOutput = await execInContainer(entry.id, submitCmd);

    let submitData: any = null;
    try {
      const jsonMatch = submitOutput.match(/\{[\s\S]*\}/) || submitOutput.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        submitData = JSON.parse(jsonMatch[0]);
        if (Array.isArray(submitData)) submitData = submitData[0];
      }
    } catch { /* ignore parse errors */ }

    const submitId = submitData?.id || `submit-${Date.now()}`;
    console.log(`[EAS Submit] Submission ${submitId} completed for project ${projectId} (${platform})`);

    sendSuccess(res, { submitId, status: submitData?.status || 'submitted', platform });
  } catch (error: any) {
    console.error(`[EAS Submit] Failed for project ${projectId}:`, error.message);
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `EAS submit failed: ${error.message}`));
  }
}));

startupInfo('routes.eas-submit', 'registered');

// ==================== END EAS SUBMIT ====================

// ==================== APP CONFIG MANAGEMENT ====================

// GET /api/app-config/:projectId - Read app.json expo config from container
app.get('/api/app-config/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;

  const entry = containers.get(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    const appJsonRaw = await execInContainer(entry.id, 'cat /workspace/app.json 2>/dev/null');
    const appJson = JSON.parse(appJsonRaw);
    sendSuccess(res, appJson.expo || appJson);
  } catch (error: any) {
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Failed to read app.json: ${error.message}`));
  }
}));

// PUT /api/app-config/:projectId - Update app.json expo config
app.put('/api/app-config/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const updates = req.body; // { name?, slug?, version?, icon?, splash?, ios?, android?, scheme? }

  const entry = containers.get(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    // Read existing app.json
    const appJsonRaw = await execInContainer(entry.id, 'cat /workspace/app.json 2>/dev/null');
    const appJson = JSON.parse(appJsonRaw);

    // Merge updates into expo key
    const expoConfig = appJson.expo || appJson;
    const allowedKeys = ['name', 'slug', 'version', 'icon', 'splash', 'ios', 'android', 'scheme'];
    for (const key of allowedKeys) {
      if (updates[key] !== undefined) {
        if (typeof updates[key] === 'object' && !Array.isArray(updates[key]) && expoConfig[key] && typeof expoConfig[key] === 'object') {
          expoConfig[key] = { ...expoConfig[key], ...updates[key] };
        } else {
          expoConfig[key] = updates[key];
        }
      }
    }

    if (appJson.expo) {
      appJson.expo = expoConfig;
    }

    // Write back
    const newContent = JSON.stringify(appJson, null, 2);
    await execInContainer(entry.id, `cat > /workspace/app.json << 'APPJSONEOF'\n${newContent}\nAPPJSONEOF`);

    console.log(`[App Config] Updated app.json for project ${projectId}`);
    sendSuccess(res, expoConfig);
  } catch (error: any) {
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Failed to update app.json: ${error.message}`));
  }
}));

// PUT /api/eas-config/:projectId - Update eas.json submit config
app.put('/api/eas-config/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const updates = req.body; // { submit?: { production?: { ios?, android? } } }

  const entry = containers.get(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    let easJson: any;
    try {
      const easJsonRaw = await execInContainer(entry.id, 'cat /workspace/eas.json 2>/dev/null');
      easJson = JSON.parse(easJsonRaw);
    } catch {
      easJson = { cli: { version: ">= 3.0.0" }, build: { preview: {}, production: {} }, submit: { production: {} } };
    }

    // Deep merge submit config
    if (updates.submit) {
      easJson.submit = easJson.submit || {};
      for (const profile of Object.keys(updates.submit)) {
        easJson.submit[profile] = easJson.submit[profile] || {};
        const profileUpdate = updates.submit[profile];
        for (const platform of Object.keys(profileUpdate)) {
          if (typeof profileUpdate[platform] === 'object') {
            easJson.submit[profile][platform] = { ...(easJson.submit[profile][platform] || {}), ...profileUpdate[platform] };
          } else {
            easJson.submit[profile][platform] = profileUpdate[platform];
          }
        }
      }
    }

    const newContent = JSON.stringify(easJson, null, 2);
    await execInContainer(entry.id, `cat > /workspace/eas.json << 'EASJSONEOF'\n${newContent}\nEASJSONEOF`);

    console.log(`[EAS Config] Updated eas.json for project ${projectId}`);
    sendSuccess(res, easJson);
  } catch (error: any) {
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Failed to update eas.json: ${error.message}`));
  }
}));

startupInfo('routes.app-config', 'registered');

// ==================== END APP CONFIG MANAGEMENT ====================

// ==================== BUILT-IN BACKEND SERVICES ====================

// POST /api/backend-db/:projectId/init - Initialize SQLite database in container
app.post('/api/backend-db/:projectId/init', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { schema } = req.body; // optional initial SQL schema

  const entry = containers.get(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    // Create data directory
    await execInContainer(entry.id, 'mkdir -p /workspace/data');

    // Create database file
    await execInContainer(entry.id, 'sqlite3 /workspace/data/app.db "SELECT 1;" 2>&1');

    // Run initial schema if provided
    if (schema && typeof schema === 'string') {
      const safeSchema = schema.replace(/'/g, "'\\''");
      await execInContainer(entry.id, `sqlite3 /workspace/data/app.db '${safeSchema}' 2>&1`);
    }

    console.log(`[Backend DB] Initialized SQLite for project ${projectId}`);
    sendSuccess(res, { initialized: true, path: '/workspace/data/app.db' });
  } catch (error: any) {
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Failed to initialize database: ${error.message}`));
  }
}));

// POST /api/backend-db/:projectId/query - Run SQL query
app.post('/api/backend-db/:projectId/query', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { query, params } = req.body;

  if (!query || typeof query !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing query.'));
  }

  const entry = containers.get(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    const safeQuery = query.replace(/'/g, "'\\''");
    const output = await execInContainer(entry.id, `sqlite3 /workspace/data/app.db -json '${safeQuery}' 2>&1`);

    let rows: any[] = [];
    try {
      if (output.trim()) {
        rows = JSON.parse(output);
      }
    } catch {
      // Non-JSON output (e.g. INSERT/UPDATE/DELETE)
    }

    sendSuccess(res, { rows, rowCount: rows.length });
  } catch (error: any) {
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Query failed: ${error.message}`));
  }
}));

// POST /api/backend-db/:projectId/migrate - Run database migrations
app.post('/api/backend-db/:projectId/migrate', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { migrations } = req.body; // [{ name: string, sql: string }]

  if (!Array.isArray(migrations) || migrations.length === 0) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing migrations array.'));
  }

  const entry = containers.get(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    // Ensure migrations table exists
    await execInContainer(entry.id, `sqlite3 /workspace/data/app.db 'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);' 2>&1`);

    // Check which migrations have been applied
    const appliedOutput = await execInContainer(entry.id, `sqlite3 /workspace/data/app.db -json 'SELECT name FROM _migrations;' 2>&1`);
    let appliedSet = new Set<string>();
    try {
      if (appliedOutput.trim()) {
        const applied = JSON.parse(appliedOutput);
        appliedSet = new Set(applied.map((r: any) => r.name));
      }
    } catch { /* empty table */ }

    let appliedCount = 0;
    let skippedCount = 0;

    for (const migration of migrations) {
      if (!migration.name || !migration.sql) continue;

      if (appliedSet.has(migration.name)) {
        skippedCount++;
        continue;
      }

      const safeSql = migration.sql.replace(/'/g, "'\\''");
      const safeName = migration.name.replace(/'/g, "'\\''");

      await execInContainer(entry.id, `sqlite3 /workspace/data/app.db '${safeSql}' 2>&1`);
      await execInContainer(entry.id, `sqlite3 /workspace/data/app.db 'INSERT INTO _migrations (name) VALUES ("${safeName}");' 2>&1`);
      appliedCount++;
    }

    console.log(`[Backend DB] Migrations for project ${projectId}: ${appliedCount} applied, ${skippedCount} skipped`);
    sendSuccess(res, { applied: appliedCount, skipped: skippedCount });
  } catch (error: any) {
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Migration failed: ${error.message}`));
  }
}));

// POST /api/backend-scaffold/:projectId - Generate backend boilerplate
app.post('/api/backend-scaffold/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { type, tableName } = req.body; // type: 'auth' | 'stripe' | 'crud'

  if (!type || !['auth', 'stripe', 'crud'].includes(type)) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Invalid type. Must be "auth", "stripe", or "crud".'));
  }

  const entry = containers.get(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    const files: string[] = [];

    if (type === 'auth') {
      const authCode = `// Auth module - JWT-based authentication with SQLite
import Database from 'better-sqlite3';
import crypto from 'crypto';

const db = new Database('/workspace/data/app.db');

// Initialize auth tables
db.exec(\`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id),
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
\`);

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const verify = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === verify;
}

export function register(email: string, password: string) {
  const hash = hashPassword(password);
  const stmt = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
  return stmt.run(email, hash);
}

export function login(email: string, password: string) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expires);
  return { userId: user.id, token };
}

export function authenticate(token: string) {
  const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > datetime("now")').get(token) as any;
  return session ? { userId: session.user_id } : null;
}
`;
      await execInContainer(entry.id, `mkdir -p /workspace/src/backend && cat > /workspace/src/backend/auth.ts << 'AUTHEOF'\n${authCode}\nAUTHEOF`);
      files.push('src/backend/auth.ts');
    } else if (type === 'stripe') {
      const stripeCode = `// Stripe integration module
// Requires: npm install stripe

// Set STRIPE_SECRET_KEY in your environment
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

let stripe: any;
try {
  const Stripe = require('stripe');
  stripe = new Stripe(STRIPE_SECRET_KEY);
} catch {
  console.warn('stripe package not installed. Run: npm install stripe');
}

export async function createCheckoutSession(priceId: string, successUrl: string, cancelUrl: string) {
  if (!stripe) throw new Error('Stripe not configured');
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

export async function createPortalSession(customerId: string, returnUrl: string) {
  if (!stripe) throw new Error('Stripe not configured');
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

export function verifyWebhookSignature(body: string, signature: string, endpointSecret: string) {
  if (!stripe) throw new Error('Stripe not configured');
  return stripe.webhooks.constructEvent(body, signature, endpointSecret);
}
`;
      await execInContainer(entry.id, `mkdir -p /workspace/src/backend && cat > /workspace/src/backend/stripe.ts << 'STRIPEEOF'\n${stripeCode}\nSTRIPEEOF`);
      files.push('src/backend/stripe.ts');
    } else if (type === 'crud') {
      const name = (tableName || 'items').replace(/[^a-zA-Z0-9_]/g, '');
      const crudCode = `// CRUD module for ${name}
import Database from 'better-sqlite3';

const db = new Database('/workspace/data/app.db');

db.exec(\`
  CREATE TABLE IF NOT EXISTS ${name} (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
\`);

export function list(limit = 50, offset = 0) {
  return db.prepare('SELECT * FROM ${name} ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
}

export function getById(id: string) {
  return db.prepare('SELECT * FROM ${name} WHERE id = ?').get(id);
}

export function create(data: Record<string, any>) {
  const stmt = db.prepare('INSERT INTO ${name} (data) VALUES (?)');
  const result = stmt.run(JSON.stringify(data));
  return { id: result.lastInsertRowid, data };
}

export function update(id: string, data: Record<string, any>) {
  const stmt = db.prepare('UPDATE ${name} SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  return stmt.run(JSON.stringify(data), id);
}

export function remove(id: string) {
  return db.prepare('DELETE FROM ${name} WHERE id = ?').run(id);
}
`;
      await execInContainer(entry.id, `mkdir -p /workspace/src/backend && cat > /workspace/src/backend/${name}.ts << 'CRUDEOF'\n${crudCode}\nCRUDEOF`);
      files.push(`src/backend/${name}.ts`);
    }

    console.log(`[Backend Scaffold] Generated ${type} scaffold for project ${projectId}: ${files.join(', ')}`);
    sendSuccess(res, { files, message: `${type} scaffold generated successfully` });
  } catch (error: any) {
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Scaffold generation failed: ${error.message}`));
  }
}));

startupInfo('routes.backend-services', 'registered');

// ==================== END BUILT-IN BACKEND SERVICES ====================

// ==================== FIGMA IMPORT ====================

function parseFigmaUrl(url: string): { fileKey: string; nodeId?: string } | null {
  // https://www.figma.com/file/XXXXX/Title?node-id=YYY
  // https://www.figma.com/design/XXXXX/Title?node-id=YYY
  const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  if (!match) return null;
  const fileKey = match[1];
  const nodeIdMatch = url.match(/node-id=([^&]+)/);
  const nodeId = nodeIdMatch ? decodeURIComponent(nodeIdMatch[1]) : undefined;
  return { fileKey, nodeId };
}

function figmaColorToRGBA(color: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round((color.r || 0) * 255);
  const g = Math.round((color.g || 0) * 255);
  const b = Math.round((color.b || 0) * 255);
  const a = color.a !== undefined ? color.a : 1;
  if (a === 1) {
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

function figmaNodeToReactNative(node: any, indent = 2): string {
  const pad = ' '.repeat(indent);
  const name = (node.name || 'Component').replace(/[^a-zA-Z0-9]/g, '');

  if (node.type === 'TEXT') {
    const style: Record<string, any> = {};
    if (node.style) {
      if (node.style.fontSize) style.fontSize = node.style.fontSize;
      if (node.style.fontWeight) style.fontWeight = String(node.style.fontWeight);
      if (node.style.lineHeightPx) style.lineHeight = node.style.lineHeightPx;
      if (node.style.letterSpacing) style.letterSpacing = node.style.letterSpacing;
      if (node.style.textAlignHorizontal) style.textAlign = node.style.textAlignHorizontal.toLowerCase();
    }
    if (node.fills?.[0]?.color) {
      style.color = figmaColorToRGBA(node.fills[0].color);
    }
    const styleStr = Object.keys(style).length > 0 ? ` style={${JSON.stringify(style)}}` : '';
    const text = node.characters || '';
    return `${pad}<Text${styleStr}>${text}</Text>`;
  }

  if (node.type === 'RECTANGLE' || node.type === 'ELLIPSE') {
    const style: Record<string, any> = {};
    if (node.absoluteBoundingBox) {
      style.width = node.absoluteBoundingBox.width;
      style.height = node.absoluteBoundingBox.height;
    }
    if (node.fills?.[0]?.color) {
      style.backgroundColor = figmaColorToRGBA(node.fills[0].color);
    }
    if (node.cornerRadius) style.borderRadius = node.cornerRadius;
    if (node.type === 'ELLIPSE') style.borderRadius = Math.max(style.width || 0, style.height || 0) / 2;
    if (node.strokes?.[0]?.color) {
      style.borderWidth = node.strokeWeight || 1;
      style.borderColor = figmaColorToRGBA(node.strokes[0].color);
    }
    return `${pad}<View style={${JSON.stringify(style)}} />`;
  }

  // FRAME, GROUP, COMPONENT, INSTANCE → container View
  const style: Record<string, any> = {};
  if (node.absoluteBoundingBox) {
    style.width = node.absoluteBoundingBox.width;
    style.height = node.absoluteBoundingBox.height;
  }
  if (node.fills?.[0]?.color) {
    style.backgroundColor = figmaColorToRGBA(node.fills[0].color);
  }
  if (node.cornerRadius) style.borderRadius = node.cornerRadius;

  // Auto-layout → flexbox
  if (node.layoutMode) {
    style.flexDirection = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column';
    if (node.itemSpacing) style.gap = node.itemSpacing;
    if (node.paddingTop) style.paddingTop = node.paddingTop;
    if (node.paddingBottom) style.paddingBottom = node.paddingBottom;
    if (node.paddingLeft) style.paddingLeft = node.paddingLeft;
    if (node.paddingRight) style.paddingRight = node.paddingRight;
    if (node.primaryAxisAlignItems) {
      const alignMap: Record<string, string> = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between' };
      style.justifyContent = alignMap[node.primaryAxisAlignItems] || 'flex-start';
    }
    if (node.counterAxisAlignItems) {
      const alignMap: Record<string, string> = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end' };
      style.alignItems = alignMap[node.counterAxisAlignItems] || 'flex-start';
    }
  }

  // Check for image fills
  const imageFill = node.fills?.find((f: any) => f.type === 'IMAGE');
  if (imageFill) {
    return `${pad}<Image source={{ uri: 'https://via.placeholder.com/${Math.round(style.width || 100)}x${Math.round(style.height || 100)}' }} style={${JSON.stringify(style)}} />`;
  }

  const children = (node.children || []).map((child: any) => figmaNodeToReactNative(child, indent + 2)).join('\n');

  if (children) {
    return `${pad}<View style={${JSON.stringify(style)}}>\n${children}\n${pad}</View>`;
  }
  return `${pad}<View style={${JSON.stringify(style)}} />`;
}

// POST /api/figma-import/:projectId - Import Figma design and convert to RN components
app.post('/api/figma-import/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { figmaUrl, figmaToken, nodeIds } = req.body;

  if (!figmaUrl || typeof figmaUrl !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing figmaUrl.'));
  }
  if (!figmaToken || typeof figmaToken !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing figmaToken.'));
  }

  const parsed = parseFigmaUrl(figmaUrl);
  if (!parsed) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Invalid Figma URL. Expected format: https://www.figma.com/file/XXXXX/...'));
  }

  const entry = containers.get(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    // Fetch from Figma API
    const targetNodeIds = nodeIds || (parsed.nodeId ? [parsed.nodeId] : undefined);
    let apiUrl = `https://api.figma.com/v1/files/${parsed.fileKey}`;
    if (targetNodeIds?.length) {
      apiUrl += `/nodes?ids=${targetNodeIds.map((id: string) => encodeURIComponent(id)).join(',')}`;
    }

    const figmaResponse = await fetch(apiUrl, {
      headers: { 'X-Figma-Token': figmaToken },
    });

    if (!figmaResponse.ok) {
      const errText = await figmaResponse.text();
      return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Figma API error (${figmaResponse.status}): ${errText.slice(0, 300)}`));
    }

    const figmaData = await figmaResponse.json() as any;

    // Get nodes to convert
    let nodesToConvert: any[] = [];
    if (figmaData.nodes) {
      // /nodes endpoint response
      nodesToConvert = Object.values(figmaData.nodes).map((n: any) => n.document);
    } else if (figmaData.document) {
      // Full file response — get top-level frames from first page
      const firstPage = figmaData.document.children?.[0];
      if (firstPage?.children) {
        nodesToConvert = firstPage.children.slice(0, 10); // Limit to first 10 frames
      }
    }

    if (nodesToConvert.length === 0) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No convertible nodes found in the Figma file.'));
    }

    // Convert each node to a React Native component file
    const files: string[] = [];
    for (const node of nodesToConvert) {
      const componentName = (node.name || 'FigmaComponent').replace(/[^a-zA-Z0-9]/g, '') || 'FigmaComponent';
      const jsxContent = figmaNodeToReactNative(node, 4);

      const fileContent = `import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

export default function ${componentName}() {
  return (
${jsxContent}
  );
}
`;
      const filePath = `app/components/figma/${componentName}.tsx`;
      await execInContainer(entry.id, `mkdir -p /workspace/app/components/figma`);
      await execInContainer(entry.id, `cat > /workspace/${filePath} << 'FIGMAEOF'\n${fileContent}\nFIGMAEOF`);
      files.push(filePath);
    }

    console.log(`[Figma Import] Converted ${files.length} components for project ${projectId}`);
    sendSuccess(res, { files, componentCount: files.length });
  } catch (error: any) {
    console.error(`[Figma Import] Failed for project ${projectId}:`, error.message);
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Figma import failed: ${error.message}`));
  }
}));

startupInfo('routes.figma-import', 'registered');

// ==================== END FIGMA IMPORT ====================

// ==================== APPETIZE.IO DEVICE CLOUD ====================

const appetizeSessions = new Map<string, { publicKey: string; appUrl: string; platform: string; projectId: string }>();

// POST /api/appetize-upload/:projectId - Upload build to Appetize.io
app.post('/api/appetize-upload/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { buildUrl, platform, appetizeApiToken } = req.body;

  if (!buildUrl || typeof buildUrl !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing buildUrl.'));
  }
  if (!platform || !['android', 'ios'].includes(platform)) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Invalid platform. Must be "android" or "ios".'));
  }
  if (!appetizeApiToken || typeof appetizeApiToken !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing appetizeApiToken.'));
  }

  try {
    console.log(`[Appetize] Uploading ${platform} build for project ${projectId}`);

    const appetizeResponse = await fetch('https://api.appetize.io/v2/apps', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${appetizeApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: buildUrl,
        platform: platform === 'ios' ? 'ios' : 'android',
      }),
    });

    if (!appetizeResponse.ok) {
      const errText = await appetizeResponse.text();
      return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Appetize API error (${appetizeResponse.status}): ${errText.slice(0, 300)}`));
    }

    const appetizeData = await appetizeResponse.json() as any;
    const publicKey = appetizeData.publicKey || appetizeData.appVersions?.[0]?.publicKey;

    if (!publicKey) {
      return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'Appetize upload succeeded but no publicKey returned'));
    }

    const appUrl = `https://appetize.io/app/${publicKey}`;
    const embedUrl = `https://appetize.io/embed/${publicKey}`;

    appetizeSessions.set(projectId, { publicKey, appUrl, platform, projectId });
    console.log(`[Appetize] Upload complete for project ${projectId}: ${publicKey}`);

    sendSuccess(res, { publicKey, appUrl, embedUrl });
  } catch (error: any) {
    console.error(`[Appetize] Upload failed for project ${projectId}:`, error.message);
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Appetize upload failed: ${error.message}`));
  }
}));

// GET /api/appetize-status/:projectId - Get current Appetize session
app.get('/api/appetize-status/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;

  const session = appetizeSessions.get(projectId);
  if (session) {
    sendSuccess(res, { active: true, ...session, embedUrl: `https://appetize.io/embed/${session.publicKey}` });
  } else {
    sendSuccess(res, { active: false });
  }
}));

startupInfo('routes.appetize', 'registered');

// ==================== END APPETIZE.IO ====================

// ==================== OPENCLAW CANVAS ====================

interface CanvasElement {
  type: 'frame' | 'text' | 'image' | 'button' | 'input' | 'list';
  id: string;
  props: Record<string, any>;
  style: Record<string, any>;
  children?: CanvasElement[];
}

function canvasElementToReactNative(element: CanvasElement, indent = 4): string {
  const pad = ' '.repeat(indent);
  const styleStr = Object.keys(element.style).length > 0 ? ` style={${JSON.stringify(element.style)}}` : '';

  switch (element.type) {
    case 'text':
      return `${pad}<Text${styleStr}>${element.props.text || ''}</Text>`;
    case 'image':
      return `${pad}<Image source={{ uri: '${element.props.src || 'https://via.placeholder.com/100'}' }}${styleStr} />`;
    case 'button':
      return `${pad}<TouchableOpacity${styleStr} onPress={() => {}}>\n${pad}  <Text style={{ color: '#fff', textAlign: 'center' }}>${element.props.label || 'Button'}</Text>\n${pad}</TouchableOpacity>`;
    case 'input':
      return `${pad}<TextInput${styleStr} placeholder="${element.props.placeholder || 'Enter text...'}" />`;
    case 'list': {
      const itemStr = element.children?.map(c => canvasElementToReactNative(c, indent + 4)).join('\n') || `${pad}    <Text>Item</Text>`;
      return `${pad}<FlatList\n${pad}  data={[${(element.props.items || ['Item 1', 'Item 2']).map((i: string) => `'${i}'`).join(', ')}]}\n${pad}  renderItem={({ item }) => (\n${pad}    <View style={{ padding: 8 }}>\n${itemStr}\n${pad}    </View>\n${pad}  )}\n${pad}  keyExtractor={(item, index) => index.toString()}\n${pad}/>`;
    }
    case 'frame':
    default: {
      const children = (element.children || []).map(c => canvasElementToReactNative(c, indent + 2)).join('\n');
      if (children) {
        return `${pad}<View${styleStr}>\n${children}\n${pad}</View>`;
      }
      return `${pad}<View${styleStr} />`;
    }
  }
}

// POST /api/canvas-connect/:projectId - Check if OpenClaw Canvas is available
app.post('/api/canvas-connect/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { canvasHostUrl } = req.body;

  const gatewayUrl = canvasHostUrl || process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789';

  try {
    const healthCheck = await fetch(`${gatewayUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (healthCheck.ok) {
      sendSuccess(res, { connected: true, canvasUrl: gatewayUrl });
    } else {
      sendSuccess(res, { connected: false, error: 'Canvas health check failed' });
    }
  } catch {
    sendSuccess(res, { connected: false, error: 'Canvas not reachable' });
  }
}));

// POST /api/canvas-generate/:projectId - Convert canvas elements to React Native
app.post('/api/canvas-generate/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { elements } = req.body as { elements: CanvasElement[] };

  if (!Array.isArray(elements) || elements.length === 0) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing elements array.'));
  }

  const entry = containers.get(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    const files: string[] = [];

    for (const element of elements) {
      const componentName = (element.props?.name || element.id || 'CanvasComponent').replace(/[^a-zA-Z0-9]/g, '') || 'CanvasComponent';
      const jsxContent = canvasElementToReactNative(element);

      const fileContent = `import React from 'react';
import { View, Text, Image, TouchableOpacity, TextInput, FlatList, StyleSheet } from 'react-native';

export default function ${componentName}() {
  return (
${jsxContent}
  );
}
`;
      const filePath = `app/components/canvas/${componentName}.tsx`;
      await execInContainer(entry.id, `mkdir -p /workspace/app/components/canvas`);
      await execInContainer(entry.id, `cat > /workspace/${filePath} << 'CANVASEOF'\n${fileContent}\nCANVASEOF`);
      files.push(filePath);
    }

    console.log(`[Canvas] Generated ${files.length} components for project ${projectId}`);
    sendSuccess(res, { files });
  } catch (error: any) {
    console.error(`[Canvas] Generation failed for project ${projectId}:`, error.message);
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Canvas generation failed: ${error.message}`));
  }
}));

startupInfo('routes.openclaw-canvas', 'registered');

// ==================== END OPENCLAW CANVAS ====================

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

// Grace period before stopping a watcher when last client disconnects.
// Keeps lastCheck state alive so reconnecting clients don't get a full file replay.
const WATCHER_STOP_GRACE_MS = 30000; // 30 seconds
const fileWatchStopTimers = new Map<string, NodeJS.Timeout>();

// Pending watch connections waiting for container to be ready
const pendingWatchConnections = new Map<string, Set<{ ws: WebSocket; userId: string }>>();

// Helper to wait for container with timeout
async function waitForContainer(projectId: string, timeoutMs: number = 5000): Promise<{ id: string; lastActive: number; port: number; ptyPort: number; backgroundDev?: boolean; userId?: string } | undefined> {
  const startTime = Date.now();
  const checkInterval = 500; // Check every 500ms

  while (Date.now() - startTime < timeoutMs) {
    const entry = containers.get(projectId);
    if (entry) {
      return entry;
    }
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  return undefined;
}

app.ws('/watch/:projectId', async (ws, req) => {
  const { projectId } = req.params;

  // Authenticate WebSocket connection
  const authSession = await authenticateWebSocket(ws, req);
  if (!authSession) return;

  // Register for WebSocket keepalive (ping/pong every 30s, timeout after 60s)
  wsKeepalive.register(ws as any, projectId, 'watch', authSession.userId);

  // Register for WebSocket rate limiting
  const watchRateLimiter = getWsRateLimiter('watch');
  watchRateLimiter.track(ws as any);

  let entry = containers.get(projectId);

  // If container not found, wait briefly for it to be created
  if (!entry) {
    console.log(`[FileWatch] Container not ready for ${projectId}, waiting...`);

    // Wait up to 5 seconds for the container
    entry = await waitForContainer(projectId, 5000);

    if (!entry) {
      // Still not ready after waiting - close with 1008 code
      // Client will handle this gracefully with exponential backoff
      console.log(`[FileWatch] Container still not ready for ${projectId}, closing connection`);
      wsKeepalive.closeWithHint(ws as any, 'container_not_found', 'Container not found for this project', 1008);
      return;
    }

    console.log(`[FileWatch] Container became ready for ${projectId}`);
  }

  // Cancel any pending stop timer — a client is reconnecting
  const pendingStop = fileWatchStopTimers.get(projectId);
  if (pendingStop) {
    clearTimeout(pendingStop);
    fileWatchStopTimers.delete(projectId);
    console.log(`[FileWatch] Cancelled pending stop for ${projectId} — client reconnected`);
  }

  // Add client to watch list
  if (!fileWatchClients.has(projectId)) {
    fileWatchClients.set(projectId, new Set());
  }
  fileWatchClients.get(projectId)!.add(ws as any);

  // Start file watcher for this project if not already running
  fileWatcher.startWatching(entry.id, projectId);

  console.log(`[FileWatch] Client connected for ${projectId} [user: ${authSession.userId}]`);

  // Send initial connection confirmation
  ws.send(JSON.stringify({ type: 'connected', projectId }));

  // Handle incoming messages (heartbeat pings from client)
  ws.on('message', (data) => {
    // Rate limit check
    if (!watchRateLimiter.allowMessage(ws as any)) return;

    try {
      const msg = JSON.parse(typeof data === 'string' ? data : data.toString());
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch {
      // Not JSON, ignore
    }
  });

  ws.on('close', () => {
    const clients = fileWatchClients.get(projectId);
    if (clients) {
      clients.delete(ws as any);
      if (clients.size === 0) {
        // Don't stop watcher immediately — keep lastCheck state alive
        // so reconnecting clients don't get a full file replay
        fileWatchClients.delete(projectId);
        console.log(`[FileWatch] Last client gone for ${projectId}, stopping watcher in ${WATCHER_STOP_GRACE_MS / 1000}s`);
        fileWatchStopTimers.set(projectId, setTimeout(() => {
          fileWatchStopTimers.delete(projectId);
          // Only stop if no clients reconnected during the grace period
          if (!fileWatchClients.has(projectId) || fileWatchClients.get(projectId)!.size === 0) {
            fileWatcher.stopWatching(projectId);
            console.log(`[FileWatch] Watcher stopped for ${projectId} (grace period expired)`);
          }
        }, WATCHER_STOP_GRACE_MS));
      }
    }
    console.log(`[FileWatch] Client disconnected for ${projectId}`);
  });

  ws.on('error', (err) => {
    console.error(`[FileWatch] Error for ${projectId}:`, err.message);
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

// ==================== BUILD ERROR STREAMING ====================
// WebSocket endpoint for real-time build error notifications
// Used by the auto-fix feature to detect errors and trigger AI fixes

const buildErrorClients = new Map<string, Set<WebSocket>>();
const lastBuildErrors = new Map<string, string>(); // Track last error hash to avoid duplicates

/**
 * Hash errors to detect if they've changed
 */
function hashBuildErrors(errors: ReturnType<typeof parseAllErrors>): string {
  return errors.map(e => `${e.type}:${e.filePath || ''}:${e.line || ''}:${e.shortMessage}`).sort().join('|');
}

/**
 * Notify all connected clients about build errors for a project
 */
function notifyBuildErrors(projectId: string, errors: ReturnType<typeof parseAllErrors>, hasBlocking: boolean): void {
  const clients = buildErrorClients.get(projectId);
  if (!clients || clients.size === 0) return;

  // Check if errors have changed
  const errorHash = hashBuildErrors(errors);
  const lastHash = lastBuildErrors.get(projectId);

  if (errorHash === lastHash) {
    return; // No change, don't notify
  }
  lastBuildErrors.set(projectId, errorHash);

  const message = JSON.stringify({
    type: hasBlocking && errors.length > 0 ? 'errors' : 'clear',
    errors: errors,
    hasBlockingErrors: hasBlocking,
    timestamp: Date.now(),
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (err) {
        console.warn('[BuildErrors] Failed to send to client:', err);
      }
    }
  }

  if (hasBlocking && errors.length > 0) {
    console.log(`[BuildErrors] Notified ${clients.size} clients of ${errors.length} errors for ${projectId}`);
  }
}

// Build error polling - check logs periodically for errors
const buildErrorPollers = new Map<string, NodeJS.Timeout>();

function startBuildErrorPolling(containerId: string, projectId: string): void {
  // Don't start if already polling
  if (buildErrorPollers.has(projectId)) return;

  const pollInterval = setInterval(async () => {
    const clients = buildErrorClients.get(projectId);
    if (!clients || clients.size === 0) {
      // No clients, stop polling
      clearInterval(pollInterval);
      buildErrorPollers.delete(projectId);
      return;
    }

    try {
      const logs = await devServerManager.getLogs(containerId, projectId, 100);
      const errors = parseAllErrors(logs);
      const blocking = hasBlockingErrors(logs);

      notifyBuildErrors(projectId, errors, blocking);
    } catch (err) {
      // Container might be gone, stop polling
      console.warn(`[BuildErrors] Error polling for ${projectId}:`, err);
    }
  }, 3000); // Poll every 3 seconds

  buildErrorPollers.set(projectId, pollInterval);
  console.log(`[BuildErrors] Started polling for ${projectId}`);
}

function stopBuildErrorPolling(projectId: string): void {
  const poller = buildErrorPollers.get(projectId);
  if (poller) {
    clearInterval(poller);
    buildErrorPollers.delete(projectId);
    lastBuildErrors.delete(projectId);
    console.log(`[BuildErrors] Stopped polling for ${projectId}`);
  }
}

// WebSocket endpoint for build errors
app.ws('/build-errors/:projectId', async (ws, req) => {
  const { projectId } = req.params;

  // Authenticate WebSocket connection
  const authSession = await authenticateWebSocket(ws, req);
  if (!authSession) return;

  // Register for WebSocket keepalive
  wsKeepalive.register(ws as any, projectId, 'build-errors', authSession.userId);

  // Register for WebSocket rate limiting
  const buildErrorsRateLimiter = getWsRateLimiter('build-errors');
  buildErrorsRateLimiter.track(ws as any);

  // Check if container exists
  const entry = containers.get(projectId);
  if (!entry) {
    console.log(`[BuildErrors] Container not found for ${projectId}`);
    wsKeepalive.closeWithHint(ws as any, 'container_not_found', 'Container not found for this project', 1008);
    return;
  }

  // Add client to build error watch list
  if (!buildErrorClients.has(projectId)) {
    buildErrorClients.set(projectId, new Set());
  }
  buildErrorClients.get(projectId)!.add(ws as any);

  // Start polling for errors
  startBuildErrorPolling(entry.id, projectId);

  console.log(`[BuildErrors] Client connected for ${projectId} [user: ${authSession.userId}]`);

  // Send initial state - check current logs for errors
  try {
    const logs = await devServerManager.getLogs(entry.id, projectId, 100);
    const errors = parseAllErrors(logs);
    const blocking = hasBlockingErrors(logs);

    ws.send(JSON.stringify({
      type: 'connected',
      projectId,
      errors: blocking ? errors : [],
      hasBlockingErrors: blocking,
    }));

    if (blocking && errors.length > 0) {
      lastBuildErrors.set(projectId, hashBuildErrors(errors));
    }
  } catch (err) {
    ws.send(JSON.stringify({
      type: 'connected',
      projectId,
      errors: [],
      hasBlockingErrors: false,
    }));
  }

  ws.on('close', () => {
    const clients = buildErrorClients.get(projectId);
    if (clients) {
      clients.delete(ws as any);
      if (clients.size === 0) {
        buildErrorClients.delete(projectId);
        stopBuildErrorPolling(projectId);
      }
    }
    console.log(`[BuildErrors] Client disconnected for ${projectId}`);
  });

  ws.on('error', (err) => {
    console.error(`[BuildErrors] Error for ${projectId}:`, err.message);
  });
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
      const pathname = '/api/projects';
      const headers = buildInternalServiceHeaders({
        method: 'GET',
        pathname,
        body: '',
        serviceKey: INTERNAL_SERVICE_KEY,
      });
      headers.set('X-User-Id', userId);
      const response = await fetch(`${APP_API_URL}${pathname}`, {
        method: 'GET',
        headers,
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
      const pathname = `/api/projects/${projectId}`;
      const headers = buildInternalServiceHeaders({
        method: 'GET',
        pathname,
        body: '',
        serviceKey: INTERNAL_SERVICE_KEY,
      });
      headers.set('X-User-Id', userId);
      const response = await fetch(`${APP_API_URL}${pathname}`, {
        method: 'GET',
        headers,
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

startupInfo('routes.mobile', 'mounted', { basePath: '/api/mobile' });

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

// NOTE: HTTP server is created at the top of the file along with express-ws initialization
// This ensures WebSocket routes registered with app.ws() work properly

// Initialize Yjs collaboration WebSocket server
const collabWss = createCollaborationServer(server, '/collab');
startupInfo('collaboration', 'server ready', { path: '/collab' });

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  try {
    // Shutdown WebSocket keepalive connections first (sends hints to clients)
    console.log('🔌 Shutting down WebSocket keepalive connections...');
    wsKeepalive.shutdown();

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

    // Stop metering system
    console.log('📊 Stopping metering system...');
    try {
      const meteringCollector = getMeteringCollector();
      meteringCollector.stop();
      const usageAggregator = getUsageAggregator();
      usageAggregator.stop();
    } catch (_) {
      // Metering may not have been initialized; ignore
    }

    // Stop health monitor and resource optimizer
    console.log('💊 Stopping health monitor...');
    healthMonitor.stop();
    console.log('📊 Stopping resource optimizer...');
    resourceOptimizer.stop();

    // Shutdown container pool
    console.log('⛔ Shutting down container pool...');
    try {
      await containerPool.shutdown();
    } catch (err: any) {
      console.error('Container pool shutdown error:', err.message);
    }

    // Wait for debounced file saves to flush
    await new Promise(resolve => setTimeout(resolve, 300));

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

// ==================== Public Sandbox API ====================
// Mount the public API for sandbox-as-a-service

const sandboxDependencies: SandboxDependencies = {
  createContainer: async (_options) => {
    // Acquire container from the pool
    const pooledContainer = await containerPool.acquire();
    if (!pooledContainer) {
      throw new Error('Failed to acquire container from pool');
    }
    return { containerId: pooledContainer.id, port: pooledContainer.port };
  },
  startContainer: async (containerId: string) => {
    const container = docker.getContainer(containerId);
    await container.start();
  },
  stopContainer: async (containerId: string) => {
    const container = docker.getContainer(containerId);
    await container.stop();
  },
  deleteContainer: async (containerId: string) => {
    await docker.getContainer(containerId).remove({ force: true });
  },
  execInContainer: async (containerId: string, command: string, options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
  }) => {
    const container = docker.getContainer(containerId);
    const startTime = Date.now();

    const exec = await container.exec({
      Cmd: options?.cwd ? ['sh', '-c', `cd "${options.cwd}" && ${command}`] : ['sh', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      Env: options?.env ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`) : undefined,
    });
    const stream = await exec.start({ hijack: true, stdin: false });

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let killed = false;

      const timeoutId = options?.timeoutMs ? setTimeout(() => {
        timedOut = true;
        killed = true;
        stream.destroy();
      }, options.timeoutMs) : null;

      stream.on('data', (chunk: Buffer) => {
        // Docker multiplexed stream format
        const header = chunk.slice(0, 8);
        const type = header[0]; // 1 = stdout, 2 = stderr
        const content = chunk.slice(8).toString();
        if (type === 1) stdout += content;
        else stderr += content;
      });

      stream.on('end', async () => {
        if (timeoutId) clearTimeout(timeoutId);
        const result = await exec.inspect();
        resolve({
          exitCode: result.ExitCode ?? 0,
          stdout,
          stderr,
          executionTimeMs: Date.now() - startTime,
          timedOut,
          killed,
        });
      });

      stream.on('error', () => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve({
          exitCode: -1,
          stdout,
          stderr,
          executionTimeMs: Date.now() - startTime,
          timedOut,
          killed: true,
        });
      });
    });
  },
  writeFile: async (containerId: string, filePath: string, content: string) => {
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: ['sh', '-c', `mkdir -p "$(dirname "${filePath}")" && cat > "${filePath}"`],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({ hijack: true, stdin: true });
    stream.write(content);
    stream.end();
  },
  readFile: async (containerId: string, filePath: string) => {
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: ['cat', filePath],
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({ hijack: true, stdin: false });

    return new Promise((resolve, reject) => {
      let content = '';
      stream.on('data', (chunk: Buffer) => {
        content += chunk.slice(8).toString();
      });
      stream.on('end', () => {
        // Detect MIME type from extension
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const mimeTypes: Record<string, string> = {
          'js': 'application/javascript',
          'ts': 'application/typescript',
          'tsx': 'application/typescript',
          'jsx': 'application/javascript',
          'json': 'application/json',
          'html': 'text/html',
          'css': 'text/css',
          'md': 'text/markdown',
          'txt': 'text/plain',
        };
        resolve({
          content,
          size: Buffer.byteLength(content),
          mimeType: mimeTypes[ext] || 'text/plain',
        });
      });
      stream.on('error', reject);
    });
  },
  deleteFile: async (containerId: string, filePath: string) => {
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: ['rm', '-f', filePath],
      AttachStdout: true,
      AttachStderr: true,
    });
    await exec.start({ hijack: true, stdin: false });
  },
  listFiles: async (containerId: string, dirPath: string) => {
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: ['find', dirPath, '-maxdepth', '1', '-printf', '%y|%s|%T@|%f\\n'],
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({ hijack: true, stdin: false });

    return new Promise((resolve) => {
      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.slice(8).toString();
      });
      stream.on('end', () => {
        const files = output.trim().split('\n').filter(Boolean).map((line) => {
          const [type, size, mtime, name] = line.split('|');
          const isDir = type === 'd';
          return {
            name: name || '',
            path: `${dirPath}/${name}`,
            size: parseInt(size) || 0,
            modifiedAt: Math.floor(parseFloat(mtime) * 1000),
            isDirectory: isDir,
          };
        });
        resolve(files);
      });
    });
  },
  getPreviewUrl: (port: number) => {
    return `http://localhost:${port}`;
  },
  getTerminalUrl: (sandboxId: string) => {
    return `ws://localhost:${PORT}/terminal/${sandboxId}`;
  },
};

// Initialize sandbox routes with dependencies
initSandboxRoutes(sandboxDependencies);

// Project dependencies for Public API
const projectDependencies: ProjectDependencies = {
  createContainer: async (options) => {
    const pooledContainer = await containerPool.acquire();
    if (!pooledContainer) {
      throw new Error('Failed to acquire container from pool');
    }
    return { containerId: pooledContainer.id, port: pooledContainer.port };
  },
  startContainer: async (containerId: string) => {
    const container = docker.getContainer(containerId);
    await container.start();
  },
  stopContainer: async (containerId: string) => {
    const container = docker.getContainer(containerId);
    await container.stop();
  },
  deleteContainer: async (containerId: string) => {
    await docker.getContainer(containerId).remove({ force: true });
  },
  getPreviewUrl: (port: number) => {
    return `http://localhost:${port}`;
  },
  publishProject: async (_projectId: string, _containerId: string) => {
    // TODO: Wire into existing Cloudflare/Vercel/Netlify deployment logic
    throw new Error('Publish not yet implemented for public API projects');
  },
};

// Initialize project routes with dependencies
initProjectRoutes(projectDependencies);

// Public API CORS - allows external API consumers with API key auth
app.use('/api/v1', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-App-Key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// OpenClaw API key registration - allows unauthenticated initial key creation
// This MUST be mounted BEFORE the authenticated routes
app.use('/api/v1/api-keys', openclawKeysRouter);

// Moltbook authentication - allows unauthenticated (creates account/key)
// This MUST be mounted BEFORE the authenticated routes
app.use('/api/v1/auth', moltbookAuthRouter);

// Apply public API middleware BEFORE mounting routes (auth, rate limiting, logging)
app.use('/api/v1', requestIdMiddleware, authenticateApiKey as any, rateLimitMiddleware as any, requestLoggingMiddleware as any);
app.use('/api/v1/sandboxes', sandboxRouter);
app.use('/api/v1/projects', projectRouter);

// Identity token endpoints (requires API key auth, but /verify uses app key auth internally)
app.use('/api/v1/identity', identityRouter);

// App key management endpoints (requires API key auth)
app.use('/api/v1/app-keys', appKeysRouter);

// Polar.sh webhook endpoint
const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || '';
if (POLAR_WEBHOOK_SECRET) {
  app.post('/api/webhooks/polar', express.raw({ type: 'application/json' }), createPolarWebhookHandler(POLAR_WEBHOOK_SECRET));
  startupInfo('routes.polar-webhook', 'registered', { path: '/api/webhooks/polar' });
} else {
  console.log('⚠️ POLAR_WEBHOOK_SECRET not set, Polar.sh webhooks disabled');
}

// Handle Polar webhook events
onWebhookEvent('subscription.active', async (data: any) => {
  console.log('📦 Subscription activated:', data.id);
  // TODO: Provision resources for user
});

onWebhookEvent('subscription.canceled', async (data: any) => {
  console.log('📦 Subscription canceled:', data.id);
  // TODO: Deprovision resources
});

// ==================== API Key Management Endpoints ====================

// GET /api/v1/api-keys - list keys for authenticated user
app.get('/api/v1/api-keys', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Authentication required'));
  }

  const keys = listUserApiKeys(userId);
  sendSuccess(res, { keys });
}));

// POST /api/v1/api-keys - create a new API key
app.post('/api/v1/api-keys', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Authentication required'));
  }

  const { name, scopes, allowedIps, expiresAt, isTestKey, metadata } = req.body;
  if (!name || !scopes || !Array.isArray(scopes) || scopes.length === 0) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'name and scopes[] are required'));
  }

  try {
    const result = createApiKey(userId, { name, scopes, allowedIps, expiresAt, isTestKey, metadata });
    sendSuccess(res, result);
  } catch (err: any) {
    sendError(res, createError(ErrorCode.VALIDATION_ERROR, err.message));
  }
}));

// DELETE /api/v1/api-keys/:id - delete an API key
app.delete('/api/v1/api-keys/:id', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Authentication required'));
  }

  const keyId = req.params.id;
  const deleted = deleteApiKey(keyId, userId);
  if (!deleted) {
    return sendError(res, createError(ErrorCode.NOT_FOUND, 'API key not found or access denied'));
  }

  sendSuccess(res, { deleted: true, id: keyId });
}));

// PATCH /api/v1/api-keys/:id - revoke (deactivate) an API key without deleting
app.patch('/api/v1/api-keys/:id', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Authentication required'));
  }

  const keyId = req.params.id;
  const revoked = revokeApiKey(keyId, userId);
  if (!revoked) {
    return sendError(res, createError(ErrorCode.NOT_FOUND, 'API key not found or access denied'));
  }

  sendSuccess(res, { revoked: true, id: keyId, status: 'inactive' });
}));

// GET /api/v1/api-keys/usage - get aggregated usage stats for user's keys
app.get('/api/v1/api-keys/usage', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Authentication required'));
  }

  const keys = listUserApiKeys(userId);
  const usageByKey: Record<string, { name: string; keyPrefix: string; usage: ReturnType<typeof getUsage>; totalRequests: number }> = {};
  let totalRequests = 0;

  for (const key of keys) {
    const usage = getUsage(key.id);
    usageByKey[key.id] = {
      name: key.name,
      keyPrefix: key.keyPrefix,
      usage,
      totalRequests: key.totalRequests,
    };
    totalRequests += key.totalRequests;
  }

  sendSuccess(res, {
    totalKeys: keys.length,
    activeKeys: keys.filter(k => k.isActive).length,
    totalRequests,
    keys: usageByKey,
  });
}));

console.log('🔑 API key management endpoints registered');

// ==================== Usage, Subscription & Invoice Endpoints ====================

// GET /api/usage - return usage aggregator data for the authenticated user
app.get('/api/usage', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Authentication required'));
  }

  try {
    const usageAggregator = getUsageAggregator();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const summary = usageAggregator.getUserSummary(userId, monthStart, monthEnd);
    const byProject = Object.fromEntries(usageAggregator.getCurrentMonthUsageByProject(userId));

    let quotaStatus = null;
    try {
      const quotaEnforcer = getQuotaEnforcer();
      quotaStatus = quotaEnforcer.getQuotaStatus(userId);
    } catch (_) {
      // Quota enforcer may not be initialized
    }

    sendSuccess(res, {
      summary,
      byProject,
      quota: quotaStatus,
    });
  } catch (err: any) {
    sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Failed to fetch usage data: ${err.message}`));
  }
}));

// GET /api/subscription - return subscription data from billing records
app.get('/api/subscription', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Authentication required'));
  }

  const active = getActiveSubscriptionByUserId(userId);
  const all = getSubscriptionsByUserId(userId);

  sendSuccess(res, {
    active: active || null,
    subscriptions: all,
  });
}));

// GET /api/invoices - return invoice / webhook log data from billing records
app.get('/api/invoices', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const userId = req.userId;
  if (!userId || userId === 'anonymous') {
    return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Authentication required'));
  }

  const limit = parseInt(req.query.limit as string) || 50;

  // Get subscription-related webhook logs as invoice proxy
  // In production this would query a dedicated invoices table
  const subscriptions = getSubscriptionsByUserId(userId);
  const logs = getWebhookLogs(limit);

  sendSuccess(res, {
    subscriptions,
    recentEvents: logs,
  });
}));

console.log('📊 Usage, subscription, and invoice endpoints registered');

// ==================== Deployment Routes ====================

// Vercel deployment routes
app.post('/api/deploy/vercel/validate', asyncHandler(async (req: express.Request, res: express.Response) => {
  const { token } = req.body;
  if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Token required'));
  const result = await vercelDeploy.validateToken(token);
  sendSuccess(res, result);
}));

app.get('/api/deploy/vercel/projects', asyncHandler(async (req: express.Request, res: express.Response) => {
  const token = req.headers['x-vercel-token'] as string;
  const teamId = req.query.teamId as string | undefined;
  if (!token) return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Token required'));
  const projects = await vercelDeploy.listProjects({ provider: 'vercel', token, teamId });
  sendSuccess(res, { projects });
}));

app.post('/api/deploy/vercel', asyncHandler(async (req: express.Request, res: express.Response) => {
  const { token, teamId, config, files } = req.body;
  if (!token || !config || !files) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Token, config, and files required'));
  const credentials: ProviderCredentials = { provider: 'vercel', token, teamId };
  const deployment = await vercelDeploy.deploy(credentials, config, files);
  sendSuccess(res, { deployment });
}));

app.get('/api/deploy/vercel/:deploymentId', asyncHandler(async (req: express.Request, res: express.Response) => {
  const token = req.headers['x-vercel-token'] as string;
  const teamId = req.query.teamId as string | undefined;
  const { deploymentId } = req.params;
  const projectId = req.query.projectId as string || deploymentId;
  if (!token) return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Token required'));
  const deployment = await vercelDeploy.getDeployment({ provider: 'vercel', token, teamId }, deploymentId, projectId);
  sendSuccess(res, { deployment });
}));

app.get('/api/deploy/vercel/:projectId/deployments', asyncHandler(async (req: express.Request, res: express.Response) => {
  const token = req.headers['x-vercel-token'] as string;
  const teamId = req.query.teamId as string | undefined;
  const { projectId } = req.params;
  if (!token) return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Token required'));
  const deployments = await vercelDeploy.listDeployments({ provider: 'vercel', token, teamId }, { projectId, limit: 20 });
  sendSuccess(res, { deployments });
}));

app.post('/api/deploy/vercel/:projectId/rollback', asyncHandler(async (req: express.Request, res: express.Response) => {
  const token = req.headers['x-vercel-token'] as string;
  const teamId = req.query.teamId as string | undefined;
  const { projectId } = req.params;
  const { deploymentId } = req.body;
  if (!token || !deploymentId) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Token and deploymentId required'));
  const deployment = await vercelDeploy.rollback({ provider: 'vercel', token, teamId }, projectId, deploymentId);
  sendSuccess(res, { deployment });
}));

// Netlify deployment routes
app.post('/api/deploy/netlify/validate', asyncHandler(async (req: express.Request, res: express.Response) => {
  const { token } = req.body;
  if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Token required'));
  const result = await netlifyDeploy.validateToken(token);
  sendSuccess(res, result);
}));

app.get('/api/deploy/netlify/sites', asyncHandler(async (req: express.Request, res: express.Response) => {
  const token = req.headers['x-netlify-token'] as string;
  if (!token) return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Token required'));
  const sites = await netlifyDeploy.listSites({ provider: 'netlify', token });
  sendSuccess(res, { sites });
}));

app.post('/api/deploy/netlify', asyncHandler(async (req: express.Request, res: express.Response) => {
  const { token, config, files } = req.body;
  if (!token || !config || !files) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Token, config, and files required'));
  const credentials: ProviderCredentials = { provider: 'netlify', token };
  const deployment = await netlifyDeploy.deploy(credentials, config, files);
  sendSuccess(res, { deployment });
}));

app.get('/api/deploy/netlify/:siteId/deployments', asyncHandler(async (req: express.Request, res: express.Response) => {
  const token = req.headers['x-netlify-token'] as string;
  const { siteId } = req.params;
  if (!token) return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Token required'));
  const deployments = await netlifyDeploy.listDeployments({ provider: 'netlify', token }, siteId, { limit: 20 });
  sendSuccess(res, { deployments });
}));

app.post('/api/deploy/netlify/:siteId/rollback', asyncHandler(async (req: express.Request, res: express.Response) => {
  const token = req.headers['x-netlify-token'] as string;
  const { siteId } = req.params;
  const { deploymentId, projectId } = req.body;
  if (!token || !deploymentId) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Token and deploymentId required'));
  const deployment = await netlifyDeploy.rollback({ provider: 'netlify', token }, siteId, deploymentId, projectId || siteId);
  sendSuccess(res, { deployment });
}));

// Cloudflare Workers deployment routes
app.post('/api/deploy/cloudflare/validate', asyncHandler(async (req: express.Request, res: express.Response) => {
  const { apiToken, accountId } = req.body;
  if (!apiToken || !accountId) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'API token and account ID required'));
  const result = await cloudflareDeploy.validateToken(apiToken, accountId);
  sendSuccess(res, result);
}));

app.post('/api/deploy/cloudflare/deploy', asyncHandler(async (req: express.Request, res: express.Response) => {
  const { apiToken, accountId, projectId, workerName, customDomain, config, files } = req.body;
  if (!apiToken || !accountId || !workerName || !files) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'API token, account ID, worker name, and files are required'));
  }
  const credentials: ProviderCredentials = { provider: 'cloudflare', token: apiToken, accountId };
  const deployConfig: DeploymentConfig = {
    provider: 'cloudflare',
    projectName: workerName,
    projectId: projectId || workerName,
    providerProjectId: workerName,
    accountId,
    ...(config || {}),
  };
  const deployment = await cloudflareDeploy.deploy(credentials, deployConfig, files);
  sendSuccess(res, { success: true, url: deployment.url, workerId: deployment.id, deployment });
}));

app.get('/api/deploy/cloudflare/list', asyncHandler(async (req: express.Request, res: express.Response) => {
  const apiToken = req.query.apiToken as string || req.headers['x-cloudflare-token'] as string;
  const accountId = req.query.accountId as string;
  if (!apiToken || !accountId) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'API token and account ID required'));
  const credentials: ProviderCredentials = { provider: 'cloudflare', token: apiToken, accountId };
  const workers = await cloudflareDeploy.listWorkers(credentials);
  sendSuccess(res, { workers });
}));

app.get('/api/deploy/cloudflare/:workerName/deployments', asyncHandler(async (req: express.Request, res: express.Response) => {
  const apiToken = req.headers['x-cloudflare-token'] as string;
  const accountId = req.query.accountId as string;
  const { workerName } = req.params;
  if (!apiToken || !accountId) return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Token and account ID required'));
  const credentials: ProviderCredentials = { provider: 'cloudflare', token: apiToken, accountId };
  const deployments = await cloudflareDeploy.listDeployments(credentials, workerName);
  sendSuccess(res, { deployments });
}));

app.post('/api/deploy/cloudflare/:workerName/rollback', asyncHandler(async (req: express.Request, res: express.Response) => {
  const apiToken = req.headers['x-cloudflare-token'] as string;
  const accountId = req.query.accountId as string;
  const { workerName } = req.params;
  const { versionId, projectId } = req.body;
  if (!apiToken || !accountId || !versionId) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Token, account ID, and versionId required'));
  }
  const credentials: ProviderCredentials = { provider: 'cloudflare', token: apiToken, accountId };
  const deployment = await cloudflareDeploy.rollback(credentials, workerName, versionId, projectId || workerName);
  sendSuccess(res, { deployment });
}));

// Template routes
app.get('/api/templates', (_req: express.Request, res: express.Response) => {
  const templates = templateManager.getAllTemplates();
  sendSuccess(res, { templates });
});

app.get('/api/templates/:templateId', (req: express.Request, res: express.Response) => {
  const template = templateManager.getTemplate(req.params.templateId);
  if (!template) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Template not found'));
  sendSuccess(res, { template });
});

app.get('/api/templates/search/:query', (req: express.Request, res: express.Response) => {
  const results = templateManager.searchTemplates(req.params.query);
  sendSuccess(res, { templates: results });
});

// Health monitor routes
app.get('/api/health/containers', asyncHandler(async (_req: express.Request, res: express.Response) => {
  const statuses = healthMonitor.getAllStatuses();
  sendSuccess(res, { containers: statuses });
}));

app.get('/api/health/containers/:containerId', asyncHandler(async (req: express.Request, res: express.Response) => {
  const status = healthMonitor.getHealthStatus(req.params.containerId);
  if (!status) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));
  sendSuccess(res, status);
}));

// Resource optimizer routes
app.get('/api/resources/profiles', asyncHandler(async (_req: express.Request, res: express.Response) => {
  const profiles = resourceOptimizer.getAllProfiles();
  sendSuccess(res, { profiles });
}));

app.get('/api/resources/stats', asyncHandler(async (_req: express.Request, res: express.Response) => {
  const stats = resourceOptimizer.getStats();
  sendSuccess(res, stats);
}));

// ==================== Publish (Go Live) Routes ====================

import {
  generateSlug,
  registerSlug,
  getSlugForProject,
  unregisterSlug,
  getPublishedPath,
  getPublishMeta,
  savePublishMeta,
  changeSlug,
} from './persistence.js';
import { execSync } from 'child_process';

/**
 * Detect the build output directory based on framework/package.json
 */
async function detectBuildOutput(containerId: string): Promise<{ buildCmd: string; outputDir: string; framework: string }> {
  // Read package.json to detect framework
  let pkgJson: any = {};
  try {
    const pkgRaw = await execInContainer(containerId, 'cat /workspace/package.json 2>/dev/null || echo "{}"');
    pkgJson = JSON.parse(pkgRaw);
  } catch {
    // ignore
  }

  const deps = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };
  const scripts = pkgJson.scripts || {};

  // Detect framework and set build command + output dir
  if (deps['next']) {
    return { buildCmd: 'npm run build', outputDir: '.next', framework: 'nextjs' };
  }
  if (deps['@remix-run/react'] || deps['@remix-run/dev']) {
    return { buildCmd: 'npm run build', outputDir: 'build/client', framework: 'remix' };
  }
  if (deps['expo'] || deps['react-native']) {
    return { buildCmd: 'npx expo export --platform web', outputDir: 'dist', framework: 'expo' };
  }
  if (deps['react-scripts']) {
    return { buildCmd: 'npm run build', outputDir: 'build', framework: 'cra' };
  }
  if (deps['vite']) {
    return { buildCmd: 'npm run build', outputDir: 'dist', framework: 'vite' };
  }
  // Fallback
  return { buildCmd: 'npm run build', outputDir: 'dist', framework: 'unknown' };
}

// POST /api/publish/:projectId - Build and publish a project
app.post('/api/publish/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const userId = req.userId || 'anonymous';

  const entry = containers.get(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    // 1. Detect framework
    const { buildCmd, outputDir, framework } = await detectBuildOutput(entry.id);
    console.log(`[Publish] Project ${projectId}: framework=${framework}, buildCmd=${buildCmd}, outputDir=${outputDir}`);

    // 2. Install dependencies if needed
    try {
      await execInContainer(entry.id, 'cd /workspace && [ -d node_modules ] || npm install');
    } catch {
      // node_modules might already exist
    }

    // 2b. Install Expo web dependencies if needed
    if (framework === 'expo') {
      try {
        await execInContainer(entry.id, 'cd /workspace && npx expo install react-dom react-native-web @expo/metro-runtime 2>&1');
      } catch { /* may already be installed */ }
    }

    // 3. Run build
    console.log(`[Publish] Building project ${projectId}...`);
    const buildOutput = await execInContainer(entry.id, `cd /workspace && ${buildCmd} 2>&1`);
    console.log(`[Publish] Build complete for ${projectId}`);

    // 4. Verify build output exists
    const checkOutput = await execInContainer(entry.id, `ls -la /workspace/${outputDir}/ 2>/dev/null | head -5 || echo "NOT_FOUND"`);
    if (checkOutput.includes('NOT_FOUND')) {
      // Try common fallbacks
      const fallbackDirs = ['dist', 'build', 'out', '.next/static'];
      let found = false;
      for (const dir of fallbackDirs) {
        const check = await execInContainer(entry.id, `[ -d /workspace/${dir} ] && echo "EXISTS" || echo "NOPE"`);
        if (check.includes('EXISTS')) {
          console.log(`[Publish] Using fallback output dir: ${dir}`);
          // Continue with this dir
          found = true;
          break;
        }
      }
      if (!found) {
        return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Build output not found at /workspace/${outputDir}. Build may have failed.`));
      }
    }

    // 5. Generate slug
    const projectName = req.body?.name || projectId;
    const slug = registerSlug(projectId, generateSlug(projectName));

    // 6. Copy build output from container to host
    const publishedDir = getPublishedPath(slug);
    const fs = await import('fs');

    // Clean existing published content (atomic update)
    const tmpDir = publishedDir + '.tmp';
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true });

    // Use docker cp to extract build output
    execSync(`docker cp ${entry.id}:/workspace/${outputDir}/. ${tmpDir}/`, { timeout: 30000 });

    // Atomic swap
    if (fs.existsSync(publishedDir)) {
      const oldDir = publishedDir + '.old';
      if (fs.existsSync(oldDir)) fs.rmSync(oldDir, { recursive: true });
      fs.renameSync(publishedDir, oldDir);
      fs.renameSync(tmpDir, publishedDir);
      fs.rmSync(oldDir, { recursive: true });
    } else {
      fs.renameSync(tmpDir, publishedDir);
    }

    // 7. Save publish metadata
    const publishedAt = new Date().toISOString();
    savePublishMeta(slug, {
      projectId,
      userId,
      slug,
      publishedAt,
      framework,
      buildCommand: buildCmd,
      outputDir,
    });

    const url = `https://web.recoder.xyz/${slug}`;
    console.log(`[Publish] Project ${projectId} published at ${url}`);

    sendSuccess(res, { url, slug, publishedAt });
  } catch (error: any) {
    console.error(`[Publish] Failed to publish project ${projectId}:`, error.message);
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Publish failed: ${error.message}`));
  }
}));

// POST /api/unpublish/:projectId - Remove a published project
app.post('/api/unpublish/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;

  const slug = unregisterSlug(projectId);
  if (!slug) {
    return sendError(res, createError(ErrorCode.NOT_FOUND, 'Project is not published'));
  }

  // Remove published files
  const publishedDir = getPublishedPath(slug);
  const fs = await import('fs');
  if (fs.existsSync(publishedDir)) {
    fs.rmSync(publishedDir, { recursive: true });
  }

  console.log(`[Publish] Project ${projectId} unpublished (slug: ${slug})`);
  sendSuccess(res, { success: true });
}));

// GET /api/publish-status/:projectId - Check publish status
app.get('/api/publish-status/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;

  const slug = getSlugForProject(projectId);
  if (!slug) {
    return sendSuccess(res, { published: false });
  }

  const meta = getPublishMeta(slug);
  const { getDomainsForProject } = await import('./domain-manager.js');
  const customDomains = getDomainsForProject(projectId);
  sendSuccess(res, {
    published: true,
    url: `https://web.recoder.xyz/${slug}`,
    slug,
    publishedAt: meta?.publishedAt || null,
    framework: meta?.framework || null,
    customDomains: customDomains.map(d => ({
      domain: d.domain,
      status: d.status,
      url: d.status === 'active' ? `https://${d.domain}` : null,
    })),
  });
}));

// POST /api/publish/:projectId/slug - Change the slug for a published project
app.post('/api/publish/:projectId/slug', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const newSlug = req.body?.slug;

  if (!newSlug || typeof newSlug !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing or invalid slug'));
  }

  const result = changeSlug(projectId, newSlug.trim());

  if (!result.success) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, result.error || 'Failed to change slug'));
  }

  const url = `https://web.recoder.xyz/${result.slug}`;
  console.log(`[Publish] Project ${projectId} slug changed to ${result.slug}`);
  sendSuccess(res, { url, slug: result.slug, changed: true });
}));

startupInfo('routes.publish', 'registered');

// ==================== Custom Domain Routes ====================

app.use('/api/domains', authenticateRequest, domainRouter);
startSslRenewalScheduler();
startupInfo('routes.custom-domain', 'registered');

// ==================== SPRINT 9: PRODUCTION HARDENING ====================

// Import Sprint 9 services (abusePrevention already imported from ./security/index.js above)
import { backupService } from './backup/backup-service.js';
import { performanceProfiler, performanceMiddleware } from './monitoring/performance-profiler.js';

// Apply performance middleware to all routes
app.use(performanceMiddleware);

// Start background services
backupService.startScheduler();
performanceProfiler.startMonitoring();

// ── S9-1: Abuse Prevention Endpoints ──

// GET /api/admin/abuse/stats - Get abuse prevention statistics
app.get('/api/admin/abuse/stats', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  // TODO: Add admin role check
  const stats = abusePrevention.getStats();
  sendSuccess(res, stats);
}));

// GET /api/admin/abuse/events - Get recent abuse events
app.get('/api/admin/abuse/events', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const events = abusePrevention.getRecentEvents(limit);
  sendSuccess(res, { events, total: events.length });
}));

// GET /api/admin/abuse/blocklist - Get blocklist entries
app.get('/api/admin/abuse/blocklist', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const blocklist = abusePrevention.getBlocklist();
  sendSuccess(res, { blocklist, total: blocklist.length });
}));

// POST /api/admin/abuse/blocklist - Add to blocklist
app.post('/api/admin/abuse/blocklist', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { type, value, reason, expiresAt } = req.body;

  if (!type || !value || !reason) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'type, value, and reason are required'));
  }

  const entry = abusePrevention.addToBlocklist({
    type,
    value,
    reason,
    expiresAt: expiresAt ? new Date(expiresAt).getTime() : undefined,
    createdBy: req.userId,
  });

  sendSuccess(res, { entry });
}));

// DELETE /api/admin/abuse/blocklist/:id - Remove from blocklist
app.delete('/api/admin/abuse/blocklist/:id', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;
  const deleted = abusePrevention.removeFromBlocklist(id);

  if (!deleted) {
    return sendError(res, createError(ErrorCode.NOT_FOUND, 'Blocklist entry not found'));
  }

  sendSuccess(res, { deleted: true });
}));

console.log('🛡️ Abuse prevention endpoints registered');

// ── S10-3: Admin Alert Endpoints ──

// GET /api/admin/alerts - Get recent admin alerts
app.get('/api/admin/alerts', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const severity = req.query.severity as string | undefined;
  const category = req.query.category as string | undefined;
  const unacknowledgedOnly = req.query.unacknowledged === 'true';

  const alerts = getAlerts({
    limit,
    severity: severity as any,
    category: category as any,
    unacknowledgedOnly,
  });
  const counts = getAlertCounts();

  sendSuccess(res, { alerts, counts, total: alerts.length });
}));

// POST /api/admin/alerts/:id/acknowledge - Acknowledge an alert
app.post('/api/admin/alerts/:id/acknowledge', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;
  const userId = req.userId || 'unknown';

  const success = acknowledgeAlert(id, userId);
  if (!success) {
    return sendError(res, createError(ErrorCode.NOT_FOUND, 'Alert not found'));
  }

  sendSuccess(res, { acknowledged: true });
}));

// GET /api/admin/security/stats - Combined security statistics
app.get('/api/admin/security/stats', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const abuseStats = abusePrevention.getStats();
  const alertCounts = getAlertCounts();
  const wsRateLimitStats = getAllWsRateLimitStats();
  const wsStats = wsKeepalive.getStats();

  sendSuccess(res, {
    abuse: abuseStats,
    alerts: alertCounts,
    websocket: {
      connections: wsStats,
      rateLimits: wsRateLimitStats,
    },
  });
}));

console.log('🔔 Admin alert endpoints registered');

// ── S9-3: Backup & Recovery Endpoints ──

// GET /api/admin/backups - List backups
app.get('/api/admin/backups', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const jobs = backupService.getJobs(limit);
  sendSuccess(res, { jobs, total: jobs.length });
}));

// GET /api/admin/backups/stats - Get backup statistics
app.get('/api/admin/backups/stats', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const stats = backupService.getStats();
  sendSuccess(res, stats);
}));

// POST /api/admin/backups - Create a backup
app.post('/api/admin/backups', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { type = 'full', scope = 'all' } = req.body;
  const job = await backupService.createBackup(type, scope);
  sendSuccess(res, { job });
}));

// POST /api/admin/backups/:id/restore - Restore from a backup
app.post('/api/admin/backups/:id/restore', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;
  const { scope, targetDir, dryRun = true } = req.body;

  const result = await backupService.restore({
    backupId: id,
    scope,
    targetDir,
    dryRun,
  });

  if (!result.success) {
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, result.errors.join(', ')));
  }

  sendSuccess(res, result);
}));

// DELETE /api/admin/backups/:id - Delete a backup
app.delete('/api/admin/backups/:id', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;
  const deleted = backupService.deleteBackup(id);

  if (!deleted) {
    return sendError(res, createError(ErrorCode.NOT_FOUND, 'Backup not found'));
  }

  sendSuccess(res, { deleted: true });
}));

console.log('💾 Backup & recovery endpoints registered');

// ── S9-4: Performance Profiling Endpoints ──

// GET /api/admin/performance/metrics - Get performance metrics
app.get('/api/admin/performance/metrics', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const metrics = performanceProfiler.getMetrics();
  sendSuccess(res, metrics);
}));

// GET /api/admin/performance/slow-requests - Get slow requests
app.get('/api/admin/performance/slow-requests', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const slowRequests = performanceProfiler.getSlowRequests(limit);
  sendSuccess(res, { slowRequests, total: slowRequests.length });
}));

// GET /api/admin/performance/alerts - Get performance alerts
app.get('/api/admin/performance/alerts', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const alerts = performanceProfiler.getAlerts(limit);
  sendSuccess(res, { alerts, total: alerts.length });
}));

// GET /api/admin/performance/traces - Get recent traces
app.get('/api/admin/performance/traces', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const traces = performanceProfiler.getTraces(limit);
  sendSuccess(res, { traces, total: traces.length });
}));

// GET /api/admin/performance/heap - Get V8 heap statistics
app.get('/api/admin/performance/heap', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const heapStats = performanceProfiler.getHeapStats();
  sendSuccess(res, heapStats);
}));

console.log('📈 Performance profiling endpoints registered');

// ==================== END SPRINT 9 ====================

startupInfo('routes.deployment', 'registered', { providers: ['vercel', 'netlify'] });
startupInfo('routes.templates', 'registered');
startupInfo('routes.health-monitor', 'registered');
startupInfo('routes.resource-optimizer', 'registered');
startupInfo('middleware.public-api', 'applied', { modules: ['auth', 'rate-limiting', 'logging'] });

// ==================== SPRINT 12: Integrations & Themes ====================

import * as supabaseClient from './integrations/supabase-client.js';
import * as neonClient from './integrations/neon-client.js';
import * as integrationStore from './integrations/integration-store.js';
import * as themeStore from './integrations/theme-store.js';
import { BUILTIN_THEMES } from './integrations/builtin-themes.js';
import { generateThemePrompt, type Provider as ThemeProvider } from './integrations/theme-generator.js';
import * as promptStore from './integrations/prompt-store.js';
import * as vercelStore from './integrations/vercel-store.js';

// ── Supabase Integration Routes ────────────────────────────────────

// Connect Supabase (store access token)
app.post('/api/integrations/supabase/connect', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { accessToken } = req.body;
  if (!accessToken || typeof accessToken !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'accessToken is required'));
  }

  // Validate the token by listing organizations
  const valid = await supabaseClient.validateAccessToken(accessToken);
  if (!valid) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Invalid Supabase access token'));
  }

  integrationStore.setUserCredentials(req.userId!, 'supabase', { accessToken });
  const organizations = await supabaseClient.listOrganizations(accessToken);
  sendSuccess(res, { organizations });
}));

// Disconnect Supabase
app.delete('/api/integrations/supabase/disconnect', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  integrationStore.removeUserCredentials(req.userId!, 'supabase');
  sendSuccess(res, { disconnected: true });
}));

// List Supabase organizations
app.get('/api/integrations/supabase/organizations', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.supabase?.accessToken) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Supabase not connected'));
  }
  const organizations = await supabaseClient.listOrganizations(creds.supabase.accessToken);
  sendSuccess(res, { organizations });
}));

// List Supabase projects
app.get('/api/integrations/supabase/projects', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.supabase?.accessToken) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Supabase not connected'));
  }
  const projects = await supabaseClient.listProjects(creds.supabase.accessToken);
  sendSuccess(res, { projects });
}));

// List Supabase project branches
app.get('/api/integrations/supabase/projects/:supabaseProjectId/branches', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.supabase?.accessToken) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Supabase not connected'));
  }
  const branches = await supabaseClient.listBranches(creds.supabase.accessToken, req.params.supabaseProjectId);
  sendSuccess(res, { branches });
}));

// Get Supabase project API keys
app.get('/api/integrations/supabase/projects/:supabaseProjectId/api-keys', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.supabase?.accessToken) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Supabase not connected'));
  }
  const keys = await supabaseClient.getProjectApiKeys(creds.supabase.accessToken, req.params.supabaseProjectId);
  sendSuccess(res, { keys });
}));

// Link Supabase project to Recoder project
app.post('/api/integrations/supabase/:projectId/link', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { supabaseProjectId, organizationSlug } = req.body;
  if (!supabaseProjectId) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'supabaseProjectId is required'));
  }
  integrationStore.setProjectLink(req.params.projectId, 'supabase', {
    projectId: supabaseProjectId,
    organizationSlug: organizationSlug || '',
  });
  sendSuccess(res, { linked: true });
}));

// Unlink Supabase project
app.delete('/api/integrations/supabase/:projectId/unlink', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  integrationStore.removeProjectLink(req.params.projectId, 'supabase');
  sendSuccess(res, { unlinked: true });
}));

// Execute SQL on linked Supabase project
app.post('/api/integrations/supabase/:projectId/sql', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.supabase?.accessToken) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Supabase not connected'));
  }
  const links = integrationStore.getProjectLinks(req.params.projectId);
  if (!links.supabase) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No Supabase project linked'));
  }
  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'query is required'));
  }
  const result = await supabaseClient.executeSql(creds.supabase.accessToken, links.supabase.projectId, query);
  sendSuccess(res, result);
}));

// Get schema of linked Supabase project
app.get('/api/integrations/supabase/:projectId/schema', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.supabase?.accessToken) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Supabase not connected'));
  }
  const links = integrationStore.getProjectLinks(req.params.projectId);
  if (!links.supabase) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No Supabase project linked'));
  }
  const schema = await supabaseClient.getTableSchema(creds.supabase.accessToken, links.supabase.projectId);
  sendSuccess(res, { schema });
}));

// Deploy edge functions from container
app.post('/api/integrations/supabase/:projectId/deploy-functions', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.supabase?.accessToken) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Supabase not connected'));
  }
  const links = integrationStore.getProjectLinks(req.params.projectId);
  if (!links.supabase) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No Supabase project linked'));
  }

  // List edge function directories in the container
  const entry = containers.get(req.params.projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found'));
  }

  // Read supabase/functions directory
  const docker = new Docker();
  const container = docker.getContainer(entry.id);
  const exec = await container.exec({
    Cmd: ['sh', '-c', 'ls -d /app/supabase/functions/*/ 2>/dev/null || echo ""'],
    AttachStdout: true,
    AttachStderr: true,
  });
  const execStream = await exec.start({ Detach: false, Tty: false });
  const output = await new Promise<string>((resolve) => {
    let data = '';
    execStream.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    execStream.on('end', () => resolve(data.trim()));
  });

  if (!output) {
    return sendError(res, createError(ErrorCode.NOT_FOUND, 'No edge functions found in supabase/functions/'));
  }

  const functionDirs = output.split('\n').filter(Boolean).map(d => d.replace('/app/supabase/functions/', '').replace(/\/$/, ''));
  const results: Array<{ name: string; status: string; error?: string }> = [];

  for (const funcName of functionDirs) {
    try {
      // Read the function's index.ts file
      const readExec = await container.exec({
        Cmd: ['cat', `/app/supabase/functions/${funcName}/index.ts`],
        AttachStdout: true,
        AttachStderr: true,
      });
      const readStream = await readExec.start({ Detach: false, Tty: false });
      const content = await new Promise<string>((resolve) => {
        let data = '';
        readStream.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        readStream.on('end', () => resolve(data));
      });

      await supabaseClient.deployEdgeFunction(
        creds.supabase.accessToken,
        links.supabase.projectId,
        funcName,
        new Uint8Array(Buffer.from(content)),
      );
      results.push({ name: funcName, status: 'deployed' });
    } catch (err: any) {
      results.push({ name: funcName, status: 'failed', error: err.message });
    }
  }

  sendSuccess(res, { deployed: results });
}));

// Get edge function logs
app.get('/api/integrations/supabase/:projectId/edge-logs', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.supabase?.accessToken) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Supabase not connected'));
  }
  const links = integrationStore.getProjectLinks(req.params.projectId);
  if (!links.supabase) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No Supabase project linked'));
  }
  const since = req.query.since ? parseInt(req.query.since as string) : undefined;
  const logs = await supabaseClient.getEdgeFunctionLogs(creds.supabase.accessToken, links.supabase.projectId, since);
  sendSuccess(res, { logs });
}));

startupInfo('routes.supabase', 'registered');

// ── Neon PostgreSQL Integration Routes ─────────────────────────────

// Connect Neon (store API key)
app.post('/api/integrations/neon/connect', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'apiKey is required'));
  }
  const valid = await neonClient.validateApiKey(apiKey);
  if (!valid) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Invalid Neon API key'));
  }
  integrationStore.setUserCredentials(req.userId!, 'neon', { apiKey });
  const organizations = await neonClient.getOrganizations(apiKey);
  sendSuccess(res, { organizations });
}));

// Disconnect Neon
app.delete('/api/integrations/neon/disconnect', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  integrationStore.removeUserCredentials(req.userId!, 'neon');
  sendSuccess(res, { disconnected: true });
}));

// List Neon projects
app.get('/api/integrations/neon/projects', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.neon?.apiKey) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
  }
  const projects = await neonClient.listProjects(creds.neon.apiKey);
  sendSuccess(res, { projects });
}));

// Create Neon project
app.post('/api/integrations/neon/projects', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.neon?.apiKey) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
  }
  const { name, orgId } = req.body;
  if (!name || typeof name !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'name is required'));
  }
  const result = await neonClient.createProject(creds.neon.apiKey, name, orgId);
  sendSuccess(res, result);
}));

// List Neon project branches
app.get('/api/integrations/neon/projects/:neonProjectId/branches', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.neon?.apiKey) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
  }
  const branches = await neonClient.listBranches(creds.neon.apiKey, req.params.neonProjectId);
  sendSuccess(res, { branches });
}));

// Link Neon project to Recoder project
app.post('/api/integrations/neon/:projectId/link', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { neonProjectId, developmentBranchId, previewBranchId } = req.body;
  if (!neonProjectId || !developmentBranchId) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'neonProjectId and developmentBranchId are required'));
  }
  integrationStore.setProjectLink(req.params.projectId, 'neon', {
    projectId: neonProjectId,
    developmentBranchId,
    previewBranchId,
  });
  sendSuccess(res, { linked: true });
}));

// Unlink Neon project
app.delete('/api/integrations/neon/:projectId/unlink', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  integrationStore.removeProjectLink(req.params.projectId, 'neon');
  sendSuccess(res, { unlinked: true });
}));

// Get Neon connection URI for linked project
app.get('/api/integrations/neon/:projectId/connection-uri', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.neon?.apiKey) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
  }
  const links = integrationStore.getProjectLinks(req.params.projectId);
  if (!links.neon) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No Neon project linked'));
  }
  const branchId = (req.query.branchId as string) || links.neon.developmentBranchId;
  const uri = await neonClient.getConnectionUri(creds.neon.apiKey, links.neon.projectId, branchId);
  sendSuccess(res, { uri });
}));

// Set POSTGRES_URL in container .env
app.post('/api/integrations/neon/:projectId/set-env', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.neon?.apiKey) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
  }
  const links = integrationStore.getProjectLinks(req.params.projectId);
  if (!links.neon) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No Neon project linked'));
  }

  const branchId = req.body.branchId || links.neon.developmentBranchId;
  const uri = await neonClient.getConnectionUri(creds.neon.apiKey, links.neon.projectId, branchId);

  // Write POSTGRES_URL to container's .env file
  const entry = containers.get(req.params.projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found'));
  }

  const docker = new Docker();
  const container = docker.getContainer(entry.id);

  // Read existing .env, append/replace POSTGRES_URL
  const readExec = await container.exec({
    Cmd: ['sh', '-c', 'cat /app/.env 2>/dev/null || echo ""'],
    AttachStdout: true,
    AttachStderr: true,
  });
  const readStream = await readExec.start({ Detach: false, Tty: false });
  const existingEnv = await new Promise<string>((resolve) => {
    let data = '';
    readStream.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    readStream.on('end', () => resolve(data.trim()));
  });

  // Replace or append POSTGRES_URL
  const lines = existingEnv.split('\n').filter(l => !l.startsWith('POSTGRES_URL=') && !l.startsWith('DATABASE_URL='));
  lines.push(`POSTGRES_URL=${uri}`);
  lines.push(`DATABASE_URL=${uri}`);
  const newEnv = lines.filter(Boolean).join('\n') + '\n';

  const writeExec = await container.exec({
    Cmd: ['sh', '-c', `cat > /app/.env << 'ENVEOF'\n${newEnv}ENVEOF`],
    AttachStdout: true,
    AttachStderr: true,
  });
  await writeExec.start({ Detach: false, Tty: false });

  sendSuccess(res, { set: true, branchId });
}));

// Create Neon branch
app.post('/api/integrations/neon/:projectId/branches', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.neon?.apiKey) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
  }
  const links = integrationStore.getProjectLinks(req.params.projectId);
  if (!links.neon) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No Neon project linked'));
  }
  const { name, parentBranchId } = req.body;
  if (!name || !parentBranchId) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'name and parentBranchId are required'));
  }
  const branch = await neonClient.createBranch(creds.neon.apiKey, links.neon.projectId, name, parentBranchId);
  sendSuccess(res, { branch });
}));

// Delete Neon branch
app.delete('/api/integrations/neon/:projectId/branches/:branchId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.neon?.apiKey) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
  }
  const links = integrationStore.getProjectLinks(req.params.projectId);
  if (!links.neon) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No Neon project linked'));
  }
  await neonClient.deleteBranch(creds.neon.apiKey, links.neon.projectId, req.params.branchId);
  sendSuccess(res, { deleted: true });
}));

// Restore Neon branch
app.post('/api/integrations/neon/:projectId/branches/:branchId/restore', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const creds = integrationStore.getUserCredentials(req.userId!);
  if (!creds.neon?.apiKey) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Neon not connected'));
  }
  const links = integrationStore.getProjectLinks(req.params.projectId);
  if (!links.neon) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No Neon project linked'));
  }
  const { timestamp } = req.body;
  if (!timestamp) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'timestamp is required'));
  }
  await neonClient.restoreBranch(creds.neon.apiKey, links.neon.projectId, req.params.branchId, timestamp);
  sendSuccess(res, { restored: true });
}));

startupInfo('routes.neon', 'registered');

// ── Theme Routes ───────────────────────────────────────────────────

// List all themes (built-in + custom)
app.get('/api/themes', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const customThemes = themeStore.listThemes(req.userId!);
  sendSuccess(res, {
    builtinThemes: BUILTIN_THEMES.map(t => ({ id: t.id, name: t.name, description: t.description })),
    customThemes,
  });
}));

// Create custom theme
app.post('/api/themes', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { name, description, prompt } = req.body;
  if (!name || !prompt) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'name and prompt are required'));
  }
  const theme = themeStore.createTheme(req.userId!, name, description || '', prompt);
  sendSuccess(res, { theme });
}));

// Update custom theme
app.put('/api/themes/:themeId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { name, description, prompt } = req.body;
  const theme = themeStore.updateTheme(req.params.themeId, { name, description, prompt });
  if (!theme) {
    return sendError(res, createError(ErrorCode.NOT_FOUND, 'Theme not found'));
  }
  sendSuccess(res, { theme });
}));

// Delete custom theme
app.delete('/api/themes/:themeId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const deleted = themeStore.deleteTheme(req.params.themeId);
  if (!deleted) {
    return sendError(res, createError(ErrorCode.NOT_FOUND, 'Theme not found'));
  }
  sendSuccess(res, { deleted: true });
}));

// Get project theme
app.get('/api/themes/project/:projectId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const themeId = themeStore.getProjectTheme(req.params.projectId);
  if (!themeId) {
    return sendSuccess(res, { themeId: null, themeName: null, themePrompt: null });
  }
  const prompt = themeStore.resolveThemePrompt(themeId, req.userId!);
  const builtin = themeStore.getBuiltinTheme(themeId);
  sendSuccess(res, {
    themeId,
    themeName: builtin?.name || 'Custom Theme',
    themePrompt: prompt,
  });
}));

// Set project theme
app.post('/api/themes/project/:projectId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { themeId } = req.body;
  if (!themeId) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'themeId is required'));
  }
  themeStore.setProjectTheme(req.params.projectId, themeId);
  sendSuccess(res, { set: true });
}));

// Remove project theme
app.delete('/api/themes/project/:projectId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  themeStore.removeProjectTheme(req.params.projectId);
  sendSuccess(res, { removed: true });
}));

// Generate theme via AI
app.post('/api/themes/generate', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { images, keywords, generationMode, model, apiKey, provider } = req.body;

  if (!images || !Array.isArray(images) || images.length === 0) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'At least one image is required'));
  }
  if (images.length > 5) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Maximum 5 images allowed'));
  }
  if (!model || !apiKey || !provider) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'model, apiKey, and provider are required'));
  }
  if (!['inspired', 'high-fidelity'].includes(generationMode)) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'generationMode must be "inspired" or "high-fidelity"'));
  }
  if (!['anthropic', 'openai', 'google', 'openrouter'].includes(provider)) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'provider must be anthropic, openai, google, or openrouter'));
  }

  const prompt = await generateThemePrompt({
    images,
    keywords: keywords || '',
    generationMode,
    model,
    apiKey,
    provider: provider as ThemeProvider,
  });

  sendSuccess(res, { prompt });
}));

startupInfo('routes.theme', 'registered');

// ==================== END SPRINT 12 ====================

// ==================== SPRINT 13: Prompt Library + Vercel Integration ====================

// ── Prompt Library Routes ─────────────────────────────────────────

// List user's prompts
app.get('/api/prompts', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const prompts = promptStore.listPrompts(req.userId!);
  sendSuccess(res, { prompts });
}));

// Create prompt
app.post('/api/prompts', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { title, description, content } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Title is required'));
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Content is required'));
  }
  const prompt = promptStore.createPrompt(req.userId!, title, description || '', content);
  sendSuccess(res, { prompt });
}));

// Update prompt
app.put('/api/prompts/:promptId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { promptId } = req.params;
  const existing = promptStore.getPrompt(promptId);
  if (!existing) {
    return sendError(res, createError(ErrorCode.NOT_FOUND, 'Prompt not found'));
  }
  if (existing.createdBy !== req.userId) {
    return sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Not your prompt'));
  }
  const updates: Partial<{ title: string; description: string; content: string }> = {};
  if (req.body.title !== undefined) updates.title = req.body.title;
  if (req.body.description !== undefined) updates.description = req.body.description;
  if (req.body.content !== undefined) updates.content = req.body.content;

  const updated = promptStore.updatePrompt(promptId, updates);
  sendSuccess(res, { prompt: updated });
}));

// Delete prompt
app.delete('/api/prompts/:promptId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { promptId } = req.params;
  const existing = promptStore.getPrompt(promptId);
  if (!existing) {
    return sendError(res, createError(ErrorCode.NOT_FOUND, 'Prompt not found'));
  }
  if (existing.createdBy !== req.userId) {
    return sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Not your prompt'));
  }
  promptStore.deletePrompt(promptId);
  sendSuccess(res, { deleted: true });
}));

// Replace prompt references in text (utility endpoint for chat pipeline)
app.post('/api/prompts/resolve', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Text is required'));
  }
  const resolved = promptStore.replacePromptReferences(text);
  sendSuccess(res, { resolved });
}));

startupInfo('routes.prompt-library', 'registered');

// ── Vercel Integration Routes ─────────────────────────────────────

// Connect (save token)
app.post('/api/integrations/vercel/connect', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Vercel access token is required'));
  }

  const validation = await vercelStore.validateVercelToken(token);
  if (!validation.valid) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Invalid Vercel access token'));
  }

  vercelStore.setVercelToken(req.userId!, token);
  const teams = await vercelStore.listVercelTeams(token);

  sendSuccess(res, { username: validation.username, teams });
}));

// Disconnect
app.delete('/api/integrations/vercel/disconnect', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  vercelStore.removeVercelToken(req.userId!);
  sendSuccess(res, { disconnected: true });
}));

// Check if connected
app.get('/api/integrations/vercel/status', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const token = vercelStore.getVercelToken(req.userId!);
  if (!token) {
    return sendSuccess(res, { connected: false });
  }
  const validation = await vercelStore.validateVercelToken(token);
  if (!validation.valid) {
    vercelStore.removeVercelToken(req.userId!);
    return sendSuccess(res, { connected: false });
  }
  const teams = await vercelStore.listVercelTeams(token);
  sendSuccess(res, { connected: true, username: validation.username, teams });
}));

// List Vercel projects
app.get('/api/integrations/vercel/projects', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const token = vercelStore.getVercelToken(req.userId!);
  if (!token) return sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Vercel not connected'));

  const teamId = (req.query.teamId as string) || null;
  const projects = await vercelStore.listVercelProjects(token, teamId);
  sendSuccess(res, { projects });
}));

// Check project name availability
app.get('/api/integrations/vercel/available', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const token = vercelStore.getVercelToken(req.userId!);
  if (!token) return sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Vercel not connected'));

  const name = req.query.name as string;
  if (!name) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Project name required'));

  const teamId = (req.query.teamId as string) || null;
  const available = await vercelStore.isProjectNameAvailable(token, name, teamId);
  sendSuccess(res, { available });
}));

// Create new Vercel project
app.post('/api/integrations/vercel/projects', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const token = vercelStore.getVercelToken(req.userId!);
  if (!token) return sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Vercel not connected'));

  const { name, framework, teamId } = req.body;
  if (!name || typeof name !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Project name required'));
  }

  const project = await vercelStore.createVercelProject(token, name, framework, teamId || null);
  sendSuccess(res, { project });
}));

// Link Vercel project to Recoder project
app.post('/api/integrations/vercel/:projectId/link', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { vercelProjectId, vercelProjectName, vercelTeamId } = req.body;
  if (!vercelProjectId || !vercelProjectName) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'vercelProjectId and vercelProjectName required'));
  }

  vercelStore.setVercelProjectLink(projectId, {
    vercelProjectId,
    vercelProjectName,
    vercelTeamId: vercelTeamId || null,
    vercelDeploymentUrl: null,
  });

  sendSuccess(res, { linked: true });
}));

// Unlink Vercel project
app.delete('/api/integrations/vercel/:projectId/unlink', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  vercelStore.removeVercelProjectLink(req.params.projectId);
  sendSuccess(res, { unlinked: true });
}));

// Get linked Vercel project info
app.get('/api/integrations/vercel/:projectId/link', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const link = vercelStore.getVercelProjectLink(req.params.projectId);
  sendSuccess(res, { link });
}));

// Get deployments for linked project
app.get('/api/integrations/vercel/:projectId/deployments', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const token = vercelStore.getVercelToken(req.userId!);
  if (!token) return sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Vercel not connected'));

  const link = vercelStore.getVercelProjectLink(req.params.projectId);
  if (!link) return sendError(res, createError(ErrorCode.NOT_FOUND, 'No Vercel project linked'));

  const deployments = await vercelStore.getVercelDeployments(token, link.vercelProjectId, link.vercelTeamId);

  // Update deployment URL if we have a newer READY production deployment
  const readyProd = deployments.find(d => d.readyState === 'READY' && d.target === 'production');
  if (readyProd && readyProd.url !== link.vercelDeploymentUrl) {
    vercelStore.setVercelProjectLink(req.params.projectId, {
      ...link,
      vercelDeploymentUrl: readyProd.url,
    });
  }

  sendSuccess(res, { deployments, deploymentUrl: readyProd?.url || link.vercelDeploymentUrl });
}));

// Deploy to Vercel (upload files from container)
app.post('/api/integrations/vercel/:projectId/deploy', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const token = vercelStore.getVercelToken(req.userId!);
  if (!token) return sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Vercel not connected'));

  const link = vercelStore.getVercelProjectLink(req.params.projectId);
  if (!link) return sendError(res, createError(ErrorCode.NOT_FOUND, 'No Vercel project linked'));

  const { projectId } = req.params;
  const container = containers.get(projectId);
  if (!container) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));

  // Read the build output from container
  // First try to detect the build output directory
  const target = req.body.target || 'production';

  // Collect files from the container's output directory
  // Use the container exec to list and read files
  const buildDir = req.body.buildDir || 'dist';

  // Exec tar in the container to get all files
  const exec = await docker.getContainer(container.id).exec({
    Cmd: ['tar', '-cf', '-', '-C', `/app/${buildDir}`, '.'],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true, stdin: false });

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });

  // For Vercel, we deploy using their Files API
  // Get file list from container
  const listExec = await docker.getContainer(container.id).exec({
    Cmd: ['find', `/app/${buildDir}`, '-type', 'f', '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*'],
    AttachStdout: true,
    AttachStderr: true,
  });
  const listStream = await listExec.start({ hijack: true, stdin: false });

  let fileListStr = '';
  await new Promise<void>((resolve, reject) => {
    listStream.on('data', (chunk: Buffer) => { fileListStr += chunk.toString(); });
    listStream.on('end', resolve);
    listStream.on('error', reject);
  });

  const filePaths = fileListStr.trim().split('\n').filter(Boolean);
  const files: Array<{ file: string; data: string }> = [];

  for (const fp of filePaths.slice(0, 5000)) { // Max 5000 files
    const relativePath = fp.replace(`/app/${buildDir}/`, '');
    if (!relativePath || relativePath.startsWith('.')) continue;
    try {
      const readExec = await docker.getContainer(container.id).exec({
        Cmd: ['base64', '-w', '0', fp],
        AttachStdout: true,
        AttachStderr: true,
      });
      const readStream = await readExec.start({ hijack: true, stdin: false });
      let content = '';
      await new Promise<void>((resolve, reject) => {
        readStream.on('data', (chunk: Buffer) => { content += chunk.toString(); });
        readStream.on('end', resolve);
        readStream.on('error', reject);
      });
      // Strip docker stream header bytes
      const cleanContent = content.replace(/^[\x00-\x1f]/g, '').trim();
      if (cleanContent) {
        files.push({ file: relativePath, data: cleanContent });
      }
    } catch {
      // Skip files we can't read
    }
  }

  if (files.length === 0) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, `No files found in ${buildDir}. Run a build first.`));
  }

  // Deploy via Vercel v13 API
  const teamParam = link.vercelTeamId ? `?teamId=${link.vercelTeamId}` : '';
  const deployRes = await fetch(`https://api.vercel.com/v13/deployments${teamParam}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: link.vercelProjectName,
      project: link.vercelProjectId,
      target,
      files: files.map(f => ({
        file: f.file,
        data: f.data,
        encoding: 'base64',
      })),
    }),
  });

  if (!deployRes.ok) {
    const text = await deployRes.text().catch(() => '');
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Vercel deploy failed: ${text || deployRes.statusText}`));
  }

  const deployResult = await deployRes.json() as { id: string; url: string; readyState: string };

  // Update deployment URL
  vercelStore.setVercelProjectLink(req.params.projectId, {
    ...link,
    vercelDeploymentUrl: deployResult.url,
  });

  sendSuccess(res, {
    deploymentId: deployResult.id,
    url: deployResult.url,
    readyState: deployResult.readyState,
  });
}));

// Detect framework from container files
app.get('/api/integrations/vercel/:projectId/detect-framework', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const container = containers.get(projectId);
  if (!container) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));

  const exec = await docker.getContainer(container.id).exec({
    Cmd: ['ls', '/app'],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true, stdin: false });

  let output = '';
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    stream.on('end', resolve);
    stream.on('error', reject);
  });

  const fileList = output.trim().split('\n').filter(Boolean);
  const framework = vercelStore.detectFramework(fileList);

  sendSuccess(res, { framework, files: fileList });
}));

startupInfo('routes.vercel', 'registered');
startupInfo('routes.prompt-library-vercel', 'registered');

// ==================== END SPRINT 13 ====================

// ==================== SPRINT 14: Proposals + GitHub Collaborators ====================

// ── GitHub Collaborators ────────────────────────────────────────────
// Uses GitHub REST API to manage repository collaborators.
// Token is sent from the frontend (same token used for push/pull).

/**
 * Parse a GitHub remote URL into owner/repo.
 * Supports: https://github.com/owner/repo.git, git@github.com:owner/repo.git
 */
function parseGitHubRemoteUrl(url: string): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };
  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/github\.com:([^/]+)\/([^/.]+)/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };
  return null;
}

/**
 * Helper: Call GitHub API with token auth
 */
async function githubApi(
  method: string,
  path: string,
  token: string,
  body?: object
): Promise<{ status: number; data: any }> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

// Get GitHub repo info from a project's remote URL
app.get('/api/git/:projectId/github-repo', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const entry = containers.get(projectId);
    if (!entry) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));

    const remotes = await gitOperations.getRemotes(entry.id);
    const origin = remotes.find((r: any) => r.name === 'origin');
    if (!origin) return sendSuccess(res, { github: null, message: 'No origin remote' });

    const parsed = parseGitHubRemoteUrl(origin.url);
    if (!parsed) return sendSuccess(res, { github: null, message: 'Origin is not a GitHub URL' });

    sendSuccess(res, { github: parsed });
  } catch (err: any) {
    sendError(res, createError(ErrorCode.INTERNAL_ERROR, err.message));
  }
});

// List collaborators for a GitHub repo
app.get('/api/git/:projectId/collaborators', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const token = req.query.token as string;
    if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'GitHub token required'));

    const entry = containers.get(projectId);
    if (!entry) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));

    const remotes = await gitOperations.getRemotes(entry.id);
    const origin = remotes.find((r: any) => r.name === 'origin');
    if (!origin) return sendError(res, createError(ErrorCode.NOT_FOUND, 'No origin remote'));

    const parsed = parseGitHubRemoteUrl(origin.url);
    if (!parsed) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Origin is not a GitHub URL'));

    const { status, data } = await githubApi('GET', `/repos/${parsed.owner}/${parsed.repo}/collaborators`, token);
    if (status !== 200) {
      return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, data?.message || 'GitHub API error'));
    }

    const collaborators = (data || []).map((c: any) => ({
      id: c.id,
      login: c.login,
      avatarUrl: c.avatar_url,
      role: c.role_name || (c.permissions?.admin ? 'admin' : c.permissions?.push ? 'write' : 'read'),
      permissions: c.permissions,
    }));

    sendSuccess(res, { collaborators, repo: parsed });
  } catch (err: any) {
    sendError(res, createError(ErrorCode.INTERNAL_ERROR, err.message));
  }
});

// Invite a collaborator
app.post('/api/git/:projectId/collaborators', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { token, username, permission } = req.body;
    if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'GitHub token required'));
    if (!username) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Username required'));

    const entry = containers.get(projectId);
    if (!entry) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));

    const remotes = await gitOperations.getRemotes(entry.id);
    const origin = remotes.find((r: any) => r.name === 'origin');
    if (!origin) return sendError(res, createError(ErrorCode.NOT_FOUND, 'No origin remote'));

    const parsed = parseGitHubRemoteUrl(origin.url);
    if (!parsed) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Origin is not a GitHub URL'));

    // Validate permission level
    const validPerms = ['pull', 'push', 'admin', 'maintain', 'triage'];
    const perm = validPerms.includes(permission) ? permission : 'push';

    const { status, data } = await githubApi(
      'PUT',
      `/repos/${parsed.owner}/${parsed.repo}/collaborators/${encodeURIComponent(username)}`,
      token,
      { permission: perm }
    );

    if (status === 201) {
      sendSuccess(res, { invited: true, invitation: data });
    } else if (status === 204) {
      sendSuccess(res, { invited: true, alreadyCollaborator: true });
    } else {
      sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, data?.message || 'Failed to invite collaborator'));
    }
  } catch (err: any) {
    sendError(res, createError(ErrorCode.INTERNAL_ERROR, err.message));
  }
});

// Remove a collaborator
app.delete('/api/git/:projectId/collaborators/:username', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const username = req.params.username;
    const token = req.query.token as string;
    if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'GitHub token required'));

    const entry = containers.get(projectId);
    if (!entry) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));

    const remotes = await gitOperations.getRemotes(entry.id);
    const origin = remotes.find((r: any) => r.name === 'origin');
    if (!origin) return sendError(res, createError(ErrorCode.NOT_FOUND, 'No origin remote'));

    const parsed = parseGitHubRemoteUrl(origin.url);
    if (!parsed) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Origin is not a GitHub URL'));

    const { status, data } = await githubApi(
      'DELETE',
      `/repos/${parsed.owner}/${parsed.repo}/collaborators/${encodeURIComponent(username)}`,
      token
    );

    if (status === 204) {
      sendSuccess(res, { removed: true });
    } else {
      sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, data?.message || 'Failed to remove collaborator'));
    }
  } catch (err: any) {
    sendError(res, createError(ErrorCode.INTERNAL_ERROR, err.message));
  }
});

// List pending invitations
app.get('/api/git/:projectId/invitations', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const token = req.query.token as string;
    if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'GitHub token required'));

    const entry = containers.get(projectId);
    if (!entry) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));

    const remotes = await gitOperations.getRemotes(entry.id);
    const origin = remotes.find((r: any) => r.name === 'origin');
    if (!origin) return sendError(res, createError(ErrorCode.NOT_FOUND, 'No origin remote'));

    const parsed = parseGitHubRemoteUrl(origin.url);
    if (!parsed) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Origin is not a GitHub URL'));

    const { status, data } = await githubApi('GET', `/repos/${parsed.owner}/${parsed.repo}/invitations`, token);
    if (status !== 200) {
      return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, data?.message || 'GitHub API error'));
    }

    const invitations = (data || []).map((inv: any) => ({
      id: inv.id,
      login: inv.invitee?.login,
      avatarUrl: inv.invitee?.avatar_url,
      permission: inv.permissions,
      createdAt: inv.created_at,
    }));

    sendSuccess(res, { invitations, repo: parsed });
  } catch (err: any) {
    sendError(res, createError(ErrorCode.INTERNAL_ERROR, err.message));
  }
});

// Cancel a pending invitation
app.delete('/api/git/:projectId/invitations/:invitationId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const invitationId = req.params.invitationId;
    const token = req.query.token as string;
    if (!token) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'GitHub token required'));

    const entry = containers.get(projectId);
    if (!entry) return sendError(res, createError(ErrorCode.NOT_FOUND, 'Container not found'));

    const remotes = await gitOperations.getRemotes(entry.id);
    const origin = remotes.find((r: any) => r.name === 'origin');
    if (!origin) return sendError(res, createError(ErrorCode.NOT_FOUND, 'No origin remote'));

    const parsed = parseGitHubRemoteUrl(origin.url);
    if (!parsed) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Origin is not a GitHub URL'));

    const { status, data } = await githubApi(
      'DELETE',
      `/repos/${parsed.owner}/${parsed.repo}/invitations/${encodeURIComponent(invitationId)}`,
      token
    );

    if (status === 204) {
      sendSuccess(res, { cancelled: true });
    } else {
      sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, data?.message || 'Failed to cancel invitation'));
    }
  } catch (err: any) {
    sendError(res, createError(ErrorCode.INTERNAL_ERROR, err.message));
  }
});

startupInfo('routes.github-collaborators', 'registered');

// ==================== END SPRINT 14 ====================

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Validate environment variables before starting
validateEnvironment();

// ── Detect external IP for Expo hostname ────────────────────────────
(function initExpoHostname() {
  if (process.env.PUBLIC_HOSTNAME) {
    setExpoPublicHostname(process.env.PUBLIC_HOSTNAME);
    return;
  }
  try {
    const os = require('os');
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          setExpoPublicHostname(net.address);
          return;
        }
      }
    }
  } catch {
    // Fallback already set to 'localhost' in dev-server.ts
  }
})();

server.listen(PORT, async () => {
  startupInfo('server', 'docker backend running', {
    port: PORT,
    image: IMAGE_NAME,
    previewUrlPattern: `http://localhost:${PORT}/preview/{projectId}`,
    collaborationUrlPattern: `ws://localhost:${PORT}/collab?projectId=XXX&file=YYY`,
    lspStartEndpoint: '/api/lsp/:projectId/start',
  });

  // Run startup sequence AFTER server is listening
  // This ensures cleanup happens first, then pool is initialized
  await startupSequence();
});
