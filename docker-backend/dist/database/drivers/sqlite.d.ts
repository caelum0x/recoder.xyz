/**
 * SQLite Driver Wrapper
 * Provides a secure interface for SQLite database operations
 *
 * SECURITY: Uses parameterized queries ONLY via better-sqlite3
 * better-sqlite3 is synchronous and uses prepared statements with bound parameters
 */
export interface SqliteConfig {
    filename: string;
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
}
export interface TableInfo {
    name: string;
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
 * Validate and sanitize a database identifier
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
/**
 * Validate file path for SQLite database
 * SECURITY: Prevents path traversal attacks
 */
export declare function validateDatabasePath(filePath: string, basePath: string): {
    valid: boolean;
    error?: string;
    sanitized?: string;
};
export declare class SqliteDriver {
    private db;
    private config;
    private isConnected;
    constructor(config: SqliteConfig);
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
     * Execute a parameterized query (SELECT)
     * SECURITY: Uses prepared statements with bound parameters
     */
    query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{
        rows: T[];
        rowCount: number;
        fields: {
            name: string;
        }[];
    }>;
    /**
     * Execute a parameterized statement (INSERT, UPDATE, DELETE)
     * SECURITY: Uses prepared statements with bound parameters
     */
    execute(text: string, values?: unknown[]): Promise<{
        changes: number;
        lastInsertRowid: number | bigint;
    }>;
    /**
     * Get list of tables in the database
     * SECURITY: Uses sqlite_master with parameterized type filter
     */
    getTables(): Promise<TableInfo[]>;
    /**
     * Get table schema (columns) information
     * SECURITY: Uses pragma_table_info with validated table name
     */
    getTableSchema(tableName: string): Promise<ColumnInfo[]>;
    /**
     * Get indexes for a table
     * SECURITY: Uses pragma with validated table name
     */
    getIndexes(tableName: string): Promise<IndexInfo[]>;
    /**
     * Get row count for a table
     * SECURITY: Only queries validated table names
     */
    getRowCount(tableName: string): Promise<number>;
    /**
     * Get SQLite version
     */
    getVersion(): Promise<string>;
    /**
     * Check if database file exists
     */
    static fileExists(filePath: string): boolean;
}
export default SqliteDriver;
