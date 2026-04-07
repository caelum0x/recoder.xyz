/**
 * Schema Inspector
 * Safely inspects database schemas without executing arbitrary queries
 *
 * SECURITY FEATURES:
 * - Only reads schema metadata from system catalogs
 * - All table/column names are validated
 * - No user-provided SQL is executed
 * - Uses parameterized queries internally
 */
export interface TableInfo {
    name: string;
    schema?: string;
    type: 'table' | 'view';
    rowCount?: number;
    columns?: ColumnInfo[];
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
export interface ForeignKeyInfo {
    name?: string;
    column: string;
    referencedTable: string;
    referencedColumn: string;
}
export interface SchemaOverview {
    database: string;
    type: 'postgresql' | 'sqlite';
    version: string;
    tables: TableInfo[];
    totalTables: number;
    totalViews: number;
}
export interface TableDetails {
    name: string;
    schema?: string;
    type: 'table' | 'view';
    columns: ColumnInfo[];
    indexes: IndexInfo[];
    foreignKeys: ForeignKeyInfo[];
    rowCount: number;
    primaryKey?: string[];
}
declare class SchemaInspector {
    /**
     * Get schema overview for a connection
     * SECURITY: Only reads metadata, no user queries executed
     */
    getSchemaOverview(connectionId: string, projectId: string, schema?: string): Promise<{
        success: boolean;
        data?: SchemaOverview;
        error?: string;
    }>;
    /**
     * Get detailed information about a table
     * SECURITY: Table name is validated before use
     */
    getTableDetails(connectionId: string, projectId: string, tableName: string, schema?: string): Promise<{
        success: boolean;
        data?: TableDetails;
        error?: string;
    }>;
    /**
     * List available schemas (PostgreSQL only)
     */
    listSchemas(connectionId: string, projectId: string): Promise<{
        success: boolean;
        schemas?: string[];
        error?: string;
    }>;
    /**
     * Preview table data (limited rows)
     * SECURITY: Uses parameterized query with validated table name and hard limits
     */
    previewTable(connectionId: string, projectId: string, tableName: string, schema?: string, limit?: number): Promise<{
        success: boolean;
        rows?: Record<string, unknown>[];
        columns?: string[];
        error?: string;
    }>;
    private getPostgresOverview;
    private getPostgresTableDetails;
    private getSqliteOverview;
    private getSqliteTableDetails;
}
export declare const schemaInspector: SchemaInspector;
export { SchemaInspector };
