/**
 * Database error handling utilities
 * Provides structured database error handling with user-friendly messages
 */

import { log } from './logger';

/**
 * Database error types for classification
 */
export enum DatabaseErrorType {
  CONNECTION_TERMINATED = 'CONNECTION_TERMINATED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  QUERY_FAILED = 'QUERY_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
  NOT_FOUND = 'NOT_FOUND',
  DUPLICATE_KEY = 'DUPLICATE_KEY',
  UNKNOWN = 'UNKNOWN',
}

/**
 * User-friendly error messages
 */
export const DB_ERROR_MESSAGES: Record<DatabaseErrorType, string> = {
  [DatabaseErrorType.CONNECTION_TERMINATED]:
    'Database connection was unexpectedly terminated. Please try again later.',
  [DatabaseErrorType.CONNECTION_TIMEOUT]:
    'Database connection timed out. Please check your network connection and try again.',
  [DatabaseErrorType.CONNECTION_REFUSED]:
    'Unable to connect to the database. Please try again later.',
  [DatabaseErrorType.QUERY_FAILED]: 'Database query failed. Please try again later.',
  [DatabaseErrorType.PERMISSION_DENIED]:
    'Insufficient database access permissions. Please contact your administrator.',
  [DatabaseErrorType.CONSTRAINT_VIOLATION]:
    'The operation violates database constraints. Please check your data.',
  [DatabaseErrorType.NOT_FOUND]: 'The requested record was not found.',
  [DatabaseErrorType.DUPLICATE_KEY]:
    'A record with this identifier already exists.',
  [DatabaseErrorType.UNKNOWN]:
    'Database service is temporarily unavailable. Please try again later.',
};

/**
 * Enhanced database error with user-friendly message
 */
export class DatabaseError extends Error {
  public readonly type: DatabaseErrorType;
  public readonly userMessage: string;
  public readonly originalError: Error;
  public readonly isRetryable: boolean;
  public readonly sqlState?: string;
  public readonly detail?: string;

  constructor(
    type: DatabaseErrorType,
    originalError: Error,
    options?: {
      userMessage?: string;
      sqlState?: string;
      detail?: string;
    }
  ) {
    super(originalError.message);
    this.name = 'DatabaseError';
    this.type = type;
    this.userMessage = options?.userMessage || DB_ERROR_MESSAGES[type];
    this.originalError = originalError;
    this.isRetryable = this.determineRetryability(type);
    this.sqlState = options?.sqlState;
    this.detail = options?.detail;

    // Maintain stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DatabaseError);
    }
  }

  private determineRetryability(type: DatabaseErrorType): boolean {
    switch (type) {
      case DatabaseErrorType.CONNECTION_TERMINATED:
      case DatabaseErrorType.CONNECTION_TIMEOUT:
      case DatabaseErrorType.CONNECTION_REFUSED:
        return true;
      case DatabaseErrorType.PERMISSION_DENIED:
      case DatabaseErrorType.CONSTRAINT_VIOLATION:
      case DatabaseErrorType.DUPLICATE_KEY:
        return false;
      case DatabaseErrorType.QUERY_FAILED:
      case DatabaseErrorType.NOT_FOUND:
      case DatabaseErrorType.UNKNOWN:
      default:
        return true;
    }
  }

  /**
   * Create a JSON-serializable representation
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      userMessage: this.userMessage,
      isRetryable: this.isRetryable,
      sqlState: this.sqlState,
      detail: this.detail,
    };
  }
}

/**
 * PostgreSQL error codes (common ones)
 */
const PG_ERROR_CODES: Record<string, DatabaseErrorType> = {
  // Connection errors
  '08000': DatabaseErrorType.CONNECTION_REFUSED, // connection_exception
  '08003': DatabaseErrorType.CONNECTION_TERMINATED, // connection_does_not_exist
  '08006': DatabaseErrorType.CONNECTION_TERMINATED, // connection_failure
  '08001': DatabaseErrorType.CONNECTION_REFUSED, // sqlclient_unable_to_establish_sqlconnection
  '08004': DatabaseErrorType.CONNECTION_REFUSED, // sqlserver_rejected_establishment_of_sqlconnection
  // Integrity constraint violation
  '23000': DatabaseErrorType.CONSTRAINT_VIOLATION, // integrity_constraint_violation
  '23001': DatabaseErrorType.CONSTRAINT_VIOLATION, // restrict_violation
  '23502': DatabaseErrorType.CONSTRAINT_VIOLATION, // not_null_violation
  '23503': DatabaseErrorType.CONSTRAINT_VIOLATION, // foreign_key_violation
  '23505': DatabaseErrorType.DUPLICATE_KEY, // unique_violation
  '23514': DatabaseErrorType.CONSTRAINT_VIOLATION, // check_violation
  // Permission errors
  '42501': DatabaseErrorType.PERMISSION_DENIED, // insufficient_privilege
  '28000': DatabaseErrorType.PERMISSION_DENIED, // invalid_authorization_specification
  '28P01': DatabaseErrorType.PERMISSION_DENIED, // invalid_password
  // Syntax and query errors
  '42000': DatabaseErrorType.QUERY_FAILED, // syntax_error_or_access_rule_violation
  '42601': DatabaseErrorType.QUERY_FAILED, // syntax_error
  '42703': DatabaseErrorType.QUERY_FAILED, // undefined_column
  '42P01': DatabaseErrorType.NOT_FOUND, // undefined_table
};

/**
 * Classify database error based on error message and properties
 */
export function classifyDatabaseError(error: Error): DatabaseErrorType {
  const message = error.message.toLowerCase();

  // Check for PostgreSQL error code
  const pgError = error as Error & { code?: string; sqlState?: string };
  const errorCode = pgError.code || pgError.sqlState;

  if (errorCode && PG_ERROR_CODES[errorCode]) {
    return PG_ERROR_CODES[errorCode];
  }

  // Connection terminated patterns
  if (
    message.includes('connection terminated') ||
    message.includes('connection closed') ||
    message.includes('connection lost') ||
    message.includes('client has encountered a connection error')
  ) {
    return DatabaseErrorType.CONNECTION_TERMINATED;
  }

  // Connection timeout patterns
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('connection timeout') ||
    message.includes('query timeout')
  ) {
    return DatabaseErrorType.CONNECTION_TIMEOUT;
  }

  // Connection refused patterns
  if (
    message.includes('connection refused') ||
    message.includes('could not connect') ||
    message.includes('connection failed') ||
    message.includes('econnrefused')
  ) {
    return DatabaseErrorType.CONNECTION_REFUSED;
  }

  // Permission denied patterns
  if (
    message.includes('permission denied') ||
    message.includes('access denied') ||
    message.includes('authentication failed') ||
    message.includes('insufficient privilege')
  ) {
    return DatabaseErrorType.PERMISSION_DENIED;
  }

  // Constraint violation patterns
  if (
    message.includes('constraint') ||
    message.includes('violates') ||
    message.includes('foreign key')
  ) {
    return DatabaseErrorType.CONSTRAINT_VIOLATION;
  }

  // Duplicate key patterns
  if (
    message.includes('duplicate key') ||
    message.includes('unique constraint') ||
    message.includes('already exists')
  ) {
    return DatabaseErrorType.DUPLICATE_KEY;
  }

  // Not found patterns
  if (
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('no rows')
  ) {
    return DatabaseErrorType.NOT_FOUND;
  }

  // Query failed patterns
  if (
    message.includes('syntax error') ||
    message.includes('invalid query') ||
    message.includes('undefined column') ||
    message.includes('undefined table')
  ) {
    return DatabaseErrorType.QUERY_FAILED;
  }

  return DatabaseErrorType.UNKNOWN;
}

/**
 * Transform database error into user-friendly DatabaseError
 */
export function transformDatabaseError(error: Error): DatabaseError {
  const type = classifyDatabaseError(error);
  const pgError = error as Error & { code?: string; detail?: string };

  return new DatabaseError(type, error, {
    sqlState: pgError.code,
    detail: pgError.detail,
  });
}

/**
 * Check if an error is database-related
 */
export function isDatabaseError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const errorObj = error as Error & { code?: string };

  // Check for PostgreSQL error code format (5 characters)
  if (errorObj.code && /^[0-9A-Z]{5}$/.test(errorObj.code)) {
    return true;
  }

  // Common database error indicators
  const dbErrorPatterns = [
    'connection',
    'database',
    'query',
    'sql',
    'postgres',
    'pg',
    'drizzle',
    'prisma',
    'sequelize',
    'knex',
    'typeorm',
    'constraint',
    'foreign key',
    'unique',
    'transaction',
  ];

  return dbErrorPatterns.some((pattern) => message.includes(pattern));
}

/**
 * Wrapper function for database operations with automatic error handling
 */
export async function withDatabaseErrorHandling<T>(
  operation: () => Promise<T>,
  context?: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error && isDatabaseError(error)) {
      const dbError = transformDatabaseError(error);

      // Log the original error for debugging
      log.db('error', `Database error in ${context || 'unknown context'}`, {
        type: dbError.type,
        originalMessage: error.message,
        userMessage: dbError.userMessage,
        isRetryable: dbError.isRetryable,
        sqlState: dbError.sqlState,
        detail: dbError.detail,
      });

      throw dbError;
    }

    // Re-throw non-database errors as-is
    throw error;
  }
}

/**
 * Retry wrapper for database operations with exponential backoff
 */
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  options?: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    context?: string;
    onRetry?: (attempt: number, error: Error, delay: number) => void;
  }
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    context,
    onRetry,
  } = options || {};

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withDatabaseErrorHandling(operation, context);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      const isRetryable =
        error instanceof DatabaseError ? error.isRetryable : true;

      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }

      // Notify about retry
      onRetry?.(attempt + 1, lastError, delay);

      log.db('warn', `Retrying database operation (attempt ${attempt + 1})`, {
        context,
        delay,
        error: lastError.message,
      });

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, maxDelay);
    }
  }

  throw lastError || new Error('Database operation failed');
}

/**
 * Create a simple query timeout wrapper
 */
export function withQueryTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number = 30000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new DatabaseError(DatabaseErrorType.CONNECTION_TIMEOUT, new Error('Query timeout'), {
          userMessage: `Database query timed out after ${timeoutMs}ms`,
        })
      );
    }, timeoutMs);

    operation()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Check if a database error should trigger a reconnection
 */
export function shouldReconnect(error: Error): boolean {
  if (error instanceof DatabaseError) {
    return (
      error.type === DatabaseErrorType.CONNECTION_TERMINATED ||
      error.type === DatabaseErrorType.CONNECTION_REFUSED ||
      error.type === DatabaseErrorType.CONNECTION_TIMEOUT
    );
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('connection') &&
    (message.includes('terminated') ||
      message.includes('closed') ||
      message.includes('lost') ||
      message.includes('refused'))
  );
}
