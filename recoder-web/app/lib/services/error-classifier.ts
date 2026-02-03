/**
 * Error Classification System
 *
 * Categorizes errors for better UX and automatic recovery.
 * Inspired by openclaw's error classification pattern.
 *
 * Usage:
 *   import { classifyError, retryWithBackoff } from '~/lib/services/error-classifier';
 *
 *   try { ... } catch (err) {
 *     const classified = classifyError(err);
 *     if (classified.retryable) {
 *       return retryWithBackoff(fn, classified);
 *     }
 *   }
 */

export enum ErrorCategory {
  RATE_LIMIT = 'rate_limit',
  AUTH = 'auth',
  BILLING = 'billing',
  TIMEOUT = 'timeout',
  CONTEXT_OVERFLOW = 'context_overflow',
  NETWORK = 'network',
  CONTAINER = 'container',
  BUILD = 'build',
  RUNTIME = 'runtime',
  PROVIDER = 'provider',
  UNKNOWN = 'unknown',
}

export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  userMessage: string; // Friendly message for the user
  retryable: boolean;
  retryDelay?: number; // ms before retry
  maxRetries?: number;
  suggestion?: string; // What the user can do
}

// Pattern-based error classification
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  category: ErrorCategory;
  userMessage: string;
  retryable: boolean;
  retryDelay?: number;
  maxRetries?: number;
  suggestion?: string;
}> = [
  // Rate limiting
  {
    pattern: /rate.?limit|429|too many requests|quota exceeded/i,
    category: ErrorCategory.RATE_LIMIT,
    userMessage: 'Rate limit reached. Retrying shortly...',
    retryable: true,
    retryDelay: 5000,
    maxRetries: 3,
    suggestion: 'Wait a moment or upgrade your plan for higher limits.',
  },
  // Auth
  {
    pattern: /unauthorized|401|403|forbidden|invalid.?(?:api.?)?key|auth/i,
    category: ErrorCategory.AUTH,
    userMessage: 'Authentication failed.',
    retryable: false,
    suggestion: 'Check your API key or sign in again.',
  },
  // Billing
  {
    pattern: /insufficient.?(?:funds|credits)|payment|billing|402/i,
    category: ErrorCategory.BILLING,
    userMessage: 'Billing issue detected.',
    retryable: false,
    suggestion: 'Check your subscription status in the dashboard.',
  },
  // Timeout
  {
    pattern: /timeout|timed?.?out|ETIMEDOUT|ESOCKETTIMEDOUT|deadline/i,
    category: ErrorCategory.TIMEOUT,
    userMessage: 'Request timed out. Retrying...',
    retryable: true,
    retryDelay: 2000,
    maxRetries: 2,
  },
  // Context overflow
  {
    pattern: /context.?(?:length|window|limit)|too.?(?:long|many).?tokens|maximum.?(?:context|token)/i,
    category: ErrorCategory.CONTEXT_OVERFLOW,
    userMessage: 'Message too long for the model.',
    retryable: false,
    suggestion: 'Try shortening your message or starting a new chat.',
  },
  // Network
  {
    pattern: /ECONNREFUSED|ENOTFOUND|network|fetch.?failed|ERR_CONNECTION|socket.?hang/i,
    category: ErrorCategory.NETWORK,
    userMessage: 'Network connection issue. Retrying...',
    retryable: true,
    retryDelay: 3000,
    maxRetries: 3,
  },
  // Container
  {
    pattern: /container|docker|sandbox|OCI|not.?running|exited/i,
    category: ErrorCategory.CONTAINER,
    userMessage: 'Container issue detected.',
    retryable: true,
    retryDelay: 2000,
    maxRetries: 2,
    suggestion: 'The sandbox may need to restart.',
  },
  // Build errors
  {
    pattern: /build.?(?:failed|error)|compile|syntax.?error|module.?not.?found|cannot.?find.?module/i,
    category: ErrorCategory.BUILD,
    userMessage: 'Build error detected.',
    retryable: false,
    suggestion: 'Check the terminal for detailed error messages.',
  },
  // Runtime errors
  {
    pattern: /runtime.?error|uncaught|unhandled|TypeError|ReferenceError|RangeError/i,
    category: ErrorCategory.RUNTIME,
    userMessage: 'Runtime error in your app.',
    retryable: false,
    suggestion: 'Check the console for stack traces.',
  },
  // Provider errors (OpenRouter, Anthropic, etc.)
  {
    pattern: /openrouter|anthropic|openai|provider|model.?(?:not.?found|unavailable)|5\d{2}/i,
    category: ErrorCategory.PROVIDER,
    userMessage: 'AI provider issue. Retrying with fallback...',
    retryable: true,
    retryDelay: 2000,
    maxRetries: 2,
  },
];

export function classifyError(error: Error | string): ClassifiedError {
  const message = typeof error === 'string' ? error : error.message;

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.pattern.test(message)) {
      return {
        category: pattern.category,
        message,
        userMessage: pattern.userMessage,
        retryable: pattern.retryable,
        retryDelay: pattern.retryDelay,
        maxRetries: pattern.maxRetries,
        suggestion: pattern.suggestion,
      };
    }
  }

  return {
    category: ErrorCategory.UNKNOWN,
    message,
    userMessage: 'An unexpected error occurred.',
    retryable: false,
    suggestion: 'Try again or start a new chat.',
  };
}

// Retry helper with exponential backoff + jitter
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  error: ClassifiedError,
  onRetry?: (attempt: number, delay: number) => void,
): Promise<T> {
  const maxRetries = error.maxRetries || 0;
  const baseDelay = error.retryDelay || 2000;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        onRetry?.(attempt + 1, delay);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
