import { handleApiError, handleNetworkError, ErrorContext, ApiError } from './error-handler';
import { parseTierRestrictionError, RequestTooLargeError } from './api/errors';
import { getSessionAccessToken } from '@/lib/auth/session-token';

const _envUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '';
// Guard: never use a localhost backend URL in production (can leak in via .env.local at build time)
const API_URL = (_envUrl && !_envUrl.includes('localhost'))
  ? _envUrl
  : (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'https://api.recoder.xyz/v1'
    : _envUrl);

export interface ApiClientOptions {
  showErrors?: boolean;
  errorContext?: ErrorContext;
  timeout?: number;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: ApiError;
  success: boolean;
}

/**
 * Error class that preserves HTTP status code when API responses are thrown.
 * React Query's retry function checks `error.status` to decide whether to retry,
 * so we need to propagate the status from the API response.
 */
export class ApiRequestError extends Error {
  status?: number;
  code?: string;
  details?: any;

  constructor(message: string, status?: number, code?: string, details?: any) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Helper to throw an error from an ApiResponse, preserving HTTP status for React Query.
 * Use this instead of `if (response.error) throw new Error(response.error.message)`
 * so that retry logic can distinguish 4xx from 5xx errors.
 */
export function throwIfError<T>(response: ApiResponse<T>): asserts response is ApiResponse<T> & { data: T; success: true } {
  if (response.error) {
    const status = (response.error as any)?.status;
    const code = (response.error as any)?.code;
    const details = (response.error as any)?.details;
    throw new ApiRequestError(response.error.message, status, code, details);
  }
}

async function makeRequest<T = any>(
  url: string,
  options: RequestInit & ApiClientOptions = {}
): Promise<ApiResponse<T>> {
  const {
    showErrors = true,
    errorContext,
    timeout = 30000,
    ...fetchOptions
  } = options;

  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | null = null;
  let isAborted = false;

  try {
    timeoutId = setTimeout(() => {
      if (!isAborted && !controller.signal.aborted) {
        isAborted = true;
        controller.abort();
      }
    }, timeout);

    // Don't set Content-Type for FormData - browser will set it automatically with boundary
    const isFormData = fetchOptions.body instanceof FormData;
    const headers: Record<string, string> = {};

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    // Merge with any headers from fetchOptions
    Object.assign(headers, fetchOptions.headers as Record<string, string>);

    // Attach Bearer token for cross-subdomain auth.
    // Cross-domain cookies (credentials: "include") are increasingly blocked by browsers,
    // so we always send the session token as a Bearer header as the primary auth method.
    if (!headers['Authorization']) {
      try {
        const token = await getSessionAccessToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      } catch {
        // Session token unavailable — fall back to cookie-based auth
      }
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });

    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      let errorData: any = null;

      try {
        errorData = await response.json();
        if (errorData.message) {
          errorMessage = errorData.message;
        } else if (typeof errorData.detail === 'string') {
          // FastAPI returns {"detail": "error message"}
          errorMessage = errorData.detail;
        } else if (errorData.detail?.message) {
          errorMessage = errorData.detail.message;
        }
      } catch {
      }

      let error: ApiError | Error = Object.assign(Object.create(Error.prototype), {
        message: errorMessage,
        name: 'ApiError',
        status: response.status,
        response: response,
        details: errorData || undefined,
        data: errorData,
        detail: errorData?.detail,
        code: errorData?.code || errorData?.error_code || errorData?.detail?.error_code || response.status.toString()
      });

      if (response.status === 402) {
        error = parseTierRestrictionError(error);
      }

      // Handle HTTP 431 - Request Header Fields Too Large
      // This typically happens when uploading many files at once
      if (response.status === 431) {
        error = new RequestTooLargeError(431, {
          message: 'Request is too large to process',
          suggestion: 'Try uploading files one at a time, or reduce the number of files attached to your message.',
        });
      }

      if (showErrors) {
        handleApiError(error, errorContext);
      }

      return {
        error,
        success: false,
      };
    }

    let data: T;
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else if (contentType?.includes('text/')) {
      data = await response.text() as T;
    } else {
      data = await response.blob() as T;
    }

    return {
      data,
      success: true,
    };

  } catch (error: any) {
    // Always clear timeout on error
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    // Check if this is an abort error (timeout or manual abort)
    const isAbortError = error?.name === 'AbortError' || 
                         error?.name === 'AbortSignal' ||
                         (error instanceof Error && error.message.includes('aborted'));

    // If it was aborted, mark it so we don't try to abort again
    if (isAbortError) {
      isAborted = true;
    }

    let apiError: ApiError;
    
    if (isAbortError) {
      apiError = Object.assign(Object.create(Error.prototype), {
        message: 'Request timeout',
        name: 'ApiError',
        code: 'TIMEOUT'
      });
      
      // Only show timeout errors if showErrors is true
      // This prevents spam from multiple concurrent timeouts or React Query cancellations
      if (showErrors) {
        handleNetworkError(apiError, errorContext);
      }
    } else if (error instanceof Error) {
      apiError = Object.assign(Object.create(Error.prototype), {
        message: error.message,
        name: error.name || 'ApiError',
        stack: error.stack
      });

      if (showErrors) {
        handleNetworkError(apiError, errorContext);
      }
    } else {
      apiError = Object.assign(Object.create(Error.prototype), {
        message: String(error),
        name: 'ApiError'
      });

      if (showErrors) {
        handleNetworkError(apiError, errorContext);
      }
    }

    return {
      error: apiError,
      success: false,
    };
  }
}

export const backendApi = {
  get: <T = any>(endpoint: string, options?: Omit<RequestInit & ApiClientOptions, 'method' | 'body'>) =>
    makeRequest<T>(`${API_URL}${endpoint}`, { ...options, method: 'GET' }),

  post: <T = any>(endpoint: string, data?: any, options?: Omit<RequestInit & ApiClientOptions, 'method'>) =>
    makeRequest<T>(`${API_URL}${endpoint}`, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T = any>(endpoint: string, data?: any, options?: Omit<RequestInit & ApiClientOptions, 'method'>) =>
    makeRequest<T>(`${API_URL}${endpoint}`, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  patch: <T = any>(endpoint: string, data?: any, options?: Omit<RequestInit & ApiClientOptions, 'method'>) =>
    makeRequest<T>(`${API_URL}${endpoint}`, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T = any>(endpoint: string, options?: Omit<RequestInit & ApiClientOptions, 'method' | 'body'>) =>
    makeRequest<T>(`${API_URL}${endpoint}`, { ...options, method: 'DELETE' }),

  upload: <T = any>(endpoint: string, formData: FormData, options?: Omit<RequestInit & ApiClientOptions, 'method' | 'body'>) => {
    const { headers, ...restOptions } = options || {};
    const uploadHeaders = { ...headers as Record<string, string> };
    delete uploadHeaders['Content-Type'];

    return makeRequest<T>(`${API_URL}${endpoint}`, {
      ...restOptions,
      method: 'POST',
      body: formData,
      headers: uploadHeaders,
    });
  },

  uploadPut: <T = any>(endpoint: string, formData: FormData, options?: Omit<RequestInit & ApiClientOptions, 'method' | 'body'>) => {
    const { headers, ...restOptions } = options || {};
    const uploadHeaders = { ...headers as Record<string, string> };
    delete uploadHeaders['Content-Type'];

    return makeRequest<T>(`${API_URL}${endpoint}`, {
      ...restOptions,
      method: 'PUT',
      body: formData,
      headers: uploadHeaders,
    });
  },
}; 