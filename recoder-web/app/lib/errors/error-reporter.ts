/**
 * Error Reporter
 * Centralized error reporting with deduplication, batching, and local logging
 */

import {
  type AppError,
  type SerializedError,
  type ErrorSeverity,
  serializeError,
  toAppError,
  getErrorId,
} from './types';

/**
 * Error report destination
 */
export type ReportDestination = 'console' | 'backend' | 'localStorage' | 'external';

/**
 * Error reporter configuration
 */
export interface ErrorReporterConfig {
  /** Enable/disable reporting */
  enabled: boolean;
  /** Destinations to send errors to */
  destinations: ReportDestination[];
  /** Backend endpoint for error reporting */
  backendEndpoint?: string;
  /** External reporting service (e.g., Sentry DSN) */
  externalEndpoint?: string;
  /** Minimum severity to report */
  minSeverity: ErrorSeverity;
  /** Whether to batch errors before sending */
  batchErrors: boolean;
  /** Batch send interval in ms */
  batchInterval: number;
  /** Maximum batch size */
  maxBatchSize: number;
  /** Dedupe window in ms */
  dedupeWindow: number;
  /** Maximum stored errors in localStorage */
  maxStoredErrors: number;
  /** Sample rate (0-1) for non-critical errors */
  sampleRate: number;
  /** User ID for context */
  userId?: string;
  /** Project ID for context */
  projectId?: string;
}

const DEFAULT_CONFIG: ErrorReporterConfig = {
  enabled: true,
  destinations: ['console', 'localStorage'],
  minSeverity: 'warning',
  batchErrors: true,
  batchInterval: 5000,
  maxBatchSize: 10,
  dedupeWindow: 30000, // 30 seconds
  maxStoredErrors: 50,
  sampleRate: 1.0,
};

const SEVERITY_ORDER: ErrorSeverity[] = ['info', 'warning', 'error', 'critical'];

/**
 * Error Reporter singleton
 */
class ErrorReporter {
  private config: ErrorReporterConfig = DEFAULT_CONFIG;
  private errorQueue: SerializedError[] = [];
  private reportedErrors: Map<string, number> = new Map(); // errorId -> timestamp
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;

  /**
   * Initialize the error reporter
   */
  init(config: Partial<ErrorReporterConfig> = {}): void {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initialized = true;

    // Set up global error handlers
    if (typeof window !== 'undefined') {
      window.addEventListener('error', this.handleGlobalError);
      window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
    }

    // Start batch timer if batching is enabled
    if (this.config.batchErrors && this.config.destinations.includes('backend')) {
      this.startBatchTimer();
    }
  }

  /**
   * Clean up error reporter
   */
  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('error', this.handleGlobalError);
      window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
    }
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ErrorReporterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set user context
   */
  setUser(userId: string): void {
    this.config.userId = userId;
  }

  /**
   * Set project context
   */
  setProject(projectId: string): void {
    this.config.projectId = projectId;
  }

  /**
   * Report an error
   */
  report(
    error: Error | AppError | string,
    options?: {
      severity?: ErrorSeverity;
      source?: string;
      details?: Record<string, unknown>;
      skipDedupe?: boolean;
    }
  ): void {
    if (!this.config.enabled) return;

    // Convert to AppError
    const appError = typeof error === 'string' || error instanceof Error
      ? toAppError(error)
      : error;

    // Apply severity override
    if (options?.severity) {
      appError.severity = options.severity;
    }

    // Check minimum severity
    if (!this.meetsMinSeverity(appError.severity)) {
      return;
    }

    // Apply sampling for non-critical errors
    if (appError.severity !== 'critical' && Math.random() > this.config.sampleRate) {
      return;
    }

    // Check for duplicates
    const errorId = getErrorId(appError);
    if (!options?.skipDedupe && this.isDuplicate(errorId)) {
      return;
    }
    this.markAsReported(errorId);

    // Serialize error with context
    const serialized = serializeError(appError, {
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      userId: this.config.userId,
      projectId: this.config.projectId,
    });

    // Add additional details
    if (options?.source) {
      serialized.source = options.source;
    }
    if (options?.details) {
      serialized.details = { ...serialized.details, ...options.details };
    }

    // Send to destinations
    this.sendToDestinations(serialized);
  }

  /**
   * Report multiple errors at once
   */
  reportBatch(errors: Array<Error | AppError | string>): void {
    errors.forEach((error) => this.report(error));
  }

  /**
   * Log info level message
   */
  info(message: string, details?: Record<string, unknown>): void {
    this.report(message, { severity: 'info', details });
  }

  /**
   * Log warning level message
   */
  warn(message: string, details?: Record<string, unknown>): void {
    this.report(message, { severity: 'warning', details });
  }

  /**
   * Log error level message
   */
  error(message: string | Error, details?: Record<string, unknown>): void {
    this.report(message, { severity: 'error', details });
  }

  /**
   * Log critical level message
   */
  critical(message: string | Error, details?: Record<string, unknown>): void {
    this.report(message, { severity: 'critical', details, skipDedupe: true });
  }

  /**
   * Get stored errors from localStorage
   */
  getStoredErrors(): SerializedError[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem('recoder_errors') || '[]');
    } catch {
      return [];
    }
  }

  /**
   * Clear stored errors
   */
  clearStoredErrors(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('recoder_errors');
    }
  }

  /**
   * Flush pending errors immediately
   */
  async flush(): Promise<void> {
    if (this.errorQueue.length > 0) {
      await this.sendBatch([...this.errorQueue]);
      this.errorQueue = [];
    }
  }

  // Private methods

  private handleGlobalError = (event: ErrorEvent): void => {
    this.report(event.error || event.message, {
      source: 'window.onerror',
      details: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
    this.report(event.reason instanceof Error ? event.reason : String(event.reason), {
      source: 'unhandledrejection',
    });
  };

  private meetsMinSeverity(severity: ErrorSeverity): boolean {
    const errorLevel = SEVERITY_ORDER.indexOf(severity);
    const minLevel = SEVERITY_ORDER.indexOf(this.config.minSeverity);
    return errorLevel >= minLevel;
  }

  private isDuplicate(errorId: string): boolean {
    const lastReported = this.reportedErrors.get(errorId);
    if (!lastReported) return false;
    return Date.now() - lastReported < this.config.dedupeWindow;
  }

  private markAsReported(errorId: string): void {
    this.reportedErrors.set(errorId, Date.now());

    // Clean up old entries
    const now = Date.now();
    this.reportedErrors.forEach((timestamp, id) => {
      if (now - timestamp > this.config.dedupeWindow * 2) {
        this.reportedErrors.delete(id);
      }
    });
  }

  private sendToDestinations(error: SerializedError): void {
    const { destinations } = this.config;

    if (destinations.includes('console')) {
      this.sendToConsole(error);
    }

    if (destinations.includes('localStorage')) {
      this.sendToLocalStorage(error);
    }

    if (destinations.includes('backend')) {
      if (this.config.batchErrors) {
        this.addToQueue(error);
      } else {
        this.sendToBackend([error]);
      }
    }

    if (destinations.includes('external') && this.config.externalEndpoint) {
      this.sendToExternal(error);
    }
  }

  private sendToConsole(error: SerializedError): void {
    const logMethod =
      error.severity === 'critical' || error.severity === 'error'
        ? console.error
        : error.severity === 'warning'
          ? console.warn
          : console.info;

    logMethod(`[${error.severity.toUpperCase()}] ${error.code}: ${error.message}`, {
      timestamp: error.timestamp,
      source: error.source,
      details: error.details,
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
    });
  }

  private sendToLocalStorage(error: SerializedError): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const stored = this.getStoredErrors();
      stored.unshift(error);
      localStorage.setItem(
        'recoder_errors',
        JSON.stringify(stored.slice(0, this.config.maxStoredErrors))
      );
    } catch {
      // localStorage might be full or unavailable
    }
  }

  private addToQueue(error: SerializedError): void {
    this.errorQueue.push(error);

    if (this.errorQueue.length >= this.config.maxBatchSize) {
      this.flush();
    }
  }

  private startBatchTimer(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      this.flush();
      this.startBatchTimer();
    }, this.config.batchInterval);
  }

  private async sendBatch(errors: SerializedError[]): Promise<void> {
    if (errors.length === 0) return;
    await this.sendToBackend(errors);
  }

  private async sendToBackend(errors: SerializedError[]): Promise<void> {
    if (!this.config.backendEndpoint) return;

    try {
      await fetch(this.config.backendEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          errors,
          metadata: {
            source: 'frontend',
            version: process.env.APP_VERSION || 'unknown',
            environment: process.env.NODE_ENV,
          },
        }),
        credentials: 'include',
      });
    } catch (e) {
      // Silently fail to avoid error loops
      console.debug('[ErrorReporter] Failed to send errors to backend:', e);
    }
  }

  private sendToExternal(error: SerializedError): void {
    // Integration point for external services like Sentry
    // This would typically use their SDK
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureException(new Error(error.message), {
        tags: {
          code: error.code,
          severity: error.severity,
          category: error.category,
        },
        extra: error.details,
      });
    }
  }
}

// Singleton instance
export const errorReporter = new ErrorReporter();

// Convenience exports
export const initErrorReporter = errorReporter.init.bind(errorReporter);
export const reportError = errorReporter.report.bind(errorReporter);
export const logInfo = errorReporter.info.bind(errorReporter);
export const logWarn = errorReporter.warn.bind(errorReporter);
export const logError = errorReporter.error.bind(errorReporter);
export const logCritical = errorReporter.critical.bind(errorReporter);

/**
 * Create a scoped error reporter for a specific module
 */
export function createScopedReporter(
  scope: string
): {
  info: (message: string, details?: Record<string, unknown>) => void;
  warn: (message: string, details?: Record<string, unknown>) => void;
  error: (message: string | Error, details?: Record<string, unknown>) => void;
  critical: (message: string | Error, details?: Record<string, unknown>) => void;
} {
  return {
    info: (message, details) =>
      errorReporter.report(message, { severity: 'info', source: scope, details }),
    warn: (message, details) =>
      errorReporter.report(message, { severity: 'warning', source: scope, details }),
    error: (message, details) =>
      errorReporter.report(message, { severity: 'error', source: scope, details }),
    critical: (message, details) =>
      errorReporter.report(message, { severity: 'critical', source: scope, details }),
  };
}

export default errorReporter;
