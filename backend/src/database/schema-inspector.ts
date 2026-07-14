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

import { connectionManager, DatabaseConnection } from './connection-manager.js';
import { PostgresDriver, validateIdentifier as pgValidateIdentifier } from './drivers/postgresql.js';
import { SqliteDriver, validateIdentifier as sqliteValidateIdentifier } from './drivers/sqlite.js';

// ============================================
// Types
// ============================================

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

// ============================================
// Schema Inspector Class
// ============================================

class SchemaInspector {
  /**
   * Get schema overview for a connection
   * SECURITY: Only reads metadata, no user queries executed
   */
  async getSchemaOverview(
    connectionId: string,
    projectId: string,
    schema?: string
  ): Promise<{ success: boolean; data?: SchemaOverview; error?: string }> {
    const connection = connectionManager.getConnection(connectionId, projectId);
    if (!connection) {
      return { success: false, error: 'Connection not found or access denied' };
    }

    try {
      if (connection.driver instanceof PostgresDriver) {
        return await this.getPostgresOverview(connection.driver, schema);
      } else if (connection.driver instanceof SqliteDriver) {
        return await this.getSqliteOverview(connection.driver);
      }

      return { success: false, error: 'Unknown database type' };
    } catch (error: any) {
      console.error('[SchemaInspector] Error getting overview:', error);
      return { success: false, error: `Failed to get schema: ${error.message}` };
    }
  }

  /**
   * Get detailed information about a table
   * SECURITY: Table name is validated before use
   */
  async getTableDetails(
    connectionId: string,
    projectId: string,
    tableName: string,
    schema?: string
  ): Promise<{ success: boolean; data?: TableDetails; error?: string }> {
    const connection = connectionManager.getConnection(connectionId, projectId);
    if (!connection) {
      return { success: false, error: 'Connection not found or access denied' };
    }

    try {
      if (connection.driver instanceof PostgresDriver) {
        return await this.getPostgresTableDetails(connection.driver, tableName, schema);
      } else if (connection.driver instanceof SqliteDriver) {
        return await this.getSqliteTableDetails(connection.driver, tableName);
      }

      return { success: false, error: 'Unknown database type' };
    } catch (error: any) {
      console.error('[SchemaInspector] Error getting table details:', error);
      return { success: false, error: `Failed to get table details: ${error.message}` };
    }
  }

  /**
   * List available schemas (PostgreSQL only)
   */
  async listSchemas(
    connectionId: string,
    projectId: string
  ): Promise<{ success: boolean; schemas?: string[]; error?: string }> {
    const connection = connectionManager.getConnection(connectionId, projectId);
    if (!connection) {
      return { success: false, error: 'Connection not found or access denied' };
    }

    try {
      if (connection.driver instanceof PostgresDriver) {
        const schemas = await connection.driver.getSchemas();
        return { success: true, schemas };
      } else if (connection.driver instanceof SqliteDriver) {
        // SQLite doesn't have schemas, return default
        return { success: true, schemas: ['main'] };
      }

      return { success: false, error: 'Unknown database type' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Preview table data (limited rows)
   * SECURITY: Uses parameterized query with validated table name and hard limits
   */
  async previewTable(
    connectionId: string,
    projectId: string,
    tableName: string,
    schema?: string,
    limit: number = 100
  ): Promise<{ success: boolean; rows?: Record<string, unknown>[]; columns?: string[]; error?: string }> {
    const connection = connectionManager.getConnection(connectionId, projectId);
    if (!connection) {
      return { success: false, error: 'Connection not found or access denied' };
    }

    // SECURITY: Hard limit on preview rows
    const safeLimit = Math.min(Math.max(1, limit), 1000);

    try {
      if (connection.driver instanceof PostgresDriver) {
        // Validate identifiers
        const tableValidation = pgValidateIdentifier(tableName);
        const schemaValidation = schema ? pgValidateIdentifier(schema) : { valid: true, sanitized: 'public' };

        if (!tableValidation.valid || !schemaValidation.valid) {
          return { success: false, error: 'Invalid table or schema name' };
        }

        // SECURITY: Use parameterized limit, but table name must be quoted
        // Since we've validated the identifier strictly, this is safe
        const result = await connection.driver.query(
          `SELECT * FROM "${schemaValidation.sanitized}"."${tableValidation.sanitized}" LIMIT $1`,
          [safeLimit]
        );

        return {
          success: true,
          rows: result.rows as Record<string, unknown>[],
          columns: result.fields.map((f) => f.name),
        };
      } else if (connection.driver instanceof SqliteDriver) {
        // Validate table name
        const tableValidation = sqliteValidateIdentifier(tableName);
        if (!tableValidation.valid) {
          return { success: false, error: 'Invalid table name' };
        }

        // SECURITY: Table name is validated, use parameterized limit
        const result = await connection.driver.query(
          `SELECT * FROM "${tableValidation.sanitized}" LIMIT ?`,
          [safeLimit]
        );

        return {
          success: true,
          rows: result.rows as Record<string, unknown>[],
          columns: result.fields.map((f) => f.name),
        };
      }

      return { success: false, error: 'Unknown database type' };
    } catch (error: any) {
      return { success: false, error: `Preview failed: ${error.message}` };
    }
  }

  // ============================================
  // PostgreSQL Specific Methods
  // ============================================

  private async getPostgresOverview(
    driver: PostgresDriver,
    schema: string = 'public'
  ): Promise<{ success: boolean; data?: SchemaOverview; error?: string }> {
    // Validate schema name
    const schemaValidation = pgValidateIdentifier(schema);
    if (!schemaValidation.valid) {
      return { success: false, error: `Invalid schema name: ${schemaValidation.error}` };
    }

    const tables = await driver.getTables(schemaValidation.sanitized);
    const version = await driver.getVersion();

    // Get row counts for tables
    for (const table of tables) {
      if (table.type === 'table') {
        table.rowCount = await driver.getEstimatedRowCount(table.name, table.schema);
      }
    }

    return {
      success: true,
      data: {
        database: 'PostgreSQL',
        type: 'postgresql',
        version,
        tables,
        totalTables: tables.filter((t) => t.type === 'table').length,
        totalViews: tables.filter((t) => t.type === 'view').length,
      },
    };
  }

  private async getPostgresTableDetails(
    driver: PostgresDriver,
    tableName: string,
    schema: string = 'public'
  ): Promise<{ success: boolean; data?: TableDetails; error?: string }> {
    // Validate identifiers
    const tableValidation = pgValidateIdentifier(tableName);
    const schemaValidation = pgValidateIdentifier(schema);

    if (!tableValidation.valid) {
      return { success: false, error: `Invalid table name: ${tableValidation.error}` };
    }
    if (!schemaValidation.valid) {
      return { success: false, error: `Invalid schema name: ${schemaValidation.error}` };
    }

    const safeTable = tableValidation.sanitized!;
    const safeSchema = schemaValidation.sanitized!;

    // Get all details
    const columns = await driver.getTableSchema(safeTable, safeSchema);
    const indexes = await driver.getIndexes(safeTable, safeSchema);
    const rowCount = await driver.getEstimatedRowCount(safeTable, safeSchema);

    // Extract foreign keys from columns
    const foreignKeys: ForeignKeyInfo[] = columns
      .filter((c) => c.isForeignKey && c.references)
      .map((c) => ({
        column: c.name,
        referencedTable: c.references!.table,
        referencedColumn: c.references!.column,
      }));

    // Extract primary key columns
    const primaryKey = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);

    return {
      success: true,
      data: {
        name: safeTable,
        schema: safeSchema,
        type: 'table',
        columns,
        indexes,
        foreignKeys,
        rowCount,
        primaryKey: primaryKey.length > 0 ? primaryKey : undefined,
      },
    };
  }

  // ============================================
  // SQLite Specific Methods
  // ============================================

  private async getSqliteOverview(
    driver: SqliteDriver
  ): Promise<{ success: boolean; data?: SchemaOverview; error?: string }> {
    const tables = await driver.getTables();
    const version = await driver.getVersion();

    // Get row counts for tables
    for (const table of tables) {
      if (table.type === 'table') {
        table.rowCount = await driver.getRowCount(table.name);
      }
    }

    return {
      success: true,
      data: {
        database: 'SQLite',
        type: 'sqlite',
        version,
        tables: tables.map((t) => ({ ...t, schema: 'main' })),
        totalTables: tables.filter((t) => t.type === 'table').length,
        totalViews: tables.filter((t) => t.type === 'view').length,
      },
    };
  }

  private async getSqliteTableDetails(
    driver: SqliteDriver,
    tableName: string
  ): Promise<{ success: boolean; data?: TableDetails; error?: string }> {
    // Validate table name
    const tableValidation = sqliteValidateIdentifier(tableName);
    if (!tableValidation.valid) {
      return { success: false, error: `Invalid table name: ${tableValidation.error}` };
    }

    const safeTable = tableValidation.sanitized!;

    // Get all details
    const columns = await driver.getTableSchema(safeTable);
    const indexes = await driver.getIndexes(safeTable);
    const rowCount = await driver.getRowCount(safeTable);

    // Extract foreign keys from columns
    const foreignKeys: ForeignKeyInfo[] = columns
      .filter((c) => c.isForeignKey && c.references)
      .map((c) => ({
        column: c.name,
        referencedTable: c.references!.table,
        referencedColumn: c.references!.column,
      }));

    // Extract primary key columns
    const primaryKey = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);

    return {
      success: true,
      data: {
        name: safeTable,
        type: 'table',
        columns,
        indexes,
        foreignKeys,
        rowCount,
        primaryKey: primaryKey.length > 0 ? primaryKey : undefined,
      },
    };
  }
}

// Export singleton instance
export const schemaInspector = new SchemaInspector();

// Export class for testing
export { SchemaInspector };
