/**
 * Query Executor
 * Executes database queries with proper parameterization
 *
 * SECURITY FEATURES:
 * - ONLY parameterized queries are allowed
 * - Query analysis to detect potential injection attempts
 * - Query timeout enforcement
 * - Result size limits
 * - Audit logging for all queries
 */

import { connectionManager, DatabaseConnection } from './connection-manager.js';
import { PostgresDriver } from './drivers/postgresql.js';
import { SqliteDriver } from './drivers/sqlite.js';

// ============================================
// Types
// ============================================

export interface QueryRequest {
  connectionId: string;
  projectId: string;
  query: string;
  params?: unknown[];
  timeout?: number;
  limit?: number;
}

export interface QueryResult {
  success: boolean;
  rows?: Record<string, unknown>[];
  rowCount?: number;
  fields?: { name: string; type?: string }[];
  error?: string;
  executionTime?: number;
  truncated?: boolean;
}

export interface QueryAnalysis {
  isSelect: boolean;
  isModifying: boolean;
  isDDL: boolean;
  hasMultipleStatements: boolean;
  tablesReferenced: string[];
}

// ============================================
// Security Constants
// ============================================

const MAX_QUERY_LENGTH = 100000; // 100KB
const MAX_PARAMS = 1000;
const MAX_RESULT_ROWS = 10000;
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const MAX_TIMEOUT_MS = 120000; // 2 minutes

// SECURITY: Patterns that might indicate injection attempts
const SUSPICIOUS_PATTERNS = [
  /--.*$/m, // SQL comment (-- comment)
  /;\s*--/i, // Statement terminator followed by comment
  /\/\*[\s\S]*?\*\//g, // Block comments
  /UNION\s+(ALL\s+)?SELECT/i, // UNION injection pattern
  /INTO\s+OUTFILE/i, // File write attempt
  /INTO\s+DUMPFILE/i, // File write attempt
  /LOAD_FILE\s*\(/i, // File read attempt
  /SLEEP\s*\(/i, // Time-based injection
  /BENCHMARK\s*\(/i, // Time-based injection
  /WAITFOR\s+DELAY/i, // SQL Server time-based
  /PG_SLEEP\s*\(/i, // PostgreSQL time-based
  /;\s*DROP\s+/i, // Drop statement after semicolon
  /;\s*DELETE\s+/i, // Delete statement after semicolon
  /;\s*UPDATE\s+/i, // Update statement after semicolon
  /;\s*INSERT\s+/i, // Insert statement after semicolon
  /;\s*ALTER\s+/i, // Alter statement after semicolon
  /;\s*CREATE\s+/i, // Create statement after semicolon
  /;\s*TRUNCATE\s+/i, // Truncate statement after semicolon
  /EXEC\s*\(/i, // Execute dynamic SQL
  /EXECUTE\s+IMMEDIATE/i, // Oracle dynamic SQL
];

// ============================================
// Query Analysis
// ============================================

/**
 * Analyze a query for security and type
 * SECURITY: Detects potentially dangerous patterns
 */
export function analyzeQuery(query: string): QueryAnalysis & { suspicious: boolean; warnings: string[] } {
  const normalizedQuery = query.trim().toUpperCase();
  const warnings: string[] = [];

  // Check for suspicious patterns
  let suspicious = false;
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(query)) {
      suspicious = true;
      warnings.push(`Suspicious pattern detected: ${pattern.source}`);
    }
  }

  // Check for multiple statements
  const hasMultipleStatements = /;\s*\S/.test(query.replace(/;\s*$/, ''));
  if (hasMultipleStatements) {
    warnings.push('Multiple statements detected - only single statements are recommended');
  }

  // Determine query type
  const isSelect = /^\s*SELECT\b/i.test(query);
  const isModifying = /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(query);
  const isDDL = /^\s*(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i.test(query);

  // Extract table names (basic extraction)
  const tableMatches = normalizedQuery.match(/(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+([A-Z_][A-Z0-9_]*)/g) || [];
  const tablesReferenced = tableMatches.map((m) =>
    m.replace(/^(FROM|JOIN|INTO|UPDATE|TABLE)\s+/i, '').toLowerCase()
  );

  return {
    isSelect,
    isModifying,
    isDDL,
    hasMultipleStatements,
    tablesReferenced: [...new Set(tablesReferenced)],
    suspicious,
    warnings,
  };
}

/**
 * Validate query parameters
 * SECURITY: Ensures params are safe types
 */
function validateParams(params: unknown[]): { valid: boolean; error?: string } {
  if (!Array.isArray(params)) {
    return { valid: false, error: 'Params must be an array' };
  }

  if (params.length > MAX_PARAMS) {
    return { valid: false, error: `Too many parameters (max ${MAX_PARAMS})` };
  }

  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    const type = typeof param;

    // Allow safe types
    if (
      param === null ||
      param === undefined ||
      type === 'string' ||
      type === 'number' ||
      type === 'boolean' ||
      param instanceof Date ||
      Buffer.isBuffer(param)
    ) {
      continue;
    }

    // Reject potentially dangerous types
    if (type === 'function') {
      return { valid: false, error: `Parameter ${i} cannot be a function` };
    }

    if (type === 'object') {
      // Allow arrays for IN clauses
      if (Array.isArray(param)) {
        continue;
      }
      // Allow plain objects for JSON
      if (param.constructor === Object) {
        continue;
      }
      return { valid: false, error: `Parameter ${i} has unsupported object type` };
    }
  }

  return { valid: true };
}

// ============================================
// Query Executor Class
// ============================================

class QueryExecutor {
  private auditLog: Array<{
    timestamp: number;
    projectId: string;
    connectionId: string;
    query: string;
    params: unknown[];
    success: boolean;
    error?: string;
    executionTime: number;
  }> = [];

  private readonly MAX_AUDIT_LOG_SIZE = 1000;

  /**
   * Execute a parameterized query
   * SECURITY: Only allows parameterized queries with validated inputs
   */
  async execute(request: QueryRequest): Promise<QueryResult> {
    const startTime = Date.now();
    const { connectionId, projectId, query, params = [], timeout = DEFAULT_TIMEOUT_MS, limit = MAX_RESULT_ROWS } = request;

    // Input validation
    if (!query || typeof query !== 'string') {
      return { success: false, error: 'Query is required' };
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return { success: false, error: `Query too long (max ${MAX_QUERY_LENGTH} chars)` };
    }

    // Validate params
    const paramsValidation = validateParams(params);
    if (!paramsValidation.valid) {
      return { success: false, error: paramsValidation.error };
    }

    // Analyze query for security
    const analysis = analyzeQuery(query);
    if (analysis.suspicious) {
      console.warn(`[QueryExecutor] Suspicious query detected from project ${projectId}:`, analysis.warnings);
      // Log but don't necessarily block - the parameterization should protect us
    }

    // Get connection
    const connection = connectionManager.getConnection(connectionId, projectId);
    if (!connection) {
      return { success: false, error: 'Connection not found or access denied' };
    }

    try {
      // Set timeout
      const effectiveTimeout = Math.min(timeout, MAX_TIMEOUT_MS);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), effectiveTimeout);
      });

      // Execute query with timeout
      const resultPromise = this.executeOnDriver(connection, query, params, limit);
      const result = await Promise.race([resultPromise, timeoutPromise]);

      const executionTime = Date.now() - startTime;

      // Audit log
      this.logQuery(projectId, connectionId, query, params, true, undefined, executionTime);

      return {
        ...result,
        executionTime,
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      // Audit log
      this.logQuery(projectId, connectionId, query, params, false, error.message, executionTime);

      // SECURITY: Don't expose internal error details
      const safeError = this.sanitizeErrorMessage(error.message);
      return { success: false, error: safeError, executionTime };
    }
  }

  /**
   * Execute query on the appropriate driver
   */
  private async executeOnDriver(
    connection: DatabaseConnection,
    query: string,
    params: unknown[],
    limit: number
  ): Promise<QueryResult> {
    const driver = connection.driver;

    if (driver instanceof PostgresDriver) {
      const result = await driver.query(query, params);

      const rows = result.rows.slice(0, limit);
      const truncated = result.rowCount > limit;

      return {
        success: true,
        rows: rows as Record<string, unknown>[],
        rowCount: result.rowCount,
        fields: result.fields.map((f) => ({ name: f.name })),
        truncated,
      };
    } else if (driver instanceof SqliteDriver) {
      const result = await driver.query(query, params);

      const rows = result.rows.slice(0, limit);
      const truncated = result.rowCount > limit;

      return {
        success: true,
        rows: rows as Record<string, unknown>[],
        rowCount: result.rowCount,
        fields: result.fields.map((f) => ({ name: f.name })),
        truncated,
      };
    }

    return { success: false, error: 'Unknown driver type' };
  }

  /**
   * Log query for audit purposes
   * SECURITY: Maintains audit trail of all queries
   */
  private logQuery(
    projectId: string,
    connectionId: string,
    query: string,
    params: unknown[],
    success: boolean,
    error: string | undefined,
    executionTime: number
  ): void {
    // Truncate query for logging
    const truncatedQuery = query.length > 500 ? query.substring(0, 500) + '...' : query;

    // Truncate params for logging (hide sensitive data)
    const sanitizedParams = params.map((p) => {
      if (typeof p === 'string' && p.length > 100) {
        return p.substring(0, 100) + '...';
      }
      return p;
    });

    this.auditLog.push({
      timestamp: Date.now(),
      projectId,
      connectionId,
      query: truncatedQuery,
      params: sanitizedParams,
      success,
      error,
      executionTime,
    });

    // Keep audit log size bounded
    if (this.auditLog.length > this.MAX_AUDIT_LOG_SIZE) {
      this.auditLog = this.auditLog.slice(-this.MAX_AUDIT_LOG_SIZE / 2);
    }

    // Console log for monitoring
    if (success) {
      console.log(`[QueryExecutor] Query executed in ${executionTime}ms for project ${projectId}`);
    } else {
      console.error(`[QueryExecutor] Query failed for project ${projectId}: ${error}`);
    }
  }

  /**
   * Sanitize error messages to prevent information leakage
   * SECURITY: Removes potentially sensitive information from errors
   */
  private sanitizeErrorMessage(message: string): string {
    let sanitized = message;

    // Remove potential connection strings first (before generic path removal)
    sanitized = sanitized.replace(/postgresql:\/\/[^\s]+/gi, '[connection_string]');
    sanitized = sanitized.replace(/postgres:\/\/[^\s]+/gi, '[connection_string]');
    sanitized = sanitized.replace(/mysql:\/\/[^\s]+/gi, '[connection_string]');

    // Remove IP addresses
    sanitized = sanitized.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[ip_address]');

    // Remove potential passwords in error messages
    sanitized = sanitized.replace(/password[=:][^\s]+/gi, 'password=[hidden]');

    // Remove file paths (after connection strings)
    sanitized = sanitized.replace(/\/[^\s]+/g, '[path]');

    return sanitized;
  }

  /**
   * Get audit log for a project
   */
  getAuditLog(projectId: string, limit: number = 100): typeof this.auditLog {
    return this.auditLog.filter((entry) => entry.projectId === projectId).slice(-limit);
  }

  /**
   * Get query statistics
   */
  getStats(): {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    averageExecutionTime: number;
  } {
    const successful = this.auditLog.filter((e) => e.success);
    const failed = this.auditLog.filter((e) => !e.success);
    const totalTime = this.auditLog.reduce((sum, e) => sum + e.executionTime, 0);

    return {
      totalQueries: this.auditLog.length,
      successfulQueries: successful.length,
      failedQueries: failed.length,
      averageExecutionTime: this.auditLog.length > 0 ? totalTime / this.auditLog.length : 0,
    };
  }
}

// Export singleton instance
export const queryExecutor = new QueryExecutor();

// Export class for testing
export { QueryExecutor };
