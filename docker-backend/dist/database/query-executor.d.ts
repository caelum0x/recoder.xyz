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
    fields?: {
        name: string;
        type?: string;
    }[];
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
/**
 * Analyze a query for security and type
 * SECURITY: Detects potentially dangerous patterns
 */
export declare function analyzeQuery(query: string): QueryAnalysis & {
    suspicious: boolean;
    warnings: string[];
};
declare class QueryExecutor {
    private auditLog;
    private readonly MAX_AUDIT_LOG_SIZE;
    /**
     * Execute a parameterized query
     * SECURITY: Only allows parameterized queries with validated inputs
     */
    execute(request: QueryRequest): Promise<QueryResult>;
    /**
     * Execute query on the appropriate driver
     */
    private executeOnDriver;
    /**
     * Log query for audit purposes
     * SECURITY: Maintains audit trail of all queries
     */
    private logQuery;
    /**
     * Sanitize error messages to prevent information leakage
     * SECURITY: Removes potentially sensitive information from errors
     */
    private sanitizeErrorMessage;
    /**
     * Get audit log for a project
     */
    getAuditLog(projectId: string, limit?: number): typeof this.auditLog;
    /**
     * Get query statistics
     */
    getStats(): {
        totalQueries: number;
        successfulQueries: number;
        failedQueries: number;
        averageExecutionTime: number;
    };
}
export declare const queryExecutor: QueryExecutor;
export { QueryExecutor };
