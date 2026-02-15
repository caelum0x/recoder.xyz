/**
 * Public API Types
 *
 * Type definitions for the Recoder.xyz Public API.
 * This API allows external developers to programmatically create and manage
 * sandboxes for code execution, file operations, and command running.
 */

// ==================== API Key Types ====================

/**
 * API key scope defines what operations a key can perform
 */
export type ApiKeyScope =
  | 'sandboxes:read'      // Read sandbox info
  | 'sandboxes:write'     // Create/delete sandboxes
  | 'projects:read'       // Read project info
  | 'projects:write'      // Create/modify/publish projects
  | 'files:read'          // Read files from sandbox
  | 'files:write'         // Write files to sandbox
  | 'execute:commands'    // Execute commands in sandbox
  | 'execute:scripts'     // Execute scripts (longer running)
  | 'admin';              // Full access

/**
 * API key tier determines rate limits and quotas
 */
export type ApiKeyTier = 'free' | 'developer' | 'team' | 'enterprise';

/**
 * API key stored in database
 */
export interface ApiKey {
  /** Unique identifier */
  id: string;

  /** User who owns this key */
  userId: string;

  /** Human-readable name for the key */
  name: string;

  /** The hashed key (never store plain text) */
  hashedKey: string;

  /** Key prefix for identification (e.g., sk_live_abc or sk_test_xyz) */
  keyPrefix: string;

  /** Allowed scopes for this key */
  scopes: ApiKeyScope[];

  /** Tier for rate limiting */
  tier: ApiKeyTier;

  /** Whether key is for test or live environment */
  environment: 'test' | 'live';

  /** Creation timestamp */
  createdAt: number;

  /** Last used timestamp */
  lastUsedAt?: number;

  /** Expiration timestamp (optional) */
  expiresAt?: number;

  /** Whether the key is active */
  isActive: boolean;

  /** IP allowlist (optional) */
  allowedIps?: string[];

  /** Request count for tracking */
  totalRequests: number;

  /** Associated metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Publicly visible API key info (without hash)
 */
export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  tier: ApiKeyTier;
  environment: 'test' | 'live';
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
  isActive: boolean;
  totalRequests: number;
}

/**
 * Request to create a new API key
 */
export interface CreateApiKeyRequest {
  /** Human-readable name for the key */
  name: string;

  /** Requested scopes */
  scopes: ApiKeyScope[];

  /** Whether this is a test key */
  isTestKey?: boolean;

  /** Optional expiration (ISO date string or timestamp) */
  expiresAt?: string | number;

  /** Optional IP allowlist */
  allowedIps?: string[];

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Response when creating API key (only time full key is shown)
 */
export interface CreateApiKeyResponse {
  /** The full API key - ONLY SHOWN ONCE */
  apiKey: string;

  /** Key info */
  keyInfo: ApiKeyInfo;
}

// ==================== Rate Limiting Types ====================

/**
 * Rate limit configuration per tier
 */
export interface RateLimitConfig {
  /** Requests per minute */
  requestsPerMinute: number;

  /** Requests per hour */
  requestsPerHour: number;

  /** Requests per day */
  requestsPerDay: number;

  /** Max concurrent sandboxes */
  maxConcurrentSandboxes: number;

  /** Max sandbox duration in seconds */
  maxSandboxDurationSeconds: number;

  /** Max file size in bytes */
  maxFileSizeBytes: number;

  /** Max command execution time in seconds */
  maxCommandTimeoutSeconds: number;
}

/**
 * Rate limit status for a key
 */
export interface RateLimitStatus {
  /** Limit for current window */
  limit: number;

  /** Remaining requests in current window */
  remaining: number;

  /** Unix timestamp when the window resets */
  resetAt: number;

  /** Window type */
  window: 'minute' | 'hour' | 'day';
}

/**
 * Rate limit headers to include in response
 */
export interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
  'X-RateLimit-Window': string;
}

// ==================== Sandbox Types ====================

/**
 * Sandbox state
 */
export type SandboxState = 'creating' | 'running' | 'stopped' | 'error' | 'deleted';

/**
 * Sandbox template
 */
export type SandboxTemplate =
  | 'node'
  | 'python'
  | 'react'
  | 'nextjs'
  | 'vue'
  | 'svelte'
  | 'vanilla'
  | 'custom';

/**
 * Sandbox resource limits
 */
export interface SandboxResourceLimits {
  /** Memory limit in MB */
  memoryMB?: number;

  /** CPU shares (1024 = 1 core) */
  cpuShares?: number;

  /** Disk space limit in MB */
  diskMB?: number;

  /** Network bandwidth limit in Kbps */
  networkKbps?: number;
}

/**
 * Request to create a sandbox
 */
export interface SandboxCreateRequest {
  /** Optional sandbox name */
  name?: string;

  /** Template to use */
  template?: SandboxTemplate;

  /** Initial files to create */
  files?: Array<{
    path: string;
    content: string;
  }>;

  /** Environment variables */
  env?: Record<string, string>;

  /** Resource limits (may be restricted by tier) */
  resourceLimits?: SandboxResourceLimits;

  /** Auto-shutdown timeout in seconds */
  timeoutSeconds?: number;

  /** Whether to start dev server */
  startDevServer?: boolean;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Sandbox response object
 */
export interface SandboxResponse {
  /** Unique sandbox ID */
  id: string;

  /** Sandbox name */
  name: string;

  /** Current state */
  state: SandboxState;

  /** Template used */
  template: SandboxTemplate;

  /** Preview URL (if dev server is running) */
  previewUrl?: string;

  /** Terminal WebSocket URL */
  terminalUrl?: string;

  /** Creation timestamp */
  createdAt: number;

  /** Last activity timestamp */
  lastActivityAt: number;

  /** Timeout timestamp (when sandbox will auto-shutdown) */
  expiresAt?: number;

  /** Resource limits */
  resourceLimits: SandboxResourceLimits;

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * List of sandboxes with pagination
 */
export interface SandboxListResponse {
  sandboxes: SandboxResponse[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ==================== File Operation Types ====================

/**
 * File info in a sandbox
 */
export interface FileInfo {
  /** File path relative to sandbox root */
  path: string;

  /** File name */
  name: string;

  /** Whether it's a directory */
  isDirectory: boolean;

  /** File size in bytes (for files) */
  size?: number;

  /** Last modified timestamp */
  modifiedAt: number;

  /** MIME type (for files) */
  mimeType?: string;
}

/**
 * Request to write a file
 */
export interface FileWriteRequest {
  /** File path */
  path: string;

  /** File content (string or base64 for binary) */
  content: string;

  /** Whether content is base64 encoded */
  isBase64?: boolean;

  /** Whether to create parent directories */
  createDirectories?: boolean;
}

/**
 * Request to read a file
 */
export interface FileReadRequest {
  /** File path */
  path: string;

  /** Whether to return base64 for binary files */
  returnBase64?: boolean;

  /** Line range for partial reads */
  lineRange?: {
    start: number;
    end: number;
  };
}

/**
 * File read response
 */
export interface FileReadResponse {
  /** File path */
  path: string;

  /** File content */
  content: string;

  /** Whether content is base64 */
  isBase64: boolean;

  /** File size */
  size: number;

  /** MIME type */
  mimeType: string;

  /** Total lines (for text files) */
  totalLines?: number;
}

/**
 * File operation result
 */
export interface FileOperationResult {
  /** Whether operation succeeded */
  success: boolean;

  /** File path */
  path: string;

  /** Error message if failed */
  error?: string;
}

/**
 * Batch file operation request
 */
export interface BatchFileOperationRequest {
  operations: Array<{
    type: 'write' | 'delete' | 'rename' | 'copy';
    path: string;
    content?: string;
    isBase64?: boolean;
    newPath?: string;
  }>;
}

/**
 * Batch file operation response
 */
export interface BatchFileOperationResponse {
  results: FileOperationResult[];
  successCount: number;
  failureCount: number;
}

// ==================== Command Execution Types ====================

/**
 * Request to execute a command
 */
export interface CommandExecuteRequest {
  /** Command to execute */
  command: string;

  /** Working directory (relative to sandbox root) */
  cwd?: string;

  /** Environment variables to add */
  env?: Record<string, string>;

  /** Timeout in milliseconds */
  timeoutMs?: number;

  /** Whether to stream output */
  stream?: boolean;
}

/**
 * Command execution response
 */
export interface CommandExecuteResponse {
  /** Exit code */
  exitCode: number;

  /** Standard output */
  stdout: string;

  /** Standard error */
  stderr: string;

  /** Execution time in milliseconds */
  executionTimeMs: number;

  /** Whether command timed out */
  timedOut: boolean;

  /** Whether command was killed */
  killed: boolean;
}

/**
 * Streaming command execution event
 */
export interface CommandStreamEvent {
  type: 'stdout' | 'stderr' | 'exit' | 'error';
  data?: string;
  exitCode?: number;
  error?: string;
  timestamp: number;
}

// ==================== API Response Types ====================

/**
 * Standard API success response
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  requestId: string;
  timestamp: string;
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
  timestamp: string;
}

/**
 * API response type
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ==================== Webhook Types ====================

/**
 * Webhook event types
 */
export type WebhookEventType =
  | 'sandbox.created'
  | 'sandbox.started'
  | 'sandbox.stopped'
  | 'sandbox.deleted'
  | 'sandbox.error'
  | 'file.changed'
  | 'command.completed'
  | 'command.failed';

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  id: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  isActive: boolean;
  createdAt: number;
}

/**
 * Webhook payload
 */
export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  sandboxId?: string;
  data: Record<string, unknown>;
}

// ==================== Usage & Analytics Types ====================

/**
 * API usage statistics
 */
export interface ApiUsageStats {
  /** API key ID */
  keyId: string;

  /** Time period */
  period: {
    start: number;
    end: number;
  };

  /** Total requests */
  totalRequests: number;

  /** Requests by endpoint */
  requestsByEndpoint: Record<string, number>;

  /** Requests by status code */
  requestsByStatus: Record<string, number>;

  /** Average response time in ms */
  avgResponseTimeMs: number;

  /** Total sandbox time in seconds */
  totalSandboxTimeSeconds: number;

  /** Total data transferred in bytes */
  totalDataTransferredBytes: number;
}

// ==================== Identity Token Types ====================

/**
 * Scopes for identity tokens (what third-party apps can access)
 */
export type IdentityTokenScope =
  | 'profile:read'     // Read basic profile info
  | 'projects:read'    // Read project list
  | 'usage:read';      // Read usage stats

/**
 * Identity token stored in database
 */
export interface IdentityToken {
  /** Unique token identifier (jti) */
  id: string;

  /** User ID who generated this token */
  userId: string;

  /** Hashed token (never store plain text) */
  hashedToken: string;

  /** Token prefix for identification */
  tokenPrefix: string;

  /** Unix timestamp when token expires */
  expiresAt: number;

  /** Scopes granted to this token */
  scopes: IdentityTokenScope[];

  /** Intended audience (optional - restricts which apps can verify) */
  audience?: string;

  /** Creation timestamp */
  createdAt: number;

  /** Whether the token has been revoked */
  isRevoked: boolean;
}

/**
 * Request to create an identity token
 */
export interface CreateIdentityTokenRequest {
  /** Intended audience (e.g., "myapp.com") */
  audience?: string;

  /** Scopes to grant (defaults to ['profile:read']) */
  scopes?: IdentityTokenScope[];
}

/**
 * Response when creating identity token
 */
export interface CreateIdentityTokenResponse {
  /** The identity token - valid for 1 hour */
  identity_token: string;

  /** ISO timestamp when token expires */
  expires_at: string;

  /** Seconds until expiration */
  expires_in: number;
}

/**
 * Request to verify an identity token
 */
export interface VerifyIdentityRequest {
  /** The identity token to verify */
  token: string;

  /** Expected audience (must match if token has audience) */
  audience?: string;
}

/**
 * Agent info returned on successful verification
 */
export interface VerifiedAgentInfo {
  /** Recoder user ID */
  id: string;

  /** Display name */
  name: string;

  /** User's tier */
  tier: ApiKeyTier;

  /** Basic stats */
  stats: {
    totalProjects: number;
    memberSince: number;
  };
}

/**
 * Response when verifying identity token
 */
export interface VerifyIdentityResponse {
  /** Whether the token is valid */
  valid: boolean;

  /** Error message if invalid */
  error?: string;

  /** Agent info if valid */
  agent?: VerifiedAgentInfo;
}

// ==================== App Key Types ====================

/**
 * App key for third-party developers to verify identity tokens
 */
export interface AppKey {
  /** Unique identifier */
  id: string;

  /** Human-readable name for the app */
  name: string;

  /** Hashed key (never store plain text) */
  hashedKey: string;

  /** Key prefix for identification (e.g., app_xxx) */
  keyPrefix: string;

  /** User ID who owns this app key */
  ownerId: string;

  /** Whether the key is active */
  isActive: boolean;

  /** Creation timestamp */
  createdAt: number;

  /** Last used timestamp */
  lastUsedAt?: number;

  /** Total verification requests */
  totalVerifications: number;

  /** Allowed callback URLs (optional) */
  allowedCallbackUrls?: string[];

  /** App description */
  description?: string;
}

/**
 * Publicly visible app key info (without hash)
 */
export interface AppKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  ownerId: string;
  isActive: boolean;
  createdAt: number;
  lastUsedAt?: number;
  totalVerifications: number;
  description?: string;
}

/**
 * Request to create an app key
 */
export interface CreateAppKeyRequest {
  /** Human-readable name for the app */
  name: string;

  /** Optional description */
  description?: string;

  /** Optional allowed callback URLs */
  allowedCallbackUrls?: string[];
}

/**
 * Response when creating app key
 */
export interface CreateAppKeyResponse {
  /** The full app key - ONLY SHOWN ONCE */
  appKey: string;

  /** Key info */
  keyInfo: AppKeyInfo;
}

// ==================== External Identity Types ====================

/**
 * Supported external identity providers
 */
export type ExternalProvider = 'moltbook' | 'openclaw';

/**
 * External identity mapping
 */
export interface ExternalIdentity {
  /** Recoder user ID */
  recoderUserId: string;

  /** External provider */
  provider: ExternalProvider;

  /** External ID from the provider */
  externalId: string;

  /** Display name from external provider */
  externalName?: string;

  /** When the link was created */
  linkedAt: number;

  /** Additional metadata from the provider */
  metadata?: Record<string, unknown>;
}

/**
 * Request to authenticate with Moltbook
 */
export interface MoltbookAuthRequest {
  /** Moltbook identity token */
  identity_token: string;
}

/**
 * Moltbook agent info
 */
export interface MoltbookAgentInfo {
  /** Moltbook agent ID */
  id: string;

  /** Agent name */
  name: string;

  /** Agent type */
  type: string;

  /** Capabilities */
  capabilities?: string[];
}

/**
 * Response when authenticating with Moltbook
 */
export interface MoltbookAuthResponse {
  /** Recoder API key for the agent */
  apiKey: string;

  /** Key info */
  keyInfo: ApiKeyInfo;

  /** Whether this created a new account */
  isNewAccount: boolean;

  /** Moltbook agent info */
  moltbookAgent: MoltbookAgentInfo;
}

// ==================== Error Codes ====================

/**
 * Public API error codes
 */
export enum PublicApiErrorCode {
  // Authentication errors
  INVALID_API_KEY = 'INVALID_API_KEY',
  API_KEY_EXPIRED = 'API_KEY_EXPIRED',
  API_KEY_REVOKED = 'API_KEY_REVOKED',
  INSUFFICIENT_SCOPE = 'INSUFFICIENT_SCOPE',
  IP_NOT_ALLOWED = 'IP_NOT_ALLOWED',

  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  CONCURRENT_LIMIT_EXCEEDED = 'CONCURRENT_LIMIT_EXCEEDED',

  // Sandbox errors
  SANDBOX_NOT_FOUND = 'SANDBOX_NOT_FOUND',
  SANDBOX_NOT_RUNNING = 'SANDBOX_NOT_RUNNING',
  SANDBOX_CREATION_FAILED = 'SANDBOX_CREATION_FAILED',
  SANDBOX_LIMIT_EXCEEDED = 'SANDBOX_LIMIT_EXCEEDED',

  // Project errors
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  PROJECT_CREATION_FAILED = 'PROJECT_CREATION_FAILED',
  PROJECT_PUBLISH_FAILED = 'PROJECT_PUBLISH_FAILED',

  // File errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_PATH = 'INVALID_FILE_PATH',
  FILE_OPERATION_FAILED = 'FILE_OPERATION_FAILED',

  // Command errors
  COMMAND_TIMEOUT = 'COMMAND_TIMEOUT',
  COMMAND_FAILED = 'COMMAND_FAILED',
  COMMAND_NOT_ALLOWED = 'COMMAND_NOT_ALLOWED',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Identity token errors
  IDENTITY_TOKEN_INVALID = 'IDENTITY_TOKEN_INVALID',
  IDENTITY_TOKEN_EXPIRED = 'IDENTITY_TOKEN_EXPIRED',
  IDENTITY_TOKEN_REVOKED = 'IDENTITY_TOKEN_REVOKED',
  IDENTITY_TOKEN_AUDIENCE_MISMATCH = 'IDENTITY_TOKEN_AUDIENCE_MISMATCH',
  IDENTITY_TOKEN_CREATION_FAILED = 'IDENTITY_TOKEN_CREATION_FAILED',
  IDENTITY_SCOPE_INVALID = 'IDENTITY_SCOPE_INVALID',

  // App key errors
  APP_KEY_INVALID = 'APP_KEY_INVALID',
  APP_KEY_REVOKED = 'APP_KEY_REVOKED',
  APP_KEY_NOT_FOUND = 'APP_KEY_NOT_FOUND',
  APP_KEY_CREATION_FAILED = 'APP_KEY_CREATION_FAILED',
  APP_KEY_FORBIDDEN = 'APP_KEY_FORBIDDEN',

  // External identity errors
  EXTERNAL_IDENTITY_NOT_FOUND = 'EXTERNAL_IDENTITY_NOT_FOUND',
  EXTERNAL_IDENTITY_ALREADY_LINKED = 'EXTERNAL_IDENTITY_ALREADY_LINKED',
  EXTERNAL_PROVIDER_ERROR = 'EXTERNAL_PROVIDER_ERROR',
  EXTERNAL_TOKEN_INVALID = 'EXTERNAL_TOKEN_INVALID',

  // Server errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}
