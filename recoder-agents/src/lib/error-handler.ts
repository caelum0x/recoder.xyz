import { toast } from '@/lib/toast';
import {
  AgentRunLimitError,
  ProjectLimitError,
  BillingError,
  TriggerLimitError,
  ModelAccessDeniedError,
  CustomWorkerLimitError,
  ThreadLimitError,
  AgentCountLimitError,
  formatTierErrorForUI,
  isTierRestrictionError
} from './api/errors';
import { usePricingModalStore } from '@/stores/pricing-modal-store';

export interface ApiError extends Error {
  status?: number;
  code?: string;
  details?: Record<string, unknown>;
  detail?: Record<string, unknown> | string;
  data?: Record<string, unknown>;
  response?: Response;
}

export interface ErrorContext {
  operation?: string;
  resource?: string;
  silent?: boolean;
}

// --- Toast rate-limiting ---
const TOAST_RATE_WINDOW_MS = 10_000;
const TOAST_RATE_MAX = 3;
const recentToastTimestamps: number[] = [];

const isToastRateLimited = (): boolean => {
  const now = Date.now();
  // Remove timestamps older than the window
  while (recentToastTimestamps.length > 0 && now - recentToastTimestamps[0] > TOAST_RATE_WINDOW_MS) {
    recentToastTimestamps.shift();
  }
  if (recentToastTimestamps.length >= TOAST_RATE_MAX) {
    return true;
  }
  recentToastTimestamps.push(now);
  return false;
};

// --- User-friendly status messages ---
const getStatusMessage = (status: number): string => {
  switch (status) {
    case 400:
      return 'Invalid request. Please check your input and try again.';
    case 401:
      return 'Session expired. Please sign in again.';
    case 403:
      return 'You don\'t have permission for this action.';
    case 404:
      return 'The requested resource was not found.';
    case 408:
      return 'Request timeout. Please try again.';
    case 409:
      return 'Conflict detected. The resource may have been modified by another user.';
    case 422:
      return 'Invalid data provided. Please check your input.';
    case 429:
      return 'Too many requests. Please wait a moment.';
    case 500:
      return 'Something went wrong on our end.';
    case 502:
      return 'Service temporarily unavailable. Please try again in a moment.';
    case 503:
      return 'Service maintenance in progress. Please try again later.';
    case 504:
      return 'Request timeout. The server took too long to respond.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
};

// --- Network error detection ---
const isNetworkErrorMessage = (msg: string): boolean => {
  const lower = msg.toLowerCase();
  return (
    lower.includes('networkerror') ||
    lower.includes('failed to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('network error') ||
    lower.includes('load failed') ||
    lower.includes('connection refused') ||
    lower.includes('err_connection')
  );
};

// --- Backend response body parsing ---
const extractBackendMessage = (error: any): string | null => {
  // Try to extract `detail` or `message` from backend JSON response bodies
  if (error?.detail) {
    if (typeof error.detail === 'string') return error.detail;
    if (typeof error.detail === 'object' && error.detail.message) {
      return String(error.detail.message);
    }
  }
  if (error?.data?.detail) {
    if (typeof error.data.detail === 'string') return error.data.detail;
    if (typeof error.data.detail === 'object' && error.data.detail.message) {
      return String(error.data.detail.message);
    }
  }
  if (error?.data?.message && typeof error.data.message === 'string') {
    return error.data.message;
  }
  return null;
};

const extractErrorMessage = (error: any): string => {
  if (error instanceof BillingError) {
    return error.detail?.message || error.message || 'Billing issue detected';
  }

  if (error instanceof AgentRunLimitError) {
    return error.detail?.message || error.message || 'Worker run limit exceeded';
  }

  if (error instanceof ProjectLimitError) {
    return error.detail?.message || error.message || 'Project limit exceeded';
  }

  if (error instanceof AgentCountLimitError) {
    return error.detail?.message || error.message || 'Worker limit exceeded';
  }

  if (error instanceof TriggerLimitError) {
    return error.detail?.message || error.message || 'Trigger limit exceeded';
  }

  if (error instanceof ModelAccessDeniedError) {
    return error.detail?.message || error.message || 'Model access denied';
  }

  if (error instanceof CustomWorkerLimitError) {
    return error.detail?.message || error.message || 'Custom worker limit exceeded';
  }

  if (error instanceof ThreadLimitError) {
    return error.detail?.message || error.message || 'Thread limit exceeded';
  }

  // Check for network errors before generic Error check
  if (error instanceof Error && isNetworkErrorMessage(error.message)) {
    return 'Connection lost. Check your internet.';
  }

  // Try to parse backend response body fields (detail / message)
  const backendMsg = extractBackendMessage(error);
  if (backendMsg) {
    return backendMsg;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error?.response) {
    const status = error.response.status;
    return getStatusMessage(status);
  }

  if (error?.status) {
    return getStatusMessage(error.status);
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error?.message) {
    return error.message;
  }

  if (error?.error) {
    return typeof error.error === 'string' ? error.error : error.error.message || 'Unknown error';
  }

  return 'An unexpected error occurred';
};

const shouldShowError = (error: any, context?: ErrorContext): boolean => {
  if (context?.silent) {
    return false;
  }
  if (error instanceof BillingError) {
    return false;
  }

  if (error?.status === 404 && context?.resource) {
    return false;
  }

  return true;
};

const formatErrorMessage = (message: string, context?: ErrorContext): string => {
  if (!context?.operation && !context?.resource) {
    return message;
  }

  const parts = [];
  
  if (context.operation) {
    parts.push(`Failed to ${context.operation}`);
  }
  
  if (context.resource) {
    parts.push(context.resource);
  }

  const prefix = parts.join(' ');
  
  if (message.toLowerCase().includes(context.operation?.toLowerCase() || '')) {
    return message;
  }

  return `${prefix}: ${message}`;
};


export const handleApiError = (error: any, context?: ErrorContext): void => {
  if (!shouldShowError(error, context)) {
    return;
  }

  const rawMessage = extractErrorMessage(error);
  const formattedMessage = formatErrorMessage(rawMessage, context);

  // Handle tier restriction errors using shared formatting function
  const errorUI = formatTierErrorForUI(error);
  if (errorUI) {
    usePricingModalStore.getState().openPricingModal({
      isAlert: true,
      alertTitle: errorUI.alertTitle,
      alertSubtitle: errorUI.alertSubtitle
    });
    return;
  }

  // Rate-limit toasts to avoid flooding the UI
  if (isToastRateLimited()) {
    toast.warning('Multiple errors occurred', {
      description: 'Please wait a moment and try again.',
      duration: 5000,
    });
    return;
  }

  const status = error?.status ?? error?.response?.status;

  if (status === 401) {
    toast.error('Session expired. Please sign in again.', {
      duration: 6000,
    });
  } else if (status === 403) {
    toast.error(formattedMessage, {
      description: 'You don\'t have permission for this action.',
      duration: 6000,
    });
  } else if (status === 429) {
    toast.warning('Too many requests. Please wait a moment.', {
      duration: 5000,
    });
  } else if (status >= 500) {
    toast.error(formattedMessage, {
      description: 'Something went wrong on our end. Our team has been notified.',
      duration: 6000,
    });
  } else {
    toast.error(formattedMessage, {
      duration: 5000,
    });
  }
};

export const handleNetworkError = (error: any, context?: ErrorContext): void => {
  const isNetwork =
    (error?.message && isNetworkErrorMessage(error.message)) ||
    error?.code === 'NETWORK_ERROR' ||
    (typeof navigator !== 'undefined' && !navigator.onLine);

  if (isNetwork) {
    if (isToastRateLimited()) {
      return;
    }
    toast.error('Connection lost. Check your internet.', {
      description: 'Please check your internet connection and try again.',
      duration: 6000,
    });
  } else {
    handleApiError(error, context);
  }
};

export const handleApiSuccess = (message: string, description?: string): void => {
  toast.success(message, {
    description,
    duration: 3000,
  });
};

export const handleApiWarning = (message: string, description?: string): void => {
  toast.warning(message, {
    description,
    duration: 4000,
  });
};

export const handleApiInfo = (message: string, description?: string): void => {
  toast.info(message, {
    description,
    duration: 3000,
  });
};

/**
 * Check if an error is a billing/limit error that should open the pricing modal.
 * This is an alias for isTierRestrictionError from shared package for backwards compatibility.
 */
export const isBillingError = isTierRestrictionError;

/**
 * Handle billing errors by opening the pricing modal with appropriate message.
 * Returns true if error was handled, false otherwise.
 * Use this in mutation onError callbacks.
 */
export const handleBillingError = (error: any): boolean => {
  if (!isTierRestrictionError(error)) {
    return false;
  }
  
  handleApiError(error);
  return true;
}; 