/**
 * Docker Backend API Client
 * Handles authenticated requests to the docker-backend service
 * Uses Better Auth session tokens for authentication
 * Includes robust error handling, retry logic, and connection status tracking
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
} from '~/lib/utils/error-handler';

const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || 'http://localhost:3100';

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
 * The cookie is named 'recoder.session_token' (with Better Auth prefix)
 */
function getSessionToken(): string | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    // Better Auth stores session as 'recoder.session_token' or 'session_token'
    if (name === 'recoder.session_token' || name === 'session_token') {
      return decodeURIComponent(value);
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

  const token = getSessionToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Parse and handle API response
 * Throws DockerApiError for error responses
 */
async function parseResponse<T>(response: Response, endpoint: string): Promise<T> {
  let data: ApiResponse<T>;

  try {
    data = await response.json();
  } catch (e) {
    // Non-JSON response
    if (!response.ok) {
      throw new DockerApiError(
        `Request failed with status ${response.status}`,
        endpoint,
        response.status,
        { canRetry: response.status >= 500 }
      );
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

  const headers = {
    ...getAuthHeaders(),
    ...(fetchOptions.headers || {}),
  };

  const makeRequest = async (): Promise<T> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return await parseResponse<T>(response, endpoint);
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new DockerApiError(
          'Request timed out',
          endpoint,
          0,
          { canRetry: true }
        );
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new DockerApiError(
          'Network error. Please check your connection.',
          endpoint,
          0,
          { canRetry: true }
        );
      }

      throw error;
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
  const wsUrl = DOCKER_URL.replace(/^http/, 'ws') + path;
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

// Export the base URL for WebSocket connections
export { DOCKER_URL };
export { getSessionToken };
export { getUserFriendlyMessage };
export type { ConnectionState, ConnectionStatus };
