/**
 * PostgreSQL Driver Wrapper
 * Provides a secure interface for PostgreSQL database operations
 *
 * SECURITY: Uses parameterized queries ONLY - never concatenates user input
 */
import { QueryResultRow } from 'pg';
export interface PostgresConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean | {
        rejectUnauthorized: boolean;
    };
    connectionTimeoutMillis?: number;
    idleTimeoutMillis?: number;
    max?: number;
}
export interface QueryParams {
    text: string;
    values?: unknown[];
}
export interface TableInfo {
    name: string;
    schema: string;
    type: 'table' | 'view';
    rowCount?: number;
}
export interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue: string | null;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    references?: {
        table: string;
        column: string;
    };
}
export interface IndexInfo {
    name: string;
    columns: string[];
    isUnique: boolean;
    isPrimary: boolean;
}
/**
 * Validate and sanitize a database identifier (table name, column name, etc.)
 * SECURITY: Prevents SQL injection through identifier names
 */
export declare function validateIdentifier(identifier: string): {
    valid: boolean;
    error?: string;
    sanitized?: string;
};
/**
 * Validate query length
 */
export declare function validateQuery(query: string): {
    valid: boolean;
    error?: string;
};
export declare class PostgresDriver {
    private pool;
    private config;
    private isConnected;
    constructor(config: PostgresConfig);
    /**
     * Connect to the database
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the database
     */
    disconnect(): Promise<void>;
    /**
     * Check if connected
     */
    isActive(): boolean;
    /**
     * Execute a parameterized query
     * SECURITY: ONLY accepts parameterized queries - values are NEVER concatenated
     */
    query<T extends QueryResultRow = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{
        rows: T[];
        rowCount: number;
        fields: {
            name: string;
            dataTypeID: number;
        }[];
    }>;
    /**
     * Get list of tables in the database
     * SECURITY: Uses system catalog with parameterized queries
     */
    getTables(schema?: string): Promise<TableInfo[]>;
    /**
     * Get table schema (columns) information
     * SECURITY: Uses parameterized queries against system catalogs
     */
    getTableSchema(tableName: string, schema?: string): Promise<ColumnInfo[]>;
    /**
     * Get indexes for a table
     * SECURITY: Uses parameterized queries
     */
    getIndexes(tableName: string, schema?: string): Promise<IndexInfo[]>;
    /**
     * Get estimated row count for a table
     * SECURITY: Uses parameterized query against system catalog
     */
    getEstimatedRowCount(tableName: string, schema?: string): Promise<number>;
    /**
     * Get database version info
     */
    getVersion(): Promise<string>;
    /**
     * Get list of schemas
     */
    getSchemas(): Promise<string[]>;
}
export default PostgresDriver;
