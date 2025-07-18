/**
 * Error types and handling utilities
 */

export enum ErrorCode {
  // Authentication errors
  AUTHENTICATION_REQUIRED = 'AUTH_001',
  INVALID_TOKEN = 'AUTH_002',
  TOKEN_EXPIRED = 'AUTH_003',
  INSUFFICIENT_PERMISSIONS = 'AUTH_004',
  INVALID_CREDENTIALS = 'AUTH_005',

  // API errors
  API_CONNECTION_FAILED = 'API_001',
  API_TIMEOUT = 'API_002',
  API_RATE_LIMIT = 'API_003',
  API_SERVER_ERROR = 'API_004',
  API_INVALID_RESPONSE = 'API_005',

  // Validation errors
  VALIDATION_FAILED = 'VAL_001',
  INVALID_INPUT = 'VAL_002',
  MISSING_REQUIRED_FIELD = 'VAL_003',
  INVALID_FORMAT = 'VAL_004',
  VALUE_OUT_OF_RANGE = 'VAL_005',

  // File system errors
  FILE_NOT_FOUND = 'FS_001',
  FILE_ACCESS_DENIED = 'FS_002',
  FILE_ALREADY_EXISTS = 'FS_003',
  DIRECTORY_NOT_FOUND = 'FS_004',
  INVALID_PATH = 'FS_005',
  DISK_FULL = 'FS_006',

  // Project errors
  PROJECT_NOT_FOUND = 'PROJ_001',
  PROJECT_ALREADY_EXISTS = 'PROJ_002',
  INVALID_PROJECT_STRUCTURE = 'PROJ_003',
  UNSUPPORTED_FRAMEWORK = 'PROJ_004',
  DEPENDENCY_CONFLICT = 'PROJ_005',
  BUILD_FAILED = 'PROJ_006',

  // Template errors
  TEMPLATE_NOT_FOUND = 'TMPL_001',
  TEMPLATE_INVALID = 'TMPL_002',
  TEMPLATE_VERSION_MISMATCH = 'TMPL_003',
  TEMPLATE_RENDER_FAILED = 'TMPL_004',

  // Generation errors
  GENERATION_FAILED = 'GEN_001',
  INVALID_TEMPLATE_VARIABLES = 'GEN_002',
  OUTPUT_PATH_INVALID = 'GEN_003',
  CODE_QUALITY_CHECK_FAILED = 'GEN_004',

  // Configuration errors
  CONFIG_INVALID = 'CFG_001',
  CONFIG_MISSING = 'CFG_002',
  CONFIG_MIGRATION_FAILED = 'CFG_003',

  // Network errors
  NETWORK_ERROR = 'NET_001',
  CONNECTION_TIMEOUT = 'NET_002',
  DNS_RESOLUTION_FAILED = 'NET_003',

  // System errors
  SYSTEM_ERROR = 'SYS_001',
  MEMORY_LIMIT_EXCEEDED = 'SYS_002',
  PROCESS_TERMINATED = 'SYS_003',
  
  // Unknown/generic errors
  UNKNOWN_ERROR = 'UNK_001',
  OPERATION_CANCELLED = 'UNK_002',
  FEATURE_NOT_IMPLEMENTED = 'UNK_003',
}

export interface ErrorContext {
  operation?: string;
  resource?: string;
  details?: Record<string, any>;
  stack?: string;
  timestamp?: Date;
  userId?: string;
  sessionId?: string;
}

export class RecoderError extends Error {
  public readonly code: ErrorCode;
  public readonly context: ErrorContext;
  public readonly recoverable: boolean;
  public readonly userMessage: string;
  public readonly originalError?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    context: ErrorContext = {},
    recoverable: boolean = false,
    userMessage?: string,
    originalError?: Error
  ) {
    super(message);
    this.name = 'RecoderError';
    this.code = code;
    this.context = {
      ...context,
      timestamp: new Date(),
    };
    this.recoverable = recoverable;
    this.userMessage = userMessage || this.getDefaultUserMessage(code);
    this.originalError = originalError;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RecoderError);
    }
  }

  private getDefaultUserMessage(code: ErrorCode): string {
    const messages: Record<ErrorCode, string> = {
      [ErrorCode.AUTHENTICATION_REQUIRED]: 'Please log in to continue',
      [ErrorCode.INVALID_TOKEN]: 'Your session has expired. Please log in again',
      [ErrorCode.TOKEN_EXPIRED]: 'Your session has expired. Please log in again',
      [ErrorCode.INSUFFICIENT_PERMISSIONS]: 'You do not have permission to perform this action',
      [ErrorCode.INVALID_CREDENTIALS]: 'Invalid username or password',

      [ErrorCode.API_CONNECTION_FAILED]: 'Unable to connect to the service. Please check your internet connection',
      [ErrorCode.API_TIMEOUT]: 'The request took too long to complete. Please try again',
      [ErrorCode.API_RATE_LIMIT]: 'Too many requests. Please wait a moment and try again',
      [ErrorCode.API_SERVER_ERROR]: 'Service temporarily unavailable. Please try again later',
      [ErrorCode.API_INVALID_RESPONSE]: 'Received invalid response from server',

      [ErrorCode.VALIDATION_FAILED]: 'Please check your input and try again',
      [ErrorCode.INVALID_INPUT]: 'The provided input is invalid',
      [ErrorCode.MISSING_REQUIRED_FIELD]: 'Please fill in all required fields',
      [ErrorCode.INVALID_FORMAT]: 'The format of the input is incorrect',
      [ErrorCode.VALUE_OUT_OF_RANGE]: 'The value is outside the allowed range',

      [ErrorCode.FILE_NOT_FOUND]: 'The requested file could not be found',
      [ErrorCode.FILE_ACCESS_DENIED]: 'Access to the file was denied',
      [ErrorCode.FILE_ALREADY_EXISTS]: 'A file with this name already exists',
      [ErrorCode.DIRECTORY_NOT_FOUND]: 'The specified directory does not exist',
      [ErrorCode.INVALID_PATH]: 'The file path is invalid',
      [ErrorCode.DISK_FULL]: 'Not enough disk space available',

      [ErrorCode.PROJECT_NOT_FOUND]: 'The project could not be found',
      [ErrorCode.PROJECT_ALREADY_EXISTS]: 'A project with this name already exists',
      [ErrorCode.INVALID_PROJECT_STRUCTURE]: 'The project structure is invalid',
      [ErrorCode.UNSUPPORTED_FRAMEWORK]: 'This framework is not supported',
      [ErrorCode.DEPENDENCY_CONFLICT]: 'There are conflicting dependencies',
      [ErrorCode.BUILD_FAILED]: 'The build process failed',

      [ErrorCode.TEMPLATE_NOT_FOUND]: 'The requested template could not be found',
      [ErrorCode.TEMPLATE_INVALID]: 'The template is invalid or corrupted',
      [ErrorCode.TEMPLATE_VERSION_MISMATCH]: 'The template version is incompatible',
      [ErrorCode.TEMPLATE_RENDER_FAILED]: 'Failed to render the template',

      [ErrorCode.GENERATION_FAILED]: 'Code generation failed',
      [ErrorCode.INVALID_TEMPLATE_VARIABLES]: 'Invalid template variables provided',
      [ErrorCode.OUTPUT_PATH_INVALID]: 'The output path is invalid',
      [ErrorCode.CODE_QUALITY_CHECK_FAILED]: 'Generated code failed quality checks',

      [ErrorCode.CONFIG_INVALID]: 'Configuration is invalid',
      [ErrorCode.CONFIG_MISSING]: 'Configuration file is missing',
      [ErrorCode.CONFIG_MIGRATION_FAILED]: 'Configuration migration failed',

      [ErrorCode.NETWORK_ERROR]: 'Network error occurred',
      [ErrorCode.CONNECTION_TIMEOUT]: 'Connection timed out',
      [ErrorCode.DNS_RESOLUTION_FAILED]: 'Unable to resolve the server address',

      [ErrorCode.SYSTEM_ERROR]: 'A system error occurred',
      [ErrorCode.MEMORY_LIMIT_EXCEEDED]: 'Memory limit exceeded',
      [ErrorCode.PROCESS_TERMINATED]: 'The process was terminated',

      [ErrorCode.UNKNOWN_ERROR]: 'An unknown error occurred',
      [ErrorCode.OPERATION_CANCELLED]: 'The operation was cancelled',
      [ErrorCode.FEATURE_NOT_IMPLEMENTED]: 'This feature is not yet implemented',
    };

    return messages[code] || 'An error occurred';
  }

  public toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      recoverable: this.recoverable,
      userMessage: this.userMessage,
      stack: this.stack,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack,
      } : undefined,
    };
  }

  public toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}

/**
 * Specialized error classes
 */
export class AuthenticationError extends RecoderError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(ErrorCode.AUTHENTICATION_REQUIRED, message, context, false, undefined, originalError);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends RecoderError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(ErrorCode.VALIDATION_FAILED, message, context, true, undefined, originalError);
    this.name = 'ValidationError';
  }
}

export class FileSystemError extends RecoderError {
  constructor(code: ErrorCode, message: string, context: ErrorContext = {}, originalError?: Error) {
    super(code, message, context, true, undefined, originalError);
    this.name = 'FileSystemError';
  }
}

export class ProjectError extends RecoderError {
  constructor(code: ErrorCode, message: string, context: ErrorContext = {}, originalError?: Error) {
    super(code, message, context, true, undefined, originalError);
    this.name = 'ProjectError';
  }
}

export class APIError extends RecoderError {
  constructor(code: ErrorCode, message: string, context: ErrorContext = {}, originalError?: Error) {
    super(code, message, context, true, undefined, originalError);
    this.name = 'APIError';
  }
}

export class TemplateError extends RecoderError {
  constructor(code: ErrorCode, message: string, context: ErrorContext = {}, originalError?: Error) {
    super(code, message, context, true, undefined, originalError);
    this.name = 'TemplateError';
  }
}

export class GenerationError extends RecoderError {
  constructor(code: ErrorCode, message: string, context: ErrorContext = {}, originalError?: Error) {
    super(code, message, context, false, undefined, originalError);
    this.name = 'GenerationError';
  }
}

/**
 * Error handling utilities
 */
export class ErrorHandler {
  private static listeners: Array<(error: RecoderError) => void> = [];

  /**
   * Handle an error with proper logging and user feedback
   */
  static handle(error: Error | RecoderError, context: ErrorContext = {}): RecoderError {
    let recoderError: RecoderError;

    if (error instanceof RecoderError) {
      recoderError = error;
    } else {
      recoderError = new RecoderError(
        ErrorCode.UNKNOWN_ERROR,
        error.message,
        { ...context, stack: error.stack },
        false,
        undefined,
        error
      );
    }

    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener(recoderError);
      } catch (listenerError) {
        console.error('Error in error handler listener:', listenerError);
      }
    });

    return recoderError;
  }

  /**
   * Create error from HTTP response
   */
  static fromHTTPResponse(response: any, context: ErrorContext = {}): RecoderError {
    const status = response.status || response.statusCode || 500;
    const message = response.data?.message || response.message || 'HTTP request failed';

    let code: ErrorCode;
    let recoverable = true;

    switch (status) {
      case 400:
        code = ErrorCode.INVALID_INPUT;
        break;
      case 401:
        code = ErrorCode.INVALID_TOKEN;
        recoverable = false;
        break;
      case 403:
        code = ErrorCode.INSUFFICIENT_PERMISSIONS;
        recoverable = false;
        break;
      case 404:
        code = ErrorCode.FILE_NOT_FOUND;
        break;
      case 408:
        code = ErrorCode.API_TIMEOUT;
        break;
      case 409:
        code = ErrorCode.FILE_ALREADY_EXISTS;
        break;
      case 429:
        code = ErrorCode.API_RATE_LIMIT;
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        code = ErrorCode.API_SERVER_ERROR;
        break;
      default:
        code = ErrorCode.API_CONNECTION_FAILED;
    }

    return new APIError(code, message, { ...context, httpStatus: status });
  }

  /**
   * Create error from file system operation
   */
  static fromFileSystemError(error: any, operation: string, path: string): FileSystemError {
    let code: ErrorCode;
    const message = error.message || 'File system operation failed';

    switch (error.code) {
      case 'ENOENT':
        code = ErrorCode.FILE_NOT_FOUND;
        break;
      case 'EACCES':
      case 'EPERM':
        code = ErrorCode.FILE_ACCESS_DENIED;
        break;
      case 'EEXIST':
        code = ErrorCode.FILE_ALREADY_EXISTS;
        break;
      case 'ENOTDIR':
        code = ErrorCode.DIRECTORY_NOT_FOUND;
        break;
      case 'EINVAL':
        code = ErrorCode.INVALID_PATH;
        break;
      case 'ENOSPC':
        code = ErrorCode.DISK_FULL;
        break;
      default:
        code = ErrorCode.SYSTEM_ERROR;
    }

    return new FileSystemError(code, message, { operation, path }, error);
  }

  /**
   * Add error listener
   */
  static addListener(listener: (error: RecoderError) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove error listener
   */
  static removeListener(listener: (error: RecoderError) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Clear all error listeners
   */
  static clearListeners(): void {
    this.listeners = [];
  }

  /**
   * Check if error is recoverable
   */
  static isRecoverable(error: Error | RecoderError): boolean {
    if (error instanceof RecoderError) {
      return error.recoverable;
    }
    return true; // Assume recoverable for unknown errors
  }

  /**
   * Get user-friendly error message
   */
  static getUserMessage(error: Error | RecoderError): string {
    if (error instanceof RecoderError) {
      return error.userMessage;
    }
    return 'An unexpected error occurred. Please try again.';
  }

  /**
   * Format error for logging
   */
  static formatForLogging(error: Error | RecoderError): string {
    if (error instanceof RecoderError) {
      return JSON.stringify(error.toJSON(), null, 2);
    }
    return `${error.name}: ${error.message}\n${error.stack}`;
  }

  /**
   * Check if error should be reported to telemetry
   */
  static shouldReport(error: Error | RecoderError): boolean {
    if (error instanceof RecoderError) {
      // Don't report user errors or authentication errors
      return ![
        ErrorCode.AUTHENTICATION_REQUIRED,
        ErrorCode.INVALID_CREDENTIALS,
        ErrorCode.VALIDATION_FAILED,
        ErrorCode.INVALID_INPUT,
        ErrorCode.MISSING_REQUIRED_FIELD,
        ErrorCode.OPERATION_CANCELLED,
      ].includes(error.code);
    }
    return true; // Report unknown errors
  }
}

/**
 * Async error handling utilities
 */
export class AsyncErrorHandler {
  /**
   * Wrap async function with error handling
   */
  static wrap<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    context: ErrorContext = {}
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      try {
        return await fn(...args);
      } catch (error) {
        throw ErrorHandler.handle(error as Error, context);
      }
    };
  }

  /**
   * Execute with retry logic
   */
  static async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
    backoff: number = 2
  ): Promise<T> {
    let lastError: Error;
    let currentDelay = delay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry non-recoverable errors
        if (!ErrorHandler.isRecoverable(lastError)) {
          throw ErrorHandler.handle(lastError);
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        currentDelay *= backoff;
      }
    }

    throw ErrorHandler.handle(lastError!, { attempts: maxRetries + 1 });
  }

  /**
   * Execute with timeout
   */
  static async withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string = 'Operation timed out'
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new RecoderError(ErrorCode.API_TIMEOUT, timeoutMessage));
      }, timeoutMs);

      fn()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(ErrorHandler.handle(error as Error));
        });
    });
  }
}

/**
 * Validation error helpers
 */
export class ValidationErrorBuilder {
  private errors: Array<{ field: string; message: string; code?: string }> = [];

  add(field: string, message: string, code?: string): this {
    this.errors.push({ field, message, code });
    return this;
  }

  addIf(condition: boolean, field: string, message: string, code?: string): this {
    if (condition) {
      this.add(field, message, code);
    }
    return this;
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  getErrors(): Array<{ field: string; message: string; code?: string }> {
    return [...this.errors];
  }

  throw(): never {
    if (this.hasErrors()) {
      const message = this.errors.map(e => `${e.field}: ${e.message}`).join(', ');
      throw new ValidationError(message, { validationErrors: this.errors });
    }
    throw new Error('No validation errors to throw');
  }

  throwIf(): void {
    if (this.hasErrors()) {
      this.throw();
    }
  }
}

/**
 * Global error handler setup
 */
export function setupGlobalErrorHandling(): void {
  // Handle unhandled promise rejections
  if (typeof process !== 'undefined' && process.on) {
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      console.error('Unhandled Promise Rejection:', reason);
      
      const error = reason instanceof Error ? reason : new Error(String(reason));
      const recoderError = ErrorHandler.handle(error, { 
        context: 'unhandledRejection',
        promise: promise.toString()
      });
      
      // Could report to telemetry here
      console.error('Handled as:', recoderError.toString());
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      console.error('Uncaught Exception:', error);
      
      const recoderError = ErrorHandler.handle(error, { 
        context: 'uncaughtException'
      });
      
      // Could report to telemetry here
      console.error('Handled as:', recoderError.toString());
      
      // Exit process in case of uncaught exception
      process.exit(1);
    });
  }
}