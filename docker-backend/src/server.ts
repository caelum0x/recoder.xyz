import dotenv from 'dotenv';
dotenv.config();

import { createLogger } from './logger.js';
const logger = createLogger('server');

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
import { ALLOWED_ORIGINS, CORS_ALLOWED_HEADERS, CORS_ALLOWED_METHODS, getCorsHeadersForOrigin } from './cors-utils.js';
import { fastWriteFile, fastWriteFiles } from './fast-file-writer.js';
import * as pty from 'node-pty';
import { WebSocketRPC } from './websocket-rpc.js';
import { devServerManager, detectFrameworkFromContainer, getInstallCommand, getDevCommand, getExpectedPorts, setExpoPublicHostname } from './dev-server.js';
import { ContainerLifecycleManager } from './container-lifecycle.js';
import { snapshotManager, registerDaytonaId, unregisterDaytonaId } from './snapshot-manager.js';
import { contextCache, computeFileHash, computeFileHashes, type ContextDiff } from './context-cache.js';
import { autoRestoreManager, parseAllErrors, hasBlockingErrors } from './auto-restore.js';
import { searchService } from './search.js';
import { fileWatcher } from './file-watcher.js';
import { sessionStore } from './session-store.js';
import { containerPool } from './container-pool.js';
// mcpManager / PREINSTALLED_SERVERS / NPX_SERVERS are now consumed inside
// ./routes/mcp.routes.ts after the MCP route extraction.
import { packageManagerService } from './package-manager.js';
import { secretsManager } from './secrets-manager.js';
import { gitOperations } from './git-operations.js';
import { getWsRateLimiter, getAllWsRateLimitStats } from './security/ws-rate-limiter.js';
import {
  abusePrevention,
  alertFromAbuseEvent,
  getAlerts,
  acknowledgeAlert,
  getAlertCounts,
} from './security/index.js';
import {
  validateBranchName,
  validateCommitMessage,
  validateCommitHash,
} from './public-api/validation.js';
import { syncManager, diffFileSets, getDetailedDiff, getDiffStats, generateUnifiedDiff } from './cli-sync/index.js';
import { lspServerManager } from './lsp/index.js';
import { createCollaborationServer, getCollaborationStats, saveAllDocuments } from './collaboration/index.js';
import { replManager, REPL_CONFIGS, type ReplLanguage } from './repl-manager.js';
import { metricsCollector, metricsMiddleware } from './metrics.js';
import { sandboxRouter, initSandboxRoutes, type SandboxDependencies } from './public-api/routes/sandboxes.js';
import { projectRouter, initProjectRoutes, type ProjectDependencies } from './public-api/routes/projects.js';
import { getPromptTaskQueueDiagnostics } from './public-api/prompt-task-queue.js';
import { getByokReadiness } from './public-api/byok-readiness.js';
import openclawKeysRouter from './public-api/routes/openclaw-keys.js';
import { identityRouter } from './public-api/routes/identity.js';
import { moltbookAuthRouter } from './public-api/routes/auth-moltbook.js';
import { appKeysRouter } from './public-api/routes/app-keys.js';
import { domainRouter } from './public-api/routes/domains.js';
import { a2aRouter, getDockerBackendAgentCard } from './a2a-gateway.js';
import { createAgentMcpRouter, createAgentOsGitHubWebhookRouter, createAgentOsRouter, createInternalAgentOsRouter } from './agent-os/index.js';
import { createConductorRouter } from './conductor/conductor.routes.js';
import {
  getDistributionModule,
  createCliAuthRouter,
  createBillingRouter,
  createBillingWebhookRouter,
} from './distribution/index.js';
import { createNetworkRouter, createNetworkInternalRouter } from './network/network.routes.js';
import { createConnectorsRouter, startConnectors } from './connectors/index.js';
import { createConnectorsWebhookRouter } from './connectors/webhook-ingress.js';
import { reconcile as reconcileConductor } from './conductor/workspace-service.js';
import { startAgentOsOutboxDrainLoop } from './agent-os/outbox-drain-loop.js';
import { agentOsContainer } from './agent-os/service-container';
import { openclawAdapterRouter } from './a2a-openclaw-adapter.js';
import { taskLifecycleRouter, collaborationRouter, heartbeatRouter, getHeartbeatTracker, sseStreamRouter, wireA2AEventBridge, connectorHealthRouter, claudeConnectorRouter, codexConnectorRouter, opencodeConnectorRouter, cursorConnectorRouter, windsurfConnectorRouter, replitConnectorRouter, contextBridgeRouter, a2aOpenApiRouter, a2aSloMetricsRouter, getA2ASloMetrics, restAdapterRouter, gitAdapterRouter, orchestrationRouter, workflowMessagingRouter, adminRouter, agentRegistryRouter, getIntegrationWiringService, disposeTaskLifecycleService } from './a2a/index.js';
import { workspaceRouter as a2aWorkspaceRouter } from './a2a/workspace.routes.js';
import { memoryRouter } from './a2a/memory.routes.js';
import { codeSearchRouter } from './a2a/code-search.routes.js';
import { searchRouter } from './a2a/search.routes.js';
import { webhookRouter } from './a2a/webhook.routes.js';
import { scratchpadRouter } from './a2a/scratchpad.routes.js';
import { workflowTriggerRouter } from './a2a/workflow-trigger.routes.js';
import { duckdbRouter } from './a2a/duckdb.routes.js';
import { createCanvasRouter } from './a2a/canvas.routes.js';
import { indexFile as codeSearchIndexFile } from './a2a/code-search.js';
import { indexFile as meiliIndexFile } from './a2a/search-proxy.js';
import { trackLlmCall, trackSandboxExec, trackFileOp, trackPublish } from './metering/openmeter-client.js';
import {
  createPreviewShare,
  destroyPreviewShare,
  ensurePublishedShare,
  destroyPublishedShare,
  restorePublishedShares,
  updateShareTarget,
  getPublishedShareUrl,
} from './zrok-preview.js';
import { getDaytonaPreviewAccess } from './daytona-preview.js';
import { DAYTONA_WORKSPACE_ROOT } from './daytona-runtime.js';
import { patternRouter } from './a2a/patterns/index.js';
import { approvalRouter } from './policy/index.js';
import { startA2AIntentWorker } from './a2a-intent-worker.js';
import { startAgentWorkers } from './a2a-agent-workers.js';
import { wireAutonomousRouting } from './a2a/autonomous-routing.service.js';
import type { RedisBackedPersistenceAdapter } from '@recoder/shared/a2a';
import {
  fetchUserByokProviderKeys,
  buildInternalServiceHeaders,
  type AIProviderKeys,
} from './public-api/byok-provider-keys.js';
import { startSslRenewalScheduler } from './domain-manager.js';
import { getRuntimeProfile } from './runtime-profile.js';
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
// api-key store helpers (createApiKey/listUserApiKeys/deleteApiKey/revokeApiKey/getUsage)
// are now consumed inside ./routes/api-keys.routes.ts after the route extraction.
import { healthMonitor, type HealthStatus } from './health-monitor.js';
import { resourceOptimizer } from './resource-optimizer.js';
import { getDaytonaClient, isDaytonaConfigured } from './daytona-client.js';
import {
  type ContainerEntry,
  isDaytonaSandbox,
  buildDaytonaDevServerSessionId,
  daytonaWriteFile,
  daytonaWriteFiles,
  daytonaReadFile,
  daytonaDeleteFile,
  daytonaRenameFile,
  daytonaCreateFolder,
  daytonaListFiles,
  daytonaExec,
  daytonaExecBackground,
  daytonaGetWorkspaceState,
  ensureDaytonaSandboxRunning,
  daytonaDeleteSandbox,
  daytonaGetLogs,
} from './daytona-file-ops.js';
import { recoverContainerFromDocker } from './container-recovery.js';
import { templateManager } from './templates/index.js';
import {
  buildOpencodeSandboxCommand,
  parseOpencodeSandboxOutput,
  type OpencodeSandboxProviderKeys,
} from './opencode-sandbox.js';
import {
  getAnonymousIdFromRequest,
  getProjectIdFromRequest,
  isLikelySandboxProjectId,
  isStrictAuthMode,
  resolveA2ASystemSession,
  resolveInternalServiceSession,
} from './auth-utils.js';
import { validateApiKey as validatePlatformApiKey } from './public-api/api-keys.js';
import { type ContainerCreationEntry, withCreationTimeout, isCreationStale } from './container-creation.js';
import { bootstrapDaytonaPreview } from './preview';
// Deployment modules are lazily imported to avoid requiring node-fetch/form-data at startup
const getVercelDeploy = () => import('./deployment/vercel.js');
const getNetlifyDeploy = () => import('./deployment/netlify.js');
const getCloudflareDeploy = () => import('./deployment/cloudflare.js');
import type { ProviderCredentials, DeploymentConfig } from './deployment/types.js';
import {
  authenticateApiKey,
  rateLimitMiddleware,
  requireScope,
  requestLoggingMiddleware,
  asyncApiHandler,
  type AuthenticatedApiRequest,
} from './public-api/middleware.js';
import {
  initPortManager,
  releasePort as releasePortFromManager,
  getContainerPort,
  getContainerByPort,
  allocatePortBlockWithVerification,
  syncWithDocker as syncPortsWithDocker,
  getPortStats,
  createPortLabels,
  isPortAvailable,
  markPortBlockUnavailable,
  BASE_PORT,
  MAX_PORT,
  PORTS_PER_CONTAINER,
} from './port-manager.js';
import {
  // Organization
  OrganizationRole,
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
  type MobileApiDependencies,
} from './mobile/index.js';
import {
  ErrorCode,
  createError,
  globalErrorHandler,
  asyncHandler,
  sendError,
  sendSuccess,
  requestIdMiddleware,
  requestTimingMiddleware,
  logError,
  logWarning,
} from './errors/index.js';
import {
  INTERNAL_WORKFLOW_CONTRACT,
  PUBLIC_WORKFLOW_HEALTH_CONTRACT,
  PUBLIC_WORKFLOW_CONTRACT,
  buildSubagentWorkflowHealthSummary,
  buildInternalWorkflowResponse,
  buildPublicWorkflowResponseData,
  buildSubagentWorkflowPlan,
  isKnownSubagentLaneId,
  parseSubagentLaneStatusUpdate,
  type SubagentLaneStatusEntry,
  parseSubagentWorkflowRequest,
  validateSubagentWorkflowRequestContract,
} from './subagent-workflow.js';

// dotenv.config() is called at the top of this file before other imports

// ==================== Environment Validation ====================

function validateEnvironment() {
  const warnings: string[] = [];

  if (!process.env.API_KEY_HASH_SALT) {
    if (process.env.NODE_ENV === 'production') {
      logger.fatal('API_KEY_HASH_SALT is required in production');
      process.exit(1);
    } else {
      process.env.API_KEY_HASH_SALT = 'dev-salt-' + Math.random().toString(36).slice(2);
      warnings.push('API_KEY_HASH_SALT not set - using random dev salt');
    }
  }

  if (!process.env.INTERNAL_SERVICE_KEY) {
    if (process.env.NODE_ENV === 'production') {
      logger.fatal('INTERNAL_SERVICE_KEY is required in production');
      process.exit(1);
    } else {
      process.env.INTERNAL_SERVICE_KEY = 'dev-internal-key';
      warnings.push('INTERNAL_SERVICE_KEY not set - using dev default');
    }
  } else if (process.env.NODE_ENV === 'production') {
    const key = process.env.INTERNAL_SERVICE_KEY;
    if (key === 'dev-internal-key') {
      logger.fatal('INTERNAL_SERVICE_KEY cannot use dev default in production');
      process.exit(1);
    }
    if (key.length < 32) {
      logger.fatal('INTERNAL_SERVICE_KEY must be at least 32 characters in production');
      process.exit(1);
    }
    if (/^(changeme|placeholder|xxx|secret|password|test)/i.test(key)) {
      logger.fatal('INTERNAL_SERVICE_KEY appears to be a placeholder value');
      process.exit(1);
    }
  }

  if (!process.env.POLAR_WEBHOOK_SECRET) {
    warnings.push('POLAR_WEBHOOK_SECRET not set - Polar.sh webhooks disabled');
  }

  if (!process.env.IDENTITY_TOKEN_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      logger.fatal('IDENTITY_TOKEN_SECRET is required in production');
      process.exit(1);
    } else {
      process.env.IDENTITY_TOKEN_SECRET = 'dev-identity-secret-' + Math.random().toString(36).slice(2);
      warnings.push('IDENTITY_TOKEN_SECRET not set - using random dev secret');
    }
  }

  if (warnings.length > 0) {
    logger.warn({ warnings }, 'Environment warnings');
  }

  const runtimeProfile = getRuntimeProfile();
  logger.info(
    {
      mode: runtimeProfile.mode,
      multiTenant: runtimeProfile.multiTenant,
      distributedState: runtimeProfile.distributedState,
      quotaBackend: runtimeProfile.quotaBackend,
    },
    'Resolved RuntimeProfile at boot',
  );
}

function startupInfo(component: string, message: string, details?: Record<string, unknown>): void {
  logger.info({ type: 'STARTUP', component, ...details }, message);
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
    const bearerToken = authHeader.slice('Bearer '.length).trim();
    if (bearerToken) {
      return bearerToken;
    }
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
    || cookies['better-auth.session_token']          // Default Better Auth prefix
    || cookies['__Secure-better-auth.session_token'] // Default Better Auth prefix (Secure)
    || cookies['__Secure-session_token']             // Production without prefix
    || cookies['recoder_session_token']              // Alternative format
    || cookies['session_token']                      // Fallback
    || null;
}

function getAnonymousFallbackIdentity(req: express.Request): { userId: string; sessionId: string } {
  const anonymousId = getAnonymousIdFromRequest(req);
  return {
    userId: anonymousId ?? 'anonymous',
    sessionId: anonymousId ?? 'anon',
  };
}

// WebSocket authentication helper
// For WebSockets, token is passed via query string (?token=xxx) or cookies
interface WebSocketAuthOptions {
  allowAnonymous?: boolean;
}

async function authenticateWebSocket(
  ws: WebSocket,
  req: express.Request,
  options: WebSocketAuthOptions = {},
): Promise<{ userId: string; sessionId: string } | null> {
  const allowAnonymous = options.allowAnonymous ?? !STRICT_AUTH;

  // Try query string first (standard for WebSockets)
  let token = req.query.token as string;

  // Fall back to Authorization header (used by recoder-a2a MCP clients)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  // Fall back to cookies
  if (!token) {
    const cookies = parseCookies(req.headers.cookie);
    // In production with useSecureCookies=true, cookies are prefixed with "__Secure-"
    token = cookies['__Secure-recoder.session_token']  // Production with Secure cookies
      || cookies['recoder.session_token']              // Development
      || cookies['better-auth.session_token']          // Default Better Auth prefix
      || cookies['__Secure-better-auth.session_token'] // Default Better Auth prefix (Secure)
      || cookies['__Secure-session_token']             // Production without prefix
      || cookies['recoder_session_token']              // Alternative format
      || cookies['session_token']                      // Fallback
      || '';
  }

  if (!token) {
    // In migration mode, allow anonymous access with warning
    if (allowAnonymous && !STRICT_AUTH) {
      const anonymousIdentity = getAnonymousFallbackIdentity(req);
      logWarning(ErrorCode.AUTH_REQUIRED, 'Anonymous WebSocket connection in migration mode', {
        path: req.path,
      });
      return anonymousIdentity;
    }
    logWarning(ErrorCode.AUTH_REQUIRED, 'Rejected WebSocket connection without auth token', {
      path: req.path,
    });
    ws.close(1008, 'Authentication required');
    return null;
  }

  const a2aSession = resolveA2ASystemSession(token, req.query as Record<string, unknown>);
  if (a2aSession) {
    return a2aSession;
  }

  // Check negative cache first to avoid spamming the auth service + logs
  // with repeated bad-token retries from stuck CLI reconnect loops.
  const now = Date.now();
  const negEntry = authNegativeCache.get(token);
  if (negEntry && negEntry.expiresAt > now) {
    negEntry.attempts++;
    // Only log once per NEG_AUTH_LOG_INTERVAL per token
    if (now - negEntry.lastLoggedAt > NEG_AUTH_LOG_INTERVAL) {
      logWarning(ErrorCode.AUTH_INVALID_TOKEN, 'Rejected WebSocket connection with invalid token (cached, suppressing spam)', {
        path: req.path,
        attempts: negEntry.attempts,
      });
      negEntry.lastLoggedAt = now;
    }
    ws.close(1008, 'Invalid or expired session');
    return null;
  }

  const session = await verifySessionToken(token);
  if (!session) {
    // Cache the negative result to suppress repeat attempts
    authNegativeCache.set(token, {
      expiresAt: now + NEG_AUTH_TTL,
      attempts: 1,
      lastLoggedAt: now,
    });

    // In migration mode, allow with warning
    if (allowAnonymous && !STRICT_AUTH) {
      const anonymousIdentity = getAnonymousFallbackIdentity(req);
      logWarning(ErrorCode.AUTH_INVALID_TOKEN, 'Invalid WebSocket token accepted in migration mode', {
        path: req.path,
      });
      return anonymousIdentity;
    }
    logWarning(ErrorCode.AUTH_INVALID_TOKEN, 'Rejected WebSocket connection with invalid token', {
      path: req.path,
    });
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

// Negative auth cache - remember bad tokens to avoid log spam and wasted lookups
// when a stale CLI session keeps retrying with an expired token.
const authNegativeCache = new Map<string, { expiresAt: number; attempts: number; lastLoggedAt: number }>();
const NEG_AUTH_TTL = 60_000; // 60 seconds
const NEG_AUTH_LOG_INTERVAL = 300_000; // only log once every 5 min per token

// Periodic sweep to keep authNegativeCache bounded
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of authNegativeCache) {
    if (entry.expiresAt <= now) authNegativeCache.delete(token);
  }
}, 5 * 60_000).unref();

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
    // Use AbortController for fetch timeout (10 seconds — generous for localhost)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

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
        details: {},
      });
    }
    return null;
  }
}

// Check if user owns the project
async function checkProjectOwnership(userId: string, projectId: string): Promise<boolean> {
  if (!userId || !projectId) {
    return false;
  }

  // Check cache first
  const cacheKey = `${userId}:${projectId}`;
  const cached = ownershipCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isOwner;
  }

  // Fast-path: check local containers map (survives restarts via containers.json)
  // and fall back to live recovery before the remote ownership API. This prevents
  // auth failures when the route-level ownership check runs before the handler has
  // a chance to recover the sandbox mapping.
  const localEntry = containers.get(projectId) ?? await getOrRecoverContainer(projectId);
  if (localEntry?.userId) {
    const isOwner = localEntry.userId === userId
      || (localEntry.userId === 'anonymous' && userId.startsWith('anon_'));
    ownershipCache.set(cacheKey, { isOwner, expiresAt: Date.now() + OWNERSHIP_CACHE_TTL });
    return isOwner;
  }

  // Fallback: remote ownership check (requires INTERNAL_SERVICE_KEY)
  if (!INTERNAL_SERVICE_KEY) {
    return false;
  }

  try {
    // Use AbortController for fetch timeout (10 seconds — generous for localhost)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

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
        details: {},
      });
    }
    return false;
  }
}

// Authentication middleware - verifies user token
// In strict mode (default in production): always requires token
const STRICT_AUTH = isStrictAuthMode();
const ALLOW_LOCALHOST_ORIGIN = process.env.NODE_ENV !== 'production';

function isLocalhostOrigin(origin: string): boolean {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Optional auth middleware - attempts authentication but allows anonymous access.
 * Used for routes that should work for both authenticated and unauthenticated users
 * (e.g., container creation for anonymous/local sandbox projects).
 */
function optionalAuthenticateRequest(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  if (STRICT_AUTH) {
    return authenticateRequest(req, res, next);
  }

  const token = getSessionTokenFromRequest(req);

  if (!token) {
    // No token - allow as anonymous
    const anonymousIdentity = getAnonymousFallbackIdentity(req);
    req.userId = anonymousIdentity.userId;
    req.sessionId = anonymousIdentity.sessionId;
    return next();
  }

  // Try to verify the token
  verifySessionToken(token).then(session => {
    if (session) {
      req.userId = session.userId;
      req.sessionId = session.sessionId;
    } else {
      const anonymousIdentity = getAnonymousFallbackIdentity(req);
      req.userId = anonymousIdentity.userId;
      req.sessionId = anonymousIdentity.sessionId;
    }
    next();
  }).catch(() => {
    const anonymousIdentity = getAnonymousFallbackIdentity(req);
    req.userId = anonymousIdentity.userId;
    req.sessionId = anonymousIdentity.sessionId;
    next();
  });
}

// Resolve a platform API key (sk_...) from the `x-api-key` header.
// This lets first-party clients (e.g. the desktop cockpit) authenticate
// against authenticateRequest-protected routes — notably /api/conductor/*
// — using a minted platform key instead of a Better Auth session cookie.
// Returns the owning user's identity, or null when no/invalid key is present.
function resolvePlatformApiKeySession(
  req: express.Request,
): { userId: string; sessionId: string } | null {
  const header = req.headers['x-api-key'];
  const raw = Array.isArray(header) ? header[0] : header;
  const key = raw?.trim();
  if (!key || !key.startsWith('sk_')) {
    return null;
  }
  const apiKey = validatePlatformApiKey(key);
  if (!apiKey) {
    return null;
  }
  return { userId: apiKey.userId, sessionId: `apikey:${apiKey.id}` };
}

function authenticateRequest(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const internalSession = resolveInternalServiceSession(req, INTERNAL_SERVICE_KEY);
  if (internalSession) {
    req.userId = internalSession.userId;
    req.sessionId = internalSession.sessionId;
    return next();
  }

  // Platform API key (x-api-key: sk_...) — first-party client auth.
  const apiKeySession = resolvePlatformApiKeySession(req);
  if (apiKeySession) {
    req.userId = apiKeySession.userId;
    req.sessionId = apiKeySession.sessionId;
    return next();
  }

  // Get token from Authorization header OR cookies (for cross-origin with httpOnly cookies)
  const token = getSessionTokenFromRequest(req);
  const origin = req.headers.origin || '';

  // If no token provided
  if (!token) {
    // In development or if origin is allowed, permit without auth (migration mode)
    const isAllowedOrigin =
      ALLOWED_ORIGINS.includes(origin) ||
      origin === '' ||
      (ALLOW_LOCALHOST_ORIGIN && isLocalhostOrigin(origin));

    if (!STRICT_AUTH && isAllowedOrigin) {
      const anonymousIdentity = getAnonymousFallbackIdentity(req);
      // Migration mode: allow but log warning
      logWarning(ErrorCode.AUTH_REQUIRED, 'Request without auth token accepted in migration mode', {
        origin: origin || 'same-origin',
        method: req.method,
        path: req.path,
      });
      req.userId = anonymousIdentity.userId;
      req.sessionId = anonymousIdentity.sessionId;
      return next();
    }

    return res.status(401).json({ error: 'Authentication required. Pass Better Auth session token in Authorization header.' });
  }

  // Verify the token
  verifySessionToken(token).then(session => {
    if (!session) {
      // Token invalid but from allowed origin - allow in migration mode
      const isAllowedOrigin =
        ALLOWED_ORIGINS.includes(origin) ||
        origin === '' ||
        (ALLOW_LOCALHOST_ORIGIN && isLocalhostOrigin(origin));
      if (!STRICT_AUTH && isAllowedOrigin) {
        const anonymousIdentity = getAnonymousFallbackIdentity(req);
        logWarning(ErrorCode.AUTH_INVALID_TOKEN, 'Invalid token accepted in migration mode', {
          origin: origin || 'same-origin',
          method: req.method,
          path: req.path,
        });
        req.userId = anonymousIdentity.userId;
        req.sessionId = anonymousIdentity.sessionId;
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
      const anonymousIdentity = getAnonymousFallbackIdentity(req);
      logWarning(ErrorCode.AUTH_SERVICE_ERROR, 'Auth service error accepted in migration mode', {
        method: req.method,
        path: req.path,
      });
      req.userId = anonymousIdentity.userId;
      req.sessionId = anonymousIdentity.sessionId;
      return next();
    }
    return res.status(500).json({ error: 'Authentication service error' });
  });
}

function authenticateMutatingRequest(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  return authenticateRequest(req, res, next);
}

function promoteQueryToken(req: express.Request, _res: express.Response, next: express.NextFunction) {
  if (!req.headers.authorization && typeof req.query.token === 'string' && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}

// Admin authorization middleware - requires authenticated user to be in ADMIN_USER_IDS
const ADMIN_USER_IDS = new Set(
  (process.env.ADMIN_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
);

function requireAdmin(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  if (!req.userId || req.userId === 'anonymous') {
    return res.status(401).json({ error: 'Authentication required for admin endpoints' });
  }

  if (!ADMIN_USER_IDS.has(req.userId)) {
    logger.warn(`[admin] Unauthorized admin access attempt by user ${req.userId} to ${req.path}`);
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

// Authorization middleware - verifies project ownership
// During migration: allows anonymous users to access projects (with warning)
function verifyProjectOwnership(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const projectId = getProjectIdFromRequest(req);

  if (!projectId) {
    return res.status(400).json({ error: 'Project ID required' });
  }

  if (!isLikelySandboxProjectId(projectId)) {
    return res.status(400).json({ error: 'Invalid sandbox project ID' });
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

/**
 * Flexible project ownership middleware - allows anonymous users to create/access
 * containers for local sandbox projects.
 * For authenticated users, still verifies ownership.
 */
function flexibleProjectOwnership(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const projectId = getProjectIdFromRequest(req);

  if (!projectId) {
    return res.status(400).json({ error: 'Project ID required' });
  }

  if (!isLikelySandboxProjectId(projectId)) {
    return res.status(400).json({ error: 'Invalid sandbox project ID' });
  }

  // Allow anonymous users to access local sandbox containers when strict auth is disabled.
  if (req.userId === 'anonymous') {
    logger.info({ projectId: maskIdentifier(projectId), method: req.method, path: req.path },
      'anonymous container access allowed');
    return next();
  }

  // For authenticated users, verify ownership
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  checkProjectOwnership(req.userId, projectId).then(isOwner => {
    if (!isOwner) {
      // Allow but log warning - user may have created project before auth was added
      logger.warn({ userId: maskIdentifier(req.userId), projectId: maskIdentifier(projectId) },
        'project ownership not confirmed, allowing access');
      return next();
    }
    next();
  }).catch((err) => {
    // On ownership check failure, allow access but log
    logger.warn({ error: err.message, projectId: maskIdentifier(projectId) },
      'ownership check failed, allowing access');
    return next();
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
  logger.info({ type: 'AUDIT', ...event }, `audit: ${event.action}`);
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

    logger.info({ endpoint, projectId, userId: userId || 'anonymous', active: this.connections.size }, 'WS Keepalive registered');
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
      logger.error({ endpoint: info.endpoint, projectId: info.projectId, err }, 'WS Keepalive ping error');
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
    logger.warn({ endpoint: info.endpoint, projectId: info.projectId, uptime }, 'WS Keepalive pong timeout');

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

    logger.info({ endpoint: info.endpoint, projectId: info.projectId, code, reason: reason || 'none', uptime, active: this.connections.size - 1 }, 'WS Keepalive closed');

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
    logger.info({ active: this.connections.size }, 'WS Keepalive shutting down');
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
  logger.warn('Redis not available, using memory fallback for sessions');
});

// Initialize container pool (non-blocking) - pre-warms containers for faster project creation
const ENABLE_CONTAINER_POOL = process.env.ENABLE_CONTAINER_POOL !== 'false';
// Always persist workspace volumes - files survive container restarts
const PERSIST_WORKSPACE = true;

const docker = new Docker();

// App API URL for fetching user tokens
// Default to localhost (same-server) to avoid 5s roundtrip through Cloudflare
const APP_API_URL = process.env.APP_API_URL || 'http://127.0.0.1:3000';
// Validated at startup (line 265) — guaranteed non-empty in production
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY ?? '';

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
      logger.error({ userId: maskIdentifier(userId) }, 'Claude Code token fetch timed out after 5s');
    } else {
      logger.error({ userId: maskIdentifier(userId), err: error }, 'Claude Code token fetch error');
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
      logger.error({ userId: maskIdentifier(userId) }, 'AI Provider Keys fetch timed out after 5s');
    } else {
      logger.error({ userId: maskIdentifier(userId), err: error }, 'AI Provider Keys fetch error');
    }
    return {};
  } finally {
    clearTimeout(timeoutId);
  }
}

async function syncProjectSnapshotDelta(input: {
  projectId: string;
  userId?: string;
  files?: Record<string, string>;
  removePaths?: string[];
  removePathPrefixes?: string[];
  addDirectories?: string[];
  removeDirectories?: string[];
  renamePaths?: Array<{ from: string; to: string }>;
}): Promise<void> {
  if (!input.userId || !INTERNAL_SERVICE_KEY) {
    return;
  }

  if (
    (!input.files || Object.keys(input.files).length === 0) &&
    (!input.removePaths || input.removePaths.length === 0) &&
    (!input.removePathPrefixes || input.removePathPrefixes.length === 0) &&
    (!input.addDirectories || input.addDirectories.length === 0) &&
    (!input.removeDirectories || input.removeDirectories.length === 0) &&
    (!input.renamePaths || input.renamePaths.length === 0)
  ) {
    return;
  }

  const pathname = `/api/projects/${encodeURIComponent(input.projectId)}`;
  const body = JSON.stringify({
    files: input.files || {},
    removePaths: input.removePaths || [],
    removePathPrefixes: input.removePathPrefixes || [],
    addDirectories: input.addDirectories || [],
    removeDirectories: input.removeDirectories || [],
    renamePaths: input.renamePaths || [],
    source: 'docker-backend',
  });
  const headers = buildInternalServiceHeaders({
    method: 'PATCH',
    pathname,
    body,
    serviceKey: INTERNAL_SERVICE_KEY,
  });
  headers.set('X-User-Id', input.userId);

  const response = await fetch(`${APP_API_URL}${pathname}`, {
    method: 'PATCH',
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`project snapshot sync failed: ${response.status} ${text}`);
  }
}

// Create base express app
const baseApp = express();

// Create HTTP server FIRST so express-ws can attach WebSocket upgrade handler
const server = http.createServer(baseApp);

// Initialize express-ws with the server so WebSocket routes work
// Cast to avoid type conflicts between @types/express-serve-static-core v4 (express) and v5 (express-ws).
const { app } = expressWs(baseApp as any, server) as unknown as { app: express.Application & { ws: (...args: any[]) => void } };

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
logger.info({ trustProxy: String(trustProxySetting) }, 'Trust proxy configured');

function getRequestIp(req: express.Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    return Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function recordRateLimitAbuse(req: express.Request, limitName: string): void {
  const event = abusePrevention.recordRateLimitHit(
    {
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'],
    },
    {
      limitName,
      method: req.method,
      path: req.path,
    },
  );
  alertFromAbuseEvent(event);
}

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 600, // 600 requests per minute (10 req/sec) — project restore can burst 200+ requests
  message: { error: 'Too many requests, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    recordRateLimitAbuse(req, 'api');
    res.status(429).json({ error: 'Too many requests, slow down' });
  },
});

const containerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // 10 container creates per minute
  message: { error: 'Container creation rate limited' },
  handler: (req, res) => {
    recordRateLimitAbuse(req, 'container-create');
    res.status(429).json({ error: 'Container creation rate limited' });
  },
});

const abusePayloadInspectionEnabled =
  (process.env.ABUSE_PAYLOAD_INSPECTION_ENABLED || '').toLowerCase() === 'true';

// CORS allowlist imported from cors-utils.ts (shared with globalErrorHandler)

const PUBLIC_DOCKER_BACKEND_URL =
  process.env.DOCKER_BACKEND_PUBLIC_URL ||
  process.env.RECODER_DOCKER_BACKEND_URL ||
  process.env.BACKEND_PUBLIC_URL ||
  'https://docker.recoder.xyz';

const PUBLIC_PREVIEW_URL =
  process.env.PUBLIC_URL ||
  process.env.PREVIEW_PUBLIC_URL ||
  process.env.MAIN_SITE_URL ||
  PUBLIC_DOCKER_BACKEND_URL;

const PUBLIC_DOCKER_BACKEND_WS_URL = PUBLIC_DOCKER_BACKEND_URL
  .replace('https://', 'wss://')
  .replace('http://', 'ws://');

const PUBLIC_OPENCLAW_GATEWAY_URL =
  process.env.OPENCLAW_GATEWAY_URL || '';

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or same-origin)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn({ origin }, 'CORS blocked request');
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: CORS_ALLOWED_METHODS,
  allowedHeaders: CORS_ALLOWED_HEADERS,
}));

app.use((req, res, next) => {
  const corsHeaders = getCorsHeadersForOrigin(req.headers.origin, ALLOWED_ORIGINS);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
// A2A discovery endpoints (must be before body parsers)
app.get('/api/a2a', (_req: express.Request, res: express.Response) => {
  res.json({
    name: 'Recoder A2A Gateway', version: '2.0', protocol: 'Agent-to-Agent (A2A)',
    docs: 'https://recoder.xyz/docs/a2a',
    endpoints: { agents: '/api/a2a/agents', tasks: '/api/a2a/tasks', channels: '/api/a2a/channels' },
  });
});
app.get('/api/a2a/.well-known/agent.json', (_req: express.Request, res: express.Response) => {
  res.json({
    name: 'Recoder Platform', url: 'https://docker.recoder.xyz/api/a2a', version: '2.0',
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: true },
    skills: [
      { id: 'coding', name: 'Code Generation' },
      { id: 'tasks', name: 'Task Management' },
    ],
    authentication: { schemes: ['hmac_shared_secret'] },
  });
});
// Keep raw JSON text for signed A2A payload verification
app.use('/api/a2a', express.text({ type: 'application/json', limit: '2mb' }));
app.use('/api/agent-os/github/webhook', express.raw({ type: 'application/json', limit: '2mb' }), createAgentOsGitHubWebhookRouter());
// Push-only connector channels (LINE / Slack HTTP Events) ingress: mounted with
// a raw-body parser (inside the router) BEFORE the global JSON parser so the
// HMAC signature verifies over the exact bytes the platform signed.
app.use('/api/connectors/webhook', createConnectorsWebhookRouter());
// Polar (Merchant-of-Record) billing webhook ingress: mounted with a raw-body
// parser BEFORE the global JSON parser so the Standard-Webhooks signature
// verifies over the exact bytes Polar signed. A missing secret / bad signature
// / stale timestamp / malformed body all deny (fail safe — never a faked 200).
app.use(
  '/internal/billing/webhook',
  express.raw({ type: '*/*', limit: '2mb' }),
  createBillingWebhookRouter(getDistributionModule()),
);
app.use(express.json({ limit: '50mb' }));
// Tighter body-size limit for public API routes (2 MB vs 50 MB global)
app.use('/api/v1', express.json({ limit: '2mb' }));
app.use('/api/', apiLimiter);

// Strip X-Powered-By (nginx can't remove Express-generated headers).
// All other security headers (X-Frame-Options, X-Content-Type-Options,
// X-XSS-Protection, Referrer-Policy, CSP) are set globally by nginx in
// nginx-production.conf lines 85-88 with `always`, so setting them here
// would create duplicates AND break per-location overrides — nginx blanks
// X-Frame-Options for preview iframe endpoints, but Express's DENY would win.
app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
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
  const ip = getRequestIp(req);

  const blockCheck = abusePrevention.isBlocked({ ip, userAgent: req.headers['user-agent'] });
  if (blockCheck.blocked) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (
    abusePayloadInspectionEnabled &&
    req.path.startsWith('/api/') &&
    req.body !== undefined &&
    req.body !== null
  ) {
    const payloadCheck = abusePrevention.checkPayload(req.body, {
      ip,
      userAgent: req.headers['user-agent'],
    });
    if (!payloadCheck.safe) {
      res.status(400).json({
        error: 'Suspicious request payload',
        patterns: payloadCheck.patterns,
      });
      return;
    }
  }

  next();
});

// Container registry: projectId -> containerId + port + ptyPort
// Added backgroundDev flag so we can auto-tail dev server logs into the PTY when users attach
// Daytona sandboxes are stored with daytona: true so all file/exec routes can route correctly
const containers = new Map<string, ContainerEntry>();

// ── Container map persistence (survives docker-backend restarts) ──
import { loadStore, debouncedSave } from './persistence.js';

function persistContainers(): void {
  const data: Record<string, Partial<ContainerEntry>> = {};
  for (const [k, v] of containers.entries()) {
    // Explicitly pick serializable fields to avoid circular references
    data[k] = {
      id: v.id,
      lastActive: v.lastActive,
      port: v.port,
      ptyPort: v.ptyPort,
      backgroundDev: v.backgroundDev,
      userId: v.userId,
      daytona: (v as any).daytona,
      daytonaPreviewUrl: (v as any).daytonaPreviewUrl,
      daytonaWorkDir: (v as any).daytonaWorkDir,
    };
  }
  debouncedSave('containers', data, 500);
}

// Restore containers from disk on startup
try {
  const saved = loadStore<Record<string, ContainerEntry>>('containers', {});
  let restored = 0;
  for (const [projectId, entry] of Object.entries(saved)) {
    if (entry && entry.id) {
      containers.set(projectId, { ...entry, lastActive: Date.now() });
      restored++;
    }
  }
  if (restored > 0) {
    logger.info({ restored }, 'Restored container mappings from disk');
  }
} catch (e) {
  logger.warn({ err: e }, 'Failed to restore container mappings');
}

/**
 * Get the tracked container entry for a project.
 *
 * Containers are only used when we already have an explicit mapping.
 * Do not scan Docker or Daytona to infer ownership/state at request time.
 */
async function getOrRecoverContainer(projectId: string): Promise<ContainerEntry | undefined> {
  const existing = containers.get(projectId);
  if (existing) {
    existing.lastActive = Date.now();

    if (!isDaytonaSandbox(existing)) {
      return existing;
    }

    daytonaSandboxIds.add(existing.id);
    registerDaytonaId(existing.id);

    try {
      const dc = getDaytonaClient();
      await Promise.race([
        dc.getSandbox(existing.id),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timed out checking sandbox ${existing.id}`)), DAYTONA_RECOVERY_TIMEOUT_MS),
        ),
      ]);
      if (existing.daytonaWorkDir) {
        dc.rememberWorkDir(existing.id, existing.daytonaWorkDir);
      } else {
        existing.daytonaWorkDir = await Promise.race([
          dc.getWorkDir(existing.id),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error(`Timed out loading workdir for sandbox ${existing.id}`)), DAYTONA_RECOVERY_TIMEOUT_MS),
          ),
        ]).catch(() => existing.daytonaWorkDir);
        persistContainers();
      }
      return existing;
    } catch (err: any) {
      if (/Timed out/i.test(err?.message || '')) {
        logger.warn(
          { projectId, sandboxId: existing.id, error: err?.message },
          'Timed out validating tracked Daytona sandbox, proceeding with cached mapping',
        );
        return existing;
      }
      logger.warn(
        { projectId, sandboxId: existing.id, error: err?.message },
        'Tracked Daytona sandbox no longer exists, clearing cached mapping',
      );
      containers.delete(projectId);
      daytonaSandboxIds.delete(existing.id);
      unregisterDaytonaId(existing.id);
      persistContainers();
      return undefined;
    }
  }

  const recoveredDocker = await recoverContainerFromDocker(docker, projectId, containers, logger);
  if (recoveredDocker) {
    if (recoveredDocker.userId) {
      registerUserContainer(recoveredDocker.userId, projectId);
    }
    persistContainers();
    return containers.get(projectId) as ContainerEntry | undefined;
  }

  if (isDaytonaConfigured() && process.env.USE_DAYTONA_CONTAINERS === 'true') {
    try {
      const dc = getDaytonaClient();
      const sandboxes = await dc.listSandboxes();
      const matches = sandboxes
        .filter((sandbox: any) => sandbox.labels?.projectId === projectId || sandbox.labels?.id === projectId)
        .sort((a: any, b: any) => {
          const aRunning = a.state === 'started' || a.state === 'running' ? 1 : 0;
          const bRunning = b.state === 'started' || b.state === 'running' ? 1 : 0;
          if (aRunning !== bRunning) return bRunning - aRunning;
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });

      const match = matches[0];
      if (match) {
        const defaultPort = 5173;
        const preview = await getDaytonaPreviewAccess({ id: match.id }, defaultPort);
        const workDir = await dc.getWorkDir(match.id).catch(() => undefined);

        const recoveredDaytona: ContainerEntry = {
          id: match.id,
          lastActive: Date.now(),
          port: defaultPort,
          ptyPort: 0,
          backgroundDev: false,
          userId: match.labels?.userId,
          daytona: true,
          daytonaPreviewUrl: preview.url,
          daytonaDevSessionId: buildDaytonaDevServerSessionId(projectId),
          daytonaWorkDir: workDir,
        };

        containers.set(projectId, recoveredDaytona);
        daytonaSandboxIds.add(match.id);
        registerDaytonaId(match.id);
        if (match.labels?.userId) {
          registerUserContainer(match.labels.userId, projectId);
        }
        persistContainers();
        return recoveredDaytona;
      }
    } catch (err: any) {
      logger.warn({ projectId, error: err?.message }, 'Failed to recover Daytona sandbox by project ID');
    }
  }

  return undefined;
}

/**
 * Provision a brand-new Daytona sandbox for a project that has none. This is a
 * focused, headless version of the web-IDE container route's creation path —
 * it intentionally omits the route's ownership-reservation and zrok extras so
 * it can be called from non-HTTP flows (e.g. squad dispatch with
 * `createSandbox`). The proven web-IDE route is left untouched; this is purely
 * additive. Returns the registered ContainerEntry, or undefined if Daytona is
 * not configured. Throws on creation failure so callers can report truthfully.
 */
async function provisionDaytonaSandboxForProject(
  projectId: string,
  userId: string,
): Promise<ContainerEntry | undefined> {
  if (!isDaytonaConfigured()) return undefined;

  const dc = getDaytonaClient();
  const sandbox = await dc.createSandbox({
    labels: { projectId, userId, source: 'squad-dispatch' },
    public: true,
    resources: { disk: DAYTONA_WEB_IDE_DISK_GB },
  });

  // Wait for the sandbox to reach a running state before returning.
  if (sandbox.state !== 'started' && sandbox.state !== 'running') {
    try {
      await dc.getOrStartSandbox(sandbox.id, 30000);
    } catch (waitErr: any) {
      logger.warn({ sandboxId: sandbox.id, err: waitErr?.message }, 'provisioned sandbox readiness wait failed, proceeding');
    }
  }

  const workDir = await dc.getWorkDir(sandbox.id).catch(() => DAYTONA_WORKSPACE_ROOT);
  dc.rememberWorkDir(sandbox.id, workDir);
  if (workDir !== DAYTONA_WORKSPACE_ROOT) {
    try {
      await dc.execCommand(
        sandbox.id,
        `test -e ${DAYTONA_WORKSPACE_ROOT} || ln -sf '${workDir.replace(/'/g, "'\\''")}' ${DAYTONA_WORKSPACE_ROOT}`,
        { timeoutSecs: 10 },
      );
    } catch (symlinkErr: any) {
      logger.warn({ sandboxId: sandbox.id, workDir, err: symlinkErr?.message }, 'provisioned sandbox /workspace alias failed');
    }
  }

  const defaultPort = 5173;
  const preview = await getDaytonaPreviewAccess({ id: sandbox.id }, defaultPort).catch((err: any) => {
    logger.warn({ sandboxId: sandbox.id, err: err?.message }, 'provisioned sandbox preview fallback');
    return { url: dc.getPreviewUrl(sandbox.id, defaultPort) } as { url: string };
  });

  const entry: ContainerEntry = {
    id: sandbox.id,
    lastActive: Date.now(),
    port: defaultPort,
    ptyPort: 0,
    backgroundDev: false,
    userId,
    daytona: true,
    daytonaPreviewUrl: preview.url,
    daytonaDevSessionId: buildDaytonaDevServerSessionId(projectId),
    daytonaWorkDir: workDir,
  };
  containers.set(projectId, entry);
  daytonaSandboxIds.add(sandbox.id);
  registerDaytonaId(sandbox.id);
  registerUserContainer(userId, projectId);
  persistContainers();

  logger.info({ sandboxId: sandbox.id, projectId, source: 'squad-dispatch' }, 'provisioned new Daytona sandbox for project');
  return entry;
}

// Track containers being created to prevent race conditions
type ContainerCreationResult = { containerId: string; port: number; ptyPort: number; fromPool?: boolean };
const creatingContainers = new Map<string, ContainerCreationEntry<ContainerCreationResult>>();
const CONTAINER_CREATE_TIMEOUT_MS = Number(process.env.CONTAINER_CREATE_TIMEOUT_MS || 120000);

// Per-user container tracking for limits
const userContainers = new Map<string, Set<string>>(); // userId -> Set of projectIds
const MAX_CONTAINERS_PER_USER = Number(process.env.MAX_CONTAINERS_PER_USER) || 5;
const DAYTONA_WEB_IDE_DISK_GB = Number(process.env.DAYTONA_WEB_IDE_DISK_GB || 40);
const DAYTONA_RECOVERY_TIMEOUT_MS = 3000;
const SANDBOX_LOCAL_OPENCODE_START_TIMEOUT_MS = 45000;
const SANDBOX_LOCAL_OPENCODE_PROMPT_TIMEOUT_MS = 60000;

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
  ownershipCache.set(`${userId}:${projectId}`, {
    isOwner: true,
    expiresAt: Date.now() + OWNERSHIP_CACHE_TTL,
  });
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
  ownershipCache.delete(`${userId}:${projectId}`);
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
/**
 * Track known Daytona sandbox IDs so execInContainer can route correctly.
 * Populated when Daytona sandboxes are created; cleaned when deleted.
 */
const daytonaSandboxIds = new Set<string>();
// Expose to git-operations.ts (avoids circular import)
(global as any).__daytonaSandboxIds = daytonaSandboxIds;

// Populate daytonaSandboxIds from restored container entries
for (const [, entry] of containers.entries()) {
  if (entry.daytona && entry.id) {
    daytonaSandboxIds.add(entry.id);
    registerDaytonaId(entry.id);
  }
}

async function execInContainer(containerId: string, cmd: string): Promise<string> {
  // Route through Daytona toolbox exec if this is a known sandbox
  if (daytonaSandboxIds.has(containerId)) {
    const result = await daytonaExec(containerId, cmd, { timeoutSecs: 30 });
    return result.output;
  }

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
            result += raw.subarray(i + 8, i + 8 + size).toString();
            i += 8 + size;
            continue;
          }
        }
        result += raw.subarray(i).toString();
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
  entry: ContainerEntry,
  projectId: string
): Promise<{ running: boolean; restarted: boolean; error?: string }> {
  // Daytona sandboxes: check/start via Daytona API instead of Docker
  if (isDaytonaSandbox(entry)) {
    return ensureDaytonaSandboxRunning(entry.id);
  }

  try {
    const container = docker.getContainer(entry.id);
    const info = await container.inspect();

    if (info.State.Running) {
      // Container is already running
      return { running: true, restarted: false };
    }

    if (info.State.Status === 'exited' || info.State.Status === 'stopped') {
      // Container is stopped, try to restart it
      logger.info({ projectId, containerId: entry.id.slice(0, 12) }, 'Restarting stopped container');
      await container.start();
      // Wait for container to be fully running before returning — putArchive
      // fails with 500 if the filesystem layer isn't ready yet.
      for (let i = 0; i < 10; i++) {
        const check = await container.inspect();
        if (check.State.Running) break;
        await new Promise(r => setTimeout(r, 300));
      }
      logger.info({ projectId }, 'Successfully restarted container');
      return { running: true, restarted: true };
    }

    if (info.State.Status === 'paused') {
      // Container is paused, unpause it
      logger.info({ projectId, containerId: entry.id.slice(0, 12) }, 'Unpausing container');
      await container.unpause();
      return { running: true, restarted: true };
    }

    // Container is in some other state (created, dead, etc.)
    logger.warn({ containerId: entry.id.slice(0, 12), state: info.State.Status }, 'Container in unexpected state');
    return { running: false, restarted: false, error: `Container in unexpected state: ${info.State.Status}` };
  } catch (error: any) {
    // Container doesn't exist or other error
    logger.error({ containerId: entry.id.slice(0, 12), err: error }, 'Error checking container');

    // If container not found, remove from registry so it can be recreated
    if (error.statusCode === 404) {
      logger.info({ projectId }, 'Removing stale container entry');
      try { getMeteringCollector().untrackContainer(entry.id); } catch (_) {}
      try { healthMonitor.unregisterContainer(entry.id); } catch (_) {}
      try { resourceOptimizer.unregisterContainer(entry.id); } catch (_) {}
      if (entry.userId) {
        unregisterUserContainer(entry.userId, projectId);
      }
      containers.delete(projectId);
      persistContainers();
      releasePorts(entry.port, entry.ptyPort);
    }

    return { running: false, restarted: false, error: 'Container restart failed' };
  }
}

// Health check
app.get('/health', (_, res) => {
  // A2A subsystem health
  let a2aStatus: Record<string, unknown> = { enabled: false };
  try {
    const sloSummary = getA2ASloMetrics().getSummary();
    const heartbeat = getHeartbeatTracker();
    const bridgeStats = getAgentBridgeService().getStats();
    a2aStatus = {
      enabled: true,
      agents: heartbeat.getAllRecords().length,
      bridgeConnections: bridgeStats.totalConnections,
      slo: {
        connectors: sloSummary.connectors,
        approvals: sloSummary.approvals,
      },
    };
  } catch {
    a2aStatus = { enabled: false, error: 'not_initialized' };
  }

  res.json({ status: 'ok', containers: containers.size, a2a: a2aStatus });
});

// Public API prompt queue health/config endpoint for deploy smoke checks.
app.get('/api/health/public-api-queue', (_req, res) => {
  const diagnostics = getPromptTaskQueueDiagnostics();
  const warnings: string[] = [];
  if (diagnostics.configuredBackend === 'redis' && !diagnostics.hasRedisUrl) {
    warnings.push('configured redis backend is missing REDIS_URL');
  }
  res.json({
    status: 'ok',
    queue: diagnostics,
    warnings,
  });
});

app.get('/api/health/byok-readiness', (_req, res) => {
  const report = getByokReadiness(process.env);
  res.status(report.overallReady ? 200 : 503).json(report);
});

// Daytona sandbox health check
app.get('/api/health/daytona', async (_req, res) => {
  if (!isDaytonaConfigured()) {
    return res.status(503).json({
      status: 'not_configured',
      message: 'Set DAYTONA_API_KEY or both DAYTONA_JWT_TOKEN and DAYTONA_ORGANIZATION_ID',
    });
  }
  try {
    const check = await getDaytonaClient().healthCheck();
    res.status(check.healthy ? 200 : 503).json({
      status: check.healthy ? 'healthy' : 'unhealthy',
      latencyMs: check.latencyMs,
      error: check.error,
      serverUrl: process.env.DAYTONA_API_URL || process.env.DAYTONA_SERVER_URL || 'http://localhost:3900/api',
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      error: (err as Error).message,
    });
  }
});

// Metrics auth: require bearer token in production to prevent info leak
const metricsAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const metricsToken = process.env.METRICS_BEARER_TOKEN;
  if (!metricsToken) return next(); // skip auth if not configured
  const auth = req.headers.authorization;
  if (auth === `Bearer ${metricsToken}`) return next();
  return res.status(401).json({ error: 'Unauthorized' });
};

// Pool stats endpoint
app.get('/api/pool/stats', metricsAuth, (_, res) => {
  if (!ENABLE_CONTAINER_POOL) {
    return res.json({ enabled: false });
  }
  const stats = containerPool.getStats();
  res.json({ enabled: true, ...stats });
});

// Pool detailed metrics endpoint (PERFORMANCE monitoring)
app.get('/api/pool/metrics', metricsAuth, (_, res) => {
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

// Extracted to ./routes/context-cache.routes.ts (see createContextCacheRouter)
app.use(createContextCacheRouter({ authenticateRequest, verifyProjectOwnership, logger }));

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

app.get('/api/metrics', metricsAuth, (_, res) => {
  // Get metrics from all sources
  const metricsSummary = metricsCollector.getSummary();
  const containerPoolStats = ENABLE_CONTAINER_POOL ? containerPool.getStats() : null;
  const containerPoolMetrics = ENABLE_CONTAINER_POOL ? containerPool.getMetrics() : null;
  const wsStats = wsKeepalive.getStats();
  const cacheStats = fileCache.getStats();
  const portStats = getPortStats();
  const a2aSloSummary = getA2ASloMetrics().getSummary();

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

    // A2A SLO metrics (Phase 15)
    a2a: {
      connectors: a2aSloSummary.connectors,
      approvals: a2aSloSummary.approvals,
    },
  };

  res.json(metrics);
});

// Prometheus-compatible metrics endpoint
app.get('/api/metrics/prometheus', metricsAuth, (_, res) => {
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

  // A2A SLO metrics
  lines.push('');
  lines.push(getA2ASloMetrics().getPrometheusFormat());

  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(lines.join('\n'));
});

// ==================== END METRICS ENDPOINT ====================

// Create or get container for project (SECURED: requires auth + ownership)
app.post('/api/container', containerLimiter, optionalAuthenticateRequest, flexibleProjectOwnership, async (req: AuthenticatedRequest, res) => {
  let reservedOwnership = false;
  let reservedProjectId: string | null = null;
  let reservedUserId: string | null = null;
  try {
    const { projectId, framework, templateId } = req.body;
    const userId = req.userId || 'anonymous';
    const isAnonymous = userId === 'anonymous';

    // Audit log
    auditLog({
      userId,
      action: 'CONTAINER_CREATE',
      projectId,
      ip: req.ip,
    });

    if (!projectId) return res.status(400).json({ error: 'projectId required' });

    // Daytona-first: if USE_DAYTONA_CONTAINERS is set, use Daytona only.
    // Do not silently spill into Docker when Daytona provisioning fails.
    if (isDaytonaConfigured() && process.env.USE_DAYTONA_CONTAINERS === 'true') {
      const buildDaytonaContainerResponse = (entry: ContainerEntry, reused: boolean) => {
        const previewPort = entry.port || 5173;
        const previewUrl = entry.daytonaPreviewUrl || `http://localhost:${previewPort}`;
        return {
          containerId: entry.id,
          reused,
          fromPool: false,
          port: previewPort,
          ptyPort: entry.ptyPort || 0,
          ports: {
            preview: previewPort,
            vite: previewPort,
            other: previewPort + 1,
            pty: entry.ptyPort || 0,
          },
          urls: {
            preview: previewUrl,
            vite: previewUrl,
            pty: entry.ptyPort ? `ws://localhost:${entry.ptyPort}` : '',
          },
          daytona: true,
        };
      };

      // Check in-memory map first
      let existingDaytona = containers.get(projectId);

      // If not in memory, recover from Daytona API (prevents duplicate sandbox creation after restart)
      if (!existingDaytona) {
        const recovered = await getOrRecoverContainer(projectId);
        if (recovered) {
          existingDaytona = recovered;
        }
      }

      if (existingDaytona) {
        existingDaytona.lastActive = Date.now();
        // Ensure it's running — if it can't be started, discard and create new
        if (isDaytonaSandbox(existingDaytona)) {
          try {
            await ensureDaytonaSandboxRunning(existingDaytona.id);
          } catch {
            // Sandbox can't be started (deleted, error state, etc.) — remove from map and fall through to create new
            logger.warn({ projectId, sandboxId: existingDaytona.id }, 'Recovered sandbox cannot start, creating new one');
            containers.delete(projectId);
            existingDaytona = undefined as any;
          }
        }
        if (existingDaytona) {
          return res.json(buildDaytonaContainerResponse(existingDaytona, true));
        }
      }
      try {
        const dc = getDaytonaClient();
        const sandbox = await dc.createSandbox({
          labels: { projectId, userId, source: 'spaces' },
          // Uses 43200s (12hr) defaults from daytona-client.ts — do NOT override here
          public: true,
          resources: {
            disk: DAYTONA_WEB_IDE_DISK_GB,
          },
        });

        // Wait for sandbox to reach running state before returning — prevents exec failures
        if (sandbox.state !== 'started' && sandbox.state !== 'running') {
          logger.info({ sandboxId: sandbox.id, state: sandbox.state }, 'Waiting for Daytona sandbox to be ready...');
          try {
            await dc.getOrStartSandbox(sandbox.id, 30000);
          } catch (waitErr: any) {
            logger.warn({ sandboxId: sandbox.id, err: waitErr.message }, 'Sandbox readiness wait failed, proceeding anyway');
          }
        }

        const workDir = await dc.getWorkDir(sandbox.id).catch((err: any) => {
          logger.warn({ sandboxId: sandbox.id, err: err?.message }, 'Falling back to default Daytona workdir');
          return DAYTONA_WORKSPACE_ROOT;
        });
        dc.rememberWorkDir(sandbox.id, workDir);

        // Keep /workspace usable for legacy callers, but point it at the real
        // sandbox workdir Daytona reports instead of guessing a home path.
        if (workDir !== DAYTONA_WORKSPACE_ROOT) {
          try {
            await dc.execCommand(
              sandbox.id,
              `test -e ${DAYTONA_WORKSPACE_ROOT} || ln -sf '${workDir.replace(/'/g, "'\\''")}' ${DAYTONA_WORKSPACE_ROOT}`,
              { timeoutSecs: 10 },
            );
            logger.info({ sandboxId: sandbox.id, workDir }, 'Ensured /workspace alias for Daytona sandbox');
          } catch (symlinkErr: any) {
            logger.warn({ sandboxId: sandbox.id, workDir, err: symlinkErr.message }, 'Failed to align /workspace alias with Daytona workdir');
          }
        }

        // Default to 5173 (Vite) — will be updated when dev server starts and detects actual port
        const defaultPort = 5173;
        const preview = await getDaytonaPreviewAccess({ id: sandbox.id }, defaultPort).catch((err: any) => {
          logger.warn({ sandboxId: sandbox.id, err: err?.message }, 'Falling back to default Daytona preview URL');
          return { url: dc.getPreviewUrl(sandbox.id, defaultPort) } as { url: string };
        });
        const previewUrl = preview.url;
        containers.set(projectId, {
          id: sandbox.id,
          lastActive: Date.now(),
          port: defaultPort,
          ptyPort: 0,
          backgroundDev: false,
          userId,
          daytona: true,
          daytonaPreviewUrl: previewUrl,
          daytonaDevSessionId: buildDaytonaDevServerSessionId(projectId),
          daytonaWorkDir: workDir,
        });
        daytonaSandboxIds.add(sandbox.id);
        registerDaytonaId(sandbox.id);
        registerUserContainer(userId, projectId);
        persistContainers();

        // ── Sprint C: Zrok instant preview URL (non-blocking upgrade) ──
        try {
          await createPreviewShare({
            sandboxId: sandbox.id,
            projectId,
            targetPort: defaultPort,
          });
        } catch (zrokErr) {
          logger.debug({ err: zrokErr, projectId }, 'Zrok share skipped — using Daytona preview contract');
        }

        logger.info({ sandboxId: sandbox.id, projectId, previewUrl }, 'Daytona sandbox created for web IDE');
        return res.json(buildDaytonaContainerResponse(containers.get(projectId)!, false));
      } catch (err: any) {
        logger.error({ err: err.message, projectId }, 'Daytona sandbox creation failed');
        if (reservedOwnership && reservedProjectId && reservedUserId && !containers.has(reservedProjectId)) {
          unregisterUserContainer(reservedUserId, reservedProjectId);
          reservedOwnership = false;
          reservedProjectId = null;
          reservedUserId = null;
        }
        return res.status(503).json({
          error: err?.message || 'Daytona sandbox creation failed',
          provider: 'daytona',
          canRetry: false,
        });
      }
    }

    // Check per-user container limit (skip for anonymous users, skip if this project already has a container)
    const existingContainer = containers.get(projectId);
    if (!existingContainer && !isAnonymous) {
      // Reserve ownership before slower quota/credential work so parallel file/preview
      // requests during bootstrap do not fail auth against an unregistered project.
      registerUserContainer(userId, projectId);
      reservedOwnership = true;
      reservedProjectId = projectId;
      reservedUserId = userId;

      const currentCount = getUserContainerCount(userId);
      if (currentCount >= MAX_CONTAINERS_PER_USER) {
        logger.info({ userId, currentCount, max: MAX_CONTAINERS_PER_USER }, 'user at container limit');
        unregisterUserContainer(userId, projectId);
        reservedOwnership = false;
        reservedProjectId = null;
        reservedUserId = null;
        return res.status(429).json({
          error: `Container limit reached. You have ${currentCount} active containers. Maximum allowed: ${MAX_CONTAINERS_PER_USER}. Please close unused projects.`,
          code: 'CONTAINER_LIMIT_REACHED',
          current: currentCount,
          max: MAX_CONTAINERS_PER_USER
        });
      }
    }

    // Check quota before creating container (skip for anonymous users)
    if (!isAnonymous) {
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
          logger.warn({ userId }, 'user approaching sandbox limit');
        }
      } catch (_) { /* quota system may not be initialized */ }
    }

    // Fetch user's Claude Code token and AI provider keys (skip for anonymous users)
    const createStartTime = Date.now();
    const [claudeCodeToken, aiProviderKeys] = isAnonymous
      ? [null, null]
      : await Promise.all([
          fetchClaudeCodeToken(userId),
          fetchAIProviderKeys(userId),
        ]);
    logger.info({ durationMs: Date.now() - createStartTime, projectId }, 'fetched user credentials');

    // Return existing container (after ensuring it's running)
    const existing = existingContainer;
    if (existing) {
      existing.lastActive = Date.now();

      // Check if container is actually running, restart if needed
      const containerStatus = await ensureContainerRunning(existing, projectId);

      if (containerStatus.running) {
        if (containerStatus.restarted) {
          logger.info({ containerId: existing.id.slice(0, 12), projectId }, 'restarted and reusing container');
        } else {
          logger.info({ containerId: existing.id.slice(0, 12), projectId }, 'reusing existing container');
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
      logger.info({ containerId: existing.id.slice(0, 12) }, 'container could not be restarted, creating new one');
    }

    // 🔒 RACE CONDITION FIX: Check if container is already being created
    const inProgress = creatingContainers.get(projectId);
    if (inProgress) {
      const ageMs = Date.now() - inProgress.startedAt;
      if (isCreationStale(inProgress, CONTAINER_CREATE_TIMEOUT_MS)) {
        logger.warn({ ageMs, projectId }, 'in-progress container creation stale, dropping and retrying');
        creatingContainers.delete(projectId);
      } else {
        logger.info({ projectId }, 'waiting for in-progress container creation');
        try {
          const result = await withCreationTimeout(inProgress.promise, CONTAINER_CREATE_TIMEOUT_MS - ageMs, () => {
            // Clear stale entry so a follow-up request can retry
            creatingContainers.delete(projectId);
          });
        logger.info({ containerId: result.containerId.slice(0, 12), projectId }, 'joined completed container creation');
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
          logger.error({ err }, 'in-progress container creation failed');
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
            logger.info({ containerId: pooled.id.slice(0, 12), projectId, durationMs: Date.now() - poolAcquireStart }, 'Pool: acquired pre-warmed container');

            // 🔧 FIX: Ensure pooled container is actually running before using it
            const pooledEntry = { id: pooled.id, lastActive: Date.now(), port: pooled.port, ptyPort: pooled.ptyPort };
            const pooledStatus = await ensureContainerRunning(pooledEntry, projectId);

            if (!pooledStatus.running) {
              logger.info({ containerId: pooled.id.slice(0, 12) }, 'Pool: pooled container not running, will create fresh container');
              // Return the container to pool or discard it
              releasePorts(pooled.port, pooled.ptyPort);
              // Continue to create a fresh container below
            } else {
              containerId = pooled.id;
              hostPort = pooled.port;
              ptyPort = pooled.ptyPort;
              fromPool = true;
              if (pooledStatus.restarted) {
                logger.info({ containerId: pooled.id.slice(0, 12), projectId }, 'Pool: restarted pooled container');
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
              if (aiProviderKeys?.openai) {
                envLines.push(`export OPENAI_API_KEY=${aiProviderKeys.openai}`);
              }
              if (aiProviderKeys?.openrouter) {
                envLines.push(`export OPENROUTER_API_KEY=${aiProviderKeys.openrouter}`);
              }
              if (aiProviderKeys?.gemini) {
                envLines.push(`export GEMINI_API_KEY=${aiProviderKeys.gemini}`);
              }
              if (aiProviderKeys?.anthropic) {
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
              logger.info({ envVarCount: envLines.length, durationMs: Date.now() - envInjectStart, projectId }, 'Pool: injected env vars');
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
            if (aiProviderKeys?.openai) {
              containerEnv.push(`OPENAI_API_KEY=${aiProviderKeys.openai}`);
              authDebug('injecting OpenAI key into container', { projectId: maskIdentifier(projectId) });
            }
            if (aiProviderKeys?.openrouter) {
              containerEnv.push(`OPENROUTER_API_KEY=${aiProviderKeys.openrouter}`);
              authDebug('injecting OpenRouter key into container', { projectId: maskIdentifier(projectId) });
            }
            if (aiProviderKeys?.gemini) {
              containerEnv.push(`GEMINI_API_KEY=${aiProviderKeys.gemini}`);
              authDebug('injecting Gemini key into container', { projectId: maskIdentifier(projectId) });
            }
            if (aiProviderKeys?.anthropic) {
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
              logger.info({ projectId }, 'Framework: setting Expo/React Native env vars');
            } else if (fw.includes('next')) {
              containerEnv.push('NEXT_TELEMETRY_DISABLED=1');
              logger.info({ projectId }, 'Framework: setting Next.js env vars');
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

              // `container` is already the resolved Container object from the
              // `await docker.createContainer(...)` above — awaiting it again is a no-op.
              const containerInstance = container;
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
              logger.info({ createMs: createDuration, startMs: startDuration, totalMs: Date.now() - onDemandStart, projectId }, 'Container: on-demand create complete');
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
                logger.warn({ attempt, maxAttempts: MAX_ATTEMPTS }, 'Container: port conflict detected, retrying with new ports');
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
        persistContainers();

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

        logger.info({ containerId: resolvedContainerId.slice(0, 12), projectId, fromPool, previewPort: resolvedHostPort, ptyPort: resolvedPtyPort, userId, totalMs: Date.now() - totalStart }, 'container ready');
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
          logger.error({ timeoutMs: CONTAINER_CREATE_TIMEOUT_MS, projectId }, 'container creation timed out, clearing in-progress');
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
    logger.error({ err }, 'container create error');
    if (reservedOwnership && reservedProjectId && reservedUserId && !containers.has(reservedProjectId)) {
      unregisterUserContainer(reservedUserId, reservedProjectId);
    }
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
app.delete('/api/container/:projectId', optionalAuthenticateRequest, flexibleProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  try {
    auditLog({
      userId: req.userId,
      action: 'CONTAINER_DELETE',
      projectId,
      ip: req.ip,
    });

    const entry = await getOrRecoverContainer(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    // Untrack from metering before removal
    try { getMeteringCollector().untrackContainer(entry.id); } catch (_) {}
    try { healthMonitor.unregisterContainer(entry.id); } catch (_) {}
    try { resourceOptimizer.unregisterContainer(entry.id); } catch (_) {}

    // ── Sprint C: Clean up Zrok share on container delete ──
    destroyPreviewShare(projectId).catch((zrokErr) => {
      logger.debug({ err: zrokErr, projectId }, 'Zrok share cleanup skipped');
    });

    if (isDaytonaSandbox(entry)) {
      // Daytona sandbox — delete via Daytona API
      daytonaSandboxIds.delete(entry.id);
      unregisterDaytonaId(entry.id);
      await daytonaDeleteSandbox(entry.id).catch((err: any) => {
        logger.warn({ sandboxId: entry.id, err: err.message }, 'Daytona sandbox delete failed');
      });
    } else {
      // Docker container — stop and remove
      const container = docker.getContainer(entry.id);
      await container.stop().catch(() => {});
      await container.remove().catch(() => {});
      releasePorts(entry.port, entry.ptyPort);
    }
    if (entry.userId) {
      unregisterUserContainer(entry.userId, projectId);
    }
    containers.delete(projectId);
    persistContainers();

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
    const entry = await getOrRecoverContainer(projectId);
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

    // Daytona sandboxes don't support local file mounts (they're remote)
    if (isDaytonaSandbox(entry)) {
      return res.status(400).json({ error: 'File mounting not supported for Daytona sandboxes. Use the file upload API instead.' });
    }

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

  logger.info({ projectId, path: safePath }, 'file write request');
  try {
    const { content } = req.body;

    if (content === undefined || content === null) {
      return res.status(400).json({ error: 'content is required' });
    }

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

    const entry = await getOrRecoverContainer(projectId);
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

    // Daytona sandbox — write via toolbox API
    if (isDaytonaSandbox(entry)) {
      await daytonaWriteFile(entry.id, safePath, content);
    } else {
      // FAST FILE WRITE: Use tar-based upload (10x faster than exec-based)
      // This avoids process spawning, shell parsing, and base64 encoding overhead
      try {
        await fastWriteFile(entry.id, safePath, content);
      } catch (tarError: any) {
        // Fallback to exec-based write if tar fails (e.g., permission issues)
        logger.warn({ err: tarError }, 'FastWrite: tar-based write failed, falling back to exec');
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
    }

    logger.info({ projectId, path: safePath, durationMs: Date.now() - fileOpStartTime }, 'file write complete');

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

    // ── Sprint E/F deep wiring: auto-index on file write ──
    // Qdrant semantic code search — debounced re-index (non-blocking)
    codeSearchIndexFile({ projectId, filePath: safePath, content }).catch((e: unknown) => {
      logger.debug({ err: e, projectId, path: safePath }, 'code-search index skipped');
    });
    // Meilisearch full-text file index (non-blocking)
    meiliIndexFile({ projectId, path: safePath, content }).catch((e: unknown) => {
      logger.debug({ err: e, projectId, path: safePath }, 'meili file index skipped');
    });
    // OpenMeter usage metering
    trackFileOp({
      userId: req.userId ?? 'anonymous',
      projectId,
      operation: 'write',
      filePath: safePath,
      sizeBytes: Buffer.byteLength(content ?? '', 'utf8'),
    });

    try {
      await syncProjectSnapshotDelta({
        projectId,
        userId: req.userId,
        files: { [safePath]: content },
        addDirectories: safePath.includes('/') ? [safePath.substring(0, safePath.lastIndexOf('/'))].filter(Boolean) : [],
      });
    } catch (snapshotErr: any) {
      logger.warn({ projectId, path: safePath, err: snapshotErr?.message || snapshotErr }, 'project snapshot sync skipped after file write');
    }

    res.json({ success: true });
  } catch (err: any) {
    logger.error({ projectId, path: safePath, error: err.message, stack: err.stack?.split('\n')[1]?.trim() }, 'file write failed');
    metricsCollector.recordFileOperation({
      operation: 'write',
      projectId,
      success: false,
      durationMs: Date.now() - fileOpStartTime,
    });
    res.status(500).json({ error: err.message || 'File write failed' });
  }
});

// Batch write multiple files at once (SECURED)
app.post('/api/files/:projectId/batch', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const batchOpStartTime = Date.now();
  try {
    const { files, bootstrapPreview = false } = req.body; // Array of { path, content }
    const entry = await getOrRecoverContainer(projectId);
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

    if (isDaytonaSandbox(entry)) {
      // Daytona sandbox — write files via toolbox exec
      const { failed } = await daytonaWriteFiles(entry.id, sanitizedFiles);
      failedFiles.push(...failed);
      logger.info({
        projectId,
        fileCount: sanitizedFiles.length,
        failedCount: failed.length,
        failedSample: failed.slice(0, 3),
        durationMs: Date.now() - batchOpStartTime,
      }, 'Daytona batch write complete');
    } else {
      // FAST BATCH WRITE: Use tar-based upload (10x faster than exec-based)
      // Single network round trip for all files
      try {
        await fastWriteFiles(entry.id, sanitizedFiles);
        logger.info({ projectId, fileCount: sanitizedFiles.length, durationMs: Date.now() - batchOpStartTime }, 'batch write complete');
      } catch (tarError: any) {
        // Fallback to exec-based write if tar fails
        logger.warn({ err: tarError }, 'FastWrite: tar-based batch write failed, falling back to exec');
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
    }

    // Tell FileWatcher to ignore these paths on the next poll cycle
    fileWatcher.excludeWrittenPaths(projectId, sanitizedFiles.map((f: { path: string }) => f.path));

    // PERFORMANCE: Invalidate cache for all written files
    for (const file of sanitizedFiles) {
      fileCache.invalidate(projectId, file.path);
    }

    // Notify auto-restore that user made file changes (gives more retry attempts)
    devServerManager.onFileChange(projectId);

    if (isDaytonaSandbox(entry) && sanitizedFiles.length > 0 && bootstrapPreview === true) {
      try {
        const bootstrap = await bootstrapDaytonaPreview(projectId, entry as any);
        if (bootstrap.ready && bootstrap.port) {
          entry.port = bootstrap.port;
          entry.backgroundDev = true;
          if (bootstrap.previewUrl) {
            (entry as any).daytonaPreviewUrl = bootstrap.previewUrl;
          }
          persistContainers();
        }
      } catch (bootstrapErr: any) {
        logger.warn({ projectId, err: bootstrapErr?.message || bootstrapErr }, 'daytona preview bootstrap skipped after batch write');
      }
    }

    // Record successful batch write
    metricsCollector.recordFileOperation({
      operation: 'batch_write',
      projectId,
      success: failedFiles.length === 0,
      durationMs: Date.now() - batchOpStartTime,
      fileCount: sanitizedFiles.length,
    });

    // ── Sprint E/F deep wiring: auto-index + meter every file in batch ──
    for (const file of sanitizedFiles as Array<{ path: string; content: string }>) {
      codeSearchIndexFile({ projectId, filePath: file.path, content: file.content }).catch(() => {});
      meiliIndexFile({ projectId, path: file.path, content: file.content }).catch(() => {});
      trackFileOp({
        userId: req.userId ?? 'anonymous',
        projectId,
        operation: 'write',
        filePath: file.path,
        sizeBytes: Buffer.byteLength(file.content ?? '', 'utf8'),
      });
    }

    try {
      await syncProjectSnapshotDelta({
        projectId,
        userId: req.userId,
        files: Object.fromEntries(
          sanitizedFiles.map((file: { path: string; content: string }) => [file.path, file.content]),
        ),
        addDirectories: Array.from(
          new Set(
            sanitizedFiles
              .map((file: { path: string }) => file.path.substring(0, file.path.lastIndexOf('/')))
              .filter(Boolean),
          ),
        ),
      });
    } catch (snapshotErr: any) {
      logger.warn({ projectId, err: snapshotErr?.message || snapshotErr }, 'project snapshot sync skipped after batch write');
    }

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

    const entry = await getOrRecoverContainer(projectId);
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

    let content: string;

    if (isDaytonaSandbox(entry)) {
      // Daytona sandbox — read file via toolbox exec
      content = await daytonaReadFile(entry.id, safePath);
    } else {
      // Docker container — exec cat
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

      // Parse Docker multiplexed stream (with fallback for unexpected formats)
      const raw = Buffer.concat(chunks);
      content = '';
      try {
        let i = 0;
        while (i < raw.length) {
          if (i + 8 > raw.length) break;
          const streamType = raw[i]; // 0=stdin, 1=stdout, 2=stderr
          if (streamType > 2) {
            // Not a valid multiplexed header — treat entire buffer as plain text
            content = raw.toString('utf-8');
            break;
          }
          const size = raw.readUInt32BE(i + 4);
          if (size > raw.length || i + 8 + size > raw.length) {
            // Size exceeds buffer — likely not multiplexed, treat as plain text
            content = raw.toString('utf-8');
            break;
          }
          content += raw.subarray(i + 8, i + 8 + size).toString('utf-8');
          i += 8 + size;
        }
      } catch (parseErr) {
        // Stream parsing failed entirely — fall back to raw text
        content = raw.toString('utf-8');
      }

      // If demux produced nothing but raw buffer had data, use raw text
      if (!content && raw.length > 0) {
        content = raw.toString('utf-8');
      }
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

    const entry = await getOrRecoverContainer(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();

    if (isDaytonaSandbox(entry)) {
      // Daytona sandbox — delete via toolbox exec
      await daytonaDeleteFile(entry.id, safePath);
    } else {
      // Docker container
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
    }

    // PERFORMANCE: Invalidate cache on delete
    fileCache.invalidate(projectId, safePath);

    try {
      await syncProjectSnapshotDelta({
        projectId,
        userId: req.userId,
        removePathPrefixes: [safePath],
        removeDirectories: [safePath],
      });
    } catch (snapshotErr: any) {
      logger.warn({ projectId, path: safePath, err: snapshotErr?.message || snapshotErr }, 'project snapshot sync skipped after delete');
    }

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

    const entry = await getOrRecoverContainer(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();

    if (isDaytonaSandbox(entry)) {
      // Daytona sandbox — rename via toolbox exec
      await daytonaRenameFile(entry.id, safeOldPath, safeNewPath);
    } else {
      // Docker container
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
    }

    try {
      await syncProjectSnapshotDelta({
        projectId,
        userId: req.userId,
        renamePaths: [{ from: safeOldPath, to: safeNewPath }],
        addDirectories: safeNewPath.includes('/') ? [safeNewPath.substring(0, safeNewPath.lastIndexOf('/'))].filter(Boolean) : [],
      });
    } catch (snapshotErr: any) {
      logger.warn({ projectId, oldPath: safeOldPath, newPath: safeNewPath, err: snapshotErr?.message || snapshotErr }, 'project snapshot sync skipped after rename');
    }

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

    const entry = await getOrRecoverContainer(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();

    if (isDaytonaSandbox(entry)) {
      // Daytona sandbox — mkdir via toolbox exec
      await daytonaCreateFolder(entry.id, safePath);
    } else {
      // Docker container
      const container = docker.getContainer(entry.id);

      // Use array-based exec to prevent injection
      const mkdirExec = await container.exec({
        Cmd: ['mkdir', '-p', `/workspace/${safePath}`],
        AttachStdout: true,
        AttachStderr: true,
      });
      await mkdirExec.start({});
    }

    try {
      await syncProjectSnapshotDelta({
        projectId,
        userId: req.userId,
        addDirectories: [safePath],
      });
    } catch (snapshotErr: any) {
      logger.warn({ projectId, path: safePath, err: snapshotErr?.message || snapshotErr }, 'project snapshot sync skipped after folder create');
    }

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
    const entry = await getOrRecoverContainer(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({ error: 'Container not running', canRetry: true });
    }

    entry.lastActive = Date.now();
    const safePath = sanitizePath(filePath);

    let content: string;

    if (isDaytonaSandbox(entry)) {
      // Daytona sandbox — read via toolbox exec
      content = await daytonaReadFile(entry.id, safePath);
    } else {
      // Docker container
      const container = docker.getContainer(entry.id);
      const fullPath = `/workspace/${safePath}`;

      const exec = await container.exec({
        Cmd: ['cat', fullPath],
        AttachStdout: true,
        AttachStderr: true,
      });
      const stream = await exec.start({});
      const chunks: Buffer[] = [];

      await new Promise<void>((resolve) => {
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', resolve);
      });

      // Parse Docker multiplexed stream (with fallback for unexpected formats)
      const raw = Buffer.concat(chunks);
      content = '';
      try {
        let i = 0;
        while (i < raw.length) {
          if (i + 8 > raw.length) break;
          const streamType = raw[i];
          if (streamType > 2) {
            content = raw.toString('utf-8');
            break;
          }
          const size = raw.readUInt32BE(i + 4);
          if (size > raw.length || i + 8 + size > raw.length) {
            content = raw.toString('utf-8');
            break;
          }
          content += raw.subarray(i + 8, i + 8 + size).toString('utf-8');
          i += 8 + size;
        }
      } catch (parseErr) {
        content = raw.toString('utf-8');
      }

      if (!content && raw.length > 0) {
        content = raw.toString('utf-8');
      }
    }

    res.json({ content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Workspace state - used to skip re-restoring files on refresh
app.get('/api/workspace-state/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const entry = await getOrRecoverContainer(projectId);

  if (!entry) {
    return res.status(404).json({ hasFiles: false, fileCount: 0, hasPackageJson: false, devServerRunning: false });
  }

  try {
    // Daytona sandbox — get workspace state via toolbox exec
    if (isDaytonaSandbox(entry)) {
      const state = await daytonaGetWorkspaceState(entry.id, entry.daytonaPreviewUrl);
      return res.json(state);
    }

    // Docker container
    const container = docker.getContainer(entry.id);

    const countExec = await container.exec({
      Cmd: ['/bin/bash', '-c', 'find /workspace -type f -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | wc -l'],
      AttachStdout: true,
      AttachStderr: true,
    });
    const countStream = await countExec.start({});
    const fileCountRaw = await new Promise<string>((resolve, reject) => {
      let out = '';
      countStream.on('data', (chunk: Buffer) => { out += chunk.subarray(8).toString(); });
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
      pkgStream.on('data', (chunk: Buffer) => { out += chunk.subarray(8).toString(); });
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
    logger.warn({ err: error, projectId }, 'WorkspaceState: failed to inspect workspace');
    return res.json({ hasFiles: false, fileCount: 0, hasPackageJson: false, devServerRunning: false });
  }
});

// Type check a project workspace using tsc
app.post('/api/typecheck/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const entry = await getOrRecoverContainer(projectId);
  if (!entry) return res.status(404).json({ error: 'Container not found' });

  try {
    entry.lastActive = Date.now();

    let tsconfig: string;
    let rawOutput: string;

    if (isDaytonaSandbox(entry)) {
      // Daytona sandbox — typecheck via exec
      const tsconfigResult = await daytonaExec(entry.id,
        'cd /workspace && (test -f tsconfig.app.json && echo "tsconfig.app.json" || (test -f tsconfig.json && echo "tsconfig.json" || echo ""))',
        { timeoutSecs: 10 },
      );
      tsconfig = tsconfigResult.output.trim();
      if (!tsconfig) {
        return res.json({ problems: [], summary: 'No TypeScript config found' });
      }
      const rawResult = await daytonaExec(entry.id,
        `cd /workspace && tsc --noEmit --pretty false -p ${tsconfig} 2>&1 || true`,
        { timeoutSecs: 60 },
      );
      rawOutput = rawResult.output;
    } else {
      // Docker container
      const container = docker.getContainer(entry.id);
      tsconfig = await execCommand(
        container,
        'cd /workspace && (test -f tsconfig.app.json && echo "tsconfig.app.json" || (test -f tsconfig.json && echo "tsconfig.json" || echo ""))'
      );

      if (!tsconfig) {
        return res.json({ problems: [], summary: 'No TypeScript config found' });
      }

      rawOutput = await execCommand(
        container,
        `cd /workspace && tsc --noEmit --pretty false -p ${tsconfig} 2>&1 || true`
      );
    }

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

    const entry = await getOrRecoverContainer(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({ error: 'Container not running', canRetry: true });
    }

    entry.lastActive = Date.now();

    if (isDaytonaSandbox(entry)) {
      const files = await daytonaListFiles(entry.id, safePath);
      return res.json({ files });
    }

    // Docker container
    const container = docker.getContainer(entry.id);

    const escapedPath = safePath.replace(/"/g, '\\"');
    const output = await execCommand(
      container,
      `find "${escapedPath}" -maxdepth 2 \\( -type f -o -type d \\) 2>/dev/null || true`
    );

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
    logger.error({ err, sourceProjectId, targetProjectId }, 'WorkspaceCopy: failed');
    return res.status(500).json({ error: err?.message || 'Workspace copy failed' });
  }
});

// Export project files as ZIP (SECURED)
// Returns file tree with content for export functionality
app.get('/api/export/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const exportStartTime = Date.now();

  try {
    const entry = await getOrRecoverContainer(projectId);
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    // Ensure container is running
    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({ error: 'Container not running', canRetry: true });
    }

    entry.lastActive = Date.now();

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

    // Read file contents in batches
    const files: Array<{ path: string; content: string; type: 'file' }> = [];
    const failed: Array<{ path: string; error: string }> = [];

    if (isDaytonaSandbox(entry)) {
      // Daytona sandbox — use exec to find and read files (Daytona uses /home/daytona/)
      const excludeArgs = excludePatterns.map(p => `-not -path "*/${p}/*" -not -name "${p}"`).join(' ');
      const findResult = await daytonaExec(entry.id,
        `find /home/daytona -type f ${excludeArgs} -size -1M 2>/dev/null`,
        { timeoutSecs: 30 },
      );
      const filePaths = findResult.output.split('\n').filter(Boolean);

      const batchSize = 20;
      for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize);
        const batchPromises = batch.map(async (fullPath) => {
          const relativePath = fullPath.replace('/home/daytona/', '');
          try {
            const content = await daytonaReadFile(entry.id, relativePath);
            if (content.includes('\x00')) return null; // Skip binary
            return { path: '/' + relativePath, content, type: 'file' as const };
          } catch (err: any) {
            failed.push({ path: relativePath, error: err.message });
            return null;
          }
        });
        const results = await Promise.all(batchPromises);
        files.push(...results.filter((f): f is NonNullable<typeof f> => f !== null));
      }
    } else {
      // Docker container
      const container = docker.getContainer(entry.id);

      // Build find command with exclusions
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
            findOutput += rawFind.subarray(idx + 8, idx + 8 + size).toString();
            idx += 8 + size;
          } else break;
        } else break;
      }

      const filePaths = findOutput.split('\n').filter(Boolean);

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
                  content += rawCat.subarray(j + 8, j + 8 + size).toString();
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
    }

    const exportDuration = Date.now() - exportStartTime;
    logger.info({ projectId, fileCount: files.length, durationMs: exportDuration }, 'export complete');

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
    logger.error({ err, projectId }, 'export failed');
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

    const entry = await getOrRecoverContainer(projectId);
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

    // ─── Daytona sandbox exec ───
    if (isDaytonaSandbox(entry)) {
      if (background) {
        // Kill existing dev server, then start in background
        await daytonaExec(entry.id, 'pkill -f "npm run dev|bun run dev|vite|next dev" || true', { timeoutSecs: 5 }).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 1000));
        await daytonaExec(entry.id, `mkdir -p "${cwd}"`, { timeoutSecs: 5 });
        await daytonaExecBackground(entry.id, command, cwd, { projectId });
        logger.info({ projectId }, 'Daytona: dev server started in background');

        // Wait for startup
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check via curl inside sandbox
        let ready = false;
        try {
          const curlResult = await daytonaExec(entry.id,
            'curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || curl -sf -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null || echo "000"',
            { timeoutSecs: 5 },
          );
          const code = parseInt(curlResult.output.trim(), 10);
          ready = code > 0 && code < 500;
        } catch {}

        const currentEntry = containers.get(req.params.projectId);
        if (currentEntry) currentEntry.backgroundDev = true;

        return res.json({
          output: ready ? 'Started in background' : 'Started in background (building...)',
          background: true,
          ready,
          port: entry.port,
        });
      }

      const execStartMs = Date.now();
      const result = await daytonaExec(entry.id, command, { cwd, timeoutSecs: 60 });
      trackSandboxExec({
        userId: req.userId ?? 'anonymous',
        projectId,
        command: command.slice(0, 200),
        durationMs: Date.now() - execStartMs,
        exitCode: result.exitCode ?? 0,
      });
      return res.json({ output: result.output, success: result.exitCode === 0, exitCode: result.exitCode });
    }

    // ─── Docker container exec ───
    const container = docker.getContainer(entry.id);

    // For background commands (like dev servers), start and return immediately
    if (background) {
      // Kill any existing dev server first (exit code 143 is expected and OK)
      await execCommand(container, `pkill -f "npm run dev|bun run dev|vite|next dev" || true`, true).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Use nohup to keep process running in background
      // Ensure cwd exists before cd
      await execCommand(container, `mkdir -p "${cwd}"`);

      // Start the dev server using setsid for proper daemonization
      // NOTE: No & at the end! Docker exec Detach: true handles backgrounding
      // BROWSER=none prevents Vite from trying to open xdg-open (which doesn't exist in Docker)
      // Sanitize command: escape shell metacharacters in the command string
      const sanitizedCommand = command.replace(/[`$\\]/g, '\\$&');
      const startScript = `cd "${cwd.replace(/"/g, '\\"')}" && BROWSER=none exec setsid ${sanitizedCommand} > /tmp/dev.log 2>&1 < /dev/null`;

      const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', startScript],
        AttachStdout: false,
        AttachStderr: false,
        Tty: false,
      });

      await exec.start({ Detach: true });
      logger.info('dev server started in background');

      // Wait a moment for process to initialize
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if npm/vite process is actually running
      try {
        const psCheck = await execCommand(container, `ps aux | grep -E "npm|vite|node" | grep -v grep || echo "No dev server process"`);
        logger.info({ psCheck }, 'process check after 3s');

        if (psCheck.includes('No dev server process')) {
          logger.error('dev server process not found');
          // Read the logs to see what went wrong
          const errorLogs = await execCommand(container, `cat /tmp/dev.log 2>&1 || echo "No logs"`);
          logger.error({ errorLogs }, 'dev server logs');
        } else {
          logger.info('dev server process is running');
        }
      } catch (e) {
        logger.error({ err: e }, 'could not check process status');
      }

      logger.info('dev server process started, performing health check');

      // Wait for dev server to actually respond (up to 30 seconds)
      const portsToCheck = [entry.port + 1, entry.port, entry.port + 4, entry.port + 5, entry.port + 2];
      const healthCheck = await waitForDevServer(portsToCheck, 30000);

      if (healthCheck.ready) {
        logger.info({ port: healthCheck.port }, 'dev server verified');
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
        logger.warn('dev server started but not responding yet, may need more time to build');

        // Check process status even if HTTP not ready
        const psOutput = await execCommand(container, `ps aux | grep -E "vite|next|node" | grep -v grep || echo "No processes found"`).catch(() => 'Error checking processes');
        logger.info({ psOutput }, 'dev server processes');

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

    const dockerExecStartMs = Date.now();
    const output = await execCommand(container, `cd "${cwd}" && ${command}`);
    trackSandboxExec({
      userId: req.userId ?? 'anonymous',
      projectId,
      command: command.slice(0, 200),
      durationMs: Date.now() - dockerExecStartMs,
      exitCode: 0,
    });
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
      logger.info({ errMsg }, 'file not found (expected for new projects)');
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

    logger.error({
      projectId: req.params.projectId,
      command: safeCommand,
      cwd: safeCwd,
      error: errMsg || 'Unknown error',
    }, 'command execution failed');
    res.status(isDockerUnavailable ? 503 : 500).json({
      error: errMsg,
      success: false,
      exitCode,
      output: errMsg,
      canRetry: isDockerUnavailable
    });
  }
});

// ── Pi Coding Agent endpoint (Daytona-native) ──
app.post('/api/pi/:projectId', optionalAuthenticateRequest, flexibleProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const { prompt, model, providerKeys } = (req.body || {}) as {
      prompt?: string;
      model?: string;
      providerKeys?: Record<string, string | undefined>;
    };

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ success: false, error: 'prompt is required' });
    }

    const entry = await getOrRecoverContainer(projectId);
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Sandbox not found' });
    }

    if (!isDaytonaSandbox(entry)) {
      return res.status(400).json({ success: false, error: 'Pi runtime requires a Daytona sandbox' });
    }

    const { promptPiSession } = await import('./a2a/pi-runtime-adapter.js');
    const result = await promptPiSession(projectId, entry.id, prompt, {
      model,
      providerKeys,
    });

    return res.json({
      success: result.success,
      text: result.text,
      filesChanged: result.filesChanged,
    });
  } catch (err: any) {
    logger.error({ err }, 'Pi coding agent error');
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/opencode/:projectId', optionalAuthenticateRequest, flexibleProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const {
      prompt,
      model,
      sessionId,
      continueSession,
      providerKeys,
      forceSandboxLocal = false,
    } = (req.body || {}) as {
      prompt?: string;
      model?: string;
      sessionId?: string;
      continueSession?: boolean;
      providerKeys?: OpencodeSandboxProviderKeys;
      forceSandboxLocal?: boolean;
    };

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ success: false, error: 'prompt is required' });
    }

    const useCentralizedOpencode = !forceSandboxLocal && process.env.OPENCODE_MODE === 'centralized' && !!process.env.OPENCODE_SERVICE_URL;

    // If explicitly configured, route through the centralized opencode service
    if (useCentralizedOpencode) {
      const { handleOpencodeServicePrompt } = await import('./a2a/opencode-service-handler.js');

      // Resolve Daytona sandbox ID for file sync
      const entry = await getOrRecoverContainer(projectId);
      const sandboxId = entry && isDaytonaSandbox(entry) ? entry.id : undefined;

      // BYOK-only for user-triggered coding prompts: never fall back to docker-backend env keys.
      const effectiveProviderKeys = {
        openrouter: (providerKeys as any)?.openrouter,
        openai: (providerKeys as any)?.openai,
        anthropic: (providerKeys as any)?.anthropic,
        google: (providerKeys as any)?.google,
      };

      if (!Object.values(effectiveProviderKeys).some(Boolean)) {
        return res.status(400).json({
          success: false,
          error: 'BYOK provider keys are required for OpenCode prompts',
        });
      }

      logger.info({ projectId, promptLen: prompt.length, sandboxId, model }, 'OpenCode service prompt starting');
      let result;
      try {
        result = await handleOpencodeServicePrompt({
          projectId,
          prompt,
          model,
          providerKeys: effectiveProviderKeys,
          sandboxId,
          readWorkspaceFile: sandboxId
            ? async (path: string) => {
                const { createRecoderOpencodeClient } = await import('@recoder/shared/opencode-client');
                const client = createRecoderOpencodeClient({ baseUrl: process.env.OPENCODE_SERVICE_URL! });
                const content = await client.readFile(path, '/workspace');
                return typeof content === 'string' ? content : JSON.stringify(content);
              }
            : undefined,
          readSandboxFile: sandboxId ? daytonaReadFile : undefined,
          writeSandboxFile: sandboxId ? daytonaWriteFile : undefined,
        });
      } catch (handlerErr: any) {
        logger.error({ projectId, err: handlerErr.message, stack: handlerErr.stack?.slice(0, 300) }, 'OpenCode handler threw');
        return res.status(500).json({ success: false, error: handlerErr.message });
      }
      logger.info({ projectId, success: result.success, textLen: result.text?.length }, 'OpenCode service prompt completed');
      return res.json({
        success: result.success,
        sessionId: result.sessionId,
        text: result.text,
        output: result.output,
        syncedFiles: result.syncedFiles,
      });
    }

    const entry = await getOrRecoverContainer(projectId);
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Container not found. Create a project first.' });
    }

    const containerStatus = await ensureContainerRunning(entry, projectId);
    if (!containerStatus.running) {
      return res.status(503).json({
        success: false,
        error: containerStatus.error || 'Container could not be started',
        canRetry: true,
      });
    }

    entry.lastActive = Date.now();

    if (isDaytonaSandbox(entry)) {
      const effectiveProviderKeys = {
        openrouter: providerKeys?.openrouter,
        openai: providerKeys?.openai,
        anthropic: providerKeys?.anthropic,
        google: providerKeys?.google,
      };

      if (!Object.values(effectiveProviderKeys).some(Boolean)) {
        return res.status(400).json({
          success: false,
          error: 'BYOK provider keys are required for OpenCode prompts',
        });
      }

      const normalizedModel = model?.trim().toLowerCase() || '';
      const selectedProvider = normalizedModel.startsWith('openrouter/')
        ? 'openrouter'
        : normalizedModel.startsWith('openai/')
          ? 'openai'
          : normalizedModel.startsWith('anthropic/')
            ? 'anthropic'
            : normalizedModel.startsWith('google/') || normalizedModel.startsWith('gemini/')
              ? 'google'
              : Object.entries(effectiveProviderKeys).find(([, value]) => typeof value === 'string' && value.length > 0)?.[0];

      const selectedApiKey = selectedProvider
        ? (effectiveProviderKeys as Record<string, string | undefined>)[selectedProvider]
        : undefined;

      if (!selectedProvider || !selectedApiKey) {
        return res.status(400).json({
          success: false,
          error: 'Could not determine a BYOK provider key for the requested OpenCode model',
        });
      }

      const daytonaUrl = (process.env.DAYTONA_SERVER_URL ?? 'http://localhost:3900/api').replace(/\/api\/?$/, '');
      const sandboxExecUrl = `${daytonaUrl}/api/toolbox/${entry.id}/toolbox/process/execute`;
      const { startSession, sendPrompt } = await import('./a2a/opencode-connector.service.js');

      const session = await withTimeout(
        startSession({
          projectId,
          sandboxId: entry.id,
          sandboxExecUrl,
          daytonaApiKey: process.env.DAYTONA_API_KEY ?? '',
          model,
          provider: selectedProvider,
          apiKey: selectedApiKey,
        }),
        SANDBOX_LOCAL_OPENCODE_START_TIMEOUT_MS,
        'Sandbox-local OpenCode session start',
      );

      const result = await withTimeout(
        sendPrompt({
          projectId,
          prompt,
          sandboxExecUrl,
          daytonaApiKey: process.env.DAYTONA_API_KEY ?? '',
        }),
        SANDBOX_LOCAL_OPENCODE_PROMPT_TIMEOUT_MS,
        'Sandbox-local OpenCode prompt',
      );

      const text = result.parts
        .filter((part) => part.type === 'text' || part.type === 'tool-result')
        .map((part) => part.content)
        .filter(Boolean)
        .join('\n\n');

      return res.json({
        success: !result.error,
        sessionId: session.opencodeSessionId || session.id,
        text,
        error: result.error,
        output: JSON.stringify(result),
      });
    }

    const command = buildOpencodeSandboxCommand({
      prompt,
      model,
      sessionId,
      continueSession,
      cwd: '/workspace',
      providerKeys,
    });

    let output = '';
    let exitCode: number | null = 0;

    if (isDaytonaSandbox(entry)) {
      const workDir = entry.daytonaWorkDir || '/workspace';
      const result = await daytonaExec(entry.id, command, {
        cwd: workDir,
        timeoutSecs: 15 * 60,
      });
      output = result.output;
      exitCode = result.exitCode ?? 0;

      if (exitCode !== 0) {
        return res.status(500).json({
          success: false,
          error: output || `OpenCode exited with code ${exitCode}`,
          output,
          exitCode,
        });
      }
    } else {
      const container = docker.getContainer(entry.id);
      output = await execCommand(container, command);
    }

    const parsed = parseOpencodeSandboxOutput(output);

    return res.json({
      success: !parsed.error,
      sessionId: parsed.sessionId,
      text: parsed.text,
      error: parsed.error,
      output,
      exitCode,
    });
  } catch (err: any) {
    logger.error({ error: err.message, stack: err.stack }, 'OpenCode sandbox execution failed');
    return res.status(500).json({
      success: false,
      error: err.message || 'OpenCode sandbox execution failed',
    });
  }
});

// Read dev server logs
app.get('/api/logs/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const entry = await getOrRecoverContainer(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const tail = Math.min(parseInt(req.query.tail as string) || 100, 1000); // Cap at 1000 lines
    const source = req.query.source as string | undefined;

    // Daytona sandbox — get logs via exec
    if (isDaytonaSandbox(entry)) {
      const logs = await daytonaGetLogs(entry.id, tail);
      return res.json({ logs });
    }

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
    const entry = await getOrRecoverContainer(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();
    const tail = Math.min(parseInt(req.query.tail as string) || 100, 1000);
    const source = req.query.source as string | undefined;

    // Daytona sandbox — get logs via exec
    let logs: string;
    if (isDaytonaSandbox(entry)) {
      logs = await daytonaGetLogs(entry.id, tail);
    } else {
      logs = await devServerManager.getLogs(entry.id, projectId, tail, source);
    }

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
    const entry = await getOrRecoverContainer(projectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    entry.lastActive = Date.now();

    // Get recent logs
    const tail = Math.min(parseInt(req.query.tail as string) || 200, 1000); // Cap at 1000 lines
    let logs: string;
    if (isDaytonaSandbox(entry)) {
      logs = await daytonaGetLogs(entry.id, tail);
    } else {
      logs = await devServerManager.getLogs(entry.id, projectId, tail);
    }

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
        logger.info({ projectId }, 'AutoRestore: blocking errors detected, attempting restore');
        autoRestoreResult = await autoRestoreManager.attemptRestore(entry.id, projectId);
        if (autoRestoreResult.success) {
          logger.info({ restoredTo: autoRestoreResult.restoredTo }, 'AutoRestore: successfully restored');
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
    const entry = await getOrRecoverContainer(projectId);
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

    if (!isLikelySandboxProjectId(safeProjectId)) {
      return res.status(400).json({ error: 'Invalid sandbox project ID' });
    }

    // Verify ownership (skip in non-strict mode for web IDE)
    if (STRICT_AUTH) {
      const isOwner = await checkProjectOwnership(req.userId!, safeProjectId);
      if (!isOwner) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const entry = await getOrRecoverContainer(safeProjectId);
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

    const result = await devServerManager.start(entry.id, safeProjectId, framework, ports, {
      daytona: isDaytonaSandbox(entry),
      daytonaPreviewUrl: (entry as any).daytonaPreviewUrl,
    });
    entry.backgroundDev = true;

    // Update container entry with the actual port detected by the dev server
    if (result.ready && result.port) {
      entry.port = result.port;
      if (isDaytonaSandbox(entry)) {
        const preview = await getDaytonaPreviewAccess(entry.id, result.port);
        const effectivePreviewUrl = preview.url;
        try {
          await updateShareTarget(safeProjectId, result.port);
        } catch (zrokErr) {
          logger.debug({ err: zrokErr, projectId: safeProjectId, port: result.port }, 'Zrok target update skipped');
        }
        (entry as any).daytonaPreviewUrl = effectivePreviewUrl;
        logger.info({ projectId: safeProjectId, port: result.port, previewUrl: effectivePreviewUrl }, 'Updated preview URL to actual dev server port');
      }
      persistContainers();
    }

    res.json({
      ...result,
      previewUrl: isDaytonaSandbox(entry) ? (entry as any).daytonaPreviewUrl : undefined,
    });
  } catch (err: any) {
    logger.error({ err }, 'dev server start failed');
    res.status(500).json({ error: err.message });
  }
});

// Stop dev server
app.post('/api/dev-server/stop', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  try {
    const { projectId } = req.body;
    const safeProjectId = sanitizeProjectId(projectId);

    if (!isLikelySandboxProjectId(safeProjectId)) {
      return res.status(400).json({ error: 'Invalid sandbox project ID' });
    }

    // Verify ownership (skip in non-strict mode)
    if (STRICT_AUTH) {
      const isOwner = await checkProjectOwnership(req.userId!, safeProjectId);
      if (!isOwner) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const entry = containers.get(safeProjectId);
    if (!entry) return res.status(404).json({ error: 'Container not found' });

    auditLog({
      userId: req.userId,
      action: 'DEV_SERVER_STOP',
      projectId: safeProjectId,
      ip: req.ip,
    });

    const success = await devServerManager.stop(entry.id, safeProjectId, isDaytonaSandbox(entry));
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

    if (!isLikelySandboxProjectId(safeProjectId)) {
      return res.status(400).json({ error: 'Invalid sandbox project ID' });
    }

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
    const entry = await getOrRecoverContainer(projectId);
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
    const entry = await getOrRecoverContainer(projectId);
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

    if (!isLikelySandboxProjectId(safeProjectId)) {
      return res.status(400).json({ error: 'Invalid sandbox project ID' });
    }

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
    logger.error({ err }, 'force retry failed');
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
// Extracted to ./routes/snapshot.routes.ts (see createSnapshotRouter)
// ============================================================
app.use(createSnapshotRouter({
  authenticateRequest,
  verifyProjectOwnership,
  sanitizeProjectId,
  sanitizePath,
  getOrRecoverContainer,
  auditLog,
  logger,
}));

// Keep-alive / reset timer endpoint
app.post('/api/keep-alive/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = sanitizeProjectId(req.params.projectId);
    const entry = await getOrRecoverContainer(projectId);
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
// Helper: Wait for dev server to be ready (HTTP health check)
async function waitForDevServer(ports: number[], maxWaitMs = 60000): Promise<{ ready: boolean; port?: number }> {
  const startTime = Date.now();
  const checkInterval = 1000; // Check every 1 second

  logger.info({ ports }, 'waiting for dev server');

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
          logger.info({ port }, 'dev server responding');
          return { ready: true, port };
        }
      } catch {
        // Continue checking
      }
    }

    // Log progress every 5 seconds
    const elapsed = Date.now() - startTime;
    if (elapsed % 5000 < checkInterval) {
      logger.info({ elapsedSec: Math.round(elapsed / 1000) }, 'still waiting for dev server');
    }

    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  logger.info({ maxWaitMs }, 'dev server health check timeout');
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

    // Route cleanup through Daytona if this is a known sandbox
    if (daytonaSandboxIds.has(containerId)) {
      await daytonaDeleteSandbox(containerId).catch(() => {});
      daytonaSandboxIds.delete(containerId);
    } else {
      const container = docker.getContainer(containerId);
      await container.stop().catch(() => {});
      await container.remove().catch(() => {});
    }
    const entry = await getOrRecoverContainer(projectId);
    if (entry) {
      releasePorts(entry.port, entry.ptyPort);
      if (entry.userId) {
        unregisterUserContainer(entry.userId, projectId);
      }
      containers.delete(projectId);
    }
    logger.info({ projectId }, 'Lifecycle: cleaned up container');
  } catch (error: any) {
    logger.error({ err: error }, 'Lifecycle: cleanup error');
  }
});

// Terminal test route (requires auth in production)
app.get('/terminal-test/:projectId', authenticateRequest, (req: AuthenticatedRequest, res) => {
  logger.info({ projectId: req.params.projectId, userId: req.userId }, 'Terminal-Test: HTTP request');
  res.json({ status: 'ok', projectId: req.params.projectId });
});

// Log all upgrade attempts
app.use((req, _res, next) => {
  if (req.headers.upgrade === 'websocket') {
    logger.info({ method: req.method, url: req.url, origin: req.headers.origin || 'unknown' }, 'WebSocket upgrade request');
  }
  next();
});

app.ws('/terminal/:projectId', async (ws: WebSocket, req: express.Request) => {
  const { projectId } = req.params;
  const terminalId = req.query.terminalId as string || `term-${Date.now()}`;

  if (!isLikelySandboxProjectId(projectId)) {
    ws.close(1008, 'Invalid sandbox project ID');
    return;
  }

  logger.info({ projectId, terminalId }, 'Terminal: WebSocket connection attempt');
  logger.info({ origin: req.headers.origin, ip: req.ip }, 'Terminal: connection details');

  // Authenticate WebSocket connection
  logger.info('Terminal: authenticating');
  const authSession = await authenticateWebSocket(ws, req);
  if (!authSession) {
    logger.info({ projectId }, 'Terminal: auth failed');
    return; // Connection closed by auth helper
  }
  logger.info({ userId: authSession.userId }, 'Terminal: auth success');

  // Register for WebSocket keepalive (ping/pong every 30s, timeout after 60s)
  wsKeepalive.register(ws as any, projectId, 'terminal', authSession.userId);

  // Register for WebSocket rate limiting
  const terminalRateLimiter = getWsRateLimiter('terminal');
  terminalRateLimiter.track(ws as any);

  // Use centralized recovery that handles both Docker and Daytona sandboxes
  let entry = await getOrRecoverContainer(projectId);

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
    // ════════════════════════════════════════════════════════════
    // Daytona Sandbox Terminal
    // ════════════════════════════════════════════════════════════
    // Uses a shell wrapper script inside the sandbox that provides:
    //   - Persistent cwd, environment, and aliases across commands
    //   - Streaming output via a temp file + background polling
    //   - Tab completion support via compgen
    //   - Command history (local buffer + arrow key navigation)
    //   - Ctrl-C to abort running commands
    //   - Proper ANSI escape handling for terminal display
    if (isDaytonaSandbox(entry)) {
      const sandboxId = entry.id;
      logger.info({ projectId, terminalId, sandboxId: sandboxId.slice(0, 12) }, 'Terminal: Daytona sandbox terminal');

      // ── State ──
      let currentCwd = '/workspace';
      let cmdBuffer = '';
      let cursorPos = 0;  // cursor position within cmdBuffer
      let isExecuting = false;
      let abortRequested = false;
      const cmdHistory: string[] = [];
      let historyIdx = -1;  // -1 = not browsing history
      let savedPartialCmd = '';  // partial command saved when entering history
      const envExports: string[] = [];  // accumulated export statements

      const sendOutput = (text: string) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(Buffer.from(text, 'utf-8'));
        }
      };

      // Determine initial cwd — prefer /workspace if it exists, else /home/daytona
      try {
        const cwdCheck = await daytonaExec(sandboxId, 'test -d /workspace && echo yes || echo no', { timeoutSecs: 5 });
        if (cwdCheck.output.trim() === 'yes') {
          currentCwd = '/workspace';
        } else {
          currentCwd = '/home/daytona';
        }
      } catch {
        currentCwd = '/home/daytona';
      }

      // Helper: build shell preamble that restores cwd + env
      const shellPreamble = () => {
        const parts = [`cd "${currentCwd}" 2>/dev/null || cd /`];
        for (const exp of envExports) {
          parts.push(exp);
        }
        return parts.join(' && ') + ' && ';
      };

      // Helper: format cwd for prompt
      const formatPrompt = () => {
        let shortCwd = currentCwd;
        if (currentCwd === '/workspace') shortCwd = '~';
        else if (currentCwd.startsWith('/workspace/')) shortCwd = '~/' + currentCwd.slice('/workspace/'.length);
        else if (currentCwd === '/home/daytona') shortCwd = '~';
        else if (currentCwd.startsWith('/home/daytona/')) shortCwd = '~/' + currentCwd.slice('/home/daytona/'.length);
        return `\x1b[1;32m${shortCwd}\x1b[0m $ `;
      };

      // Helper: redraw the current line (after cursor movement, history nav, etc.)
      const redrawLine = () => {
        // Move to column 0, clear line, print prompt + buffer, reposition cursor
        const prompt = formatPrompt();
        // Use raw ANSI: \r = carriage return, \x1b[K = clear to end of line
        sendOutput(`\r\x1b[K${prompt}${cmdBuffer}`);
        // If cursor is not at end, move it back
        const charsFromEnd = cmdBuffer.length - cursorPos;
        if (charsFromEnd > 0) {
          sendOutput(`\x1b[${charsFromEnd}D`);
        }
      };

      // Helper: execute a command with streaming output
      const executeCommand = async (cmd: string) => {
        isExecuting = true;
        abortRequested = false;

        try {
          // Detect state-modifying commands and handle specially
          const trimmedCmd = cmd.trim();

          // Handle bare "cd" or "cd ~"
          if (trimmedCmd === 'cd' || trimmedCmd === 'cd ~') {
            const homeCheck = await daytonaExec(sandboxId, 'test -d /workspace && echo /workspace || echo /home/daytona', { timeoutSecs: 5 });
            currentCwd = homeCheck.output.trim() || '/workspace';
            return;
          }

          // Handle "cd <path>"
          const cdMatch = trimmedCmd.match(/^cd\s+(.+)/);
          if (cdMatch) {
            const target = cdMatch[1].replace(/^['"]|['"]$/g, '').replace(/~/, currentCwd === '/workspace' ? '/workspace' : '/home/daytona');
            const absTarget = target.startsWith('/') ? target : `${currentCwd}/${target}`;
            const result = await daytonaExec(sandboxId, `cd "${absTarget}" 2>/dev/null && pwd`, { cwd: currentCwd, timeoutSecs: 5 });
            if (result.exitCode === 0 && result.output.trim()) {
              currentCwd = result.output.trim().split('\n').pop()!.trim();
            } else {
              sendOutput(`bash: cd: ${cdMatch[1]}: No such file or directory\r\n`);
            }
            return;
          }

          // Handle "export VAR=val" — persist in envExports
          const exportMatch = trimmedCmd.match(/^export\s+(\S+=.*)$/);
          if (exportMatch) {
            envExports.push(`export ${exportMatch[1]}`);
            // Also execute to validate
            await daytonaExec(sandboxId, `${shellPreamble()} export ${exportMatch[1]}`, { timeoutSecs: 5 });
            return;
          }

          // Handle "clear"
          if (trimmedCmd === 'clear' || trimmedCmd === 'reset') {
            sendOutput('\x1bc');
            return;
          }

          // ── Execute command with streaming output ──
          // For long-running commands, we background the process and poll
          // a temp output file. For fast commands (<2s), we skip polling
          // and use the direct exec result for simplicity.
          const outputFile = `/tmp/.term_out_${terminalId.replace(/[^a-zA-Z0-9]/g, '_')}`;
          const pidFile = `/tmp/.term_pid_${terminalId.replace(/[^a-zA-Z0-9]/g, '_')}`;

          // Build backgrounded command that writes output to temp file
          const bgCmd = `${shellPreamble()} (${cmd}) > "${outputFile}" 2>&1; echo "___EXIT:$?:EXIT___" >> "${outputFile}"`;

          // Start the command as a background daemon so we can poll output
          const daemonCmd = `nohup sh -c '${bgCmd.replace(/'/g, "'\\''")}'  &  echo $! > "${pidFile}"`;

          // Clear output files and start daemon
          await daytonaExec(sandboxId, `> "${outputFile}"; > "${pidFile}"`, { timeoutSecs: 5 }).catch(() => {});
          await daytonaExec(sandboxId, daemonCmd, { timeoutSecs: 10 }).catch(() => {});

          // Poll the output file for streaming results
          let lastReadPos = 0;
          let exitCode: number | null = null;
          let pollCount = 0;
          const MAX_POLLS = 600; // 60 seconds at 100ms interval

          const pollOutput = async (): Promise<boolean> => {
            if (ws.readyState !== ws.OPEN || abortRequested) return true;

            try {
              const readResult = await daytonaExec(sandboxId,
                `tail -c +${lastReadPos + 1} "${outputFile}" 2>/dev/null`,
                { timeoutSecs: 5 },
              );
              if (readResult.output && readResult.output.length > 0) {
                let chunk = readResult.output;

                // Check for exit marker
                const exitMatch = chunk.match(/___EXIT:(\d+):EXIT___\n?$/);
                if (exitMatch) {
                  exitCode = parseInt(exitMatch[1], 10);
                  chunk = chunk.replace(/___EXIT:\d+:EXIT___\n?$/, '');
                }

                if (chunk) {
                  lastReadPos += Buffer.byteLength(readResult.output, 'utf-8');
                  // Convert \n to \r\n for terminal display
                  sendOutput(chunk.replace(/\n/g, '\r\n'));
                }

                if (exitCode !== null) return true; // command finished
              }
            } catch {
              // Non-fatal polling error
            }
            return false;
          };

          // Poll loop — await each iteration for proper backpressure
          const startPoll = Date.now();
          while (pollCount < MAX_POLLS) {
            const done = await pollOutput();
            if (done) break;
            pollCount++;
            // Adaptive polling: fast at first (50ms), slower after 5s (200ms)
            const elapsed = Date.now() - startPoll;
            await new Promise(r => setTimeout(r, elapsed < 5000 ? 50 : 200));
          }

          // If we timed out on polling, do one final read
          if (exitCode === null) {
            await pollOutput();
          }

          // If nothing was captured via file (fast command or file write race),
          // run the command directly as a fallback
          if (lastReadPos === 0 && exitCode === null) {
            try {
              const directResult = await daytonaExec(sandboxId,
                `${shellPreamble()} ${cmd}`,
                { cwd: currentCwd, timeoutSecs: 60 },
              );
              if (directResult.output) {
                sendOutput(directResult.output.replace(/\n/g, '\r\n'));
                if (!directResult.output.endsWith('\n')) sendOutput('\r\n');
              }
            } catch (fallbackErr: any) {
              sendOutput(`Error: ${fallbackErr.message}\r\n`);
            }
          }

          // Clean up temp files (best-effort, non-blocking)
          daytonaExec(sandboxId, `rm -f "${outputFile}" "${pidFile}" 2>/dev/null`, { timeoutSecs: 5 }).catch(() => {});

          // After command execution, re-read cwd in case the command changed it
          // (e.g., a script that calls cd, or pushd/popd)
          try {
            const cwdResult = await daytonaExec(sandboxId, `${shellPreamble()} pwd`, { timeoutSecs: 5 });
            if (cwdResult.exitCode === 0 && cwdResult.output.trim()) {
              currentCwd = cwdResult.output.trim().split('\n').pop()!.trim();
            }
          } catch { /* keep existing cwd */ }

        } finally {
          isExecuting = false;
        }
      };

      // Helper: tab completion via compgen
      const handleTabCompletion = async () => {
        const partial = cmdBuffer.slice(0, cursorPos);
        const words = partial.split(/\s+/);
        const lastWord = words[words.length - 1] || '';

        if (!lastWord) return;

        try {
          // Use compgen for bash completions
          const isFirstWord = words.filter(Boolean).length <= 1;
          const compType = isFirstWord ? '-c' : '-f'; // commands for first word, files otherwise
          const result = await daytonaExec(sandboxId,
            `cd "${currentCwd}" 2>/dev/null; compgen ${compType} -- "${lastWord}" 2>/dev/null | head -20`,
            { timeoutSecs: 5 },
          );

          if (result.exitCode !== 0 || !result.output.trim()) return;

          const completions = result.output.trim().split('\n').filter(Boolean);

          if (completions.length === 0) {
            return;
          } else if (completions.length === 1) {
            // Single match — complete it
            const completion = completions[0];
            const suffix = completion.slice(lastWord.length);
            if (suffix) {
              // Insert the completion
              const before = cmdBuffer.slice(0, cursorPos);
              const after = cmdBuffer.slice(cursorPos);
              cmdBuffer = before + suffix + after;
              cursorPos += suffix.length;
              // Check if it's a directory — append /
              if (!isFirstWord) {
                const isDir = await daytonaExec(sandboxId,
                  `cd "${currentCwd}" 2>/dev/null; test -d "${completion}" && echo d || echo f`,
                  { timeoutSecs: 3 },
                ).catch(() => ({ output: 'f', exitCode: 0 }));
                if (isDir.output.trim() === 'd' && !cmdBuffer.endsWith('/')) {
                  cmdBuffer += '/';
                  cursorPos += 1;
                } else if (!cmdBuffer.endsWith(' ')) {
                  cmdBuffer += ' ';
                  cursorPos += 1;
                }
              } else {
                cmdBuffer += ' ';
                cursorPos += 1;
              }
              redrawLine();
            }
          } else {
            // Multiple matches — show them
            sendOutput('\r\n');
            // Format in columns
            const maxLen = Math.max(...completions.map(c => c.length));
            const cols = Math.max(1, Math.floor(80 / (maxLen + 2)));
            for (let i = 0; i < completions.length; i += cols) {
              const row = completions.slice(i, i + cols).map(c => c.padEnd(maxLen + 2)).join('');
              sendOutput(row + '\r\n');
            }
            // Find common prefix to extend
            let commonPrefix = completions[0];
            for (const c of completions) {
              while (!c.startsWith(commonPrefix)) {
                commonPrefix = commonPrefix.slice(0, -1);
              }
            }
            if (commonPrefix.length > lastWord.length) {
              const suffix = commonPrefix.slice(lastWord.length);
              const before = cmdBuffer.slice(0, cursorPos);
              const after = cmdBuffer.slice(cursorPos);
              cmdBuffer = before + suffix + after;
              cursorPos += suffix.length;
            }
            redrawLine();
          }
        } catch {
          // Tab completion failure is non-fatal
        }
      };

      // ── Show initial prompt ──
      sendOutput('\r\n' + formatPrompt());

      // Register RPC handlers
      rpc.register('terminal.resize', async () => ({ success: true }));
      rpc.register('terminal.clear', async () => { sendOutput('\x1bc'); return { success: true }; });
      rpc.register('terminal.kill', async () => {
        if (isExecuting) {
          abortRequested = true;
          // Try to kill the running process in the sandbox
          const pidFile = `/tmp/.term_pid_${terminalId.replace(/[^a-zA-Z0-9]/g, '_')}`;
          try {
            await daytonaExec(sandboxId, `kill -TERM $(cat "${pidFile}" 2>/dev/null) 2>/dev/null || true`, { timeoutSecs: 3 });
          } catch { /* ignore */ }
        }
        return { success: true };
      });
      rpc.register('terminal.saveHistory', async () => ({ success: true }));
      rpc.register('terminal.getHistory', async () => ({ history: cmdHistory.slice(-100) }));
      rpc.register('resetTimer', async () => { lifecycleManager.resetTimer(projectId); return { success: true }; });

      // ── ANSI escape sequence buffer for multi-byte sequences ──
      let escapeBuffer = '';

      ws.on('message', async (data: Buffer | string) => {
        if (!terminalRateLimiter.allowMessage(ws as any)) return;
        entry!.lastActive = Date.now();
        lifecycleManager.resetTimer(projectId);

        const text = typeof data === 'string' ? data : data.toString('utf-8');

        // Handle JSON messages (ping/pong, RPC)
        if (typeof data === 'string') {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
              return;
            }
            const handled = await rpc.handleMessage(JSON.stringify(parsed));
            if (handled) return;
          } catch {
            // Not JSON — treat as terminal input
          }
        }

        // If a command is executing, only handle Ctrl-C
        if (isExecuting) {
          for (const ch of text) {
            if (ch === '\x03') {
              abortRequested = true;
              sendOutput('^C');
              const pidFile = `/tmp/.term_pid_${terminalId.replace(/[^a-zA-Z0-9]/g, '_')}`;
              daytonaExec(sandboxId, `kill -INT $(cat "${pidFile}" 2>/dev/null) 2>/dev/null || true`, { timeoutSecs: 3 }).catch(() => {});
            }
          }
          return;
        }

        // Process input characters
        let i = 0;
        while (i < text.length) {
          const ch = text[i];

          // Handle ANSI escape sequences (arrow keys, etc.)
          if (escapeBuffer) {
            escapeBuffer += ch;
            i++;

            // CSI sequences: ESC [ ... (final byte is 0x40-0x7e)
            if (escapeBuffer.length >= 3 && escapeBuffer[1] === '[') {
              const finalByte = escapeBuffer.charCodeAt(escapeBuffer.length - 1);
              if (finalByte >= 0x40 && finalByte <= 0x7e) {
                // Complete CSI sequence
                const seq = escapeBuffer;
                escapeBuffer = '';

                if (seq === '\x1b[A') {
                  // Up arrow — previous history
                  if (cmdHistory.length > 0) {
                    if (historyIdx === -1) {
                      savedPartialCmd = cmdBuffer;
                      historyIdx = cmdHistory.length - 1;
                    } else if (historyIdx > 0) {
                      historyIdx--;
                    }
                    cmdBuffer = cmdHistory[historyIdx];
                    cursorPos = cmdBuffer.length;
                    redrawLine();
                  }
                } else if (seq === '\x1b[B') {
                  // Down arrow — next history / restore partial
                  if (historyIdx !== -1) {
                    if (historyIdx < cmdHistory.length - 1) {
                      historyIdx++;
                      cmdBuffer = cmdHistory[historyIdx];
                    } else {
                      historyIdx = -1;
                      cmdBuffer = savedPartialCmd;
                      savedPartialCmd = '';
                    }
                    cursorPos = cmdBuffer.length;
                    redrawLine();
                  }
                } else if (seq === '\x1b[C') {
                  // Right arrow
                  if (cursorPos < cmdBuffer.length) {
                    cursorPos++;
                    sendOutput('\x1b[C');
                  }
                } else if (seq === '\x1b[D') {
                  // Left arrow
                  if (cursorPos > 0) {
                    cursorPos--;
                    sendOutput('\x1b[D');
                  }
                } else if (seq === '\x1b[H' || seq === '\x1b[1~') {
                  // Home
                  if (cursorPos > 0) {
                    sendOutput(`\x1b[${cursorPos}D`);
                    cursorPos = 0;
                  }
                } else if (seq === '\x1b[F' || seq === '\x1b[4~') {
                  // End
                  if (cursorPos < cmdBuffer.length) {
                    sendOutput(`\x1b[${cmdBuffer.length - cursorPos}C`);
                    cursorPos = cmdBuffer.length;
                  }
                } else if (seq === '\x1b[3~') {
                  // Delete key
                  if (cursorPos < cmdBuffer.length) {
                    cmdBuffer = cmdBuffer.slice(0, cursorPos) + cmdBuffer.slice(cursorPos + 1);
                    redrawLine();
                  }
                }
                // Other CSI sequences are ignored
              }
              // If not a final byte, keep accumulating
              continue;
            }

            // If escape buffer is getting too long without completion, flush it
            if (escapeBuffer.length > 6) {
              escapeBuffer = '';
            }
            continue;
          }

          // ESC starts an escape sequence
          if (ch === '\x1b') {
            escapeBuffer = '\x1b';
            i++;
            continue;
          }

          // Enter — execute command
          if (ch === '\r' || ch === '\n') {
            i++;
            sendOutput('\r\n');
            const cmd = cmdBuffer.trim();
            cmdBuffer = '';
            cursorPos = 0;
            historyIdx = -1;
            savedPartialCmd = '';

            if (cmd) {
              // Add to history (deduplicate consecutive)
              if (cmdHistory.length === 0 || cmdHistory[cmdHistory.length - 1] !== cmd) {
                cmdHistory.push(cmd);
                if (cmdHistory.length > 500) cmdHistory.shift();
              }

              await executeCommand(cmd);
            }

            sendOutput(formatPrompt());
            continue;
          }

          // Tab — completion
          if (ch === '\t') {
            i++;
            await handleTabCompletion();
            continue;
          }

          // Backspace
          if (ch === '\x7f' || ch === '\b') {
            i++;
            if (cursorPos > 0) {
              cmdBuffer = cmdBuffer.slice(0, cursorPos - 1) + cmdBuffer.slice(cursorPos);
              cursorPos--;
              redrawLine();
            }
            continue;
          }

          // Ctrl-C
          if (ch === '\x03') {
            i++;
            cmdBuffer = '';
            cursorPos = 0;
            historyIdx = -1;
            sendOutput('^C\r\n' + formatPrompt());
            continue;
          }

          // Ctrl-L — clear screen
          if (ch === '\x0c') {
            i++;
            sendOutput('\x1bc');
            sendOutput(formatPrompt() + cmdBuffer);
            continue;
          }

          // Ctrl-A — home
          if (ch === '\x01') {
            i++;
            if (cursorPos > 0) {
              sendOutput(`\x1b[${cursorPos}D`);
              cursorPos = 0;
            }
            continue;
          }

          // Ctrl-E — end
          if (ch === '\x05') {
            i++;
            if (cursorPos < cmdBuffer.length) {
              sendOutput(`\x1b[${cmdBuffer.length - cursorPos}C`);
              cursorPos = cmdBuffer.length;
            }
            continue;
          }

          // Ctrl-U — clear line before cursor
          if (ch === '\x15') {
            i++;
            if (cursorPos > 0) {
              cmdBuffer = cmdBuffer.slice(cursorPos);
              cursorPos = 0;
              redrawLine();
            }
            continue;
          }

          // Ctrl-K — clear line after cursor
          if (ch === '\x0b') {
            i++;
            if (cursorPos < cmdBuffer.length) {
              cmdBuffer = cmdBuffer.slice(0, cursorPos);
              redrawLine();
            }
            continue;
          }

          // Ctrl-W — delete word before cursor
          if (ch === '\x17') {
            i++;
            if (cursorPos > 0) {
              const before = cmdBuffer.slice(0, cursorPos);
              const after = cmdBuffer.slice(cursorPos);
              const wordStart = before.replace(/\s+$/, '').lastIndexOf(' ') + 1;
              cmdBuffer = before.slice(0, wordStart) + after;
              cursorPos = wordStart;
              redrawLine();
            }
            continue;
          }

          // Regular printable character
          if (ch.charCodeAt(0) >= 32) {
            i++;
            cmdBuffer = cmdBuffer.slice(0, cursorPos) + ch + cmdBuffer.slice(cursorPos);
            cursorPos++;
            // If inserting in the middle, need to redraw
            if (cursorPos < cmdBuffer.length) {
              redrawLine();
            } else {
              sendOutput(ch);
            }
            continue;
          }

          // Skip other control characters
          i++;
        }
      });

      ws.on('close', () => {
        logger.info({ terminalId, projectId }, 'Daytona terminal session closed');
        terminalSessions.delete(terminalId);
        wsKeepalive.unregister(ws as any);
        terminalRateLimiter.untrack(ws as any);
      });

      // Store session
      session = { pty: null as any, projectId, rpc };
      terminalSessions.set(terminalId, session);
      return; // Skip the Docker terminal setup below
    }

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
    
    logger.info({ terminalId, projectId }, 'terminal session created');

    // Send initial prompt setup
    stream.write('cd /workspace && clear\n');

    // Handle data from container to client
    stream.on('data', (data: Buffer) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    });

    stream.on('error', (err: Error) => {
      logger.error({ err, terminalId }, 'terminal error');
    });

    stream.on('end', () => {
      logger.info({ terminalId }, 'terminal stream ended');
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
      logger.info({ cols, rows }, 'RPC: terminal resize');
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
      logger.info({ terminalId }, 'terminal WebSocket closed');
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
    logger.info({ terminalId }, 'reconnecting to terminal session');
    const stream = session.pty as unknown as Duplex;
    
    // Update RPC reference for reconnected session
    session.rpc = rpc;

    // Re-register RPC handlers
    rpc.register('terminal.resize', async ({ cols, rows }) => {
      logger.info({ cols, rows }, 'RPC: terminal resize');
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
      logger.info({ terminalId }, 'terminal WebSocket closed (reconnectable)');
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
      logger.info({ projectId }, 'Search: container not in memory, attempting recovery');
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
            logger.info({ projectId }, 'Search: recovered container');
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

    const entry = await getOrRecoverContainer(projectId);

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

    const entry = await getOrRecoverContainer(projectId);
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
    logger.error({ err, projectId: req.params.projectId }, 'ProjectType: detection failed');
    res.status(500).json({ error: err.message });
  }
});

// ==================== Package Manager API ====================

app.use(createPackageManagerRouter({
  authenticateRequest,
  verifyProjectOwnership,
  sanitizeProjectId,
  getOrRecoverContainer,
  ensureContainerRunning,
  auditLog,
  logger,
}));

// ==================== End Package Manager API ====================

// ==================== Secrets/Environment Variables API ====================

app.use(createSecretsRouter({
  authenticateRequest,
  verifyProjectOwnership,
  sanitizeProjectId,
  getOrRecoverContainer,
  ensureContainerRunning,
  auditLog,
  logger,
}));

// ==================== End Secrets API ====================

// ==================== Git Operations API ====================
// Extracted to ./routes/git-operations.routes.ts (see createGitOperationsRouter)
// ============================================================
app.use(createGitOperationsRouter({
  authenticateRequest,
  verifyProjectOwnership,
  sanitizeProjectId,
  getOrRecoverContainer,
  auditLog,
  logger,
}));
// ==================== End Git API ====================


// ==================== LSP API ====================
// Extracted to ./routes/lsp.routes.ts (see createLspRouter)
// ============================================================
app.use(createLspRouter({
  authenticateRequest,
  verifyProjectOwnership,
  sanitizeProjectId,
  getOrRecoverContainer,
  auditLog,
  logger,
}));
// ==================== End LSP API ====================

// ==================== Collaboration API ====================

// Get collaboration statistics
app.get('/api/collab/stats', authenticateRequest, (_req: AuthenticatedRequest, res) => {
  try {
    const stats = getCollaborationStats();
    res.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    logger.error({ err }, 'Collab: stats error');
    res.status(500).json({ error: err.message });
  }
});

// ==================== End Collaboration API ====================

// File sync WebSocket (real-time)
app.ws('/sync/:projectId', async (ws: WebSocket, req: express.Request) => {
  const { projectId } = req.params;

  // Authenticate WebSocket connection
  const authSession = await authenticateWebSocket(ws, req);
  if (!authSession) return;

  // Register for WebSocket keepalive (ping/pong every 30s, timeout after 60s)
  wsKeepalive.register(ws as any, projectId, 'sync', authSession.userId);

  // Register for WebSocket rate limiting
  const syncRateLimiter = getWsRateLimiter('sync');
  syncRateLimiter.track(ws as any);

  const entry = await getOrRecoverContainer(projectId);
  if (!entry) {
    wsKeepalive.closeWithHint(ws as any, 'container_not_found', 'Container not found for this project', 1008);
    return;
  }

  const useDaytona = isDaytonaSandbox(entry);
  const container = useDaytona ? null : docker.getContainer(entry.id);

  ws.on('message', async (data) => {
    // Rate limit check
    if (!syncRateLimiter.allowMessage(ws as any)) {
      ws.send(JSON.stringify({ action: 'error', error: 'Rate limit exceeded' }));
      return;
    }

    try {
      entry.lastActive = Date.now();
      const msg = JSON.parse(data.toString());

      if (useDaytona) {
        // Route all file sync operations through Daytona helpers
        if (msg.action === 'write') {
          const relativePath = (msg.path as string).startsWith('/workspace/') ? (msg.path as string).slice('/workspace/'.length) : (msg.path as string).startsWith('/home/daytona/') ? (msg.path as string).slice('/home/daytona/'.length) : msg.path;
          await daytonaWriteFile(entry.id, relativePath, msg.content);
          ws.send(JSON.stringify({ action: 'written', path: msg.path }));
        } else if (msg.action === 'read') {
          const relativePath = (msg.path as string).startsWith('/workspace/') ? (msg.path as string).slice('/workspace/'.length) : (msg.path as string).startsWith('/home/daytona/') ? (msg.path as string).slice('/home/daytona/'.length) : msg.path;
          const content = await daytonaReadFile(entry.id, relativePath).catch(() => '');
          ws.send(JSON.stringify({ action: 'content', path: msg.path, content }));
        } else if (msg.action === 'delete') {
          const relativePath = (msg.path as string).startsWith('/workspace/') ? (msg.path as string).slice('/workspace/'.length) : (msg.path as string).startsWith('/home/daytona/') ? (msg.path as string).slice('/home/daytona/'.length) : msg.path;
          await daytonaDeleteFile(entry.id, relativePath);
          ws.send(JSON.stringify({ action: 'deleted', path: msg.path }));
        } else if (msg.action === 'list') {
          const dirPath = msg.path || '/home/daytona';
          const files = await daytonaListFiles(entry.id, dirPath);
          ws.send(JSON.stringify({ action: 'files', files }));
        }
        return;
      }

      if (msg.action === 'write') {
        const dir = msg.path.substring(0, msg.path.lastIndexOf('/'));
        if (dir) await execCommand(container!, `mkdir -p "${dir}"`);
        const b64 = Buffer.from(msg.content).toString('base64');
        await execCommand(container!, `echo "${b64}" | base64 -d > "${msg.path}"`);
        ws.send(JSON.stringify({ action: 'written', path: msg.path }));
      }

      if (msg.action === 'read') {
        const content = await execCommand(container!, `cat "${msg.path}" 2>/dev/null || echo ""`);
        ws.send(JSON.stringify({ action: 'content', path: msg.path, content }));
      }

      if (msg.action === 'delete') {
        await execCommand(container!, `rm -rf "${msg.path}"`);
        ws.send(JSON.stringify({ action: 'deleted', path: msg.path }));
      }

      if (msg.action === 'list') {
        const output = await execCommand(container!, `find "${msg.path || '/workspace'}" -maxdepth 3 2>/dev/null | head -500`);
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
      out += chunk.subarray(8).toString();
    });
    stream.on('end', () => resolve(out.trim()));
    stream.on('error', reject);
  });

  // Check exit code
  const inspection = await exec.inspect();

  // 🔧 FIX: Exit code 143 (SIGTERM) is OK if explicitly allowed
  // This is normal when killing background processes like dev servers
  if (inspection.ExitCode === 143 && allowTermination) {
    logger.info('process terminated gracefully (exit code 143)');
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

  const entry = await getOrRecoverContainer(projectId);
  if (!entry) {
    return res.status(404).json({ error: 'Container not found. Create a project first.' });
  }

  try {
    entry.lastActive = Date.now();

    const { sessionId, welcomeMessage } = await replManager.startSession(
      projectId,
      entry.id,
      language,
      isDaytonaSandbox(entry)
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
    logger.error({ err, projectId }, 'REPL: start error');
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

  const entry = await getOrRecoverContainer(projectId);
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
    logger.error({ err, projectId }, 'REPL: execute error');
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
    logger.error({ err, projectId }, 'REPL: stop error');
    res.status(500).json({ error: err.message });
  }
});

// Get REPL session status
app.get('/api/repl/:projectId/status', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);
  const language = req.query.language as ReplLanguage | undefined;

  const entry = await getOrRecoverContainer(projectId);
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
    logger.error({ err, projectId }, 'REPL: status error');
    res.status(500).json({ error: err.message });
  }
});

// Get available REPL languages for a project
app.get('/api/repl/:projectId/languages', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const projectId = sanitizeProjectId(req.params.projectId);

  const entry = await getOrRecoverContainer(projectId);
  if (!entry) {
    return res.status(404).json({ error: 'Container not found' });
  }

  try {
    const available = await replManager.getAvailableLanguages(entry.id, isDaytonaSandbox(entry));

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
    logger.error({ err, projectId }, 'REPL: languages error');
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

        if (isDaytonaSandbox(entry)) {
          // Daytona sandbox — stop via Daytona API (don't delete, just stop to save resources)
          daytonaSandboxIds.delete(entry.id);
          unregisterDaytonaId(entry.id);
          await daytonaDeleteSandbox(entry.id).catch(() => {});
        } else {
          // Docker container — stop and remove
          const container = docker.getContainer(entry.id);
          await container.stop().catch(() => {});
          await container.remove().catch(() => {});
          releasePorts(entry.port, entry.ptyPort);
        }

        if (entry.userId) {
          unregisterUserContainer(entry.userId, projectId);
        }
        containers.delete(projectId);
        logger.info({ projectId, daytona: !!entry.daytona }, 'cleaned up idle container');
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
        logger.info({ projectId }, 'Snapshot: compressed and pruned snapshots');
      } catch (err) {
        // Silently ignore errors - compression is best-effort
      }
    }
  }
}, 10 * 60 * 1000); // Run every 10 minutes

// Startup sequence - cleanup THEN pool initialization (in correct order)
async function startupSequence() {
  // Step 1: Cleanup old containers FIRST
  logger.info('Startup: cleaning up old containers');
  try {
    logger.info('Startup: listing containers');
    const allContainers = await docker.listContainers({ all: true });
    logger.info({ count: allContainers.length }, 'Startup: found total containers');

    const recoderContainers = allContainers.filter(c => c.Image === IMAGE_NAME);
    logger.info({ count: recoderContainers.length }, 'Startup: found recoder containers to clean');

    for (const c of recoderContainers) {
      try {
        const projectIdLabel = c.Labels?.projectId;
        const isRunning = c.State === 'running';
        // Keep any running container to avoid breaking active workspaces or pool warmups
        if (isRunning) {
          logger.info({ containerId: c.Id.slice(0, 12), projectIdLabel }, 'Startup: keeping running container');
          continue;
        }
        logger.info({ containerId: c.Id.slice(0, 12) }, 'Startup: removing container');
        const container = docker.getContainer(c.Id);
        await container.stop().catch(() => {});
        await container.remove().catch(() => {});
        logger.info({ containerId: c.Id.slice(0, 12) }, 'Startup: removed container');
      } catch (err: any) {
        logger.error({ err, containerId: c.Id.slice(0, 12) }, 'Startup: failed to remove container');
      }
    }
    logger.info('Startup: cleanup complete');
  } catch (e: any) {
    logger.error({ err: e }, 'Startup: cleanup failed');
  }

  // Step 1.5: Sync port manager with any remaining Docker containers
  logger.info('Startup: syncing port manager with Docker');
  try {
    await syncPortsWithDocker();
    const portStats = getPortStats();
    logger.info({ containerCount: portStats.containerCount, usedPortCount: portStats.usedPortCount }, 'Startup: port manager synced');
  } catch (e: any) {
    logger.error({ err: e }, 'Startup: port sync failed');
  }

  // Step 1.6: Restore running project containers into in-memory registry
  logger.info('Startup: restoring running project containers');
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

    logger.info({ restored }, 'Startup: restored running project containers');
  } catch (e: any) {
    logger.error({ err: e }, 'Startup: container restore failed');
  }

  // Step 2: THEN initialize container pool (after cleanup is done)
  if (ENABLE_CONTAINER_POOL && !PERSIST_WORKSPACE) {
    logger.info('Startup: initializing container pool');
    containerPool.setPortManager(allocatePort, releasePorts);
    try {
      await containerPool.initialize();
      logger.info('Startup: container pool ready');
    } catch (err: any) {
      logger.error({ err }, 'Startup: container pool initialization failed');
    }
  }

  // Step 3: Start health monitoring
  logger.info('Startup: starting health monitor');
  try {
    healthMonitor.start();
    logger.info('Startup: health monitor started');
  } catch (err: any) {
    logger.error({ err }, 'Startup: health monitor failed to start');
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
      logger.info({ containerId: containerId.slice(0, 12), uptimeSec: Math.round(status.uptimeMs/1000) }, 'Health: container has transient error but within grace period, skipping restart');
      return;
    }
    
    // Check cooldown
    const lastRestart = restartCooldowns.get(containerId);
    if (lastRestart && Date.now() - lastRestart < RESTART_COOLDOWN_MS) {
      const waitSecs = Math.round((RESTART_COOLDOWN_MS - (Date.now() - lastRestart)) / 1000);
      logger.info({ containerId: containerId.slice(0, 12), waitSecs }, 'Health: container in restart cooldown, skipping');
      return;
    }
    
    logger.warn({ containerId: containerId.slice(0, 12), reason }, 'Health: container unhealthy');

    // Find the project using this container
    let projectId: string | null = null;
    for (const [pid, entry] of containers) {
      if (entry.id === containerId) {
        projectId = pid;
        break;
      }
    }

    if (!projectId) {
      logger.warn({ containerId: containerId.slice(0, 12) }, 'Health: container not in registry, skipping restart');
      return;
    }

    try {
      const container = docker.getContainer(containerId);
      logger.info({ containerId: containerId.slice(0, 12), projectId }, 'Health: restarting container');
      
      // Set cooldown BEFORE restart to prevent race conditions
      restartCooldowns.set(containerId, Date.now());
      
      await container.restart({ t: 5 }); // 5 second graceful timeout

      // Update last active time
      const entry = await getOrRecoverContainer(projectId);
      if (entry) {
        entry.lastActive = Date.now();
      }

      logger.info({ containerId: containerId.slice(0, 12) }, 'Health: container restarted successfully');

      // Re-launch dev server if it was running before the restart
      if (entry?.backgroundDev) {
        try {
          logger.info({ projectId }, 'Health: re-launching dev server after container restart');
          const ports = [entry.port + 1, entry.port, entry.port + 4, entry.port + 5, entry.port + 2];
          await devServerManager.restart(entry.id, projectId, ports);
          logger.info({ projectId }, 'Health: dev server re-launched');
        } catch (devErr: any) {
          logger.warn({ err: devErr, projectId }, 'Health: failed to re-launch dev server');
        }
      }
    } catch (err: any) {
      logger.error({ err, containerId: containerId.slice(0, 12) }, 'Health: failed to restart container');
    }
  });

  // Step 4: Start resource optimizer
  logger.info('Startup: starting resource optimizer');
  try {
    resourceOptimizer.start();
    logger.info('Startup: resource optimizer started');
  } catch (err: any) {
    logger.error({ err }, 'Startup: resource optimizer failed to start');
  }

  // Step 5: Initialize metering system (metrics collector -> usage aggregator -> quota enforcer)
  logger.info('Startup: initializing metering system');
  try {
    const meteringCollector = getMeteringCollector(docker);
    const usageAggregator = getUsageAggregator();

    // Wire metrics flush from collector into aggregator
    meteringCollector.onMetricsFlush((metrics) => {
      usageAggregator.ingestMetrics(metrics);
    });

    // Start collector and aggregator
    meteringCollector.start();
    usageAggregator.start();

    logger.info('Startup: metering system initialized (collector + aggregator + quota enforcer)');
  } catch (err: any) {
    logger.error({ err }, 'Startup: metering system failed to initialize');
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
    logger.error({ err: error }, 'CLI Sync: link error');
    res.status(500).json({ error: 'Internal server error' });
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
    logger.error({ err: error }, 'CLI Sync: unlink error');
    res.status(500).json({ error: 'Internal server error' });
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
        logger.error({ err: error }, 'CLI Sync: error reading container files');
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
    logger.error({ err: error }, 'CLI Sync: status error');
    res.status(500).json({ error: 'Internal server error' });
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
    logger.error({ err: error }, 'CLI Sync: push error');
    res.status(500).json({ error: 'Internal server error' });
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
    logger.error({ err: error }, 'CLI Sync: pull error');
    res.status(500).json({ error: 'Internal server error' });
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
    logger.error({ err: error }, 'CLI Sync: diff error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// WebSocket endpoint for live sync
const cliSyncClients = new Map<string, Set<WebSocket>>();

app.ws('/cli-sync/:projectId', async (ws: WebSocket, req: express.Request) => {
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

  // Register session with authenticated userId (return value unused; side-effect is the registration)
  syncManager.registerSession({
    projectId: sanitizedProjectId,
    userId: authSession.userId,
    clientId,
  });

  // Add to clients map
  if (!cliSyncClients.has(sanitizedProjectId)) {
    cliSyncClients.set(sanitizedProjectId, new Set());
  }
  cliSyncClients.get(sanitizedProjectId)!.add(ws);

  logger.info({ clientId, projectId: sanitizedProjectId }, 'CLI Sync: client connected');

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
    logger.info({ clientId, projectId: sanitizedProjectId }, 'CLI Sync: client disconnected');
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

// Agent OS MCP host registry endpoints. These must be registered before the
// project-scoped /api/mcp/:projectId/* routes so names like /servers and
// /tools are not interpreted as project IDs.
app.use('/api/mcp', authenticateRequest, createAgentMcpRouter());

// MCP marketplace catalog + project-scoped server lifecycle/tool routes extracted to ./routes/mcp.routes.ts (behavior-preserving move)
app.use(createMcpRouter({ authenticateRequest, verifyProjectOwnership, auditLog, logger }));

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
    logger.info({ localUrl }, 'Tunnel: starting cloudflared tunnel');

    // Check if cloudflared is available (falls back to PATH lookup via `which`)
    const which = spawn('which', ['cloudflared']);
    let cloudflaredPath = 'cloudflared';

    which.stdout.on('data', (data) => {
      cloudflaredPath = data.toString().trim();
    });

    which.on('close', (_code) => {
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
        logger.info({ output: text.trim() }, 'Tunnel: cloudflared stderr');

        // Look for the trycloudflare.com URL
        const urlMatch = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (urlMatch && !resolved) {
          publicUrl = urlMatch[0];
          resolved = true;
          clearTimeout(timeout);
          logger.info({ publicUrl }, 'Tunnel: got public URL');
          resolve({ publicUrl, process: tunnelProcess });
        }
      });

      tunnelProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        logger.info({ output: text.trim() }, 'Tunnel: cloudflared stdout');

        // Sometimes URL appears in stdout
        const urlMatch = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (urlMatch && !resolved) {
          publicUrl = urlMatch[0];
          resolved = true;
          clearTimeout(timeout);
          logger.info({ publicUrl }, 'Tunnel: got public URL');
          resolve({ publicUrl, process: tunnelProcess });
        }
      });

      tunnelProcess.on('error', (err) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          logger.error({ err }, 'Tunnel: cloudflared error');
          reject(new Error(`Failed to start cloudflared: ${err.message}`));
        }
      });

      tunnelProcess.on('close', (exitCode) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          logger.error({ exitCode }, 'Tunnel: cloudflared exited');
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

  const entry = await getOrRecoverContainer(projectId);
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
    const previewBaseUrl = PUBLIC_PREVIEW_URL.replace(/\/+$/, '');
    const localUrl = `${previewBaseUrl}/preview/${projectId}`;

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

        logger.info({ projectId, publicUrl }, 'Tunnel: started cloudflared tunnel');

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
        logger.warn({ err: cloudflaredError }, 'Tunnel: cloudflared failed, falling back to preview URL');
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

    logger.info({ projectId, publicUrl }, 'Tunnel: started preview tunnel');

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
    logger.error({ err: error, projectId }, 'Tunnel: failed to start tunnel');

    activeTunnels.set(projectId, {
      projectId,
      publicUrl: '',
      localPort,
      status: 'error',
      error: 'tunnel_start_failed',
      createdAt: Date.now(),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to start tunnel',
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
        logger.info({ projectId }, 'Tunnel: killed cloudflared process');
      } catch (err) {
        logger.warn({ err }, 'Tunnel: failed to kill cloudflared process');
      }
    }

    tunnel.status = 'stopped';
    activeTunnels.delete(projectId);
    logger.info({ projectId }, 'Tunnel: stopped tunnel');
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
    const entry = await getOrRecoverContainer(projectId);
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
    logger.error({ err, projectId }, 'Expo: failed to get Expo URL');
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
    const entry = await getOrRecoverContainer(projectId);
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
    logger.info({ mode, projectId }, 'Expo: started Expo dev server');

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
    logger.error({ err, projectId }, 'Expo: failed to start');
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

  const entry = await getOrRecoverContainer(projectId);
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
    logger.info({ platform, projectId, profile: safeProfile }, 'EAS: starting build');
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
      logger.error({ buildOutput }, 'EAS: failed to parse build output');
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
    logger.info({ buildId, projectId, platform, profile: safeProfile }, 'EAS: build submitted');

    sendSuccess(res, {
      buildId,
      platform,
      status: buildInfo.status,
      expoProjectUrl,
      profile: safeProfile,
      autoSubmit: buildInfo.autoSubmit,
    });
  } catch (error: any) {
    logger.error({ err: error, projectId }, 'EAS: failed to start build');
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'EAS build failed'));
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
    const entry = await getOrRecoverContainer(projectId);
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
                logger.info({ platform: cached.platform, buildId, projectId }, 'EAS: auto-submitting build');
                await execInContainer(
                  entry!.id,
                  `cd /workspace && EXPO_TOKEN=${safeTokenSubmit} eas submit --platform ${cached.platform} --latest --non-interactive --json 2>&1`,
                );
                cached.submitStatus = 'submitted';
                easBuilds.set(buildId, cached);
                logger.info({ buildId }, 'EAS: auto-submit completed');
              } catch (submitErr: any) {
                cached.submitStatus = 'failed';
                cached.submitError = submitErr.message;
                easBuilds.set(buildId, cached);
                logger.error({ err: submitErr, buildId }, 'EAS: auto-submit failed');
              }
            })();
          }
          easBuilds.set(buildId, cached);
        }
      } catch (err: any) {
        logger.warn({ err, buildId }, 'EAS: failed to poll build status');
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

  const entry = await getOrRecoverContainer(projectId);
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
    logger.info({ projectId, branch: safeBranch }, 'EAS Update: pushing update');

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
      logger.error({ updateOutput }, 'EAS Update: failed to parse update output');
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
    logger.info({ updateId, projectId, branch: safeBranch }, 'EAS Update: update pushed');

    sendSuccess(res, {
      updateId,
      branch: safeBranch,
      message: safeMessage,
      platforms,
      createdAt: updateInfo.createdAt,
      runtimeVersion,
    });
  } catch (error: any) {
    logger.error({ err: error, projectId }, 'EAS Update: failed to push update');
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'EAS update failed'));
  }
}));

// GET /api/eas-updates/:projectId - List update history
app.get('/api/eas-updates/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const expoToken = req.query.expoToken as string;
  const branch = (req.query.branch as string) || 'preview';

  const entry = await getOrRecoverContainer(projectId);

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
        logger.warn({ listOutput: listOutput.slice(0, 300) }, 'EAS Update: failed to parse update list output');
      }
    } catch (err: any) {
      logger.warn({ err, projectId }, 'EAS Update: failed to list updates');
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

  const entry = await getOrRecoverContainer(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    const safeToken = sanitizeShellToken(expoToken);
    const safeBranch = sanitizeShellToken(branch);
    logger.info({ branch: safeBranch, projectId }, 'EAS Update: rolling back');

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

    logger.info({ projectId, branch: safeBranch }, 'EAS Update: rollback completed');

    sendSuccess(res, {
      branch: safeBranch,
      rolled_back: true,
      details: rollbackData,
      raw: rollbackData ? undefined : rollbackOutput.slice(0, 500),
    });
  } catch (error: any) {
    logger.error({ err: error, projectId }, 'EAS Update: rollback failed');
    // Could be that the command isn't available in this EAS CLI version
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'EAS update rollback failed'));
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

  const entry = await getOrRecoverContainer(projectId);
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

    logger.info({ projectId }, 'EAS Share: pushing share update');

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
      logger.error({ updateOutput }, 'EAS Share: failed to parse output');
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
    logger.info({ projectId, updateId }, 'EAS Share: share link created');

    sendSuccess(res, { shareUrl, updateId, branch: 'shared', qrUrl });
  } catch (error: any) {
    logger.error({ err: error, projectId }, 'EAS Share: failed');
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'EAS share failed'));
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
  const { expoToken, platform, buildId } = req.body;

  if (!expoToken || typeof expoToken !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing expoToken.'));
  }
  if (!platform || !['android', 'ios'].includes(platform)) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Invalid platform. Must be "android" or "ios".'));
  }

  const entry = await getOrRecoverContainer(projectId);
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

    logger.info({ platform, projectId }, 'EAS Submit: submitting');

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
    logger.info({ submitId, projectId, platform }, 'EAS Submit: submission completed');

    sendSuccess(res, { submitId, status: submitData?.status || 'submitted', platform });
  } catch (error: any) {
    logger.error({ err: error, projectId }, 'EAS Submit: failed');
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'EAS submit failed'));
  }
}));

startupInfo('routes.eas-submit', 'registered');

// ==================== END EAS SUBMIT ====================

// ==================== APP CONFIG MANAGEMENT ====================

// GET /api/app-config/:projectId - Read app.json expo config from container
app.get('/api/app-config/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;

  const entry = await getOrRecoverContainer(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    const appJsonRaw = await execInContainer(entry.id, 'cat /workspace/app.json 2>/dev/null');
    const appJson = JSON.parse(appJsonRaw);
    sendSuccess(res, appJson.expo || appJson);
  } catch (error: any) {
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'Failed to read app.json'));
  }
}));

// PUT /api/app-config/:projectId - Update app.json expo config
app.put('/api/app-config/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const updates = req.body; // { name?, slug?, version?, icon?, splash?, ios?, android?, scheme? }

  const entry = await getOrRecoverContainer(projectId);
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

    logger.info({ projectId }, 'App Config: updated app.json');
    sendSuccess(res, expoConfig);
  } catch (error: any) {
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'Failed to update app.json'));
  }
}));

// PUT /api/eas-config/:projectId - Update eas.json submit config
app.put('/api/eas-config/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const updates = req.body; // { submit?: { production?: { ios?, android? } } }

  const entry = await getOrRecoverContainer(projectId);
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

    logger.info({ projectId }, 'EAS Config: updated eas.json');
    sendSuccess(res, easJson);
  } catch (error: any) {
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'Failed to update eas.json'));
  }
}));

startupInfo('routes.app-config', 'registered');

// ==================== END APP CONFIG MANAGEMENT ====================

// ==================== BUILT-IN BACKEND SERVICES ====================

// POST /api/backend-db/:projectId/init - Initialize SQLite database in container
app.post('/api/backend-db/:projectId/init', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { schema } = req.body; // optional initial SQL schema

  const entry = await getOrRecoverContainer(projectId);
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

    logger.info({ projectId }, 'Backend DB: initialized SQLite');
    sendSuccess(res, { initialized: true, path: '/workspace/data/app.db' });
  } catch (error: any) {
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'Failed to initialize database'));
  }
}));

// POST /api/backend-db/:projectId/query - Run SQL query
app.post('/api/backend-db/:projectId/query', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { query } = req.body;

  if (!query || typeof query !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing query.'));
  }

  const entry = await getOrRecoverContainer(projectId);
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
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'Query failed'));
  }
}));

// POST /api/backend-db/:projectId/migrate - Run database migrations
app.post('/api/backend-db/:projectId/migrate', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { migrations } = req.body; // [{ name: string, sql: string }]

  if (!Array.isArray(migrations) || migrations.length === 0) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Missing migrations array.'));
  }

  const entry = await getOrRecoverContainer(projectId);
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

    logger.info({ projectId, appliedCount, skippedCount }, 'Backend DB: migrations complete');
    sendSuccess(res, { applied: appliedCount, skipped: skippedCount });
  } catch (error: any) {
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'Migration failed'));
  }
}));

// POST /api/backend-scaffold/:projectId - Generate backend boilerplate
app.post('/api/backend-scaffold/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const { type, tableName } = req.body; // type: 'auth' | 'stripe' | 'crud'

  if (!type || !['auth', 'stripe', 'crud'].includes(type)) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Invalid type. Must be "auth", "stripe", or "crud".'));
  }

  const entry = await getOrRecoverContainer(projectId);
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
  logger.warn('stripe package not installed, run: npm install stripe');
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

    logger.info({ type, projectId, files }, 'Backend Scaffold: generated scaffold');
    sendSuccess(res, { files, message: `${type} scaffold generated successfully` });
  } catch (error: any) {
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'Scaffold generation failed'));
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

  const entry = await getOrRecoverContainer(projectId);
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

    logger.info({ fileCount: files.length, projectId }, 'Figma Import: converted components');
    sendSuccess(res, { files, componentCount: files.length });
  } catch (error: any) {
    logger.error({ err: error, projectId }, 'Figma Import: failed');
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'Figma import failed'));
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
    logger.info({ platform, projectId }, 'Appetize: uploading build');

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
    logger.info({ projectId, publicKey }, 'Appetize: upload complete');

    sendSuccess(res, { publicKey, appUrl, embedUrl });
  } catch (error: any) {
    logger.error({ err: error, projectId }, 'Appetize: upload failed');
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'Appetize upload failed'));
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

  const gatewayUrl = canvasHostUrl || PUBLIC_OPENCLAW_GATEWAY_URL;

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

  const entry = await getOrRecoverContainer(projectId);
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

    logger.info({ fileCount: files.length, projectId }, 'Canvas: generated components');
    sendSuccess(res, { files });
  } catch (error: any) {
    logger.error({ err: error, projectId }, 'Canvas: generation failed');
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, 'Canvas generation failed'));
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

  const entry = await getOrRecoverContainer(projectId);
  if (!entry) {
    return res.status(404).json({ error: 'Container not found. Start a project first.' });
  }

  try {
    logger.info({ url, projectId }, 'Clone URL: starting clone');

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
        Cmd: ['sh', '-c', `echo '${base64Content}' | base64 -d > '/workspace/${filePath.replace(/'/g, "'\\''").replace(/[\$`\\]/g, '\\$&')}'`],
        AttachStdout: true,
        AttachStderr: true,
      });
      await writeExec.start({ Detach: false });
    }

    logger.info({ url, fileCount: Object.keys(website.files).length }, 'Clone URL: successfully cloned');

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
    logger.error({ err: error }, 'Clone URL: error');
    res.status(500).json({ error: 'Failed to clone website' });
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
  const { action, url, selector, text, script } = req.body;

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
    logger.error({ err: error }, 'Browser: error');
    res.status(500).json({ success: false, error: 'Browser automation failed' });
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
} from './code-index.js';

// Index workspace
app.post('/api/code-index/:projectId/index', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.params;
  const { openaiApiKey } = req.body;

  if (!openaiApiKey) {
    return res.status(400).json({ error: 'openaiApiKey is required' });
  }

  const entry = await getOrRecoverContainer(projectId);
  if (!entry) {
    return res.status(404).json({ error: 'Container not found. Start a project first.' });
  }

  try {
    logger.info({ projectId }, 'CodeIndex: starting index');

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
    logger.error({ err: error }, 'CodeIndex: error');
    res.status(500).json({ success: false, error: 'Indexing failed' });
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
    logger.error({ err: error }, 'CodeIndex: search error');
    res.status(500).json({ success: false, error: 'Search failed' });
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
    res.status(500).json({ success: false, error: 'Failed to get status' });
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
    res.status(500).json({ success: false, error: 'Failed to clear index' });
  }
});

// ==================== END CODE INDEX ====================

// ==================== SUBAGENT WORKFLOW ====================

app.post('/api/agent/workflow', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { requestContract, task, paths, lanes, continuous, retryMax, retryBackoffMs } = parseSubagentWorkflowRequest(req.body);
  const contractValidation = validateSubagentWorkflowRequestContract(requestContract, INTERNAL_WORKFLOW_CONTRACT);
  if (!contractValidation.ok) {
    return res.status(400).json(contractValidation.error);
  }
  const workflow = buildSubagentWorkflowPlan({
    task,
    requestedPaths: paths,
    requestedLanes: lanes,
    continuous,
    retryMax,
    retryBackoffMs,
  });

  return res.json(buildInternalWorkflowResponse({ workflow, requestContract }));
}));

app.post('/api/agent/workflow/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { requestContract, task, paths, lanes, continuous, retryMax, retryBackoffMs } = parseSubagentWorkflowRequest(req.body);
  const contractValidation = validateSubagentWorkflowRequestContract(requestContract, INTERNAL_WORKFLOW_CONTRACT);
  if (!contractValidation.ok) {
    return res.status(400).json(contractValidation.error);
  }
  const workflow = buildSubagentWorkflowPlan({
    task,
    requestedPaths: paths,
    requestedLanes: lanes,
    continuous,
    retryMax,
    retryBackoffMs,
  });

  return res.json(buildInternalWorkflowResponse({
    workflow,
    projectId: req.params.projectId,
    requestContract,
  }));
}));

app.post(
  '/api/v1/agent/workflow',
  requestIdMiddleware,
  authenticateApiKey as any,
  requireScope('projects:read') as any,
  asyncApiHandler(async (req: AuthenticatedApiRequest, res: express.Response) => {
    const { requestContract, task, paths, lanes, continuous, retryMax, retryBackoffMs } = parseSubagentWorkflowRequest(req.body);
    const contractValidation = validateSubagentWorkflowRequestContract(requestContract, PUBLIC_WORKFLOW_CONTRACT);
    if (!contractValidation.ok) {
      sendError(res, ErrorCode.VALIDATION_ERROR, {
        message: contractValidation.error?.error || 'Invalid workflow request contract',
        details: contractValidation.error,
      });
      return;
    }
    const workflow = buildSubagentWorkflowPlan({
      task,
      requestedPaths: paths,
      requestedLanes: lanes,
      continuous,
      retryMax,
      retryBackoffMs,
    });

    sendSuccess(res, buildPublicWorkflowResponseData({ workflow, requestContract }));
  }),
);

// Lane status store (in-memory)
const laneStatusStore = new Map<string, {
  status: 'running' | 'completed' | 'failed';
  workflowRunId?: string;
  attempts?: number;
  duration?: number;
  errors?: string[];
  warnings?: string[];
  updatedAt: string;
}>();

function parseLaneStatusBody(raw: unknown): {
  status?: 'running' | 'completed' | 'failed';
  workflowRunId?: string;
  attempts?: number;
  duration?: number;
  errors?: string[];
  warnings?: string[];
} {
  const parsed = parseSubagentLaneStatusUpdate(raw);
  const body = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const workflowRunId = String(body.workflowRunId || '').trim() || undefined;
  const warnings = Array.isArray(body.warnings) ? body.warnings.map(String) : undefined;
  return {
    status: parsed?.status,
    workflowRunId,
    attempts: parsed?.attempts,
    duration: parsed?.duration,
    errors: parsed?.errors,
    warnings,
  };
}

function upsertLaneStatus(laneId: string, body: ReturnType<typeof parseLaneStatusBody>): void {
  if (!body.status) return;
  laneStatusStore.set(laneId, {
    status: body.status,
    ...(body.workflowRunId ? { workflowRunId: body.workflowRunId } : {}),
    ...(typeof body.attempts === 'number' ? { attempts: body.attempts } : {}),
    ...(typeof body.duration === 'number' ? { duration: body.duration } : {}),
    ...(Array.isArray(body.errors) ? { errors: body.errors } : {}),
    ...(Array.isArray(body.warnings) ? { warnings: body.warnings } : {}),
    updatedAt: new Date().toISOString(),
  });
}

function resolveLaneHealthSnapshot(workflowRunId?: string): {
  laneCount: number;
  completed: number;
  failed: number;
  running: number;
  lanes: Record<string, unknown>;
  taxonomyVersion: string;
  state: 'healthy' | 'degraded' | 'blocked';
  ok: boolean;
  blockers: string[];
  warnings: string[];
  nextActions: string[];
  lanesByState: {
    running: string[];
    completed: string[];
    failed: string[];
  };
} {
  const lanes: Record<string, unknown> = {};
  const normalizedStatuses: Record<string, SubagentLaneStatusEntry> = {};
  const entries = Array.from(laneStatusStore.entries()).filter(([, entry]) =>
    workflowRunId ? entry.workflowRunId === workflowRunId : true,
  );
  for (const [laneId, entry] of entries) {
    lanes[laneId] = entry;
    normalizedStatuses[laneId] = {
      status: entry.status,
      ...(typeof entry.attempts === 'number' ? { attempts: entry.attempts } : {}),
      ...(typeof entry.duration === 'number' ? { duration: entry.duration } : {}),
      ...(Array.isArray(entry.errors) ? { errors: entry.errors } : {}),
      updatedAt: entry.updatedAt,
    };
  }
  const health = buildSubagentWorkflowHealthSummary({ statuses: normalizedStatuses });
  return {
    laneCount: health.laneCount,
    completed: health.completed,
    failed: health.failed,
    running: health.running,
    taxonomyVersion: health.taxonomyVersion,
    state: health.state,
    ok: health.ok,
    blockers: health.blockers,
    warnings: health.warnings,
    nextActions: health.nextActions,
    lanesByState: {
      running: health.lanesByState.running,
      completed: health.lanesByState.completed,
      failed: health.lanesByState.failed,
    },
    lanes,
  };
}

app.post('/api/agent/workflow/:laneId/status', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { laneId } = req.params;
  if (!isKnownSubagentLaneId(laneId)) {
    return res.status(400).json({ error: 'Invalid lane id.' });
  }
  const parsed = parseLaneStatusBody(req.body);
  if (!parsed.status) {
    return res.status(400).json({ error: 'Invalid status. Must be running, completed, or failed.' });
  }
  upsertLaneStatus(laneId, parsed);
  return res.json({
    success: true,
    acknowledged: true,
    laneId,
    contract: INTERNAL_WORKFLOW_CONTRACT,
  });
}));

app.get('/api/agent/workflow/health', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const workflowRunId = String(req.query.workflowRunId || '').trim() || undefined;
  const snapshot = resolveLaneHealthSnapshot(workflowRunId);
  return res.json({
    success: true,
    contract: INTERNAL_WORKFLOW_CONTRACT,
    ...(workflowRunId ? { workflowRunId } : {}),
    ...snapshot,
  });
}));

app.post('/api/agent/workflow/health/reset', authenticateRequest, asyncHandler(async (_req: AuthenticatedRequest, res: express.Response) => {
  const cleared = laneStatusStore.size;
  laneStatusStore.clear();
  return res.json({
    success: true,
    contract: INTERNAL_WORKFLOW_CONTRACT,
    cleared,
  });
}));

app.post(
  '/api/v1/agent/workflow/:laneId/status',
  requestIdMiddleware,
  authenticateApiKey as any,
  requireScope('projects:read') as any,
  asyncApiHandler(async (req: AuthenticatedApiRequest, res: express.Response) => {
    const { laneId } = req.params;
    if (!isKnownSubagentLaneId(laneId)) {
      sendError(res, ErrorCode.VALIDATION_ERROR, { message: 'Invalid lane id.' });
      return;
    }
    const parsed = parseLaneStatusBody(req.body);
    if (!parsed.status) {
      sendError(res, ErrorCode.VALIDATION_ERROR, { message: 'Invalid status. Must be running, completed, or failed.' });
      return;
    }
    upsertLaneStatus(laneId, parsed);
    sendSuccess(res, {
      acknowledged: true,
      laneId,
      contract: PUBLIC_WORKFLOW_HEALTH_CONTRACT,
    });
  }),
);

app.get(
  '/api/v1/agent/workflow/health',
  requestIdMiddleware,
  authenticateApiKey as any,
  requireScope('projects:read') as any,
  asyncApiHandler(async (req: AuthenticatedApiRequest, res: express.Response) => {
    const workflowRunId = String(req.query.workflowRunId || '').trim() || undefined;
    const snapshot = resolveLaneHealthSnapshot(workflowRunId);
    sendSuccess(res, {
      contract: PUBLIC_WORKFLOW_HEALTH_CONTRACT,
      ...(workflowRunId ? { workflowRunId } : {}),
      ...snapshot,
    });
  }),
);

app.post(
  '/api/v1/agent/workflow/health/reset',
  requestIdMiddleware,
  authenticateApiKey as any,
  requireScope('projects:read') as any,
  asyncApiHandler(async (_req: AuthenticatedApiRequest, res: express.Response) => {
    const cleared = laneStatusStore.size;
    laneStatusStore.clear();
    sendSuccess(res, {
      contract: PUBLIC_WORKFLOW_CONTRACT,
      cleared,
    });
  }),
);

// ==================== END SUBAGENT WORKFLOW ====================

// ==================== DATABASE EXPLORER ====================
// Extracted to ./routes/database-explorer.routes.ts (see createDatabaseExplorerRouter)
app.use(createDatabaseExplorerRouter({
  authenticateRequest,
  verifyProjectOwnership,
  getOrRecoverContainer,
  auditLog,
  logger,
}));

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

    const entry = await getOrRecoverContainer(projectId);
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
    logger.error({ err }, 'Debug: start error');
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
    logger.error({ err }, 'Debug: stop error');
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
    logger.error({ err }, 'Debug: restart error');
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
    logger.error({ err }, 'Debug: sessions error');
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
    logger.error({ err }, 'Debug: breakpoints error');
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
    logger.error({ err }, 'Debug: clear breakpoints error');
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
    logger.error({ err }, 'Debug: continue error');
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
    logger.error({ err }, 'Debug: step over error');
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
    logger.error({ err }, 'Debug: step into error');
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
    logger.error({ err }, 'Debug: step out error');
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
    logger.error({ err }, 'Debug: pause error');
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
    logger.error({ err }, 'Debug: threads error');
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
    logger.error({ err }, 'Debug: stack trace error');
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
    logger.error({ err }, 'Debug: scopes error');
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
    logger.error({ err }, 'Debug: variables error');
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
    logger.error({ err }, 'Debug: evaluate error');
    res.status(500).json({ error: err.message });
  }
});

// Get debug manager stats
app.get('/api/debug/stats', authenticateRequest, (_req: AuthenticatedRequest, res) => {
  try {
    const stats = debugManager.getStats();
    res.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    logger.error({ err }, 'Debug: stats error');
    res.status(500).json({ error: err.message });
  }
});

// WebSocket endpoint for real-time debug events
app.ws('/api/debug/:projectId/events', async (ws: WebSocket, req: express.Request) => {
  // Authenticate WebSocket connection
  const authSession = await authenticateWebSocket(ws, req);
  if (!authSession) return;

  const projectId = sanitizeProjectId(req.params.projectId);
  const entry = await getOrRecoverContainer(projectId);

  if (!entry) {
    ws.close(1008, 'Container not found');
    return;
  }

  logger.info({ projectId, userId: authSession.userId }, 'Debug: WebSocket connected');

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
      logger.error({ err }, 'Debug WS: message parse error');
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
    logger.info({ projectId }, 'Debug: WebSocket disconnected');
  });

  ws.on('error', (err) => {
    logger.error({ err, projectId }, 'Debug WS: error');
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

// Helper to wait for container with timeout
async function waitForContainer(projectId: string, timeoutMs: number = 5000): Promise<{ id: string; lastActive: number; port: number; ptyPort: number; backgroundDev?: boolean; userId?: string } | undefined> {
  const startTime = Date.now();
  const checkInterval = 500; // Check every 500ms

  while (Date.now() - startTime < timeoutMs) {
    const entry = await getOrRecoverContainer(projectId);
    if (entry) {
      return entry;
    }
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  return undefined;
}

app.ws('/watch/:projectId', async (ws: WebSocket, req: express.Request) => {
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
    logger.info({ projectId }, 'FileWatch: container not ready, waiting');

    // Wait up to 5 seconds for the container
    entry = await waitForContainer(projectId, 5000);

    if (!entry) {
      // Still not ready after waiting - close with 1008 code
      // Client will handle this gracefully with exponential backoff
      logger.info({ projectId }, 'FileWatch: container still not ready, closing connection');
      wsKeepalive.closeWithHint(ws as any, 'container_not_found', 'Container not found for this project', 1008);
      return;
    }

    logger.info({ projectId }, 'FileWatch: container became ready');
  }

  // Cancel any pending stop timer — a client is reconnecting
  const pendingStop = fileWatchStopTimers.get(projectId);
  if (pendingStop) {
    clearTimeout(pendingStop);
    fileWatchStopTimers.delete(projectId);
    logger.info({ projectId }, 'FileWatch: cancelled pending stop, client reconnected');
  }

  // Add client to watch list
  if (!fileWatchClients.has(projectId)) {
    fileWatchClients.set(projectId, new Set());
  }
  fileWatchClients.get(projectId)!.add(ws as any);

  // Start file watcher for this project if not already running
  fileWatcher.startWatching(entry.id, projectId, isDaytonaSandbox(entry));

  logger.info({ projectId, userId: authSession.userId }, 'FileWatch: client connected');

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
        logger.info({ projectId, graceSec: WATCHER_STOP_GRACE_MS / 1000 }, 'FileWatch: last client gone, stopping watcher after grace period');
        fileWatchStopTimers.set(projectId, setTimeout(() => {
          fileWatchStopTimers.delete(projectId);
          // Only stop if no clients reconnected during the grace period
          if (!fileWatchClients.has(projectId) || fileWatchClients.get(projectId)!.size === 0) {
            fileWatcher.stopWatching(projectId);
            logger.info({ projectId }, 'FileWatch: watcher stopped (grace period expired)');
          }
        }, WATCHER_STOP_GRACE_MS));
      }
    }
    logger.info({ projectId }, 'FileWatch: client disconnected');
  });

  ws.on('error', (err) => {
    logger.error({ err, projectId }, 'FileWatch: error');
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
        logger.warn({ err }, 'BuildErrors: failed to send to client');
      }
    }
  }

  if (hasBlocking && errors.length > 0) {
    logger.info({ clientCount: clients.size, errorCount: errors.length, projectId }, 'BuildErrors: notified clients');
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
      logger.warn({ err, projectId }, 'BuildErrors: error polling');
    }
  }, 3000); // Poll every 3 seconds

  buildErrorPollers.set(projectId, pollInterval);
  logger.info({ projectId }, 'BuildErrors: started polling');
}

function stopBuildErrorPolling(projectId: string): void {
  const poller = buildErrorPollers.get(projectId);
  if (poller) {
    clearInterval(poller);
    buildErrorPollers.delete(projectId);
    lastBuildErrors.delete(projectId);
    logger.info({ projectId }, 'BuildErrors: stopped polling');
  }
}

// WebSocket endpoint for build errors
app.ws('/build-errors/:projectId', async (ws: WebSocket, req: express.Request) => {
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
  const entry = await getOrRecoverContainer(projectId);
  if (!entry) {
    logger.info({ projectId }, 'BuildErrors: container not found');
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

  logger.info({ projectId, userId: authSession.userId }, 'BuildErrors: client connected');

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
    logger.info({ projectId }, 'BuildErrors: client disconnected');
  });

  ws.on('error', (err) => {
    logger.error({ err, projectId }, 'BuildErrors: error');
  });
});

// ==================== AGENT BRIDGE WEBSOCKET ====================
// WebSocket endpoint for local agents (recoder-code CLI) to connect to
// the A2A workspace system in real-time.
import { getAgentBridgeService } from './a2a/agent-bridge.service.js';

app.ws('/agent-bridge', async (ws: WebSocket, req: express.Request) => {
  // Authenticate WebSocket connection
  const authSession = await authenticateWebSocket(ws, req, { allowAnonymous: false });
  if (!authSession) return;

  // Register for keepalive (ping/pong every 30s, timeout after 60s)
  wsKeepalive.register(ws as any, 'agent-bridge', 'agent-bridge', authSession.userId);

  // Rate limiting for agent bridge messages
  const agentBridgeRateLimiter = getWsRateLimiter('agent-bridge');
  agentBridgeRateLimiter.track(ws as any);

  const bridge = getAgentBridgeService();

  // Extract registration data from query params (initial connection)
  const agentId = (req.query.agentId as string) || `local_${authSession.userId}_${Date.now()}`;
  const sessionId = (req.query.sessionId as string) || undefined;
  const label = (req.query.label as string) || undefined;
  const capabilities = req.query.capabilities
    ? (req.query.capabilities as string).split(',')
    : [];
  const workspaceIds = req.query.workspaceIds
    ? (req.query.workspaceIds as string).split(',')
    : [];

  // Register the agent — sessionId allows multiple instances of the same agentId to coexist
  const agent = bridge.registerAgent(ws as any, agentId, authSession.userId, capabilities, workspaceIds, sessionId, label);

  // Send registration confirmation
  ws.send(JSON.stringify({
    type: 'registered',
    agentId: agent.agentId,
    sessionId: agent.sessionId,
    workspaces: agent.workspaceIds,
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    if (!agentBridgeRateLimiter.allowMessage(ws as any)) {
      logger.warn({ agentId }, 'AgentBridge: message dropped (rate limited)');
      return;
    }
    try {
      bridge.handleMessage(ws as any, data.toString());
    } catch (err) {
      logger.error({ err, agentId }, 'AgentBridge: error handling message');
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    bridge.unregisterBySocket(ws as any);
    logger.info({ agentId, userId: authSession.userId }, 'AgentBridge: agent disconnected');
  });

  ws.on('error', (err) => {
    logger.error({ err, agentId }, 'AgentBridge: connection error');
  });

  logger.info({ agentId, sessionId: agent.sessionId, userId: authSession.userId }, 'AgentBridge: agent connected');
});

// GET /api/a2a/bridge/agents — live connected bridge sessions
app.get('/api/a2a/bridge/agents', authenticateRequest, async (_req: express.Request, res: express.Response) => {
  try {
    const sessions = getAgentBridgeService().listConnectedSessions();
    res.json({
      success: true,
      data: {
        sessions,
        total: sessions.length,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Error listing bridge sessions');
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ==================== MOBILE API ENDPOINTS ====================

// Mobile API dependencies - connect to existing services
const mobileApiDependencies: MobileApiDependencies = {
  // Fetch projects for a user
  fetchUserProjects: async (userId, options) => {
    // In production, this would query the database via the main app API
    // For now, we return an empty list as projects are managed by the main app
    logger.info({ userId, options }, 'Mobile: fetching projects');
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
        logger.info({ status: response.status }, 'Mobile: failed to fetch projects');
        return { projects: [], total: 0 };
      }

      const data = await response.json() as { projects: Record<string, unknown>[]; total: number };
      return { projects: data.projects || [], total: data.total || 0 };
    } catch (error) {
      logger.error({ err: error }, 'Mobile: error fetching projects');
      return { projects: [], total: 0 };
    }
  },

  // Fetch single project details
  fetchProjectDetail: async (userId, projectId) => {
    logger.info({ projectId }, 'Mobile: fetching project detail');
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
        logger.info({ status: response.status }, 'Mobile: failed to fetch project detail');
        return null;
      }

      const data = await response.json() as Record<string, unknown>;
      return data;
    } catch (error) {
      logger.error({ err: error }, 'Mobile: error fetching project detail');
      return null;
    }
  },

  // Fetch project files
  fetchProjectFiles: async (_userId, projectId, path) => {
    logger.info({ projectId, path: path || '/' }, 'Mobile: fetching files');
    const entry = await getOrRecoverContainer(projectId);
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
      logger.error({ err: error }, 'Mobile: error fetching files');
      return [];
    }
  },

  // Check project ownership
  checkProjectOwnership: async (userId, projectId) => {
    return checkProjectOwnership(userId, projectId);
  },

  // Get container for project (sync — uses in-memory Map only, recovery happens in route handlers)
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
app.get('/api/mobile/stats', authenticateRequest, (_req: AuthenticatedRequest, res) => {
  try {
    const stats = getMobileApiStats();
    res.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    logger.error({ err }, 'Mobile: stats error');
    res.status(500).json({ error: err.message });
  }
});

// ==================== END MOBILE API ENDPOINTS ====================

// ==================== Enterprise Organization API ====================

// Extracted to ./routes/enterprise-organizations.routes.ts (see createEnterpriseOrganizationsRouter)
app.use(createEnterpriseOrganizationsRouter({ authenticateRequest }));
// ==================== End Enterprise Organization API ====================

// Global error handler - must be added after all routes
app.use(globalErrorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, _promise) => {
  logger.error({
    type: 'UNHANDLED_REJECTION',
    err: reason instanceof Error ? reason : undefined,
    reason: reason instanceof Error ? undefined : String(reason),
  }, 'unhandled rejection');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error({ err: error, type: 'UNCAUGHT_EXCEPTION' }, 'uncaught exception');
  // Give time for logging before exit
  setTimeout(() => process.exit(1), 1000);
});

const PORT = process.env.PORT || 3100;

// Redis-backed A2A control plane adapter (set during startup, flushed on shutdown)
let _a2aRedisAdapter: RedisBackedPersistenceAdapter | null = null;

// NOTE: HTTP server is created at the top of the file along with express-ws initialization
// This ensures WebSocket routes registered with app.ws() work properly

// Initialize Yjs collaboration WebSocket server
const collabWss = createCollaborationServer(server, '/collab');
startupInfo('collaboration', 'server ready', { path: '/collab' });

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'starting graceful shutdown');

  try {
    // Shutdown WebSocket keepalive connections first (sends hints to clients)
    logger.info('shutting down WebSocket keepalive connections');
    wsKeepalive.shutdown();

    // Save all collaboration documents
    logger.info('saving collaboration documents');
    await saveAllDocuments();

    // Shutdown LSP servers
    logger.info('shutting down LSP servers');
    await lspServerManager.shutdown();

    // Shutdown debug sessions
    logger.info('shutting down debug sessions');
    await debugManager.shutdown();

    // Close WebSocket server
    logger.info('closing collaboration WebSocket server');
    collabWss.close();

    // Stop metering system
    logger.info('stopping metering system');
    try {
      const meteringCollector = getMeteringCollector();
      meteringCollector.stop();
      const usageAggregator = getUsageAggregator();
      usageAggregator.stop();
    } catch (_) {
      // Metering may not have been initialized; ignore
    }

    // Stop health monitor and resource optimizer
    logger.info('stopping health monitor');
    healthMonitor.stop();
    logger.info('stopping resource optimizer');
    resourceOptimizer.stop();

    // Shutdown container pool
    logger.info('shutting down container pool');
    try {
      await containerPool.shutdown();
    } catch (err: any) {
      logger.error({ err }, 'container pool shutdown error');
    }

    // Dispose A2A task lifecycle service (disconnects Redis, stops eviction timers)
    logger.info('disposing A2A task lifecycle service');
    try {
      disposeTaskLifecycleService();
    } catch (err: any) {
      logger.error({ err }, 'A2A task lifecycle service dispose error');
    }

    // Flush Redis-backed A2A control plane state
    if (_a2aRedisAdapter) {
      logger.info('flushing A2A Redis adapter');
      try {
        await _a2aRedisAdapter.flush();
      } catch (err: any) {
        logger.error({ err }, 'A2A Redis adapter flush error');
      }
    }

    // Wait for debounced file saves to flush
    await new Promise(resolve => setTimeout(resolve, 300));

    // Close HTTP server
    logger.info('closing HTTP server');
    server.close(() => {
      logger.info('graceful shutdown complete');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } catch (error) {
    logger.error({ err: error }, 'error during shutdown');
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
    if (daytonaSandboxIds.has(containerId)) {
      const dc = getDaytonaClient();
      await dc.startSandbox(containerId);
      return;
    }
    const container = docker.getContainer(containerId);
    await container.start();
  },
  stopContainer: async (containerId: string) => {
    if (daytonaSandboxIds.has(containerId)) {
      const dc = getDaytonaClient();
      await dc.stopSandbox(containerId);
      return;
    }
    const container = docker.getContainer(containerId);
    await container.stop();
  },
  deleteContainer: async (containerId: string) => {
    if (daytonaSandboxIds.has(containerId)) {
      await daytonaDeleteSandbox(containerId);
      return;
    }
    await docker.getContainer(containerId).remove({ force: true });
  },
  execInContainer: async (containerId: string, command: string, options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
  }) => {
    // Route through Daytona if this is a known sandbox
    if (daytonaSandboxIds.has(containerId)) {
      const startTime = Date.now();
      try {
        const fullCmd = options?.cwd
          ? `cd "${options.cwd.replace(/"/g, '\\"')}" && ${command}`
          : command;
        const result = await daytonaExec(containerId, fullCmd, {
          timeoutSecs: options?.timeoutMs ? Math.ceil(options.timeoutMs / 1000) : 30,
        });
        return {
          exitCode: result.exitCode,
          stdout: result.output,
          stderr: '',
          executionTimeMs: Date.now() - startTime,
          timedOut: false,
          killed: false,
        };
      } catch (err: any) {
        return {
          exitCode: -1,
          stdout: '',
          stderr: err.message || 'Daytona exec failed',
          executionTimeMs: Date.now() - startTime,
          timedOut: false,
          killed: false,
        };
      }
    }

    const container = docker.getContainer(containerId);
    const startTime = Date.now();

    const exec = await container.exec({
      Cmd: options?.cwd ? ['sh', '-c', `cd "${options.cwd.replace(/"/g, '\\"')}" && ${command}`] : ['sh', '-c', command],
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
        const header = chunk.subarray(0, 8);
        const type = header[0]; // 1 = stdout, 2 = stderr
        const content = chunk.subarray(8).toString();
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
    if (daytonaSandboxIds.has(containerId)) {
      const relativePath = filePath.startsWith('/home/daytona/') ? filePath.slice('/home/daytona/'.length) : filePath.startsWith('/workspace/') ? filePath.slice('/workspace/'.length) : filePath;
      await daytonaWriteFile(containerId, relativePath, content);
      return;
    }
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
    if (daytonaSandboxIds.has(containerId)) {
      const relativePath = filePath.startsWith('/home/daytona/') ? filePath.slice('/home/daytona/'.length) : filePath.startsWith('/workspace/') ? filePath.slice('/workspace/'.length) : filePath;
      const fileContent = await daytonaReadFile(containerId, relativePath);
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
      return {
        content: fileContent,
        size: Buffer.byteLength(fileContent),
        mimeType: mimeTypes[ext] || 'text/plain',
      };
    }
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
        content += chunk.subarray(8).toString();
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
    if (daytonaSandboxIds.has(containerId)) {
      const relativePath = filePath.startsWith('/home/daytona/') ? filePath.slice('/home/daytona/'.length) : filePath.startsWith('/workspace/') ? filePath.slice('/workspace/'.length) : filePath;
      await daytonaDeleteFile(containerId, relativePath);
      return;
    }
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: ['rm', '-f', filePath],
      AttachStdout: true,
      AttachStderr: true,
    });
    await exec.start({ hijack: true, stdin: false });
  },
  listFiles: async (containerId: string, dirPath: string) => {
    if (daytonaSandboxIds.has(containerId)) {
      const result = await daytonaExec(containerId, `find '${dirPath}' -maxdepth 1 -printf '%y|%s|%T@|%f\\n' 2>/dev/null`, { timeoutSecs: 15 });
      const files = result.output.trim().split('\n').filter(Boolean).map((line: string) => {
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
      return files;
    }
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
        output += chunk.subarray(8).toString();
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

import { createDaytonaSandboxRouter } from './routes/daytona-sandbox.routes.js';
import { createPromptsRouter } from './routes/prompts.routes.js';
import { createSecretsRouter } from './routes/secrets.routes.js';
import { createPackageManagerRouter } from './routes/package-manager.routes.js';
import { createNeonRouter } from './routes/neon.routes.js';
import { createDeployRouter } from './routes/deploy.routes.js';
import { createTemplatesRouter } from './routes/templates.routes.js';
import { createCodeGraphRouter } from './routes/code-graph.routes.js';
import { createLlmRouterRouter } from './routes/llm-router.routes.js';
import { createZitiRouter } from './routes/ziti.routes.js';
import { createTensorzeroRouter } from './routes/tensorzero.routes.js';
import { createMulticaRouter } from './routes/multica.routes.js';
import { createRetrievalRouter } from './routes/retrieval.routes.js';
import { createAgentSkillProfilesRouter } from './routes/agent-skill-profiles.routes.js';
import { createMem0Router } from './routes/mem0.routes.js';
import { createContext7Router } from './routes/context7.routes.js';
import { createMcpRouter } from './routes/mcp.routes.js';
import { createBillingPolarRouter } from './routes/billing-polar.routes.js';
import { createApiKeysRouter } from './routes/api-keys.routes.js';
import { createE2bRouter } from './routes/e2b.routes.js';
import { createBrowserVerifyRouter } from './routes/browser-verify.routes.js';
import { createSnapshotRouter } from './routes/snapshot.routes.js';
import { createDatabaseExplorerRouter } from './routes/database-explorer.routes.js';
import { createLspRouter } from './routes/lsp.routes.js';
import { createGitOperationsRouter } from './routes/git-operations.routes.js';
import { createIntegrationsHealthRouter } from './routes/integrations-health.routes.js';
import { createGitHubCollaboratorsRouter } from './routes/github-collaborators.routes.js';
import { createEnterpriseOrganizationsRouter } from './routes/enterprise-organizations.routes.js';
import { createAdminOperationsRouter } from './routes/admin-operations.routes.js';
import { createContextCacheRouter } from './routes/context-cache.routes.js';

// Initialize sandbox routes — prefer Daytona if configured, fall back to Docker
import { createDaytonaSandboxDeps } from './daytona-sandbox-deps.js';
const daytonaDeps = createDaytonaSandboxDeps();
initSandboxRoutes(daytonaDeps || sandboxDependencies);

// Project dependencies for Public API
const projectDependencies: ProjectDependencies = {
  createContainer: async (_options) => {
    const pooledContainer = await containerPool.acquire();
    if (!pooledContainer) {
      throw new Error('Failed to acquire container from pool');
    }
    return { containerId: pooledContainer.id, port: pooledContainer.port };
  },
  startContainer: async (containerId: string) => {
    if (daytonaSandboxIds.has(containerId)) {
      const dc = getDaytonaClient();
      await dc.startSandbox(containerId);
      return;
    }
    const container = docker.getContainer(containerId);
    await container.start();
  },
  stopContainer: async (containerId: string) => {
    if (daytonaSandboxIds.has(containerId)) {
      const dc = getDaytonaClient();
      await dc.stopSandbox(containerId);
      return;
    }
    const container = docker.getContainer(containerId);
    await container.stop();
  },
  deleteContainer: async (containerId: string) => {
    if (daytonaSandboxIds.has(containerId)) {
      await daytonaDeleteSandbox(containerId);
      return;
    }
    await docker.getContainer(containerId).remove({ force: true });
  },
  getPreviewUrl: (port: number) => {
    return `http://localhost:${port}`;
  },
  publishProject: async (projectId: string, containerId: string) => {
    const provider = (process.env.DEPLOY_PROVIDER || 'vercel') as 'vercel' | 'netlify' | 'cloudflare';
    const token = process.env.DEPLOY_TOKEN;
    if (!token) {
      throw new Error('DEPLOY_TOKEN environment variable is required for publishing');
    }

    // Extract project files from the container workspace
    const fileListRaw = await execInContainer(containerId, 'cd /workspace && find . -type f -not -path "./.git/*" -not -path "./node_modules/*" -not -path "./.next/*" -not -path "./dist/*" | head -500');
    const filePaths = fileListRaw.trim().split('\n').filter(Boolean);

    const files: Record<string, string> = {};
    for (const fp of filePaths) {
      const cleanPath = fp.startsWith('./') ? fp.slice(2) : fp;
      try {
        const content = await execInContainer(containerId, `cat "/workspace/${cleanPath}"`);
        files[cleanPath] = content;
      } catch {
        // Skip binary or unreadable files
      }
    }

    const slug = `recoder-${projectId.slice(0, 8)}`;
    const deployConfig = {
      provider,
      projectName: slug,
      projectId,
      production: true,
      teamId: process.env.DEPLOY_TEAM_ID,
      accountId: process.env.DEPLOY_ACCOUNT_ID,
    };
    const credentials = {
      provider,
      token,
      teamId: process.env.DEPLOY_TEAM_ID,
      accountId: process.env.DEPLOY_ACCOUNT_ID,
    };

    let deployFn: typeof import('./deployment/vercel.js').deploy;
    if (provider === 'netlify') {
      deployFn = (await import('./deployment/netlify.js')).deploy;
    } else if (provider === 'cloudflare') {
      deployFn = (await import('./deployment/cloudflare.js')).deploy;
    } else {
      deployFn = (await import('./deployment/vercel.js')).deploy;
    }

    const deployment = await deployFn(credentials, deployConfig, files);
    return { url: deployment.url, slug };
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

// Agent OS API layer: canonical control-plane surface for tasks, agents,
// runs, approvals, artifacts, memory, instructions, policy, events, workflows.
app.use('/api/agent-os', authenticateRequest, createAgentOsRouter());
app.use('/internal/agent-os', createInternalAgentOsRouter());
// Recoder Conductor — parallel agent sessions (tmux + git worktrees). The pivot product.
app.use('/api/conductor', authenticateRequest, createConductorRouter());
// Recoder Distribution — CLI device-flow auth (recoder.xyz is the source of
// truth), billing/entitlement/quota status over the provider-agnostic Polar
// (Merchant-of-Record) port, the enterprise device kill-switch, and org seats.
// CLI device-flow endpoints are intentionally unauthenticated at the route
// layer (the flow IS the auth handshake; the browser-authorize step verifies
// the recoder.xyz session cookie internally). Billing endpoints require auth.
app.use('/api/auth/cli', createCliAuthRouter(getDistributionModule()));
app.use('/api/billing', authenticateRequest, createBillingRouter(getDistributionModule()));
// Recoder Network + XDR — Envoy control plane. /api/network is the authenticated
// control surface (generated config, XDR detections, health); /internal/network/authz
// is the Envoy ext_authz callback (service-to-service, default-deny, no user auth).
app.use('/api/network', authenticateRequest, createNetworkRouter());
app.use('/internal/network', createNetworkInternalRouter());
// Auto-apply Agent OS Postgres migrations on boot when running on the Postgres
// driver (idempotent + degrade-safe). This provisions the conductor_workspaces
// schema for a fresh AGENT_OS_REPOSITORY=postgres deploy so the reconcile below
// (and all conductor persistence) has its tables. No-op for memory/json drivers.
if (agentOsContainer.repositoryDriver === 'postgres' && agentOsContainer.pgPool) {
  void (async () => {
    const { applyAgentOsMigrations } = await import('./agent-os/migrations/apply-migrations.js');
    const result = await applyAgentOsMigrations(agentOsContainer.pgPool!);
    if (!result.ok) {
      logger.warn({ error: result.error }, 'Agent OS Postgres migrations did not fully apply on boot (degrade-safe)');
    } else if (result.applied.length > 0) {
      logger.info({ applied: result.applied }, 'Agent OS Postgres migrations applied on boot');
    }
  })().catch((err) => logger.warn({ err }, 'Agent OS migration boot step failed (non-fatal)'));
}
// Owned Rust governance kernel: when the prebuilt governance daemon binary is
// present (crates/recoder-governance — target/release|debug, or
// RECODER_GOVERNANCE_DAEMON), spawn it on boot so conductor delivery decisions
// route through the real Rust kernel over its UDS. Degrade-safe: when the binary
// is absent (the default — we never BUILD the crate here) governance stays on the
// pure-TS deny-biased path. Fire-and-forget; a daemon problem never blocks boot.
import { ensureGovernanceDaemon } from './conductor/governance-daemon.js';
void ensureGovernanceDaemon()
  .then((daemon) => {
    if (daemon) {
      logger.info(
        { socketPath: daemon.socketPath, binPath: daemon.binPath },
        'governance daemon up — conductor delivery decisions route through the Rust kernel',
      );
    }
  })
  .catch((err) => logger.warn({ err }, 'governance daemon boot step failed (non-fatal, degrading to pure-TS)'));

// OpenFang autonomous agent engine: when the prebuilt openfang binary is
// present (crates/openfang — target/release|debug, or OPENFANG_BIN), spawn it
// on boot as a loopback subprocess so the OSS dispatch path can drive real
// RunEvents. A2A boundary: Recoder owns task/approval/memory; openfang only
// emits RunEvents. Degrade-safe: when the binary is absent the backend stays
// on the pure-TS OpenFangAdapter path (no fake success). Fire-and-forget; a
// daemon problem never blocks boot.
import { ensureOpenfangDaemon, createOpenfangAgentRouter } from './conductor/openfang-daemon.js';
void ensureOpenfangDaemon()
  .then((daemon) => {
    if (daemon) {
      logger.info(
        { listenAddr: daemon.listenAddr, binPath: daemon.binPath },
        'openfang daemon up — autonomous agent engine ready (A2A RunEvents route through Recoder)',
      );
    }
  })
  .catch((err) => logger.warn({ err }, 'openfang daemon boot step failed (non-fatal, degrading to pure-TS dispatch)'));

// TensorZero LLM gateway: when TENSORZERO_URL is set (external) or a prebuilt
// gateway binary is present (crates/tensorzero/crates/gateway — target/release|debug,
// or TENSORZERO_BIN), connect/spawn it so inference calls route through the LLM
// gateway for logging, routing, and experiment tracking. Degrade-safe: when
// unconfigured/absent the run loop falls back to direct provider calls (no fake
// success). Fire-and-forget; a gateway problem never blocks boot.
import { ensureTensorzeroGateway } from './tensorzero-client.js';
void ensureTensorzeroGateway()
  .then((gw) => {
    if (gw) {
      logger.info(
        { baseUrl: gw.baseUrl, listenAddr: gw.listenAddr },
        'TensorZero gateway ready — inference calls now route through the LLM gateway',
      );
    }
  })
  .catch((err) => logger.warn({ err }, 'TensorZero gateway boot step failed (non-fatal, degrading to direct provider calls)'));

// Survivability: on boot AND on a periodic timer, reconcile persisted workspaces
// against the real tmux + git substrate (fire-and-forget; safe no-op when the
// substrate is unavailable). Per docs/CONDUCTOR-ARCHITECTURE.md §1: the reconciler
// is the heart of restart-survivability — it runs on boot AND on a timer.
reconcileConductor().catch((err) =>
  logger.warn({ err }, 'conductor boot reconcile failed (non-fatal)'),
);
const RECONCILE_INTERVAL_MS = Number(process.env.CONDUCTOR_RECONCILE_INTERVAL_MS) || 5 * 60 * 1000;
const reconcileTimer = setInterval(() => {
  reconcileConductor().catch((err) =>
    logger.warn({ err }, 'conductor periodic reconcile failed (non-fatal)'),
  );
}, RECONCILE_INTERVAL_MS);
reconcileTimer.unref(); // don't keep the process alive on this timer alone

// Auto-completion watcher: detects finished agents, generates delivery summaries,
// transitions workspaces to awaiting_review. Autonomous "landing the plane".
import { startCompletionWatcher } from './conductor/completion-watcher.js';
startCompletionWatcher();

// Worktree disk cleanup: prune stale worktrees + kill orphaned tmux sessions.
import { startWorktreeCleanup } from './conductor/worktree-cleanup.js';
startWorktreeCleanup();

// Connectors bridge — chat channels (telegram, …) -> gated -> Conductor workspace.
// Status route is read-only and never leaks credentials (truthful health only).
app.use('/api/connectors', createConnectorsRouter());

// Identity token endpoints (requires API key auth, but /verify uses app key auth internally)
app.use('/api/v1/identity', identityRouter);

// App key management endpoints (requires API key auth)
app.use('/api/v1/app-keys', appKeysRouter);
// Agent Registry REST API: register / discover / heartbeat / health for external agents.
// Mounted BEFORE the legacy a2aRouter so the in-process AgentRegistryService (used by
// external Claude Code / Codex clients) takes precedence over the admin-gated legacy
// connector registry at a2a-gateway.ts (`GET /agents`, `PUT /agents/:id`).
app.use('/api/a2a/agents', agentRegistryRouter);
// OpenFang agent edge — health + card behind authenticateRequest. Truthful:
// returns 503 when the openfang daemon is absent (degrade-safe, never fakes).
app.use('/api/agents/openfang', authenticateRequest, createOpenfangAgentRouter());
app.use('/api/a2a', authenticateMutatingRequest, a2aRouter);
app.use('/api/a2a/tasks', authenticateMutatingRequest, taskLifecycleRouter);
app.use('/api/a2a/channels', collaborationRouter);
app.use('/api/a2a', heartbeatRouter);
app.use('/api/a2a/approvals', approvalRouter);
app.use('/api/a2a/openclaw', openclawAdapterRouter);

// OpenClaw Platform Hub — health + routing preview endpoints
import { getHubHealth, previewRouting } from './openclaw-platform-hub.js';
app.get('/api/a2a/openclaw/hub/health', async (_req, res) => {
  const health = await getHubHealth();
  res.json({ ok: true, platforms: health });
});
app.post('/api/a2a/openclaw/hub/preview', (req, res) => {
  const targets = previewRouting(req.body);
  res.json({ ok: true, targets });
});

app.use('/api/a2a', promoteQueryToken, authenticateRequest, sseStreamRouter);
app.use('/api/a2a/connectors/claude', claudeConnectorRouter);
app.use('/api/a2a/connectors/codex', codexConnectorRouter);
app.use('/api/a2a/connectors/opencode', opencodeConnectorRouter);
app.use('/api/a2a/connectors/cursor', cursorConnectorRouter);
app.use('/api/a2a/connectors/windsurf', windsurfConnectorRouter);
app.use('/api/a2a/connectors/replit', replitConnectorRouter);
// These adapters can register REST/Git integrations against arbitrary
// targets/repo paths and drive operations on them, so they MUST require auth.
// (The standalone a2a-gateway process guards the same routers via its own
// extractA2AIdentity middleware; the main server has no such guard, so add it
// here explicitly.) No frontend/external consumers — purely additive hardening.
app.use('/api/a2a/adapters/rest', authenticateRequest, restAdapterRouter);
app.use('/api/a2a/adapters/git', authenticateRequest, gitAdapterRouter);
app.use('/api/a2a/context', contextBridgeRouter);
app.use('/api/a2a/workspaces', promoteQueryToken, authenticateRequest, a2aWorkspaceRouter);
app.use('/api/spaces', promoteQueryToken, authenticateRequest, a2aWorkspaceRouter);
app.use('/api/a2a/memory', authenticateRequest, memoryRouter);
app.use('/api/a2a/code-search', authenticateRequest, codeSearchRouter);
app.use('/api/a2a/search', authenticateRequest, searchRouter);
app.use('/api/a2a/webhook', webhookRouter);
app.use('/api/a2a/scratchpad', authenticateRequest, scratchpadRouter);
app.use('/api/a2a/workflows', authenticateRequest, workflowTriggerRouter);
app.use('/api/a2a/data', authenticateRequest, duckdbRouter);
app.use('/api/a2a/canvas-update', authenticateRequest, createCanvasRouter({
  canvasHandlerUrl: process.env.RECODER_A2A_CANVAS_HANDLER_URL || '',
  internalServiceKey: process.env.INTERNAL_SERVICE_KEY || '',
  writeFile: daytonaWriteFile,
  readFile: daytonaReadFile,
}));
startupInfo('routes.canvas-update', 'registered');
app.use('/api/a2a/connectors', authenticateRequest);
app.use('/api/a2a', connectorHealthRouter);
app.use('/api/a2a/patterns', authenticateRequest, patternRouter);
app.use('/api/a2a', a2aOpenApiRouter);
app.use('/api/a2a', a2aSloMetricsRouter);
app.use('/api/a2a/orchestration', authenticateRequest, orchestrationRouter);
app.use(['/api/a2a/messages', '/api/a2a/delegations', '/api/a2a/handoffs'], authenticateRequest);
app.use('/api/a2a', workflowMessagingRouter);

// Cross-app A2A workflows (agents↔PM↔agency)
import { crossAppWorkflowRouter } from './a2a-cross-app-workflows.js';
app.use('/api/a2a/workflows', authenticateRequest, crossAppWorkflowRouter);
app.use('/api/a2a/admin', authenticateRequest, adminRouter);

// Daytona LSP integration for code intelligence
import { daytonaLspRouter } from './daytona-lsp.js';
app.use('/api/daytona/lsp', authenticateRequest, daytonaLspRouter);

// Unified activity feed + dashboard metrics
import { activityFeedRouter } from './unified-activity-feed.js';
import { dashboardRouter } from './unified-dashboard.js';
import { edgeRouter } from './edge/edge.routes.js';
app.use('/api/a2a/activity', authenticateRequest, activityFeedRouter);
app.use('/api/a2a/dashboard', authenticateRequest, dashboardRouter);
app.use('/api/edge', edgeRouter);

// ── Coding Runtime API ──────────────────────────────────────────────────────
// Deep coding mode: start/prompt/dispose sessions via runtime adapters
const codingRuntimeSelectionByProject = new Map<string, {
  runtimeType: string;
  selectedAt: string;
  classification?: unknown;
  routeDecision?: unknown;
}>();

app.post('/api/coding-runtime/session', authenticateRequest, flexibleProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { getRuntime, listRuntimes } = await import('./a2a/coding-runtime.js');
  const { getCodingRuntimeHistoryService } = await import('./coding-runtime-history.js');
  const { projectId, sandboxId, runtimeType = 'opencode', model, provider, apiKey, prompt, executionMode } = req.body;
  if (!projectId) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'projectId required'));
  let resolvedRuntimeType = runtimeType;
  let autoSelection: { classification: unknown; routeDecision: unknown; adaptive?: unknown } | undefined;

  if (runtimeType === 'auto') {
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'prompt is required when runtimeType=auto'));
    }

    const { classifyIntent } = await import('./a2a/intent-gate.js');
    const { routeByCategory } = await import('./a2a/category-router.js');
    const classification = classifyIntent(prompt);
    const routeDecision = routeByCategory(classification);
    resolvedRuntimeType = routeDecision.runtimeType;

    if (resolvedRuntimeType === 'native') {
      resolvedRuntimeType = 'opencode';
    }

    // Adaptive routing: if a runtime has a strong proven track record for this
    // category (skill profiles), prefer it over the static mapping. Conservative
    // gate (score >= 0.6 already requires both high success rate and evidence).
    let adaptive: { picked: string; score: number; reason: string } | undefined;
    try {
      const category = (routeDecision as { category?: string }).category;
      if (category) {
        const { rankAgentsForSkills } = await import('./agent-skill-profile.js');
        const candidates = listRuntimes()
          .filter((rt) => rt !== 'native')
          .map((rt) => `runtime:${rt}`);
        const ranked = rankAgentsForSkills(candidates, [category]);
        const best = ranked[0];
        if (best && best.score >= 0.6) {
          const bestRuntime = best.agentId.replace(/^runtime:/, '');
          if (bestRuntime && bestRuntime !== resolvedRuntimeType && getRuntime(bestRuntime as never)) {
            adaptive = { picked: bestRuntime, score: best.score, reason: best.reason };
            resolvedRuntimeType = bestRuntime;
          }
        }
      }
    } catch (err) {
      logger.warn({ err, projectId }, 'adaptive routing skipped');
    }

    autoSelection = { classification, routeDecision, adaptive };
  }

  const runtime = getRuntime(resolvedRuntimeType as never);
  if (!runtime) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, `Unknown runtime: ${resolvedRuntimeType}`));
  const entry = await getOrRecoverContainer(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No active sandbox container for project'));
  }
  const resolvedSandboxId = isDaytonaSandbox(entry) ? entry.id : (sandboxId || entry.id);
  const daytonaUrl = (process.env.DAYTONA_SERVER_URL ?? 'http://localhost:3900/api').replace(/\/api\/?$/, '');
  const session = await runtime.startSession({
    projectId, sandboxId: resolvedSandboxId,
    sandboxExecUrl: `${daytonaUrl}/api/toolbox/${resolvedSandboxId}/toolbox/process/execute`,
    daytonaApiKey: process.env.DAYTONA_API_KEY ?? '',
    model, provider, apiKey, executionMode,
  });

  codingRuntimeSelectionByProject.set(projectId, {
    runtimeType: resolvedRuntimeType,
    selectedAt: new Date().toISOString(),
    classification: autoSelection?.classification,
    routeDecision: autoSelection?.routeDecision,
  });
  getCodingRuntimeHistoryService().recordSessionSelection({
    projectId,
    runtimeType: resolvedRuntimeType,
    requestedRuntimeType: runtimeType,
    sandboxId: resolvedSandboxId,
    executionMode,
    prompt: typeof prompt === 'string' ? prompt : undefined,
    autoSelection,
  });

  // Best-effort, fire-and-forget: auto-build the code knowledge graph so agents
  // can navigate the project immediately. Works for Daytona + Docker sandboxes
  // (execInContainer routes both); never blocks the response.
  void (async () => {
    try {
      const { autoBuildCodeGraph } = await import('./code-graph-bootstrap.js');
      await autoBuildCodeGraph((cmd) => execInContainer(entry.id, cmd), projectId);
    } catch (err) {
      logger.warn({ err, projectId }, 'code-graph auto-build failed');
    }
  })();

  sendSuccess(res, {
    ...session,
    selectedRuntime: resolvedRuntimeType,
    autoSelection,
  });
}));

app.post('/api/coding-runtime/prompt', authenticateRequest, flexibleProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { getRuntime } = await import('./a2a/coding-runtime.js');
  const { getCodingRuntimeHistoryService } = await import('./coding-runtime-history.js');
  const { projectId, prompt, runtimeType, agent, enableCompletionLoop, maxIterations, backoffMs, injectDocs, useMemory, memoryLimit, codeContext } = req.body;
  if (!projectId || !prompt) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'projectId and prompt required'));
  const userId = req.userId;
  const selection = codingRuntimeSelectionByProject.get(projectId);
  let resolvedRuntimeType = typeof runtimeType === 'string' ? runtimeType : selection?.runtimeType ?? 'opencode';
  const autoSelection = selection?.classification && selection?.routeDecision
    ? { classification: selection.classification, routeDecision: selection.routeDecision }
    : undefined;

  if (resolvedRuntimeType === 'auto') {
    if (!selection?.runtimeType) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No auto-selected runtime session. Call /session first.'));
    }
    resolvedRuntimeType = selection.runtimeType;
  }

  const runtime = getRuntime(resolvedRuntimeType as never);
  if (!runtime) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, `Unknown runtime: ${resolvedRuntimeType}`));
  const state = runtime.getState(projectId);
  if (!state || state.status !== 'ready') return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'No ready session. Call /session first.'));
  const daytonaUrl = (process.env.DAYTONA_SERVER_URL ?? 'http://localhost:3900/api').replace(/\/api\/?$/, '');

  // Auto-enrichment: in `auto` mode, turn on code-context and memory by default
  // for code-touching categories so callers don't have to opt in. Explicit
  // request flags always win (e.g. pass codeContext:false to force off).
  const autoEnrich = runtimeType === 'auto';
  const routedCategory = (autoSelection?.routeDecision as { category?: string } | undefined)?.category
    || (autoSelection?.classification as { category?: string } | undefined)?.category;
  const CODE_CATEGORIES = new Set(['feature', 'bug-fix', 'debug', 'refactor', 'visual', 'test']);
  const effectiveCodeContext = typeof codeContext === 'boolean'
    ? codeContext
    : autoEnrich && !!routedCategory && CODE_CATEGORIES.has(routedCategory);
  const effectiveUseMemory = typeof useMemory === 'boolean' ? useMemory : autoEnrich;

  // Optionally enrich the prompt with up-to-date library docs (Context7).
  // Deterministic + fail-safe: missing/errored docs simply aren't injected.
  let effectivePrompt = prompt;
  if (Array.isArray(injectDocs) && injectDocs.length > 0) {
    try {
      const { getDocsForQuery } = await import('./context7-client.js');
      const libraries = injectDocs.filter((l: unknown): l is string => typeof l === 'string' && l.trim().length > 0).slice(0, 5);
      const sections = await Promise.all(
        libraries.map(async (library) => {
          const result = await getDocsForQuery({ libraryName: library, query: prompt });
          return result.docs ? `### ${result.resolved?.title ?? library}\n${result.docs}` : null;
        }),
      );
      const docs = sections.filter(Boolean).join('\n\n');
      if (docs) {
        effectivePrompt = `You have the following up-to-date library documentation. Prefer these current APIs over prior knowledge.\n\n<library-docs>\n${docs}\n</library-docs>\n\n---\n\n${prompt}`;
      }
    } catch (err) {
      logger.warn({ err, projectId }, 'Context7 doc injection failed; proceeding without docs');
    }
  }

  // Optionally inject a compact project-structure summary from the auto-built
  // code graph. Opt-in via codeContext; fail-safe; composes with the blocks below.
  if (effectiveCodeContext) {
    try {
      const { getStoredGraph, summarizeGraph } = await import('./code-graph.js');
      const graph = getStoredGraph(projectId);
      if (graph && graph.stats.files > 0) {
        const summary = summarizeGraph(graph);
        effectivePrompt = `Here is the structure of the project you are working in (files and their key symbols). Use it to locate code; do not re-discover it.\n\n<project-structure>\n${summary}\n</project-structure>\n\n---\n\n${effectivePrompt}`;
      }
    } catch (err) {
      logger.warn({ err, projectId }, 'code-context injection failed; proceeding without it');
    }
  }

  // Optionally recall relevant memories (mem0) and prepend them to the prompt.
  // Opt-in via useMemory; fail-safe; composes with the library-docs block above.
  const memoryEnabled = effectiveUseMemory && !!userId && userId !== 'anonymous' && !userId.startsWith('anon_');
  if (memoryEnabled) {
    try {
      const { mem0Search } = await import('./mem0-client.js');
      const limit = typeof memoryLimit === 'number' && memoryLimit > 0 ? Math.min(memoryLimit, 20) : 5;
      const recall = await mem0Search(prompt, { userId, runId: projectId }, limit);
      const lines = recall.results.map((r) => (typeof r.memory === 'string' ? `- ${r.memory}` : '')).filter(Boolean);
      if (lines.length > 0) {
        effectivePrompt = `You have the following relevant memories from prior work for this user/project. Use them as context when helpful; ignore if irrelevant.\n\n<relevant-memories>\n${lines.join('\n')}\n</relevant-memories>\n\n---\n\n${effectivePrompt}`;
      }
    } catch (err) {
      logger.warn({ err, projectId }, 'mem0 recall failed; proceeding without memories');
    }
  }

  // Persist the exchange to mem0 after a successful run (fire-and-forget).
  const persistMemory = (runResult: { error?: unknown; parts?: Array<{ type: string; content?: string }> }, succeeded: boolean): void => {
    if (!memoryEnabled || !succeeded) return;
    const resultText = (runResult.parts ?? [])
      .filter((p) => p.type === 'text')
      .map((p) => p.content ?? '')
      .join('\n')
      .trim();
    if (!resultText) return;
    void (async () => {
      try {
        const { mem0Add } = await import('./mem0-client.js');
        await mem0Add(
          [{ role: 'user', content: prompt }, { role: 'assistant', content: resultText }],
          { userId, runId: projectId, metadata: { runtimeType: resolvedRuntimeType, agent } },
        );
      } catch { /* memory persistence is best-effort */ }
    })();
  };

  const promptParams = {
    projectId, prompt: effectivePrompt, agent,
    sandboxExecUrl: `${daytonaUrl}/api/toolbox/${state.sandboxId}/toolbox/process/execute`,
    daytonaApiKey: process.env.DAYTONA_API_KEY ?? '',
  };

  const shouldRunCompletionLoop = (enableCompletionLoop === true || runtimeType === 'auto') && resolvedRuntimeType !== 'native';

  if (shouldRunCompletionLoop) {
    const { runWithCompletionLoop } = await import('./a2a/completion-loop.js');
    const outcome = await runWithCompletionLoop(runtime, promptParams, {
      maxIterations: typeof maxIterations === 'number' ? maxIterations : 3,
      backoffMs: typeof backoffMs === 'number' ? backoffMs : 1000,
    });
    getCodingRuntimeHistoryService().recordPromptRun({
      projectId,
      runtimeType: resolvedRuntimeType,
      requestedRuntimeType: typeof runtimeType === 'string' ? runtimeType : 'session-default',
      prompt,
      agent,
      autoSelection,
      completionLoop: {
        enabled: true,
        completed: outcome.completed,
        iterations: outcome.iterations,
      },
    });

    // Compound skills: record which runtime succeeded at which task category.
    void (async () => {
      try {
        const { recordTaskOutcome } = await import('./agent-skill-profile.js');
        const category = (autoSelection?.routeDecision as { category?: string } | undefined)?.category
          || (autoSelection?.classification as { category?: string } | undefined)?.category;
        recordTaskOutcome({
          agentId: `runtime:${resolvedRuntimeType}`,
          skills: [category || 'general'],
          success: outcome.completed && !outcome.result.error,
        });
      } catch { /* skill tracking is best-effort */ }
    })();

    persistMemory(outcome.result, outcome.completed && !outcome.result.error);

    return sendSuccess(res, {
      ...outcome.result,
      selectedRuntime: resolvedRuntimeType,
      autoSelection,
      completed: outcome.completed,
      iterations: outcome.iterations,
      history: outcome.history,
    });
  }

  const result = await runtime.sendPrompt(promptParams);
  getCodingRuntimeHistoryService().recordPromptRun({
    projectId,
    runtimeType: resolvedRuntimeType,
    requestedRuntimeType: typeof runtimeType === 'string' ? runtimeType : 'session-default',
    prompt,
    agent,
    autoSelection,
    completionLoop: {
      enabled: false,
    },
  });

  // Compound skills: record which runtime succeeded at which task category.
  void (async () => {
    try {
      const { recordTaskOutcome } = await import('./agent-skill-profile.js');
      const category = (autoSelection?.routeDecision as { category?: string } | undefined)?.category
        || (autoSelection?.classification as { category?: string } | undefined)?.category;
      recordTaskOutcome({
        agentId: `runtime:${resolvedRuntimeType}`,
        skills: [category || 'general'],
        success: !result.error && Array.isArray(result.parts) && result.parts.length > 0,
      });
    } catch { /* skill tracking is best-effort */ }
  })();

  persistMemory(result, !result.error && Array.isArray(result.parts) && result.parts.length > 0);

  sendSuccess(res, {
    ...result,
    selectedRuntime: resolvedRuntimeType,
    autoSelection,
  });
}));

app.get('/api/coding-runtime/history/:projectId', authenticateRequest, flexibleProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { getCodingRuntimeHistoryService } = await import('./coding-runtime-history.js');
  const projectId = String(req.params.projectId || '').trim();
  if (!projectId) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'projectId required'));
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
  const historyService = getCodingRuntimeHistoryService();

  sendSuccess(res, {
    projectId,
    entries: historyService.listProjectHistory(projectId, limit),
    total: historyService.getProjectHistoryCount(projectId),
    activeSelection: codingRuntimeSelectionByProject.get(projectId) ?? null,
  });
}));

app.get('/api/coding-runtime/runtimes', (_req, res) => {
  import('./a2a/coding-runtime.js').then(({ listRuntimes, getRuntimeCatalog }) => {
    sendSuccess(res, {
      runtimes: ['auto', ...listRuntimes()],
      catalog: getRuntimeCatalog(),
    });
  });
});

// ── E2B Secure Runner API ───────────────────────────────────────────────────
// Run AI-generated code / shell commands in secure, ephemeral E2B sandboxes.
// Fail-safe: when the SDK or E2B_API_KEY is missing, health reports the reason
// and exec/run return explicit errors — never fake success.

app.use(createE2bRouter({ authenticateRequest }));

// ── Browser Verification API ────────────────────────────────────────────────
// Drive a headless browser to verify a preview URL actually renders/behaves.
// Deterministic checks (Puppeteer) + optional AI checks (Stagehand, fail-safe).

app.use(createBrowserVerifyRouter({ authenticateRequest }));

// ── mem0 Intelligent Agent Memory API ───────────────────────────────────────
// LLM-managed memory (extract/dedupe/update) on top of the raw Qdrant store.
// Fail-safe: reports availability truthfully; recall returns empty when off.

app.use(createMem0Router({ authenticateRequest }));

// ── Context7 Up-to-date Docs API ────────────────────────────────────────────
// Resolve a library and fetch current docs to inject into coding-agent context.

app.use(createContext7Router({ authenticateRequest }));

// ── Platform Capabilities Aggregator ────────────────────────────────────────
// Single call reporting the status of every agent capability, so UIs and
// monitoring can discover what's wired and what needs configuration.

app.get('/api/capabilities', asyncHandler(async (_req: express.Request, res: express.Response) => {
  const [
    { listRuntimes, getRuntimeCatalog },
    { e2bHealth },
    { browserVerifyHealth },
    { mem0Health },
    { context7Health },
  ] = await Promise.all([
    import('./a2a/coding-runtime.js'),
    import('./e2b-client.js'),
    import('./browser-verify.js'),
    import('./mem0-client.js'),
    import('./context7-client.js'),
  ]);

  const [e2b, browser, mem0] = await Promise.all([
    e2bHealth(),
    browserVerifyHealth(),
    mem0Health(),
  ]);

  sendSuccess(res, {
    codingRuntimes: {
      available: true,
      runtimes: listRuntimes(),
      catalog: getRuntimeCatalog(),
    },
    secureRunner: e2b,
    browserVerification: browser,
    agentMemory: mem0,
    libraryDocs: context7Health(),
    codeIntelligence: { available: true },
    llmRouter: (await import('./llm-router.js')).llmRouterHealth(),
    agentSkills: { available: true, trackedAgents: (await import('./agent-skill-profile.js')).listProfiles().length },
    zeroTrustNetwork: await (await import('./ziti-client.js')).zitiHealth(),
    billing: await (await import('./polar-client.js')).polarHealth(),
    agentCollaboration: {
      available: true,
      squads: (await import('./a2a/squad.service.js')).listSquads().length,
    },
  });
}));

// ── Squads API (agent + human teams) ────────────────────────────────────────
// Named teams with a leader, per-member roles, and an activity log. Work can be
// assigned to a team, not just a single agent.

app.get('/api/a2a/squads', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { listSquads } = await import('./a2a/squad.service.js');
  sendSuccess(res, { squads: listSquads(req.userId) });
}));

app.post('/api/a2a/squads', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { name, description, leaderId, projectId, members } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'name (string) is required'));
  }
  if (members !== undefined && !Array.isArray(members)) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'members must be an array'));
  }
  if (projectId !== undefined && typeof projectId !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'projectId must be a string'));
  }
  const { createSquad } = await import('./a2a/squad.service.js');
  sendSuccess(res, createSquad({ name, description, leaderId, projectId, members, ownerId: req.userId! }));
}));

app.post('/api/a2a/squads/import', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const data = req.body ?? {};
  if (typeof data.name !== 'string' || !data.name.trim()) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'name (string) is required'));
  }
  if (data.members !== undefined && !Array.isArray(data.members)) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'members must be an array'));
  }
  if (data.projectId !== undefined && typeof data.projectId !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'projectId must be a string'));
  }
  const { importSquad } = await import('./a2a/squad.service.js');
  sendSuccess(res, importSquad(data, req.userId!));
}));

app.get('/api/a2a/squads/:id', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { getSquad } = await import('./a2a/squad.service.js');
  const squad = getSquad(req.params.id);
  if (!squad) return sendError(res, createError(ErrorCode.NOT_FOUND, 'squad not found'));
  if (req.query.withPresence === 'true') {
    const { buildPresenceMap } = await import('./a2a/presence.service.js');
    const agentIds = squad.members.filter((m) => m.kind === 'agent').map((m) => m.id);
    const presence = await buildPresenceMap(agentIds);
    return sendSuccess(res, { ...squad, presence });
  }
  sendSuccess(res, squad);
}));

app.patch('/api/a2a/squads/:id', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { name, description, leaderId, projectId } = req.body ?? {};
  if (projectId !== undefined && projectId !== null && typeof projectId !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'projectId must be a string or null'));
  }
  const { updateSquad } = await import('./a2a/squad.service.js');
  const squad = updateSquad(req.params.id, { name, description, leaderId, projectId }, req.userId!);
  if (!squad) return sendError(res, createError(ErrorCode.NOT_FOUND, 'squad not found'));
  sendSuccess(res, squad);
}));

app.delete('/api/a2a/squads/:id', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { deleteSquad } = await import('./a2a/squad.service.js');
  sendSuccess(res, { deleted: deleteSquad(req.params.id) });
}));

app.post('/api/a2a/squads/:id/clone', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { cloneSquad } = await import('./a2a/squad.service.js');
  const squad = cloneSquad(req.params.id, req.userId!);
  if (!squad) return sendError(res, createError(ErrorCode.NOT_FOUND, 'squad not found'));
  sendSuccess(res, squad);
}));

app.get('/api/a2a/squads/:id/export', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { exportSquad } = await import('./a2a/squad.service.js');
  const portable = exportSquad(req.params.id);
  if (!portable) return sendError(res, createError(ErrorCode.NOT_FOUND, 'squad not found'));
  sendSuccess(res, portable);
}));

app.post('/api/a2a/squads/:id/members', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { id, kind, role, projectId } = req.body ?? {};
  if (typeof id !== 'string' || !id.trim()) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'member id (string) is required'));
  }
  if (projectId !== undefined && typeof projectId !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'projectId must be a string'));
  }
  const { addMember } = await import('./a2a/squad.service.js');
  const squad = addMember(req.params.id, { id, kind, role, projectId }, req.userId!);
  if (!squad) return sendError(res, createError(ErrorCode.NOT_FOUND, 'squad not found'));
  sendSuccess(res, squad);
}));

app.patch('/api/a2a/squads/:id/members/:memberId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { role, projectId } = req.body ?? {};
  if (role !== undefined && typeof role !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'role must be a string'));
  }
  if (projectId !== undefined && projectId !== null && typeof projectId !== 'string') {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'projectId must be a string or null'));
  }
  if (role === undefined && projectId === undefined) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'role or projectId is required'));
  }
  const { setMemberRole } = await import('./a2a/squad.service.js');
  const squad = setMemberRole(req.params.id, req.params.memberId, role, req.userId!, { projectId });
  if (!squad) return sendError(res, createError(ErrorCode.NOT_FOUND, 'squad or member not found'));
  sendSuccess(res, squad);
}));

app.delete('/api/a2a/squads/:id/members/:memberId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { removeMember } = await import('./a2a/squad.service.js');
  const squad = removeMember(req.params.id, req.params.memberId, req.userId!);
  if (!squad) return sendError(res, createError(ErrorCode.NOT_FOUND, 'squad not found'));
  sendSuccess(res, squad);
}));

// ── Squad task dispatch (assign work to a team) ─────────────────────────────

app.post('/api/a2a/squads/:id/dispatch', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { task, strategy, projectId, execute, createSandbox } = req.body ?? {};
  if (typeof task !== 'string' || !task.trim()) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'task (string) is required'));
  }
  if (strategy !== undefined && !['all', 'leader', 'round-robin', 'best-match'].includes(strategy)) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'strategy must be all|leader|round-robin|best-match'));
  }
  const { dispatchToSquad } = await import('./a2a/squad-dispatch.service.js');
  const result = await dispatchToSquad({ squadId: req.params.id, task: task.trim(), strategy, createdBy: req.userId! });
  if (!result.ok) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, result.reason ?? 'dispatch failed'));
  const explicitProjectId = typeof projectId === 'string' && projectId.trim() ? projectId.trim() : undefined;
  const { resolveSquadDispatchProject } = await import('./a2a/squad.service.js');
  const resolvedProject = resolveSquadDispatchProject({
    squadId: req.params.id,
    assignedMemberIds: result.squadTask?.assignments.map((a) => a.memberId) ?? [],
    explicitProjectId,
  });
  const resolvedProjectId = resolvedProject.projectId;
  const projectSource = resolvedProject.source;

  // Optional real execution on a project's coding runtime. Session-on-demand:
  // if no ready session exists, start one on the project's EXISTING container
  // (reuses the proven session-start path; never creates a sandbox from
  // nothing). We resolve readiness synchronously so the response can report the
  // TRUTH — requested/started/reason — and only the long agent run is deferred.
  const execution: { requested: boolean; started: boolean; reason?: string; projectId?: string; projectSource?: string } = {
    requested: execute === true,
    started: false,
    projectId: resolvedProjectId,
    projectSource,
  };
  if (execution.requested) {
    try {
      if (!resolvedProjectId) {
        execution.reason = 'no project mapping for this dispatch — set a squad default project, an agent project, or pass projectId';
      }
      const { getRuntime } = await import('./a2a/coding-runtime.js');
      const selection = resolvedProjectId ? codingRuntimeSelectionByProject.get(resolvedProjectId) : undefined;
      const runtimeType = selection?.runtimeType ?? 'opencode';
      const runtime = getRuntime(runtimeType as never);
      const daytonaUrl = (process.env.DAYTONA_SERVER_URL ?? 'http://localhost:3900/api').replace(/\/api\/?$/, '');

      if (execution.reason) {
        // The task is still dispatched to the squad; only runtime execution is skipped.
      } else if (!runtime) {
        execution.reason = `coding runtime '${runtimeType}' unavailable`;
      } else {
        const runtimeProjectId = resolvedProjectId!;
        let state = runtime.getState(runtimeProjectId);
        if (!state || state.status !== 'ready') {
          let entry = await getOrRecoverContainer(runtimeProjectId);
          // Container-from-nothing: opt-in `createSandbox` provisions a fresh
          // sandbox when the project has none, so dispatch can run end-to-end
          // without first opening the project in the web IDE.
          if (!entry && createSandbox === true) {
            try {
              entry = await provisionDaytonaSandboxForProject(runtimeProjectId, req.userId!);
              if (!entry) execution.reason = 'sandbox provisioning unavailable (Daytona not configured)';
            } catch (provErr) {
              execution.reason = 'sandbox provisioning failed';
              logger.warn({ provErr, projectId: runtimeProjectId }, 'squad dispatch sandbox provisioning failed');
            }
          }
          if (!entry && !execution.reason) {
            execution.reason = 'no sandbox for this project — dispatch with createSandbox:true to provision one, or open it in the IDE first';
          } else if (entry) {
            await runtime.startSession({
              projectId: runtimeProjectId,
              sandboxId: entry.id,
              sandboxExecUrl: `${daytonaUrl}/api/toolbox/${entry.id}/toolbox/process/execute`,
              daytonaApiKey: process.env.DAYTONA_API_KEY ?? '',
            });
            state = runtime.getState(runtimeProjectId);
          }
        }

        if (!execution.reason && state && state.status === 'ready') {
          execution.started = true;
          const readySandboxId = state.sandboxId;
          // Readiness is confirmed; defer only the long-running agent prompt.
          void runtime
            .sendPrompt({
              projectId: runtimeProjectId,
              prompt: task.trim(),
              sandboxExecUrl: `${daytonaUrl}/api/toolbox/${readySandboxId}/toolbox/process/execute`,
              daytonaApiKey: process.env.DAYTONA_API_KEY ?? '',
            })
            .catch((err) => logger.warn({ err, projectId: runtimeProjectId }, 'squad dispatch sendPrompt failed'));
        } else if (!execution.reason) {
          execution.reason = 'coding runtime session not ready';
        }
      }
    } catch (err) {
      execution.reason = 'execution attempt failed';
      logger.warn({ err, projectId: resolvedProjectId }, 'squad dispatch on-demand coding-runtime execution failed');
    }
  }

  // `executed` kept for backward compatibility; `execution` carries the truth.
  sendSuccess(res, { ...result.squadTask, deliveredTo: result.deliveredTo ?? [], executed: execution.started, execution });
}));

// Cross-squad board: every task across the caller's squads, enriched with the
// squad name so the frontend doesn't need an N+1 join. Scoped to squads the
// caller owns so the board never leaks another user's dispatches.
app.get('/api/a2a/squad-tasks', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { listAllSquadTasks } = await import('./a2a/squad-dispatch.service.js');
  const { listSquads } = await import('./a2a/squad.service.js');
  const squads = listSquads(req.userId!);
  const nameById = new Map(squads.map((s) => [s.id, s.name]));
  const tasks = listAllSquadTasks(squads.map((s) => s.id)).map((t) => ({
    ...t,
    squadName: nameById.get(t.squadId) ?? t.squadId,
  }));
  sendSuccess(res, { tasks });
}));

app.get('/api/a2a/squads/:id/tasks', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { listSquadTasks } = await import('./a2a/squad-dispatch.service.js');
  sendSuccess(res, { tasks: listSquadTasks(req.params.id) });
}));

// Per-agent run history: every squad-task assignment for one agent, newest
// first, enriched with the squad name. Powers the agent drill-down beyond skills.
app.get('/api/a2a/agents/:agentId/assignments', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { getAgentAssignments } = await import('./a2a/squad-dispatch.service.js');
  const { listSquads } = await import('./a2a/squad.service.js');
  const nameById = new Map(listSquads(req.userId!).map((s) => [s.id, s.name]));
  const assignments = getAgentAssignments(req.params.agentId).map((a) => ({
    ...a,
    squadName: nameById.get(a.squadId) ?? a.squadId,
  }));
  sendSuccess(res, { assignments });
}));

app.get('/api/a2a/squads/:id/stats', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { getSquadStats } = await import('./a2a/squad-dispatch.service.js');
  sendSuccess(res, getSquadStats(req.params.id));
}));

app.post('/api/a2a/squad-tasks/:taskId/assignments/:memberId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { status } = req.body ?? {};
  if (!['queued', 'in_progress', 'completed', 'failed'].includes(status)) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'status must be queued|in_progress|completed|failed'));
  }
  const { transitionAssignment } = await import('./a2a/squad-dispatch.service.js');
  const result = await transitionAssignment(req.params.taskId, req.params.memberId, status, req.userId!);
  if (!result.ok) return sendError(res, createError(ErrorCode.NOT_FOUND, result.reason ?? 'transition failed'));
  sendSuccess(res, result.squadTask);
}));

// ── Collaboration activity feed (across all squads) ─────────────────────────

app.get('/api/a2a/collaboration/feed', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { getCollabFeed } = await import('./a2a/collab-feed.service.js');
  const limit = Number(req.query.limit) || 50;
  sendSuccess(res, { feed: await getCollabFeed({ ownerId: req.userId, limit }) });
}));

app.get('/api/a2a/collaboration/summary', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { getCollabSummary } = await import('./a2a/collab-feed.service.js');
  sendSuccess(res, await getCollabSummary({ ownerId: req.userId }));
}));

app.get('/api/a2a/collaboration/events', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { recentCollabEvents } = await import('./a2a/collab-events.service.js');
  sendSuccess(res, { events: recentCollabEvents(Number(req.query.limit) || 50) });
}));

app.get('/api/a2a/collaboration/roster', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { getRoster } = await import('./a2a/collab-feed.service.js');
  sendSuccess(res, { roster: await getRoster({ ownerId: req.userId }) });
}));

// ── Workflow step runner (llm/http/code/branch/trigger/squad steps) ─────────
// Exposes the step executor so composed step lists (incl. squad steps) run via HTTP.

app.post('/api/workflows/run-steps', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { steps, context } = req.body ?? {};
  if (!Array.isArray(steps) || steps.length === 0) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'steps (non-empty array) is required'));
  }
  const valid = steps.every((s) => s && typeof s.type === 'string' && typeof s.name === 'string' && typeof s.config === 'object');
  if (!valid) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'each step needs { type, name, config }'));
  }
  const { executeWorkflowSteps } = await import('./a2a/workflow-step-executor.js');
  const ctx = { ...(context && typeof context === 'object' ? context : {}), _userId: req.userId };
  const result = await executeWorkflowSteps(steps, ctx);
  sendSuccess(res, result);
}));

// Live Server-Sent Events stream of collaboration events (real-time consumers).
app.get('/api/a2a/collaboration/stream', promoteQueryToken, authenticateRequest, (req: AuthenticatedRequest, res: express.Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  (res as express.Response & { flushHeaders?: () => void }).flushHeaders?.();

  const send = (event: unknown) => {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* client gone */ }
  };

  void import('./a2a/collab-events.service.js').then(({ recentCollabEvents, subscribeCollab }) => {
    recentCollabEvents(20).reverse().forEach(send);
    const unsubscribe = subscribeCollab(send);
    const keepAlive = setInterval(() => {
      try { res.write(': keepalive\n\n'); } catch { /* ignore */ }
    }, 25_000);
    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });
});

// ── Agent Presence API (availability × workload) ────────────────────────────

app.get('/api/a2a/presence', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const idsParam = (req.query.agentIds as string | undefined) ?? '';
  const agentIds = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
  if (agentIds.length === 0) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'agentIds (comma-separated) is required'));
  }
  const { buildPresenceMap } = await import('./a2a/presence.service.js');
  sendSuccess(res, { presence: await buildPresenceMap(agentIds) });
}));

app.get('/api/a2a/presence/:agentId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { getPresence } = await import('./a2a/presence.service.js');
  sendSuccess(res, await getPresence(req.params.agentId));
}));

app.post('/api/a2a/presence/:agentId/workload', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { active, queued } = req.body ?? {};
  const { setWorkload, getPresence } = await import('./a2a/presence.service.js');
  setWorkload(req.params.agentId, {
    active: typeof active === 'number' ? active : undefined,
    queued: typeof queued === 'number' ? queued : undefined,
  });
  sendSuccess(res, await getPresence(req.params.agentId));
}));

// ── Billing (Polar) API ─────────────────────────────────────────────────────
// Additive, fail-safe billing via Polar. Does not touch existing entitlements.

// Billing (Polar) health/products/checkout/subscriptions routes extracted to ./routes/billing-polar.routes.ts (behavior-preserving move)
app.use(createBillingPolarRouter({ authenticateRequest }));

// ── Zero-Trust Network (OpenZiti) API ───────────────────────────────────────
// Provision zero-trust identities/enrollment for runners. Fail-safe.

app.use(createZitiRouter({ authenticateRequest }));

// ── Agent Skill Profiles API (dynamic, outcome-driven proficiency) ──────────
// Compound skills: record task outcomes and rank agents by demonstrated ability.

app.use(createAgentSkillProfilesRouter({ authenticateRequest }));

// ── Unified Multi-Model LLM Router API ──────────────────────────────────────
// One endpoint routes to any provider by `provider/model`, BYOK-aware.

app.use(createLlmRouterRouter({ authenticateRequest }));

// ── TensorZero LLM Gateway API ───────────────────────────────────────────────
// Degrade-safe loopback adapter for TensorZero (crates/tensorzero). Surfaces
// inference logging + routing at /api/gateway/*. Returns 503 when unconfigured.

app.use(createTensorzeroRouter({ authenticateRequest }));

// ── Multica Managed-Agents / Squads API ──────────────────────────────────────
// Degrade-safe loopback adapter for the Multica managed-agents platform.
// Surfaces squad/assignment status at /api/multica/*. Returns 503 when
// unconfigured (no MULTICA_URL or prebuilt binary). Local squad.service.ts
// remains authoritative; Multica is an optional enrichment layer.

app.use(createMulticaRouter({ authenticateRequest }));

// ── Retrieval API (ColBERT reranker + LanceDB vector store) ────────────────
// Degrade-safe RAG/retrieval surface at /api/retrieval/*.
// POST /api/retrieval/search — vector search + optional ColBERT reranking.
// GET  /api/retrieval/health — public capability health (no auth).
// Returns 503 when COLBERT_RERANK_URL and LANCE_DB_PATH are not set.

app.use(createRetrievalRouter({ authenticateRequest }));

// ── Code Intelligence API (code knowledge graph) ────────────────────────────
// Build a queryable symbol/import graph from project files so agents can
// navigate a codebase: find symbols, list a file's exports, who-imports, deps.

app.use(createCodeGraphRouter({ authenticateRequest }));

// ── Agent Terminal Registry ─────────────────────────────────────────────────
// Per-terminal discovery so the system knows exactly how many Claude Code,
// Codex, OpenCode, etc. instances are connected and can route to each one.

app.post('/api/a2a/terminals/register', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { registerTerminal } = await import('./a2a/agent-terminal-registry.js');
  const { agentType, sessionId, displayName, callbackUrl, projectId, workspaceDir, capabilities, version, hostname } = req.body || {};
  if (!agentType || typeof agentType !== 'string') {
    return res.status(400).json({ success: false, error: 'agentType is required' });
  }
  const session = registerTerminal({
    agentType,
    sessionId: typeof sessionId === 'string' ? sessionId : undefined,
    displayName: typeof displayName === 'string' ? displayName : undefined,
    callbackUrl: typeof callbackUrl === 'string' ? callbackUrl : undefined,
    projectId: typeof projectId === 'string' ? projectId : undefined,
    workspaceDir: typeof workspaceDir === 'string' ? workspaceDir : undefined,
    capabilities: Array.isArray(capabilities) ? capabilities : undefined,
    version: typeof version === 'string' ? version : undefined,
    hostname: typeof hostname === 'string' ? hostname : undefined,
  });
  sendSuccess(res, session);
}));

app.post('/api/a2a/terminals/:sessionId/heartbeat', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { heartbeat } = await import('./a2a/agent-terminal-registry.js');
  const ok = heartbeat(req.params.sessionId, req.body);
  if (!ok) return res.status(404).json({ success: false, error: 'Terminal not found' });
  sendSuccess(res, { ok: true });
}));

app.delete('/api/a2a/terminals/:sessionId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { deregisterTerminal } = await import('./a2a/agent-terminal-registry.js');
  deregisterTerminal(req.params.sessionId);
  sendSuccess(res, { ok: true });
}));

app.get('/api/a2a/terminals', authenticateRequest, asyncHandler(async (_req, res) => {
  const { listTerminals, getSummary } = await import('./a2a/agent-terminal-registry.js');
  sendSuccess(res, { terminals: listTerminals(), summary: getSummary() });
}));

app.get('/api/a2a/terminals/summary', authenticateRequest, asyncHandler(async (_req, res) => {
  const { getSummary } = await import('./a2a/agent-terminal-registry.js');
  sendSuccess(res, getSummary());
}));

app.post('/api/a2a/terminals/:sessionId/push', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { pushToTerminal } = await import('./a2a/agent-terminal-registry.js');
  const ok = await pushToTerminal(req.params.sessionId, req.body);
  sendSuccess(res, { delivered: ok });
}));

// Wire the A2A event bridge (TaskLifecycleService audit -> SSE event bus)
wireA2AEventBridge();

// Wire cross-subsystem integration (delegation→queue, queue→messaging, etc.)
getIntegrationWiringService().wireAll();

// Wire autonomous @mention routing (collaboration mentions → delegation handoff)
wireAutonomousRouting();
logger.info('autonomous @mention routing wired');

// Start heartbeat tracker background sweep
getHeartbeatTracker().start();

// Wire Redis-backed A2A shared control plane (non-blocking)
// Falls through to existing in-memory behavior if REDIS_URL is not set.
if (process.env.REDIS_URL) {
  (async () => {
    try {
      const { createProductionA2AControlPlaneFromRedis } = await import('@recoder/shared/a2a');
      const { controlPlane, adapter } = await createProductionA2AControlPlaneFromRedis({
        redisUrl: process.env.REDIS_URL!,
      });
      _a2aRedisAdapter = adapter;
      startupInfo('a2a-control-plane', 'Redis-backed control plane active', {
        redisUrl: process.env.REDIS_URL!.replace(/\/\/.*@/, '//***@'),
      });
      // The controlPlane instance is available for downstream consumers that need
      // the shared-package A2AControlPlane (registry, persistent task store, audit
      // log, and collaboration service all backed by Redis).
      // Expose on globalThis so other modules can discover it at runtime.
      (globalThis as any).__a2aSharedControlPlane = controlPlane;
    } catch (err) {
      logger.warn({ err }, 'Failed to initialize Redis-backed A2A control plane; falling back to in-memory');
    }
  })();
} else {
  startupInfo('a2a-control-plane', 'using in-memory A2A control plane (no REDIS_URL)');
}

const agentCardBaseUrl = process.env.DOCKER_BACKEND_PUBLIC_URL || process.env.RECODER_DOCKER_BACKEND_URL || 'https://docker.recoder.xyz';
app.get('/.well-known/agent-card.json', (_req, res) => {
  res.status(200).json(getDockerBackendAgentCard(agentCardBaseUrl));
});

// Polar.sh webhook endpoint
const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || '';
if (POLAR_WEBHOOK_SECRET) {
  app.post('/api/webhooks/polar', express.raw({ type: 'application/json' }), createPolarWebhookHandler(POLAR_WEBHOOK_SECRET));
  startupInfo('routes.polar-webhook', 'registered', { path: '/api/webhooks/polar' });
} else {
  logger.info('POLAR_WEBHOOK_SECRET not set, Polar.sh webhooks disabled');
}

// ==================== Integrations Health API ====================
// Extracted to ./routes/integrations-health.routes.ts (see createIntegrationsHealthRouter)
// ============================================================
app.use(createIntegrationsHealthRouter({ authenticateRequest }));

// List sandboxes via the owned Daytona SDK (@recoder/sandbox-daytona) when the
// SDK-backed path is enabled (DAYTONA_USE_SDK). Degrades gracefully otherwise.
app.get('/api/daytona/sdk/sandboxes', authenticateRequest, async (_req: AuthenticatedRequest, res) => {
  const { getDaytonaSdk, isDaytonaSdkEnabled } = await import('./daytona-sdk.js');
  if (!isDaytonaSdkEnabled()) {
    res.json({ success: true, data: { enabled: false, sandboxes: [] } });
    return;
  }
  try {
    const result = await getDaytonaSdk().list();
    res.json({ success: true, data: { enabled: true, result } });
  } catch (err) {
    res.status(502).json({ success: false, error: err instanceof Error ? err.message : 'daytona sdk list failed' });
  }
});

// Live library documentation via the owned Context7 docs SDK (@recoder/context7-sdk).
app.get('/api/context7/docs', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  const library = String(req.query?.library ?? '');
  const query = String(req.query?.q ?? req.query?.query ?? '');
  if (!library) {
    res.status(400).json({ success: false, error: 'library query param is required' });
    return;
  }
  const { fetchLibraryDocs } = await import('./context7.js');
  const result = await fetchLibraryDocs(library, query);
  res.json({ success: true, data: result });
});

// Current user's entitlement tier, resolved on-demand from their active Polar
// subscription (links billing/polar-webhook subscription state -> tier + limits).
app.get('/api/billing/tier', authenticateRequest, async (req: AuthenticatedRequest, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'unauthenticated' });
    return;
  }
  const { resolveUserTier } = await import('./billing/subscription-tier.js');
  const { getTierResourceLimits } = await import('./resources/tier-limits.js');
  const tier = resolveUserTier(userId);
  res.json({ success: true, data: { tier, limits: getTierResourceLimits(tier) } });
});

// Handle Polar webhook events - provision/deprovision resources on subscription changes
onWebhookEvent('subscription.active', async (data: any) => {
  logger.info({ subscriptionId: data.id, productId: data.product_id }, 'subscription activated — provisioning resources');

  // Resolve the user from the subscription's customer record
  const { getCustomerByPolarId } = await import('./billing/polar-webhook.js');
  const customer = getCustomerByPolarId(data.customer_id);
  if (!customer) {
    logger.warn({ customerId: data.customer_id }, 'subscription.active: customer not found, skipping provisioning');
    return;
  }

  // Map Polar product IDs to tier (product IDs come from env or use a naming convention)
  const proProductId =
    process.env.POLAR_PRO_PRODUCT_ID ||
    process.env.POLAR_PRODUCT_PRO_ID ||
    process.env.POLAR_PRODUCT_PRO ||
    '';
  const enterpriseProductId =
    process.env.POLAR_ENTERPRISE_PRODUCT_ID ||
    process.env.POLAR_PRODUCT_ENTERPRISE_ID ||
    process.env.POLAR_PRODUCT_ENTERPRISE ||
    '';
  const { resolveTierFromProductId } = await import('./billing/subscription-tier.js');
  const tier = resolveTierFromProductId({
    productId: data.product_id,
    proProductId,
    enterpriseProductId,
  });

  // Update the execution tracker with the new tier (affects resource limits immediately)
  const { executionTracker } = await import('./resources/execution-limits.js');
  executionTracker.updateUserTier(customer.userId, tier);

  logger.info({ userId: customer.userId, tier }, 'subscription.active: resources provisioned');
});

onWebhookEvent('subscription.canceled', async (data: any) => {
  logger.info({ subscriptionId: data.id }, 'subscription canceled — deprovisioning resources');

  const { getCustomerByPolarId } = await import('./billing/polar-webhook.js');
  const customer = getCustomerByPolarId(data.customer_id);
  if (!customer) {
    logger.warn({ customerId: data.customer_id }, 'subscription.canceled: customer not found, skipping deprovisioning');
    return;
  }

  // Downgrade user to free tier
  const { SubscriptionTier } = await import('./resources/types.js');
  const { executionTracker } = await import('./resources/execution-limits.js');
  executionTracker.updateUserTier(customer.userId, SubscriptionTier.FREE);

  logger.info({ userId: customer.userId }, 'subscription.canceled: downgraded to free tier');
});

// ==================== API Key Management Endpoints ====================

// API key management routes (list/create/delete/revoke/usage) extracted to ./routes/api-keys.routes.ts (behavior-preserving move)
app.use(createApiKeysRouter({ authenticateRequest }));

logger.info('API key management endpoints registered');

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

logger.info('usage, subscription, and invoice endpoints registered');

// ==================== Deployment Routes ====================

app.use(createDeployRouter());

// Template routes
app.use(createTemplatesRouter());

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

async function ensurePublishedZrokUrl(projectId: string, publishedDir: string): Promise<string | null> {
  try {
    const publishedShare = await ensurePublishedShare({ projectId, publishedPath: publishedDir });
    if (publishedShare?.previewUrl) {
      return publishedShare.previewUrl;
    }
  } catch (err) {
    logger.warn({ err, projectId, publishedDir }, 'Publish: failed to ensure persistent zrok URL');
  }

  return getPublishedShareUrl(projectId);
}

async function restorePublishedZrokSharesFromDisk(): Promise<void> {
  const publishedRoot = path.dirname(getPublishedPath('__probe__'));
  if (!fsSync.existsSync(publishedRoot)) {
    return;
  }

  const restorable: Array<{ projectId: string; publishedPath: string }> = [];
  for (const entry of fsSync.readdirSync(publishedRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }

    const slug = entry.name;
    const publishedPath = getPublishedPath(slug);
    if (!fsSync.existsSync(path.join(publishedPath, 'index.html'))) {
      continue;
    }

    const meta = getPublishMeta(slug) as { projectId?: unknown } | null;
    if (typeof meta?.projectId !== 'string' || meta.projectId.trim().length === 0) {
      continue;
    }

    restorable.push({ projectId: meta.projectId, publishedPath });
  }

  if (restorable.length === 0) {
    return;
  }

  await restorePublishedShares(restorable);
  startupInfo('zrok-publish', 'restored', { shares: restorable.length });
}
import { execFileSync } from 'child_process';

/**
 * Detect the build output directory based on framework/package.json
 */
function getContainerWorkspaceRoot(entry: { id: string; daytona?: boolean; daytonaWorkDir?: string }): string {
  return entry.daytona === true || daytonaSandboxIds.has(entry.id)
    ? (entry.daytonaWorkDir || '/workspace')
    : '/workspace';
}

async function detectBuildOutput(entry: ContainerEntry): Promise<{ buildCmd: string; outputDir: string; framework: string; workspaceRoot: string }> {
  const workspaceRoot = getContainerWorkspaceRoot(entry);

  // Read package.json to detect framework
  let pkgJson: any = {};
  try {
    const pkgRaw = isDaytonaSandbox(entry) || daytonaSandboxIds.has(entry.id)
      ? (await daytonaExec(entry.id, `cat ${workspaceRoot}/package.json 2>/dev/null || echo "{}"`, { timeoutSecs: 10 })).output
      : await execInContainer(entry.id, `cat ${workspaceRoot}/package.json 2>/dev/null || echo "{}"`);
    pkgJson = JSON.parse(pkgRaw);
  } catch {
    // ignore
  }

  const deps = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };

  // Detect framework and set build command + output dir
  if (deps['next']) {
    return { buildCmd: 'npm run build', outputDir: '.next', framework: 'nextjs', workspaceRoot };
  }
  if (deps['@remix-run/react'] || deps['@remix-run/dev']) {
    return { buildCmd: 'npm run build', outputDir: 'build/client', framework: 'remix', workspaceRoot };
  }
  if (deps['expo'] || deps['react-native']) {
    return { buildCmd: 'npx expo export --platform web', outputDir: 'dist', framework: 'expo', workspaceRoot };
  }
  if (deps['react-scripts']) {
    return { buildCmd: 'npm run build', outputDir: 'build', framework: 'cra', workspaceRoot };
  }
  if (deps['vite']) {
    return { buildCmd: 'npm run build', outputDir: 'dist', framework: 'vite', workspaceRoot };
  }
  // Fallback
  return { buildCmd: 'npm run build', outputDir: 'dist', framework: 'unknown', workspaceRoot };
}

// POST /api/publish/:projectId - Build and publish a project
app.post('/api/publish/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;
  const userId = req.userId || 'anonymous';
  const existingSlug = getSlugForProject(projectId);
  let slug = existingSlug;

  const entry = await getOrRecoverContainer(projectId);
  if (!entry) {
    return sendError(res, createError(ErrorCode.CONTAINER_NOT_FOUND, 'Container not found for this project'));
  }

  try {
    // 1. Detect framework
    const { buildCmd, outputDir: detectedOutputDir, framework, workspaceRoot } = await detectBuildOutput(entry);
    let outputDir = detectedOutputDir;
    const isDaytona = isDaytonaSandbox(entry) || daytonaSandboxIds.has(entry.id);
    logger.info({ projectId, framework, buildCmd, outputDir, workspaceRoot }, 'Publish: starting publish');

    // 2. Install dependencies if needed (longer timeout for npm install)
    try {
      if (isDaytona) {
        await daytonaExec(entry.id, `cd ${workspaceRoot} && [ -d node_modules ] || npm install --legacy-peer-deps`, { timeoutSecs: 120 });
      } else {
        await execInContainer(entry.id, `cd ${workspaceRoot} && [ -d node_modules ] || npm install`);
      }
    } catch {
      // node_modules might already exist
    }

    // 2b. Install Expo web dependencies if needed
    if (framework === 'expo') {
      try {
        await execInContainer(entry.id, 'cd /workspace && npx expo install react-dom react-native-web @expo/metro-runtime 2>&1');
      } catch { /* may already be installed */ }
    }

    // 3. Run build (longer timeout — builds can take 2+ minutes)
    // Output is captured by exec for side-effect only; verification below uses
    // a separate `ls` check to confirm the output directory exists.
    logger.info({ projectId }, 'Publish: building project');
    if (isDaytona) {
      await daytonaExec(entry.id, `cd ${workspaceRoot} && ${buildCmd} 2>&1`, { timeoutSecs: 180 });
    } else {
      await execInContainer(entry.id, `cd ${workspaceRoot} && ${buildCmd} 2>&1`);
    }
    logger.info({ projectId }, 'Publish: build complete');

    // 4. Verify build output exists
    const workDir = workspaceRoot;
    const exec = isDaytona
      ? async (cmd: string) => (await daytonaExec(entry.id, cmd, { timeoutSecs: 30 })).output
      : (cmd: string) => execInContainer(entry.id, cmd);
    const checkOutput = await exec(`ls -la ${workDir}/${outputDir}/ 2>/dev/null | head -5 || echo "NOT_FOUND"`);
    if (checkOutput.includes('NOT_FOUND')) {
      // Try common fallbacks
      const fallbackDirs = ['dist', 'build', 'out', '.next/static'];
      let found = false;
      for (const dir of fallbackDirs) {
        const check = await exec(`[ -d ${workDir}/${dir} ] && echo "EXISTS" || echo "NOPE"`);
        if (check.includes('EXISTS')) {
          logger.info({ dir }, 'Publish: using fallback output dir');
          outputDir = dir;
          found = true;
          break;
        }
      }
      if (!found) {
        return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Build output not found at ${workDir}/${outputDir}. Build may have failed.`));
      }
    }

    // 5. Generate slug
    const projectName = req.body?.name || projectId;
    slug = existingSlug || registerSlug(projectId, generateSlug(projectName));

    // 6. Copy build output from container to host
    const publishedDir = getPublishedPath(slug);
    const fs = await import('fs');

    // Clean existing published content (atomic update)
    const tmpDir = publishedDir + '.tmp';
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true });

    // Copy build output from container/sandbox to host
    if (isDaytonaSandbox(entry)) {
      // Daytona: archive inside the sandbox, store it as base64 text, then
      // return that text in the same exec call. Raw tar bytes are not safe
      // to stream through toolbox exec output.
      const daytonaOutputDir = `${workDir}/${outputDir}`.trim();
      const archivePath = '/tmp/recoder-publish.b64';
      const archiveResult = await daytonaExec(
        entry.id,
        `rm -f ${archivePath} && tar cf - -C ${daytonaOutputDir} . | base64 > ${archivePath} && cat ${archivePath}`,
        { timeoutSecs: 120 },
      );
      await daytonaExec(entry.id, `rm -f ${archivePath}`, { timeoutSecs: 10 }).catch(() => {});
      if (archiveResult.exitCode !== 0 || !archiveResult.output.trim()) {
        throw new Error(`Failed to archive build output from sandbox: ${archiveResult.output?.slice(0, 200)}`);
      }

      const archiveBase64 = archiveResult.output;
      const tarBuf = Buffer.from(archiveBase64.replace(/\s+/g, ''), 'base64');
      const tarPath = `${tmpDir}/_archive.tar`;
      const fsSync = await import('fs');
      fsSync.writeFileSync(tarPath, tarBuf);
      execFileSync('tar', ['xf', tarPath, '-C', tmpDir], { timeout: 30000 });
      fsSync.unlinkSync(tarPath);
    } else {
      // Docker: use docker cp
      execFileSync('docker', ['cp', `${entry.id}:/workspace/${outputDir}/.`, `${tmpDir}/`], { timeout: 30000 });
    }

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

    const url = `${PUBLIC_PREVIEW_URL.replace(/\/+$/, '')}/published/${slug}`;
    logger.info({ projectId, url }, 'Publish: project published');
    trackPublish({ userId: req.userId ?? 'anonymous', projectId, slug: slug!, target: 'web' });

    // Persistent zrok-backed publish URL for stable subdomain access.
    let zrokUrl: string | null = null;
    zrokUrl = await ensurePublishedZrokUrl(projectId, publishedDir);
    if (zrokUrl) {
      logger.info({ projectId, zrokUrl }, 'Publish: persistent zrok URL ready');
    }

    sendSuccess(res, { url, slug, publishedAt, ...(zrokUrl ? { zrokUrl } : {}) });
  } catch (error: any) {
    if (!existingSlug && slug) {
      unregisterSlug(projectId);
      slug = null;
    }
    logger.error({ err: error, projectId }, 'Publish: failed to publish project');
    const detail = error?.message || 'Unknown error';
    return sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Publish failed: ${detail}`));
  }
}));

// POST /api/unpublish/:projectId - Remove a published project
app.post('/api/unpublish/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;

  const slug = unregisterSlug(projectId);
  if (!slug) {
    return sendError(res, createError(ErrorCode.NOT_FOUND, 'Project is not published'));
  }

  await destroyPublishedShare(projectId, { deleteName: true }).catch((err) => {
    logger.warn({ err, projectId }, 'Publish: failed to destroy persistent zrok URL during unpublish');
  });

  // Remove published files
  const publishedDir = getPublishedPath(slug);
  const fs = await import('fs');
  if (fs.existsSync(publishedDir)) {
    fs.rmSync(publishedDir, { recursive: true });
  }

  logger.info({ projectId, slug }, 'Publish: project unpublished');
  sendSuccess(res, { success: true });
}));

// GET /api/publish-status/:projectId - Check publish status
app.get('/api/publish-status/:projectId', authenticateRequest, verifyProjectOwnership, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { projectId } = req.params;

  const slug = getSlugForProject(projectId);
  if (!slug) {
    return sendSuccess(res, { published: false });
  }

  const fs = await import('fs');
  const publishedDir = getPublishedPath(slug);
  if (!fs.existsSync(publishedDir)) {
    unregisterSlug(projectId);
    return sendSuccess(res, { published: false });
  }

  const meta = getPublishMeta(slug);
  const { getDomainsForProject } = await import('./domain-manager.js');
  const customDomains = getDomainsForProject(projectId);
  const zrokUrl = await ensurePublishedZrokUrl(projectId, publishedDir);
  sendSuccess(res, {
    published: true,
    url: `${PUBLIC_PREVIEW_URL.replace(/\/+$/, '')}/published/${slug}`,
    slug,
    publishedAt: meta?.publishedAt || null,
    framework: meta?.framework || null,
    zrokUrl,
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

  const publishedDir = getPublishedPath(result.slug);
  const url = `${PUBLIC_PREVIEW_URL.replace(/\/+$/, '')}/published/${result.slug}`;
  const zrokUrl = await ensurePublishedZrokUrl(projectId, publishedDir);
  logger.info({ projectId, slug: result.slug }, 'Publish: project slug changed');
  sendSuccess(res, { url, slug: result.slug, changed: true, ...(zrokUrl ? { zrokUrl } : {}) });
}));

// ── Serve published sites at /published/{slug}/* ──
// Static files from data/published/{slug}/ served with proper content types
import * as fsSync from 'node:fs';

app.get('/published/:slug', (req, res) => {
  const { slug } = req.params;
  const publishedDir = getPublishedPath(slug);
  const indexPath = path.join(publishedDir, 'index.html');
  if (fsSync.existsSync(indexPath)) {
    return res.sendFile(path.resolve(indexPath));
  }
  res.status(404).send('Site not found');
});

app.get('/published/:slug/*', (req, res) => {
  const { slug } = req.params;
  const publishedDir = path.resolve(getPublishedPath(slug));
  if (!fsSync.existsSync(publishedDir)) {
    return res.status(404).send('Site not found');
  }
  const relativePath = (req.params as any)[0] || 'index.html';
  let filePath = path.resolve(path.join(publishedDir, relativePath));
  // Prevent path traversal
  if (!filePath.startsWith(publishedDir)) {
    return res.status(403).send('Forbidden');
  }
  // Default to index.html for directory requests
  if (fsSync.existsSync(filePath) && fsSync.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fsSync.existsSync(filePath)) {
    // SPA fallback: serve index.html at slug root
    const indexFallback = path.join(publishedDir, 'index.html');
    if (fsSync.existsSync(indexFallback)) {
      return res.sendFile(indexFallback);
    }
    return res.status(404).send('File not found');
  }
  res.sendFile(filePath);
});

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

// Extracted to ./routes/admin-operations.routes.ts (see createAdminOperationsRouter)
// Covers S9-1 abuse prevention, S10-3 admin alerts, security stats, S9-3 backup &
// recovery, and S9-4 performance profiling endpoints.
app.use(createAdminOperationsRouter({ authenticateRequest, requireAdmin, wsKeepalive }));
logger.info('abuse prevention endpoints registered');
logger.info('admin alert endpoints registered');
logger.info('backup & recovery endpoints registered');
logger.info('performance profiling endpoints registered');

// ==================== END SPRINT 9 ====================

startupInfo('routes.deployment', 'registered', { providers: ['vercel', 'netlify'] });
startupInfo('routes.templates', 'registered');
startupInfo('routes.health-monitor', 'registered');
startupInfo('routes.resource-optimizer', 'registered');
startupInfo('middleware.public-api', 'applied', { modules: ['auth', 'rate-limiting', 'logging'] });

// ==================== SPRINT 12: Integrations & Themes ====================

import * as neonClient from './integrations/neon-client.js';
import * as integrationStore from './integrations/integration-store.js';
import * as promptStore from './integrations/prompt-store.js';

// ── Neon PostgreSQL Integration Routes ─────────────────────────────

app.use(createNeonRouter({ authenticateRequest, verifyProjectOwnership, containers }));

startupInfo('routes.neon', 'registered');

app.use(createPromptsRouter({ authenticateRequest }));

startupInfo('routes.prompt-library', 'registered');

// ==================== END SPRINT 13 ====================

// ==================== SPRINT 14: Proposals + GitHub Collaborators ====================

// ──  GitHub Collaborators + Pull Requests ───────────────────────────
// Extracted to ./routes/github-collaborators.routes.ts (see createGitHubCollaboratorsRouter)
// ============================================================
app.use(createGitHubCollaboratorsRouter({
  authenticateRequest,
  verifyProjectOwnership,
  sanitizeProjectId,
  getOrRecoverContainer,
}));

startupInfo('routes.github-pull-requests', 'registered');

startupInfo('routes.github-collaborators', 'registered');

// ==================== DAYTONA SANDBOX INTEGRATION ====================
// REST-based Daytona sandbox management for Spaces projects.
// Provides an alternative to local Docker containers using the self-hosted Daytona API.

app.use(createDaytonaSandboxRouter({ authenticateRequest }));

startupInfo('routes.daytona-sandbox', isDaytonaConfigured() ? 'registered' : 'registered (not configured - set DAYTONA_API_KEY)');

// ==================== END SPRINT 14 ====================

// ==================== SEARXNG WEB SEARCH PROXY ====================
//
// Forwards authenticated requests to the self-hosted SearXNG instance
// so that docker-backend's own TypeScript tools can call it, and so that
// any client inside the Docker network can use it via this API.
//
// SEARXNG_URL env var is set to http://searxng:8080 in docker-compose.
// Falls back to http://127.0.0.1:8888 for local dev (host-level).

const SEARXNG_BASE_URL = process.env.SEARXNG_URL || 'http://127.0.0.1:8888';

/**
 * GET /api/web-search
 * Query params: q (required), limit (default 10), categories (default general),
 *               time_range (optional: day|week|month|year), language (default en-US)
 */
app.get('/api/web-search', asyncHandler(async (req: express.Request, res: express.Response) => {
  const query = req.query.q as string | undefined;
  if (!query || query.trim().length === 0) {
    return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Query parameter "q" is required'));
  }

  const limit = Math.min(parseInt((req.query.limit as string) || '10', 10), 50);
  const categories = (req.query.categories as string) || 'general';
  const language = (req.query.language as string) || 'en-US';
  const timeRange = req.query.time_range as string | undefined;

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    pageno: '1',
    language,
    categories,
  });
  if (timeRange) params.set('time_range', timeRange);

  try {
    const response = await fetch(`${SEARXNG_BASE_URL}/search?${params.toString()}`);
    if (!response.ok) {
      logger.error(`SearXNG returned ${response.status} for query: ${query}`);
      return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, `Search backend returned ${response.status}`));
    }

    const data = await response.json() as {
      results?: Array<{
        title: string;
        url: string;
        content?: string;
        engine?: string;
        publishedDate?: string;
        score?: number;
      }>;
    };

    const results = (data.results || []).slice(0, limit).map(r => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content,
      engine: r.engine,
      published_date: r.publishedDate,
      score: r.score,
    }));

    sendSuccess(res, {
      query,
      total: results.length,
      results,
      searxng_url: SEARXNG_BASE_URL,
    });
  } catch (err) {
    logger.error({ err }, `Web search proxy error (SEARXNG_URL=${SEARXNG_BASE_URL})`);
    return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Search backend is unreachable'));
  }
}));

startupInfo('routes.web-search', `registered (SearXNG at ${SEARXNG_BASE_URL})`);

// ==================== END SEARXNG WEB SEARCH PROXY ====================

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
    previewUrlPattern: `${PUBLIC_PREVIEW_URL.replace(/\/+$/, '')}/preview/{projectId}`,
    collaborationUrlPattern: `${PUBLIC_DOCKER_BACKEND_WS_URL}/collab?projectId=XXX&file=YYY`,
    lspStartEndpoint: '/api/lsp/:projectId/start',
  });

  // Run startup sequence AFTER server is listening
  // This ensures cleanup happens first, then pool is initialized
  await startupSequence();
  await restorePublishedZrokSharesFromDisk().catch((err) => {
    startupInfo('zrok-publish', 'restore failed', {
      error: err instanceof Error ? err.message : 'unknown',
    });
  });

  if ((process.env.RECODER_A2A_ENABLE_CONSUMER || '').toLowerCase() === 'true') {
    const worker = await startA2AIntentWorker({ serviceId: 'recoder_backend' });
    if (worker) {
      startupInfo('a2a-consumer', 'started', { stream: process.env.RECODER_A2A_INTENT_STREAM_KEY || 'recoder:a2a:intents' });
    } else {
      startupInfo('a2a-consumer', 'skipped', { reason: 'redis_not_configured' });
    }
  }

  const outboxDrainLoop = startAgentOsOutboxDrainLoop();
  startupInfo(
    'agent-os-outbox-drain',
    outboxDrainLoop.enabled ? 'started' : 'skipped',
    outboxDrainLoop.enabled
      ? { intervalMs: outboxDrainLoop.config.intervalMs, limit: outboxDrainLoop.config.limit }
      : { reason: 'set AGENT_OS_OUTBOX_DRAIN_ENABLED=true or AGENT_OS_OUTBOX_DRAIN_INTERVAL_MS' },
  );

  // Wire internal agents to the A2A bridge so they appear as connected
  // and can receive task assignments from the orchestration layer
  try {
    startAgentWorkers();
    startupInfo('a2a-agent-workers', 'started', {
      agents: ['recoder_backend', 'recoder_pm', 'recoder_agency'],
    });
  } catch (err) {
    startupInfo('a2a-agent-workers', 'failed', {
      error: err instanceof Error ? err.message : 'unknown',
    });
  }

  // Mount standards-compliant A2A server (official @a2a-js/sdk)
  try {
    const { mountA2AStandardServer } = await import('./a2a/a2a-standard-server.js');
    await mountA2AStandardServer(app as any);
  } catch (err) {
    startupInfo('a2a-standard', 'not available', {
      error: err instanceof Error ? err.message : 'unknown',
    });
  }

  // Connectors bridge: start ingress for any configured chat channel (telegram).
  // Degrade-safe — no token/SDK => inert, never crashes boot.
  try {
    const gateway = await startConnectors();
    const health = gateway ? await gateway.health() : { active: false, channels: [] };
    startupInfo('connectors', health.active ? 'started' : 'inert', {
      active: health.active,
      channels: health.channels.map((c) => ({ channel: c.channel, connected: c.connected })),
    });
  } catch (err) {
    startupInfo('connectors', 'failed', {
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
});
