/**
 * Docker Backend API Client
 * Handles authenticated requests to the docker-backend service
 * Uses Better Auth session tokens for authentication
 * Includes robust error handling, retry logic, and connection status tracking
 *
 * Error Handling Features:
 * - Unified error response format with specific error types
 * - NetworkError, AuthError, TimeoutError, ServerError classes
 * - User-friendly error messages with smart retry suggestions
 * - Automatic retry with exponential backoff
 * - Connection state management for WebSockets
 */

import {
  ApiErrorException,
  ErrorCode,
  withRetry,
  getUserFriendlyMessage,
  ReconnectingWebSocket,
  type ConnectionState,
  type ConnectionStatus,
  type RetryConfig,
  NetworkError,
  AuthError,
  TimeoutError,
  ServerError,
  FileOperationError,
  reportError,
  createErrorInfo,
} from '~/lib/utils/error-handler';
import { createScopedLogger, DEBUG, createTimer } from '~/utils/logger';

const logger = createScopedLogger('DockerAPI');
let DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || 'https://docker.recoder.xyz';
// Runtime override: if build baked in localhost but we're running in production, use production URL
if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && DOCKER_URL.includes('localhost')) {
  DOCKER_URL = 'https://docker.recoder.xyz';
}
const CONTAINER_CREATE_TIMEOUT_MS = Number(import.meta.env.VITE_CONTAINER_CREATE_TIMEOUT_MS || 120000);
const ANONYMOUS_ID_STORAGE_KEY = 'recoder_anonymous_id';
const ANONYMOUS_ID_COOKIE_NAME = 'recoder_anonymous_id';
const ANONYMOUS_ID_HEADER_NAME = 'X-Recoder-Anonymous-Id';
const SAFE_ANONYMOUS_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

// Request ID counter for tracing
let requestIdCounter = 0;
function getNextRequestId(): string {
  return `req-${++requestIdCounter}-${Date.now().toString(36)}`;
}

function getAnonymousCookieDomain(): string | null {
  if (typeof window === 'undefined') return null;

  const hostname = window.location.hostname;
  if (hostname === 'recoder.xyz' || hostname.endsWith('.recoder.xyz')) {
    return '.recoder.xyz';
  }

  return null;
}

function persistAnonymousIdCookie(anonymousId: string): void {
  if (typeof document === 'undefined') return;

  const parts = [
    `${ANONYMOUS_ID_COOKIE_NAME}=${encodeURIComponent(anonymousId)}`,
    'Path=/',
    'Max-Age=31536000',
    'SameSite=Lax',
  ];

  const sharedDomain = getAnonymousCookieDomain();
  if (sharedDomain) {
    parts.push(`Domain=${sharedDomain}`);
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    parts.push('Secure');
  }

  document.cookie = parts.join('; ');
}

function ensureAnonymousIdentityCookie(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    let anonymousId = localStorage.getItem(ANONYMOUS_ID_STORAGE_KEY);
    if (!anonymousId || !SAFE_ANONYMOUS_ID_RE.test(anonymousId)) {
      anonymousId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem(ANONYMOUS_ID_STORAGE_KEY, anonymousId);
    }

    persistAnonymousIdCookie(anonymousId);
    return anonymousId;
  } catch {
    return null;
  }
}

/**
 * API Error Response from docker-backend
 */
interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
    timestamp?: string;
    requestId?: string;
  };
  canRetry?: boolean;
  retryAfter?: number;
}

/**
 * API Success Response from docker-backend
 */
interface ApiSuccessResponse<T = unknown> {
  success: true;
  data?: T;
  message?: string;
}

type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Docker API Error class with additional context
 */
export class DockerApiError extends ApiErrorException {
  public readonly endpoint: string;
  public readonly statusCode: number;

  constructor(
    error: ApiErrorResponse['error'] | string,
    endpoint: string,
    statusCode: number,
    options?: { canRetry?: boolean; retryAfter?: number }
  ) {
    super(typeof error === 'string' ? error : error, options);
    this.endpoint = endpoint;
    this.statusCode = statusCode;
    this.name = 'DockerApiError';
  }
}


/**
 * Get the Better Auth session token from cookies
 * In production with useSecureCookies=true, the cookie is named '__Secure-recoder.session_token'
 * In development, it's 'recoder.session_token'
 *
 * NOTE: If the cookie is HttpOnly or blocked by 3rd party cookie restrictions,
 * this function will return null. In that case, auth will fall back to anonymous mode
 * on the server side (which is allowed in migration mode).
 */
function getSessionToken(): string | null {
  if (typeof document === 'undefined') return null;

  ensureAnonymousIdentityCookie();

  const cookies = document.cookie.split(';');
  // Priority order for cookie names (production secure cookies first)
  const cookieNames = [
    '__Secure-recoder.session_token',  // Production with Secure cookies
    'recoder.session_token',            // Development
    '__Secure-better-auth.session_token',
    'better-auth.session_token',
    '__Secure-session_token',           // Production without prefix
    'session_token',                    // Fallback
    'recoder_session_token',            // Alternative format
  ];

  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split('=');
    const value = valueParts.join('='); // Handle cookies with = in value
    if (cookieNames.includes(name) && value) {
      // Token found - return it
      return decodeURIComponent(value);
    }
  }

  // Token not found in cookies
  // This can happen if:
  // 1. User is not logged in
  // 2. Cookie is HttpOnly (can't be read by JavaScript)
  // 3. 3rd party cookies are blocked by browser
  // 4. Cookie domain doesn't match current domain
  //
  // The docker-backend will allow anonymous access in migration mode (REQUIRE_AUTH=false)
  // Log a warning in development to help debug
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    // Only log once per session to avoid spam
    const logKey = 'token_warning_logged';
    if (!sessionStorage.getItem(logKey)) {
      logger.debug('[docker-api] Session token not found in cookies. Auth will fall back to anonymous mode.');
      sessionStorage.setItem(logKey, 'true');
    }
  }

  return null;
}

/**
 * Get headers with authentication for docker-backend requests
 */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const anonymousId = ensureAnonymousIdentityCookie();
  if (anonymousId) {
    headers[ANONYMOUS_ID_HEADER_NAME] = anonymousId;
  }

  const token = getSessionToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Build fetch init for raw docker-backend requests.
 * Always include browser credentials so secure shared-session cookies are sent,
 * and only attach an Authorization header when a readable token is actually present.
 */
export function withDockerCredentials(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  const anonymousId = ensureAnonymousIdentityCookie();
  const token = getSessionToken();

  if (anonymousId && !headers.has(ANONYMOUS_ID_HEADER_NAME)) {
    headers.set(ANONYMOUS_ID_HEADER_NAME, anonymousId);
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return {
    ...init,
    headers,
    credentials: init.credentials ?? 'include',
  };
}

/**
 * Parse and handle API response
 * Throws DockerApiError for error responses
 * Maps HTTP status codes to specific error types
 */
async function parseResponse<T>(response: Response, endpoint: string): Promise<T> {
  let data: ApiResponse<T>;

  try {
    data = await response.json();
  } catch (e) {
    // Non-JSON response
    if (!response.ok) {
      // Map status codes to specific error types
      const error = createErrorFromStatus(response.status, endpoint);
      throw error;
    }
    // Assume success for non-JSON OK responses
    return undefined as T;
  }

  // Check for error response
  // Note: Some endpoints return data without success field - treat 2xx without explicit success:false as success
  const hasExplicitError = data.success === false || (data as any).error;
  if (!response.ok || hasExplicitError) {
    const errorResponse = data as ApiErrorResponse;
    throw new DockerApiError(
      errorResponse.error || `Request failed with status ${response.status}`,
      endpoint,
      response.status,
      {
        canRetry: errorResponse.canRetry ?? response.status >= 500,
        retryAfter: errorResponse.retryAfter,
      }
    );
  }

  // Return data field if present, otherwise return the whole response (for endpoints without success wrapper)
  return ((data as ApiSuccessResponse<T>).data ?? data) as T;
}

/**
 * Create appropriate error type from HTTP status code
 */
function createErrorFromStatus(status: number, endpoint: string): DockerApiError {
  switch (status) {
    case 401:
      return new DockerApiError(
        { code: ErrorCode.AUTH_REQUIRED, message: 'Authentication required' },
        endpoint,
        status,
        { canRetry: false }
      );
    case 403:
      return new DockerApiError(
        { code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, message: 'Access denied' },
        endpoint,
        status,
        { canRetry: false }
      );
    case 404:
      return new DockerApiError(
        { code: ErrorCode.CONTAINER_NOT_FOUND, message: 'Resource not found' },
        endpoint,
        status,
        { canRetry: false }
      );
    case 408:
      return new DockerApiError(
        { code: ErrorCode.TIMEOUT_ERROR, message: 'Request timeout' },
        endpoint,
        status,
        { canRetry: true }
      );
    case 429:
      return new DockerApiError(
        { code: ErrorCode.RATE_LIMITED, message: 'Too many requests' },
        endpoint,
        status,
        { canRetry: true, retryAfter: 60 }
      );
    case 500:
    case 502:
    case 503:
    case 504:
      return new DockerApiError(
        { code: ErrorCode.SERVICE_UNAVAILABLE, message: 'Server error' },
        endpoint,
        status,
        { canRetry: true }
      );
    default:
      return new DockerApiError(
        `Request failed with status ${status}`,
        endpoint,
        status,
        { canRetry: status >= 500 }
      );
  }
}

/**
 * Request options for docker API calls
 */
interface DockerRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Retry configuration */
  retry?: Partial<RetryConfig>;
  /** Skip retry for this request */
  skipRetry?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Callback when retrying */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

/**
 * Make an authenticated request to docker-backend with error handling
 */
export async function dockerFetch<T = unknown>(
  endpoint: string,
  options: DockerRequestOptions = {}
): Promise<T> {
  const { body, retry, skipRetry, timeout = 30000, onRetry, ...fetchOptions } = options;
  const url = endpoint.startsWith('http') ? endpoint : `${DOCKER_URL}${endpoint}`;
  const requestId = getNextRequestId();
  const method = fetchOptions.method || 'GET';

  const headers = {
    ...getAuthHeaders(),
    ...(fetchOptions.headers || {}),
  };

  // Log request start
  if (DEBUG) {
    logger.debug(`[${requestId}] ${method} ${endpoint}`, {
      hasBody: !!body,
      timeout,
      skipRetry,
    });
  }

  const makeRequest = async (): Promise<T> => {
    const requestTimer = createTimer(`${method} ${endpoint}`, 'DockerAPI');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, withDockerCredentials({
        ...fetchOptions,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      }));

      clearTimeout(timeoutId);
      const result = await parseResponse<T>(response, endpoint);

      // Log successful response
      const duration = requestTimer.end();
      if (DEBUG) {
        logger.debug(`[${requestId}] ${method} ${endpoint} -> ${response.status}`, {
          duration,
          status: response.status,
        });
      } else {
        logger.debugVerbose(`${method} ${endpoint} completed in ${duration}ms`);
      }

      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      const duration = requestTimer.end();

      // Handle abort/timeout
      if (error instanceof DOMException && error.name === 'AbortError') {
        logger.timed('warn', `[${requestId}] ${method} ${endpoint} timed out`, duration);
        const timeoutError = new DockerApiError(
          { code: ErrorCode.TIMEOUT_ERROR, message: `Request timed out after ${timeout}ms` },
          endpoint,
          0,
          { canRetry: true }
        );
        throw timeoutError;
      }

      // Handle network errors with more specific detection
      if (error instanceof TypeError) {
        const msg = error.message.toLowerCase();

        // DNS resolution failure
        if (msg.includes('not found') || msg.includes('enotfound')) {
          throw new DockerApiError(
            { code: ErrorCode.DNS_ERROR, message: 'Unable to resolve server address' },
            endpoint,
            0,
            { canRetry: true }
          );
        }

        // Connection refused
        if (msg.includes('refused') || msg.includes('econnrefused')) {
          throw new DockerApiError(
            { code: ErrorCode.CONNECTION_REFUSED, message: 'Server is not responding' },
            endpoint,
            0,
            { canRetry: true }
          );
        }

        // SSL/TLS errors
        if (msg.includes('ssl') || msg.includes('certificate') || msg.includes('https')) {
          throw new DockerApiError(
            { code: ErrorCode.SSL_ERROR, message: 'Secure connection failed' },
            endpoint,
            0,
            { canRetry: false }
          );
        }

        // General network error
        if (msg.includes('fetch') || msg.includes('network')) {
          throw new DockerApiError(
            { code: ErrorCode.NETWORK_ERROR, message: 'Network error. Please check your connection.' },
            endpoint,
            0,
            { canRetry: true }
          );
        }
      }

      // Re-throw DockerApiError as-is
      if (error instanceof DockerApiError) {
        logger.timed('error', `[${requestId}] ${method} ${endpoint} failed`, duration, {
          code: error.code,
          message: error.message,
        });
        throw error;
      }

      // Wrap unknown errors
      logger.timed('error', `[${requestId}] ${method} ${endpoint} unknown error`, duration, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DockerApiError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        endpoint,
        0,
        { canRetry: true }
      );
    }
  };

  // Skip retry if requested or for certain methods
  if (skipRetry || fetchOptions.method === 'DELETE') {
    return makeRequest();
  }

  return withRetry(makeRequest, {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    ...retry,
    onRetry,
    shouldRetry: (error) => {
      if (error instanceof DockerApiError) {
        // Don't retry auth errors
        if (error.code === ErrorCode.AUTH_REQUIRED || error.code === ErrorCode.AUTH_TOKEN_EXPIRED) {
          return false;
        }
        return error.canRetry;
      }
      return true;
    },
  });
}

/**
 * Make a GET request to docker-backend
 */
export async function dockerGet<T = unknown>(
  endpoint: string,
  options?: Omit<DockerRequestOptions, 'body' | 'method'>
): Promise<T> {
  return dockerFetch<T>(endpoint, { ...options, method: 'GET' });
}

/**
 * Make a POST request to docker-backend
 */
export async function dockerPost<T = unknown>(
  endpoint: string,
  body?: unknown,
  options?: Omit<DockerRequestOptions, 'body' | 'method'>
): Promise<T> {
  return dockerFetch<T>(endpoint, { ...options, method: 'POST', body });
}

/**
 * Make a PUT request to docker-backend
 */
export async function dockerPut<T = unknown>(
  endpoint: string,
  body?: unknown,
  options?: Omit<DockerRequestOptions, 'body' | 'method'>
): Promise<T> {
  return dockerFetch<T>(endpoint, { ...options, method: 'PUT', body });
}

/**
 * Make a DELETE request to docker-backend
 */
export async function dockerDelete<T = unknown>(
  endpoint: string,
  body?: unknown,
  options?: Omit<DockerRequestOptions, 'body' | 'method'>
): Promise<T> {
  return dockerFetch<T>(endpoint, { ...options, method: 'DELETE', body, skipRetry: true });
}

/**
 * Create a reconnecting WebSocket to docker-backend
 */
export function createDockerWebSocket(
  path: string,
  options: {
    onMessage?: (data: unknown) => void;
    onStatusChange?: (status: ConnectionState) => void;
    onError?: (error: Error) => void;
    protocols?: string | string[];
  } = {}
): ReconnectingWebSocket {
  const normalizedPath = normalizeDockerWebSocketPath(path);
  const wsUrl = DOCKER_URL.replace(/^http/, 'ws') + normalizedPath;
  const token = getSessionToken();
  const urlWithToken = token ? `${wsUrl}${wsUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : wsUrl;

  return new ReconnectingWebSocket(urlWithToken, options.protocols, {
    maxReconnects: 10,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 1.5,
    onMessage: (event) => {
      try {
        const data = JSON.parse(event.data);
        options.onMessage?.(data);
      } catch {
        options.onMessage?.(event.data);
      }
    },
    onError: (event) => {
      options.onError?.(new Error('WebSocket error'));
    },
    onReconnecting: (attempt, delay) => {
      options.onStatusChange?.({
        status: 'reconnecting',
        reconnectAttempt: attempt,
      });
    },
    onReconnected: () => {
      options.onStatusChange?.({
        status: 'connected',
        lastConnected: new Date(),
      });
    },
    onMaxReconnectsReached: () => {
      options.onStatusChange?.({
        status: 'error',
        error: 'Max reconnection attempts reached',
      });
    },
  });
}

/**
 * Normalize legacy websocket endpoints to the canonical docker-backend routes.
 * recoder-web still has older callers that use `/api/watch/...` and
 * `/api/terminal/...`, while the backend only serves `/watch/...` and
 * `/terminal/...` with `terminalId` as a query param.
 */
export function normalizeDockerWebSocketPath(path: string): string {
  const queryIndex = path.indexOf('?');
  const pathname = queryIndex === -1 ? path : path.slice(0, queryIndex);
  const rawQuery = queryIndex === -1 ? '' : path.slice(queryIndex + 1);

  if (pathname.startsWith('/api/watch/')) {
    const canonicalPath = pathname.replace('/api/watch/', '/watch/');
    return rawQuery ? `${canonicalPath}?${rawQuery}` : canonicalPath;
  }

  const terminalMatch = pathname.match(/^\/api\/terminal\/([^/?]+)(?:\/([^/?]+))?$/);
  if (!terminalMatch) {
    return path;
  }

  const [, projectId, terminalId] = terminalMatch;
  const params = new URLSearchParams(rawQuery);

  if (terminalId && !params.has('terminalId')) {
    params.set('terminalId', terminalId);
  }

  const canonicalPath = `/terminal/${projectId}`;
  const query = params.toString();

  return query ? `${canonicalPath}?${query}` : canonicalPath;
}

/**
 * Health check for docker-backend
 */
export async function checkDockerHealth(): Promise<{ healthy: boolean; latency: number }> {
  const start = Date.now();
  try {
    await dockerGet('/health', { timeout: 5000, skipRetry: true });
    return { healthy: true, latency: Date.now() - start };
  } catch {
    return { healthy: false, latency: Date.now() - start };
  }
}

/**
 * Get connection status indicator color
 */
export function getConnectionStatusColor(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'bg-green-500';
    case 'connecting':
    case 'reconnecting':
      return 'bg-yellow-500';
    case 'disconnected':
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

/**
 * File operation with specific error handling
 */
export async function dockerWriteFile(
  projectId: string,
  path: string,
  content: string,
  options?: { timeout?: number; onRetry?: (attempt: number) => void }
): Promise<void> {
  const endpoint = `/api/file/${projectId}`;

  try {
    await dockerPost(endpoint, { path, content }, {
      timeout: options?.timeout ?? 30000,
      retry: {
        maxRetries: 2,
        onRetry: (error, attempt) => {
          options?.onRetry?.(attempt);
        },
      },
    });
  } catch (error) {
    // Convert to FileOperationError for better context
    if (error instanceof DockerApiError) {
      throw new FileOperationError('write', path, error.message, { canRetry: error.canRetry });
    }
    throw new FileOperationError('write', path, error instanceof Error ? error.message : 'Write failed');
  }
}

/**
 * Read file with specific error handling
 */
export async function dockerReadFile(
  projectId: string,
  path: string,
  options?: { timeout?: number }
): Promise<string> {
  const endpoint = `/api/file/${projectId}?path=${encodeURIComponent(path)}`;

  try {
    const response = await dockerGet<{ content: string } | string>(endpoint, {
      timeout: options?.timeout ?? 15000,
    });
    return typeof response === 'string' ? response : response.content;
  } catch (error) {
    // Handle file not found gracefully
    if (error instanceof DockerApiError && error.statusCode === 404) {
      throw new FileOperationError('read', path, 'File not found', { canRetry: false });
    }
    if (error instanceof DockerApiError) {
      throw new FileOperationError('read', path, error.message, { canRetry: error.canRetry });
    }
    throw new FileOperationError('read', path, error instanceof Error ? error.message : 'Read failed');
  }
}

/**
 * Delete file with specific error handling
 */
export async function dockerDeleteFile(
  projectId: string,
  path: string
): Promise<void> {
  const endpoint = `/api/file/${projectId}`;

  try {
    await dockerDelete(endpoint, { path });
  } catch (error) {
    if (error instanceof DockerApiError) {
      throw new FileOperationError('delete', path, error.message, { canRetry: error.canRetry });
    }
    throw new FileOperationError('delete', path, error instanceof Error ? error.message : 'Delete failed');
  }
}

/**
 * Batch file write with error tracking
 */
export async function dockerWriteFiles(
  projectId: string,
  files: Array<{ path: string; content: string }>,
  options?: {
    onProgress?: (completed: number, total: number, failed: string[]) => void;
    continueOnError?: boolean;
  }
): Promise<{
  success: boolean;
  completed: number;
  failed: Array<{ path: string; error: string }>;
}> {
  const failed: Array<{ path: string; error: string }> = [];
  let completed = 0;

  for (const file of files) {
    try {
      await dockerWriteFile(projectId, file.path, file.content);
      completed++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      failed.push({ path: file.path, error: errorMessage });

      if (!options?.continueOnError) {
        break;
      }
    }

    options?.onProgress?.(completed, files.length, failed.map(f => f.path));
  }

  return {
    success: failed.length === 0,
    completed,
    failed,
  };
}

/**
 * Batch read files with concurrency control
 * Inspired by December's batch reading pattern
 */
export async function dockerReadFilesBatch(
  projectId: string,
  paths: string[],
  options?: {
    concurrency?: number;
    timeout?: number;
    onProgress?: (completed: number, total: number, failed: string[]) => void;
    onFileRead?: (path: string, content: string) => void;
    onFileError?: (path: string, error: string) => void;
  }
): Promise<{
  success: boolean;
  results: Map<string, string>;
  failed: Array<{ path: string; error: string }>;
  completed: number;
}> {
  const {
    concurrency = 50,
    timeout = 15000,
    onProgress,
    onFileRead,
    onFileError,
  } = options || {};

  const results = new Map<string, string>();
  const failed: Array<{ path: string; error: string }> = [];
  let completed = 0;

  // Process files in batches with controlled concurrency
  for (let i = 0; i < paths.length; i += concurrency) {
    const batch = paths.slice(i, i + concurrency);

    const batchPromises = batch.map(async (path) => {
      try {
        const content = await dockerReadFile(projectId, path, { timeout });
        results.set(path, content);
        completed++;
        onFileRead?.(path, content);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        failed.push({ path, error: errorMessage });
        onFileError?.(path, errorMessage);
      }
    });

    await Promise.all(batchPromises);
    onProgress?.(completed, paths.length, failed.map(f => f.path));
  }

  return {
    success: failed.length === 0,
    results,
    failed,
    completed,
  };
}

/**
 * Read file tree with contents (batch read all files)
 * Returns file tree structure with content for each file
 */
export async function dockerReadFileTree(
  projectId: string,
  options?: {
    concurrency?: number;
    filter?: (path: string) => boolean;
    onProgress?: (loaded: number, total: number) => void;
  }
): Promise<{
  files: Array<{ path: string; content: string; type: 'file' }>;
  directories: Array<{ path: string; type: 'directory' }>;
  failed: Array<{ path: string; error: string }>;
}> {
  const { concurrency = 50, filter, onProgress } = options || {};

  // First, get the file tree structure
  const treeEndpoint = `/api/files/${projectId}`;

  try {
    const treeResponse = await dockerGet<{
      files: Array<{ path: string; type: 'file' | 'directory' }>
    }>(treeEndpoint, { timeout: 30000 });

    const allItems = treeResponse.files || [];
    const directories = allItems.filter(f => f.type === 'directory').map(d => ({
      path: d.path,
      type: 'directory' as const
    }));
    const fileItems = allItems.filter(f => f.type === 'file');

    // Apply filter if provided
    const filesToRead = filter
      ? fileItems.filter(f => filter(f.path))
      : fileItems;

    const filePaths = filesToRead.map(f => f.path);

    // Batch read all files
    const readResult = await dockerReadFilesBatch(projectId, filePaths, {
      concurrency,
      onProgress: (completed, total) => {
        onProgress?.(completed, total);
      },
    });

    const files = Array.from(readResult.results.entries()).map(([path, content]) => ({
      path,
      content,
      type: 'file' as const,
    }));

    return {
      files,
      directories,
      failed: readResult.failed,
    };
  } catch (error) {
    throw new FileOperationError(
      'read',
      'file tree',
      error instanceof Error ? error.message : 'Failed to read file tree'
    );
  }
}

/**
 * Get retry suggestion based on error type
 */
export function getRetrySuggestion(error: Error | DockerApiError): {
  canRetry: boolean;
  message: string;
  waitTime?: number;
} {
  if (error instanceof DockerApiError) {
    switch (error.code) {
      case ErrorCode.RATE_LIMITED:
        return {
          canRetry: true,
          message: 'You\'ve made too many requests. Please wait before trying again.',
          waitTime: error.retryAfter ? error.retryAfter * 1000 : 60000,
        };
      case ErrorCode.TIMEOUT_ERROR:
        return {
          canRetry: true,
          message: 'The request took too long. Try again or check your connection.',
          waitTime: 1000,
        };
      case ErrorCode.NETWORK_ERROR:
      case ErrorCode.CONNECTION_REFUSED:
        return {
          canRetry: true,
          message: 'Network issue detected. Check your connection and try again.',
          waitTime: 2000,
        };
      case ErrorCode.AUTH_TOKEN_EXPIRED:
      case ErrorCode.AUTH_REQUIRED:
        return {
          canRetry: false,
          message: 'Please log in again to continue.',
        };
      case ErrorCode.SERVICE_UNAVAILABLE:
        return {
          canRetry: true,
          message: 'The server is temporarily unavailable. Please try again in a moment.',
          waitTime: 5000,
        };
      default:
        return {
          canRetry: error.canRetry,
          message: error.canRetry ? 'An error occurred. You can try again.' : 'This error cannot be automatically resolved.',
        };
    }
  }

  return {
    canRetry: true,
    message: 'An unexpected error occurred. You can try again.',
  };
}

// Export the base URL and shared timeouts for WebSocket connections
export { DOCKER_URL, CONTAINER_CREATE_TIMEOUT_MS };
export { getSessionToken };
export { getUserFriendlyMessage };
export { FileOperationError, NetworkError, AuthError, TimeoutError, ServerError };
export type { ConnectionState, ConnectionStatus };
